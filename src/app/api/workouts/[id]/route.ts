import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, workoutTypes, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { sendPlannedWorkoutToGarmin } from "@/lib/garmin/pushWorkout";

const patchSchema = z.object({
  completed: z.boolean().optional(),
  missed: z.boolean().optional(),
  actualDistanceKm: z.number().min(0).max(200).nullable().optional(),
  actualDurationS: z.number().int().min(0).max(86_400).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  type: z.enum(workoutTypes).optional(),
  distanceKm: z.number().min(0).max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(400).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  // Verify ownership via the parent plan.
  const [row] = await db
    .select({ workoutId: workouts.id, ownerId: plans.userId, currentVdot: plans.currentVdot })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(eq(workouts.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = parsed.data;
  const update: Partial<typeof workouts.$inferInsert> = { ...data };
  if (data.completed !== undefined) {
    update.completedAt = data.completed ? new Date() : null;
    if (data.completed) update.missed = false;
  }
  if (data.missed) {
    update.completed = false;
    update.completedAt = null;
  }

  const [updated] = await db
    .update(workouts)
    .set(update)
    .where(eq(workouts.id, id))
    .returning();

  // If the planned session changed after it was sent to Garmin, re-push it so
  // the watch copy doesn't go stale. Best-effort: an offline Garmin must not
  // fail the edit itself.
  const plannedChanged =
    data.type !== undefined ||
    data.distanceKm !== undefined ||
    data.date !== undefined ||
    data.description !== undefined;
  if (plannedChanged && updated.garminWorkoutId && !updated.completed) {
    try {
      await sendPlannedWorkoutToGarmin(user.id, updated, row.currentVdot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Re-sending edited workout ${updated.id} to Garmin failed:`, msg);
    }
  }

  return NextResponse.json({ workout: updated });
}
