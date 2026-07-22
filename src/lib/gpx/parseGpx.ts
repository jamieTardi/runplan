// Pure GPX course parsing — no I/O, unit-tested.

import { XMLParser } from "fast-xml-parser";

export class GpxParseError extends Error {}

export interface CoursePoint {
  lat: number;
  lon: number;
  eleM: number | null;
  /** Cumulative distance from the start, metres. */
  dM: number;
}

export interface ParsedCourse {
  name: string | null;
  points: CoursePoint[];
  distanceM: number;
  elevGainM: number | null;
  elevLossM: number | null;
}

const EARTH_R = 6_371_000;

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/* eslint-disable @typescript-eslint/no-explicit-any -- raw XML shapes */

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

function collectRawPoints(gpx: any): any[] {
  const out: any[] = [];
  for (const trk of asArray(gpx?.trk)) {
    for (const seg of asArray(trk?.trkseg)) out.push(...asArray(seg?.trkpt));
  }
  if (out.length === 0) {
    for (const rte of asArray(gpx?.rte)) out.push(...asArray(rte?.rtept));
  }
  return out;
}

function courseName(gpx: any): string | null {
  const name = gpx?.metadata?.name ?? asArray(gpx?.trk)[0]?.name ?? asArray(gpx?.rte)[0]?.name;
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Moving-average smoothing + 2m hysteresis so GPS jitter doesn't inflate climb. */
function climb(points: CoursePoint[]): { gain: number; loss: number } | null {
  const eles = points.map((p) => p.eleM).filter((e): e is number => e != null);
  if (eles.length < points.length * 0.5 || eles.length < 2) return null;

  const smoothed: number[] = [];
  const W = 5;
  for (let i = 0; i < eles.length; i++) {
    const from = Math.max(0, i - W);
    const to = Math.min(eles.length, i + W + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += eles[j];
    smoothed.push(sum / (to - from));
  }

  const THRESHOLD = 2;
  let gain = 0;
  let loss = 0;
  let anchor = smoothed[0];
  for (const e of smoothed) {
    const diff = e - anchor;
    if (diff >= THRESHOLD) {
      gain += diff;
      anchor = e;
    } else if (diff <= -THRESHOLD) {
      loss += -diff;
      anchor = e;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

export function parseGpx(xml: string): ParsedCourse {
  let gpx;
  try {
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: true,
    }).parse(xml);
    gpx = parsed?.gpx;
  } catch {
    throw new GpxParseError("That file isn't valid XML.");
  }
  if (!gpx) throw new GpxParseError("That doesn't look like a GPX file.");

  const raw = collectRawPoints(gpx);
  const points: CoursePoint[] = [];
  let dM = 0;
  for (const p of raw) {
    const lat = parseFloat(p?.["@_lat"]);
    const lon = parseFloat(p?.["@_lon"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleRaw = typeof p?.ele === "number" ? p.ele : parseFloat(p?.ele);
    const prev = points[points.length - 1];
    if (prev) dM += haversineM(prev.lat, prev.lon, lat, lon);
    points.push({ lat, lon, eleM: Number.isFinite(eleRaw) ? eleRaw : null, dM });
  }

  if (points.length < 2) {
    throw new GpxParseError("No track found in that GPX — export the course/route as GPX and try again.");
  }

  const c = climb(points);
  return {
    name: courseName(gpx),
    points,
    distanceM: Math.round(dM),
    elevGainM: c?.gain ?? null,
    elevLossM: c?.loss ?? null,
  };
}

const MAX_ROUTE_POINTS = 1500;
const MAX_ELEV_SAMPLES = 600;

export interface CourseSummary {
  route: [number, number][];
  elevSeries: { dM: number; elevM: number }[];
}

/** Downsampled, storage/chart-ready shape. */
export function summarizeCourse(course: ParsedCourse): CourseSummary {
  const { points } = course;
  const rStep = Math.max(1, Math.ceil(points.length / MAX_ROUTE_POINTS));
  const route = points
    .filter((_, i) => i % rStep === 0 || i === points.length - 1)
    .map((p): [number, number] => [p.lat, p.lon]);

  const withEle = points.filter((p) => p.eleM != null);
  const eStep = Math.max(1, Math.ceil(withEle.length / MAX_ELEV_SAMPLES));
  const elevSeries = withEle
    .filter((_, i) => i % eStep === 0 || i === withEle.length - 1)
    .map((p) => ({ dM: Math.round(p.dM), elevM: Math.round(p.eleM! * 10) / 10 }));

  return { route, elevSeries };
}
