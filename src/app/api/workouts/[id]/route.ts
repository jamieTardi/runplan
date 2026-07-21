import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, workoutTypes, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const patchSchema = z.object({
  completed: z.boolean().optional(),
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
    .select({ workoutId: workouts.id, ownerId: plans.userId })
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
  }

  const [updated] = await db
    .update(workouts)
    .set(update)
    .where(eq(workouts.id, id))
    .returning();

  return NextResponse.json({ workout: updated });
}
