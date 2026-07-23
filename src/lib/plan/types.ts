import type { Phase, RaceType, WorkoutType } from "@/db/schema";
import type { PaceZones } from "./vdot";
import type { Feasibility } from "./goal";

/** Current fitness: either a recent race result or a self-estimate. */
export type CurrentFitness =
  | { mode: "race"; raceType: Exclude<RaceType, "custom">; timeS: number }
  | { mode: "estimate"; weeklyKm: number; easyPaceSecPerKm: number };

export interface GenerateInput {
  name?: string;
  raceType: RaceType;
  /** Distance in km — required when raceType is "custom", ignored otherwise. */
  customDistanceKm?: number | null;
  goalTimeS: number;
  raceDateISO: string;
  /** Reference "start" date (defaults to today). Plan begins the Monday of this week. */
  todayISO: string;
  currentFitness: CurrentFitness;
  startVolumeKm: number;
  peakVolumeKm: number;
  daysPerWeek: number; // 3..7
  longRunDow: number; // 1..7 (ISO)
  restDow?: number | null; // preferred rest day (ISO 1..7); null → auto
  includeTuneups: boolean;
  /** Split long easy days into AM + short PM recovery runs (high-volume plans). */
  allowDoubles?: boolean;
}

export interface WorkoutSegment {
  kind: "warmup" | "cooldown" | "steady" | "reps" | "strides";
  label: string;
}

export interface PlanWorkout {
  dow: number; // 1..7
  /** "pm" marks the short second run of a double day; absent/"am" otherwise. */
  session?: "am" | "pm";
  dateISO: string;
  type: WorkoutType;
  distanceKm: number;
  /** Faster pace bound (sec/km). Null for rest/strides. */
  paceLowSPerKm: number | null;
  /** Slower pace bound (sec/km). Equals paceLow for a single target pace. */
  paceHighSPerKm: number | null;
  segments: WorkoutSegment[] | null;
  description: string;
}

export interface PlanWeek {
  weekIndex: number;
  phase: Phase;
  plannedVolumeKm: number;
  isCutback: boolean;
  startDateISO: string;
  workouts: PlanWorkout[];
}

export interface GeneratedPlan {
  name: string;
  raceType: RaceType;
  goalTimeS: number;
  raceDateISO: string;
  totalWeeks: number;
  currentVdot: number;
  goalVdot: number;
  goalPaceSecPerKm: number;
  feasibility: Feasibility;
  zones: { current: PaceZones; goal: PaceZones };
  weeks: PlanWeek[];
  summary: {
    peakVolumeKm: number;
    totalDistanceKm: number;
    startVolumeKm: number;
  };
}
