"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const p1 = String(form.get("password") ?? "");
    const p2 = String(form.get("password2") ?? "");
    if (p1 !== p2) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: p1 }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 1500);
  }

  if (!token) {
    return (
      <p className="text-sm">
        This reset link is missing its token.{" "}
        <Link href="/forgot-password" style={{ color: "var(--primary)" }}>
          Request a new one
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return <p className="text-sm">Password updated — taking you to sign in…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          placeholder="10+ characters"
          required
          minLength={10}
          autoComplete="new-password"
        />
        <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>
          At least 10 characters, with a letter, a number and a special character.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="password2">
          Confirm new password
        </label>
        <input
          id="password2"
          name="password2"
          type="password"
          className="input"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      )}
      <button className="btn btn-primary" disabled={loading}>
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
