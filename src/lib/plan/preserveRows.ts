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

/** Types whose distance can flex to absorb a week-volume imbalance. */
const FLEXIBLE_TYPES: ReadonlySet<string> = new Set(["easy", "general_aerobic", "recovery"]);
/** Ignore imbalances smaller than this — rounding noise, not a broken week. */
const MIN_DELTA_KM = 2;
/** Never shrink a flexible run below this. */
const MIN_RUN_KM = 4;

/**
 * Rebalance a PARTIALLY-COMPLETED week after a rebuild. The template lays the
 * week out as if nothing had been run, but preserved history keeps its real
 * distances — so when the old and new layouts disagree about the days already
 * done, the remaining days no longer add up to the week's planned volume
 * (e.g. a Sunday that should absorb 4 km of shortfall stays at the template's
 * size). Nudge future easy/GA/recovery runs, 1 km at a time on the largest
 * first, until the week matches its stored volume target; long runs and
 * quality sessions are never resized, each flexible run moves at most ±50%,
 * and untouched (fully-future) weeks pass through as-is since the template is
 * already self-consistent. Race weeks are exempt: their row sum intentionally
 * exceeds the stored ramp target (it includes the race itself).
 */
export function reconcileWeekVolume(
  rows: NewWorkoutRow[],
  plannedVolumeKm: number,
): NewWorkoutRow[] {
  if (!rows.some((r) => r.completed || r.missed)) return rows;
  if (rows.some((r) => r.type === "race")) return rows;
  const km = (r: NewWorkoutRow) => r.distanceKm ?? 0;
  const total = rows.reduce((a, r) => a + km(r), 0);
  let delta = Math.round(plannedVolumeKm - total);
  if (Math.abs(delta) < MIN_DELTA_KM) return rows;

  const out = rows.map((r) => ({ ...r }));
  const bounds = new Map(
    out.map((r) => [
      r,
      {
        min: Math.max(MIN_RUN_KM, Math.floor(km(r) * 0.5)),
        max: Math.ceil(km(r) * 1.5),
      },
    ]),
  );
  const candidates = (grow: boolean) =>
    out
      .filter(
        (r) =>
          !r.completed &&
          !r.missed &&
          FLEXIBLE_TYPES.has(r.type) &&
          km(r) >= MIN_RUN_KM &&
          (grow ? km(r) < bounds.get(r)!.max : km(r) > bounds.get(r)!.min),
      )
      .sort((a, b) => km(b) - km(a));

  while (delta !== 0) {
    const pool = candidates(delta > 0);
    if (pool.length === 0) break; // best-effort: partial rebalance beats none
    pool[0].distanceKm = km(pool[0]) + (delta > 0 ? 1 : -1);
    delta += delta > 0 ? -1 : 1;
  }
  return out;
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
