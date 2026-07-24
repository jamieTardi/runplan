import { describe, expect, it } from "vitest";
import { dailyWorkoutPayload, type PushWorkout } from "../message";

function workout(overrides: Partial<PushWorkout> = {}): PushWorkout {
  return {
    type: "easy",
    session: "am",
    distanceKm: 10,
    description: "Easy run",
    paceLowSPerKm: 330,
    paceHighSPerKm: 360,
    ...overrides,
  };
}

describe("dailyWorkoutPayload", () => {
  it("returns null with nothing planned", () => {
    expect(dailyWorkoutPayload([], "km")).toBeNull();
  });

  it("single session: type + distance in the title, description + pace in the body", () => {
    const payload = dailyWorkoutPayload([workout({ type: "long", distanceKm: 18 })], "km");
    expect(payload?.title).toBe("Today: Long run 18.0 km");
    expect(payload?.body).toContain("Easy run");
    expect(payload?.body).toContain("Pace ");
    expect(payload?.url).toBe("/");
  });

  it("respects miles preference", () => {
    const payload = dailyWorkoutPayload([workout({ distanceKm: 16.09 })], "mi");
    expect(payload?.title).toContain("10.0 mi");
  });

  it("omits pace when the workout has none", () => {
    const payload = dailyWorkoutPayload(
      [workout({ paceLowSPerKm: null, paceHighSPerKm: null, description: "Strides after" })],
      "km",
    );
    expect(payload?.body).toBe("Strides after");
  });

  it("double days list AM before PM", () => {
    const payload = dailyWorkoutPayload(
      [
        workout({ session: "pm", type: "recovery", distanceKm: 5 }),
        workout({ session: "am", type: "general_aerobic", distanceKm: 13 }),
      ],
      "km",
    );
    expect(payload?.title).toBe("Today: 2 runs");
    const [first, second] = payload!.body.split("\n");
    expect(first).toMatch(/^AM — General aerobic/);
    expect(second).toMatch(/^PM — Recovery/);
  });
});
