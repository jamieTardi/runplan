import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { SESSION_COOKIE, validateSessionToken } from "./session";

/** Resolve the current user from the session cookie (memoised per request). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return rows[0] ?? null;
});

/** Require an authenticated user or redirect to /login. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
