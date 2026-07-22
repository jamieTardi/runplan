// Pure activity → planned-workout matching. No I/O, unit-tested.

/** The slice of a Garmin activity the matcher cares about. */
export interface GarminActivitySummary {
  activityId: number;
  activityName: string;
  /** Local wall-clock start, e.g. "2026-07-20 07:31:05". */
  startTimeLocal: string;
  distanceM: number;
  durationS: number;
  /** Garmin activityType.typeKey, e.g. "running", "trail_running". */
  typeKey: string;
}

/** The slice of a planned workout the matcher cares about. */
export interface MatchableWorkout {
  id: string;
  dateISO: string;
  type: string;
  distanceKm: number;
  completed: boolean;
}

export interface ActivityMatch {
  workoutId: string;
  activity: GarminActivitySummary;
}

const RUNNING_TYPE_KEYS = new Set([
  "running",
  "street_running",
  "track_running",
  "trail_running",
  "treadmill_running",
  "indoor_running",
  "virtual_run",
  "ultra_run",
  "obstacle_run",
]);

export function isRunningActivity(typeKey: string): boolean {
  return RUNNING_TYPE_KEYS.has(typeKey) || typeKey.includes("running");
}

export function activityDateISO(activity: GarminActivitySummary): string {
  return activity.startTimeLocal.slice(0, 10);
}

/**
 * Pair running activities with planned workouts on the same calendar day.
 * Each activity claims at most one workout and vice versa; when a day has
 * several candidates the closest planned distance wins. Rest days and already
 * completed workouts are never matched.
 */
export function matchActivities(
  activities: GarminActivitySummary[],
  workouts: MatchableWorkout[],
): ActivityMatch[] {
  const candidatesByDate = new Map<string, MatchableWorkout[]>();
  for (const w of workouts) {
    if (w.completed || w.type === "rest") continue;
    const list = candidatesByDate.get(w.dateISO) ?? [];
    list.push(w);
    candidatesByDate.set(w.dateISO, list);
  }

  const runs = activities
    .filter((a) => isRunningActivity(a.typeKey))
    // Longest first, so the day's main session pairs with the main activity
    // before a short shakeout claims it.
    .sort((a, b) => b.distanceM - a.distanceM);

  const matches: ActivityMatch[] = [];
  for (const activity of runs) {
    const candidates = candidatesByDate.get(activityDateISO(activity));
    if (!candidates?.length) continue;
    const actualKm = activity.distanceM / 1000;
    let best = candidates[0];
    for (const c of candidates) {
      if (Math.abs(c.distanceKm - actualKm) < Math.abs(best.distanceKm - actualKm)) best = c;
    }
    candidates.splice(candidates.indexOf(best), 1);
    matches.push({ workoutId: best.id, activity });
  }
  return matches;
}
