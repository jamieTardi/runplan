import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, type PushSubscriptionRow } from "@/db/schema";
import type { PushPayload } from "./message";

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidApplied = false;
function ensureVapid() {
  if (vapidApplied) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:runplan@tardi.dev",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidApplied = true;
}

/**
 * Deliver one payload to one subscription. Subscriptions the push service
 * reports as gone (404/410 — app uninstalled, permission revoked) are
 * deleted so we stop trying.
 */
export async function sendToSubscription(
  sub: Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth">,
  payload: PushPayload,
): Promise<"sent" | "pruned" | "error"> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 12 * 3600, urgency: "normal" },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      return "pruned";
    }
    console.error(`Push send failed (${status ?? "no status"}):`, err instanceof Error ? err.message : err);
    return "error";
  }
}
