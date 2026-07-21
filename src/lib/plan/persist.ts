import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, weeks, workouts } from "@/db/schema";
import { generatePlan } from "./generatePlan";
import { todayISO } from "./dates";
import { planInputSchema, type PlanInput } from "./inputSchema";
import type { GeneratedPlan } from "./types";

/** Persist a generated plan (plan + weeks + workouts) for a user. Returns the plan id. */
export async function saveGeneratedPlan(
  userId: string,
  input: PlanInput,
  gen: GeneratedPlan,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        userId,
        name: gen.name,
        raceType: gen.raceType,
        goalTimeS: gen.goalTimeS,
        raceDate: gen.raceDateISO,
        methodology: "pfitzinger",
        startVolumeKm: input.startVolumeKm,
        peakVolumeKm: input.peakVolumeKm,
        daysPerWeek: input.daysPerWeek,
        longRunDow: input.longRunDow,
        goalVdot: gen.goalVdot,
        currentVdot: gen.currentVdot,
        includeTuneups: input.includeTuneups,
        status: "active",
        paramsSnapshot: input,
      })
      .returning({ id: plans.id });

    for (const w of gen.weeks) {
      const [week] = await tx
        .insert(weeks)
        .values({
          planId: plan.id,
          weekIndex: w.weekIndex,
          phase: w.phase,
          plannedVolumeKm: w.plannedVolumeKm,
          isCutback: w.isCutback,
          startDate: w.startDateISO,
        })
        .returning({ id: weeks.id });

      await tx.insert(workouts).values(
        w.workouts.map((d) => ({
          planId: plan.id,
          weekId: week.id,
          date: d.dateISO,
          dow: d.dow,
          type: d.type,
          distanceKm: d.distanceKm,
          paceLowSPerKm: d.paceLowSPerKm ?? null,
          paceHighSPerKm: d.paceHighSPerKm ?? null,
          segments: d.segments ?? null,
          description: d.description,
        })),
      );
    }
    return plan.id;
  });
}

/** Generate from user input and persist. Returns the new plan id. */
export async function createPlanForUser(userId: string, input: PlanInput): Promise<string> {
  const gen = generatePlan({ ...input, todayISO: todayISO() });
  return saveGeneratedPlan(userId, input, gen);
}

/**
 * Regenerate an existing plan around a new race date, preserving any completed
 * sessions (matched by calendar date). Returns false if the plan isn't found.
 */
export async function regeneratePlan(
  userId: string,
  planId: string,
  overrides: Partial<PlanInput>,
): Promise<boolean> {
  const plan = await db.query.plans.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, planId), eq(p.userId, userId)),
  });
  if (!plan) return false;

  const parsedSnapshot = planInputSchema.safeParse(plan.paramsSnapshot);
  if (!parsedSnapshot.success) return false;
  const input: PlanInput = { ...parsedSnapshot.data, ...overrides };
  // A larger peak must still be at least the starting volume.
  input.peakVolumeKm = Math.max(input.peakVolumeKm, input.startVolumeKm);

  // Remember what's already been done, keyed by date.
  const existing = await db
    .select({
      date: workouts.date,
      completed: workouts.completed,
      actualDistanceKm: workouts.actualDistanceKm,
      actualDurationS: workouts.actualDurationS,
      notes: workouts.notes,
    })
    .from(workouts)
    .where(eq(workouts.planId, planId));
  const preserved = new Map(existing.filter((w) => w.completed).map((w) => [w.date, w]));

  const gen = generatePlan({ ...input, todayISO: todayISO() });

  await db.transaction(async (tx) => {
    await tx
      .update(plans)
      .set({
        raceDate: input.raceDateISO,
        raceType: input.raceType,
        goalTimeS: input.goalTimeS,
        startVolumeKm: input.startVolumeKm,
        peakVolumeKm: input.peakVolumeKm,
        daysPerWeek: input.daysPerWeek,
        longRunDow: input.longRunDow,
        includeTuneups: input.includeTuneups,
        goalVdot: gen.goalVdot,
        currentVdot: gen.currentVdot,
        paramsSnapshot: input,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId));

    // Cascade removes the old workouts too.
    await tx.delete(weeks).where(eq(weeks.planId, planId));

    for (const w of gen.weeks) {
      const [week] = await tx
        .insert(weeks)
        .values({
          planId,
          weekIndex: w.weekIndex,
          phase: w.phase,
          plannedVolumeKm: w.plannedVolumeKm,
          isCutback: w.isCutback,
          startDate: w.startDateISO,
        })
        .returning({ id: weeks.id });

      await tx.insert(workouts).values(
        w.workouts.map((d) => {
          const done = preserved.get(d.dateISO);
          return {
            planId,
            weekId: week.id,
            date: d.dateISO,
            dow: d.dow,
            type: d.type,
            distanceKm: d.distanceKm,
            paceLowSPerKm: d.paceLowSPerKm ?? null,
            paceHighSPerKm: d.paceHighSPerKm ?? null,
            segments: d.segments ?? null,
            description: d.description,
            completed: Boolean(done),
            completedAt: done ? new Date() : null,
            actualDistanceKm: done?.actualDistanceKm ?? null,
            actualDurationS: done?.actualDurationS ?? null,
            notes: done?.notes ?? null,
          };
        }),
      );
    }
  });
  return true;
}
