import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { FREE_ACTIVE_PLAN_LIMIT, isPro } from "@/lib/billing/plan";
import { and } from "drizzle-orm";
import { planInputSchema } from "@/lib/plan/inputSchema";
import { createPlanForUser } from "@/lib/plan/persist";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      raceType: plans.raceType,
      customDistanceKm: plans.customDistanceKm,
      goalTimeS: plans.goalTimeS,
      raceDate: plans.raceDate,
      status: plans.status,
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(eq(plans.userId, user.id))
    .orderBy(desc(plans.createdAt));

  return NextResponse.json({ plans: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isPro(user)) {
    const active = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.userId, user.id), eq(plans.status, "active")));
    if (active.length >= FREE_ACTIVE_PLAN_LIMIT) {
      return NextResponse.json(
        { error: "Free accounts have one active plan — archive it first, or upgrade to RunPlan Pro for unlimited plans", upgrade: true },
        { status: 402 },
      );
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = planInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid plan input" },
      { status: 400 },
    );
  }

  try {
    const id = await createPlanForUser(user.id, parsed.data);
    return NextResponse.json({ id });
  } catch (err) {
    console.error("plan creation failed", err);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
