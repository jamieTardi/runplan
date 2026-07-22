import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { garminActivityCache } from "@/db/schema";
import { clientFromTokens, GarminError } from "./client";
import { getGarminAccount, saveGarminTokens } from "./store";

// Compact, chart-ready extract of one Garmin activity. This is what gets
// cached in garmin_activity_cache and served to the workout detail page.

export interface GarminLap {
  index: number;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevGainM: number | null;
}

export interface GarminSample {
  /** Elapsed seconds from start. */
  tS: number;
  /** Cumulative distance in metres. */
  dM: number | null;
  hr: number | null;
  paceSPerKm: number | null;
  elevM: number | null;
}

export interface GarminActivityData {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  distanceM: number;
  durationS: number;
  movingDurationS: number | null;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevGainM: number | null;
  elevLossM: number | null;
  calories: number | null;
  avgCadence: number | null;
  aerobicTrainingEffect: number | null;
  laps: GarminLap[];
  samples: GarminSample[];
  /** [lat, lng] pairs. */
  route: [number, number][];
}

const GC_API = "https://connectapi.garmin.com";
const MAX_SAMPLES = 700;
const MAX_ROUTE_POINTS = 1500;

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Garmin payloads are untyped */

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function speedToPace(speedMS: unknown): number | null {
  const s = num(speedMS);
  return s && s > 0.3 ? Math.round(1000 / s) : null;
}

function extractSummary(raw: any): Omit<GarminActivityData, "laps" | "samples" | "route"> {
  const s = raw?.summaryDTO ?? raw ?? {};
  return {
    activityId: raw?.activityId ?? 0,
    activityName: raw?.activityName ?? "Garmin activity",
    startTimeLocal: s.startTimeLocal ?? raw?.startTimeLocal ?? "",
    distanceM: num(s.distance) ?? 0,
    durationS: Math.round(num(s.duration) ?? 0),
    movingDurationS: num(s.movingDuration) ? Math.round(s.movingDuration) : null,
    avgPaceSPerKm: speedToPace(s.averageSpeed),
    avgHr: num(s.averageHR),
    maxHr: num(s.maxHR),
    elevGainM: num(s.elevationGain),
    elevLossM: num(s.elevationLoss),
    calories: num(s.calories),
    avgCadence: num(s.averageRunCadence),
    aerobicTrainingEffect: num(s.trainingEffect),
  };
}

function extractLaps(raw: any): GarminLap[] {
  const laps: any[] = raw?.lapDTOs ?? [];
  return laps.map((l, i) => ({
    index: i + 1,
    distanceM: num(l.distance) ?? 0,
    durationS: Math.round(num(l.duration) ?? 0),
    avgPaceSPerKm: speedToPace(l.averageSpeed ?? l.averageMovingSpeed),
    avgHr: num(l.averageHR),
    maxHr: num(l.maxHR),
    elevGainM: num(l.elevationGain),
  }));
}

function extractSeries(raw: any): { samples: GarminSample[]; route: [number, number][] } {
  const descriptors: any[] = raw?.metricDescriptors ?? [];
  const rows: any[] = raw?.activityDetailMetrics ?? [];
  const idx = (key: string): number =>
    descriptors.find((d) => d?.key === key)?.metricsIndex ?? -1;

  const iDur = idx("sumDuration");
  const iDist = idx("sumDistance");
  const iHr = idx("directHeartRate");
  const iSpeed = idx("directSpeed");
  const iElev = idx("directElevation");
  const iLat = idx("directLatitude");
  const iLon = idx("directLongitude");

  const at = (row: any, i: number): number | null => (i >= 0 ? num(row?.metrics?.[i]) : null);

  const step = Math.max(1, Math.ceil(rows.length / MAX_SAMPLES));
  const samples: GarminSample[] = [];
  for (let r = 0; r < rows.length; r += step) {
    const row = rows[r];
    const t = at(row, iDur);
    if (t == null) continue;
    samples.push({
      tS: Math.round(t),
      dM: at(row, iDist),
      hr: at(row, iHr),
      paceSPerKm: speedToPace(at(row, iSpeed)),
      elevM: at(row, iElev),
    });
  }

  // Route: prefer the server-simplified polyline, fall back to lat/lon metrics.
  let route: [number, number][] = (raw?.geoPolylineDTO?.polyline ?? [])
    .map((p: any): [number, number] | null => {
      const lat = num(p?.lat);
      const lon = num(p?.lon);
      return lat != null && lon != null ? [lat, lon] : null;
    })
    .filter(Boolean) as [number, number][];

  if (route.length < 2 && iLat >= 0 && iLon >= 0) {
    route = rows
      .map((row): [number, number] | null => {
        const lat = at(row, iLat);
        const lon = at(row, iLon);
        return lat != null && lon != null ? [lat, lon] : null;
      })
      .filter(Boolean) as [number, number][];
  }
  if (route.length > MAX_ROUTE_POINTS) {
    const rstep = Math.ceil(route.length / MAX_ROUTE_POINTS);
    route = route.filter((_, i) => i % rstep === 0);
  }

  return { samples, route };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Detail for one of the user's Garmin activities — served from the cache,
 * fetched from Garmin once on first view.
 */
export async function getActivityData(
  userId: string,
  activityId: number,
): Promise<GarminActivityData> {
  const [cached] = await db
    .select()
    .from(garminActivityCache)
    .where(eq(garminActivityCache.activityId, activityId))
    .limit(1);
  if (cached && cached.userId === userId) return cached.data as GarminActivityData;

  const account = await getGarminAccount(userId);
  if (!account) throw new GarminError("Garmin is not connected");
  const client = clientFromTokens(account.tokens as Parameters<typeof clientFromTokens>[0]);

  const base = `${GC_API}/activity-service/activity/${activityId}`;
  let summaryRaw: unknown, splitsRaw: unknown, detailsRaw: unknown;
  try {
    [summaryRaw, splitsRaw, detailsRaw] = await Promise.all([
      client.client.get(base),
      client.client.get(`${base}/splits`).catch(() => null),
      client.client
        .get(`${base}/details?maxChartSize=${MAX_SAMPLES}&maxPolylineSize=${MAX_ROUTE_POINTS}`)
        .catch(() => null),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GarminError(`Fetching the activity from Garmin failed (${msg}).`);
  }

  const { samples, route } = extractSeries(detailsRaw);
  const data: GarminActivityData = {
    ...extractSummary(summaryRaw),
    activityId,
    laps: extractLaps(splitsRaw),
    samples,
    route,
  };

  await db
    .insert(garminActivityCache)
    .values({ activityId, userId, data })
    .onConflictDoUpdate({ target: garminActivityCache.activityId, set: { data, userId } });

  // Tokens may have rotated during the fetch.
  try {
    await saveGarminTokens(userId, client.exportToken());
  } catch {
    // Non-fatal: next sync re-persists them.
  }

  return data;
}
