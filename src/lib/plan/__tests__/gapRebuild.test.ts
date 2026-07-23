import { describe, expect, it } from "vitest";
import { gapSeverity, rebuildVolumes, stripQualityForReturn } from "../gapRebuild";
import { paceZones } from "../vdot";
import type { PlanWorkout } from "../types";
import type { WeekVolumeIn } from "../gapRebuild";

describe("gapSeverity", () => {
  it("barely reacts to a couple of missed days", () => {
    const s = gapSeverity(2, "life");
    expect(s.resumeFactor).toBe(1);
    expect(s.easyWeeks).toBe(0);
  });

  it("scales down with gap length", () => {
    const factors = [2, 5, 10, 20, 40].map((d) => gapSeverity(d, "life").resumeFactor);
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }
    expect(factors[4]).toBeLessThanOrEqual(0.5);
  });

  it("is more cautious after injury than life", () => {
    for (const d of [5, 10, 20, 40]) {
      const injury = gapSeverity(d, "injury");
      const life = gapSeverity(d, "life");
      expect(injury.resumeFactor).toBeLessThanOrEqual(life.resumeFactor);
      expect(injury.easyWeeks).toBeGreaterThanOrEqual(life.easyWeeks);
      expect(injury.growthCap).toBeLessThanOrEqual(life.growthCap);
    }
  });

  it("always adds at least one easy week for a week-plus gap", () => {
    for (const d of [7, 14, 30]) {
      expect(gapSeverity(d, "life").easyWeeks).toBeGreaterThanOrEqual(1);
      expect(gapSeverity(d, "injury").easyWeeks).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("rebuildVolumes", () => {
  const build = (vols: number[], cutbacks: number[] = []): WeekVolumeIn[] =>
    vols.map((v, i) => ({
      phase: "lt" as const,
      plannedVolumeKm: v,
      isCutback: cutbacks.includes(i),
    }));

  it("resumes at the resume volume and never exceeds original plans", () => {
    const future = build([60, 62, 64, 66]);
    const out = rebuildVolumes(future, 35, 1.1);
    expect(out[0]).toBe(35);
    out.forEach((v, i) => expect(v).toBeLessThanOrEqual(future[i].plannedVolumeKm));
  });

  it("caps week-over-week growth", () => {
    const out = rebuildVolumes(build([80, 80, 80, 80, 80, 80]), 40, 1.1);
    for (let i = 1; i < out.length; i++) {
      expect(out[i] / out[i - 1]).toBeLessThanOrEqual(1.101);
    }
  });

  it("converges back to the original plan when there is room", () => {
    const out = rebuildVolumes(build([50, 52, 54, 56, 58, 60, 62, 64]), 45, 1.12);
    expect(out[out.length - 1]).toBe(64);
  });

  it("keeps cutback weeks below the running baseline and does not raise it", () => {
    const future = build([60, 50, 66, 70], [1]);
    const out = rebuildVolumes(future, 40, 1.1);
    expect(out[1]).toBeLessThan(out[0]);
    // Week after the cutback grows from the pre-cutback baseline (40), not from the dip.
    expect(out[2]).toBeCloseTo(44, 0);
  });

  it("never spikes a taper: takes the lower of original and growth path", () => {
    const future: WeekVolumeIn[] = [
      { phase: "taper", plannedVolumeKm: 45, isCutback: false },
      { phase: "taper", plannedVolumeKm: 35, isCutback: false },
      { phase: "taper", plannedVolumeKm: 24, isCutback: false },
    ];
    const out = rebuildVolumes(future, 30, 1.1);
    expect(out[0]).toBe(30);
    expect(out[1]).toBeLessThanOrEqual(33);
    expect(out[2]).toBeLessThanOrEqual(24);
  });

  it("a full-fitness resume reproduces the original volumes", () => {
    const future = build([50, 52, 54]);
    expect(rebuildVolumes(future, 60, 1.2)).toEqual([50, 52, 54]);
  });
});

describe("stripQualityForReturn", () => {
  const easy = paceZones(50);
  const wk = (type: PlanWorkout["type"], distanceKm: number): PlanWorkout => ({
    dow: 2,
    dateISO: "2026-08-04",
    type,
    distanceKm,
    paceLowSPerKm: 240,
    paceHighSPerKm: 250,
    segments: [{ kind: "reps", label: "5 × 1 km" }],
    description: "quality",
  });

  it("converts quality sessions to easy runs with easy paces", () => {
    for (const t of ["threshold", "vo2", "intervals", "marathon_pace", "strides"] as const) {
      const [out] = stripQualityForReturn([wk(t, 10)], easy);
      expect(out.type).toBe("easy");
      expect(out.segments).toBeNull();
      expect(out.paceLowSPerKm).toBe(Math.round(easy.easyFast));
      expect(out.paceHighSPerKm).toBe(Math.round(easy.easySlow));
      expect(out.distanceKm).toBe(10);
    }
  });

  it("trims long runs but keeps their type", () => {
    const [out] = stripQualityForReturn([wk("long", 20)], easy);
    expect(out.type).toBe("long");
    expect(out.distanceKm).toBe(15);
  });

  it("leaves easy, recovery, rest and race days untouched", () => {
    for (const t of ["easy", "recovery", "rest", "race", "general_aerobic"] as const) {
      const [out] = stripQualityForReturn([wk(t, 8)], easy);
      expect(out.type).toBe(t);
      expect(out.distanceKm).toBe(8);
    }
  });
});
