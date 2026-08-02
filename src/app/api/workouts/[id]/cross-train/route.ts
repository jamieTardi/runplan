import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { crossActivities, plans, workouts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { deleteGarminWorkoutsBestEffort } from "@/lib/garmin/pushWorkout";
import {
  isCrossConvertible,
  restoredFields,
  toCrossTraining,
  type CrossSource,
} from "@/lib/plan/crossTrain";
import { WORKOUT_META } from "@/lib/planMeta";

const schema = z.union([
  z.object({ activity: z.enum(crossActivities) }),
  z.object({ restore: z.literal(true) }),
]);

/**
 * Replace one planned run with a like-for-like cross-training session
 * ({ activity }), or put a replaced session back to its original run
 * ({ restore: true }). Switching activity on an already-replaced session is
 * a plain replace — the original run snapshot is kept, not re-snapshotted.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const [row] = await db
    .select({ workout: workouts, ownerId: plans.userId })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(eq(workouts.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const w = row.workout;
  if (w.completed) {
    return NextResponse.json({ error: "This session is already completed" }, { status: 400 });
  }

  if ("restore" in parsed.data) {
    const fields = restoredFields(w.replacedFrom);
    if (w.type !== "cross_train" || !fields) {
      return NextResponse.json({ error: "Nothing to restore" }, { status: 400 });
    }
    const [updated] = await db.update(workouts).set(fields).where(eq(workouts.id, id)).returning();
    return NextResponse.json({ workout: updated });
  }

  // Re-replacing an already-swapped session: convert from the ORIGINAL run so
  // duration/structure stay faithful and the restore snapshot never nests.
  const source: CrossSource =
    w.type === "cross_train" ? (restoredFields(w.replacedFrom) ?? w) : w;
  if (!isCrossConvertible(source.type)) {
    return NextResponse.json(
      { error: "Only running sessions can be swapped for cross-training" },
      { status: 400 },
    );
  }
  const conversion = toCrossTraining(source, parsed.data.activity, WORKOUT_META[source.type].label);
  const [updated] = await db
    .update(workouts)
    .set({ ...conversion, garminWorkoutId: null })
    .where(eq(workouts.id, id))
    .returning();
  // The scheduled Garmin workout still prescribes the run — pull it off the
  // watch so an injured runner isn't told to go running.
  if (w.garminWorkoutId) await deleteGarminWorkoutsBestEffort(user.id, [w.garminWorkoutId]);
  return NextResponse.json({ workout: updated });
}
