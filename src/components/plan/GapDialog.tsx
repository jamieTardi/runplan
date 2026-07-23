"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { addDaysISO, todayISO } from "@/lib/plan/dates";
import { distanceIn, type Unit } from "@/lib/units";

interface GapSummary {
  missedCount: number;
  rebuilt: boolean;
  rebuiltWeeks: number;
  resumeWeekKm: number | null;
  easyWeeks: number;
  warnings: string[];
}

/**
 * "Life happens" dialog: mark a stretch of days as missed (injury or life)
 * and optionally rebuild the rest of the plan with a safe return ramp.
 */
export function GapDialog({
  planId,
  unit,
  open,
  onOpenChange,
}: {
  planId: string;
  unit: Unit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const today = todayISO();

  const [startDate, setStartDate] = useState(addDaysISO(today, -6));
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState<"life" | "injury">("life");
  const [rebuild, setRebuild] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GapSummary | null>(null);

  function close(o: boolean) {
    if (!o && result) router.refresh();
    if (!o) setResult(null);
    onOpenChange(o);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/gap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, reason, rebuild }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      setResult(data as GapSummary);
      setBusy(false);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  const distLabel = unit === "mi" ? "mi" : "km";

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Life happens"
      description="Missed some training? Tell the plan and it adapts instead of piling the load back on."
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-bold">{result.missedCount}</span>{" "}
            session{result.missedCount === 1 ? "" : "s"} marked as missed.
          </p>
          {result.rebuilt && result.rebuiltWeeks > 0 && (
            <p className="text-sm">
              The remaining <span className="font-bold">{result.rebuiltWeeks}</span> week
              {result.rebuiltWeeks === 1 ? "" : "s"} were rebuilt — you resume around{" "}
              <span className="font-bold">
                {result.resumeWeekKm != null
                  ? `${distanceIn(result.resumeWeekKm, unit).toFixed(0)} ${distLabel}/week`
                  : "a reduced volume"}
              </span>
              {result.easyWeeks > 0 && (
                <>
                  {" "}with{" "}
                  <span className="font-bold">
                    {result.easyWeeks} easy week{result.easyWeeks === 1 ? "" : "s"}
                  </span>{" "}
                  (no hard sessions) first
                </>
              )}
              . Volume builds back gradually from there.
            </p>
          )}
          {result.warnings.map((w, i) => (
            <p
              key={i}
              className="text-xs rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              {w}
            </p>
          ))}
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={() => close(false)}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">First missed day</span>
              <input
                type="date"
                className="input"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <span className="label">Last missed day</span>
              <input
                type="date"
                className="input"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <span className="label">What happened?</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["life", "Life got in the way"],
                  ["injury", "Injury or illness"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReason(value)}
                  className="btn py-2"
                  style={{
                    background: reason === value ? "var(--primary-soft)" : "var(--surface)",
                    border: `1px solid ${reason === value ? "var(--primary)" : "var(--border-strong)"}`,
                    color: reason === value ? "var(--primary)" : "var(--muted)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {reason === "injury" && (
              <p className="text-xs mt-1.5" style={{ color: "var(--faint)" }}>
                The comeback is extra gentle after injury — lower volume and more easy
                running before quality work returns.
              </p>
            )}
          </div>

          <label
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
            style={{ background: "var(--surface-2)" }}
          >
            <input
              type="checkbox"
              checked={rebuild}
              onChange={(e) => setRebuild(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            <span className="text-sm">
              <span className="font-semibold">Rebuild the rest of my plan</span>{" "}
              <span style={{ color: "var(--muted)" }}>
                (recommended — eases you back in safely instead of resuming at full load)
              </span>
            </span>
          </label>

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
              {busy ? "Updating…" : rebuild ? "Mark missed & rebuild" : "Mark missed"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
