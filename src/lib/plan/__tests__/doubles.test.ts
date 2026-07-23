import { describe, expect, it } from "vitest";
import { applyDoubles, pmShakeoutKm, MAX_DOUBLES_PER_WEEK } from "../doubles";
import { generatePlan } from "../generatePlan";
import { paceZones } from "../vdot";
import { addDaysISO } from "../dates";
import type { GenerateInput } from "../types";
import type { PlanWeek, PlanWorkout } from "../types";

const easy = paceZones(55);

function wk(
  workouts: Partial<PlanWorkout>[],
  over: Partial<PlanWeek> = {},
): PlanWeek {
  return {
    weekIndex: 4,
    phase: "lt",
    plannedVolumeKm: workouts.reduce((a, w) => a + (w.distanceKm ?? 0), 0),
    isCutback: false,
    startDateISO: "2026-08-03",
    workouts: workouts.map((w, i) => ({
      dow: w.dow ?? i + 1,
      dateISO: addDaysISO("2026-08-03", (w.dow ?? i + 1) - 1),
      type: w.type ?? "easy",
      distanceKm: w.distanceKm ?? 0,
      paceLowSPerKm: 300,
      paceHighSPerKm: 320,
      segments: null,
      description: "",
      ...w,
    })),
    ...over,
  };
}

// A believable 105 km LT week: Mon rest, big easy days, quality, ML, long.
const HIGH_VOLUME = wk([
  { dow: 1, type: "rest", distanceKm: 0 },
  { dow: 2, type: "threshold", distanceKm: 13 },
  { dow: 3, type: "general_aerobic", distanceKm: 18 },
  { dow: 4, type: "medium_long", distanceKm: 19 },
  { dow: 5, type: "easy", distanceKm: 17 },
  { dow: 6, type: "easy", distanceKm: 8 }, // day before long run: short
  { dow: 7, type: "long", distanceKm: 30 },
]);

const OPTS = { enabled: true, isRaceWeek: false, longRunDow: 7, easy };

describe("applyDoubles", () => {
  it("splits the biggest qualifying easy days into AM + PM", () => {
    const out = applyDoubles(HIGH_VOLUME, OPTS);
    const pms = out.workouts.filter((w) => w.session === "pm");
    expect(pms.length).toBe(2);
    // The two biggest easy/GA days: Wed 18 and Fri 17.
    expect(pms.map((p) => p.dow).sort()).toEqual([3, 5]);
    for (const pm of pms) {
      expect(pm.type).toBe("recovery");
      expect(pm.distanceKm).toBeGreaterThanOrEqual(4);
      expect(pm.distanceKm).toBeLessThanOrEqual(8);
    }
  });

  it("keeps each day's and the week's volume unchanged", () => {
    const out = applyDoubles(HIGH_VOLUME, OPTS);
    const total = out.workouts.reduce((a, w) => a + w.distanceKm, 0);
    expect(total).toBe(HIGH_VOLUME.plannedVolumeKm);
    for (const dow of [3, 5]) {
      const day = out.workouts.filter((w) => w.dow === dow);
      expect(day.length).toBe(2);
      const orig = HIGH_VOLUME.workouts.find((w) => w.dow === dow)!;
      expect(day.reduce((a, w) => a + w.distanceKm, 0)).toBe(orig.distanceKm);
    }
  });

  it("never touches the long run, medium-long, quality or day-before-long days", () => {
    const out = applyDoubles(HIGH_VOLUME, OPTS);
    for (const dow of [2, 4, 6, 7]) {
      expect(out.workouts.filter((w) => w.dow === dow).length).toBe(1);
    }
  });

  it("does nothing when disabled, on cutback, taper or race weeks", () => {
    expect(applyDoubles(HIGH_VOLUME, { ...OPTS, enabled: false })).toBe(HIGH_VOLUME);
    expect(applyDoubles(wk(HIGH_VOLUME.workouts, { isCutback: true }), OPTS).workouts.every((w) => w.session !== "pm")).toBe(true);
    expect(applyDoubles(wk(HIGH_VOLUME.workouts, { phase: "taper" }), OPTS).workouts.every((w) => w.session !== "pm")).toBe(true);
    expect(applyDoubles(HIGH_VOLUME, { ...OPTS, isRaceWeek: true })).toBe(HIGH_VOLUME);
  });

  it("does nothing for moderate-volume weeks", () => {
    const moderate = wk([
      { dow: 1, type: "rest", distanceKm: 0 },
      { dow: 2, type: "threshold", distanceKm: 10 },
      { dow: 3, type: "general_aerobic", distanceKm: 11 },
      { dow: 5, type: "easy", distanceKm: 10 },
      { dow: 7, type: "long", distanceKm: 22 },
    ]);
    expect(applyDoubles(moderate, OPTS)).toBe(moderate);
  });

  it("caps at MAX_DOUBLES_PER_WEEK even with many huge days", () => {
    const monster = wk([
      { dow: 2, type: "easy", distanceKm: 18 },
      { dow: 3, type: "easy", distanceKm: 18 },
      { dow: 4, type: "easy", distanceKm: 18 },
      { dow: 5, type: "easy", distanceKm: 18 },
      { dow: 7, type: "long", distanceKm: 34 },
    ]);
    const out = applyDoubles(monster, OPTS);
    expect(out.workouts.filter((w) => w.session === "pm").length).toBe(MAX_DOUBLES_PER_WEEK);
  });

  it("pm shakeouts stay 4-8 km", () => {
    expect(pmShakeoutKm(13)).toBe(4);
    expect(pmShakeoutKm(17)).toBe(5);
    expect(pmShakeoutKm(30)).toBe(8);
  });
});

describe("generatePlan with allowDoubles", () => {
  const TODAY = "2026-01-05"; // Monday
  const input: GenerateInput = {
    raceType: "marathon",
    goalTimeS: 3 * 3600,
    raceDateISO: addDaysISO(TODAY, 17 * 7 + 6),
    todayISO: TODAY,
    currentFitness: { mode: "estimate", weeklyKm: 80, easyPaceSecPerKm: 310 },
    startVolumeKm: 80,
    peakVolumeKm: 110,
    daysPerWeek: 6,
    longRunDow: 7,
    restDow: 1,
    includeTuneups: true,
    allowDoubles: true,
  };

  it("adds pm runs to high-volume build weeks only", () => {
    const plan = generatePlan(input);
    const pmWeeks = plan.weeks.filter((w) => w.workouts.some((d) => d.session === "pm"));
    expect(pmWeeks.length).toBeGreaterThan(0);
    for (const w of pmWeeks) {
      expect(w.phase).not.toBe("taper");
      expect(w.isCutback).toBe(false);
      // volume unchanged by splitting
      const total = w.workouts.reduce((a, d) => a + d.distanceKm, 0);
      const single = generatePlan({ ...input, allowDoubles: false }).weeks.find(
        (x) => x.weekIndex === w.weekIndex,
      )!;
      expect(total).toBeCloseTo(single.workouts.reduce((a, d) => a + d.distanceKm, 0), 5);
    }
  });

  it("is off by default", () => {
    const plan = generatePlan({ ...input, allowDoubles: undefined });
    expect(plan.weeks.every((w) => w.workouts.every((d) => d.session !== "pm"))).toBe(true);
  });
});
