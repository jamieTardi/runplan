import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const ok = row && (await verifyPassword(parsed.data.currentPassword, row.passwordHash));
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
