"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, Smartphone } from "lucide-react";
import type { Unit } from "@/lib/units";
import { ThemeToggle } from "./ThemeToggle";
import { FontSizeControl } from "./FontSizeControl";
import { PasskeysCard } from "./PasskeysCard";

export function SettingsForm({
  initialName,
  email,
  initialUnit,
}: {
  initialName: string;
  email: string;
  initialUnit: Unit;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const [savedProfile, setSavedProfile] = useState(false);

  const [cur, setCur] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function patchUser(data: { name?: string; unitPref?: Unit }) {
    await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
  }

  async function chooseUnit(u: Unit) {
    setUnit(u);
    await patchUser({ unitPref: u });
  }

  async function saveProfile() {
    await patchUser({ name: name.trim() || initialName });
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 1800);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function changePassword() {
    setPwMsg(null);
    if (next1 !== next2) {
      setPwMsg({ ok: false, text: "New passwords don't match" });
      return;
    }
    setPwBusy(true);
    const res = await fetch("/api/user/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: next1 }),
    });
    const data = await res.json().catch(() => ({}));
    setPwBusy(false);
    if (!res.ok) {
      setPwMsg({ ok: false, text: data.error ?? "Failed to update password" });
      return;
    }
    setCur("");
    setNext1("");
    setNext2("");
    setPwMsg({ ok: true, text: "Password updated" });
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <section className="card p-5">
        <h2 className="font-bold mb-4">Units</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["km", "mi"] as const).map((u) => (
            <button
              key={u}
              onClick={() => chooseUnit(u)}
              className="btn"
              style={{
                background: unit === u ? "var(--primary-soft)" : "var(--surface)",
                border: `1px solid ${unit === u ? "var(--primary)" : "var(--border-strong)"}`,
                color: unit === u ? "var(--primary)" : "var(--muted)",
              }}
            >
              {u === "km" ? "Kilometres" : "Miles"}
            </button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>
          Distances and paces are shown in this unit everywhere.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="font-bold mb-4">Appearance</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--muted)" }}>Toggle light / dark theme</span>
          <ThemeToggle />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-bold mb-4">Accessibility</h2>
        <FontSizeControl />
      </section>

      <section className="card p-5">
        <h2 className="font-bold mb-1">Install the app</h2>
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          On Android, download the app and open the file to install it (allow installs from
          your browser if asked). Or use your browser&apos;s &ldquo;Add to Home Screen&rdquo; /
          &ldquo;Install app&rdquo; option on any device.
        </p>
        <a className="btn btn-primary self-start" href="/runplan.apk" download>
          <Smartphone size={16} /> Download for Android (.apk)
        </a>
      </section>

      <PasskeysCard />

      <section className="card p-5">
        <h2 className="font-bold mb-4">Profile</h2>
        <div className="flex flex-col gap-3">
          <div>
            <span className="label">Display name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <span className="label">Email</span>
            <input className="input" value={email} disabled style={{ opacity: 0.6 }} />
          </div>
          <button className="btn btn-primary self-start" onClick={saveProfile}>
            {savedProfile ? (<><Check size={16} /> Saved</>) : "Save profile"}
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-bold mb-4">Change password</h2>
        <div className="flex flex-col gap-3">
          <div>
            <span className="label">Current password</span>
            <input type="password" className="input" value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className="label">New password</span>
              <input type="password" className="input" value={next1} autoComplete="new-password" onChange={(e) => setNext1(e.target.value)} />
            </div>
            <div>
              <span className="label">Confirm new password</span>
              <input type="password" className="input" value={next2} autoComplete="new-password" onChange={(e) => setNext2(e.target.value)} />
            </div>
          </div>
          {pwMsg && (
            <p className="text-sm" style={{ color: pwMsg.ok ? "var(--accent)" : "var(--danger)" }}>{pwMsg.text}</p>
          )}
          <button className="btn btn-primary self-start" onClick={changePassword} disabled={pwBusy || !cur || !next1}>
            {pwBusy ? "Updating…" : "Update password"}
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-bold mb-1">Account</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Signed in as {email}
        </p>
        <button className="btn btn-ghost self-start" onClick={signOut} style={{ color: "var(--danger)" }}>
          <LogOut size={16} /> Sign out
        </button>
      </section>
    </div>
  );
}
