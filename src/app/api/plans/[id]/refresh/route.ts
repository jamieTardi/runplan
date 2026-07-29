import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { refreshPlan } from "@/lib/plan/refreshPersist";

const schema = z.object({
  includeStrength: z.boolean().optional(),
});

/**
 * Re-plan the current and future weeks with the latest training engine,
 * keeping history, actuals and Garmin links. The plan's stored settings are
 * reused as-is (use /rebuild to change the schedule), with one exception:
 * strength sessions can be toggled here so rolling plans can retrofit them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  try {
    const summary = await refreshPlan(user.id, id, parsed.data);
    if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("plan refresh failed", err);
    return NextResponse.json({ error: "Failed to refresh plan" }, { status: 500 });
  }
}
