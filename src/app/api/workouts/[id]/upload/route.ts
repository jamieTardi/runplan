import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { garminActivityCache, plans, workouts } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { FitParseError, parseFitActivity } from "@/lib/fit/parseActivity";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

// Manual fallback for when the Garmin API sync isn't available: upload the
// .fit (or Export Original .zip) and the workout gets the same treatment a
// sync would give it — completion, actuals, and cached detail for the page.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const [row] = await db
    .select({ ownerId: plans.userId, notes: workouts.notes })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(eq(workouts.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerId !== auth.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 30 MB)" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseFitActivity(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof FitParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("FIT upload parse failed:", err);
    return NextResponse.json({ error: "Couldn't parse that file as a FIT activity" }, { status: 400 });
  }

  const { data, startTime } = parsed;
  data.activityName = `Uploaded: ${file.name.replace(/\.(zip|fit)$/i, "")}`;

  await db
    .insert(garminActivityCache)
    .values({ activityId: data.activityId, userId: auth.user.id, data })
    .onConflictDoUpdate({
      target: garminActivityCache.activityId,
      set: { data, userId: auth.user.id },
    });

  await db
    .update(workouts)
    .set({
      completed: true,
      completedAt: startTime,
      actualDistanceKm: Math.round((data.distanceM / 1000) * 100) / 100,
      actualDurationS: data.durationS,
      garminActivityId: data.activityId,
      notes: row.notes?.trim() ? row.notes : `Uploaded from ${file.name}`,
    })
    .where(eq(workouts.id, id));

  return NextResponse.json({
    ok: true,
    distanceKm: Math.round((data.distanceM / 1000) * 100) / 100,
    durationS: data.durationS,
  });
}
