"use client";

import { WebAuthnAbortService } from "@simplewebauthn/browser";

// A WebAuthn ceremony can leave the page waiting forever if the OS prompt
// wedges (seen on Android inside the TWA). Every ceremony runs through this
// wrapper: a hard timeout plus a user-facing Cancel that aborts the underlying
// navigator.credentials call, which also dismisses the browser's own UI.

export class CeremonyTimeoutError extends Error {
  constructor() {
    super("The passkey prompt timed out. If your device is stuck on a passkey screen, close and reopen the app.");
  }
}

export function cancelCeremony(): void {
  WebAuthnAbortService.cancelCeremony();
}

export async function withCeremonyTimeout<T>(run: () => Promise<T>, ms = 75_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      cancelCeremony();
      reject(new CeremonyTimeoutError());
    }, ms);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
