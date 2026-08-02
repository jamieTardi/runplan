import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { crossActivities, plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { deleteGarminWorkoutsBestEffort } from "@/lib/garmin/pushWorkout";
import {
  isCrossConvertible,
  restoredFields,
  toCrossTraining,
} from "@/lib/plan/crossTrain";
import { WORKOUT_META } from "@/lib/planMeta";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.union([
  z.object({
    mode: z.literal("replace"),
    startDate: z.string().regex(dateRe),
    endDate: z.string().regex(dateRe),
    activity: z.enum(crossActivities),
  }),
  z.object({
    mode: z.literal("restore"),
    startDate: z.string().regex(dateRe),
    endDate: z.string().regex(dateRe),
  }),
]);

/**
 * Bulk injury swap: replace every not-yet-done run in a date range with a
 * like-for-like cross-training session — or restore a range of replaced
 * sessions back to their original runs once the runner is healthy.
 * Completed and missed sessions are history and are never touched; nor are
 * rest days, strength sessions or the race itself.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success || parsed.data.startDate > parsed.data.endDate) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;
  const { mode, startDate, endDate } = data;

  const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(workouts)
    .where(
      and(eq(workouts.planId, id), gte(workouts.date, startDate), lte(workouts.date, endDate)),
    );

  let changed = 0;
  const staleGarminIds: number[] = [];
  await db.transaction(async (tx) => {
    for (const w of rows) {
      if (w.completed || w.missed) continue;
      if (data.mode === "restore") {
        const fields = restoredFields(w.replacedFrom);
        if (w.type !== "cross_train" || !fields) continue;
        await tx.update(workouts).set(fields).where(eq(workouts.id, w.id));
        changed++;
      } else {
        // Re-replacing an already-swapped session converts from the ORIGINAL
        // run, so an activity change never nests restore snapshots.
        const source = w.type === "cross_train" ? restoredFields(w.replacedFrom) : w;
        if (!source || !isCrossConvertible(source.type)) continue;
        const conversion = toCrossTraining(source, data.activity, WORKOUT_META[source.type].label);
        await tx
          .update(workouts)
          .set({ ...conversion, garminWorkoutId: null })
          .where(eq(workouts.id, w.id));
        if (w.garminWorkoutId) staleGarminIds.push(w.garminWorkoutId);
        changed++;
      }
    }
  });
  // Scheduled Garmin workouts for the swapped runs still prescribe running —
  // pull them off the watch (best-effort; an offline Garmin can't fail the swap).
  await deleteGarminWorkoutsBestEffort(user.id, staleGarminIds);

  return NextResponse.json(mode === "replace" ? { replaced: changed } : { restored: changed });
}
