import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAuthentication } from "@/lib/auth/webauthn";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

const schema = z.object({
  flowId: z.string().uuid(),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const passkey = await verifyAuthentication(
      parsed.data.flowId,
      parsed.data.response as unknown as AuthenticationResponseJSON,
    );
    const { token, expiresAt } = await createSession(passkey.userId);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Passkey sign-in failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
