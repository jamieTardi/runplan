import "server-only";
import { randomUUID } from "node:crypto";
import { GarminConnect, type IGarminTokens } from "@flow-js/garmin-connect";
import { GarminSsoError, ssoLogin, ssoSubmitMfa, type MfaPendingState } from "./sso";

/** Thrown for expected Garmin failures so routes can show a friendly message. */
export class GarminError extends Error {}

export interface GarminSession {
  garminUserName: string | null;
  tokens: IGarminTokens;
}

export type GarminLoginOutcome =
  | ({ status: "connected" } & GarminSession)
  | { status: "mfa"; mfaToken: string };

// Pending MFA challenges between the password step and the code step.
// In-memory is fine: single long-lived Node process, short TTL.
const MFA_TTL_MS = 5 * 60 * 1000;
const pendingMfa = new Map<string, { state: MfaPendingState; expiresAt: number }>();

function prunePendingMfa(): void {
  const now = Date.now();
  for (const [k, v] of pendingMfa) if (v.expiresAt < now) pendingMfa.delete(k);
}

/** Trade an SSO ticket for OAuth tokens via the library's exchange. */
async function sessionFromTicket(ticket: string): Promise<GarminSession> {
  const gc = new GarminConnect({ username: "", password: "" });
  try {
    await gc.client.fetchOauthConsumer();
    const oauth1 = await gc.client.getOauth1Token(ticket);
    await gc.client.exchange(oauth1);
  } catch {
    throw new GarminError("Garmin token exchange failed — try again in a minute.");
  }

  const tokens = gc.exportToken();
  let garminUserName: string | null = null;
  try {
    const profile = await gc.getUserProfile();
    garminUserName = profile.userName || profile.displayName || null;
  } catch {
    // Cosmetic only — the connection still works without a display name.
  }
  return { garminUserName, tokens };
}

/**
 * Start a Garmin login. The password is used once for the SSO exchange and
 * never persisted. Accounts with MFA get an `mfa` outcome — finish with
 * completeGarminMfa() and the token from here.
 */
export async function beginGarminLogin(email: string, password: string): Promise<GarminLoginOutcome> {
  let result;
  try {
    result = await ssoLogin(email, password);
  } catch (err) {
    if (err instanceof GarminSsoError) throw new GarminError(err.message);
    throw err;
  }

  if (result.status === "ticket") {
    return { status: "connected", ...(await sessionFromTicket(result.ticket)) };
  }

  prunePendingMfa();
  const mfaToken = randomUUID();
  pendingMfa.set(mfaToken, { state: result.state, expiresAt: Date.now() + MFA_TTL_MS });
  return { status: "mfa", mfaToken };
}

/** Finish an MFA login with the code from Garmin (email or authenticator app). */
export async function completeGarminMfa(mfaToken: string, code: string): Promise<GarminSession> {
  prunePendingMfa();
  const pending = pendingMfa.get(mfaToken);
  if (!pending) {
    throw new GarminError("This sign-in attempt expired — start again with your password.");
  }

  let ticket;
  try {
    ticket = await ssoSubmitMfa(pending.state, code);
  } catch (err) {
    if (err instanceof GarminSsoError) throw new GarminError(err.message);
    throw err;
  }

  pendingMfa.delete(mfaToken);
  return sessionFromTicket(ticket);
}

/** Rebuild an authenticated client from stored tokens (no password involved). */
export function clientFromTokens(tokens: IGarminTokens): GarminConnect {
  // The constructor demands a credentials object even when tokens are used.
  const client = new GarminConnect({ username: "", password: "" });
  client.loadToken(tokens.oauth1, tokens.oauth2);
  return client;
}
