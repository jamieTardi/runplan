import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { isPro, upgradeMessage } from "@/lib/billing/plan";
import { paceZones } from "@/lib/plan/vdot";
import { WORKOUT_META } from "@/lib/planMeta";
import { buildWorkoutSteps } from "@/lib/fit/steps";
import { encodeWorkoutFit } from "@/lib/fit/encode";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPro(auth.user)) {
    return NextResponse.json({ error: upgradeMessage("FIT workout export"), upgrade: true }, { status: 402 });
  }

  const { id } = await params;
  const [row] = await db
    .select({
      workout: workouts,
      ownerId: plans.userId,
      currentVdot: plans.currentVdot,
    })
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
    return NextResponse.json({ error: "Rest days have nothing to export" }, { status: 400 });
  }

  const dateISO = String(w.date).slice(0, 10);
  const label = WORKOUT_META[w.type].label;
  const name = `${label} ${Math.round(w.distanceKm)}k`;
  const bytes = encodeWorkoutFit(name, steps);

  const filename = `runplan-${dateISO}-${w.type.replace(/_/g, "-")}.fit`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
