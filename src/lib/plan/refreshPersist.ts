import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { buildWeek } from "./buildWeek";
import { applyDoubles } from "./doubles";
import { applyStrength } from "./strength";
import { applyBeginnerNotes } from "./beginner";
import { addDaysISO, todayISO } from "./dates";
import { goalPaceSecPerKm } from "./goal";
import { planInputSchema } from "./inputSchema";
import { RACE_DISTANCES_M, paceZones, raceDistanceM, vdotToRaceTime } from "./vdot";
import type { WeekPlan } from "./periodize";
import { deleteGarminWorkoutsBestEffort } from "@/lib/garmin/pushWorkout";

export interface RefreshSummary {
  rebuiltWeeks: number;
  /** Set when the refresh recalibrated paces: the VDOT they now derive from. */
  vdot?: number;
}

/**
 * Re-plan the current and future weeks with the latest generator, without
 * touching history. Unlike `regeneratePlan` (which restarts the plan from
 * today), this keeps the original periodisation: every week keeps its stored
 * phase, volume target and cutback flag and is simply rebuilt by the current
 * engine — so existing plans pick up generator improvements shipped after
 * they were created. Completed and missed sessions are re-attached by date
 * (actuals, notes and Garmin links survive); replaced sessions already pushed
 * to Garmin are cleaned up best-effort.
 */
export interface RefreshOptions {
  /** Retrofit (or remove) strength sessions while re-planning. */
  includeStrength?: boolean;
  /**
   * Recalibrate training paces to this VDOT (e.g. the race estimator's
   * current-fitness value). Persisted on the plan and, as an equivalent 10k
   * fitness, in the params snapshot so Edit-plan rebuilds keep it. The goal
   * time and goal VDOT are untouched.
   */
  currentVdot?: number;
}

export async function refreshPlan(
  userId: string,
  planId: string,
  opts: RefreshOptions = {},
): Promise<RefreshSummary | null> {
  const plan = await db.query.plans.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, planId), eq(p.userId, userId)),
    with: {
      weeks: {
        orderBy: (w, { asc }) => asc(w.weekIndex),
        with: { workouts: { orderBy: (d, { asc }) => asc(d.dow) } },
      },
    },
  });
  if (!plan) return null;

  const today = todayISO();
  const iso = (d: unknown) => String(d).slice(0, 10);

  // Every week still in progress or ahead of us. Fully-elapsed weeks are
  // history and stay byte-for-byte as they were.
  const target = plan.weeks.filter((w) => addDaysISO(iso(w.startDate), 6) >= today);
  if (target.length === 0) return { rebuiltWeeks: 0 };

  const includeStrength = opts.includeStrength ?? plan.includeStrength;
  const currentVdot = opts.currentVdot ?? plan.currentVdot;

  // Shared generation context (mirrors generatePlan's per-week mapping).
  const snapshot = planInputSchema.safeParse(plan.paramsSnapshot);
  const restDow = snapshot.success ? (snapshot.data.restDow ?? null) : null;
  const raceDateISO = iso(plan.raceDate);
  const totalWeeks = plan.weeks.length;
  const raceKm = raceDistanceM(plan.raceType, plan.customDistanceKm) / 1000;
  const goalPace = goalPaceSecPerKm(plan.raceType, plan.goalTimeS, plan.customDistanceKm);
  const easyZones = paceZones(currentVdot);

  // Tune-up placement counts race-prep weeks across the WHOLE plan, so rebuilt
  // weeks land tune-ups exactly where the original generator would have.
  const tuneupByWeekId = new Map<string, boolean>();
  let racePrepCount = 0;
  for (const w of plan.weeks) {
    if (w.phase === "race_prep") {
      tuneupByWeekId.set(w.id, plan.includeTuneups && racePrepCount % 3 === 1);
      racePrepCount++;
    }
  }

  const staleGarminIds: number[] = [];

  const rebuilt = target.map((week) => {
    const progress = totalWeeks > 1 ? week.weekIndex / (totalWeeks - 1) : 1;
    const eased = progress * progress * (3 - 2 * progress);
    const qualityVdot = currentVdot + (plan.goalVdot - currentVdot) * eased;

    const wp: WeekPlan = {
      weekIndex: week.weekIndex,
      phase: week.phase,
      plannedVolumeKm: week.plannedVolumeKm,
      isCutback: week.isCutback,
      startDateISO: iso(week.startDate),
    };
    let built = buildWeek({
      week: wp,
      totalWeeks,
      raceType: plan.raceType,
      raceDistanceKm: raceKm,
      goalTimeS: plan.goalTimeS,
      raceDateISO,
      daysPerWeek: plan.daysPerWeek,
      peakVolumeKm: plan.peakVolumeKm,
      longRunDow: plan.longRunDow,
      restDow,
      includeTuneups: plan.includeTuneups,
      easy: easyZones,
      quality: paceZones(qualityVdot),
      goalPaceSecPerKm: goalPace,
      isRaceWeek: week.weekIndex === totalWeeks - 1,
      isTuneupWeek: tuneupByWeekId.get(week.id) ?? false,
    });
    built = applyDoubles(built, {
      enabled: plan.allowDoubles,
      isRaceWeek: week.weekIndex === totalWeeks - 1,
      longRunDow: plan.longRunDow,
      easy: easyZones,
    });
    built = applyStrength(built, {
      enabled: includeStrength,
      isRaceWeek: week.weekIndex === totalWeeks - 1,
      longRunDow: plan.longRunDow,
    });
    built = applyBeginnerNotes(
      built,
      (plan.paramsSnapshot as { experience?: string } | null)?.experience === "beginner",
    );

    // Anything already done (or flagged missed) is re-attached by date —
    // including Garmin links and original timestamps.
    const preservedByDate = new Map(
      week.workouts
        .filter((w) => w.completed || w.missed)
        .map((w) => [`${iso(w.date)}:${w.session}`, w]),
    );
    for (const w of week.workouts) {
      if (w.garminWorkoutId && !preservedByDate.has(`${iso(w.date)}:${w.session}`)) {
        staleGarminIds.push(w.garminWorkoutId);
      }
    }

    return { week, built, preservedByDate };
  });

  await db.transaction(async (tx) => {
    for (const { week, built, preservedByDate } of rebuilt) {
      await tx.delete(workouts).where(eq(workouts.weekId, week.id));
      await tx.insert(workouts).values(
        built.workouts.map((d) => {
          const prev = preservedByDate.get(`${d.dateISO}:${d.session ?? "am"}`);
          return {
            planId,
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
            completed: prev?.completed ?? false,
            completedAt: prev?.completedAt ?? null,
            missed: prev?.missed ?? false,
            actualDistanceKm: prev?.actualDistanceKm ?? null,
            actualDurationS: prev?.actualDurationS ?? null,
            notes: prev?.notes ?? null,
            garminActivityId: prev?.garminActivityId ?? null,
          };
        }),
      );
    }
    await tx
      .update(plans)
      .set({
        includeStrength,
        ...(opts.currentVdot != null && { currentVdot: opts.currentVdot }),
        // Keep the regeneration snapshot in step so a later Edit-plan rebuild
        // doesn't silently drop the retrofitted settings. A recalibrated VDOT
        // is stored as its equivalent 10k race fitness (the snapshot has no
        // raw-VDOT mode) — it derives back to the same value within rounding.
        paramsSnapshot: snapshot.success
          ? {
              ...snapshot.data,
              includeStrength,
              ...(opts.currentVdot != null && {
                currentFitness: {
                  mode: "race" as const,
                  raceType: "10k" as const,
                  timeS: Math.round(vdotToRaceTime(opts.currentVdot, RACE_DISTANCES_M["10k"])),
                },
              }),
            }
          : plan.paramsSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId));
  });

  // Best-effort: remove replaced sessions from Garmin Connect so stale
  // structured workouts don't linger on the calendar/watch.
  await deleteGarminWorkoutsBestEffort(userId, staleGarminIds);

  return {
    rebuiltWeeks: rebuilt.length,
    ...(opts.currentVdot != null && { vdot: opts.currentVdot }),
  };
}
