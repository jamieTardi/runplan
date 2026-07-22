import type { RaceType } from "@/db/schema";
import { addDaysISO, isoDayOfWeek } from "./dates";
import type { PaceZones } from "./vdot";
import { raceLabel } from "@/lib/planMeta";
import type { PlanWeek, PlanWorkout, WorkoutSegment } from "./types";
import type { WeekPlan } from "./periodize";

// Long-run cap grows with race distance; piecewise-linear between anchors.
// Even for 100 miles the longest single run tops out around 48 km — ultra
// training leans on back-to-back long runs, not ever-longer single sessions.
const LONG_CAP_ANCHORS: [raceKm: number, capKm: number][] = [
  [5, 16],
  [10, 22],
  [21.0975, 26],
  [42.195, 37],
  [100, 45],
  [160.934, 48],
];

export function longCapKm(raceDistanceKm: number): number {
  const a = LONG_CAP_ANCHORS;
  if (raceDistanceKm <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (raceDistanceKm <= a[i][0]) {
      const t = (raceDistanceKm - a[i - 1][0]) / (a[i][0] - a[i - 1][0]);
      return Math.round((a[i - 1][1] + (a[i][1] - a[i - 1][1]) * t) * 10) / 10;
    }
  }
  return a[a.length - 1][1];
}

/** Race distance beyond which the plan trains ultra-style (B2B long runs, no MP work). */
const ULTRA_THRESHOLD_KM = 43;

export interface BuildWeekInput {
  week: WeekPlan;
  totalWeeks: number;
  raceType: RaceType;
  /** Resolved race distance in km (handles custom distances). */
  raceDistanceKm: number;
  goalTimeS: number;
  raceDateISO: string;
  daysPerWeek: number;
  longRunDow: number;
  /** Preferred rest day (ISO 1..7). Null → auto-placed. Ignored at 7 days/week. */
  restDow?: number | null;
  includeTuneups: boolean;
  easy: PaceZones; // current-fitness zones
  quality: PaceZones; // progressing zones (threshold / interval)
  goalPaceSecPerKm: number;
  isRaceWeek: boolean;
  isTuneupWeek: boolean;
}

// Roles keyed by number of days *after* the long run (0 = long-run day).
type Role = "long" | "recovery" | "qualityA" | "medium_long" | "qualityB" | "easy2" | "easy1";
const ROLE_BY_DAYS_AFTER: Role[] = [
  "long", // 0
  "recovery", // 1
  "qualityA", // 2
  "medium_long", // 3
  "qualityB", // 4
  "easy2", // 5
  "easy1", // 6 (day before long run)
];
// Least-important roles are dropped to rest first as days/week decreases.
const DROP_ORDER: Role[] = ["easy2", "recovery", "easy1", "qualityB", "medium_long"];

const IMPORTANT_ROLES: Role[] = ["long", "qualityA", "medium_long"];

/**
 * Pick the week's rest days. The preferred day is always rested first (when the
 * schedule allows any rest); remaining rest days fall on the least-important slots.
 * If a preferred rest day lands on a key session, that session is relocated to a
 * free easy day so nothing important is lost.
 */
function chooseRestDays(
  roleFor: Map<number, Role>,
  longRunDow: number,
  daysPerWeek: number,
  restDow: number | null,
): Set<number> {
  const restCount = Math.max(0, 7 - daysPerWeek);
  const rest = new Set<number>();
  if (restCount === 0) return rest;

  const roleToDow = new Map<Role, number>();
  for (const [dow, role] of roleFor) roleToDow.set(role, dow);

  if (restDow && restDow >= 1 && restDow <= 7 && restDow !== longRunDow) rest.add(restDow);
  for (const role of DROP_ORDER) {
    if (rest.size >= restCount) break;
    const dow = roleToDow.get(role);
    if (dow && dow !== longRunDow && !rest.has(dow)) rest.add(dow);
  }
  for (let dow = 1; dow <= 7 && rest.size < restCount; dow++) {
    if (dow !== longRunDow && !rest.has(dow)) rest.add(dow);
  }

  // Relocate any key session that would fall on a rest day.
  for (const dow of rest) {
    const role = roleFor.get(dow)!;
    if (!IMPORTANT_ROLES.includes(role)) continue;
    const swap = [1, 2, 3, 4, 5, 6, 7].find(
      (d) => !rest.has(d) && d !== longRunDow && !IMPORTANT_ROLES.includes(roleFor.get(d)!),
    );
    if (swap) {
      roleFor.set(swap, role);
      roleFor.set(dow, "recovery");
    }
  }
  return rest;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
// Training distances are prescribed in whole km; only the race itself keeps
// its exact distance (e.g. half marathon 21.1 km).
function roundKm(n: number) {
  return Math.round(n);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function buildWeek(input: BuildWeekInput): PlanWeek {
  const { week, raceDistanceKm, daysPerWeek, longRunDow, easy, quality } = input;
  const planned = week.plannedVolumeKm;
  const isUltra = raceDistanceKm >= ULTRA_THRESHOLD_KM;

  if (input.isRaceWeek) return buildRaceWeek(input);

  // 1. Assign a role to every weekday (1..7).
  const roleFor = new Map<number, Role>();
  for (let dow = 1; dow <= 7; dow++) {
    const daysAfter = (dow - longRunDow + 7) % 7;
    roleFor.set(dow, ROLE_BY_DAYS_AFTER[daysAfter]);
  }

  // 2. Choose rest days, honouring the runner's preferred rest day when set.
  const restDays = chooseRestDays(roleFor, longRunDow, daysPerWeek, input.restDow ?? null);

  // 3. Fixed sessions (distance-defining).
  const longFrac =
    week.phase === "endurance" ? 0.28 : week.phase === "race_prep" ? 0.32 : 0.3;
  const longKm = roundKm(Math.min(planned * longFrac, longCapKm(raceDistanceKm)));
  const mlKm = roundKm(Math.min(planned * 0.18, longKm * 0.85, 23));
  const qaKm = clamp(roundKm(planned * 0.13), 5, 18);
  // Ultra plans stack a second long run the day before the long run (back-to-back).
  const b2bKm = isUltra ? roundKm(Math.min(longKm * 0.6, planned * 0.2)) : 0;

  const workouts: Record<number, Omit<PlanWorkout, "dow" | "dateISO">> = {};

  // 4. Build each active day.
  const flexDays: { dow: number; weight: number; role: Role }[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    if (restDays.has(dow)) {
      workouts[dow] = rest();
      continue;
    }
    const role = roleFor.get(dow)!;
    switch (role) {
      case "long":
        workouts[dow] = longRun(input, longKm);
        break;
      case "medium_long":
        workouts[dow] = mediumLong(easy, mlKm);
        break;
      case "qualityA":
        workouts[dow] = qualityA(input, qaKm);
        break;
      case "qualityB":
        // Second quality slot is a general-aerobic + strides day (adds volume).
        flexDays.push({ dow, weight: 1, role });
        break;
      case "recovery":
        flexDays.push({ dow, weight: 0.7, role });
        break;
      case "easy1":
        // Ultras: the day before the long run is a second long run (back-to-back).
        if (isUltra && b2bKm > 0) {
          workouts[dow] = backToBack(easy, b2bKm);
        } else {
          flexDays.push({ dow, weight: 1, role });
        }
        break;
      default: // easy2
        flexDays.push({ dow, weight: 1, role });
    }
  }

  // 5. Distribute the remaining volume across the flexible (easy) days.
  const fixed = longKm + sumFixed(workouts);
  const targetFlex = Math.max(0, planned - fixed);
  const sumW = flexDays.reduce((a, d) => a + d.weight, 0) || 1;
  for (const d of flexDays) {
    const km = roundKm((targetFlex * d.weight) / sumW);
    workouts[d.dow] =
      d.role === "recovery"
        ? recovery(easy, km)
        : d.role === "qualityB"
          ? gaStrides(easy, quality, km)
          : easyRun(easy, km);
  }

  return finalize(week, workouts);
}

// ---------------------------------------------------------------------------
// Session builders
// ---------------------------------------------------------------------------

function rest(): Omit<PlanWorkout, "dow" | "dateISO"> {
  return {
    type: "rest",
    distanceKm: 0,
    paceLowSPerKm: null,
    paceHighSPerKm: null,
    segments: null,
    description: "Rest",
  };
}

function easyRun(z: PaceZones, km: number) {
  return {
    type: "easy" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(z.easyFast),
    paceHighSPerKm: Math.round(z.easySlow),
    segments: null,
    description: "Easy run",
  };
}

function recovery(z: PaceZones, km: number) {
  return {
    type: "recovery" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(z.easySlow),
    paceHighSPerKm: Math.round(z.recovery),
    segments: null,
    description: "Recovery run",
  };
}

function backToBack(z: PaceZones, km: number) {
  return {
    type: "medium_long" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(z.easyFast),
    paceHighSPerKm: Math.round(z.easySlow),
    segments: null,
    description: "Back-to-back long run (run on tired legs)",
  };
}

function mediumLong(z: PaceZones, km: number) {
  return {
    type: "medium_long" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(z.easyFast),
    paceHighSPerKm: Math.round(z.easySlow),
    segments: null,
    description: "Medium-long run",
  };
}

function gaStrides(z: PaceZones, q: PaceZones, km: number) {
  return {
    type: "general_aerobic" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(z.easyFast),
    paceHighSPerKm: Math.round((z.easyFast + z.easySlow) / 2),
    segments: [{ kind: "strides" as const, label: "6 × 20s strides @ rep effort" }],
    description: "General aerobic + strides",
  };
}

function longRun(input: BuildWeekInput, km: number) {
  const { week, easy, goalPaceSecPerKm } = input;
  const segments: WorkoutSegment[] = [];
  let description = "Long run";
  // Integrate marathon-pace work during race-prep and taper.
  if ((week.phase === "race_prep" || week.phase === "taper") && input.raceType === "marathon") {
    const mpKm = Math.min(roundKm(km * 0.45), 16);
    segments.push({ kind: "steady", label: `final ${mpKm} km @ marathon pace` });
    description = `Long run with ${mpKm} km @ marathon pace`;
    return {
      type: "long" as const,
      distanceKm: km,
      paceLowSPerKm: Math.round(goalPaceSecPerKm),
      paceHighSPerKm: Math.round(easy.easySlow),
      segments,
      description,
    };
  }
  return {
    type: "long" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(easy.easyFast),
    paceHighSPerKm: Math.round(easy.easySlow),
    segments: null,
    description,
  };
}

function qualityA(input: BuildWeekInput, km: number) {
  const { week, quality, goalPaceSecPerKm } = input;

  if (input.isTuneupWeek) {
    // A tune-up race replaces the week's hard session.
    const dist = input.raceDistanceKm >= 42 ? 15 : 10;
    return {
      type: "race" as const,
      distanceKm: dist,
      paceLowSPerKm: Math.round(quality.threshold),
      paceHighSPerKm: Math.round(quality.marathon),
      segments: [{ kind: "steady" as const, label: `Tune-up race (~${dist} km) at hard effort` }],
      description: `Tune-up race (~${dist} km)`,
    };
  }

  if (week.phase === "endurance") {
    return tempo(km, quality, 20, "Lactate-threshold intro: 20 min @ threshold");
  }
  if (week.phase === "lt") {
    // Alternate broken vs continuous threshold for variety.
    return week.weekIndex % 2 === 0
      ? tempo(km, quality, 40, "2 × 15 min @ threshold w/ 3 min jog", [
          { kind: "reps", label: "2 × 15 min @ threshold, 3 min jog recovery" },
        ])
      : tempo(km, quality, 40, "40 min continuous @ threshold");
  }
  if (week.phase === "race_prep") {
    const reps = week.weekIndex % 2 === 0 ? "5 × 1000m" : "6 × 800m";
    return {
      type: "vo2" as const,
      distanceKm: km,
      paceLowSPerKm: Math.round(quality.interval),
      paceHighSPerKm: Math.round(quality.interval),
      segments: [
        { kind: "warmup" as const, label: "warm-up 3 km easy" },
        { kind: "reps" as const, label: `${reps} @ interval pace, 2:30 jog recovery` },
        { kind: "cooldown" as const, label: "cool-down 2 km easy" },
      ],
      description: `VO₂max intervals: ${reps} @ interval pace`,
    };
  }
  // taper: short sharpener at marathon/threshold effort
  return {
    type: "marathon_pace" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(goalPaceSecPerKm),
    paceHighSPerKm: Math.round(goalPaceSecPerKm),
    segments: [{ kind: "steady" as const, label: "3 × 1600m @ marathon pace, 90s jog" }],
    description: "Sharpener: 3 × 1600m @ marathon pace",
  };
}

function tempo(
  km: number,
  q: PaceZones,
  _minutes: number,
  description: string,
  extra?: WorkoutSegment[],
) {
  return {
    type: "threshold" as const,
    distanceKm: km,
    paceLowSPerKm: Math.round(q.threshold),
    paceHighSPerKm: Math.round(q.threshold),
    segments: extra ?? [
      { kind: "warmup" as const, label: "warm-up 3 km easy" },
      { kind: "steady" as const, label: description.replace(/^.*?:\s*/, "") },
      { kind: "cooldown" as const, label: "cool-down 2 km easy" },
    ],
    description,
  };
}

// ---------------------------------------------------------------------------
// Race week
// ---------------------------------------------------------------------------

function buildRaceWeek(input: BuildWeekInput): PlanWeek {
  const { week, raceType, raceDistanceKm, goalTimeS, goalPaceSecPerKm, raceDateISO, easy } = input;
  const raceDow = isoDayOfWeek(raceDateISO);
  const workouts: Record<number, Omit<PlanWorkout, "dow" | "dateISO">> = {};

  for (let dow = 1; dow <= 7; dow++) {
    if (dow === raceDow) {
      workouts[dow] = {
        type: "race",
        distanceKm: round1(raceDistanceKm),
        paceLowSPerKm: Math.round(goalPaceSecPerKm),
        paceHighSPerKm: Math.round(goalPaceSecPerKm),
        segments: [
          {
            kind: "steady",
            label: `Goal race — ${raceLabel(raceType, raceDistanceKm)} at goal pace`,
          },
        ],
        description: `🏁 RACE DAY — goal ${formatGoal(goalTimeS)}`,
      };
      continue;
    }
    const daysToRace = (raceDow - dow + 7) % 7;
    if (daysToRace === 1) {
      workouts[dow] = {
        type: "easy",
        distanceKm: 5,
        paceLowSPerKm: Math.round(easy.easyFast),
        paceHighSPerKm: Math.round(easy.easySlow),
        segments: [{ kind: "strides", label: "4 × 20s strides" }],
        description: "Shakeout + strides",
      };
    } else if (daysToRace === 2 || daysToRace === 6) {
      workouts[dow] = rest();
    } else {
      workouts[dow] = {
        type: "easy",
        distanceKm: 7,
        paceLowSPerKm: Math.round(easy.easyFast),
        paceHighSPerKm: Math.round(easy.easySlow),
        segments: daysToRace === 3 ? [{ kind: "strides", label: "3 × 20s strides" }] : null,
        description: daysToRace === 3 ? "Easy + strides" : "Easy run",
      };
    }
  }
  return finalize(week, workouts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumFixed(workouts: Record<number, Omit<PlanWorkout, "dow" | "dateISO">>): number {
  // Sum of distance-defining sessions already placed (medium-long + qualityA).
  let s = 0;
  for (const w of Object.values(workouts)) {
    if (w.type === "medium_long" || w.type === "threshold" || w.type === "vo2" || w.type === "marathon_pace" || (w.type === "race")) {
      s += w.distanceKm;
    }
  }
  return s;
}

function finalize(
  week: WeekPlan,
  workouts: Record<number, Omit<PlanWorkout, "dow" | "dateISO">>,
): PlanWeek {
  const list: PlanWorkout[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    const w = workouts[dow] ?? rest();
    list.push({ ...w, dow, dateISO: addDaysISO(week.startDateISO, dow - 1) });
  }
  return {
    weekIndex: week.weekIndex,
    phase: week.phase,
    plannedVolumeKm: week.plannedVolumeKm,
    isCutback: week.isCutback,
    startDateISO: week.startDateISO,
    workouts: list,
  };
}

function formatGoal(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
