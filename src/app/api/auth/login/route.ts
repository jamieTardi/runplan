import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Verify even when the user is missing to keep timing roughly constant.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin");

  if (!user || !ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true });
}
