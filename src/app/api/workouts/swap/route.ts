import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ aId: z.string().uuid(), bId: z.string().uuid() });

/** Swap the calendar slot (date + weekday) of two days within the same week — all
 * sessions on each day (AM + PM of a double day) move together. */
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

  // Resolve each day's rows up front — updating by dow twice would re-match
  // the rows the first update just moved.
  const dayRows = await db
    .select({ id: workouts.id, dow: workouts.dow })
    .from(workouts)
    .where(and(eq(workouts.weekId, a.weekId), inArray(workouts.dow, [a.dow, b.dow])));
  const dayA = dayRows.filter((r) => r.dow === a.dow).map((r) => r.id);
  const dayB = dayRows.filter((r) => r.dow === b.dow).map((r) => r.id);

  await db.transaction(async (tx) => {
    await tx.update(workouts).set({ date: b.date, dow: b.dow }).where(inArray(workouts.id, dayA));
    await tx.update(workouts).set({ date: a.date, dow: a.dow }).where(inArray(workouts.id, dayB));
  });

  return NextResponse.json({ ok: true });
}
