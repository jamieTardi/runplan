import "server-only";
import { GarminConnect, type IGarminTokens } from "@flow-js/garmin-connect";

/** Thrown for expected Garmin failures so routes can show a friendly message. */
export class GarminError extends Error {}

/**
 * Log in with Garmin credentials and return the session tokens. The password
 * is used once for this exchange and never persisted.
 */
export async function loginGarmin(
  email: string,
  password: string,
): Promise<{ garminUserName: string | null; tokens: IGarminTokens }> {
  const client = new GarminConnect({ username: email, password });
  try {
    await client.login();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/MFA/i.test(msg)) {
      throw new GarminError(
        "Garmin sign-in failed. Note: accounts with two-factor authentication aren't supported yet.",
      );
    }
    if (/AccountLocked/i.test(msg)) {
      throw new GarminError("Garmin reports this account as locked — unlock it at connect.garmin.com first.");
    }
    throw new GarminError("Garmin sign-in failed — check your email and password.");
  }

  const tokens = client.exportToken();
  let garminUserName: string | null = null;
  try {
    const profile = await client.getUserProfile();
    garminUserName = profile.userName || profile.displayName || null;
  } catch {
    // Cosmetic only — the connection still works without a display name.
  }
  return { garminUserName, tokens };
}

/** Rebuild an authenticated client from stored tokens (no password involved). */
export function clientFromTokens(tokens: IGarminTokens): GarminConnect {
  // The constructor demands a credentials object even when tokens are used.
  const client = new GarminConnect({ username: "", password: "" });
  client.loadToken(tokens.oauth1, tokens.oauth2);
  return client;
}
