import { describe, expect, it } from "vitest";
import { mergePreservedRows } from "../preserveRows";
import type { PlanWorkout } from "../types";
import type { workouts } from "@/db/schema";

type WorkoutRow = typeof workouts.$inferSelect;

function template(over: Partial<PlanWorkout>): PlanWorkout {
  return {
    dow: 2,
    dateISO: "2026-07-28",
    type: "medium_long",
    distanceKm: 18,
    paceLowSPerKm: 286,
    paceHighSPerKm: 316,
    segments: null,
    description: "Medium-long run",
    ...over,
  };
}

function preserved(over: Partial<WorkoutRow>): WorkoutRow {
  return {
    id: "old-row",
    planId: "plan-1",
    weekId: "old-week",
    date: "2026-07-28",
    dow: 2,
    session: "am",
    type: "threshold",
    distanceKm: 13,
    paceLowSPerKm: 237,
    paceHighSPerKm: 237,
    segments: [{ kind: "steady" }],
    description: "Lactate-threshold intro: 20 min @ threshold",
    completed: true,
    completedAt: new Date("2026-07-28T08:00:00Z"),
    missed: false,
    actualDistanceKm: 13.01,
    actualDurationS: 3550,
    notes: "felt strong",
    garminActivityId: 12345,
    garminWorkoutId: 67890,
    ...over,
  } as WorkoutRow;
}

describe("mergePreservedRows", () => {
  it("keeps a completed row wholesale when the rebuilt layout re-types its day", () => {
    const rows = mergePreservedRows(
      "plan-1",
      "week-1",
      [template({})],
      new Map([["2026-07-28:am", preserved({})]]),
    );
    expect(rows).toHaveLength(1);
    // History wins over the template: type/distance/paces/description survive…
    expect(rows[0]).toMatchObject({
      planId: "plan-1",
      weekId: "week-1",
      type: "threshold",
      distanceKm: 13,
      paceLowSPerKm: 237,
      description: "Lactate-threshold intro: 20 min @ threshold",
      completed: true,
      actualDistanceKm: 13.01,
      notes: "felt strong",
      garminActivityId: 12345,
      garminWorkoutId: 67890,
    });
    // …and the old row's identity does not (new week gets a fresh id).
    expect(rows[0]).not.toHaveProperty("id");
  });

  it("re-inserts preserved rows whose slot vanished from the new layout", () => {
    const rows = mergePreservedRows(
      "plan-1",
      "week-1",
      [template({ dateISO: "2026-07-29", dow: 3, type: "easy", distanceKm: 16 })],
      new Map([["2026-07-28:am", preserved({})]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-07-29", type: "easy", completed: false });
    expect(rows[1]).toMatchObject({ date: "2026-07-28", type: "threshold", completed: true });
  });

  it("matches by session so an am run is not attached to a pm slot", () => {
    const rows = mergePreservedRows(
      "plan-1",
      "week-1",
      [template({}), template({ session: "pm", type: "recovery", distanceKm: 5 })],
      new Map([["2026-07-28:pm", preserved({ session: "pm", type: "strength", distanceKm: 0 })]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ session: "am", type: "medium_long", completed: false });
    expect(rows[1]).toMatchObject({ session: "pm", type: "strength", completed: true });
  });

  it("leaves untouched template rows exactly as generated", () => {
    const rows = mergePreservedRows("plan-1", "week-1", [template({})], new Map());
    expect(rows).toEqual([
      {
        planId: "plan-1",
        weekId: "week-1",
        date: "2026-07-28",
        dow: 2,
        session: "am",
        type: "medium_long",
        distanceKm: 18,
        paceLowSPerKm: 286,
        paceHighSPerKm: 316,
        segments: null,
        description: "Medium-long run",
        completed: false,
        completedAt: null,
        missed: false,
        actualDistanceKm: null,
        actualDurationS: null,
        notes: null,
        garminActivityId: null,
      },
    ]);
  });
});
