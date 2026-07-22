import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validatePassword } from "@/lib/auth/passwordPolicy";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const policyError = validatePassword(parsed.data.newPassword, user.email);
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (row && !row.passwordHash) {
    return NextResponse.json(
      { error: "This account has no password yet — use “Forgot password?” on the sign-in page to set one" },
      { status: 400 },
    );
  }
  const ok = row?.passwordHash && (await verifyPassword(parsed.data.currentPassword, row.passwordHash));
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
