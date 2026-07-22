import { describe, expect, it } from "vitest";
import { buildWorkoutSteps } from "@/lib/fit/steps";
import { paceZones } from "@/lib/plan/vdot";
import { toGarminWorkout } from "../workoutDto";

const zones = paceZones(53.5);

describe("toGarminWorkout", () => {
  it("a plain easy run becomes one distance step with a pace band", () => {
    const items = buildWorkoutSteps(
      {
        type: "easy",
        distanceKm: 12,
        paceLowSPerKm: 297,
        paceHighSPerKm: 329,
        segments: null,
        description: "Easy run",
      },
      zones,
    )!;
    const wk = toGarminWorkout("Easy 12k — RunPlan", items);
    expect(wk.sportType.sportTypeKey).toBe("running");
    const steps = wk.workoutSegments[0].workoutSteps;
    expect(steps).toHaveLength(1);
    const s = steps[0];
    if (s.type !== "ExecutableStepDTO") throw new Error("expected executable step");
    expect(s.stepOrder).toBe(1);
    expect(s.endCondition.conditionTypeKey).toBe("distance");
    expect(s.endConditionValue).toBe(12_000);
    expect(s.targetType.workoutTargetTypeKey).toBe("pace.zone");
    // speeds in m/s: targetValueOne = slow bound < targetValueTwo = fast bound
    expect(s.targetValueOne!).toBeLessThan(s.targetValueTwo!);
    expect(s.targetValueOne!).toBeCloseTo(1000 / 329, 1);
  });

  it("a race-pace interval long run nests the loop into a RepeatGroupDTO", () => {
    const items = buildWorkoutSteps(
      {
        type: "long",
        distanceKm: 26,
        paceLowSPerKm: 245,
        paceHighSPerKm: 307,
        segments: [
          { kind: "steady", label: "13 km easy" },
          { kind: "reps", label: "3 × 3 km @ race pace, 1 km easy between" },
          { kind: "steady", label: "2 km easy to finish" },
        ],
        description: "Long run with 3 × 3 km @ race pace",
      },
      zones,
    )!;
    const steps = toGarminWorkout("Long run 26k — RunPlan", items).workoutSegments[0].workoutSteps;
    // lead-in, repeat group, finish
    expect(steps.map((s) => s.type)).toEqual([
      "ExecutableStepDTO",
      "RepeatGroupDTO",
      "ExecutableStepDTO",
    ]);
    const group = steps[1];
    if (group.type !== "RepeatGroupDTO") throw new Error("expected repeat group");
    expect(group.numberOfIterations).toBe(3);
    expect(group.workoutSteps).toHaveLength(2);
    const [work, recover] = group.workoutSteps;
    expect(work.stepType.stepTypeKey).toBe("interval");
    expect(work.endConditionValue).toBe(3_000);
    expect(recover.stepType.stepTypeKey).toBe("recovery");
    expect(recover.endCondition.conditionTypeKey).toBe("distance");
    expect(recover.endConditionValue).toBe(1_000);
    // document-order numbering: lead 1, group 2, its children 3+4, finish 5
    expect(steps[0].stepOrder).toBe(1);
    expect(group.stepOrder).toBe(2);
    expect(work.stepOrder).toBe(3);
    expect(recover.stepOrder).toBe(4);
    expect(steps[2].stepOrder).toBe(5);
    // nested steps are tagged as children
    expect(group.childStepId).toBe(1);
    expect(work.childStepId).toBe(1);
    // work reps target race pace (245 s/km ≈ 4.08 m/s) in a padded band
    expect(work.targetValueTwo!).toBeGreaterThan(1000 / 245);
    expect(work.targetValueOne!).toBeLessThan(1000 / 245);
  });

  it("a VO2 session keeps warm-up and cool-down outside the repeat", () => {
    const items = buildWorkoutSteps(
      {
        type: "vo2",
        distanceKm: 11,
        paceLowSPerKm: 223,
        paceHighSPerKm: 223,
        segments: [
          { kind: "warmup", label: "warm-up 3 km easy" },
          { kind: "reps", label: "5 × 1000m @ interval pace, 2:30 jog recovery" },
          { kind: "cooldown", label: "cool-down 2 km easy" },
        ],
        description: "VO₂max intervals",
      },
      zones,
    )!;
    const steps = toGarminWorkout("VO2 11k — RunPlan", items).workoutSegments[0].workoutSteps;
    expect(steps).toHaveLength(3);
    expect(steps[0].stepType.stepTypeKey).toBe("warmup");
    expect(steps[2].stepType.stepTypeKey).toBe("cooldown");
    const group = steps[1];
    if (group.type !== "RepeatGroupDTO") throw new Error("expected repeat group");
    expect(group.numberOfIterations).toBe(5);
    // time-based jog recovery
    expect(group.workoutSteps[1].endCondition.conditionTypeKey).toBe("time");
    expect(group.workoutSteps[1].endConditionValue).toBe(150);
  });

  it("lap-press steps carry no end-condition value", () => {
    const items = buildWorkoutSteps(
      {
        type: "marathon_pace",
        distanceKm: 8,
        paceLowSPerKm: 256,
        paceHighSPerKm: 256,
        segments: [{ kind: "steady", label: "3 × 1600m @ marathon pace, 90s jog" }],
        description: "Sharpener",
      },
      zones,
    )!;
    const steps = toGarminWorkout("Sharpener — RunPlan", items).workoutSegments[0].workoutSteps;
    // bracketed with lap-press warm-up/cool-down by the FIT step builder
    const first = steps[0];
    if (first.type !== "ExecutableStepDTO") throw new Error("expected executable step");
    expect(first.stepType.stepTypeKey).toBe("warmup");
    expect(first.endCondition.conditionTypeKey).toBe("lap.button");
    expect(first.endConditionValue).toBeNull();
  });
});
