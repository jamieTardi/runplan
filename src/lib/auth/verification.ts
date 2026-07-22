import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { appUrl, sendVerificationEmail } from "@/lib/email";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Issues a fresh verification token and emails the link. Fire-and-forget safe. */
export async function issueEmailVerification(userId: string, email: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.insert(emailVerificationTokens).values({
    tokenHash,
    userId,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  await sendVerificationEmail(email, `${appUrl()}/api/auth/verify-email?token=${token}`);
}

/** Consumes a token; returns true when an email was verified. */
export async function consumeEmailVerification(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(eq(emailVerificationTokens.tokenHash, tokenHash), gt(emailVerificationTokens.expiresAt, new Date())),
    )
    .limit(1);
  if (!row) return false;

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, row.userId));
  return true;
}
