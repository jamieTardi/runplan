import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { plans, weeks, workouts } from "@/db/schema";
import { buildWeek } from "./buildWeek";
import { applyDoubles } from "./doubles";
import { addDaysISO, diffDaysISO } from "./dates";
import {
  gapSeverity,
  rebuildVolumes,
  stripQualityForReturn,
  type GapReason,
  type WeekVolumeIn,
} from "./gapRebuild";
import { assessFeasibility, goalPaceSecPerKm } from "./goal";
import { planInputSchema } from "./inputSchema";
import { paceZones, raceDistanceM } from "./vdot";
import type { PlanWorkout, WorkoutSegment } from "./types";
import type { WeekPlan } from "./periodize";
import { deleteGarminWorkoutsBestEffort } from "@/lib/garmin/pushWorkout";

export interface GapRebuildSummary {
  missedCount: number;
  rebuilt: boolean;
  rebuiltWeeks: number;
  resumeWeekKm: number | null;
  easyWeeks: number;
  warnings: string[];
}

/**
 * Record a missed block of training (injury / life) and — optionally — rebuild
 * the rest of the plan with a safe return-to-training ramp.
 *
 * Unlike `regeneratePlan`, this is surgical:
 *  - Weeks up to and including the gap are left exactly as they are (history,
 *    Garmin activity links, notes all survive) — the gap's unfinished sessions
 *    are only flagged `missed`.
 *  - Only weeks strictly after the gap are regenerated, at reduced volumes
 *    capped week-over-week, with the first week(s) back easy-only.
 *  - Completed or missed sessions inside rebuilt weeks are re-attached by date
 *    with their original timestamps, actuals and Garmin activity ids.
 */
export async function applyGapAndRebuild(
  userId: string,
  planId: string,
  opts: { gapStartISO: string; gapEndISO: string; reason: GapReason; rebuild: boolean },
): Promise<GapRebuildSummary | null> {
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

  const { gapStartISO, gapEndISO, reason } = opts;
  const allWorkouts = plan.weeks.flatMap((w) => w.workouts);
  const iso = (d: unknown) => String(d).slice(0, 10);

  // 1. Sessions inside the gap that weren't done become "missed".
  const toMiss = allWorkouts.filter(
    (w) =>
      iso(w.date) >= gapStartISO &&
      iso(w.date) <= gapEndISO &&
      !w.completed &&
      !w.missed &&
      w.type !== "rest",
  );

  const warnings: string[] = [];
  const summary: GapRebuildSummary = {
    missedCount: toMiss.length,
    rebuilt: false,
    rebuiltWeeks: 0,
    resumeWeekKm: null,
    easyWeeks: 0,
    warnings,
  };

  if (!opts.rebuild) {
    if (toMiss.length > 0) {
      await db
        .update(workouts)
        .set({ missed: true })
        .where(inArray(workouts.id, toMiss.map((w) => w.id)));
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, planId));
    }
    return summary;
  }

  // 2. How bad was the gap, and where do we resume?
  const gapDays = diffDaysISO(gapEndISO, gapStartISO) + 1;
  const severity = gapSeverity(gapDays, reason);
  summary.easyWeeks = severity.easyWeeks;

  // Pre-gap load = the last week fully trained before the gap started.
  const preGapWeek = [...plan.weeks]
    .reverse()
    .find((w) => addDaysISO(iso(w.startDate), 6) < gapStartISO);
  const preGapKm = preGapWeek?.plannedVolumeKm ?? plan.startVolumeKm;
  const resumeKm = Math.round(preGapKm * severity.resumeFactor * 10) / 10;

  const futureWeeks = plan.weeks.filter((w) => iso(w.startDate) > gapEndISO);
  const partialWeek = plan.weeks.find(
    (w) => iso(w.startDate) <= gapEndISO && addDaysISO(iso(w.startDate), 6) > gapEndISO,
  );

  // 3. Shared generation context (mirrors generatePlan's per-week mapping).
  const snapshot = planInputSchema.safeParse(plan.paramsSnapshot);
  const restDow = snapshot.success ? (snapshot.data.restDow ?? null) : null;
  const raceDateISO = iso(plan.raceDate);
  const totalWeeks = plan.weeks.length;
  const raceKm = raceDistanceM(plan.raceType, plan.customDistanceKm) / 1000;
  const goalPace = goalPaceSecPerKm(plan.raceType, plan.goalTimeS, plan.customDistanceKm);
  const easyZones = paceZones(plan.currentVdot);

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

  const newVols = rebuildVolumes(
    futureWeeks.map(
      (w): WeekVolumeIn => ({
        phase: w.phase,
        plannedVolumeKm: w.plannedVolumeKm,
        isCutback: w.isCutback,
      }),
    ),
    resumeKm,
    severity.growthCap,
  );

  // The partially-elapsed resume week consumes the first easy week (if any).
  let easyWeeksLeft = severity.easyWeeks;
  const partialRemaining = (partialWeek?.workouts ?? []).filter(
    (w) => iso(w.date) > gapEndISO && !w.completed && w.type !== "rest",
  );
  const adjustPartial = partialRemaining.length > 0 && severity.easyWeeks > 0;
  if (adjustPartial && partialRemaining.length >= 4) easyWeeksLeft--;

  const staleGarminIds: number[] = [];

  // 4. Build the replacement weeks.
  const rebuilt = futureWeeks.map((week, i) => {
    const progress = totalWeeks > 1 ? week.weekIndex / (totalWeeks - 1) : 1;
    const eased = progress * progress * (3 - 2 * progress);
    const qualityVdot = plan.currentVdot + (plan.goalVdot - plan.currentVdot) * eased;

    const wp: WeekPlan = {
      weekIndex: week.weekIndex,
      phase: week.phase,
      plannedVolumeKm: newVols[i],
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
    if (i < easyWeeksLeft) {
      built = { ...built, workouts: stripQualityForReturn(built.workouts, easyZones) };
    }
    const volume = Math.min(
      newVols[i],
      Math.round(built.workouts.reduce((a, d) => a + d.distanceKm, 0) * 10) / 10,
    );

    // Anything already done (or already flagged missed) in a rebuilt week is
    // re-attached by date — including Garmin links and original timestamps.
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

    return { week, volume, built, preservedByDate };
  });

  // 5. Persist everything atomically.
  await db.transaction(async (tx) => {
    if (toMiss.length > 0) {
      await tx
        .update(workouts)
        .set({ missed: true })
        .where(inArray(workouts.id, toMiss.map((w) => w.id)));
    }

    if (adjustPartial) {
      const scaled = stripQualityForReturn(
        partialRemaining.map(
          (w): PlanWorkout => ({
            dow: w.dow,
            dateISO: iso(w.date),
            type: w.type,
            distanceKm: Math.max(1, Math.round(w.distanceKm * severity.resumeFactor)),
            paceLowSPerKm: w.paceLowSPerKm,
            paceHighSPerKm: w.paceHighSPerKm,
            segments: (w.segments as WorkoutSegment[] | null) ?? null,
            description: w.description,
          }),
        ),
        easyZones,
      );
      for (let i = 0; i < partialRemaining.length; i++) {
        const row = partialRemaining[i];
        const next = scaled[i];
        if (row.garminWorkoutId) staleGarminIds.push(row.garminWorkoutId);
        await tx
          .update(workouts)
          .set({
            type: next.type,
            distanceKm: next.distanceKm,
            paceLowSPerKm: next.paceLowSPerKm,
            paceHighSPerKm: next.paceHighSPerKm,
            segments: next.segments,
            description: next.description,
            garminWorkoutId: null,
          })
          .where(eq(workouts.id, row.id));
      }
    }

    for (const { week, volume, built, preservedByDate } of rebuilt) {
      await tx.delete(workouts).where(eq(workouts.weekId, week.id));
      await tx
        .update(weeks)
        .set({ plannedVolumeKm: volume })
        .where(eq(weeks.id, week.id));
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

    await tx.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, planId));
  });

  // 6. Best-effort: remove replaced sessions from Garmin Connect so stale
  // structured workouts don't linger on the calendar/watch.
  await deleteGarminWorkoutsBestEffort(userId, staleGarminIds);

  summary.rebuilt = true;
  summary.rebuiltWeeks = rebuilt.length;
  summary.resumeWeekKm = newVols[0] ?? null;

  if (rebuilt.length === 0 && !adjustPartial) {
    warnings.push(
      "The break covers the rest of the plan — there was nothing left to rebuild. Consider editing the plan's race date instead.",
    );
  }
  const originalPeak = Math.max(0, ...futureWeeks.map((w) => w.plannedVolumeKm));
  const newPeak = Math.max(0, ...newVols);
  if (originalPeak > 0 && newPeak < originalPeak * 0.75) {
    warnings.push(
      "The safe ramp back means your peak training week is now well below the original plan — race day may feel harder than first planned. Consider softening your goal time in Edit plan if it was already ambitious.",
    );
  }
  if (gapDays >= 28) {
    warnings.push(
      "That's a long break. If race day feels too close now, consider adjusting your goal time or race date in Edit plan.",
    );
  } else if (gapDays >= 14) {
    const feas = assessFeasibility(plan.currentVdot, plan.goalVdot, futureWeeks.length);
    if (feas.verdict === "ambitious" || feas.verdict === "very_ambitious") {
      warnings.push(
        "With the training time lost, your goal is now on the ambitious side — consider softening it in Edit plan.",
      );
    }
  }
  return summary;
}
