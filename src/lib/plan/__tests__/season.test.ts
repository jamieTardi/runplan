import { describe, expect, it } from "vitest";
import { generatePlan } from "../generatePlan";
import {
  MAX_BLOCK_WEEKS,
  MAX_WEEKS,
  MIN_WEEKS,
  assignPhases,
  computeTotalWeeks,
  planWeeksBetween,
} from "../periodize";
import { addDaysISO, mondayOfWeekISO } from "../dates";
import { planInputSchema } from "../inputSchema";
import type { GenerateInput, SupportingRace } from "../types";

// "I want to start now for a race in May" — 33 whole weeks away.
const TODAY = "2026-09-23"; // a Wednesday
const START_MONDAY = mondayOfWeekISO(TODAY); // 2026-09-21
const RACE = addDaysISO(START_MONDAY, 32 * 7 + 6); // Sunday, 33 weeks out

const SEASON: GenerateInput = {
  name: "Spring marathon season",
  raceType: "marathon",
  goalTimeS: 3 * 3600 + 45 * 60,
  raceDateISO: RACE,
  todayISO: TODAY,
  startDateISO: TODAY,
  currentFitness: { mode: "race", raceType: "half", timeS: 105 * 60 },
  startVolumeKm: 40,
  peakVolumeKm: 80,
  daysPerWeek: 5,
  longRunDow: 7,
  includeTuneups: true,
};

describe("plan length", () => {
  it("counts whole Mon–Sun weeks between a start and race day", () => {
    expect(planWeeksBetween(TODAY, RACE)).toBe(33);
    expect(planWeeksBetween(START_MONDAY, RACE)).toBe(33);
  });

  it("honours a chosen start date instead of clamping to a standard block", () => {
    expect(computeTotalWeeks(TODAY, RACE, { startFixed: true })).toBe(33);
    // Short run-ups are honoured too — four weeks means four weeks.
    const soon = addDaysISO(START_MONDAY, 3 * 7 + 6);
    expect(computeTotalWeeks(TODAY, soon, { startFixed: true })).toBe(4);
    expect(computeTotalWeeks(TODAY, soon)).toBe(MIN_WEEKS);
  });

  it("caps at a season, starting later for anything further out", () => {
    const farOff = addDaysISO(START_MONDAY, 70 * 7 + 6);
    expect(computeTotalWeeks(TODAY, farOff, { startFixed: true })).toBe(MAX_WEEKS);
    expect(computeTotalWeeks(TODAY, farOff)).toBe(MAX_WEEKS);
  });
});

describe("season periodisation", () => {
  it("spends the extra weeks on base, not on months of sharp work", () => {
    const phases = assignPhases(33);
    expect(phases).toHaveLength(33);
    const count = (p: string) => phases.filter((x) => x === p).length;
    // Base grows with the season; the sharp block stays a normal block.
    expect(count("lt") + count("race_prep") + count("taper")).toBeLessThanOrEqual(MAX_BLOCK_WEEKS);
    expect(count("endurance")).toBeGreaterThan(count("lt") + count("race_prep"));
    expect(phases[0]).toBe("endurance");
    expect(phases.slice(-3)).toEqual(["taper", "taper", "taper"]);
    // The order still runs base → threshold → race-specific → taper.
    expect(phases.lastIndexOf("endurance")).toBeLessThan(phases.indexOf("lt"));
    expect(phases.lastIndexOf("lt")).toBeLessThan(phases.indexOf("race_prep"));
  });

  it("keeps a normal block exactly as it was", () => {
    const phases = assignPhases(18);
    expect(phases).toHaveLength(18);
    expect(phases.filter((p) => p === "taper")).toHaveLength(3);
    expect(phases[0]).toBe("endurance");
  });
});

describe("generatePlan across a whole season", () => {
  const plan = generatePlan(SEASON);

  it("starts the week the runner asked for and runs to race day", () => {
    expect(plan.totalWeeks).toBe(33);
    expect(plan.weeks[0].startDateISO).toBe(START_MONDAY);
    expect(plan.weeks.at(-1)!.workouts.some((d) => d.dateISO === RACE && d.type === "race")).toBe(true);
    // Every week is contiguous.
    plan.weeks.forEach((w, i) => {
      expect(w.startDateISO).toBe(addDaysISO(START_MONDAY, i * 7));
    });
  });

  it("without a start date, a far-off race still starts later", () => {
    const { startDateISO: _s, ...rest } = SEASON;
    const clamped = generatePlan(rest);
    expect(clamped.totalWeeks).toBe(33); // within MAX_WEEKS, so it starts now anyway
    const farOff = generatePlan({ ...rest, raceDateISO: addDaysISO(START_MONDAY, 69 * 7 + 6) });
    expect(farOff.totalWeeks).toBe(MAX_WEEKS);
    expect(farOff.weeks[0].startDateISO > START_MONDAY).toBe(true);
  });

  it("blends the season's other races into the long build", () => {
    const races: SupportingRace[] = [
      // A 10K five weeks in, and a half marathon in the spring.
      { id: "c1", raceType: "10k", dateISO: addDaysISO(START_MONDAY, 4 * 7 + 6), priority: "c" },
      { id: "b1", raceType: "half", dateISO: addDaysISO(START_MONDAY, 21 * 7 + 6), priority: "b" },
    ];
    const withRaces = generatePlan({ ...SEASON, races });
    expect(withRaces.totalWeeks).toBe(33);
    for (const race of races) {
      const day = withRaces.weeks
        .flatMap((w) => w.workouts)
        .filter((d) => d.dateISO === race.dateISO && d.type === "race");
      expect(day).toHaveLength(1);
    }
    // The goal race is still the only session on race day.
    expect(
      withRaces.weeks.flatMap((w) => w.workouts).filter((d) => d.type === "race"),
    ).not.toHaveLength(0);
  });
});

describe("start-date validation", () => {
  const base = {
    raceType: "marathon" as const,
    goalTimeS: 3 * 3600,
    raceDateISO: RACE,
    currentFitness: { mode: "race" as const, raceType: "half" as const, timeS: 90 * 60 },
    startVolumeKm: 40,
    peakVolumeKm: 80,
    daysPerWeek: 5,
    longRunDow: 7,
    includeTuneups: true,
  };

  it("accepts a season-long run-up", () => {
    expect(planInputSchema.safeParse({ ...base, startDateISO: TODAY }).success).toBe(true);
  });

  it("rejects starting too close to race day", () => {
    const parsed = planInputSchema.safeParse({ ...base, startDateISO: addDaysISO(RACE, -10) });
    expect(parsed.success).toBe(false);
  });

  it("rejects a plan longer than a season", () => {
    const parsed = planInputSchema.safeParse({
      ...base,
      raceDateISO: addDaysISO(START_MONDAY, 70 * 7 + 6),
      startDateISO: TODAY,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a race scheduled before the plan starts", () => {
    const parsed = planInputSchema.safeParse({
      ...base,
      startDateISO: TODAY,
      races: [{ id: "x", raceType: "10k", dateISO: addDaysISO(START_MONDAY, -7), priority: "c" }],
    });
    expect(parsed.success).toBe(false);
  });
});
