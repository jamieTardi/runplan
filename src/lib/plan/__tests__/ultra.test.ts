import { describe, expect, it } from "vitest";
import { generatePlan } from "../generatePlan";
import { longCapKm } from "../buildWeek";
import { performanceVdot, raceDistanceM, RACE_DISTANCES_M } from "../vdot";
import { goalPaceSecPerKm, goalVdot } from "../goal";
import { addDaysISO } from "../dates";
import type { GenerateInput } from "../types";

const TODAY = "2026-01-05"; // a Monday
const RACE = addDaysISO(TODAY, 17 * 7 + 6); // 18 weeks out, Sunday

function ultraInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    raceType: "50k",
    goalTimeS: 4 * 3600 + 30 * 60,
    raceDateISO: RACE,
    todayISO: TODAY,
    currentFitness: { mode: "race", raceType: "marathon", timeS: 3 * 3600 + 15 * 60 },
    startVolumeKm: 70,
    peakVolumeKm: 110,
    daysPerWeek: 6,
    longRunDow: 7,
    includeTuneups: true,
    ...overrides,
  };
}

describe("race distances", () => {
  it("resolves the new fixed distances", () => {
    expect(raceDistanceM("50k")).toBe(50000);
    expect(raceDistanceM("100k")).toBe(100000);
    expect(raceDistanceM("100mi")).toBe(160934);
  });

  it("resolves a custom distance from km and rejects a missing one", () => {
    expect(raceDistanceM("custom", 58)).toBe(58000);
    expect(() => raceDistanceM("custom")).toThrow();
    expect(() => raceDistanceM("custom", 0)).toThrow();
  });
});

describe("ultra VDOT (Riegel bridge)", () => {
  it("matches Daniels exactly at marathon and below", () => {
    expect(performanceVdot(5000, 1197)).toBeCloseTo(50, 0);
    expect(performanceVdot(RACE_DISTANCES_M.marathon, 3 * 3600)).toBeCloseTo(
      goalVdot("marathon", 3 * 3600),
      6,
    );
  });

  it("scores physiologically-equivalent ultra performances consistently", () => {
    // A 3:00 marathoner ≈ 3:36 over 50K by Riegel — the two should score the same VDOT.
    const marathonVdot = performanceVdot(RACE_DISTANCES_M.marathon, 3 * 3600);
    const riegel50kS = 3 * 3600 * Math.pow(50000 / 42195, 1.06);
    expect(performanceVdot(50000, riegel50kS)).toBeCloseTo(marathonVdot, 4);
  });

  it("a faster 100K scores a higher VDOT", () => {
    expect(performanceVdot(100000, 9 * 3600)).toBeGreaterThan(performanceVdot(100000, 12 * 3600));
  });

  it("handles 100-mile finish times beyond 24 h", () => {
    const v = goalVdot("100mi", 28 * 3600);
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(60);
    // And a faster finish scores higher.
    expect(goalVdot("100mi", 20 * 3600)).toBeGreaterThan(v);
  });
});

describe("goal pace for custom distances", () => {
  it("is definitional: time over distance", () => {
    // 58 km in 5:48 = exactly 6:00/km.
    expect(goalPaceSecPerKm("custom", 348 * 60, 58)).toBeCloseTo(360, 6);
  });
});

describe("long-run cap", () => {
  it("keeps the published caps at the anchor distances", () => {
    expect(longCapKm(5)).toBe(16);
    expect(longCapKm(10)).toBe(22);
    expect(longCapKm(42.195)).toBe(37);
    expect(longCapKm(160.934)).toBe(48);
  });

  it("interpolates between anchors and clamps outside them", () => {
    const cap50k = longCapKm(50);
    expect(cap50k).toBeGreaterThan(37);
    expect(cap50k).toBeLessThan(45);
    expect(longCapKm(3)).toBe(16);
    expect(longCapKm(300)).toBe(48);
  });
});

describe("ultra plan generation", () => {
  it("builds a 50K plan with race day at 50 km", () => {
    const plan = generatePlan(ultraInput());
    const raceDay = plan.weeks.at(-1)!.workouts.find((w) => w.type === "race")!;
    expect(raceDay.distanceKm).toBeCloseTo(50, 1);
  });

  it("schedules back-to-back long runs the day before the long run", () => {
    const plan = generatePlan(ultraInput());
    const buildWeeks = plan.weeks.filter(
      (w) => w.phase !== "taper" && w.weekIndex < plan.totalWeeks - 1,
    );
    const b2b = buildWeeks.flatMap((w) =>
      w.workouts.filter((d) => d.description.startsWith("Back-to-back")),
    );
    expect(b2b.length).toBeGreaterThan(0);
    // The B2B run lands the day before the long run (long run is Sunday=7 → B2B Saturday=6).
    expect(new Set(b2b.map((d) => d.dow))).toEqual(new Set([6]));
  });

  it("does not schedule marathon-pace long-run segments for ultras", () => {
    const plan = generatePlan(ultraInput());
    const longs = plan.weeks.flatMap((w) => w.workouts.filter((d) => d.type === "long"));
    expect(longs.every((d) => !d.description.includes("marathon pace"))).toBe(true);
  });

  it("a marathon plan is unchanged: no back-to-back runs, MP long runs intact", () => {
    const plan = generatePlan(ultraInput({ raceType: "marathon", goalTimeS: 3 * 3600 }));
    const all = plan.weeks.flatMap((w) => w.workouts);
    expect(all.some((d) => d.description.startsWith("Back-to-back"))).toBe(false);
    expect(all.some((d) => d.description.includes("marathon pace"))).toBe(true);
  });

  it("builds a custom-distance plan end to end", () => {
    const plan = generatePlan(
      ultraInput({ raceType: "custom", customDistanceKm: 58, goalTimeS: 6 * 3600, name: undefined }),
    );
    expect(plan.name).toContain("58");
    const raceDay = plan.weeks.at(-1)!.workouts.find((w) => w.type === "race")!;
    expect(raceDay.distanceKm).toBeCloseTo(58, 1);
    expect(plan.goalPaceSecPerKm).toBeCloseTo((6 * 3600) / 58, 1);
  });
});
