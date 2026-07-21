import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPlanDetail } from "@/lib/plan/queries";
import type { PlanVM } from "@/lib/plan/viewModel";
import type { WorkoutSegment } from "@/lib/plan/types";
import type { PlanInput } from "@/lib/plan/inputSchema";
import { PlanView } from "@/components/plan/PlanView";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getPlanDetail(user.id, id);
  if (!plan) notFound();

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
        type: d.type,
        distanceKm: d.distanceKm,
        paceLowSPerKm: d.paceLowSPerKm,
        paceHighSPerKm: d.paceHighSPerKm,
        segments: (d.segments as WorkoutSegment[] | null) ?? null,
        description: d.description,
        completed: d.completed,
        actualDistanceKm: d.actualDistanceKm,
        actualDurationS: d.actualDurationS,
        notes: d.notes,
      })),
    })),
  };

  return <PlanView plan={vm} unit={user.unitPref} />;
}
