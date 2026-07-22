import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import type { IActivity } from "@flow-js/garmin-connect";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { addDaysISO, todayISO } from "@/lib/plan/dates";
import { clientFromTokens, GarminError } from "./client";
import { getGarminAccount, markGarminSynced } from "./store";
import {
  activityDateISO,
  isRunningActivity,
  matchActivities,
  type GarminActivitySummary,
} from "./match";

const PAGE_SIZE = 50;
const MAX_ACTIVITIES = 200;
/** How far back a first sync (or a stale account) looks. */
const LOOKBACK_DAYS = 30;
/** Re-scan a few days behind the last sync in case old activities upload late. */
const GRACE_DAYS = 3;

export interface SyncResult {
  /** Running activities found in the sync window. */
  scanned: number;
  /** Workouts marked complete this sync. */
  matched: number;
}

function toSummary(a: IActivity): GarminActivitySummary {
  return {
    activityId: a.activityId,
    activityName: a.activityName ?? "Garmin activity",
    startTimeLocal: a.startTimeLocal,
    distanceM: a.distance ?? 0,
    durationS: a.duration ?? 0,
    typeKey: a.activityType?.typeKey ?? "",
  };
}

/**
 * Pull recent Garmin activities and tick off matching planned workouts.
 * Returns null when the user has no Garmin account connected.
 */
export async function syncGarminForUser(userId: string): Promise<SyncResult | null> {
  const account = await getGarminAccount(userId);
  if (!account) return null;

  const client = clientFromTokens(account.tokens as Parameters<typeof clientFromTokens>[0]);

  const today = todayISO();
  const lastSyncISO = account.lastSyncAt
    ? account.lastSyncAt.toISOString().slice(0, 10)
    : null;
  const floorISO = addDaysISO(today, -LOOKBACK_DAYS);
  const sinceISO = lastSyncISO
    ? (() => {
        const graced = addDaysISO(lastSyncISO, -GRACE_DAYS);
        return graced > floorISO ? graced : floorISO;
      })()
    : floorISO;

  // Page newest-first until we step past the window (or hit a sane cap).
  const recent: GarminActivitySummary[] = [];
  for (let start = 0; start < MAX_ACTIVITIES; start += PAGE_SIZE) {
    let page: IActivity[];
    try {
      page = await client.getActivities(start, PAGE_SIZE);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GarminError(`Fetching activities from Garmin failed (${msg}). Try reconnecting.`);
    }
    if (!page?.length) break;
    const summaries = page.map(toSummary);
    recent.push(...summaries.filter((s) => activityDateISO(s) >= sinceISO));
    if (activityDateISO(summaries[summaries.length - 1]) < sinceISO) break;
    if (page.length < PAGE_SIZE) break;
  }

  const runs = recent.filter((a) => isRunningActivity(a.typeKey));

  const candidates = await db
    .select({
      id: workouts.id,
      date: workouts.date,
      type: workouts.type,
      distanceKm: workouts.distanceKm,
      completed: workouts.completed,
      notes: workouts.notes,
    })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(
      and(
        eq(plans.userId, userId),
        eq(plans.status, "active"),
        eq(workouts.completed, false),
        gte(workouts.date, sinceISO),
        lte(workouts.date, today),
      ),
    );

  const notesById = new Map(candidates.map((c) => [c.id, c.notes]));
  const matches = matchActivities(
    runs,
    candidates.map((c) => ({
      id: c.id,
      dateISO: String(c.date).slice(0, 10),
      type: c.type,
      distanceKm: c.distanceKm,
      completed: c.completed,
    })),
  );

  for (const { workoutId, activity } of matches) {
    const existingNotes = notesById.get(workoutId);
    await db
      .update(workouts)
      .set({
        completed: true,
        completedAt: new Date(activity.startTimeLocal.replace(" ", "T")),
        actualDistanceKm: Math.round((activity.distanceM / 1000) * 100) / 100,
        actualDurationS: Math.round(activity.durationS),
        notes: existingNotes?.trim() ? existingNotes : `Synced from Garmin: ${activity.activityName}`,
      })
      .where(eq(workouts.id, workoutId));
  }

  // Tokens rotate when the client refreshes them mid-sync — persist the latest.
  await markGarminSynced(userId, client.exportToken());

  return { scanned: runs.length, matched: matches.length };
}
