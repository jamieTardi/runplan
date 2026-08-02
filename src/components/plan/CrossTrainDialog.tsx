"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { CROSS_ACTIVITY_META } from "@/lib/planMeta";
import { crossActivities, type CrossActivity } from "@/db/schema";
import { addDaysISO, todayISO } from "@/lib/plan/dates";

/**
 * Bulk injury swap: replace every run in a date range with like-for-like
 * cross-training sessions — or restore a range back to running once healthy.
 * Completed/missed sessions, rest days, strength and the race are untouched.
 */
export function CrossTrainDialog({
  planId,
  open,
  onOpenChange,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const today = todayISO();

  const [mode, setMode] = useState<"replace" | "restore">("replace");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysISO(today, 13));
  const [activity, setActivity] = useState<CrossActivity>("bike");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ replaced?: number; restored?: number } | null>(null);

  function close(o: boolean) {
    if (!o) setResult(null);
    onOpenChange(o);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/cross-train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "replace" ? { mode, startDate, endDate, activity } : { mode, startDate, endDate },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      setResult(data);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  const count = result?.replaced ?? result?.restored ?? 0;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Cross-training"
      description="Injured but can still train? Swap runs for like-for-like bike, pool or elliptical sessions — and swap them back when you're healthy."
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-bold">{count}</span> session{count === 1 ? "" : "s"}{" "}
            {result.replaced != null
              ? `swapped for ${CROSS_ACTIVITY_META[activity].label.toLowerCase()} cross-training.`
              : "restored to their original runs."}
          </p>
          {count === 0 && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              {mode === "replace"
                ? "No swappable runs in that range — completed, missed, rest, strength and race days are never touched."
                : "No cross-training sessions with a saved original run in that range."}
            </p>
          )}
          {result.replaced != null && count > 0 && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              Each session keeps its planned duration and intensity structure — go by effort or
              heart rate, not speed. Your original runs are saved: use this dialog's restore mode
              (or any session's edit dialog) to bring them back.
            </p>
          )}
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={() => close(false)}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["replace", "Swap runs out"],
                ["restore", "Bring runs back"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className="btn py-2"
                style={{
                  background: mode === value ? "var(--primary-soft)" : "var(--surface)",
                  border: `1px solid ${mode === value ? "var(--primary)" : "var(--border-strong)"}`,
                  color: mode === value ? "var(--primary)" : "var(--muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">From</span>
              <input
                type="date"
                className="input"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <span className="label">To</span>
              <input
                type="date"
                className="input"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {mode === "replace" && (
            <div>
              <span className="label">Activity</span>
              <div className="flex flex-wrap gap-1.5">
                {crossActivities.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setActivity(a)}
                    className="btn py-1.5 px-2.5 text-xs"
                    style={{
                      background: activity === a ? "var(--primary-soft)" : "var(--surface)",
                      border: `1px solid ${activity === a ? "var(--primary)" : "var(--border-strong)"}`,
                      color: activity === a ? "var(--primary)" : "var(--muted)",
                    }}
                  >
                    {CROSS_ACTIVITY_META[a].label}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--faint)" }}>
                Every not-yet-done run in the range becomes a {CROSS_ACTIVITY_META[activity].label.toLowerCase()}{" "}
                session of the same duration and effort. Rest, strength and race days are left alone.
              </p>
            </div>
          )}
          {mode === "restore" && (
            <p className="text-xs" style={{ color: "var(--faint)" }}>
              Every cross-training session in the range goes back to the exact run it replaced —
              type, distance, paces and all.
            </p>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-ghost" onClick={() => close(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirm} disabled={busy}>
              {busy ? "Updating…" : mode === "replace" ? "Swap sessions" : "Restore runs"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
