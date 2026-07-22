import { describe, expect, it } from "vitest";
import { buildWorkoutSteps, type FitStepPlan, type FitWorkoutInput } from "../steps";
import { paceZones } from "@/lib/plan/vdot";

// VDOT ≈ sub-3 marathon fitness; realistic zone spread.
const zones = paceZones(53.5);

function workout(over: Partial<FitWorkoutInput>): FitWorkoutInput {
  return {
    type: "easy",
    distanceKm: 12,
    paceLowSPerKm: 297,
    paceHighSPerKm: 329,
    segments: null,
    description: "Easy run",
    ...over,
  };
}

function steps(items: ReturnType<typeof buildWorkoutSteps>): FitStepPlan[] {
  return (items ?? []).filter((i): i is FitStepPlan => i.kind === "step");
}

describe("buildWorkoutSteps", () => {
  it("rest days export nothing", () => {
    expect(buildWorkoutSteps(workout({ type: "rest", distanceKm: 0 }), zones)).toBeNull();
  });

  it("an easy run is a single paced distance step", () => {
    const items = buildWorkoutSteps(workout({}), zones)!;
    expect(items).toHaveLength(1);
    const s = items[0] as FitStepPlan;
    expect(s.durationM).toBe(12_000);
    expect(s.paceFastSPerKm).toBeLessThanOrEqual(297);
    expect(s.paceSlowSPerKm).toBeGreaterThanOrEqual(329);
  });

  it("a VO2 session becomes warm-up, repeat block and cool-down", () => {
    const items = buildWorkoutSteps(
      workout({
        type: "vo2",
        distanceKm: 11,
        paceLowSPerKm: 223,
        paceHighSPerKm: 223,
        segments: [
          { kind: "warmup", label: "warm-up 3 km easy" },
          { kind: "reps", label: "5 × 1000m @ interval pace, 2:30 jog recovery" },
          { kind: "cooldown", label: "cool-down 2 km easy" },
        ],
      }),
      zones,
    )!;
    // warmup, work, recovery, repeat, cooldown
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({ intensity: "warmup", durationM: 3000 });
    expect(items[1]).toMatchObject({ intensity: "active", durationM: 1000 });
    expect(items[2]).toMatchObject({ intensity: "recovery", durationS: 150 });
    expect(items[3]).toMatchObject({ kind: "repeat", fromIndex: 1, count: 5 });
    expect(items[4]).toMatchObject({ intensity: "cooldown", durationM: 2000 });
    // interval pace 223 exactly on both bounds gets widened into a usable band
    const work = items[1] as FitStepPlan;
    expect(work.paceFastSPerKm!).toBeLessThan(223);
    expect(work.paceSlowSPerKm!).toBeGreaterThan(223);
  });

  it("time-based threshold reps parse minutes and jog minutes", () => {
    const items = buildWorkoutSteps(
      workout({
        type: "threshold",
        paceLowSPerKm: 246,
        paceHighSPerKm: 246,
        segments: [
          { kind: "warmup", label: "warm-up 3 km easy" },
          { kind: "reps", label: "2 × 15 min @ threshold, 3 min jog recovery" },
          { kind: "cooldown", label: "cool-down 2 km easy" },
        ],
      }),
      zones,
    )!;
    expect(items[1]).toMatchObject({ durationS: 900 });
    expect(items[2]).toMatchObject({ durationS: 180 });
    expect(items[3]).toMatchObject({ kind: "repeat", count: 2 });
  });

  it("the taper sharpener gets bracketed with lap-press warm-up/cool-down", () => {
    const items = buildWorkoutSteps(
      workout({
        type: "marathon_pace",
        distanceKm: 8,
        paceLowSPerKm: 256,
        paceHighSPerKm: 256,
        segments: [{ kind: "steady", label: "3 × 1600m @ marathon pace, 90s jog" }],
      }),
      zones,
    )!;
    const first = items[0] as FitStepPlan;
    const last = items[items.length - 1] as FitStepPlan;
    expect(first.intensity).toBe("warmup");
    expect(first.durationM).toBeUndefined(); // lap press
    expect(last.intensity).toBe("cooldown");
    // repeat indices were shifted by the unshifted warm-up
    const repeat = items.find((i) => i.kind === "repeat")!;
    expect(repeat).toMatchObject({ fromIndex: 1, count: 3 });
    expect(items[1]).toMatchObject({ durationM: 1600 });
    expect(items[2]).toMatchObject({ durationS: 90 });
  });

  it("a long run with an MP finish splits easy and MP portions", () => {
    const items = buildWorkoutSteps(
      workout({
        type: "long",
        distanceKm: 30,
        paceLowSPerKm: 256,
        paceHighSPerKm: 329,
        segments: [{ kind: "steady", label: "final 12 km @ marathon pace" }],
      }),
      zones,
    )!;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ durationM: 18_000 });
    const mp = items[1] as FitStepPlan;
    expect(mp.durationM).toBe(12_000);
    // MP block targets marathon pace, not the whole-session band
    expect(mp.paceFastSPerKm!).toBeLessThanOrEqual(Math.round(zones.marathon));
    expect(mp.paceSlowSPerKm!).toBeGreaterThanOrEqual(Math.round(zones.marathon));
  });

  it("strides ride at the end of the main run", () => {
    const items = buildWorkoutSteps(
      workout({
        type: "general_aerobic",
        distanceKm: 10,
        segments: [{ kind: "strides", label: "6 × 20s strides @ rep effort" }],
      }),
      zones,
    )!;
    expect(items[0]).toMatchObject({ durationM: 10_000 });
    expect(items[1]).toMatchObject({ durationS: 20 });
    expect(items[3]).toMatchObject({ kind: "repeat", fromIndex: 1, count: 6 });
    // easy run with strides is NOT bracketed with extra warm-up
    expect(steps(items).filter((s) => s.intensity === "warmup")).toHaveLength(0);
  });

  it("a continuous tempo is a time step at threshold", () => {
    const items = buildWorkoutSteps(
      workout({
        type: "threshold",
        paceLowSPerKm: 246,
        paceHighSPerKm: 246,
        segments: [
          { kind: "warmup", label: "warm-up 3 km easy" },
          { kind: "steady", label: "40 min continuous @ threshold" },
          { kind: "cooldown", label: "cool-down 2 km easy" },
        ],
      }),
      zones,
    )!;
    expect(items[1]).toMatchObject({ durationS: 2400, intensity: "active" });
  });

  it("an unparseable segment falls back to a single main step", () => {
    const items = buildWorkoutSteps(
      workout({ segments: [{ kind: "strides", label: "something novel" }] }),
      zones,
    )!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ durationM: 12_000 });
  });
});
