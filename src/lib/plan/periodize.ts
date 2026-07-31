import type { Phase } from "@/db/schema";
import { addDaysISO, diffDaysISO, mondayOfWeekISO } from "./dates";

export const MIN_WEEKS = 8;
export const MAX_WEEKS = 24;

export interface WeekPlan {
  weekIndex: number;
  phase: Phase;
  plannedVolumeKm: number;
  isCutback: boolean;
  startDateISO: string; // Monday of the training week
}

/**
 * Number of training weeks between the start reference and the race, aligned to
 * whole Mon–Sun weeks and clamped to a sensible range. When the calendar allows
 * more than MAX_WEEKS, the plan simply starts later.
 */
export function computeTotalWeeks(todayISO: string, raceDateISO: string): number {
  const firstMonday = mondayOfWeekISO(todayISO);
  const raceMonday = mondayOfWeekISO(raceDateISO);
  const weeks = Math.floor(diffDaysISO(raceMonday, firstMonday) / 7) + 1;
  return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, weeks));
}

/** The Monday of the first training week for a given total length. */
export function firstMondayISO(raceDateISO: string, totalWeeks: number): string {
  const raceMonday = mondayOfWeekISO(raceDateISO);
  return addDaysISO(raceMonday, -(totalWeeks - 1) * 7);
}

/** Assign a training phase to each week (Pfitzinger marathon shape). */
export function assignPhases(totalWeeks: number): Phase[] {
  const taperLen = totalWeeks >= 12 ? 3 : totalWeeks >= 10 ? 2 : 1;
  const build = totalWeeks - taperLen;
  const endurance = Math.max(1, Math.round(build * 0.4));
  const lt = Math.max(1, Math.round(build * 0.3));
  const racePrep = Math.max(1, build - endurance - lt);

  const phases: Phase[] = [];
  for (let i = 0; i < endurance; i++) phases.push("endurance");
  for (let i = 0; i < lt; i++) phases.push("lt");
  for (let i = 0; i < racePrep; i++) phases.push("race_prep");
  for (let i = 0; i < taperLen; i++) phases.push("taper");

  // Correct for rounding drift so we always emit exactly `totalWeeks` phases.
  while (phases.length > totalWeeks) phases.splice(phases.indexOf("lt"), 1);
  while (phases.length < totalWeeks) phases.splice(phases.indexOf("race_prep"), 0, "endurance");
  return phases;
}

/**
 * Weekly volume targets: a 3-build / 1-cutback ramp from start to peak across the
 * build phases, then a descending taper. Peak lands on the last pre-taper week.
 */
export function volumeRamp(
  phases: Phase[],
  startKm: number,
  peakKm: number,
): { plannedVolumeKm: number; isCutback: boolean }[] {
  const taperLen = phases.filter((p) => p === "taper").length;
  const build = phases.length - taperLen;
  const out: { plannedVolumeKm: number; isCutback: boolean }[] = [];

  for (let i = 0; i < build; i++) {
    const t = build > 1 ? i / (build - 1) : 1;
    let vol = startKm + (peakKm - startKm) * t;
    let isCutback = false;
    // Every 4th week is a recovery/cutback week (except the final peak week).
    if (i > 0 && (i + 1) % 4 === 0 && i !== build - 1) {
      vol *= 0.82;
      isCutback = true;
    }
    if (i === build - 1) vol = peakKm; // guarantee a clean peak
    out.push({ plannedVolumeKm: round1(vol), isCutback });
  }

  const taperFractions =
    taperLen >= 3 ? [0.75, 0.58, 0.4] : taperLen === 2 ? [0.65, 0.45] : [0.5];
  for (let i = 0; i < taperLen; i++) {
    out.push({ plannedVolumeKm: round1(peakKm * taperFractions[i]), isCutback: false });
  }
  return out;
}

/** Shortest gap (in whole training weeks) that can bridge two races. */
export const BRIDGE_MIN_WEEKS = 3;

/** First Monday of a continuation plan: the Monday after the previous race. */
export function bridgeStartMondayISO(prevRaceDateISO: string): string {
  return addDaysISO(mondayOfWeekISO(prevRaceDateISO), 7);
}

/** Whole Mon–Sun training weeks between the previous race and the next one. */
export function bridgeTotalWeeks(prevRaceDateISO: string, raceDateISO: string): number {
  const start = bridgeStartMondayISO(prevRaceDateISO);
  return Math.floor(diffDaysISO(mondayOfWeekISO(raceDateISO), start) / 7) + 1;
}

/**
 * Week plans for a plan that continues straight on from a finished race (e.g.
 * a marathon 4–6 weeks after a half). Unlike a fresh build there is no
 * from-scratch ramp: the runner already holds the previous block's fitness, so
 * the shape is post-race recovery week(s) → a short build that returns to the
 * previous peak volume → taper. Gaps long enough for full periodisation fall
 * back to the standard phase shape after recovery. Callers validate the gap
 * (BRIDGE_MIN_WEEKS..MAX_WEEKS); dates are trusted here.
 */
export function buildBridgeWeekPlans(
  prevRaceDateISO: string,
  prevRaceDistanceKm: number,
  raceDateISO: string,
  peakKm: number,
): WeekPlan[] {
  const start = bridgeStartMondayISO(prevRaceDateISO);
  const totalWeeks = bridgeTotalWeeks(prevRaceDateISO, raceDateISO);

  // Post-race recovery: two easy weeks after a marathon or longer, one after
  // shorter races — but always leave at least a build week and the race week.
  const recoveryLen = Math.min(prevRaceDistanceKm >= 42 ? 2 : 1, Math.max(1, totalWeeks - 2));
  const rest = totalWeeks - recoveryLen;

  let phases: Phase[];
  if (rest >= MIN_WEEKS) {
    phases = assignPhases(rest);
  } else {
    const taperLen = rest >= 5 ? 2 : 1;
    const build = rest - taperLen;
    phases = [];
    for (let i = 0; i < build; i++) {
      // Longer bridges earn a threshold week or two before race-specific work.
      phases.push(build >= 3 && i < Math.floor(build / 2) ? "lt" : "race_prep");
    }
    for (let i = 0; i < taperLen; i++) phases.push("taper");
  }

  // Fitness carries over from the finished block, so the post-recovery ramp
  // re-enters high (~80% of the previous peak) instead of building from scratch.
  const ramp = volumeRamp(phases, round1(peakKm * 0.8), peakKm);

  const recFracs = recoveryLen === 2 ? [0.35, 0.55] : [0.45];
  const out: WeekPlan[] = [];
  for (let i = 0; i < recoveryLen; i++) {
    out.push({
      weekIndex: i,
      phase: "recovery",
      plannedVolumeKm: round1(peakKm * recFracs[i]),
      isCutback: true,
      startDateISO: addDaysISO(start, i * 7),
    });
  }
  phases.forEach((phase, i) => {
    out.push({
      weekIndex: recoveryLen + i,
      phase,
      plannedVolumeKm: ramp[i].plannedVolumeKm,
      isCutback: ramp[i].isCutback,
      startDateISO: addDaysISO(start, (recoveryLen + i) * 7),
    });
  });
  return out;
}

export function buildWeekPlans(
  todayISO: string,
  raceDateISO: string,
  startKm: number,
  peakKm: number,
): WeekPlan[] {
  const totalWeeks = computeTotalWeeks(todayISO, raceDateISO);
  const phases = assignPhases(totalWeeks);
  const ramp = volumeRamp(phases, startKm, peakKm);
  const start = firstMondayISO(raceDateISO, totalWeeks);

  return phases.map((phase, i) => ({
    weekIndex: i,
    phase,
    plannedVolumeKm: ramp[i].plannedVolumeKm,
    isCutback: ramp[i].isCutback,
    startDateISO: addDaysISO(start, i * 7),
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
