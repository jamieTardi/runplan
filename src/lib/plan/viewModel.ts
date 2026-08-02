import type { CrossActivity, Phase, RaceType, WorkoutType } from "@/db/schema";
import type { WorkoutSegment } from "./types";

export interface DayVM {
  id: string;
  date: string;
  dow: number;
  session: "am" | "pm";
  type: WorkoutType;
  distanceKm: number;
  paceLowSPerKm: number | null;
  paceHighSPerKm: number | null;
  segments: WorkoutSegment[] | null;
  /** Cross-training replacement: activity + prescribed duration. */
  crossActivity: CrossActivity | null;
  plannedDurationS: number | null;
  /** The original run snapshot exists, so this session can be restored. */
  canRestore: boolean;
  description: string;
  completed: boolean;
  missed: boolean;
  actualDistanceKm: number | null;
  actualDurationS: number | null;
  notes: string | null;
}

export interface WeekVM {
  id: string;
  weekIndex: number;
  phase: Phase;
  plannedVolumeKm: number;
  isCutback: boolean;
  startDate: string;
  workouts: DayVM[];
}

export interface PlanVM {
  id: string;
  name: string;
  raceType: RaceType;
  customDistanceKm: number | null;
  goalTimeS: number;
  raceDate: string;
  startVolumeKm: number;
  peakVolumeKm: number;
  daysPerWeek: number;
  longRunDow: number;
  restDow: number | null;
  allowDoubles: boolean;
  includeStrength: boolean;
  goalVdot: number;
  currentVdot: number;
  status: string;
  locked: boolean;
  autoUpdate: boolean;
  weeks: WeekVM[];
}

/**
 * Distance credited for a completed workout (actual if recorded, else
 * planned). Cross-training never credits distance — bike/pool volume isn't
 * run volume.
 */
export function creditedKm(d: {
  completed: boolean;
  actualDistanceKm: number | null;
  distanceKm: number;
  type?: WorkoutType;
}): number {
  if (!d.completed || d.type === "cross_train") return 0;
  return d.actualDistanceKm ?? d.distanceKm;
}
