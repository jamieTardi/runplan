import type { PlanWeek, PlanWorkout } from "./types";

/**
 * Short strength sessions for runners. Deliberately minimal — two 15–20 min
 * bodyweight routines a week is what the evidence supports for injury
 * resistance and running economy, and it's about the ceiling of what most
 * runners will actually do.
 *
 * Rules:
 *  - Opt-in per plan. Two sessions on normal weeks, one on cutback/taper
 *    weeks, none on race week.
 *  - Added as a PM session on easy/general-aerobic/recovery run days —
 *    hard days stay hard, and the long run day and the day before it stay
 *    untouched. Days that already have a PM double are skipped.
 *  - Low-frequency plans without enough easy run days fall back to rest
 *    days (still never adjacent to the long run or a tune-up race).
 *  - Zero distance, no pace — these never affect weekly volume and are
 *    never sent to Garmin.
 */

export const STRENGTH_PER_WEEK = 2;

/** One exercise within a routine; `id` keys into EXERCISE_ART for its figure. */
export interface StrengthExercise {
  id: string;
  name: string;
  scheme: string;
  cue: string;
}

export type StrengthRoutine = {
  name: string;
  description: string;
  exercises: StrengthExercise[];
};

// Alternating A/B keeps it varied without needing equipment or a gym.
// The description string is what gets stored on workout rows — keep it stable,
// routineForDescription matches rows back to their routine by its prefix.
export const ROUTINES: StrengthRoutine[] = [
  {
    name: "Legs & hips",
    description:
      "Legs & hips, ~20 min: 3×12 squats, 3×8/leg walking lunges, 3×10/leg single-leg calf raises, 3×12 glute bridges. Bodyweight is plenty — stop two reps short of failure.",
    exercises: [
      {
        id: "squat",
        name: "Squats",
        scheme: "3 × 12",
        cue: "Sit back and down with your chest up, then drive through your heels to stand.",
      },
      {
        id: "walking-lunge",
        name: "Walking lunges",
        scheme: "3 × 8 per leg",
        cue: "Step forward and lower the back knee towards the floor; push off the front heel into the next step.",
      },
      {
        id: "single-leg-calf-raise",
        name: "Single-leg calf raises",
        scheme: "3 × 10 per leg",
        cue: "Rise slowly onto your toes and lower with control — hold a wall for balance.",
      },
      {
        id: "glute-bridge",
        name: "Glute bridges",
        scheme: "3 × 12",
        cue: "Squeeze your glutes to lift your hips until shoulders to knees make a straight line.",
      },
    ],
  },
  {
    name: "Core & stability",
    description:
      "Core & stability, ~15 min: 3×40s plank, 2×30s/side side plank, 3×10 dead bugs, 2×10/leg single-leg glute bridges. Slow and controlled beats more reps.",
    exercises: [
      {
        id: "plank",
        name: "Plank",
        scheme: "3 × 40s hold",
        cue: "Elbows under shoulders, straight line from head to heels — don't let the hips sag.",
      },
      {
        id: "side-plank",
        name: "Side plank",
        scheme: "2 × 30s per side",
        cue: "Stack your feet and lift the hips high; keep the body in one straight line.",
      },
      {
        id: "dead-bug",
        name: "Dead bugs",
        scheme: "3 × 10",
        cue: "Lower the opposite arm and leg slowly, keeping your lower back pressed to the floor.",
      },
      {
        id: "single-leg-glute-bridge",
        name: "Single-leg glute bridges",
        scheme: "2 × 10 per leg",
        cue: "One leg held out straight — lift the hips level without letting them twist.",
      },
    ],
  },
];

/**
 * Match a stored strength workout back to its routine. Descriptions are
 * written by applyStrength from ROUTINES, so a prefix match on the routine
 * name is enough; user-edited descriptions simply return null (callers fall
 * back to plain text).
 */
export function routineForDescription(description: string | null | undefined): StrengthRoutine | null {
  if (!description) return null;
  return ROUTINES.find((r) => description.startsWith(r.name)) ?? null;
}

export interface StrengthOptions {
  enabled: boolean;
  isRaceWeek: boolean;
  longRunDow: number; // ISO 1..7
}

/** The ISO day-of-week immediately before `dow` (wrapping Monday → Sunday). */
function dayBefore(dow: number): number {
  return dow === 1 ? 7 : dow - 1;
}

const EASY_RUN_TYPES = new Set<PlanWorkout["type"]>(["easy", "general_aerobic", "recovery"]);

/** Pick up to `count` dows from `candidates` (sorted), spread as far apart as possible. */
function pickSpread(candidates: number[], count: number): number[] {
  if (candidates.length <= count) return candidates;
  if (count === 1) return [candidates[0]];
  // Two sessions: first candidate plus the one furthest from it.
  const first = candidates[0];
  let second = candidates[1];
  for (const c of candidates.slice(1)) {
    if (Math.abs(c - first) > Math.abs(second - first)) second = c;
  }
  return [first, second];
}

export function applyStrength(week: PlanWeek, opts: StrengthOptions): PlanWeek {
  if (!opts.enabled || opts.isRaceWeek) return week;
  const target = week.isCutback || week.phase === "taper" ? 1 : STRENGTH_PER_WEEK;

  // Days to leave alone: the long run and the day before it, plus any
  // mid-plan tune-up race and the day before that.
  const protectedDows = new Set<number>([opts.longRunDow, dayBefore(opts.longRunDow)]);
  for (const w of week.workouts) {
    if (w.type === "race") {
      protectedDows.add(w.dow);
      protectedDows.add(dayBefore(w.dow));
    }
  }
  const pmDows = new Set(week.workouts.filter((w) => w.session === "pm").map((w) => w.dow));

  const suitable = (types: Set<PlanWorkout["type"]>) =>
    week.workouts
      .filter(
        (w) =>
          types.has(w.type) &&
          w.session !== "pm" &&
          !protectedDows.has(w.dow) &&
          !pmDows.has(w.dow),
      )
      .map((w) => w.dow)
      .sort((a, b) => a - b);

  let chosen = pickSpread(suitable(EASY_RUN_TYPES), target);
  if (chosen.length < target) {
    const restDows = suitable(new Set(["rest"])).filter((d) => !chosen.includes(d));
    chosen = [...chosen, ...restDows].sort((a, b) => a - b).slice(0, target);
  }
  if (chosen.length === 0) return week;

  const dateFor = new Map(week.workouts.map((w) => [w.dow, w.dateISO]));
  const added: PlanWorkout[] = chosen.map((dow, i) => {
    const routine = ROUTINES[(week.weekIndex + i) % ROUTINES.length];
    return {
      dow,
      session: "pm" as const,
      dateISO: dateFor.get(dow)!,
      type: "strength" as const,
      distanceKm: 0,
      paceLowSPerKm: null,
      paceHighSPerKm: null,
      segments: null,
      description: routine.description,
    };
  });

  const workouts = [...week.workouts, ...added].sort(
    (a, b) => a.dow - b.dow || (a.session === "pm" ? 1 : 0) - (b.session === "pm" ? 1 : 0),
  );
  return { ...week, workouts };
}
