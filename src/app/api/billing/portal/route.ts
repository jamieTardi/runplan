import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/auth/api";
import { appUrl } from "@/lib/email";
import { getOrCreateCustomerId, isStripeConfigured, stripe } from "@/lib/billing/stripe";

export async function POST() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });
  }
  try {
    const customer = await getOrCreateCustomerId(auth.user);
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${appUrl()}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal failed:", err);
    return NextResponse.json({ error: "Couldn't open the billing portal — try again" }, { status: 502 });
  }
}
