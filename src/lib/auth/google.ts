import "server-only";
import { appUrl } from "@/lib/email";

// Google OIDC, implemented directly: server-side confidential-client code
// exchange over TLS with Google, so decoding the returned id_token's claims
// (with iss/aud/exp checks) is sufficient — no JWKS round-trip needed.

export class GoogleAuthError extends Error {}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${appUrl()}/api/auth/google/callback`;
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    console.error("Google token exchange failed:", res.status, await res.text().catch(() => ""));
    throw new GoogleAuthError("Google sign-in failed — try again");
  }
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) throw new GoogleAuthError("Google sign-in failed — no identity returned");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("Google sign-in failed — malformed token");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("Google sign-in failed — malformed token");
  }

  const iss = claims.iss;
  const aud = claims.aud;
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (
    (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") ||
    aud !== process.env.GOOGLE_CLIENT_ID ||
    exp * 1000 < Date.now()
  ) {
    throw new GoogleAuthError("Google sign-in failed — invalid token");
  }

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!email || !sub) throw new GoogleAuthError("Google account has no usable email");

  return {
    sub,
    email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0],
  };
}
