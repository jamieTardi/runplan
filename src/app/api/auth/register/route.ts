import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  unitPref: z.enum(["km", "mi"]).default("km"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { name, email, password, unitPref } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash, unitPref })
    .returning({ id: users.id });

  const { token, expiresAt } = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true });
}
