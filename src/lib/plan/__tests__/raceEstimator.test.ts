import { describe, expect, it } from "vitest";
import { estimateRace, predictTimeS, type CompletedRunInput } from "../raceEstimator";
import { RACE_DISTANCES_M, paceZones, vdotToRaceTime } from "../vdot";
import { addDaysISO } from "../dates";

const TODAY = "2026-07-24";
const HALF_M = RACE_DISTANCES_M.half;

/** An easy run of `km` at the middle of VDOT-`vdot`'s easy zone, `daysAgo` days back. */
function easyRun(vdot: number, km: number, daysAgo: number, type: CompletedRunInput["type"] = "easy"): CompletedRunInput {
  const z = paceZones(vdot);
  const pace = (z.easyFast + z.easySlow) / 2;
  return { dateISO: addDaysISO(TODAY, -daysAgo), type, distanceKm: km, durationS: Math.round(km * pace) };
}

describe("race estimator", () => {
  it("needs at least three usable runs", () => {
    expect(estimateRace([], HALF_M, TODAY)).toBeNull();
    expect(estimateRace([easyRun(50, 10, 1), easyRun(50, 10, 3)], HALF_M, TODAY)).toBeNull();
  });

  it("easy runs at VDOT-50 easy pace estimate roughly VDOT 50", () => {
    const runs = [1, 3, 5, 8, 10, 12].map((d) => easyRun(50, 10, d));
    const est = estimateRace(runs, HALF_M, TODAY);
    expect(est).not.toBeNull();
    expect(est!.vdot).toBeGreaterThan(47);
    expect(est!.vdot).toBeLessThan(53);
    // Half-marathon prediction should be in the plausible band for that VDOT.
    const anchor = vdotToRaceTime(50, HALF_M);
    expect(Math.abs(est!.timeS - anchor) / anchor).toBeLessThan(0.08);
  });

  it("a race performance anchors the estimate", () => {
    const raceTime = vdotToRaceTime(52, 10000);
    const runs: CompletedRunInput[] = [
      { dateISO: addDaysISO(TODAY, -7), type: "race", distanceKm: 10, durationS: Math.round(raceTime) },
      easyRun(52, 10, 2),
      easyRun(52, 12, 4),
      easyRun(52, 8, 9),
    ];
    const est = estimateRace(runs, HALF_M, TODAY)!;
    expect(est.vdot).toBeGreaterThan(49.5);
    expect(est.vdot).toBeLessThan(54.5);
  });

  it("ignores junk data (short, slow-walk, zero-duration)", () => {
    const junk: CompletedRunInput[] = [
      { dateISO: addDaysISO(TODAY, -1), type: "easy", distanceKm: 1.5, durationS: 600 },
      { dateISO: addDaysISO(TODAY, -2), type: "easy", distanceKm: 10, durationS: 0 },
      { dateISO: addDaysISO(TODAY, -3), type: "easy", distanceKm: 5, durationS: 5 * 900 }, // 15 min/km stroll
      { dateISO: addDaysISO(TODAY, -80), type: "easy", distanceKm: 10, durationS: 3000 }, // outside window
    ];
    expect(estimateRace(junk, HALF_M, TODAY)).toBeNull();
    // Junk alongside good runs doesn't poison the estimate.
    const est = estimateRace([...junk, ...[1, 4, 6, 9].map((d) => easyRun(50, 10, d))], HALF_M, TODAY)!;
    expect(est.runCount).toBe(4);
  });

  it("recent fitness outweighs old fitness and reports an improving trend", () => {
    const old = [30, 35, 40, 45, 50, 55].map((d) => easyRun(46, 10, d));
    const recent = [1, 4, 7, 10, 14, 18].map((d) => easyRun(52, 10, d));
    const est = estimateRace([...old, ...recent], HALF_M, TODAY)!;
    expect(est.vdot).toBeGreaterThan(49);
    expect(est.trend).toBe("improving");
  });

  it("range brackets the central estimate, fast < central < slow", () => {
    const runs = [1, 3, 5, 8, 10, 12].map((d) => easyRun(50, 10, d));
    const est = estimateRace(runs, HALF_M, TODAY)!;
    expect(est.fastTimeS).toBeLessThan(est.timeS);
    expect(est.slowTimeS).toBeGreaterThan(est.timeS);
  });

  it("ultra predictions extend via Riegel, slower per km than the marathon", () => {
    const marathonS = predictTimeS(50, RACE_DISTANCES_M.marathon);
    const fiftyKS = predictTimeS(50, 50000);
    expect(fiftyKS).toBeGreaterThan(marathonS * (50000 / RACE_DISTANCES_M.marathon));
  });

  it("counts quality sessions separately", () => {
    const t = paceZones(50).threshold;
    const runs: CompletedRunInput[] = [
      easyRun(50, 10, 1),
      easyRun(50, 10, 3),
      { dateISO: addDaysISO(TODAY, -5), type: "threshold", distanceKm: 10, durationS: Math.round(10 * t * 1.1) },
    ];
    const est = estimateRace(runs, HALF_M, TODAY)!;
    expect(est.qualityCount).toBe(1);
    expect(est.runCount).toBe(3);
  });
});
