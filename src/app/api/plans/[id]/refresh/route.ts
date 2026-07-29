import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { refreshPlan } from "@/lib/plan/refreshPersist";

/**
 * Re-plan the current and future weeks with the latest training engine,
 * keeping history, actuals and Garmin links. No body — the plan's stored
 * settings are reused as-is (use /rebuild to change settings).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const summary = await refreshPlan(user.id, id);
    if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("plan refresh failed", err);
    return NextResponse.json({ error: "Failed to refresh plan" }, { status: 500 });
  }
}
