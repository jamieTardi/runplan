import { describe, expect, it } from "vitest";
import {
  CROSS_CONVERTIBLE,
  estimatedRunDurationMin,
  isCrossConvertible,
  restoredFields,
  toCrossTraining,
  type CrossSource,
} from "../crossTrain";
import { workoutTypes } from "@/db/schema";

function run(over: Partial<CrossSource> = {}): CrossSource {
  return {
    type: "easy",
    distanceKm: 10,
    paceLowSPerKm: 330,
    paceHighSPerKm: 390,
    segments: null,
    description: "Easy run",
    ...over,
  };
}

describe("convertibility", () => {
  it("covers every run type and nothing that isn't a run", () => {
    for (const t of workoutTypes) {
      const expected = !["rest", "race", "strength", "cross_train"].includes(t);
      expect(isCrossConvertible(t), t).toBe(expected);
    }
    expect(CROSS_CONVERTIBLE.size).toBe(workoutTypes.length - 4);
  });
});

describe("estimatedRunDurationMin", () => {
  it("uses the midpoint pace, rounded to 5 minutes", () => {
    // 10 km at 6:00/km midpoint = 60 min.
    expect(estimatedRunDurationMin(run())).toBe(60);
  });

  it("falls back to a sane pace when the run has none", () => {
    const min = estimatedRunDurationMin(run({ paceLowSPerKm: null, paceHighSPerKm: null }));
    expect(min).toBe(60); // 10 km × 6:00/km fallback
  });

  it("clamps to a sensible session length", () => {
    expect(estimatedRunDurationMin(run({ distanceKm: 1 }))).toBe(20);
    expect(estimatedRunDurationMin(run({ distanceKm: 60 }))).toBe(180);
  });
});

describe("toCrossTraining", () => {
  it("produces a timed, unpaced, zero-distance session with a restore snapshot", () => {
    const original = run();
    const c = toCrossTraining(original, "bike", "Easy");
    expect(c.type).toBe("cross_train");
    expect(c.crossActivity).toBe("bike");
    expect(c.plannedDurationS).toBe(60 * 60);
    expect(c.distanceKm).toBe(0);
    expect(c.paceLowSPerKm).toBeNull();
    expect(c.paceHighSPerKm).toBeNull();
    expect(c.replacedFrom).toEqual(original);
    expect(c.description).toContain("Bike 60 min");
    expect(c.description).toContain("like-for-like");
  });

  it("steady runs become one continuous effort segment", () => {
    const c = toCrossTraining(run({ type: "long", distanceKm: 30 }), "bike", "Long run");
    expect(c.segments).toHaveLength(1);
    expect(c.segments[0].kind).toBe("steady");
    expect(c.segments[0].label).toContain("180 min");
  });

  it("threshold runs become warm-up + threshold blocks + cool-down", () => {
    const c = toCrossTraining(run({ type: "threshold" }), "bike", "Threshold");
    expect(c.segments.map((s) => s.kind)).toEqual(["warmup", "reps", "cooldown"]);
    expect(c.segments[1].label).toContain("threshold effort");
  });

  it("VO2 runs become hard/easy repeats that fit the time available", () => {
    const c = toCrossTraining(run({ type: "vo2", distanceKm: 8 }), "bike", "VO₂max intervals");
    // 8 km ≈ 48 min → main ≈ 23 min → 4 reps of 3/3.
    const reps = c.segments.find((s) => s.kind === "reps")!;
    expect(reps.label).toMatch(/^4 × 3 min hard/);
  });

  it("wording follows the chosen activity", () => {
    const c = toCrossTraining(run(), "swim", "Easy");
    expect(c.description).toContain("Swim");
    expect(c.segments[0].label).toContain("swimming");
  });
});

describe("restoredFields", () => {
  it("round-trips the original run exactly", () => {
    const original = run({
      type: "threshold",
      segments: [{ kind: "reps", label: "20 min @ threshold" }],
      description: "Tempo day",
    });
    const c = toCrossTraining(original, "elliptical", "Threshold");
    const restored = restoredFields(c.replacedFrom)!;
    expect(restored.type).toBe("threshold");
    expect(restored.distanceKm).toBe(original.distanceKm);
    expect(restored.paceLowSPerKm).toBe(original.paceLowSPerKm);
    expect(restored.paceHighSPerKm).toBe(original.paceHighSPerKm);
    expect(restored.segments).toEqual(original.segments);
    expect(restored.description).toBe("Tempo day");
    // And the cross fields are wiped.
    expect(restored.crossActivity).toBeNull();
    expect(restored.plannedDurationS).toBeNull();
    expect(restored.replacedFrom).toBeNull();
  });

  it("rejects missing or malformed snapshots", () => {
    expect(restoredFields(null)).toBeNull();
    expect(restoredFields("nope")).toBeNull();
    expect(restoredFields({ distanceKm: 10 })).toBeNull();
  });
});
