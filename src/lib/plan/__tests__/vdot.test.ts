import { describe, expect, it } from "vitest";
import {
  RACE_DISTANCES_M,
  paceZones,
  raceToVdot,
  vdotToRaceTime,
} from "../vdot";
import { goalPaceSecPerKm, goalVdot, currentVdot, assessFeasibility } from "../goal";
import { formatPace } from "@/lib/units";

describe("VDOT — Daniels/Gilbert anchors", () => {
  it("VDOT 50 predicts a 5K of ~19:57", () => {
    // 19:57 = 1197s. This is a canonical Daniels table value.
    expect(raceToVdot(5000, 1197)).toBeCloseTo(50, 0);
  });

  it("a sub-3:00 marathon computes to VDOT ≈ 53.5", () => {
    const v = goalVdot("marathon", 2 * 3600 + 59 * 60 + 59);
    expect(v).toBeGreaterThan(52.5);
    expect(v).toBeLessThan(54.5);
  });

  it("vdotToRaceTime inverts raceToVdot", () => {
    const t = 3 * 3600; // 3:00:00
    const v = raceToVdot(RACE_DISTANCES_M.marathon, t);
    expect(vdotToRaceTime(v, RACE_DISTANCES_M.marathon)).toBeCloseTo(t, -1); // within ~5s
  });

  it("higher VDOT is faster over the same distance", () => {
    expect(vdotToRaceTime(60, 10000)).toBeLessThan(vdotToRaceTime(50, 10000));
  });
});

describe("goal pace", () => {
  it("sub-3 marathon pace is 4:16/km", () => {
    const pace = goalPaceSecPerKm("marathon", 3 * 3600);
    expect(pace).toBeGreaterThan(255);
    expect(pace).toBeLessThan(257);
    expect(formatPace(pace, "km")).toBe("4:16 /km");
  });

  it("expresses the same pace in miles", () => {
    const pace = goalPaceSecPerKm("marathon", 3 * 3600);
    expect(formatPace(pace, "mi")).toBe("6:52 /mi");
  });
});

describe("training pace zones", () => {
  const z = paceZones(53.5);

  it("orders zones fastest→slowest: rep < interval < threshold < marathon < easyFast < easySlow < recovery", () => {
    expect(z.rep).toBeLessThan(z.interval);
    expect(z.interval).toBeLessThan(z.threshold);
    expect(z.threshold).toBeLessThan(z.marathon);
    expect(z.marathon).toBeLessThan(z.easyFast);
    expect(z.easyFast).toBeLessThan(z.easySlow);
    expect(z.easySlow).toBeLessThan(z.recovery);
  });

  it("marathon-zone pace matches the equivalent sub-3 pace", () => {
    expect(z.marathon).toBeGreaterThan(252);
    expect(z.marathon).toBeLessThan(260);
  });

  it("threshold ~4:06/km and easy ~4:55–5:30/km at VDOT 53.5", () => {
    expect(z.threshold).toBeGreaterThan(238); // 3:58
    expect(z.threshold).toBeLessThan(256); // 4:16
    expect(z.easyFast).toBeGreaterThan(285); // 4:45
    expect(z.easySlow).toBeLessThan(345); // 5:45
  });
});

describe("current fitness estimation", () => {
  it("uses the race result directly", () => {
    const v = currentVdot({ mode: "race", raceType: "half", timeS: 90 * 60 });
    expect(v).toBeCloseTo(raceToVdot(RACE_DISTANCES_M.half, 90 * 60), 5);
  });

  it("estimates a plausible VDOT from easy pace + volume", () => {
    const v = currentVdot({ mode: "estimate", weeklyKm: 80, easyPaceSecPerKm: 300 });
    expect(v).toBeGreaterThan(40);
    expect(v).toBeLessThan(65);
  });
});

describe("feasibility", () => {
  it("flags a large ask as very ambitious", () => {
    expect(assessFeasibility(45, 55, 12).verdict).toBe("very_ambitious");
  });
  it("treats a small gap over a long build as realistic", () => {
    expect(assessFeasibility(51, 53, 18).verdict).toBe("realistic");
  });
  it("treats meeting current fitness as comfortable", () => {
    expect(assessFeasibility(54, 53, 16).verdict).toBe("comfortable");
  });
});
