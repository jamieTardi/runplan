import { describe, expect, it } from "vitest";
import { generatePlan } from "../generatePlan";
import { raceImpact, weekIndexForDate } from "../supportingRaces";
import { addDaysISO } from "../dates";
import { planInputSchema } from "../inputSchema";
import type { GenerateInput, PlanWorkout, SupportingRace } from "../types";

const TODAY = "2026-01-05"; // a Monday
const RACE = addDaysISO(TODAY, 17 * 7 + 6); // Sunday 2026-05-10 — the A race
const HALF = "2026-03-15"; // Sunday, ~10 weeks in — a B race
const TEN_K = "2026-02-08"; // Sunday, 5 weeks out — a C race

const RACES: SupportingRace[] = [
  { id: "b1", raceType: "half", dateISO: HALF, priority: "b", name: "Spring half" },
  { id: "c1", raceType: "10k", dateISO: TEN_K, priority: "c" },
];

const BASE: GenerateInput = {
  name: "Marathon build",
  raceType: "marathon",
  goalTimeS: 3 * 3600 + 30 * 60,
  raceDateISO: RACE,
  todayISO: TODAY,
  currentFitness: { mode: "race", raceType: "half", timeS: 100 * 60 },
  startVolumeKm: 45,
  peakVolumeKm: 80,
  daysPerWeek: 5,
  longRunDow: 7,
  includeTuneups: true,
};

const QUALITY = ["threshold", "vo2", "intervals", "marathon_pace", "long", "medium_long"];

function daysOn(plan: ReturnType<typeof generatePlan>, dateISO: string): PlanWorkout[] {
  return plan.weeks.flatMap((w) => w.workouts).filter((d) => d.dateISO === dateISO);
}

describe("race impact", () => {
  it("scales with priority and distance", () => {
    expect(raceImpact("b", 21.1)).toEqual({ taperDays: 3, recoveryDays: 3 });
    expect(raceImpact("b", 10)).toEqual({ taperDays: 2, recoveryDays: 2 });
    expect(raceImpact("b", 5)).toEqual({ taperDays: 2, recoveryDays: 1 });
    expect(raceImpact("c", 21.1)).toEqual({ taperDays: 1, recoveryDays: 2 });
    expect(raceImpact("c", 10)).toEqual({ taperDays: 1, recoveryDays: 1 });
    // A C race always costs less training than the same race at B priority.
    for (const km of [5, 10, 21.1, 42.195]) {
      const b = raceImpact("b", km);
      const c = raceImpact("c", km);
      expect(c.taperDays + c.recoveryDays).toBeLessThan(b.taperDays + b.recoveryDays);
    }
  });

  it("finds the training week a date belongs to", () => {
    const starts = [TODAY, addDaysISO(TODAY, 7), addDaysISO(TODAY, 14)];
    expect(weekIndexForDate(starts, TODAY)).toBe(0);
    expect(weekIndexForDate(starts, addDaysISO(TODAY, 6))).toBe(0);
    expect(weekIndexForDate(starts, addDaysISO(TODAY, 7))).toBe(1);
    expect(weekIndexForDate(starts, addDaysISO(TODAY, 40))).toBe(-1);
  });
});

describe("generatePlan with B and C races", () => {
  const plain = generatePlan(BASE);
  const plan = generatePlan({ ...BASE, races: RACES });

  it("leaves a plan without other races exactly as it was", () => {
    expect(generatePlan({ ...BASE, races: [] })).toEqual(plain);
  });

  it("puts each race on its date, as a single session at its real distance", () => {
    const half = daysOn(plan, HALF);
    expect(half).toHaveLength(1);
    expect(half[0].type).toBe("race");
    expect(half[0].distanceKm).toBeCloseTo(21.1, 1);
    expect(half[0].description).toContain("Spring half");
    expect(half[0].description).toContain("B race");

    const tenK = daysOn(plan, TEN_K).filter((d) => (d.session ?? "am") === "am");
    expect(tenK).toHaveLength(1);
    expect(tenK[0].type).toBe("race");
    expect(tenK[0].distanceKm).toBe(10);
    expect(tenK[0].description).toContain("C race");
    // Target pace comes from projected fitness: faster than marathon goal pace.
    expect(tenK[0].paceLowSPerKm).toBe(tenK[0].paceHighSPerKm);
    expect(tenK[0].paceLowSPerKm!).toBeLessThan(plan.goalPaceSecPerKm);
  });

  it("mini-tapers into a B race and recovers out of it", () => {
    for (const d of [1, 2, 3]) {
      const before = daysOn(plan, addDaysISO(HALF, -d));
      expect(before).toHaveLength(1);
      expect(["easy", "rest"]).toContain(before[0].type);
      expect(QUALITY).not.toContain(before[0].type);
    }
    // Day before: a short shakeout with strides.
    const eve = daysOn(plan, addDaysISO(HALF, -1))[0];
    if (eve.type !== "rest") {
      expect(eve.distanceKm).toBeLessThanOrEqual(5);
      expect(eve.segments?.[0].kind).toBe("strides");
    }
    // Day after a half: off. Then easy days only.
    expect(daysOn(plan, addDaysISO(HALF, 1))[0].type).toBe("rest");
    for (const d of [2, 3]) {
      expect(["recovery", "rest"]).toContain(daysOn(plan, addDaysISO(HALF, d))[0].type);
    }
    // And the week it lands in asks for less than the untouched ramp did.
    const wi = plan.weeks.findIndex((w) => w.workouts.some((d) => d.dateISO === HALF));
    expect(plan.weeks[wi].plannedVolumeKm).toBeLessThan(plain.weeks[wi].plannedVolumeKm);
    expect(plan.weeks[wi].isCutback).toBe(true);
  });

  it("keeps the long run's mileage when a C race lands on it", () => {
    // The 10K falls on a Sunday — the long-run day — so the difference stays
    // as easy running straight afterwards instead of vanishing from the week.
    const wasLong = plain.weeks
      .flatMap((w) => w.workouts)
      .find((d) => d.dateISO === TEN_K)!;
    expect(wasLong.type).toBe("long");
    const addOn = daysOn(plan, TEN_K).find((d) => d.session === "pm");
    expect(addOn).toBeDefined();
    expect(addOn!.type).toBe("easy");
    expect(addOn!.distanceKm).toBe(Math.round(wasLong.distanceKm - 10));
    // A B race is raced, not trained through — no add-on.
    expect(daysOn(plan, HALF).some((d) => d.session === "pm")).toBe(false);
  });

  it("runs a C race through, with one day either side", () => {
    expect(["easy", "rest"]).toContain(daysOn(plan, addDaysISO(TEN_K, -1))[0].type);
    expect(["recovery", "rest"]).toContain(daysOn(plan, addDaysISO(TEN_K, 1))[0].type);
    // Two days out is still normal training — a C race costs one day, not three.
    const wi = plan.weeks.findIndex((w) => w.workouts.some((d) => d.dateISO === TEN_K));
    const week = plan.weeks[wi];
    expect(week.workouts.some((d) => QUALITY.includes(d.type))).toBe(true);
  });

  it("keeps the goal race and its week intact", () => {
    const raceDay = daysOn(plan, RACE);
    expect(raceDay).toHaveLength(1);
    expect(raceDay[0].type).toBe("race");
    expect(raceDay[0].description).toContain("RACE DAY");
    expect(plan.weeks.at(-1)!.workouts).toEqual(plain.weeks.at(-1)!.workouts);
  });

  it("does not invent a tune-up in a week that already has a race", () => {
    for (const week of plan.weeks) {
      const races = week.workouts.filter((d) => d.type === "race");
      expect(races.length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps invented tune-ups clear of a race's window", () => {
    // A tune-up two days after a half marathon is exactly what a runner does
    // not want, so the whole window is off-limits — not just the same week.
    for (const [raceISO, taper, recover] of [
      [HALF, 3, 3],
      [TEN_K, 1, 1],
    ] as const) {
      for (let d = -taper; d <= recover; d++) {
        const date = addDaysISO(raceISO, d);
        const races = daysOn(plan, date).filter((x) => x.type === "race");
        expect(races.length).toBe(d === 0 ? 1 : 0);
      }
    }
  });

  it("ignores a race that falls outside the plan", () => {
    const outside = generatePlan({
      ...BASE,
      races: [{ id: "x", raceType: "5k", dateISO: "2025-11-02", priority: "c" }],
    });
    expect(outside.weeks).toEqual(plain.weeks);
  });

  it("drops doubles and strength sessions from a race window", () => {
    const withExtras = generatePlan({
      ...BASE,
      startVolumeKm: 90,
      peakVolumeKm: 130,
      daysPerWeek: 6,
      allowDoubles: true,
      includeStrength: true,
      races: RACES,
    });
    for (const d of [-3, -2, -1, 0, 1, 2, 3]) {
      const day = daysOn(withExtras, addDaysISO(HALF, d));
      expect(day).toHaveLength(1);
      expect(day[0].session ?? "am").toBe("am");
      expect(day[0].type).not.toBe("strength");
    }
  });
});

describe("plan input validation", () => {
  const valid = {
    raceType: "marathon" as const,
    goalTimeS: 3 * 3600,
    raceDateISO: RACE,
    currentFitness: { mode: "race" as const, raceType: "half" as const, timeS: 90 * 60 },
    startVolumeKm: 45,
    peakVolumeKm: 80,
    daysPerWeek: 5,
    longRunDow: 7,
    includeTuneups: true,
  };

  it("defaults to no races for plans made before the feature existed", () => {
    const parsed = planInputSchema.parse(valid);
    expect(parsed.races).toEqual([]);
  });

  it("rejects a race too close to the goal race", () => {
    const parsed = planInputSchema.safeParse({
      ...valid,
      races: [{ id: "a", raceType: "10k", dateISO: addDaysISO(RACE, -3), priority: "c" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects two races on the same day, and custom races with no distance", () => {
    expect(
      planInputSchema.safeParse({
        ...valid,
        races: [
          { id: "a", raceType: "10k", dateISO: HALF, priority: "c" },
          { id: "b", raceType: "5k", dateISO: HALF, priority: "c" },
        ],
      }).success,
    ).toBe(false);
    expect(
      planInputSchema.safeParse({
        ...valid,
        races: [{ id: "a", raceType: "custom", dateISO: HALF, priority: "c" }],
      }).success,
    ).toBe(false);
  });
});
