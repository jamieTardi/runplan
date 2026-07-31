import type { workouts } from "@/db/schema";
import type { PlanWorkout } from "./types";

type WorkoutRow = typeof workouts.$inferSelect;
type NewWorkoutRow = typeof workouts.$inferInsert;

/**
 * Merge a rebuilt week's template rows with the sessions already done (or
 * flagged missed). Preserved rows are kept WHOLESALE — type, distance, paces,
 * segments, description, actuals, notes and Garmin links — never re-typed to
 * whatever the new layout put on that day: a completed session is history,
 * and rewriting its planned fields both lies about what was prescribed and
 * corrupts anything derived from it (the race estimator judges each run
 * against its workout type). Preserved rows whose date:session slot no longer
 * exists in the new layout are re-inserted rather than silently dropped.
 */
export function mergePreservedRows(
  planId: string,
  weekId: string,
  template: PlanWorkout[],
  preservedByDate: Map<string, WorkoutRow>,
): NewWorkoutRow[] {
  const consumed = new Set<string>();
  const rows: NewWorkoutRow[] = template.map((d) => {
    const key = `${d.dateISO}:${d.session ?? "am"}`;
    const prev = preservedByDate.get(key);
    if (prev) {
      consumed.add(key);
      return preservedRow(planId, weekId, prev);
    }
    return {
      planId,
      weekId,
      date: d.dateISO,
      dow: d.dow,
      session: d.session ?? "am",
      type: d.type,
      distanceKm: d.distanceKm,
      paceLowSPerKm: d.paceLowSPerKm ?? null,
      paceHighSPerKm: d.paceHighSPerKm ?? null,
      segments: d.segments ?? null,
      description: d.description,
      completed: false,
      completedAt: null,
      missed: false,
      actualDistanceKm: null,
      actualDurationS: null,
      notes: null,
      garminActivityId: null,
    };
  });
  for (const [key, prev] of preservedByDate) {
    if (!consumed.has(key)) rows.push(preservedRow(planId, weekId, prev));
  }
  return rows;
}

function preservedRow(planId: string, weekId: string, prev: WorkoutRow): NewWorkoutRow {
  return {
    planId,
    weekId,
    date: String(prev.date).slice(0, 10),
    dow: prev.dow,
    session: prev.session,
    type: prev.type,
    distanceKm: prev.distanceKm,
    paceLowSPerKm: prev.paceLowSPerKm,
    paceHighSPerKm: prev.paceHighSPerKm,
    segments: prev.segments,
    description: prev.description,
    completed: prev.completed,
    completedAt: prev.completedAt,
    missed: prev.missed,
    actualDistanceKm: prev.actualDistanceKm,
    actualDurationS: prev.actualDurationS,
    notes: prev.notes,
    garminActivityId: prev.garminActivityId,
    garminWorkoutId: prev.garminWorkoutId,
  };
}
