import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";
import { verifyRegistration } from "@/lib/auth/webauthn";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export async function GET() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const rows = await db
    .select({
      id: passkeys.id,
      name: passkeys.name,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, auth.user.id));
  return NextResponse.json({ passkeys: rows });
}

const registerSchema = z.object({
  name: z.string().trim().max(60).optional(),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await verifyRegistration(
      auth.user,
      parsed.data.response as unknown as RegistrationResponseJSON,
      parsed.data.name ?? "Passkey",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Passkey registration failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
