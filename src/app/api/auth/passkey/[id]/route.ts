import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { requireUserForApi } from "@/lib/auth/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, decodeURIComponent(id)), eq(passkeys.userId, auth.user.id)));
  return NextResponse.json({ ok: true });
}
