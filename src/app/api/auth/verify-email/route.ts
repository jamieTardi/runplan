import { NextResponse } from "next/server";
import { consumeEmailVerification } from "@/lib/auth/verification";

export const dynamic = "force-dynamic";

// Landed from the email link — GET so it works from any mail client.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await consumeEmailVerification(token);
  return NextResponse.redirect(new URL(ok ? "/settings?verified=1" : "/settings?verified=0", req.url));
}
