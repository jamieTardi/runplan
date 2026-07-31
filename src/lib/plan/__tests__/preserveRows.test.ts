import { describe, expect, it } from "vitest";
import { mergePreservedRows, reconcileWeekVolume } from "../preserveRows";
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

type Row = ReturnType<typeof mergePreservedRows>[number];

function row(over: Partial<Row>): Row {
  return {
    planId: "plan-1",
    weekId: "week-1",
    date: "2026-07-27",
    dow: 1,
    session: "am",
    type: "easy",
    distanceKm: 16,
    paceLowSPerKm: 286,
    paceHighSPerKm: 316,
    segments: null,
    description: "Easy run",
    completed: false,
    completedAt: null,
    missed: false,
    actualDistanceKm: null,
    actualDurationS: null,
    notes: null,
    garminActivityId: null,
    ...over,
  } as Row;
}

describe("reconcileWeekVolume", () => {
  // The real broken week: 59 km already done at the ORIGINAL layout's
  // distances, template future days assume a different past → 97 vs 101.4.
  const partialWeek = () => [
    row({ type: "threshold", distanceKm: 13, completed: true }),
    row({ type: "medium_long", distanceKm: 18, completed: true }),
    row({ type: "easy", distanceKm: 16, completed: true }),
    row({ type: "recovery", distanceKm: 12, completed: true }),
    row({ type: "long", distanceKm: 26 }),
    row({ type: "recovery", distanceKm: 12 }),
  ];

  it("grows future flexible runs to close a partial-week shortfall", () => {
    const out = reconcileWeekVolume(partialWeek(), 101.4);
    expect(out.reduce((a, r) => a + r.distanceKm, 0)).toBe(101);
    // The shortfall lands on the future recovery run, not the long run…
    expect(out[5]).toMatchObject({ type: "recovery", distanceKm: 16 });
    expect(out[4]).toMatchObject({ type: "long", distanceKm: 26 });
    // …and history is never resized.
    expect(out.slice(0, 4).map((r) => r.distanceKm)).toEqual([13, 18, 16, 12]);
  });

  it("leaves fully-future weeks alone — the template is already coherent", () => {
    const rows = [row({ distanceKm: 10 }), row({ distanceKm: 10 })];
    expect(reconcileWeekVolume(rows, 40)).toEqual(rows);
  });

  it("ignores rounding-noise imbalances", () => {
    const rows = [row({ completed: true, distanceKm: 16 }), row({ distanceKm: 12 })];
    expect(reconcileWeekVolume(rows, 29.4)).toEqual(rows);
  });

  it("shrinks without going below the floor or half the run's size", () => {
    const out = reconcileWeekVolume(
      [row({ completed: true, distanceKm: 30 }), row({ distanceKm: 8 })],
      30,
    );
    // Wants −8, but the 8 km run can only give up to its floor of 4.
    expect(out[1].distanceKm).toBe(4);
    expect(out[0].distanceKm).toBe(30);
  });

  it("never touches race weeks — their sum exceeds the ramp target by design", () => {
    const rows = [
      row({ completed: true, distanceKm: 5 }),
      row({ type: "race", distanceKm: 21.1 }),
      row({ distanceKm: 4 }),
    ];
    expect(reconcileWeekVolume(rows, 26)).toEqual(rows);
  });
});
