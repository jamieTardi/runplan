import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@/db/schema";
import { getCurrentUser } from ".";

type ApiAuth = { ok: true; user: User } | { ok: false; response: Response };

/** Auth guard for API routes: returns the user or a ready-made 401 response. */
export async function requireUserForApi(): Promise<ApiAuth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, user };
}

/** Admin guard: 404 (not 403) so the endpoints don't advertise themselves. */
export async function requireAdminForApi(): Promise<ApiAuth> {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth;
  if (!auth.user.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return auth;
}
