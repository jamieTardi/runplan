"use client";

import { useState } from "react";
import Link from "next/link";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = new FormData(e.currentTarget).get("email");
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          If an account exists for that address, a reset link is on its way. Check your inbox
          (and spam folder) — the link is valid for 1 hour.
        </p>
        <Link href="/login" className="btn btn-primary self-start">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      )}
      <button className="btn btn-primary" disabled={loading}>
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
        Remembered it? <Link href="/login" style={{ color: "var(--primary)" }}>Sign in</Link>
      </p>
    </form>
  );
}
