import { describe, expect, it } from "vitest";
import { paceRangeForType } from "../paceForType";
import { paceZones } from "../vdot";

const easy = paceZones(56);
const quality = paceZones(55);
const GOAL_PACE = 265;

describe("paceRangeForType", () => {
  it("steady types get the easy zone, recovery its slower band", () => {
    expect(paceRangeForType("easy", easy, quality, GOAL_PACE)).toEqual({
      low: Math.round(easy.easyFast),
      high: Math.round(easy.easySlow),
    });
    expect(paceRangeForType("medium_long", easy, quality, GOAL_PACE)).toEqual(
      paceRangeForType("easy", easy, quality, GOAL_PACE),
    );
    expect(paceRangeForType("recovery", easy, quality, GOAL_PACE)).toEqual({
      low: Math.round(easy.easySlow),
      high: Math.round(easy.recovery),
    });
  });

  it("long runs target the faster half of the easy zone", () => {
    const r = paceRangeForType("long", easy, quality, GOAL_PACE)!;
    expect(r.low).toBe(Math.round(easy.easyFast));
    expect(r.high).toBeLessThan(Math.round(easy.easySlow));
  });

  it("quality types use the quality zones, race the goal pace", () => {
    expect(paceRangeForType("threshold", easy, quality, GOAL_PACE)).toEqual({
      low: Math.round(quality.threshold),
      high: Math.round(quality.threshold),
    });
    expect(paceRangeForType("vo2", easy, quality, GOAL_PACE)).toEqual(
      paceRangeForType("intervals", easy, quality, GOAL_PACE),
    );
    expect(paceRangeForType("race", easy, quality, GOAL_PACE)).toEqual({
      low: GOAL_PACE,
      high: GOAL_PACE,
    });
  });

  it("rest and strength are unpaced", () => {
    expect(paceRangeForType("rest", easy, quality, GOAL_PACE)).toBeNull();
    expect(paceRangeForType("strength", easy, quality, GOAL_PACE)).toBeNull();
  });
});
