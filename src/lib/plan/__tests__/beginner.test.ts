import { describe, expect, it } from "vitest";
import {
  BEGINNER_TIERS,
  applyBeginnerNotes,
  beginnerPeakKm,
  comfortableGoalTimeS,
} from "../beginner";
import { currentVdot } from "../goal";
import { paceZones, raceDistanceM, vdotToRaceTime } from "../vdot";
import type { PlanWeek } from "../types";

describe("beginner tiers", () => {
  it("every tier maps to a usable VDOT with sane pace zones", () => {
    for (const tier of BEGINNER_TIERS) {
      const vdot = currentVdot({
        mode: "estimate",
        weeklyKm: tier.weeklyKm,
        easyPaceSecPerKm: tier.easyPaceSecPerKm,
      });
      expect(vdot).toBeGreaterThan(25);
      expect(vdot).toBeLessThan(50);
      const zones = paceZones(vdot);
      // Easy pace must be slower than threshold — the zone ordering holds even
      // at low fitness.
      expect(zones.easySlow).toBeGreaterThan(zones.threshold);
      expect(Number.isFinite(zones.interval)).toBe(true);
    }
  });

  it("tiers get fitter monotonically", () => {
    const vdots = BEGINNER_TIERS.map((t) =>
      currentVdot({ mode: "estimate", weeklyKm: t.weeklyKm, easyPaceSecPerKm: t.easyPaceSecPerKm }),
    );
    for (let i = 1; i < vdots.length; i++) expect(vdots[i]).toBeGreaterThan(vdots[i - 1]);
  });
});

describe("comfortableGoalTimeS", () => {
  it("is slower than the fitness-predicted time (never an ambitious goal)", () => {
    for (const raceType of ["5k", "10k", "half", "marathon"] as const) {
      const vdot = 33;
      const predicted = vdotToRaceTime(vdot, raceDistanceM(raceType, null));
      expect(comfortableGoalTimeS(raceType, vdot)).toBeGreaterThan(predicted);
    }
  });

  it("rounds to friendly numbers (1 min short, 5 min half/full)", () => {
    expect(comfortableGoalTimeS("5k", 33) % 60).toBe(0);
    expect(comfortableGoalTimeS("marathon", 33) % 300).toBe(0);
  });
});

describe("beginnerPeakKm", () => {
  it("respects per-race floors so the long run can carry the distance", () => {
    expect(beginnerPeakKm("marathon", 8)).toBeGreaterThanOrEqual(50);
    expect(beginnerPeakKm("half", 8)).toBeGreaterThanOrEqual(34);
  });

  it("caps growth for short races without ever cutting existing volume", () => {
    // Growth is capped: a 22 km/wk starter doesn't get pushed past the 5K cap…
    expect(beginnerPeakKm("5k", 22)).toBeLessThanOrEqual(28);
    // …but a starter already above the cap simply holds their volume.
    expect(beginnerPeakKm("5k", 32)).toBe(32);
    expect(beginnerPeakKm("5k", 40)).toBe(40);
  });
});

describe("applyBeginnerNotes", () => {
  const week = (phase: PlanWeek["phase"]): PlanWeek => ({
    weekIndex: 0,
    phase,
    plannedVolumeKm: 20,
    isCutback: false,
    startDateISO: "2026-08-03",
    workouts: [
      {
        dow: 2,
        session: "am",
        dateISO: "2026-08-04",
        type: "easy",
        distanceKm: 5,
        paceLowSPerKm: 400,
        paceHighSPerKm: 430,
        segments: null,
        description: "Easy run.",
      },
      {
        dow: 3,
        session: "am",
        dateISO: "2026-08-05",
        type: "threshold",
        distanceKm: 8,
        paceLowSPerKm: 330,
        paceHighSPerKm: 340,
        segments: null,
        description: "Threshold.",
      },
    ],
  });

  it("adds the walk-break note to base-phase aerobic runs only", () => {
    const result = applyBeginnerNotes(week("endurance"), true);
    expect(result.workouts[0].description).toContain("Walk breaks");
    expect(result.workouts[1].description).not.toContain("Walk breaks");
  });

  it("leaves later phases and non-beginner plans untouched", () => {
    expect(applyBeginnerNotes(week("lt"), true)).toEqual(week("lt"));
    expect(applyBeginnerNotes(week("endurance"), false)).toEqual(week("endurance"));
  });

  it("is idempotent", () => {
    const once = applyBeginnerNotes(week("endurance"), true);
    expect(applyBeginnerNotes(once, true)).toEqual(once);
  });
});
