import "server-only";
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { addDaysISO, todayISO } from "@/lib/plan/dates";
import { sendPlannedWorkoutToGarmin } from "./pushWorkout";

/** Rolling look-ahead: the watch always has about a week of sessions queued. */
const WINDOW_DAYS = 7;

export interface AutoSendResult {
  sent: number;
  failed: number;
}

/**
 * Push the coming week's planned sessions to Garmin Connect as scheduled
 * workouts. Only sessions never sent before (no garmin_workout_id) go out, so
 * repeated runs are cheap no-ops; manual re-sends and edits are handled by
 * sendPlannedWorkoutToGarmin's replace logic elsewhere. Per-workout failures
 * are logged and counted, never thrown — auto-send piggybacks on the sync and
 * must not break it.
 */
export async function autoSendUpcomingWorkouts(userId: string): Promise<AutoSendResult> {
  const today = todayISO();
  const until = addDaysISO(today, WINDOW_DAYS - 1);

  const rows = await db
    .select({ workout: workouts, currentVdot: plans.currentVdot })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(
      and(
        eq(plans.userId, userId),
        eq(plans.status, "active"),
        eq(workouts.completed, false),
        isNull(workouts.garminWorkoutId),
        ne(workouts.type, "rest"),
        ne(workouts.type, "strength"), // gym work never goes to the watch
        gte(workouts.date, today),
        lte(workouts.date, until),
      ),
    )
    .orderBy(workouts.date);

  let sent = 0;
  let failed = 0;
  for (const { workout, currentVdot } of rows) {
    if (workout.distanceKm <= 0) continue;
    try {
      const id = await sendPlannedWorkoutToGarmin(userId, workout, currentVdot);
      if (id) sent++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Auto-send to Garmin failed for workout ${workout.id}:`, msg);
    }
  }
  return { sent, failed };
}
