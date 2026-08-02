import type { CrossActivity, Phase, RaceType, WorkoutType } from "@/db/schema";
import { formatDistance } from "@/lib/units";

export const PHASE_META: Record<Phase, { label: string; short: string; color: string }> = {
  recovery: { label: "Post-race recovery", short: "Recovery", color: "#38bdf8" },
  endurance: { label: "Endurance", short: "Base", color: "#3b82f6" },
  lt: { label: "Lactate threshold", short: "LT", color: "#8b5cf6" },
  race_prep: { label: "Race preparation", short: "Race prep", color: "#f97316" },
  taper: { label: "Taper", short: "Taper", color: "#10b981" },
};

export const WORKOUT_META: Record<
  WorkoutType,
  { label: string; short: string; color: string; blurb: string }
> = {
  rest: {
    label: "Rest",
    short: "Rest",
    color: "#94a3b8",
    blurb:
      "No running today. Rest is where your body absorbs training and gets stronger — take it as seriously as the runs.",
  },
  recovery: {
    label: "Recovery",
    short: "REC",
    color: "#38bdf8",
    blurb:
      "A short, very gentle jog that promotes blood flow after harder days. Keep it genuinely slow — it should feel almost too easy.",
  },
  easy: {
    label: "Easy",
    short: "E",
    color: "#22c55e",
    blurb:
      "Comfortable, conversational running that builds your aerobic base. You should be able to chat in full sentences the whole way.",
  },
  general_aerobic: {
    label: "General aerobic",
    short: "GA",
    color: "#14b8a6",
    blurb:
      "A standard aerobic run, a touch quicker than easy pace but still comfortable. Adds endurance without leaving you tired for the key sessions.",
  },
  medium_long: {
    label: "Medium-long",
    short: "ML",
    color: "#0ea5e9",
    blurb:
      "A longer midweek run at easy effort. Builds endurance on top of the weekly long run without needing a weekend-sized slot.",
  },
  long: {
    label: "Long run",
    short: "LONG",
    color: "#6366f1",
    blurb:
      "The cornerstone of the week: a long, steady run that builds endurance and mental strength. Start relaxed and keep the effort easy unless pace work is prescribed.",
  },
  marathon_pace: {
    label: "Marathon pace",
    short: "MP",
    color: "#8b5cf6",
    blurb:
      "A run with a block at your goal race pace, teaching your body the exact rhythm and effort you will hold on race day.",
  },
  threshold: {
    label: "Threshold",
    short: "THR",
    color: "#f59e0b",
    blurb:
      "Sustained \"comfortably hard\" running — roughly the fastest pace you could hold for an hour. Raises the speed you can sustain before fatigue sets in.",
  },
  vo2: {
    label: "VO₂max intervals",
    short: "VO₂",
    color: "#f43f5e",
    blurb:
      "Short, hard intervals at close to your maximum aerobic effort (about 3–5 km race effort) with jog recoveries. Boosts your engine's top end — tough, but over quickly.",
  },
  intervals: {
    label: "Intervals",
    short: "INT",
    color: "#ef4444",
    blurb:
      "Repeated fast efforts with recovery jogs in between. Improves speed and running economy while the recoveries keep the workload manageable.",
  },
  strides: {
    label: "Strides",
    short: "ST",
    color: "#d946ef",
    blurb:
      "Relaxed accelerations of about 20 seconds: build smoothly to near-top speed with quick, light steps, then walk or jog back. They sharpen form and leg speed without adding fatigue — not all-out sprints.",
  },
  race: {
    label: "Race",
    short: "RACE",
    color: "#f97316",
    blurb:
      "Race day, or a tune-up race used as a hard training stimulus. Start conservatively, settle into goal pace and trust the training.",
  },
  strength: {
    label: "Strength",
    short: "STR",
    color: "#a1a1aa",
    blurb:
      "A short bodyweight strength routine to support your running — stronger hips, glutes and core mean better form and fewer injuries. No gym needed.",
  },
  cross_train: {
    label: "Cross-training",
    short: "XT",
    color: "#84cc16",
    blurb:
      "A like-for-like replacement for a run you can't do — same duration, same effort, none of the impact. Bike, pool or elliptical keeps the aerobic engine ticking over while an injury heals. Go by effort or heart rate, never pace.",
  },
};

/** Display names and the verb used in session wording per cross-training activity. */
export const CROSS_ACTIVITY_META: Record<CrossActivity, { label: string; verb: string }> = {
  bike: { label: "Bike", verb: "riding" },
  elliptical: { label: "Elliptical", verb: "work" },
  swim: { label: "Swim", verb: "swimming" },
  aqua_jog: { label: "Aqua jog", verb: "aqua jogging" },
  row: { label: "Row", verb: "rowing" },
  walk: { label: "Walk", verb: "walking" },
};

/** Card/dialog label for a workout, naming the activity for cross-training days. */
export function workoutLabel(type: WorkoutType, crossActivity?: CrossActivity | null): string {
  if (type === "cross_train" && crossActivity) {
    return `${CROSS_ACTIVITY_META[crossActivity].label} (cross-train)`;
  }
  return WORKOUT_META[type].label;
}

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
