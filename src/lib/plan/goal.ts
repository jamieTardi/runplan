import type { RaceType } from "@/db/schema";
import { performanceVdot, raceDistanceM } from "./vdot";
import type { CurrentFitness } from "./types";

/** VDOT implied by a goal time for a race. */
export function goalVdot(
  raceType: RaceType,
  goalTimeS: number,
  customDistanceKm?: number | null,
): number {
  return performanceVdot(raceDistanceM(raceType, customDistanceKm), goalTimeS);
}

/** Goal race pace (sec/km) — definitional: time ÷ distance. */
export function goalPaceSecPerKm(
  raceType: RaceType,
  goalTimeS: number,
  customDistanceKm?: number | null,
): number {
  return goalTimeS / (raceDistanceM(raceType, customDistanceKm) / 1000);
}

/** Estimate current VDOT from either a recent race or a self-reported easy pace. */
export function currentVdot(fitness: CurrentFitness): number {
  if (fitness.mode === "race") {
    return performanceVdot(raceDistanceM(fitness.raceType), fitness.timeS);
  }
  // Estimate: assume habitual easy pace sits at ~64% of VO2max.
  const v = 60000 / fitness.easyPaceSecPerKm; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const est = vo2 / 0.64;
  // Nudge for training volume (aerobic development), capped.
  const volumeBonus = Math.min(2, Math.max(0, (fitness.weeklyKm - 40) / 30));
  return est + volumeBonus;
}

export type FeasibilityVerdict =
  | "comfortable"
  | "realistic"
  | "ambitious"
  | "very_ambitious";

export interface Feasibility {
  currentVdot: number;
  goalVdot: number;
  vdotGap: number;
  verdict: FeasibilityVerdict;
  message: string;
}

/**
 * Compare goal VDOT to current fitness and the time available. A ~1 VDOT gain
 * per ~4–6 weeks of consistent training is realistic; larger asks are flagged.
 */
export function assessFeasibility(
  current: number,
  goal: number,
  totalWeeks: number,
): Feasibility {
  const gap = goal - current;
  const achievableGain = totalWeeks / 5; // ~1 VDOT per 5 weeks
  let verdict: FeasibilityVerdict;
  let message: string;

  if (gap <= 0) {
    verdict = "comfortable";
    message =
      "Your goal is at or below your current fitness — very achievable. Consider a more ambitious target or use this as a controlled build.";
  } else if (gap <= achievableGain * 0.6) {
    verdict = "realistic";
    message = `A ${gap.toFixed(1)}-point VDOT improvement over ${totalWeeks} weeks is a realistic, well-paced target.`;
  } else if (gap <= achievableGain) {
    verdict = "ambitious";
    message = `A ${gap.toFixed(1)}-point VDOT gain in ${totalWeeks} weeks is ambitious but attainable with consistent high-volume training.`;
  } else {
    verdict = "very_ambitious";
    message = `A ${gap.toFixed(1)}-point VDOT gain in ${totalWeeks} weeks is very aggressive. Consider a longer build or a slightly softer goal to reduce injury risk.`;
  }
  return { currentVdot: current, goalVdot: goal, vdotGap: gap, verdict, message };
}
