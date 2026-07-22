import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccounts, users } from "@/db/schema";
import { exchangeGoogleCode, GoogleAuthError } from "@/lib/auth/google";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "runplan_oauth_state";
const PROVIDER = "google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, req.url));

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("Google sign-in was interrupted — try again");
  }

  let identity;
  try {
    identity = await exchangeGoogleCode(code);
  } catch (err) {
    return fail(err instanceof GoogleAuthError ? err.message : "Google sign-in failed");
  }

  // 1. Known Google identity → sign in.
  const [linked] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, PROVIDER), eq(oauthAccounts.providerUserId, identity.sub)))
    .limit(1);

  let userId = linked?.userId;

  if (!userId) {
    // 2. Existing account with the same (Google-verified) email → link it.
    const [existing] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
    if (existing) {
      if (!identity.emailVerified) {
        return fail("Google hasn't verified that email address — sign in with your password");
      }
      userId = existing.id;
      if (!existing.emailVerifiedAt) {
        await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, existing.id));
      }
    } else {
      // 3. Brand-new user.
      const [created] = await db
        .insert(users)
        .values({
          name: identity.name,
          email: identity.email,
          passwordHash: null,
          emailVerifiedAt: identity.emailVerified ? new Date() : null,
        })
        .returning({ id: users.id });
      userId = created.id;
    }
    await db.insert(oauthAccounts).values({
      provider: PROVIDER,
      providerUserId: identity.sub,
      userId,
    });
  }

  const { token, expiresAt } = await createSession(userId);
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return NextResponse.redirect(new URL("/", req.url));
}
