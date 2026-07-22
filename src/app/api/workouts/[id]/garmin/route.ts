import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { GarminError } from "@/lib/garmin/client";
import { getActivityData } from "@/lib/garmin/activity";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const [row] = await db
    .select({ ownerId: plans.userId, garminActivityId: workouts.garminActivityId })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(eq(workouts.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerId !== auth.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!row.garminActivityId) {
    return NextResponse.json({ error: "No Garmin activity linked to this workout" }, { status: 404 });
  }

  try {
    const data = await getActivityData(auth.user.id, row.garminActivityId);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof GarminError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("Garmin activity fetch failed:", err);
    return NextResponse.json({ error: "Unexpected error fetching the activity" }, { status: 502 });
  }
}
