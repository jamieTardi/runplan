import { describe, expect, it } from "vitest";
import { generatePlan } from "../generatePlan";
import {
  buildBridgeWeekPlans,
  bridgeStartMondayISO,
  bridgeTotalWeeks,
} from "../periodize";
import type { GenerateInput } from "../types";

// Half marathon raced Sunday 2026-09-20; marathon five weeks later (Sun 2026-10-25).
const PREV_RACE = "2026-09-20";
const NEXT_RACE = "2026-10-25";
const HM_KM = 21.0975;

const HM_TO_MARATHON: GenerateInput = {
  name: "Marathon — next race",
  raceType: "marathon",
  goalTimeS: 3 * 3600 + 30 * 60,
  raceDateISO: NEXT_RACE,
  todayISO: "2026-09-21",
  currentFitness: { mode: "race", raceType: "half", timeS: 100 * 60 },
  startVolumeKm: 25,
  peakVolumeKm: 55,
  daysPerWeek: 5,
  longRunDow: 7,
  includeTuneups: false,
  continuation: { prevRaceDateISO: PREV_RACE, prevRaceDistanceKm: HM_KM },
};

const QUALITY_TYPES = ["threshold", "vo2", "marathon_pace", "intervals", "long", "medium_long", "race"];

describe("bridge periodisation", () => {
  it("starts the Monday after the previous race and counts whole weeks", () => {
    expect(bridgeStartMondayISO(PREV_RACE)).toBe("2026-09-21");
    expect(bridgeTotalWeeks(PREV_RACE, NEXT_RACE)).toBe(5);
  });

  it("shapes a 5-week half→marathon bridge: recovery, short build, taper", () => {
    const weeks = buildBridgeWeekPlans(PREV_RACE, HM_KM, NEXT_RACE, 55);
    expect(weeks.map((w) => w.phase)).toEqual([
      "recovery",
      "lt",
      "race_prep",
      "race_prep",
      "taper",
    ]);
    expect(weeks[0].isCutback).toBe(true);
    expect(weeks[0].plannedVolumeKm).toBe(24.8); // 45% of the 55 km peak
    expect(weeks[0].startDateISO).toBe("2026-09-21");
    // The build returns to the previous peak before the taper.
    expect(weeks[3].plannedVolumeKm).toBe(55);
    expect(weeks[4].plannedVolumeKm).toBeLessThan(35);
    // Consecutive Mondays.
    weeks.forEach((w, i) => expect(w.startDateISO).toBe(bridgeAdd(i)));
  });

  it("gives two recovery weeks after a marathon or longer", () => {
    const weeks = buildBridgeWeekPlans(PREV_RACE, 42.195, NEXT_RACE, 55);
    expect(weeks.slice(0, 2).map((w) => w.phase)).toEqual(["recovery", "recovery"]);
    expect(weeks[1].plannedVolumeKm).toBeGreaterThan(weeks[0].plannedVolumeKm);
  });

  it("falls back to full periodisation when the gap allows it", () => {
    const farRace = "2026-12-27"; // 14 whole weeks after the previous race
    const weeks = buildBridgeWeekPlans(PREV_RACE, HM_KM, farRace, 55);
    expect(weeks[0].phase).toBe("recovery");
    expect(weeks.some((w) => w.phase === "endurance")).toBe(true);
    expect(weeks[weeks.length - 1].phase).toBe("taper");
  });

  it("never emits fewer than a build week and the race week after recovery", () => {
    const tight = "2026-10-11"; // 3 whole weeks after a marathon
    const weeks = buildBridgeWeekPlans(PREV_RACE, 42.195, tight, 55);
    expect(weeks).toHaveLength(3);
    expect(weeks.map((w) => w.phase)).toEqual(["recovery", "race_prep", "taper"]);
  });
});

describe("continuation plan generation", () => {
  const plan = generatePlan(HM_TO_MARATHON);

  it("builds the bridge instead of a from-scratch ramp", () => {
    expect(plan.totalWeeks).toBe(5);
    expect(plan.weeks[0].phase).toBe("recovery");
    expect(plan.weeks[0].startDateISO).toBe("2026-09-21");
  });

  it("keeps the recovery week gentle: no quality, at most four short runs", () => {
    const week = plan.weeks[0];
    const runs = week.workouts.filter((d) => d.type !== "rest");
    expect(runs.length).toBeLessThanOrEqual(4);
    for (const d of runs) {
      expect(QUALITY_TYPES).not.toContain(d.type);
      expect(d.distanceKm).toBeLessThanOrEqual(12);
      expect(d.segments ?? []).toEqual([]);
    }
  });

  it("sizes the peak long run for the new race distance", () => {
    const peakWeek = plan.weeks[3];
    const long = peakWeek.workouts.find((d) => d.type === "long");
    expect(long).toBeDefined();
    expect(long!.distanceKm).toBeGreaterThanOrEqual(28);
  });

  it("ends with the race on the right day", () => {
    const raceWeek = plan.weeks[plan.weeks.length - 1];
    const race = raceWeek.workouts.find((d) => d.type === "race");
    expect(race?.dateISO).toBe(NEXT_RACE);
    expect(race?.distanceKm).toBeCloseTo(42.2, 1);
  });
});

function bridgeAdd(i: number): string {
  const d = new Date(`2026-09-21T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i * 7);
  return d.toISOString().slice(0, 10);
}
