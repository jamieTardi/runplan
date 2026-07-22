import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserForApi } from "@/lib/auth/api";
import { appUrl } from "@/lib/email";
import { isPro } from "@/lib/billing/plan";
import { getOrCreateCustomerId, isStripeConfigured, priceId, stripe } from "@/lib/billing/stripe";

const schema = z.object({ interval: z.enum(["monthly", "yearly"]) });

export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });
  }
  if (isPro(auth.user)) {
    return NextResponse.json({ error: "You already have RunPlan Pro" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const customer = await getOrCreateCustomerId(auth.user);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId(parsed.data.interval), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl()}/settings?upgraded=1`,
      cancel_url: `${appUrl()}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout failed:", err);
    return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 502 });
  }
}
