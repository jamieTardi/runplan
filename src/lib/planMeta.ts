import type { Phase, RaceType, WorkoutType } from "@/db/schema";
import { formatDistance } from "@/lib/units";

export const PHASE_META: Record<Phase, { label: string; short: string; color: string }> = {
  endurance: { label: "Endurance", short: "Base", color: "#3b82f6" },
  lt: { label: "Lactate threshold", short: "LT", color: "#8b5cf6" },
  race_prep: { label: "Race preparation", short: "Race prep", color: "#f97316" },
  taper: { label: "Taper", short: "Taper", color: "#10b981" },
};

export const WORKOUT_META: Record<
  WorkoutType,
  { label: string; short: string; color: string }
> = {
  rest: { label: "Rest", short: "Rest", color: "#94a3b8" },
  recovery: { label: "Recovery", short: "REC", color: "#38bdf8" },
  easy: { label: "Easy", short: "E", color: "#22c55e" },
  general_aerobic: { label: "General aerobic", short: "GA", color: "#14b8a6" },
  medium_long: { label: "Medium-long", short: "ML", color: "#0ea5e9" },
  long: { label: "Long run", short: "LONG", color: "#6366f1" },
  marathon_pace: { label: "Marathon pace", short: "MP", color: "#8b5cf6" },
  threshold: { label: "Threshold", short: "THR", color: "#f59e0b" },
  vo2: { label: "VO₂max intervals", short: "VO₂", color: "#f43f5e" },
  intervals: { label: "Intervals", short: "INT", color: "#ef4444" },
  strides: { label: "Strides", short: "ST", color: "#d946ef" },
  race: { label: "Race", short: "RACE", color: "#f97316" },
  strength: { label: "Strength", short: "STR", color: "#a1a1aa" },
};

export const RACE_TYPE_LABEL: Record<RaceType, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half marathon",
  marathon: "Marathon",
  "50k": "50K",
  "100k": "100K",
  "100mi": "100 miles",
  custom: "Custom",
};

/** Display label for a race, showing the actual distance for custom races. */
export function raceLabel(
  raceType: RaceType,
  customDistanceKm?: number | null,
  unit: "km" | "mi" = "km",
): string {
  if (raceType === "custom" && customDistanceKm) {
    return formatDistance(customDistanceKm, unit);
  }
  return RACE_TYPE_LABEL[raceType];
}

/** A translucent background derived from a hex colour, for badges/cards. */
export function softBg(color: string, pct = 14): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
