import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { regeneratePlan } from "@/lib/plan/persist";

// Any subset of schedule settings; merged over the plan's stored inputs.
const schema = z.object({
  raceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  restDow: z.number().int().min(1).max(7).nullable().optional(),
  longRunDow: z.number().int().min(1).max(7).optional(),
  daysPerWeek: z.number().int().min(3).max(7).optional(),
  peakVolumeKm: z.number().positive().max(400).optional(),
  startVolumeKm: z.number().positive().max(300).optional(),
  includeTuneups: z.boolean().optional(),
  allowDoubles: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  try {
    const ok = await regeneratePlan(user.id, id, parsed.data);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("plan rebuild failed", err);
    return NextResponse.json({ error: "Failed to rebuild plan" }, { status: 500 });
  }
}
