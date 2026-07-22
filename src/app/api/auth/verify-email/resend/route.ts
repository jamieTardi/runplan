import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/auth/api";
import { rateLimit } from "@/lib/auth/ephemeral";
import { issueEmailVerification } from "@/lib/auth/verification";

export async function POST() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (auth.user.emailVerifiedAt) return NextResponse.json({ ok: true, already: true });
  if (!rateLimit(`verify-resend:${auth.user.id}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Verification email already sent — check your inbox" }, { status: 429 });
  }
  try {
    await issueEmailVerification(auth.user.id, auth.user.email);
  } catch (err) {
    console.error("Verification resend failed:", err);
    return NextResponse.json({ error: "Couldn't send the email — try again later" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
