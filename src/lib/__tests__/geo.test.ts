import { describe, expect, it } from "vitest";
import { cumulativeDistancesM, nearestIndexByDistance } from "../geo";

describe("cumulativeDistancesM", () => {
  it("accumulates along a straight line", () => {
    const route: [number, number][] = [
      [55.0, -3.6],
      [55.001, -3.6],
      [55.002, -3.6],
    ];
    const d = cumulativeDistancesM(route);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeGreaterThan(100);
    expect(d[2]).toBeCloseTo(d[1] * 2, 0);
  });
});

describe("nearestIndexByDistance", () => {
  const d = [0, 100, 200, 300, 400];
  it("finds exact and nearest matches", () => {
    expect(nearestIndexByDistance(d, 0)).toBe(0);
    expect(nearestIndexByDistance(d, 200)).toBe(2);
    expect(nearestIndexByDistance(d, 240)).toBe(2);
    expect(nearestIndexByDistance(d, 260)).toBe(3);
    expect(nearestIndexByDistance(d, 9999)).toBe(4);
  });
  it("handles empty input", () => {
    expect(nearestIndexByDistance([], 5)).toBe(-1);
  });
});
