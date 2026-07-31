import type { WorkoutType } from "@/db/schema";
import type { PaceZones } from "./vdot";

export interface PaceRange {
  low: number;
  high: number;
}

/**
 * The pace range a workout of `type` gets when a user edits a session's type
 * in place — mirroring the zones buildWeek assigns at generation time, so an
 * edited day reads (and exports to Garmin) like a generated one. Quality
 * paces should come from the same current→goal interpolated VDOT the
 * generator would use for that week. Returns null for unpaced sessions
 * (rest, strength).
 */
export function paceRangeForType(
  type: WorkoutType,
  easy: PaceZones,
  quality: PaceZones,
  goalPaceSecPerKm: number,
): PaceRange | null {
  switch (type) {
    case "easy":
    case "general_aerobic":
    case "medium_long":
    case "strides":
      return { low: Math.round(easy.easyFast), high: Math.round(easy.easySlow) };
    case "long":
      return {
        low: Math.round(easy.easyFast),
        high: Math.round((easy.easyFast + easy.easySlow) / 2),
      };
    case "recovery":
      return { low: Math.round(easy.easySlow), high: Math.round(easy.recovery) };
    case "threshold":
      return { low: Math.round(quality.threshold), high: Math.round(quality.threshold) };
    case "vo2":
    case "intervals":
      return { low: Math.round(quality.interval), high: Math.round(quality.interval) };
    case "marathon_pace":
      return { low: Math.round(quality.marathon), high: Math.round(quality.marathon) };
    case "race":
      return { low: Math.round(goalPaceSecPerKm), high: Math.round(goalPaceSecPerKm) };
    default:
      return null; // rest, strength
  }
}
