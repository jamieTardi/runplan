import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdminForApi } from "@/lib/auth/api";

// Manual plan management: free ⇄ comp. "pro" stays Stripe-owned so a manual
// grant can't be silently revoked (or extended) by subscription webhooks.
const patchSchema = z.object({ plan: z.enum(["free", "comp"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.plan === "pro") {
    return NextResponse.json(
      { error: "This user has an active Stripe subscription — manage it in the Stripe dashboard" },
      { status: 400 },
    );
  }

  await db.update(users).set({ plan: parsed.data.plan, planExpiresAt: null }).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id === auth.user.id) {
    return NextResponse.json({ error: "You can't delete your own account from here" }, { status: 400 });
  }
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.isAdmin) {
    return NextResponse.json({ error: "Admins can't be deleted from the panel" }, { status: 400 });
  }
  if (target.plan === "pro") {
    return NextResponse.json(
      { error: "Cancel their Stripe subscription first (Stripe dashboard), then delete" },
      { status: 400 },
    );
  }

  await db.delete(users).where(eq(users.id, id)); // FKs cascade everything
  return NextResponse.json({ ok: true });
}
