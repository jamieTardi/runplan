import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { applyGapAndRebuild } from "@/lib/plan/gapPersist";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const gapSchema = z
  .object({
    startDate: z.string().regex(DATE),
    endDate: z.string().regex(DATE),
    reason: z.enum(["injury", "life"]),
    rebuild: z.boolean().default(true),
  })
  .refine((v) => v.startDate <= v.endDate, {
    message: "The break can't end before it starts",
  });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = gapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid break" },
      { status: 400 },
    );
  }

  const [plan] = await db
    .select({ raceDate: plans.raceDate })
    .from(plans)
    .where(and(eq(plans.id, id), eq(plans.userId, user.id)))
    .limit(1);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.endDate >= String(plan.raceDate).slice(0, 10)) {
    return NextResponse.json(
      { error: "The break reaches race day — change the race date in Edit plan instead." },
      { status: 400 },
    );
  }

  try {
    const summary = await applyGapAndRebuild(user.id, id, {
      gapStartISO: parsed.data.startDate,
      gapEndISO: parsed.data.endDate,
      reason: parsed.data.reason,
      rebuild: parsed.data.rebuild,
    });
    if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("Gap rebuild failed:", err);
    return NextResponse.json({ error: "Rebuilding the plan failed" }, { status: 500 });
  }
}
