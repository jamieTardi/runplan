import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { todayISO } from "@/lib/plan/dates";
import { estimateRace } from "@/lib/plan/raceEstimator";
import { refreshPlan } from "@/lib/plan/refreshPersist";
import { raceDistanceM } from "@/lib/plan/vdot";

const schema = z.object({
  includeStrength: z.boolean().optional(),
  /** Recalibrate training paces to the VDOT implied by recent recorded runs. */
  recalibratePaces: z.boolean().optional(),
});

/**
 * Re-plan the current and future weeks with the latest training engine,
 * keeping history, actuals and Garmin links. The plan's stored settings are
 * reused as-is (use /rebuild to change the schedule), with two exceptions:
 * strength sessions can be toggled here so rolling plans can retrofit them,
 * and paces can be recalibrated to the runner's current estimated VDOT. The
 * VDOT is computed server-side from recorded runs — never trusted from the
 * client.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  let currentVdot: number | undefined;
  if (parsed.data.recalibratePaces) {
    const plan = await db.query.plans.findFirst({
      columns: { raceType: true, customDistanceKm: true },
      where: (p, { and, eq }) => and(eq(p.id, id), eq(p.userId, user.id)),
    });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const recorded = await db
      .select({
        date: workouts.date,
        type: workouts.type,
        actualDistanceKm: workouts.actualDistanceKm,
        actualDurationS: workouts.actualDurationS,
      })
      .from(workouts)
      .where(
        and(
          eq(workouts.planId, id),
          eq(workouts.completed, true),
          isNotNull(workouts.actualDistanceKm),
          isNotNull(workouts.actualDurationS),
        ),
      );
    const estimate = estimateRace(
      recorded.map((r) => ({
        dateISO: String(r.date).slice(0, 10),
        type: r.type,
        distanceKm: r.actualDistanceKm as number,
        durationS: r.actualDurationS as number,
      })),
      raceDistanceM(plan.raceType, plan.customDistanceKm),
      todayISO(),
    );
    if (!estimate) {
      return NextResponse.json(
        { error: "Not enough recent recorded runs to work out your current VDOT — complete a few more runs with Garmin sync or a FIT upload first." },
        { status: 400 },
      );
    }
    currentVdot = estimate.vdot;
  }

  try {
    const summary = await refreshPlan(user.id, id, {
      includeStrength: parsed.data.includeStrength,
      currentVdot,
    });
    if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("plan refresh failed", err);
    return NextResponse.json({ error: "Failed to refresh plan" }, { status: 500 });
  }
}
