import { buildWeek } from "./buildWeek";
import { isoDayOfWeek } from "./dates";
import {
  assessFeasibility,
  currentVdot as computeCurrentVdot,
  goalPaceSecPerKm as computeGoalPace,
  goalVdot as computeGoalVdot,
} from "./goal";
import { buildWeekPlans } from "./periodize";
import type { GeneratedPlan, GenerateInput, PlanWeek } from "./types";
import { paceZones } from "./vdot";

const RACE_LABEL: Record<string, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half Marathon",
  marathon: "Marathon",
};

/** Generate a complete, periodised training plan from user inputs. Pure & deterministic. */
export function generatePlan(input: GenerateInput): GeneratedPlan {
  const goalVdot = computeGoalVdot(input.raceType, input.goalTimeS);
  const currentVdot = computeCurrentVdot(input.currentFitness);
  const goalPace = computeGoalPace(input.raceType, input.goalTimeS);

  const weekPlans = buildWeekPlans(
    input.todayISO,
    input.raceDateISO,
    input.startVolumeKm,
    input.peakVolumeKm,
  );
  const totalWeeks = weekPlans.length;
  const feasibility = assessFeasibility(currentVdot, goalVdot, totalWeeks);

  // Easy/aerobic paces track current fitness; quality paces progress from current
  // toward goal fitness across the plan (with a gentle ease-in curve).
  const easyZones = paceZones(currentVdot);

  const raceDow = isoDayOfWeek(input.raceDateISO);
  let racePrepCount = 0;

  const weeks: PlanWeek[] = weekPlans.map((wp, i) => {
    const progress = totalWeeks > 1 ? i / (totalWeeks - 1) : 1;
    const eased = progress * progress * (3 - 2 * progress); // smoothstep
    const qualityVdot = currentVdot + (goalVdot - currentVdot) * eased;
    const quality = paceZones(qualityVdot);

    const isRaceWeek = i === totalWeeks - 1;
    let isTuneupWeek = false;
    if (wp.phase === "race_prep" && input.includeTuneups) {
      // A tune-up roughly every third race-prep week.
      isTuneupWeek = racePrepCount % 3 === 1;
      racePrepCount++;
    }

    return buildWeek({
      week: wp,
      totalWeeks,
      raceType: input.raceType,
      goalTimeS: input.goalTimeS,
      raceDateISO: input.raceDateISO,
      daysPerWeek: input.daysPerWeek,
      longRunDow: input.longRunDow,
      restDow: input.restDow ?? null,
      includeTuneups: input.includeTuneups,
      easy: easyZones,
      quality,
      goalPaceSecPerKm: goalPace,
      isRaceWeek,
      isTuneupWeek,
    });
  });

  const totalDistanceKm = weeks.reduce(
    (a, w) => a + w.workouts.reduce((b, d) => b + d.distanceKm, 0),
    0,
  );

  return {
    name: input.name?.trim() || `Sub-${RACE_LABEL[input.raceType]} plan`,
    raceType: input.raceType,
    goalTimeS: input.goalTimeS,
    raceDateISO: input.raceDateISO,
    totalWeeks,
    currentVdot,
    goalVdot,
    goalPaceSecPerKm: goalPace,
    feasibility,
    zones: { current: easyZones, goal: paceZones(goalVdot) },
    weeks,
    summary: {
      peakVolumeKm: Math.max(...weeks.map((w) => w.plannedVolumeKm)),
      totalDistanceKm: Math.round(totalDistanceKm),
      startVolumeKm: input.startVolumeKm,
    },
  };
}

export { RACE_LABEL };
