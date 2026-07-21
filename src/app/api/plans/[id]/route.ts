import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });

  const [updated] = await db
    .update(plans)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(plans.id, id), eq(plans.userId, user.id)))
    .returning({ id: plans.id });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [deleted] = await db
    .delete(plans)
    .where(and(eq(plans.id, id), eq(plans.userId, user.id)))
    .returning({ id: plans.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
