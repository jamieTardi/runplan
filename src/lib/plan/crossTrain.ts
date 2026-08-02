import type { CrossActivity, WorkoutType } from "@/db/schema";
import type { WorkoutSegment } from "./types";
import { CROSS_ACTIVITY_META } from "@/lib/planMeta";

/**
 * Like-for-like cross-training conversion: turn a planned run into an
 * equivalent low-impact session (bike, pool, elliptical…) for a runner who
 * can't run but can still train. The guiding rule is duration + effort, not
 * distance + pace: the replacement lasts as long as the run would have and
 * mirrors its intensity structure (a threshold run becomes threshold-effort
 * blocks, VO₂ intervals become hard/easy repeats), because paces don't
 * transfer between sports but time at an effort does.
 */

/** The planned fields a conversion reads — and snapshots for later restore. */
export interface CrossSource {
  type: WorkoutType;
  distanceKm: number;
  paceLowSPerKm: number | null;
  paceHighSPerKm: number | null;
  segments: unknown;
  description: string;
}

/** Everything a workout row needs updating with to become a cross session. */
export interface CrossConversion {
  type: "cross_train";
  crossActivity: CrossActivity;
  plannedDurationS: number;
  distanceKm: 0;
  paceLowSPerKm: null;
  paceHighSPerKm: null;
  segments: WorkoutSegment[];
  description: string;
  replacedFrom: CrossSource;
}

/** Run types that have a sensible cross-training equivalent. */
export const CROSS_CONVERTIBLE: ReadonlySet<WorkoutType> = new Set([
  "recovery",
  "easy",
  "general_aerobic",
  "medium_long",
  "long",
  "marathon_pace",
  "threshold",
  "vo2",
  "intervals",
  "strides",
]);

export function isCrossConvertible(type: WorkoutType): boolean {
  return CROSS_CONVERTIBLE.has(type);
}

/** Fallback pace when a run has no pace range to estimate duration from. */
const FALLBACK_PACE_S_PER_KM = 360;
const MIN_DURATION_MIN = 20;
const MAX_DURATION_MIN = 180;

/**
 * How long the run would have taken: distance × midpoint pace, rounded to
 * 5 minutes and clamped to a sane session length. This is the duration the
 * replacement inherits (1:1 — same time on legs, none of the impact).
 */
export function estimatedRunDurationMin(w: CrossSource): number {
  const pace =
    w.paceLowSPerKm != null && w.paceHighSPerKm != null
      ? (w.paceLowSPerKm + w.paceHighSPerKm) / 2
      : (w.paceLowSPerKm ?? w.paceHighSPerKm ?? FALLBACK_PACE_S_PER_KM);
  const min = Math.round((w.distanceKm * pace) / 60 / 5) * 5;
  return Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, min));
}

const seg = (kind: WorkoutSegment["kind"], label: string): WorkoutSegment => ({ kind, label });

/**
 * Build the effort structure mirroring the run type. All efforts are
 * described by feel/heart-rate zone — never pace. Quality sessions carry a
 * fixed warm-up/cool-down, so for short runs the structure can come out
 * longer than the run would have been — `totalMin` in the result is always
 * the real sum of the parts, and that's what gets prescribed.
 */
function buildStructure(
  type: WorkoutType,
  totalMin: number,
  verb: string,
): { segments: WorkoutSegment[]; effortLine: string; totalMin: number } {
  // Steady aerobic sessions: one continuous effort, no warm-up ceremony.
  switch (type) {
    case "recovery":
      return {
        segments: [seg("steady", `${totalMin} min very easy ${verb} (Zone 1)`)],
        effortLine: "Keep it genuinely gentle — this replaces a recovery jog, so it should feel almost lazy.",
        totalMin,
      };
    case "easy":
    case "general_aerobic":
    case "medium_long":
    case "long":
      return {
        segments: [seg("steady", `${totalMin} min steady ${verb} at conversational effort (Zone 2)`)],
        effortLine:
          "Hold a conversational, all-day effort — you should be able to speak in full sentences throughout.",
        totalMin,
      };
    case "strides":
      return {
        segments: [
          seg("steady", `${totalMin} min easy ${verb} (Zone 2)`),
          seg("strides", "6 × 30 s fast pick-ups (high cadence, controlled) spread through the session"),
        ],
        effortLine: "The pick-ups are quick and light, not all-out — spin fast, stay smooth.",
        totalMin,
      };
  }

  // Quality sessions: warm-up, a main set scaled to the time available, cool-down.
  const warmMin = 15;
  const coolMin = 10;
  const mainMin = Math.max(12, totalMin - warmMin - coolMin);
  const warmup = seg("warmup", `${warmMin} min easy ${verb} to warm up`);
  const cooldown = seg("cooldown", `${coolMin} min easy ${verb} to cool down`);

  switch (type) {
    case "threshold": {
      // Comfortably-hard blocks totalling the time available, capped like a run tempo.
      const blockTotal = Math.min(40, mainMin);
      const half = Math.round(blockTotal / 2);
      const split = blockTotal > 20;
      const main = split
        ? [seg("reps", `2 × ${half} min at threshold effort (comfortably hard, Zone 4) / 5 min easy between`)]
        : [seg("reps", `${blockTotal} min at threshold effort (comfortably hard, Zone 4)`)];
      return {
        segments: [warmup, ...main, cooldown],
        effortLine:
          "Threshold is the effort you could hold for about an hour when fresh — controlled discomfort, steady breathing.",
        totalMin: warmMin + (split ? half * 2 + 5 : blockTotal) + coolMin,
      };
    }
    case "vo2": {
      const reps = Math.min(8, Math.max(4, Math.round(mainMin / 6)));
      return {
        segments: [warmup, seg("reps", `${reps} × 3 min hard (Zone 5) / 3 min easy ${verb}`), cooldown],
        effortLine: "Hard means close to maximal aerobic effort — breathing deep by the end of each rep.",
        totalMin: warmMin + reps * 6 + coolMin,
      };
    }
    case "intervals": {
      const reps = Math.min(10, Math.max(6, Math.round(mainMin / 4)));
      return {
        segments: [warmup, seg("reps", `${reps} × 2 min fast (Zone 4–5) / 2 min easy ${verb}`), cooldown],
        effortLine: "Fast but repeatable — the last rep should feel like the first.",
        totalMin: warmMin + reps * 4 + coolMin,
      };
    }
    case "marathon_pace": {
      const block = Math.min(60, mainMin);
      return {
        segments: [warmup, seg("reps", `${block} min at steady race effort (strong but sustainable, Zone 3)`), cooldown],
        effortLine: "Race effort by feel: strong and purposeful, the intensity you could hold for hours.",
        totalMin: warmMin + block + coolMin,
      };
    }
    default:
      return {
        segments: [seg("steady", `${totalMin} min steady ${verb} at conversational effort (Zone 2)`)],
        effortLine: "Hold a comfortable aerobic effort throughout.",
        totalMin,
      };
  }
}

/**
 * Convert a planned run into its like-for-like cross-training session.
 * Callers must check `isCrossConvertible(w.type)` first.
 */
export function toCrossTraining(w: CrossSource, activity: CrossActivity, typeLabel: string): CrossConversion {
  const meta = CROSS_ACTIVITY_META[activity];
  const { segments, effortLine, totalMin } = buildStructure(
    w.type,
    estimatedRunDurationMin(w),
    meta.verb,
  );
  return {
    type: "cross_train",
    crossActivity: activity,
    plannedDurationS: totalMin * 60,
    distanceKm: 0,
    paceLowSPerKm: null,
    paceHighSPerKm: null,
    segments,
    description: `${meta.label} ${totalMin} min — like-for-like swap for the planned ${typeLabel}. Go by effort or heart rate, not speed. ${effortLine}`,
    replacedFrom: {
      type: w.type,
      distanceKm: w.distanceKm,
      paceLowSPerKm: w.paceLowSPerKm,
      paceHighSPerKm: w.paceHighSPerKm,
      segments: w.segments,
      description: w.description,
    },
  };
}

/**
 * The planned fields that put a replaced session back to its original run.
 * Returns null when the snapshot is missing or malformed.
 */
export function restoredFields(replacedFrom: unknown): (CrossSource & {
  crossActivity: null;
  plannedDurationS: null;
  replacedFrom: null;
}) | null {
  if (!replacedFrom || typeof replacedFrom !== "object") return null;
  const r = replacedFrom as Partial<CrossSource>;
  if (typeof r.type !== "string" || typeof r.distanceKm !== "number") return null;
  return {
    type: r.type as WorkoutType,
    distanceKm: r.distanceKm,
    paceLowSPerKm: typeof r.paceLowSPerKm === "number" ? r.paceLowSPerKm : null,
    paceHighSPerKm: typeof r.paceHighSPerKm === "number" ? r.paceHighSPerKm : null,
    segments: r.segments ?? null,
    description: typeof r.description === "string" ? r.description : "",
    crossActivity: null,
    plannedDurationS: null,
    replacedFrom: null,
  };
}
