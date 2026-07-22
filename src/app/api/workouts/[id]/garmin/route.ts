import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { isPro, upgradeMessage } from "@/lib/billing/plan";
import { GarminError } from "@/lib/garmin/client";
import { getActivityData } from "@/lib/garmin/activity";
import { pushWorkoutToGarmin } from "@/lib/garmin/pushWorkout";
import { paceZones } from "@/lib/plan/vdot";
import { WORKOUT_META } from "@/lib/planMeta";
import { buildWorkoutSteps } from "@/lib/fit/steps";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPro(auth.user)) {
    return NextResponse.json({ error: upgradeMessage("Garmin activity detail"), upgrade: true }, { status: 402 });
  }

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

/** Send the planned session to Garmin Connect as a scheduled structured workout. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPro(auth.user)) {
    return NextResponse.json({ error: upgradeMessage("Send to Garmin"), upgrade: true }, { status: 402 });
  }

  const { id } = await params;
  const [row] = await db
    .select({ workout: workouts, ownerId: plans.userId, currentVdot: plans.currentVdot })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(eq(workouts.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerId !== auth.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const w = row.workout;
  const steps = buildWorkoutSteps(
    {
      type: w.type,
      distanceKm: w.distanceKm,
      paceLowSPerKm: w.paceLowSPerKm,
      paceHighSPerKm: w.paceHighSPerKm,
      segments: w.segments as Parameters<typeof buildWorkoutSteps>[0]["segments"],
      description: w.description,
    },
    paceZones(row.currentVdot),
  );
  if (!steps) {
    return NextResponse.json({ error: "Rest days have nothing to send" }, { status: 400 });
  }

  const dateISO = String(w.date).slice(0, 10);
  const name = `${WORKOUT_META[w.type].label} ${Math.round(w.distanceKm)}k — RunPlan`;

  try {
    const { garminWorkoutId } = await pushWorkoutToGarmin({
      userId: auth.user.id,
      name,
      items: steps,
      dateISO,
      replaceWorkoutId: w.garminWorkoutId,
    });
    await db.update(workouts).set({ garminWorkoutId }).where(eq(workouts.id, w.id));
    return NextResponse.json({ ok: true, garminWorkoutId, date: dateISO });
  } catch (err) {
    if (err instanceof GarminError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("Send to Garmin failed:", err);
    return NextResponse.json({ error: "Unexpected error sending the workout to Garmin" }, { status: 502 });
  }
}
