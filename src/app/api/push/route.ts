import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { isPushConfigured } from "@/lib/push/webPush";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

// Register this device's push subscription (upsert — re-subscribing after a
// push-service rotation replaces the old keys for the same endpoint).
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push notifications aren't configured on this server" }, { status: 503 });
  }

  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  await db
    .insert(pushSubscriptions)
    .values({ userId: auth.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: auth.user.id, p256dh: keys.p256dh, auth: keys.auth },
    });
  return NextResponse.json({ ok: true });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

export async function DELETE(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, auth.user.id)));
  return NextResponse.json({ ok: true });
}
