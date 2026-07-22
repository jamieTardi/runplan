import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

// Stripe glue. Dormant until STRIPE_SECRET_KEY + price ids are configured —
// the billing UI hides itself and the gates stay in place either way.

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_MONTHLY &&
      process.env.STRIPE_PRICE_YEARLY,
  );
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export function priceId(interval: "monthly" | "yearly"): string {
  return interval === "monthly" ? process.env.STRIPE_PRICE_MONTHLY! : process.env.STRIPE_PRICE_YEARLY!;
}

/** Stripe customer for this user, created and remembered on first need. */
export async function getOrCreateCustomerId(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { runplanUserId: user.id },
  });
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
  return customer.id;
}
