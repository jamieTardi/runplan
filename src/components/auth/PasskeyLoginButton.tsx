"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";

export function PasskeyLoginButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    if (!browserSupportsWebAuthn()) {
      setError("This browser doesn't support passkeys");
      return;
    }
    setBusy(true);
    try {
      const optRes = await fetch("/api/auth/passkey/login-options", { method: "POST" });
      const { flowId, options, error: optError } = await optRes.json();
      if (!optRes.ok) throw new Error(optError ?? "Couldn't start passkey sign-in");

      const response = await startAuthentication({ optionsJSON: options });

      const res = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, response }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Passkey sign-in failed");

      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      // User dismissing the OS prompt throws — keep that quiet.
      const msg = err instanceof Error ? err.message : "Passkey sign-in failed";
      if (!/timed out|not allowed|abort/i.test(msg)) setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 my-1">
        <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
        <span className="text-xs" style={{ color: "var(--faint)" }}>or</span>
        <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>
      <button type="button" className="btn w-full" onClick={signIn} disabled={busy}
        style={{ border: "1px solid var(--border-strong)" }}>
        <Fingerprint size={17} /> {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
      </button>
      {error && (
        <p className="text-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
}
