import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passkeys, type Passkey, type User } from "@/db/schema";
import { appUrl } from "@/lib/email";
import { putChallenge, takeChallenge } from "./ephemeral";

// WebAuthn is bound to the site origin: passkeys registered on the public
// HTTPS URL (APP_URL) work in browsers and in the Android TWA alike, but not
// when the app is opened via a bare LAN IP.

const RP_NAME = "RunPlan";

function rpID(): string {
  return process.env.RP_ID ?? new URL(appUrl()).hostname;
}

export async function registrationOptions(user: User, plain = false) {
  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: p.transports ? (p.transports.split(",") as never) : undefined,
    })),
    // Strict = straight to this device's biometric prompt. Some Android /
    // Google Password Manager combos throw UnknownError on the strict set,
    // so the client can retry once with `plain` relaxed options.
    authenticatorSelection: plain
      ? { residentKey: "preferred", userVerification: "preferred" }
      : { residentKey: "required", userVerification: "required" },
    ...(plain ? {} : { preferredAuthenticatorType: "localDevice" as const }),
  });
  putChallenge(`webauthn:reg:${user.id}`, options.challenge);
  return options;
}

export async function verifyRegistration(user: User, response: RegistrationResponseJSON, name: string) {
  const expectedChallenge = takeChallenge(`webauthn:reg:${user.id}`);
  if (!expectedChallenge) throw new Error("Registration expired — try again");

  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: appUrl(),
    expectedRPID: rpID(),
  });
  if (!verified || !registrationInfo) throw new Error("Passkey verification failed");

  const { credential } = registrationInfo;
  await db.insert(passkeys).values({
    id: credential.id,
    userId: user.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: credential.transports?.join(",") ?? null,
    name: name || "Passkey",
  });
}

export async function authenticationOptions(flowId: string) {
  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    userVerification: "required", // biometric/PIN, matching registration
    // no allowCredentials → the authenticator offers its discoverable passkeys
  });
  putChallenge(`webauthn:auth:${flowId}`, options.challenge);
  // Steer straight to this device's biometric prompt, not the QR/device picker.
  return { ...options, hints: ["client-device" as const] };
}

/** Verifies a sign-in assertion; returns the passkey row (with userId) on success. */
export async function verifyAuthentication(
  flowId: string,
  response: AuthenticationResponseJSON,
): Promise<Passkey> {
  const expectedChallenge = takeChallenge(`webauthn:auth:${flowId}`);
  if (!expectedChallenge) throw new Error("Sign-in expired — try again");

  const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1);
  if (!passkey) throw new Error("Unknown passkey");

  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: appUrl(),
    expectedRPID: rpID(),
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64")),
      counter: passkey.counter,
      transports: passkey.transports ? (passkey.transports.split(",") as never) : undefined,
    },
  });
  if (!verified) throw new Error("Passkey verification failed");

  await db
    .update(passkeys)
    .set({ counter: authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, passkey.id));
  return passkey;
}
