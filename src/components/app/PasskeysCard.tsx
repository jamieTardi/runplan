"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Plus, Trash2 } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { cancelCeremony, withCeremonyTimeout } from "@/components/auth/passkeyCeremony";

interface PasskeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function PasskeysCard() {
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/passkey");
    if (res.ok) setRows((await res.json()).passkeys);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function ceremony(plain: boolean) {
    const optRes = await fetch("/api/auth/passkey/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plain }),
    });
    const options = await optRes.json();
    if (!optRes.ok) throw new Error(options.error ?? "Couldn't start registration");
    return withCeremonyTimeout(() => startRegistration({ optionsJSON: options }));
  }

  async function add() {
    setMsg(null);
    if (!browserSupportsWebAuthn()) {
      setMsg({ ok: false, text: "This browser doesn't support passkeys" });
      return;
    }
    setBusy(true);
    try {
      let response;
      try {
        response = await ceremony(false);
      } catch (err) {
        // Some Android/credential-manager combos choke on the strict options
        // with a bare UnknownError — retry once with relaxed options.
        const name = err instanceof Error ? err.name : "";
        const msg = err instanceof Error ? err.message : "";
        if (/unknown|notreadable/i.test(`${name} ${msg}`)) {
          response = await ceremony(true);
        } else {
          throw err;
        }
      }

      const deviceName =
        /android/i.test(navigator.userAgent) ? "Android device"
        : /iphone|ipad/i.test(navigator.userAgent) ? "iPhone/iPad"
        : "This device";
      const res = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, name: deviceName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setMsg({ ok: true, text: "Passkey added — you can now sign in with it" });
      await load();
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const m = err instanceof Error ? err.message : "Registration failed";
      if (!/timed out|not allowed|abort/i.test(m)) {
        setMsg({ ok: false, text: name && name !== "Error" ? `${m} (${name})` : m });
      }
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this passkey? You can still sign in with your password.")) return;
    await fetch(`/api/auth/passkey/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="card p-5">
      <h2 className="font-bold mb-1 flex items-center gap-2">
        <Fingerprint size={18} /> Passkeys
      </h2>
      <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
        Sign in with your fingerprint, face or device PIN instead of a password. Add one on
        each device you use.
      </p>

      {rows === null ? (
        <div className="skeleton" style={{ height: 40, borderRadius: 10 }} />
      ) : rows.length === 0 ? (
        <p className="text-sm mb-3" style={{ color: "var(--faint)" }}>
          No passkeys yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 mb-3">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)" }}
            >
              <div>
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs" style={{ color: "var(--faint)" }}>
                  Added {new Date(p.createdAt).toLocaleDateString()}
                  {p.lastUsedAt && ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => remove(p.id)}
                aria-label={`Remove ${p.name}`}
                style={{ color: "var(--danger)" }}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <p className="text-sm mb-2" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.text}</p>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          <Plus size={16} /> {busy ? "Follow your device's prompt…" : "Add a passkey"}
        </button>
        {busy && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              cancelCeremony();
              setBusy(false);
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
