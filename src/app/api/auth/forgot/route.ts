import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { appUrl, sendPasswordResetEmail } from "@/lib/email";
import { rateLimit } from "@/lib/auth/ephemeral";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });
const TOKEN_TTL_MS = 60 * 60 * 1000;

// Always answers { ok: true } so account existence can't be probed.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const { email } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000) || !rateLimit(`forgot:${email}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ ok: true });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.insert(passwordResetTokens).values({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });
    try {
      await sendPasswordResetEmail(email, `${appUrl()}/reset-password?token=${token}`);
    } catch (err) {
      console.error("Password reset email failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
