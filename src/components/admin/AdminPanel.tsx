"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  plan: "free" | "pro" | "comp";
  planExpiresAt: string | null;
  emailVerifiedAt: string | null;
  isAdmin: boolean;
  stripeCustomerId: string | null;
  createdAt: string;
  planCount: number;
  garminConnected: boolean;
}

const PLAN_STYLE: Record<AdminUser["plan"], { label: string; bg: string }> = {
  free: { label: "Free", bg: "var(--surface-2)" },
  pro: { label: "Pro", bg: "color-mix(in srgb, var(--primary) 18%, transparent)" },
  comp: { label: "Comp", bg: "color-mix(in srgb, var(--accent) 18%, transparent)" },
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function AdminPanel() {
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setRows((await res.json()).users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setPlan(user: AdminUser, plan: "free" | "comp") {
    setMsg(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(data.error ?? "Update failed");
    await load();
  }

  async function remove(user: AdminUser) {
    if (!confirm(`Delete ${user.email} and ALL their data (plans, workouts, Garmin link)? This can't be undone.`)) return;
    setMsg(null);
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(data.error ?? "Delete failed");
    await load();
  }

  if (rows === null) {
    return <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />;
  }

  const counts = {
    total: rows.length,
    pro: rows.filter((r) => r.plan === "pro").length,
    comp: rows.filter((r) => r.plan === "comp").length,
    verified: rows.filter((r) => r.emailVerifiedAt).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ["Users", counts.total],
            ["Pro (paying)", counts.pro],
            ["Comp", counts.comp],
            ["Verified", counts.verified],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--faint)" }}>{label}</div>
            <div className="text-xl font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {msg && <p className="text-sm" style={{ color: "var(--danger)" }}>{msg}</p>}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--faint)" }}>
              <th className="px-4 py-3">User</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">Paid until</th>
              <th className="px-3 py-3">Plans</th>
              <th className="px-3 py-3">Garmin</th>
              <th className="px-3 py-3">Joined</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-2.5">
                  <div className="font-semibold">
                    {u.name} {u.isAdmin && <span className="text-xs" style={{ color: "var(--primary)" }}>· admin</span>}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {u.email} {u.emailVerifiedAt ? "✓" : <span style={{ color: "var(--danger)" }}>(unverified)</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: PLAN_STYLE[u.plan].bg }}>
                    {PLAN_STYLE[u.plan].label}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--muted)" }}>
                  {u.plan === "pro" ? fmtDate(u.planExpiresAt) : "—"}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{u.planCount}</td>
                <td className="px-3 py-2.5">{u.garminConnected ? "✓" : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--muted)" }}>{fmtDate(u.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {u.plan === "free" && (
                      <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => setPlan(u, "comp")}>
                        Grant comp
                      </button>
                    )}
                    {u.plan === "comp" && !u.isAdmin && (
                      <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => setPlan(u, "free")}>
                        Revoke comp
                      </button>
                    )}
                    {!u.isAdmin && (
                      <button
                        className="btn btn-ghost text-xs px-2 py-1"
                        style={{ color: "var(--danger)" }}
                        onClick={() => remove(u)}
                        aria-label={`Delete ${u.email}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--faint)" }}>
        “Paid until” includes a 3-day grace period past the Stripe billing date. Paying (Pro)
        subscriptions are managed in the Stripe dashboard — cancellations downgrade here
        automatically via webhook, and you get an email either way.
      </p>
    </div>
  );
}
