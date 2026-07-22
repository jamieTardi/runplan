import { describe, expect, it } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import { zipSync } from "fflate";
import { FitParseError, parseFitActivity } from "../parseActivity";

const DEG_TO_SEMICIRCLE = 2 ** 31 / 180;

/** Encode a small synthetic running activity: 10 km in 40:00, 2 laps, HR + GPS. */
function syntheticActivity(): Buffer {
  const start = new Date("2026-07-20T06:30:00Z");
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: "activity",
    manufacturer: "garmin",
    product: 0,
    timeCreated: start,
    serialNumber: 42,
  });

  // The encoder applies profile scale/offset itself — pass human units.
  const n = 40; // one record per minute
  for (let i = 0; i <= n; i++) {
    encoder.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(start.getTime() + i * 60_000),
      distance: (10_000 / n) * i, // metres
      heartRate: 120 + Math.round(20 * Math.sin(i / 6)),
      enhancedSpeed: 10_000 / 2_400, // m/s
      positionLat: Math.round((55.13 + i * 0.0005) * DEG_TO_SEMICIRCLE),
      positionLong: Math.round(-3.7 * DEG_TO_SEMICIRCLE),
    });
  }

  for (let lap = 0; lap < 2; lap++) {
    encoder.onMesg(Profile.MesgNum.LAP, {
      timestamp: new Date(start.getTime() + (lap + 1) * 20 * 60_000),
      startTime: new Date(start.getTime() + lap * 20 * 60_000),
      totalDistance: 5_000,
      totalTimerTime: 1_200,
      avgHeartRate: 128,
      maxHeartRate: 141,
      avgSpeed: 5_000 / 1_200,
      totalAscent: 30,
    });
  }

  encoder.onMesg(Profile.MesgNum.SESSION, {
    timestamp: new Date(start.getTime() + 40 * 60_000),
    startTime: start,
    sport: "running",
    totalDistance: 10_000,
    totalTimerTime: 2_400,
    totalElapsedTime: 2_460,
    avgHeartRate: 128,
    maxHeartRate: 141,
    totalAscent: 60,
    totalDescent: 55,
    totalCalories: 700,
    avgSpeed: 10_000 / 2_400,
  });
  // localTimestamp is a localDateTime: raw seconds since the FIT epoch, here UTC+1.
  const FIT_EPOCH_S = 631_065_600;
  const endUnixS = Math.floor((start.getTime() + 40 * 60_000) / 1000);
  encoder.onMesg(Profile.MesgNum.ACTIVITY, {
    timestamp: new Date(start.getTime() + 40 * 60_000),
    numSessions: 1,
    localTimestamp: endUnixS - FIT_EPOCH_S + 3_600,
  });

  return Buffer.from(encoder.close());
}

describe("parseFitActivity", () => {
  it("parses a FIT activity into the cached-detail shape", () => {
    const { data, startTime, sport } = parseFitActivity(syntheticActivity());
    expect(sport).toBe("running");
    expect(startTime.toISOString()).toBe("2026-07-20T06:30:00.000Z");
    expect(data.distanceM).toBeCloseTo(10_000, 0);
    expect(data.durationS).toBe(2_400);
    expect(data.avgHr).toBe(128);
    expect(data.maxHr).toBe(141);
    expect(data.laps).toHaveLength(2);
    expect(data.laps[0].distanceM).toBeCloseTo(5_000, 0);
    expect(data.laps[0].avgPaceSPerKm).toBe(240); // 4:00/km
    expect(data.samples.length).toBeGreaterThan(30);
    expect(data.samples[0].hr).toBe(120);
    expect(data.route.length).toBeGreaterThan(30);
    expect(data.route[0][0]).toBeCloseTo(55.13, 3);
    expect(data.route[0][1]).toBeCloseTo(-3.7, 3);
    // Synthetic id is negative and derived from the local wall clock.
    expect(data.activityId).toBeLessThan(0);
    // Local time is UTC+1 in the file.
    expect(data.startTimeLocal).toBe("2026-07-20 07:30:00");
  });

  it("accepts Garmin's Export Original zip wrapper", () => {
    const zipped = Buffer.from(zipSync({ "12345_ACTIVITY.fit": new Uint8Array(syntheticActivity()) }));
    const { data } = parseFitActivity(zipped);
    expect(data.distanceM).toBeCloseTo(10_000, 0);
  });

  it("rejects non-FIT files and workout files", () => {
    expect(() => parseFitActivity(Buffer.from("not a fit file"))).toThrow(FitParseError);

    const encoder = new Encoder();
    encoder.onMesg(Profile.MesgNum.FILE_ID, {
      type: "workout",
      manufacturer: "development",
      product: 0,
      timeCreated: new Date("2026-07-20T06:30:00Z"),
      serialNumber: 1,
    });
    encoder.onMesg(Profile.MesgNum.WORKOUT, { wktName: "x", sport: "running", numValidSteps: 0 });
    expect(() => parseFitActivity(Buffer.from(encoder.close()))).toThrow(/workout/i);
  });
});
