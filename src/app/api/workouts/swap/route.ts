import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ aId: z.string().uuid(), bId: z.string().uuid() });

/** Swap the calendar slot (date + weekday) of two workouts within the same week. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success || parsed.data.aId === parsed.data.bId) {
    return NextResponse.json({ error: "Invalid swap" }, { status: 400 });
  }
  const { aId, bId } = parsed.data;

  const rows = await db
    .select({
      id: workouts.id,
      date: workouts.date,
      dow: workouts.dow,
      weekId: workouts.weekId,
      ownerId: plans.userId,
    })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(inArray(workouts.id, [aId, bId]));

  const a = rows.find((r) => r.id === aId);
  const b = rows.find((r) => r.id === bId);
  if (!a || !b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (a.ownerId !== user.id || b.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (a.weekId !== b.weekId) {
    return NextResponse.json({ error: "Can only rearrange within the same week" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.update(workouts).set({ date: b.date, dow: b.dow }).where(eq(workouts.id, aId));
    await tx.update(workouts).set({ date: a.date, dow: a.dow }).where(eq(workouts.id, bId));
  });

  return NextResponse.json({ ok: true });
}
