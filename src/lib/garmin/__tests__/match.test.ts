import { describe, expect, it } from "vitest";
import {
  activityDateISO,
  isRunningActivity,
  matchActivities,
  type GarminActivitySummary,
  type MatchableWorkout,
} from "../match";

function run(over: Partial<GarminActivitySummary> = {}): GarminActivitySummary {
  return {
    activityId: 1,
    activityName: "Morning Run",
    startTimeLocal: "2026-07-20 07:31:05",
    distanceM: 12_000,
    durationS: 3_600,
    typeKey: "running",
    ...over,
  };
}

function workout(over: Partial<MatchableWorkout> = {}): MatchableWorkout {
  return {
    id: "w1",
    dateISO: "2026-07-20",
    type: "easy",
    distanceKm: 12,
    completed: false,
    ...over,
  };
}

describe("isRunningActivity", () => {
  it("accepts the running family", () => {
    for (const key of ["running", "trail_running", "treadmill_running", "virtual_run"]) {
      expect(isRunningActivity(key)).toBe(true);
    }
  });

  it("rejects rides, swims and walks", () => {
    for (const key of ["cycling", "lap_swimming", "walking", "strength_training"]) {
      expect(isRunningActivity(key)).toBe(false);
    }
  });
});

describe("activityDateISO", () => {
  it("takes the local calendar date", () => {
    expect(activityDateISO(run({ startTimeLocal: "2026-07-20 23:55:00" }))).toBe("2026-07-20");
  });
});

describe("matchActivities", () => {
  it("matches a run to the same-day workout", () => {
    const matches = matchActivities([run()], [workout()]);
    expect(matches).toHaveLength(1);
    expect(matches[0].workoutId).toBe("w1");
  });

  it("ignores non-running activities and other days", () => {
    expect(matchActivities([run({ typeKey: "cycling" })], [workout()])).toHaveLength(0);
    expect(
      matchActivities([run({ startTimeLocal: "2026-07-21 07:00:00" })], [workout()]),
    ).toHaveLength(0);
  });

  it("never matches rest days or completed workouts", () => {
    expect(matchActivities([run()], [workout({ type: "rest" })])).toHaveLength(0);
    expect(matchActivities([run()], [workout({ completed: true })])).toHaveLength(0);
  });

  it("picks the workout with the closest planned distance", () => {
    const short = workout({ id: "short", distanceKm: 6 });
    const long = workout({ id: "long", distanceKm: 22 });
    const matches = matchActivities([run({ distanceM: 21_500 })], [short, long]);
    expect(matches).toHaveLength(1);
    expect(matches[0].workoutId).toBe("long");
  });

  it("pairs doubles so each activity claims a distinct workout, main session first", () => {
    const am = workout({ id: "am", distanceKm: 16, type: "medium_long" });
    const pm = workout({ id: "pm", distanceKm: 6, type: "recovery" });
    const matches = matchActivities(
      [
        run({ activityId: 1, distanceM: 6_200 }),
        run({ activityId: 2, distanceM: 15_800 }),
      ],
      [am, pm],
    );
    const byActivity = Object.fromEntries(matches.map((m) => [m.activity.activityId, m.workoutId]));
    expect(byActivity[2]).toBe("am");
    expect(byActivity[1]).toBe("pm");
  });

  it("a second same-day run has nothing left to claim", () => {
    const matches = matchActivities(
      [run({ activityId: 1 }), run({ activityId: 2, distanceM: 5_000 })],
      [workout()],
    );
    expect(matches).toHaveLength(1);
  });
});
