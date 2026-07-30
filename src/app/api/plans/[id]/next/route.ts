import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { planCreationDenial } from "@/lib/billing/plan";
import { planInputSchema, raceTypeEnum, type PlanInput } from "@/lib/plan/inputSchema";
import { BRIDGE_MIN_WEEKS, MAX_WEEKS, bridgeTotalWeeks } from "@/lib/plan/periodize";
import { createPlanForUser } from "@/lib/plan/persist";
import { paceZones, raceDistanceM } from "@/lib/plan/vdot";
import { raceLabel } from "@/lib/planMeta";
import type { CurrentFitness } from "@/lib/plan/types";

const bodySchema = z.object({
  raceType: raceTypeEnum,
  customDistanceKm: z.number().positive().min(1).max(500).nullish(),
  goalTimeS: z.number().int().positive().max(48 * 3600),
  raceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  name: z.string().trim().max(80).optional(),
});

/**
 * Chain a new plan straight onto this plan's race ("plan my next race"): the
 * follow-up starts the Monday after race day with post-race recovery week(s),
 * rebuilds on the fitness carried over from this block, and tapers into the
 * new race. Current fitness is taken from the race itself — the recorded
 * finish time when the race workout was completed with one, else the goal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const prev = await db.query.plans.findFirst({
    where: (p, { and: a, eq: e }) => a(e(p.id, id), e(p.userId, user.id)),
  });
  if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  if (body.data.raceType === "custom" && !body.data.customDistanceKm) {
    return NextResponse.json({ error: "Enter a distance for your custom race" }, { status: 400 });
  }

  const prevRaceDateISO = String(prev.raceDate).slice(0, 10);
  const gapWeeks = bridgeTotalWeeks(prevRaceDateISO, body.data.raceDateISO);
  if (gapWeeks < BRIDGE_MIN_WEEKS || gapWeeks > MAX_WEEKS) {
    return NextResponse.json(
      {
        error: `Your next race must be ${BRIDGE_MIN_WEEKS} to ${MAX_WEEKS} weeks after ${raceLabel(prev.raceType, prev.customDistanceKm)} race day for a continuation plan`,
      },
      { status: 400 },
    );
  }

  // Same creation gates as a from-scratch plan (free window, active/total caps).
  const existing = await db
    .select({ status: plans.status })
    .from(plans)
    .where(eq(plans.userId, user.id));
  const denial = planCreationDenial(user, {
    total: existing.length,
    active: existing.filter((p) => p.status === "active").length,
  });
  if (denial) {
    return NextResponse.json(
      { error: denial.error, ...(denial.upgrade && { upgrade: true }) },
      { status: denial.upgrade ? 402 : 403 },
    );
  }

  // Fitness carries over from the previous block, anchored on the race itself:
  // the recorded finish when available, otherwise the goal time.
  const [raceRow] = await db
    .select({ completed: workouts.completed, actualDurationS: workouts.actualDurationS })
    .from(workouts)
    .where(
      and(eq(workouts.planId, prev.id), eq(workouts.type, "race"), eq(workouts.date, prevRaceDateISO)),
    )
    .limit(1);
  const finishTimeS =
    raceRow?.completed && raceRow.actualDurationS ? raceRow.actualDurationS : prev.goalTimeS;
  const currentFitness: CurrentFitness =
    prev.raceType !== "custom"
      ? { mode: "race", raceType: prev.raceType, timeS: finishTimeS }
      : {
          mode: "estimate",
          weeklyKm: prev.peakVolumeKm,
          easyPaceSecPerKm: Math.round(paceZones(prev.currentVdot).easyFast),
        };

  const snapshot = planInputSchema.safeParse(prev.paramsSnapshot);
  const parsed = planInputSchema.safeParse({
    name:
      body.data.name ||
      `${raceLabel(body.data.raceType, body.data.customDistanceKm)} — next race`,
    raceType: body.data.raceType,
    customDistanceKm: body.data.customDistanceKm ?? null,
    goalTimeS: body.data.goalTimeS,
    raceDateISO: body.data.raceDateISO,
    currentFitness,
    startVolumeKm: Math.max(1, Math.round(prev.peakVolumeKm * 0.45)),
    peakVolumeKm: prev.peakVolumeKm,
    daysPerWeek: prev.daysPerWeek,
    longRunDow: prev.longRunDow,
    restDow: snapshot.success ? (snapshot.data.restDow ?? null) : null,
    // Tune-up races only make sense once the gap fits full periodisation.
    includeTuneups: gapWeeks >= 10 ? prev.includeTuneups : false,
    allowDoubles: prev.allowDoubles,
    includeStrength: prev.includeStrength,
    experience: snapshot.success ? (snapshot.data.experience ?? null) : null,
    continuation: {
      prevRaceDateISO,
      prevRaceDistanceKm: raceDistanceM(prev.raceType, prev.customDistanceKm) / 1000,
    },
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid plan input" },
      { status: 400 },
    );
  }
  const input: PlanInput = parsed.data;

  try {
    const newId = await createPlanForUser(user.id, input, { previousPlanId: prev.id });
    return NextResponse.json({ id: newId, weeks: gapWeeks });
  } catch (err) {
    console.error("next-race plan creation failed", err);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
