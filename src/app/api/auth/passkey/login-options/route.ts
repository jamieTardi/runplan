import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticationOptions } from "@/lib/auth/webauthn";
import { rateLimit } from "@/lib/auth/ephemeral";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`pk-login:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again later" }, { status: 429 });
  }
  const flowId = randomUUID();
  const options = await authenticationOptions(flowId);
  return NextResponse.json({ flowId, options });
}
