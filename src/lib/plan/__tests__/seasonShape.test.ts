import { describe, expect, it } from "vitest";
import { shapeWeeksForRaces } from "../supportingRaces";
import { buildWeekPlans } from "../periodize";
import { addDaysISO } from "../dates";
import type { SupportingRace } from "../types";

const START = "2026-09-21"; // a Monday
const RACE = addDaysISO(START, 29 * 7 + 6); // Sunday, 30 weeks out
const weeks = buildWeekPlans(START, RACE, 45, 85, { startFixed: true });

/** A race on the Sunday of a given week index. */
function raceOn(week: number, priority: "b" | "c", raceType: SupportingRace["raceType"] = "half"): SupportingRace {
  return { id: `r${week}`, raceType, dateISO: addDaysISO(START, week * 7 + 6), priority };
}

describe("shaping the season around a B race", () => {
  const bWeek = 12;
  const shaped = shapeWeeksForRaces(weeks, [raceOn(bWeek, "b")]);

  it("backs the race week off and calls it a cutback", () => {
    expect(shaped[bWeek].plannedVolumeKm).toBeLessThan(weeks[bWeek].plannedVolumeKm);
    expect(shaped[bWeek].isCutback).toBe(true);
  });

  it("makes the week after a recovery week", () => {
    expect(shaped[bWeek + 1].phase).toBe("recovery");
    expect(shaped[bWeek + 1].plannedVolumeKm).toBeLessThan(shaped[bWeek].plannedVolumeKm);
    expect(shaped[bWeek + 1].isCutback).toBe(true);
  });

  it("sharpens into it — base weeks before become threshold weeks", () => {
    expect(weeks[bWeek - 1].phase).toBe("endurance");
    expect(shaped[bWeek - 1].phase).toBe("lt");
    expect(shaped[bWeek - 2].phase).toBe("lt");
    expect(shaped[bWeek - 3].phase).toBe("endurance"); // only the run-in
  });

  it("steps back up afterwards instead of leaping to the old ramp", () => {
    for (let i = bWeek + 2; i < shaped.length; i++) {
      expect(shaped[i].plannedVolumeKm).toBeLessThanOrEqual(
        shaped[i - 1].plannedVolumeKm * 1.25 + 0.05,
      );
    }
  });

  it("still reaches the plan's peak and never inflates a week", () => {
    const peak = Math.max(...shaped.map((w) => w.plannedVolumeKm));
    expect(peak).toBe(Math.max(...weeks.map((w) => w.plannedVolumeKm)));
    shaped.forEach((w, i) => {
      expect(w.plannedVolumeKm).toBeLessThanOrEqual(weeks[i].plannedVolumeKm);
    });
  });

  it("treats it as a mini-peak: base resumes afterwards, the season still ends in a taper", () => {
    // The threshold weeks are an island for the race, not a permanent move up
    // the ladder — the base phase picks up again once it's recovered from.
    expect(shaped[bWeek - 3].phase).toBe(weeks[bWeek - 3].phase);
    expect(shaped[bWeek + 2].phase).toBe(weeks[bWeek + 2].phase);
    expect(shaped[bWeek + 2].phase).toBe("endurance");
    expect(shaped.at(-1)!.phase).toBe("taper");
    // Nothing but the race week's own recovery is relabelled recovery.
    expect(shaped.filter((w) => w.phase === "recovery")).toHaveLength(1);
  });
});

describe("shaping leaves the rest alone", () => {
  it("ignores C races — they're trained through", () => {
    expect(shapeWeeksForRaces(weeks, [raceOn(12, "c")])).toEqual(weeks);
  });

  it("ignores a race in the goal race's own week, or outside the plan", () => {
    expect(shapeWeeksForRaces(weeks, [raceOn(weeks.length - 1, "b")])).toEqual(weeks);
    expect(shapeWeeksForRaces(weeks, [{ ...raceOn(0, "b"), dateISO: "2025-01-05" }])).toEqual(weeks);
  });

  it("does nothing without races", () => {
    expect(shapeWeeksForRaces(weeks, [])).toEqual(weeks);
    expect(shapeWeeksForRaces(weeks, undefined)).toEqual(weeks);
  });

  it("never turns a taper week into recovery", () => {
    const taperStart = weeks.findIndex((w) => w.phase === "taper");
    const shaped = shapeWeeksForRaces(weeks, [raceOn(taperStart - 1, "b")]);
    expect(shaped[taperStart].phase).toBe("taper");
  });
});
