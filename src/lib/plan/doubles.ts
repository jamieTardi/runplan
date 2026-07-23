import type { PaceZones } from "./vdot";
import type { PlanWeek, PlanWorkout } from "./types";

/**
 * Double-run days for high-volume weeks. Standard practice once weekly volume
 * makes single runs impractically long (Pfitzinger introduces doubles around
 * 88–113 km/week): split a long *easy* day into a main AM run plus a short,
 * genuinely easy PM shakeout. The second run adds frequency and time on feet
 * at much lower mechanical strain than one oversized single.
 *
 * Rules (deliberately conservative):
 *  - Opt-in per plan, and only when the week's average single would exceed
 *    AVG_SINGLE_THRESHOLD_KM.
 *  - Only easy / general-aerobic days of at least MIN_SPLIT_KM are split —
 *    never the long run, medium-long run, quality sessions, recovery days,
 *    or the day before the long run (that day stays short on purpose).
 *  - At most MAX_DOUBLES_PER_WEEK doubles; cutback, taper and race weeks get
 *    none (recovery weeks drop doubles first).
 *  - The day's total distance is unchanged — the PM run is split out of the
 *    AM run, so the weekly volume ramp is untouched.
 */

export const MAX_DOUBLES_PER_WEEK = 2;
export const AVG_SINGLE_THRESHOLD_KM = 14;
export const MIN_SPLIT_KM = 13;
const PM_MIN_KM = 4;
const PM_MAX_KM = 8;

const SPLITTABLE = new Set<PlanWorkout["type"]>(["easy", "general_aerobic"]);

export function pmShakeoutKm(dayKm: number): number {
  return Math.min(PM_MAX_KM, Math.max(PM_MIN_KM, Math.round(dayKm * 0.3)));
}

export interface DoublesOptions {
  enabled: boolean;
  isRaceWeek: boolean;
  longRunDow: number; // ISO 1..7
  easy: PaceZones;
}

/** The ISO day-of-week immediately before `dow` (wrapping Monday → Sunday). */
function dayBefore(dow: number): number {
  return dow === 1 ? 7 : dow - 1;
}

export function applyDoubles(week: PlanWeek, opts: DoublesOptions): PlanWeek {
  if (!opts.enabled || opts.isRaceWeek || week.isCutback || week.phase === "taper") {
    return week;
  }
  const runs = week.workouts.filter((w) => w.type !== "rest" && w.distanceKm > 0);
  if (runs.length === 0) return week;
  if (week.plannedVolumeKm / runs.length <= AVG_SINGLE_THRESHOLD_KM) return week;

  const skipDow = dayBefore(opts.longRunDow);
  const candidates = week.workouts
    .filter(
      (w) =>
        SPLITTABLE.has(w.type) &&
        w.distanceKm >= MIN_SPLIT_KM &&
        w.dow !== opts.longRunDow &&
        w.dow !== skipDow &&
        w.session !== "pm",
    )
    .sort((a, b) => b.distanceKm - a.distanceKm)
    .slice(0, MAX_DOUBLES_PER_WEEK);
  if (candidates.length === 0) return week;

  const splitDows = new Set(candidates.map((c) => c.dow));
  const recoveryPace = Math.round(opts.easy.recovery);

  const workouts: PlanWorkout[] = [];
  for (const w of week.workouts) {
    if (!splitDows.has(w.dow) || w.session === "pm") {
      workouts.push(w);
      continue;
    }
    const pm = pmShakeoutKm(w.distanceKm);
    workouts.push(
      { ...w, session: "am", distanceKm: w.distanceKm - pm },
      {
        dow: w.dow,
        session: "pm",
        dateISO: w.dateISO,
        type: "recovery",
        distanceKm: pm,
        paceLowSPerKm: recoveryPace,
        paceHighSPerKm: recoveryPace,
        segments: null,
        description: "PM shakeout — a very easy second run on tired legs. Conversational pace.",
      },
    );
  }
  return { ...week, workouts };
}
