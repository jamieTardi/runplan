import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { deleteGarminWorkoutsBestEffort } from "@/lib/garmin/pushWorkout";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["active", "archived"]).optional(),
  locked: z.boolean().optional(),
  autoUpdate: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });

  const [updated] = await db
    .update(plans)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(plans.id, id), eq(plans.userId, user.id)))
    .returning({ id: plans.id });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await db.query.plans.findFirst({
    columns: { locked: true },
    where: (p, { and, eq }) => and(eq(p.id, id), eq(p.userId, user.id)),
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.locked) {
    return NextResponse.json(
      { error: "This plan is locked. Unlock it on the plan page before deleting." },
      { status: 423 },
    );
  }

  // Collect Garmin Connect workout ids before the cascade wipes the rows, so
  // deleting the plan can also scrub its sent sessions from Garmin.
  const sent = await db
    .select({ garminWorkoutId: workouts.garminWorkoutId })
    .from(workouts)
    .where(and(eq(workouts.planId, id), isNotNull(workouts.garminWorkoutId)));

  const [deleted] = await db
    .delete(plans)
    .where(and(eq(plans.id, id), eq(plans.userId, user.id)))
    .returning({ id: plans.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteGarminWorkoutsBestEffort(
    user.id,
    sent.map((r) => r.garminWorkoutId as number),
  );
  return NextResponse.json({ ok: true });
}
