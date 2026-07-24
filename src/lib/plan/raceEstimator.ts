import type { WorkoutType } from "@/db/schema";
import { RACE_DISTANCES_M, performanceVdot, vdotToRaceTime, vo2FromVelocity } from "./vdot";
import { diffDaysISO } from "./dates";

/**
 * Race-time estimator: turns the runner's completed workouts (with recorded
 * actual distance + duration from Garmin sync or FIT upload) into a predicted
 * finish time for the plan's race.
 *
 * Method: each recorded run implies a VDOT. Races score directly through the
 * Daniels performance curve; training runs are corrected by the fraction of
 * VO2max their workout type is typically run at (avg pace over the whole
 * recorded activity, so quality sessions use dilution-aware fractions that
 * account for warm-up/recovery jogging). Estimates are recency-weighted,
 * aggregated with a weighted median so odd runs (treadmill, parkrun with the
 * dog, GPS drift) can't drag the prediction around, and reported with an
 * interquartile range rather than a single false-precision number.
 */

export interface CompletedRunInput {
  dateISO: string;
  type: WorkoutType;
  /** Actual recorded distance, km. */
  distanceKm: number;
  /** Actual recorded duration, seconds. */
  durationS: number;
}

export type EstimateTrend = "improving" | "steady" | "fading";
export type EstimateConfidence = "low" | "medium" | "high";

export interface RaceEstimate {
  vdot: number;
  /** Central predicted finish time, seconds. */
  timeS: number;
  /** Optimistic end of the range (p75 fitness), seconds. */
  fastTimeS: number;
  /** Cautious end of the range (p25 fitness), seconds. */
  slowTimeS: number;
  paceSPerKm: number;
  runCount: number;
  qualityCount: number;
  /** Date of the oldest run that informed the estimate. */
  sinceISO: string;
  trend: EstimateTrend | null;
  confidence: EstimateConfidence;
}

/** Runs older than this many days are ignored — old fitness is stale news. */
const WINDOW_DAYS = 70;
/** Recency half-life: a 4-week-old run counts half as much as today's. */
const HALF_LIFE_DAYS = 28;
const MIN_RUNS = 3;
const MIN_DISTANCE_KM = 3;
const MIN_DURATION_S = 12 * 60;
/** Sanity band on average pace, s/km — outside this the data is bad. */
const MIN_PACE = 150;
const MAX_PACE = 720;

const QUALITY_TYPES: ReadonlySet<WorkoutType> = new Set([
  "marathon_pace",
  "threshold",
  "vo2",
  "intervals",
  "race",
]);

/**
 * Assumed avg-pace intensity (fraction of VO2max) per workout type. Steady
 * types match the paceZones calibration; quality types are deliberately lower
 * than their rep intensity because the recorded average includes warm-up,
 * cool-down and recovery jogging.
 */
const TYPE_FRACTION: Partial<Record<WorkoutType, number>> = {
  recovery: 0.58,
  easy: 0.65,
  strides: 0.66,
  general_aerobic: 0.7,
  medium_long: 0.72,
  long: 0.72,
  marathon_pace: 0.78,
  threshold: 0.8,
  vo2: 0.78,
  intervals: 0.78,
};

/** How much a run of each type is trusted, before recency weighting. */
const TYPE_WEIGHT: Partial<Record<WorkoutType, number>> = {
  race: 4,
  marathon_pace: 1.2,
  threshold: 1.2,
  vo2: 0.6,
  intervals: 0.6,
  recovery: 0.5,
  strides: 0.8,
};

interface ScoredRun {
  vdot: number;
  weight: number;
  ageDays: number;
  dateISO: string;
  quality: boolean;
}

function impliedVdot(run: CompletedRunInput): number | null {
  const paceSPerKm = run.durationS / run.distanceKm;
  if (paceSPerKm < MIN_PACE || paceSPerKm > MAX_PACE) return null;
  if (run.type === "race") return performanceVdot(run.distanceKm * 1000, run.durationS);
  const fraction = TYPE_FRACTION[run.type];
  if (!fraction) return null;
  const vMetersPerMin = (run.distanceKm * 1000) / (run.durationS / 60);
  const vdot = vo2FromVelocity(vMetersPerMin) / fraction;
  if (vdot < 20 || vdot > 85) return null;
  return vdot;
}

function weightedPercentile(runs: ScoredRun[], p: number): number {
  const sorted = [...runs].sort((a, b) => a.vdot - b.vdot);
  const total = sorted.reduce((s, r) => s + r.weight, 0);
  let acc = 0;
  for (const r of sorted) {
    acc += r.weight;
    if (acc >= total * p) return r.vdot;
  }
  return sorted[sorted.length - 1].vdot;
}

/**
 * Predicted finish time for a VDOT over any distance. Beyond the marathon the
 * Daniels curve is uncalibrated, so ultra times extend the equivalent
 * marathon performance with Riegel's endurance model (same bridge, in
 * reverse, as performanceVdot).
 */
export function predictTimeS(vdot: number, distanceM: number): number {
  if (distanceM <= RACE_DISTANCES_M.marathon) return vdotToRaceTime(vdot, distanceM);
  const marathonS = vdotToRaceTime(vdot, RACE_DISTANCES_M.marathon);
  return marathonS * Math.pow(distanceM / RACE_DISTANCES_M.marathon, 1.06);
}

export function estimateRace(
  runs: CompletedRunInput[],
  raceDistanceM: number,
  todayISO: string,
): RaceEstimate | null {
  if (raceDistanceM <= 0) return null;

  const scored: ScoredRun[] = [];
  for (const run of runs) {
    if (run.distanceKm < MIN_DISTANCE_KM || run.durationS < MIN_DURATION_S) continue;
    const ageDays = diffDaysISO(todayISO, run.dateISO);
    if (ageDays < 0 || ageDays > WINDOW_DAYS) continue;
    const vdot = impliedVdot(run);
    if (vdot == null) continue;
    const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    scored.push({
      vdot,
      weight: (TYPE_WEIGHT[run.type] ?? 1) * recency,
      ageDays,
      dateISO: run.dateISO,
      quality: QUALITY_TYPES.has(run.type),
    });
  }
  if (scored.length < MIN_RUNS) return null;

  const vdot = weightedPercentile(scored, 0.5);
  let p25 = weightedPercentile(scored, 0.25);
  let p75 = weightedPercentile(scored, 0.75);
  // Never present a range tighter than the method can honestly resolve.
  p25 = Math.min(p25, vdot - 0.75);
  p75 = Math.max(p75, vdot + 0.75);

  const timeS = predictTimeS(vdot, raceDistanceM);
  const qualityCount = scored.filter((r) => r.quality).length;

  // Trend: recent 3 weeks vs the older tail, when both have enough runs.
  const recent = scored.filter((r) => r.ageDays <= 21);
  const older = scored.filter((r) => r.ageDays > 21);
  let trend: EstimateTrend | null = null;
  if (recent.length >= 3 && older.length >= 3) {
    const delta = weightedPercentile(recent, 0.5) - weightedPercentile(older, 0.5);
    trend = delta >= 0.8 ? "improving" : delta <= -0.8 ? "fading" : "steady";
  }

  const spread = p75 - p25;
  const confidence: EstimateConfidence =
    scored.length >= 12 && qualityCount >= 3 && spread <= 5
      ? "high"
      : scored.length >= 6 && spread <= 8
        ? "medium"
        : "low";

  return {
    vdot,
    timeS,
    fastTimeS: predictTimeS(p75, raceDistanceM),
    slowTimeS: predictTimeS(p25, raceDistanceM),
    paceSPerKm: timeS / (raceDistanceM / 1000),
    runCount: scored.length,
    qualityCount,
    sinceISO: scored.reduce((min, r) => (r.dateISO < min ? r.dateISO : min), scored[0].dateISO),
    trend,
    confidence,
  };
}
