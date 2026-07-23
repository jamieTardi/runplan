"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { CHANGELOG, CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_DATE } from "@/lib/changelog";

export function ChangelogCard() {
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
    setUnseen(!seen || seen < LATEST_CHANGELOG_DATE);
  }, []);

  const latest = CHANGELOG[0];

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold mb-1 flex items-center gap-2">
            What&apos;s new
            {unseen && (
              <span
                className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                style={{ color: "var(--primary)", background: "var(--primary-soft)" }}
              >
                New
              </span>
            )}
          </h2>
          {latest && (
            <p className="text-sm truncate" style={{ color: "var(--muted)" }}>
              Latest: {latest.title}
            </p>
          )}
        </div>
        <Link href="/changelog" className="btn btn-ghost shrink-0">
          <ScrollText size={16} /> View changelog
        </Link>
      </div>
    </section>
  );
}
