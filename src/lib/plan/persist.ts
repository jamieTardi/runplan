import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, weeks, workouts, type Workout } from "@/db/schema";
import { generatePlan } from "./generatePlan";
import { addDaysISO, todayISO } from "./dates";
import { mergePreservedRows, reconcileWeekVolume } from "./preserveRows";
import { planInputSchema, type PlanInput } from "./inputSchema";
import type { GeneratedPlan } from "./types";

export interface SavePlanOptions {
  /** Plan this one continues on from ("next race" chaining). */
  previousPlanId?: string | null;
}

/** Persist a generated plan (plan + weeks + workouts) for a user. Returns the plan id. */
export async function saveGeneratedPlan(
  userId: string,
  input: PlanInput,
  gen: GeneratedPlan,
  opts: SavePlanOptions = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        userId,
        name: gen.name,
        raceType: gen.raceType,
        customDistanceKm: input.customDistanceKm ?? null,
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
        allowDoubles: input.allowDoubles ?? false,
        includeStrength: input.includeStrength ?? false,
        status: "active",
        previousPlanId: opts.previousPlanId ?? null,
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
          session: d.session ?? "am",
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
export async function createPlanForUser(
  userId: string,
  input: PlanInput,
  opts: SavePlanOptions = {},
): Promise<string> {
  const gen = generatePlan({ ...input, todayISO: todayISO() });
  return saveGeneratedPlan(userId, input, gen, opts);
}

export type RegenerateResult = { ok: true } | { ok: false; status: 400 | 404; error: string };

/**
 * Regenerate an existing plan around changed settings (race date, schedule,
 * volume, the season's other races). The plan keeps its original span — the
 * rebuild is anchored on the first training week, not on today, so the weeks
 * already trained stay in the plan — and every session already completed,
 * flagged missed or swapped for cross-training is re-attached by date with its
 * actuals, notes and Garmin links intact.
 */
export async function regeneratePlan(
  userId: string,
  planId: string,
  overrides: Partial<PlanInput>,
): Promise<RegenerateResult> {
  const plan = await db.query.plans.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, planId), eq(p.userId, userId)),
    with: { weeks: { orderBy: (w, { asc }) => asc(w.weekIndex) } },
  });
  if (!plan) return { ok: false, status: 404, error: "Not found" };

  const parsedSnapshot = planInputSchema.safeParse(plan.paramsSnapshot);
  if (!parsedSnapshot.success) {
    return { ok: false, status: 400, error: "This plan's saved settings can't be rebuilt" };
  }
  // A larger peak must still be at least the starting volume.
  const merged = { ...parsedSnapshot.data, ...overrides };
  merged.peakVolumeKm = Math.max(merged.peakVolumeKm, merged.startVolumeKm);
  // Re-validate the merged result: overrides can break rules the snapshot kept
  // (e.g. moving race day to before one of the plan's other races).
  const revalidated = planInputSchema.safeParse(merged);
  if (!revalidated.success) {
    return {
      ok: false,
      status: 400,
      error: revalidated.error.issues[0]?.message ?? "Invalid plan settings",
    };
  }
  const input: PlanInput = revalidated.data;

  const iso = (d: unknown) => String(d).slice(0, 10);
  // Rebuild over the plan's existing span. Re-deriving the start from today
  // would cut the weeks already trained (and their logged sessions) off the
  // front of the plan.
  const today = todayISO();
  const firstWeekStart = plan.weeks[0] ? iso(plan.weeks[0].startDate) : today;
  const anchorISO = firstWeekStart < today ? firstWeekStart : today;

  // Everything worth keeping: done, deliberately missed, or cross-trained.
  const existing = await db.select().from(workouts).where(eq(workouts.planId, planId));
  const preserved = existing.filter((w) => w.completed || w.missed || w.type === "cross_train");

  const gen = generatePlan({ ...input, todayISO: anchorISO });

  // Bucket preserved rows into the week that now owns their date. Anything
  // outside the new span (the race date moved) sticks to the nearest week
  // rather than being dropped.
  const starts = gen.weeks.map((w) => w.startDateISO);
  const buckets = gen.weeks.map(() => new Map<string, Workout>());
  for (const row of preserved) {
    const date = iso(row.date);
    let i = starts.findIndex((s) => date >= s && date <= addDaysISO(s, 6));
    if (i < 0) i = date < starts[0] ? 0 : starts.length - 1;
    buckets[i].set(`${date}:${row.session}`, row);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(plans)
      .set({
        raceDate: input.raceDateISO,
        raceType: input.raceType,
        customDistanceKm: input.customDistanceKm ?? null,
        goalTimeS: input.goalTimeS,
        startVolumeKm: input.startVolumeKm,
        peakVolumeKm: input.peakVolumeKm,
        daysPerWeek: input.daysPerWeek,
        longRunDow: input.longRunDow,
        includeTuneups: input.includeTuneups,
        allowDoubles: input.allowDoubles ?? false,
        includeStrength: input.includeStrength ?? false,
        goalVdot: gen.goalVdot,
        currentVdot: gen.currentVdot,
        paramsSnapshot: input,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId));

    // Cascade removes the old workouts too.
    await tx.delete(weeks).where(eq(weeks.planId, planId));

    for (const [i, w] of gen.weeks.entries()) {
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

      await tx
        .insert(workouts)
        .values(
          reconcileWeekVolume(
            mergePreservedRows(planId, week.id, w.workouts, buckets[i]),
            w.plannedVolumeKm,
          ),
        );
    }
  });
  return { ok: true };
}
