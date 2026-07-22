import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { googleAuthUrl, isGoogleConfigured } from "@/lib/auth/google";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "runplan_oauth_state";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl()}/login?error=sso-unavailable`);
  }
  const state = randomBytes(16).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthUrl(state));
}
