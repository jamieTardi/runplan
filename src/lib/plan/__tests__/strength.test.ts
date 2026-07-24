import { describe, expect, it } from "vitest";
import { applyStrength, ROUTINES, STRENGTH_PER_WEEK } from "../strength";
import type { PlanWeek, PlanWorkout } from "../types";

function w(dow: number, type: PlanWorkout["type"], distanceKm = 10, session: "am" | "pm" = "am"): PlanWorkout {
  return {
    dow,
    session,
    dateISO: `2026-08-0${dow}`,
    type,
    distanceKm,
    paceLowSPerKm: type === "rest" ? null : 330,
    paceHighSPerKm: type === "rest" ? null : 360,
    segments: null,
    description: type,
  };
}

// Mon rest, Tue GA, Wed threshold, Thu easy, Fri rest, Sat recovery, Sun long
function week(overrides: Partial<PlanWeek> = {}): PlanWeek {
  return {
    weekIndex: 2,
    phase: "endurance",
    plannedVolumeKm: 50,
    isCutback: false,
    startDateISO: "2026-08-01",
    workouts: [
      w(1, "rest", 0),
      w(2, "general_aerobic", 11),
      w(3, "threshold", 12),
      w(4, "easy", 8),
      w(5, "rest", 0),
      w(6, "recovery", 6),
      w(7, "long", 16),
    ],
    ...overrides,
  };
}

const OPTS = { enabled: true, isRaceWeek: false, longRunDow: 7 };

function strengthDows(wk: PlanWeek): number[] {
  return wk.workouts.filter((x) => x.type === "strength").map((x) => x.dow);
}

describe("applyStrength", () => {
  it("no-op when disabled or race week", () => {
    expect(applyStrength(week(), { ...OPTS, enabled: false })).toEqual(week());
    expect(strengthDows(applyStrength(week(), { ...OPTS, isRaceWeek: true }))).toEqual([]);
  });

  it("adds two spread-out PM sessions on easy days, avoiding the long run and the day before", () => {
    const result = applyStrength(week(), OPTS);
    const dows = strengthDows(result);
    expect(dows).toHaveLength(STRENGTH_PER_WEEK);
    // Sat (6) is the day before the Sunday long run; Sun (7) is the long run.
    expect(dows).not.toContain(6);
    expect(dows).not.toContain(7);
    // Quality day (Wed threshold) is never used.
    expect(dows).not.toContain(3);
    for (const s of result.workouts.filter((x) => x.type === "strength")) {
      expect(s.session).toBe("pm");
      expect(s.distanceKm).toBe(0);
      expect(s.paceLowSPerKm).toBeNull();
    }
    // Sessions are spread, not back-to-back: GA Tuesday + easy Thursday.
    expect(dows).toEqual([2, 4]);
  });

  it("does not change weekly volume", () => {
    const before = week().workouts.reduce((a, x) => a + x.distanceKm, 0);
    const after = applyStrength(week(), OPTS).workouts.reduce((a, x) => a + x.distanceKm, 0);
    expect(after).toBe(before);
  });

  it("cutback and taper weeks get a single session", () => {
    expect(strengthDows(applyStrength(week({ isCutback: true }), OPTS))).toHaveLength(1);
    expect(strengthDows(applyStrength(week({ phase: "taper" }), OPTS))).toHaveLength(1);
  });

  it("skips days that already have a PM double", () => {
    const wk = week();
    // Turn Tuesday into a double: AM GA + PM recovery shakeout.
    wk.workouts.push(w(2, "recovery", 5, "pm"));
    const dows = strengthDows(applyStrength(wk, OPTS));
    expect(dows).not.toContain(2);
  });

  it("falls back to rest days when there aren't enough easy run days", () => {
    // Only quality + long runs: Tue threshold, Wed vo2, Sun long, rest elsewhere.
    const wk = week({
      workouts: [
        w(1, "rest", 0),
        w(2, "threshold", 12),
        w(3, "vo2", 10),
        w(4, "rest", 0),
        w(5, "rest", 0),
        w(6, "rest", 0),
        w(7, "long", 16),
      ],
    });
    const dows = strengthDows(applyStrength(wk, OPTS));
    expect(dows).toHaveLength(2);
    for (const d of dows) expect([1, 4, 5]).toContain(d); // rest days, minus Sat (pre-long)
  });

  it("avoids a mid-plan tune-up race and the day before it", () => {
    const wk = week();
    wk.workouts[1] = w(2, "race", 10); // Tuesday tune-up
    const dows = strengthDows(applyStrength(wk, OPTS));
    expect(dows).not.toContain(1); // day before the tune-up
    expect(dows).not.toContain(2);
  });

  it("alternates the two routines deterministically", () => {
    const result = applyStrength(week(), OPTS);
    const descriptions = result.workouts.filter((x) => x.type === "strength").map((x) => x.description);
    expect(new Set(descriptions).size).toBe(2);
    for (const d of descriptions) {
      expect(ROUTINES.some((r) => r.description === d)).toBe(true);
    }
  });
});
