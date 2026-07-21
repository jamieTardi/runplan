import { describe, expect, it } from "vitest";
import { generatePlan } from "../generatePlan";
import { assignPhases, computeTotalWeeks, volumeRamp } from "../periodize";
import { addDaysISO, isoDayOfWeek } from "../dates";
import type { GenerateInput } from "../types";

const TODAY = "2026-01-05"; // a Monday
// 18 whole weeks out, race on a Sunday.
const RACE = addDaysISO(TODAY, 17 * 7 + 6);

const SUB3: GenerateInput = {
  name: "Sub-3 build",
  raceType: "marathon",
  goalTimeS: 2 * 3600 + 59 * 60,
  raceDateISO: RACE,
  todayISO: TODAY,
  currentFitness: { mode: "race", raceType: "half", timeS: 85 * 60 },
  startVolumeKm: 70,
  peakVolumeKm: 100,
  daysPerWeek: 6,
  longRunDow: 7,
  includeTuneups: true,
};

describe("periodisation", () => {
  it("computes 18 aligned weeks", () => {
    expect(computeTotalWeeks(TODAY, RACE)).toBe(18);
  });

  it("assigns all four phases, tapering last", () => {
    const phases = assignPhases(18);
    expect(phases).toHaveLength(18);
    expect(new Set(phases)).toEqual(new Set(["endurance", "lt", "race_prep", "taper"]));
    expect(phases.slice(-3)).toEqual(["taper", "taper", "taper"]);
    expect(phases[0]).toBe("endurance");
  });

  it("ramps to a clean peak with cutbacks, then tapers down", () => {
    const phases = assignPhases(18);
    const ramp = volumeRamp(phases, 70, 100);
    const peak = Math.max(...ramp.map((r) => r.plannedVolumeKm));
    expect(peak).toBe(100);
    // At least one cutback week during the build.
    expect(ramp.some((r) => r.isCutback)).toBe(true);
    // Taper strictly descends and stays under peak.
    const taper = ramp.slice(-3).map((r) => r.plannedVolumeKm);
    expect(taper[0]).toBeGreaterThan(taper[1]);
    expect(taper[1]).toBeGreaterThan(taper[2]);
    expect(Math.max(...taper)).toBeLessThan(peak);
  });
});

describe("generatePlan — sub-3 high volume", () => {
  const plan = generatePlan(SUB3);

  it("produces one week per training week, 7 days each", () => {
    expect(plan.weeks).toHaveLength(18);
    for (const w of plan.weeks) expect(w.workouts).toHaveLength(7);
  });

  it("hits weekly volume targets within tolerance", () => {
    for (const w of plan.weeks.slice(0, -1)) {
      // skip race week (dominated by the race distance)
      const total = w.workouts.reduce((a, d) => a + d.distanceKm, 0);
      expect(Math.abs(total - w.plannedVolumeKm)).toBeLessThanOrEqual(
        Math.max(3, w.plannedVolumeKm * 0.12),
      );
    }
  });

  it("peaks at the configured peak volume", () => {
    expect(plan.summary.peakVolumeKm).toBeCloseTo(100, 0);
  });

  it("keeps long runs sensible (≤37km and ≤40% of the week)", () => {
    for (const w of plan.weeks) {
      const long = w.workouts.find((d) => d.type === "long");
      if (!long) continue;
      expect(long.distanceKm).toBeLessThanOrEqual(37);
      expect(long.distanceKm).toBeLessThanOrEqual(w.plannedVolumeKm * 0.4 + 0.5);
    }
  });

  it("never jumps build volume more than ~30% week to week", () => {
    for (let i = 1; i < plan.weeks.length; i++) {
      const prev = plan.weeks[i - 1].plannedVolumeKm;
      const cur = plan.weeks[i].plannedVolumeKm;
      if (cur > prev) expect(cur / prev).toBeLessThanOrEqual(1.3);
    }
  });

  it("respects days-per-week (6 → exactly one rest day)", () => {
    for (const w of plan.weeks.slice(0, -1)) {
      const rests = w.workouts.filter((d) => d.type === "rest").length;
      expect(rests).toBe(1);
    }
  });

  it("finishes with race day on the correct date", () => {
    const raceWeek = plan.weeks.at(-1)!;
    const raceDay = raceWeek.workouts.find((d) => d.type === "race");
    expect(raceDay).toBeTruthy();
    expect(raceDay!.dateISO).toBe(RACE);
    expect(raceDay!.dow).toBe(isoDayOfWeek(RACE));
    expect(raceDay!.distanceKm).toBeCloseTo(42.2, 0);
  });

  it("includes marathon-pace work in race-prep long runs", () => {
    const withMp = plan.weeks
      .filter((w) => w.phase === "race_prep")
      .flatMap((w) => w.workouts)
      .some((d) => d.type === "long" && /marathon pace/i.test(d.description));
    expect(withMp).toBe(true);
  });

  it("schedules at least one tune-up race", () => {
    const tuneups = plan.weeks
      .flatMap((w) => w.workouts)
      .filter((d) => d.type === "race" && /tune-up/i.test(d.description));
    expect(tuneups.length).toBeGreaterThanOrEqual(1);
  });

  it("orders workout dates monotonically across the whole plan", () => {
    const dates = plan.weeks.flatMap((w) => w.workouts.map((d) => d.dateISO));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it("reports a realistic feasibility verdict", () => {
    expect(["realistic", "ambitious", "comfortable"]).toContain(plan.feasibility.verdict);
  });
});

describe("rest day preference", () => {
  it("places the rest day on the requested weekday (Monday)", () => {
    const plan = generatePlan({ ...SUB3, daysPerWeek: 6, restDow: 1 });
    for (const w of plan.weeks.slice(0, -1)) {
      const mon = w.workouts.find((d) => d.dow === 1)!;
      expect(mon.type).toBe("rest");
      expect(w.workouts.filter((d) => d.type === "rest").length).toBe(1);
    }
  });

  it("relocates a key session rather than dropping it when resting on a quality day", () => {
    // Tuesday is the default quality slot for a Sunday long run.
    const plan = generatePlan({ ...SUB3, daysPerWeek: 6, restDow: 2 });
    const w = plan.weeks[11]; // a race-prep week (VO₂ intervals)
    expect(w.workouts.find((d) => d.dow === 2)!.type).toBe("rest");
    expect(w.workouts.some((d) => d.type === "long")).toBe(true);
    expect(w.workouts.some((d) => d.type === "vo2" || d.type === "threshold")).toBe(true);
  });

  it("ignores the rest day at 7 days per week", () => {
    const plan = generatePlan({ ...SUB3, daysPerWeek: 7, restDow: 1 });
    expect(plan.weeks[3].workouts.filter((d) => d.type === "rest").length).toBe(0);
  });

  it("defaults to auto placement when no rest day is given", () => {
    const plan = generatePlan({ ...SUB3, daysPerWeek: 6 });
    // Exactly one rest day, and it isn't the long-run day.
    for (const w of plan.weeks.slice(0, -1)) {
      const rest = w.workouts.filter((d) => d.type === "rest");
      expect(rest.length).toBe(1);
      expect(rest[0].dow).not.toBe(SUB3.longRunDow);
    }
  });
});

describe("generatePlan — respects days-per-week variations", () => {
  it("5 days/week → two rest days", () => {
    const plan = generatePlan({ ...SUB3, daysPerWeek: 5 });
    const w = plan.weeks[3];
    expect(w.workouts.filter((d) => d.type === "rest").length).toBe(2);
  });

  it("7 days/week → no rest days", () => {
    const plan = generatePlan({ ...SUB3, daysPerWeek: 7 });
    const w = plan.weeks[3];
    expect(w.workouts.filter((d) => d.type === "rest").length).toBe(0);
  });
});
