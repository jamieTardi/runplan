import { addDaysISO, isoDayOfWeek } from "./dates";
import { raceLabel } from "@/lib/planMeta";
import { formatDuration } from "@/lib/units";
import type { PlanWeek, PlanWorkout, RacePriority, SupportingRace } from "./types";
import { raceDistanceM, vdotToRaceTime, type PaceZones } from "./vdot";

/**
 * Supporting races — the B and C races a season actually contains.
 *
 * A plan is built around one goal race (the A race), which gets the full
 * taper. Real seasons are rarely that tidy: a May marathon with a March half
 * on the way to it, and a club 10K five weeks out. Coaches handle that by
 * priority, and this module applies exactly that to an already-built plan:
 *
 *  - **B race** — matters, but isn't the goal. A short mini-taper before it
 *    (quality work in the window is dropped, runs shorten), the race itself,
 *    then real recovery days after. Costs a little training, protects the
 *    result.
 *  - **C race** — a training race: a hard session that happens to have a
 *    number pinned to it. One easy day before, straight back to work after.
 *
 * It runs *after* the weeks are assembled (including doubles and strength) so
 * a race's window can straddle week boundaries, and it only ever touches days
 * that exist in the plan — a race outside the plan's date range is ignored.
 */

export interface RaceImpact {
  /** Days before the race that are eased off (quality work removed). */
  taperDays: number;
  /** Days after the race kept genuinely easy (or rest). */
  recoveryDays: number;
}

/**
 * Smallest easy add-on worth prescribing after a C race that displaced a long
 * run — below this it's noise, and the week can carry the shortfall.
 */
const MIN_ADD_ON_KM = 3;

/** Distance beyond which a race needs a proper recovery block, not just a day. */
const LONG_RACE_KM = 20;
/** Distance below which a race barely dents the week (parkrun, club 5K). */
const SHORT_RACE_KM = 8;

/**
 * How much of the training block a race costs. Scales with both priority and
 * distance: a B-priority half marathon earns three easy days either side, a
 * C-priority 5K costs one easy day and nothing afterwards.
 */
export function raceImpact(priority: RacePriority, raceKm: number): RaceImpact {
  const tier = raceKm >= LONG_RACE_KM ? 2 : raceKm >= SHORT_RACE_KM ? 1 : 0;
  if (priority === "b") {
    return [
      { taperDays: 2, recoveryDays: 1 },
      { taperDays: 2, recoveryDays: 2 },
      { taperDays: 3, recoveryDays: 3 },
    ][tier];
  }
  return [
    { taperDays: 1, recoveryDays: 1 },
    { taperDays: 1, recoveryDays: 1 },
    { taperDays: 1, recoveryDays: 2 },
  ][tier];
}

/** Index of the training week containing a date, or -1 when it falls outside. */
export function weekIndexForDate(weekStartsISO: string[], dateISO: string): number {
  return weekStartsISO.findIndex(
    (start) => dateISO >= start && dateISO <= addDaysISO(start, 6),
  );
}

/**
 * Week indexes touched by a supporting race — the week it falls in plus any
 * week its mini-taper or recovery days reach into. The generator skips its
 * automatic tune-up races in these weeks: the runner's own race is the tune-up,
 * and nobody wants an invented one two days after a half marathon.
 */
export function raceWeekIndexes(
  weekStartsISO: string[],
  races: SupportingRace[] | undefined,
): Set<number> {
  const out = new Set<number>();
  for (const race of races ?? []) {
    let raceKm = 0;
    try {
      raceKm = raceDistanceM(race.raceType, race.customDistanceKm ?? null) / 1000;
    } catch {
      continue;
    }
    const { taperDays, recoveryDays } = raceImpact(race.priority, raceKm);
    for (let d = -taperDays; d <= recoveryDays; d++) {
      const i = weekIndexForDate(weekStartsISO, addDaysISO(race.dateISO, d));
      if (i >= 0) out.add(i);
    }
  }
  return out;
}

export interface SupportingRacesOptions {
  /** Easy-zone paces (current fitness) for the eased days around a race. */
  easy: PaceZones;
  /** Projected VDOT per week — sizes each race's target time at that point. */
  weekVdots: number[];
  /** The plan's peak weekly volume; scales the shakeout/recovery run sizes. */
  peakVolumeKm: number;
}

/** Target finish time for a race: the runner's own, else predicted fitness. */
export function raceTargetTimeS(
  race: SupportingRace,
  raceKm: number,
  projectedVdot: number,
): number {
  return Math.round(race.goalTimeS ?? vdotToRaceTime(projectedVdot, raceKm * 1000));
}

/**
 * Fold supporting races into built weeks. Returns new weeks; the input is left
 * untouched. Weeks whose days change have their planned volume re-stated to
 * what the week now actually asks for (and are flagged as cutbacks when a race
 * took volume out of them).
 */
export function applySupportingRaces(
  weeks: PlanWeek[],
  races: SupportingRace[] | undefined,
  opts: SupportingRacesOptions,
): PlanWeek[] {
  if (!races?.length || weeks.length === 0) return weeks;

  const out: PlanWeek[] = weeks.map((w) => ({ ...w, workouts: w.workouts.map((d) => ({ ...d })) }));
  const starts = out.map((w) => w.startDateISO);
  const touched = new Set<number>();

  const peak = Math.max(opts.peakVolumeKm, 1);
  const shakeoutKm = clamp(Math.round(peak * 0.06), 3, 5);
  const easyCapKm = clamp(Math.round(peak * 0.07), 4, 7);
  const recoveryCapKm = clamp(Math.round(peak * 0.05), 3, 6);
  const easyFast = Math.round(opts.easy.easyFast);
  const easySlow = Math.round(opts.easy.easySlow);
  const recoveryPace = Math.round(opts.easy.recovery);

  // Earliest first, so a later race's mini-taper wins over an earlier one's
  // recovery days when two races land close together.
  for (const race of [...races].sort((a, b) => a.dateISO.localeCompare(b.dateISO))) {
    const wi = weekIndexForDate(starts, race.dateISO);
    if (wi < 0) continue; // outside the plan — nothing to schedule

    let raceKm: number;
    try {
      raceKm = raceDistanceM(race.raceType, race.customDistanceKm ?? null) / 1000;
    } catch {
      continue; // custom race with no distance — validated away at the edges
    }
    if (!(raceKm > 0)) continue;

    const vdot = opts.weekVdots[wi] ?? opts.weekVdots[opts.weekVdots.length - 1] ?? 40;
    const targetS = raceTargetTimeS(race, raceKm, vdot);
    const pace = Math.round(targetS / raceKm);
    const label = race.name?.trim() || raceLabel(race.raceType, race.customDistanceKm);
    const tag = race.priority.toUpperCase();
    const impact = raceImpact(race.priority, raceKm);

    // --- race day ----------------------------------------------------------
    const week = out[wi];
    // A C race is training, so it shouldn't cost the week its endurance: when
    // one lands on the long (or medium-long) run, the missing kilometres stay
    // as easy running straight after the race. B races are raced and recovered
    // from, so they never carry an add-on.
    const displaced = week.workouts.find(
      (d) => d.dateISO === race.dateISO && (d.session ?? "am") === "am",
    );
    const addOnKm =
      race.priority === "c" && (displaced?.type === "long" || displaced?.type === "medium_long")
        ? Math.round(Math.max(0, displaced.distanceKm - raceKm))
        : 0;

    week.workouts = week.workouts.filter((d) => d.dateISO !== race.dateISO);
    week.workouts.push({
      dow: isoDayOfWeek(race.dateISO),
      session: "am",
      dateISO: race.dateISO,
      type: "race",
      distanceKm: round1(raceKm),
      paceLowSPerKm: pace,
      paceHighSPerKm: pace,
      segments: [{ kind: "steady", label: `${label} — target ${formatDuration(targetS)}` }],
      description:
        race.priority === "b"
          ? `🏁 ${label} — ${tag} race, target ${formatDuration(targetS)}. Race it properly; the easy days either side are part of the plan.`
          : `🏁 ${label} — ${tag} race, target ${formatDuration(targetS)}. A hard training effort on tired legs — no taper, back to work tomorrow.`,
    });
    if (addOnKm >= MIN_ADD_ON_KM) {
      week.workouts.push({
        dow: isoDayOfWeek(race.dateISO),
        session: "pm",
        dateISO: race.dateISO,
        type: "easy",
        distanceKm: addOnKm,
        paceLowSPerKm: easySlow,
        paceHighSPerKm: recoveryPace,
        segments: null,
        description: `Easy ${addOnKm} km straight after the race — keeps the long run in the week`,
      });
    }
    sortWeek(week);
    touched.add(wi);

    // --- mini-taper into the race ------------------------------------------
    for (let d = 1; d <= impact.taperDays; d++) {
      const dateISO = addDaysISO(race.dateISO, -d);
      const wj = ease(out, starts, dateISO, touched);
      if (wj < 0) continue;
      for (const x of out[wj].workouts) {
        if (x.dateISO !== dateISO || x.type === "rest") continue;
        x.type = "easy";
        x.distanceKm = capKm(x.distanceKm, d === 1 ? shakeoutKm : easyCapKm);
        x.paceLowSPerKm = easyFast;
        x.paceHighSPerKm = easySlow;
        x.segments = d === 1 ? [{ kind: "strides", label: "4 × 20s strides" }] : null;
        x.description =
          d === 1
            ? `Shakeout + strides — ${label} tomorrow`
            : `Easy run — ${label} in ${d} days, stay relaxed`;
      }
    }

    // --- recovery out of it -------------------------------------------------
    for (let d = 1; d <= impact.recoveryDays; d++) {
      const dateISO = addDaysISO(race.dateISO, d);
      const wj = ease(out, starts, dateISO, touched);
      if (wj < 0) continue;
      const restDay = d === 1 && raceKm >= LONG_RACE_KM;
      for (const x of out[wj].workouts) {
        if (x.dateISO !== dateISO || x.type === "rest") continue;
        if (restDay) {
          x.type = "rest";
          x.distanceKm = 0;
          x.paceLowSPerKm = null;
          x.paceHighSPerKm = null;
          x.segments = null;
          x.description = `Rest — the day after ${label}`;
          continue;
        }
        x.type = "recovery";
        x.distanceKm = capKm(x.distanceKm, recoveryCapKm);
        x.paceLowSPerKm = easySlow;
        x.paceHighSPerKm = recoveryPace;
        x.segments = null;
        x.description = `Recovery run — gentle legs after ${label}`;
      }
    }
  }

  // A race reshapes the weeks it touches, so their volume target follows the
  // days they now contain instead of the ramp they were drawn from.
  for (const wi of touched) {
    const sum = round1(out[wi].workouts.reduce((a, d) => a + d.distanceKm, 0));
    out[wi] = {
      ...out[wi],
      plannedVolumeKm: sum,
      isCutback: out[wi].isCutback || sum < weeks[wi].plannedVolumeKm,
    };
  }
  return out;
}

/**
 * Prepare a day inside a race window: drop its second run and any strength
 * session (nobody lifts the day before a race), and leave another race alone.
 * Returns the week index holding the day, or -1 when there's nothing to do.
 */
function ease(out: PlanWeek[], starts: string[], dateISO: string, touched: Set<number>): number {
  const wj = weekIndexForDate(starts, dateISO);
  if (wj < 0) return -1;
  if (out[wj].workouts.some((x) => x.dateISO === dateISO && x.type === "race")) return -1;
  out[wj].workouts = out[wj].workouts.filter(
    (x) => !(x.dateISO === dateISO && (x.session === "pm" || x.type === "strength")),
  );
  touched.add(wj);
  return wj;
}

/** Shrink a run to fit a cap, but never grow one (or resurrect a 0 km day). */
function capKm(current: number, cap: number): number {
  return current > 0 ? Math.min(current, cap) : cap;
}

function sortWeek(week: PlanWeek): void {
  week.workouts.sort(
    (a: PlanWorkout, b: PlanWorkout) =>
      a.dow - b.dow ||
      (a.session === b.session ? 0 : (a.session ?? "am") === "am" ? -1 : 1),
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
