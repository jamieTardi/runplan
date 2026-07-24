import { WORKOUT_META } from "@/lib/planMeta";
import { formatDistance, formatPaceRange, type Unit } from "@/lib/units";
import type { WorkoutType } from "@/db/schema";

// The subset of a workout row the daily notification needs.
export type PushWorkout = {
  type: WorkoutType;
  session: "am" | "pm";
  distanceKm: number;
  description: string;
  paceLowSPerKm: number | null;
  paceHighSPerKm: number | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function summarize(w: PushWorkout, unit: Unit): string {
  const label = WORKOUT_META[w.type].label;
  const dist = w.distanceKm > 0 ? ` ${formatDistance(w.distanceKm, unit)}` : "";
  return `${label}${dist}`;
}

function paceLine(w: PushWorkout, unit: Unit): string | null {
  if (w.paceLowSPerKm == null || w.paceHighSPerKm == null) return null;
  return `Pace ${formatPaceRange(w.paceLowSPerKm, w.paceHighSPerKm, unit)}`;
}

/**
 * Notification content for today's planned session(s). Callers pass only
 * real sessions (no rest days, nothing completed/missed); returns null when
 * there's nothing to announce.
 */
export function dailyWorkoutPayload(workouts: PushWorkout[], unit: Unit): PushPayload | null {
  if (workouts.length === 0) return null;
  const ordered = [...workouts].sort((a, b) => a.session.localeCompare(b.session)); // am before pm

  if (ordered.length === 1) {
    const w = ordered[0];
    const lines = [w.description, paceLine(w, unit)].filter(Boolean) as string[];
    return {
      title: `Today: ${summarize(w, unit)}`,
      body: lines.join("\n"),
      url: "/",
      tag: "runplan-daily",
    };
  }

  // Double day: one line per session, AM first.
  return {
    title: `Today: ${ordered.length} runs`,
    body: ordered.map((w) => `${w.session.toUpperCase()} — ${summarize(w, unit)}`).join("\n"),
    url: "/",
    tag: "runplan-daily",
  };
}
