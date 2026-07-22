import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, raceCourses } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { GpxParseError, parseGpx, summarizeCourse } from "@/lib/gpx/parseGpx";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function ownPlan(userId: string, planId: string) {
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .limit(1);
  return plan ?? null;
}

// Upload (or replace) the race-course GPX for a plan.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownPlan(auth.user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  let course;
  try {
    course = parseGpx(await file.text());
  } catch (err) {
    if (err instanceof GpxParseError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("GPX parse failed:", err);
    return NextResponse.json({ error: "Couldn't parse that file as GPX" }, { status: 400 });
  }

  const { route, elevSeries } = summarizeCourse(course);
  const values = {
    planId: id,
    name: course.name ?? file.name.replace(/\.gpx$/i, ""),
    distanceM: course.distanceM,
    elevGainM: course.elevGainM,
    elevLossM: course.elevLossM,
    route,
    elevSeries,
    uploadedAt: new Date(),
  };
  await db
    .insert(raceCourses)
    .values(values)
    .onConflictDoUpdate({ target: raceCourses.planId, set: values });

  return NextResponse.json({
    ok: true,
    distanceM: course.distanceM,
    elevGainM: course.elevGainM,
    points: route.length,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownPlan(auth.user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.delete(raceCourses).where(eq(raceCourses.planId, id));
  return NextResponse.json({ ok: true });
}
