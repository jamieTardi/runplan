import { NextResponse } from "next/server";
import { consumeEmailVerification } from "@/lib/auth/verification";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

// Landed from the email link — GET so it works from any mail client.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await consumeEmailVerification(token);
  // appUrl(), not req.url: behind the reverse proxy req.url is localhost.
  return NextResponse.redirect(`${appUrl()}/settings?verified=${ok ? "1" : "0"}`);
}
