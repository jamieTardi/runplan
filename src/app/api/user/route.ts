import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  unitPref: z.enum(["km", "mi"]).optional(),
});

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await db.update(users).set(parsed.data).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
