// Pure translation of planned FIT steps into Garmin Connect's
// workout-service JSON model. No I/O, unit-tested.
//
// The input is the same FitPlanItem list the .FIT export uses
// (src/lib/fit/steps.ts), so anything the watch file can express, the
// Connect workout can too. Repeats arrive flat ({fromIndex, count} looping
// back over already-emitted steps) and are re-nested into RepeatGroupDTOs,
// which is how the workout-service models loops.

import type { FitPlanItem, FitStepPlan } from "@/lib/fit/steps";

const RUNNING = { sportTypeId: 1, sportTypeKey: "running" } as const;

const STEP_TYPE: Record<FitStepPlan["intensity"], { stepTypeId: number; stepTypeKey: string }> = {
  warmup: { stepTypeId: 1, stepTypeKey: "warmup" },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown" },
  active: { stepTypeId: 3, stepTypeKey: "interval" },
  recovery: { stepTypeId: 4, stepTypeKey: "recovery" },
  rest: { stepTypeId: 5, stepTypeKey: "rest" },
};

interface GarminExecutableStep {
  type: "ExecutableStepDTO";
  stepId: null;
  stepOrder: number;
  childStepId: number | null;
  stepType: { stepTypeId: number; stepTypeKey: string };
  description: string | null;
  endCondition: { conditionTypeId: number; conditionTypeKey: string };
  endConditionValue: number | null;
  targetType: { workoutTargetTypeId: number; workoutTargetTypeKey: string };
  targetValueOne: number | null;
  targetValueTwo: number | null;
}

interface GarminRepeatGroup {
  type: "RepeatGroupDTO";
  stepId: null;
  stepOrder: number;
  childStepId: number;
  stepType: { stepTypeId: 6; stepTypeKey: "repeat" };
  numberOfIterations: number;
  smartRepeat: false;
  endCondition: { conditionTypeId: 7; conditionTypeKey: "iterations" };
  endConditionValue: number;
  workoutSteps: GarminExecutableStep[];
}

export type GarminWorkoutStep = GarminExecutableStep | GarminRepeatGroup;

export interface GarminWorkoutPayload {
  workoutName: string;
  description: string | null;
  sportType: typeof RUNNING;
  workoutSegments: {
    segmentOrder: number;
    sportType: typeof RUNNING;
    workoutSteps: GarminWorkoutStep[];
  }[];
}

/** Pace bounds (sec/km) → Garmin speed targets (m/s); one = slow bound, two = fast. */
function execStep(s: FitStepPlan): GarminExecutableStep {
  const endCondition =
    s.durationM != null
      ? { conditionTypeId: 3, conditionTypeKey: "distance" }
      : s.durationS != null
        ? { conditionTypeId: 2, conditionTypeKey: "time" }
        : { conditionTypeId: 1, conditionTypeKey: "lap.button" };
  const paced = s.paceFastSPerKm != null && s.paceSlowSPerKm != null;
  return {
    type: "ExecutableStepDTO",
    stepId: null,
    stepOrder: 0, // renumbered once the tree is final
    childStepId: null,
    stepType: STEP_TYPE[s.intensity],
    description: s.name ? s.name.slice(0, 512) : null,
    endCondition,
    endConditionValue: s.durationM ?? s.durationS ?? null,
    targetType: paced
      ? { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone" }
      : { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" },
    targetValueOne: paced ? 1000 / s.paceSlowSPerKm! : null,
    targetValueTwo: paced ? 1000 / s.paceFastSPerKm! : null,
  };
}

export function toGarminWorkout(name: string, items: FitPlanItem[]): GarminWorkoutPayload {
  const steps: GarminWorkoutStep[] = [];
  // Where each flat step landed in `steps`, recorded at append time — repeats
  // always wrap a contiguous, still-unconsumed tail, so the position is stable.
  const flatPos: number[] = [];

  for (const item of items) {
    if (item.kind === "step") {
      flatPos.push(steps.length);
      steps.push(execStep(item));
      continue;
    }
    const body = steps.splice(flatPos[item.fromIndex]) as GarminExecutableStep[];
    for (const b of body) b.childStepId = 1;
    steps.push({
      type: "RepeatGroupDTO",
      stepId: null,
      stepOrder: 0,
      childStepId: 1,
      stepType: { stepTypeId: 6, stepTypeKey: "repeat" },
      numberOfIterations: item.count,
      smartRepeat: false,
      endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
      endConditionValue: item.count,
      workoutSteps: body,
    });
    flatPos.push(-1); // the repeat marker itself is not a referenceable step
  }

  // stepOrder is document order: a group counts, then its children.
  let order = 1;
  for (const s of steps) {
    s.stepOrder = order++;
    if (s.type === "RepeatGroupDTO") for (const c of s.workoutSteps) c.stepOrder = order++;
  }

  return {
    workoutName: name.slice(0, 100),
    description: null,
    sportType: RUNNING,
    workoutSegments: [{ segmentOrder: 1, sportType: RUNNING, workoutSteps: steps }],
  };
}
