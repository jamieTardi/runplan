// Daniels–Gilbert VDOT model.
//
// Validated anchor: a VDOT of 50 predicts a 5K of ~19:57 (matches Daniels' table);
// a sub-3:00 marathon computes to VDOT ≈ 53.5 with a marathon pace of ~4:16/km.
//
// All paces are canonical seconds-per-kilometre.

import type { RaceType } from "@/db/schema";

export const RACE_DISTANCES_M: Record<RaceType, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
};

/** Oxygen cost (ml/kg/min) of running at velocity v (metres per minute). */
export function vo2FromVelocity(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Inverse of {@link vo2FromVelocity}: velocity (m/min) for a given VO2 demand. */
export function velocityFromVo2(vo2: number): number {
  // 0.000104 v^2 + 0.182258 v - (4.6 + vo2) = 0  → positive root.
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Fraction of VO2max sustainable for a race lasting t minutes. */
export function pctVo2Max(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

/** VDOT for a race performance. */
export function raceToVdot(distanceM: number, timeS: number): number {
  const tMin = timeS / 60;
  const v = distanceM / tMin; // m/min
  return vo2FromVelocity(v) / pctVo2Max(tMin);
}

/** Predicted race time (seconds) for a given VDOT over a distance. Solved numerically. */
export function vdotToRaceTime(vdot: number, distanceM: number): number {
  // raceToVdot is monotonically decreasing in time; bisect on time.
  let lo = 60; // 1 min (absurdly fast) — upper VDOT bound
  let hi = 60 * 60 * 10; // 10 h — lower VDOT bound
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = raceToVdot(distanceM, mid);
    if (v > vdot) lo = mid; // too fast (needs more time)
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Pace (sec/km) for running at a fraction of VO2max for the given VDOT. */
function paceAtPctVo2Max(vdot: number, fraction: number): number {
  const v = velocityFromVo2(vdot * fraction); // m/min
  return 60000 / v; // sec per km
}

export interface PaceZones {
  // All seconds-per-km. For ranges, `fast` < `slow`.
  recovery: number;
  easyFast: number;
  easySlow: number;
  marathon: number;
  threshold: number;
  interval: number;
  rep: number;
}

/**
 * Daniels training paces derived from VDOT. Intensity fractions are calibrated so
 * the zones reproduce Daniels' published tables (e.g. at VDOT 53.5: E ≈ 4:57–5:29,
 * M ≈ 4:16, T ≈ 4:06, I ≈ 3:43 per km).
 */
export function paceZones(vdot: number): PaceZones {
  const easyFast = paceAtPctVo2Max(vdot, 0.68);
  const easySlow = paceAtPctVo2Max(vdot, 0.6);
  const recovery = paceAtPctVo2Max(vdot, 0.56);
  const threshold = paceAtPctVo2Max(vdot, 0.86);
  const interval = paceAtPctVo2Max(vdot, 0.97);
  // Marathon pace from the physiologically-equivalent marathon performance.
  const marathon = vdotToRaceTime(vdot, RACE_DISTANCES_M.marathon) / (RACE_DISTANCES_M.marathon / 1000);
  // Reps run ~5% faster than interval velocity.
  const intervalV = 60000 / interval;
  const rep = 60000 / (intervalV * 1.05);
  return { recovery, easyFast, easySlow, marathon, threshold, interval, rep };
}
