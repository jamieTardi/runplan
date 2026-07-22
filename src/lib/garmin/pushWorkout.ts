import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workouts } from "@/db/schema";
import { GarminError, clientFromTokens } from "./client";
import { getGarminAccount, saveGarminTokens } from "./store";
import { toGarminWorkout } from "./workoutDto";
import { buildWorkoutSteps, type FitPlanItem } from "@/lib/fit/steps";
import { paceZones } from "@/lib/plan/vdot";
import { WORKOUT_META } from "@/lib/planMeta";

const GC_API = "https://connectapi.garmin.com";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Create a structured workout in Garmin Connect and schedule it on the
 * session's date — from there Garmin syncs it to the watch automatically.
 * `replaceWorkoutId` (from a previous send) is deleted first so re-sending
 * updates instead of piling up duplicates.
 */
export async function pushWorkoutToGarmin(opts: {
  userId: string;
  name: string;
  items: FitPlanItem[];
  dateISO: string;
  replaceWorkoutId?: number | null;
}): Promise<{ garminWorkoutId: number }> {
  const account = await getGarminAccount(opts.userId);
  if (!account) {
    throw new GarminError("Garmin is not connected — connect your account in Settings first.");
  }
  const client = clientFromTokens(account.tokens as Parameters<typeof clientFromTokens>[0]);

  if (opts.replaceWorkoutId) {
    // Deleting the workout also removes its calendar schedule. A 404 just
    // means it was already deleted in Garmin Connect — fine either way.
    await client.client
      .delete(`${GC_API}/workout-service/workout/${opts.replaceWorkoutId}`)
      .catch(() => undefined);
  }

  const payload = toGarminWorkout(opts.name, opts.items);
  let created: { workoutId?: number | string } | null = null;
  try {
    created = await client.client.post(`${GC_API}/workout-service/workout`, payload);
  } catch (err) {
    throw new GarminError(`Creating the workout in Garmin Connect failed (${errMsg(err)}).`);
  }
  const garminWorkoutId = Number(created?.workoutId);
  if (!garminWorkoutId) {
    throw new GarminError("Garmin Connect did not return a workout id.");
  }

  try {
    await client.client.post(`${GC_API}/workout-service/schedule/${garminWorkoutId}`, {
      date: opts.dateISO,
    });
  } catch (err) {
    throw new GarminError(
      `The workout was created in Garmin Connect but scheduling it on ${opts.dateISO} failed (${errMsg(err)}).`,
    );
  }

  // Tokens may have rotated during the calls.
  try {
    await saveGarminTokens(opts.userId, client.exportToken());
  } catch {
    // Non-fatal: the next sync will persist fresh tokens.
  }

  return { garminWorkoutId };
}

type WorkoutRow = typeof workouts.$inferSelect;
export type PlannedWorkoutForSend = Pick<
  WorkoutRow,
  | "id"
  | "date"
  | "type"
  | "distanceKm"
  | "paceLowSPerKm"
  | "paceHighSPerKm"
  | "segments"
  | "description"
  | "garminWorkoutId"
>;

/**
 * Send one planned session to Garmin Connect (replacing any earlier send)
 * and record the new workout id on the row. Returns null when there is
 * nothing to send (rest day / zero distance).
 */
export async function sendPlannedWorkoutToGarmin(
  userId: string,
  w: PlannedWorkoutForSend,
  currentVdot: number,
): Promise<number | null> {
  const steps = buildWorkoutSteps(
    {
      type: w.type,
      distanceKm: w.distanceKm,
      paceLowSPerKm: w.paceLowSPerKm,
      paceHighSPerKm: w.paceHighSPerKm,
      segments: w.segments as Parameters<typeof buildWorkoutSteps>[0]["segments"],
      description: w.description,
    },
    paceZones(currentVdot),
  );
  if (!steps) return null;

  const dateISO = String(w.date).slice(0, 10);
  const { garminWorkoutId } = await pushWorkoutToGarmin({
    userId,
    name: `${WORKOUT_META[w.type].label} ${Math.round(w.distanceKm)}k — RunPlan`,
    items: steps,
    dateISO,
    replaceWorkoutId: w.garminWorkoutId,
  });
  await db.update(workouts).set({ garminWorkoutId }).where(eq(workouts.id, w.id));
  return garminWorkoutId;
}
