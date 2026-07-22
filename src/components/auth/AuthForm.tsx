"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitPref, setUnitPref] = useState<"km" | "mi">("km");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload =
      mode === "register"
        ? {
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            unitPref,
          }
        : { email: form.get("email"), password: form.get("password") };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.push(next);
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "register" && (
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" placeholder="Alex Runner" required autoComplete="name" />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">
            Password
          </label>
          {mode === "login" && (
            <Link href="/forgot-password" className="text-xs mb-1.5" style={{ color: "var(--primary)" }}>
              Forgot password?
            </Link>
          )}
        </div>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
          required
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : undefined}
        />
      </div>

      {mode === "register" && (
        <div>
          <span className="label">Preferred units</span>
          <div className="flex gap-2">
            {(["km", "mi"] as const).map((u) => (
              <button
                type="button"
                key={u}
                onClick={() => setUnitPref(u)}
                className="btn flex-1"
                style={{
                  background: unitPref === u ? "var(--primary-soft)" : "var(--surface)",
                  border: `1px solid ${unitPref === u ? "var(--primary)" : "var(--border-strong)"}`,
                  color: unitPref === u ? "var(--primary)" : "var(--muted)",
                }}
              >
                {u === "km" ? "Kilometres" : "Miles"}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={loading}>
        {loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
      </button>

      <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
        {mode === "register" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
