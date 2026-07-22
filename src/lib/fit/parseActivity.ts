// Pure (no server-only) so it can be unit-tested like the rest of src/lib/fit.
import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";
import type { GarminActivityData, GarminLap, GarminSample } from "@/lib/garmin/activity";

// Parse a FIT *activity* file (exported from Garmin Connect or pulled off the
// watch) into the same shape the API sync caches — so a manual upload gives
// the workout page identical data with no Garmin API involved.

export class FitParseError extends Error {}

const MAX_SAMPLES = 700;
const MAX_ROUTE_POINTS = 1500;
const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

/* eslint-disable @typescript-eslint/no-explicit-any -- decoded FIT messages are loosely typed */

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function speedToPace(speedMS: unknown): number | null {
  const s = num(speedMS);
  return s && s > 0.3 ? Math.round(1000 / s) : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocal(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Garmin's "Export Original" wraps the .fit in a zip — accept either. */
function toFitBuffer(buf: Buffer): Buffer {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (!isZip) return buf;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(buf));
  } catch {
    throw new FitParseError("Couldn't read the zip file.");
  }
  const fitName = Object.keys(entries).find((n) => n.toLowerCase().endsWith(".fit"));
  if (!fitName) throw new FitParseError("The zip doesn't contain a .fit file.");
  return Buffer.from(entries[fitName]);
}

export interface ParsedActivity {
  data: GarminActivityData;
  /** UTC start of the activity, for completedAt. */
  startTime: Date;
  sport: string | null;
}

export function parseFitActivity(input: Buffer): ParsedActivity {
  const buf = toFitBuffer(input);

  const stream = Stream.fromBuffer(buf);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT() || !decoder.checkIntegrity()) {
    throw new FitParseError("That doesn't look like a valid FIT file.");
  }
  const { messages } = decoder.read();
  const session: any = (messages as any).sessionMesgs?.[0];
  if (!session) {
    throw new FitParseError("No activity session found — this looks like a workout/plan file, not a recorded activity.");
  }

  const records: any[] = (messages as any).recordMesgs ?? [];
  const lapMesgs: any[] = (messages as any).lapMesgs ?? [];
  const activityMesg: any = (messages as any).activityMesgs?.[0];

  const startTime: Date = session.startTime instanceof Date ? session.startTime : new Date();
  // FIT timestamps are UTC; localTimestamp (when present) carries wall-clock
  // time. It decodes as either a Date or raw seconds since the FIT epoch.
  const FIT_EPOCH_S = 631_065_600; // 1989-12-31T00:00:00Z
  const rawLocal = activityMesg?.localTimestamp;
  const localEnd: Date | null =
    rawLocal instanceof Date ? rawLocal : num(rawLocal) != null ? new Date((rawLocal + FIT_EPOCH_S) * 1000) : null;
  // localTimestamp sits on the activity (end) message — shift back to the start.
  const endTs = activityMesg?.timestamp instanceof Date ? activityMesg.timestamp.getTime() : null;
  const localStart: Date = localEnd
    ? new Date(localEnd.getTime() - (endTs != null ? endTs - startTime.getTime() : 0))
    : startTime;

  const sport: string | null = typeof session.sport === "string" ? session.sport : null;
  const isRunning = sport === "running";

  const durationS = Math.round(num(session.totalTimerTime) ?? num(session.totalElapsedTime) ?? 0);
  const distanceM = num(session.totalDistance) ?? 0;
  const avgSpeed = num(session.enhancedAvgSpeed) ?? num(session.avgSpeed) ?? (durationS > 0 ? distanceM / durationS : null);
  // Running cadence in FIT is per-leg; double it for steps/min.
  const cadence = num(session.avgRunningCadence) ?? num(session.avgCadence);

  const step = Math.max(1, Math.ceil(records.length / MAX_SAMPLES));
  const samples: GarminSample[] = [];
  const route: [number, number][] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const lat = num(r.positionLat);
    const lon = num(r.positionLong);
    if (lat != null && lon != null) route.push([lat * SEMICIRCLE_TO_DEG, lon * SEMICIRCLE_TO_DEG]);
    if (i % step !== 0) continue;
    const ts = r.timestamp instanceof Date ? r.timestamp.getTime() : null;
    if (ts == null) continue;
    samples.push({
      tS: Math.max(0, Math.round((ts - startTime.getTime()) / 1000)),
      dM: num(r.distance),
      hr: num(r.heartRate),
      paceSPerKm: speedToPace(num(r.enhancedSpeed) ?? num(r.speed)),
      elevM: num(r.enhancedAltitude) ?? num(r.altitude),
    });
  }
  const routeStep = Math.max(1, Math.ceil(route.length / MAX_ROUTE_POINTS));
  const slimRoute = routeStep > 1 ? route.filter((_, i) => i % routeStep === 0) : route;

  const laps: GarminLap[] = lapMesgs.map((l, i) => ({
    index: i + 1,
    distanceM: num(l.totalDistance) ?? 0,
    durationS: Math.round(num(l.totalTimerTime) ?? num(l.totalElapsedTime) ?? 0),
    avgPaceSPerKm: speedToPace(num(l.enhancedAvgSpeed) ?? num(l.avgSpeed)),
    avgHr: num(l.avgHeartRate),
    maxHr: num(l.maxHeartRate),
    elevGainM: num(l.totalAscent),
  }));

  // Synthetic negative id so manual uploads can't collide with real Garmin ids.
  const activityId = -localStart.getTime();

  const data: GarminActivityData = {
    activityId,
    activityName: `Uploaded activity (${sport ?? "unknown"})`,
    startTimeLocal: formatLocal(localStart),
    distanceM,
    durationS,
    movingDurationS: num(session.totalTimerTime) ? Math.round(session.totalTimerTime) : null,
    avgPaceSPerKm: speedToPace(avgSpeed),
    avgHr: num(session.avgHeartRate),
    maxHr: num(session.maxHeartRate),
    elevGainM: num(session.totalAscent),
    elevLossM: num(session.totalDescent),
    calories: num(session.totalCalories),
    avgCadence: cadence != null && isRunning ? cadence * 2 : cadence,
    aerobicTrainingEffect: num(session.totalTrainingEffect),
    laps,
    samples,
    route: slimRoute,
  };

  return { data, startTime, sport };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
