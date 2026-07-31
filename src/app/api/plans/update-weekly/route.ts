import { NextResponse } from "next/server";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { todayISO } from "@/lib/plan/dates";
import { estimateRace } from "@/lib/plan/raceEstimator";
import { refreshPlan } from "@/lib/plan/refreshPersist";
import { raceDistanceM } from "@/lib/plan/vdot";

/**
 * Fitness must have moved at least this much (in VDOT points) before a plan
 * is re-paced — below it the pace change is noise, and skipping avoids
 * needlessly rebuilding weeks and re-sending Garmin workouts.
 */
const MIN_VDOT_SHIFT = 0.5;

// Internal endpoint for the weekly plan-update timer. Authenticated by the
// same shared-secret header as the Garmin sync and daily push timers.
// For every opted-in active plan: estimate the runner's current VDOT from
// recorded runs and, when it has drifted from the plan's pace basis,
// recalibrate the remaining weeks via the refresh engine.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayISO();
  const candidates = await db
    .select({
      id: plans.id,
      userId: plans.userId,
      raceType: plans.raceType,
      customDistanceKm: plans.customDistanceKm,
      currentVdot: plans.currentVdot,
    })
    .from(plans)
    .where(and(eq(plans.autoUpdate, true), eq(plans.status, "active"), gte(plans.raceDate, today)));

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const changes: Array<{ planId: string; from: number; to: number; rebuiltWeeks: number }> = [];

  for (const plan of candidates) {
    try {
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
            eq(workouts.planId, plan.id),
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
        today,
      );
      if (!estimate || Math.abs(estimate.vdot - plan.currentVdot) < MIN_VDOT_SHIFT) {
        skipped++;
        continue;
      }
      const summary = await refreshPlan(plan.userId, plan.id, { currentVdot: estimate.vdot });
      if (summary && summary.rebuiltWeeks > 0) {
        updated++;
        changes.push({
          planId: plan.id,
          from: plan.currentVdot,
          to: estimate.vdot,
          rebuiltWeeks: summary.rebuiltWeeks,
        });
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`weekly update failed for plan ${plan.id}`, err);
      failed++;
    }
  }

  return NextResponse.json({ candidates: candidates.length, updated, skipped, failed, changes });
}
