import type { RaceType } from "@/db/schema";
import { raceDistanceM, vdotToRaceTime } from "./vdot";
import type { PlanWeek } from "./types";

/**
 * Beginner-friendly plan setup. Beginners can't answer "what's your easy pace"
 * or "what's your weekly volume" — so the simple builder asks how their running
 * feels right now and derives every number from a conservative tier.
 */

export type BeginnerTierKey = "starting" | "casual" | "regular" | "often";

export interface BeginnerTier {
  key: BeginnerTierKey;
  label: string;
  hint: string;
  weeklyKm: number;
  easyPaceSecPerKm: number;
  defaultDays: number;
}

// Deliberately conservative estimates — a plan that starts too easy builds
// confidence; one that starts too hard builds injuries.
export const BEGINNER_TIERS: BeginnerTier[] = [
  {
    key: "starting",
    label: "Just starting out",
    hint: "I can run a few minutes at a time",
    weeklyKm: 8,
    easyPaceSecPerKm: 465, // ~7:45/km
    defaultDays: 3,
  },
  {
    key: "casual",
    label: "I run now and then",
    hint: "I can keep going for 20–30 minutes",
    weeklyKm: 15,
    easyPaceSecPerKm: 420, // 7:00/km
    defaultDays: 3,
  },
  {
    key: "regular",
    label: "I run once or twice a week",
    hint: "A 5K wouldn't scare me",
    weeklyKm: 22,
    easyPaceSecPerKm: 390, // 6:30/km
    defaultDays: 4,
  },
  {
    key: "often",
    label: "I run three or more times a week",
    hint: "Running is already a habit",
    weeklyKm: 32,
    easyPaceSecPerKm: 350, // ~5:50/km
    defaultDays: 4,
  },
];

// Weekly-volume shape for a first-timer at each distance: enough to finish
// comfortably (floor), without asking for club-runner mileage (cap).
const PEAK_FLOOR_KM: Partial<Record<RaceType, number>> = {
  "5k": 16,
  "10k": 22,
  half: 34,
  marathon: 50,
};
const PEAK_CAP_KM: Partial<Record<RaceType, number>> = {
  "5k": 28,
  "10k": 35,
  half: 48,
  marathon: 60,
};

/** Target peak weekly volume for a beginner plan. */
export function beginnerPeakKm(raceType: RaceType, startKm: number): number {
  const floor = PEAK_FLOOR_KM[raceType] ?? 30;
  const cap = PEAK_CAP_KM[raceType] ?? 50;
  return Math.max(startKm, Math.min(cap, Math.max(floor, startKm + 10)));
}

/**
 * A "just finish comfortably" goal time: the race time the runner's estimated
 * fitness predicts, plus an 8% comfort buffer, rounded up to a friendly number.
 * Always at (or below) current fitness, so the feasibility check reads
 * "comfortable" rather than scaring a first-timer.
 */
export function comfortableGoalTimeS(raceType: RaceType, vdot: number): number {
  const distanceM = raceDistanceM(raceType, null);
  const predicted = vdotToRaceTime(vdot, distanceM) * 1.08;
  const step = distanceM >= 21000 ? 300 : 60; // half/full → 5 min, shorter → 1 min
  return Math.ceil(predicted / step) * step;
}

const WALK_NOTE =
  " Walk breaks are absolutely fine — run easy, walk a minute whenever you need to, and carry on.";
const WALKABLE = new Set(["easy", "general_aerobic", "recovery", "long"]);

/**
 * Beginner reassurance on base-phase aerobic runs. Pace targets stay (that's
 * how you learn them) but the description says walking isn't failing.
 */
export function applyBeginnerNotes(week: PlanWeek, enabled: boolean): PlanWeek {
  if (!enabled || week.phase !== "endurance") return week;
  return {
    ...week,
    workouts: week.workouts.map((w) =>
      WALKABLE.has(w.type) && !w.description.includes("Walk breaks")
        ? { ...w, description: w.description + WALK_NOTE }
        : w,
    ),
  };
}
