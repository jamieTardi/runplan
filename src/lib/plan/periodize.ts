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
