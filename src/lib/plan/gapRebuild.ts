import type { Phase, WorkoutType } from "@/db/schema";
import type { PaceZones } from "./vdot";
import type { PlanWorkout } from "./types";

/**
 * Return-to-training rules after a missed block of training (injury or life
 * getting in the way). Pure functions — persistence lives in persist.ts.
 *
 * The guiding principles (standard return-to-running guidance):
 *  - Short gaps cost little fitness; long gaps cost a lot and, more importantly,
 *    de-condition tendons/joints — so the resume volume drops with gap length.
 *  - Injuries earn a more cautious restart than life interruptions.
 *  - Week-over-week volume growth after a gap is capped (~10%) until the plan's
 *    original volumes are reached again.
 *  - The first week(s) back contain no quality work — easy running only.
 */

export type GapReason = "injury" | "life";

export interface GapSeverity {
  /** Fraction of the pre-gap weekly volume to resume at. */
  resumeFactor: number;
  /** Number of weeks back with no quality work (easy running only). */
  easyWeeks: number;
  /** Max week-over-week volume growth while rebuilding (e.g. 1.1 = +10%). */
  growthCap: number;
}

export function gapSeverity(gapDays: number, reason: GapReason): GapSeverity {
  const injury = reason === "injury";
  if (gapDays <= 3) {
    return { resumeFactor: 1, easyWeeks: 0, growthCap: 1.2 };
  }
  if (gapDays <= 6) {
    return { resumeFactor: 0.85, easyWeeks: injury ? 1 : 0, growthCap: injury ? 1.1 : 1.15 };
  }
  if (gapDays <= 13) {
    return { resumeFactor: injury ? 0.6 : 0.7, easyWeeks: 1, growthCap: injury ? 1.1 : 1.12 };
  }
  if (gapDays <= 27) {
    return { resumeFactor: injury ? 0.45 : 0.55, easyWeeks: 2, growthCap: 1.1 };
  }
  return { resumeFactor: injury ? 0.35 : 0.4, easyWeeks: injury ? 3 : 2, growthCap: 1.1 };
}

export interface WeekVolumeIn {
  phase: Phase;
  plannedVolumeKm: number;
  isCutback: boolean;
}

/**
 * Recompute the volumes of the weeks after a gap: start from `resumeKm` and
 * grow by at most `growthCap` per week, never exceeding the originally planned
 * volume for that week. Cutback weeks stay cutbacks (82% of the running
 * baseline) and don't raise the baseline. Taper/race weeks are already
 * descending; they take the lower of their original volume and the capped
 * growth path, so a late gap can't spike volume right before the race.
 */
export function rebuildVolumes(
  future: WeekVolumeIn[],
  resumeKm: number,
  growthCap: number,
): number[] {
  const out: number[] = [];
  let baseline = resumeKm;
  let first = true;
  for (const w of future) {
    let vol: number;
    if (w.isCutback) {
      vol = Math.min(w.plannedVolumeKm, round1(baseline * 0.82));
    } else if (first) {
      vol = Math.min(w.plannedVolumeKm, round1(baseline));
      baseline = vol;
    } else {
      vol = Math.min(w.plannedVolumeKm, round1(baseline * growthCap));
      baseline = vol;
    }
    first = false;
    out.push(vol);
  }
  return out;
}

const QUALITY_TYPES: WorkoutType[] = [
  "threshold",
  "vo2",
  "intervals",
  "marathon_pace",
  "strides",
];

/**
 * Convert a rebuilt week to easy-only running for the first week(s) back:
 * quality sessions become easy runs of the same (already reduced) distance,
 * and the long run is trimmed. Race-day itself is never touched.
 */
export function stripQualityForReturn(
  workouts: PlanWorkout[],
  easy: PaceZones,
): PlanWorkout[] {
  return workouts.map((w) => {
    if (w.type === "long" || w.type === "medium_long") {
      const trimmed = Math.max(1, Math.round(w.distanceKm * 0.75));
      return {
        ...w,
        distanceKm: trimmed,
        paceLowSPerKm: Math.round(easy.easyFast),
        paceHighSPerKm: Math.round(easy.easySlow),
        segments: null,
        description: "Reduced long run — rebuilding after your break. Keep it comfortable.",
      };
    }
    if (QUALITY_TYPES.includes(w.type)) {
      return {
        ...w,
        type: "easy" as WorkoutType,
        paceLowSPerKm: Math.round(easy.easyFast),
        paceHighSPerKm: Math.round(easy.easySlow),
        segments: null,
        description: "Easy return run — no hard efforts while you rebuild after your break.",
      };
    }
    return w;
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
