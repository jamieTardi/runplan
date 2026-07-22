import { describe, expect, it } from "vitest";
import { GpxParseError, parseGpx, summarizeCourse } from "../parseGpx";

/** Synthetic course heading due north: each 0.001° lat ≈ 111.2 m. */
function syntheticGpx(n = 100, withEle = true): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const lat = (55.0 + i * 0.001).toFixed(6);
    // A single smooth 50 m climb then descent.
    const ele = withEle ? (100 + 50 * Math.sin((i / (n - 1)) * Math.PI)).toFixed(1) : null;
    return `<trkpt lat="${lat}" lon="-3.600000">${ele != null ? `<ele>${ele}</ele>` : ""}</trkpt>`;
  }).join("");
  return `<?xml version="1.0"?>
<gpx version="1.1" creator="test"><trk><name>Test Half Course</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

describe("parseGpx", () => {
  it("parses points, distance and name", () => {
    const c = parseGpx(syntheticGpx());
    expect(c.name).toBe("Test Half Course");
    expect(c.points).toHaveLength(100);
    // 99 steps × ~111.2 m ≈ 11 km
    expect(c.distanceM).toBeGreaterThan(10_800);
    expect(c.distanceM).toBeLessThan(11_200);
    expect(c.points[0].dM).toBe(0);
    expect(c.points[99].dM).toBeCloseTo(c.distanceM, -1);
  });

  it("computes climb from a smooth profile", () => {
    const c = parseGpx(syntheticGpx());
    expect(c.elevGainM).toBeGreaterThan(40);
    expect(c.elevGainM).toBeLessThan(60);
    expect(c.elevLossM).toBeGreaterThan(40);
  });

  it("handles GPX without elevation", () => {
    const c = parseGpx(syntheticGpx(50, false));
    expect(c.elevGainM).toBeNull();
    expect(c.distanceM).toBeGreaterThan(5_000);
  });

  it("supports route points (rtept) as fallback", () => {
    const xml = `<gpx><rte><name>R</name>
      <rtept lat="55.0" lon="-3.6"/><rtept lat="55.001" lon="-3.6"/><rtept lat="55.002" lon="-3.6"/>
    </rte></gpx>`;
    const c = parseGpx(xml);
    expect(c.points).toHaveLength(3);
    expect(c.distanceM).toBeGreaterThan(200);
  });

  it("rejects non-GPX and empty files", () => {
    expect(() => parseGpx("not xml at all <<<")).toThrow(GpxParseError);
    expect(() => parseGpx("<html></html>")).toThrow(GpxParseError);
    expect(() => parseGpx("<gpx><trk><trkseg></trkseg></trk></gpx>")).toThrow(/No track/);
  });

  it("summarize downsamples but keeps endpoints", () => {
    const c = parseGpx(syntheticGpx(100));
    const s = summarizeCourse(c);
    expect(s.route.length).toBeLessThanOrEqual(1500);
    expect(s.route[0][0]).toBeCloseTo(55.0, 5);
    expect(s.route[s.route.length - 1][0]).toBeCloseTo(55.099, 3);
    expect(s.elevSeries.length).toBeGreaterThan(10);
    expect(s.elevSeries[s.elevSeries.length - 1].dM).toBeCloseTo(c.distanceM, -1);
  });
});
