import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPlanDetail } from "@/lib/plan/queries";
import type { PlanVM } from "@/lib/plan/viewModel";
import type { WorkoutSegment } from "@/lib/plan/types";
import type { PlanInput } from "@/lib/plan/inputSchema";
import { PlanView } from "@/components/plan/PlanView";
import { RaceCard, type RaceCourseVM } from "@/components/plan/RaceCard";
import { RaceEstimateCard } from "@/components/plan/RaceEstimateCard";
import { raceLabel } from "@/lib/planMeta";
import { raceDistanceM } from "@/lib/plan/vdot";
import { estimateRace, type CompletedRunInput } from "@/lib/plan/raceEstimator";
import { todayISO } from "@/lib/plan/dates";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { raceCourses } from "@/db/schema";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getPlanDetail(user.id, id);
  if (!plan) notFound();

  const [courseRow] = await db.select().from(raceCourses).where(eq(raceCourses.planId, id)).limit(1);
  const course: RaceCourseVM | null = courseRow
    ? {
        name: courseRow.name,
        distanceM: courseRow.distanceM,
        elevGainM: courseRow.elevGainM,
        elevLossM: courseRow.elevLossM,
        route: courseRow.route as [number, number][],
        elevSeries: courseRow.elevSeries as { dM: number; elevM: number }[],
      }
    : null;

  const vm: PlanVM = {
    id: plan.id,
    name: plan.name,
    raceType: plan.raceType,
    customDistanceKm: plan.customDistanceKm,
    goalTimeS: plan.goalTimeS,
    raceDate: plan.raceDate,
    startVolumeKm: plan.startVolumeKm,
    peakVolumeKm: plan.peakVolumeKm,
    daysPerWeek: plan.daysPerWeek,
    longRunDow: plan.longRunDow,
    restDow: (plan.paramsSnapshot as PlanInput | null)?.restDow ?? null,
    allowDoubles: plan.allowDoubles,
    includeStrength: plan.includeStrength,
    goalVdot: plan.goalVdot,
    currentVdot: plan.currentVdot,
    status: plan.status,
    weeks: plan.weeks.map((w) => ({
      id: w.id,
      weekIndex: w.weekIndex,
      phase: w.phase,
      plannedVolumeKm: w.plannedVolumeKm,
      isCutback: w.isCutback,
      startDate: w.startDate,
      workouts: w.workouts.map((d) => ({
        id: d.id,
        date: d.date,
        dow: d.dow,
        session: d.session,
        type: d.type,
        distanceKm: d.distanceKm,
        paceLowSPerKm: d.paceLowSPerKm,
        paceHighSPerKm: d.paceHighSPerKm,
        segments: (d.segments as WorkoutSegment[] | null) ?? null,
        description: d.description,
        completed: d.completed,
        missed: d.missed,
        actualDistanceKm: d.actualDistanceKm,
        actualDurationS: d.actualDurationS,
        notes: d.notes,
      })),
    })),
  };

  // Race estimator: completed sessions with recorded actuals (Garmin/FIT).
  const recordedRuns: CompletedRunInput[] = plan.weeks
    .flatMap((w) => w.workouts)
    .filter((d) => d.completed && d.actualDistanceKm != null && d.actualDurationS != null)
    .map((d) => ({
      dateISO: String(d.date).slice(0, 10),
      type: d.type,
      distanceKm: d.actualDistanceKm as number,
      durationS: d.actualDurationS as number,
    }));
  const estimate = estimateRace(
    recordedRuns,
    raceDistanceM(plan.raceType, plan.customDistanceKm),
    todayISO(),
  );

  return (
    <div className="flex flex-col gap-5">
      <RaceCard
        planId={plan.id}
        raceLabel={raceLabel(plan.raceType, plan.customDistanceKm, user.unitPref)}
        raceDateISO={String(plan.raceDate).slice(0, 10)}
        goalTimeS={plan.goalTimeS}
        raceDistanceKm={raceDistanceM(plan.raceType, plan.customDistanceKm) / 1000}
        unit={user.unitPref}
        course={course}
      />
      <RaceEstimateCard estimate={estimate} goalTimeS={plan.goalTimeS} unit={user.unitPref} />
      <PlanView plan={vm} unit={user.unitPref} />
    </div>
  );
}
