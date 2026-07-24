"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

const PRO_FEATURES = [
  "Keep building plans after your free month (up to 10 saved)",
  "Garmin auto-sync (runs tick themselves off)",
  "Workout detail: route map, heart rate, pace, laps",
  "FIT workout export to your watch + activity upload",
];

export function BillingCard({
  plan,
  stripeEnabled,
}: {
  plan: "free" | "pro" | "comp";
  stripeEnabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string, body?: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setError(data.error ?? "Something went wrong — try again");
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  if (plan === "comp") {
    return (
      <section className="card p-5">
        <h2 className="font-bold mb-1 flex items-center gap-2">
          <Sparkles size={18} style={{ color: "var(--primary)" }} /> RunPlan Pro
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          You have complimentary Pro access — everything&apos;s unlocked. Enjoy!
        </p>
      </section>
    );
  }

  if (plan === "pro") {
    return (
      <section className="card p-5">
        <h2 className="font-bold mb-1 flex items-center gap-2">
          <Sparkles size={18} style={{ color: "var(--primary)" }} /> RunPlan Pro
        </h2>
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          You&apos;re on Pro — thanks for supporting RunPlan.
        </p>
        {error && <p className="text-sm mb-2" style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-ghost self-start" onClick={() => go("/api/billing/portal")} disabled={busy}>
          Manage subscription
        </button>
      </section>
    );
  }

  if (!stripeEnabled) return null;

  return (
    <section className="card p-5">
      <h2 className="font-bold mb-1 flex items-center gap-2">
        <Sparkles size={18} style={{ color: "var(--primary)" }} /> RunPlan Pro
      </h2>
      <ul className="text-sm mb-4 mt-2 flex flex-col gap-1.5">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--primary)" }} />
            {f}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm mb-2" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        <button
          className="btn btn-primary"
          onClick={() => go("/api/billing/checkout", { interval: "monthly" })}
          disabled={busy}
        >
          £1.99 / month
        </button>
        <button
          className="btn"
          style={{ border: "1px solid var(--primary)", color: "var(--primary)" }}
          onClick={() => go("/api/billing/checkout", { interval: "yearly" })}
          disabled={busy}
        >
          £14.99 / year <span className="text-xs opacity-75">(save 37%)</span>
        </button>
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>
        Cancel anytime — you keep Pro until the end of the period you&apos;ve paid for.
      </p>
    </section>
  );
}
