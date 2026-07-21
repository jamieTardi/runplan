import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, invalidateSession } from "@/lib/auth/session";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
