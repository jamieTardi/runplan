import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingEvents, users } from "@/db/schema";
import { stripe } from "@/lib/billing/stripe";
import { sendAdminEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Paid-through grace: keeps access over a failed-payment retry window.
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function periodEnd(sub: Stripe.Subscription): number | null {
  // Newer Stripe API versions carry the period on the subscription item.
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const end = item?.current_period_end ?? legacy;
  return typeof end === "number" ? end * 1000 : null;
}

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  if (!user) {
    console.warn("Stripe webhook: no user for customer", customerId);
    return;
  }
  if (user.plan === "comp") return; // complimentary accounts are never touched

  if (ACTIVE_STATUSES.has(sub.status)) {
    const end = periodEnd(sub);
    await db
      .update(users)
      .set({ plan: "pro", planExpiresAt: end ? new Date(end + GRACE_MS) : null })
      .where(eq(users.id, user.id));
    if (user.plan !== "pro") {
      sendAdminEmail(
        "RunPlan: new Pro subscriber 🎉",
        `${user.name} <${user.email}> is now on Pro (status: ${sub.status}).`,
      ).catch(() => {});
    }
  } else {
    await db.update(users).set({ plan: "free", planExpiresAt: null }).where(eq(users.id, user.id));
    if (user.plan === "pro") {
      sendAdminEmail(
        "RunPlan: subscription ended",
        `${user.name} <${user.email}> dropped to free (status: ${sub.status}).`,
      ).catch(() => {});
    }
  }
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Dedupe Stripe's retries.
  const inserted = await db
    .insert(billingEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id });
  if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break; // acknowledged, not interesting
    }
  } catch (err) {
    console.error(`Stripe webhook ${event.type} failed:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
