"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Unplug, Watch } from "lucide-react";

export function GarminCard({
  initialConnected,
  initialUserName,
  initialLastSyncAt,
}: {
  initialConnected: boolean;
  initialUserName: string | null;
  initialLastSyncAt: string | null;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [userName, setUserName] = useState(initialUserName);
  const [lastSyncAt, setLastSyncAt] = useState(initialLastSyncAt);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/garmin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Failed to connect to Garmin" });
      return;
    }
    setConnected(true);
    setUserName(data.garminUserName ?? null);
    setEmail("");
    setPassword("");
    setMsg({ ok: true, text: "Connected to Garmin" });
  }

  async function syncNow() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/garmin/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Sync failed" });
      return;
    }
    setLastSyncAt(new Date().toISOString());
    setMsg({
      ok: true,
      text:
        data.matched > 0
          ? `Marked ${data.matched} workout${data.matched === 1 ? "" : "s"} complete (${data.scanned} recent run${data.scanned === 1 ? "" : "s"} scanned)`
          : `No new matches (${data.scanned} recent run${data.scanned === 1 ? "" : "s"} scanned)`,
    });
    router.refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect Garmin? Stored tokens are deleted; completed workouts keep their data.")) return;
    setBusy(true);
    await fetch("/api/garmin", { method: "DELETE" });
    setBusy(false);
    setConnected(false);
    setUserName(null);
    setLastSyncAt(null);
    setMsg(null);
  }

  return (
    <section className="card p-5">
      <h2 className="font-bold mb-1 flex items-center gap-2">
        <Watch size={18} /> Garmin Connect
      </h2>
      {connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Connected{userName ? ` as ${userName}` : ""}.{" "}
            {lastSyncAt
              ? `Last synced ${new Date(lastSyncAt).toLocaleString()}.`
              : "Not synced yet."}
          </p>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            Recent Garmin runs are matched to planned sessions by date and distance, marking them
            complete with the actual distance and time. Runs also sync automatically once a day.
          </p>
          {msg && (
            <p className="text-sm" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.text}</p>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={syncNow} disabled={busy}>
              <RefreshCw size={16} /> {busy ? "Syncing…" : "Sync now"}
            </button>
            <button className="btn btn-ghost" onClick={disconnect} disabled={busy} style={{ color: "var(--danger)" }}>
              <Unplug size={16} /> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Sign in with your Garmin account to automatically tick off planned sessions from your
            watch activities.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className="label">Garmin email</span>
              <input
                className="input"
                type="email"
                value={email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <span className="label">Garmin password</span>
              <input
                className="input"
                type="password"
                value={password}
                autoComplete="off"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            Your password is used once to sign in to Garmin and is never stored — only the
            resulting session tokens are kept. Accounts with two-factor authentication aren&apos;t
            supported yet.
          </p>
          {msg && (
            <p className="text-sm" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.text}</p>
          )}
          <button
            className="btn btn-primary self-start"
            onClick={connect}
            disabled={busy || !email || !password}
          >
            {busy ? "Connecting…" : "Connect Garmin"}
          </button>
        </div>
      )}
    </section>
  );
}
