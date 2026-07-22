import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired — request a new one" },
      { status: 400 },
    );
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, row.userId));
  // Single use, and sign out everywhere.
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.userId));
  await db.delete(sessions).where(eq(sessions.userId, row.userId));

  return NextResponse.json({ ok: true });
}
