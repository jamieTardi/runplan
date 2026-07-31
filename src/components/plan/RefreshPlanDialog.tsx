"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

/**
 * "Update workouts" dialog: re-plan this week and future weeks with the
 * latest training engine, keeping everything already done. The way to pick
 * up plan-generator improvements shipped after a plan was created.
 */
export function RefreshPlanDialog({
  planId,
  includeStrength: currentStrength,
  currentVdot,
  estimateVdot,
  open,
  onOpenChange,
}: {
  planId: string;
  includeStrength: boolean;
  /** VDOT the plan's paces are currently derived from. */
  currentVdot: number;
  /** Estimator's current-fitness VDOT (null when not enough recorded runs). */
  estimateVdot: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebuiltWeeks, setRebuiltWeeks] = useState<number | null>(null);
  const [newVdot, setNewVdot] = useState<number | null>(null);
  const [includeStrength, setIncludeStrength] = useState(currentStrength);
  const [recalibrate, setRecalibrate] = useState(false);

  function close(o: boolean) {
    if (!o) {
      setRebuiltWeeks(null);
      setNewVdot(null);
    }
    onOpenChange(o);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeStrength, recalibratePaces: recalibrate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      setRebuiltWeeks(data.rebuiltWeeks ?? 0);
      setNewVdot(data.vdot ?? null);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Update workouts"
      description="Re-plan the rest of your schedule with the latest RunPlan training engine."
    >
      {rebuiltWeeks != null ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {rebuiltWeeks > 0 ? (
              <>
                This week and the{" "}
                <span className="font-bold">
                  {rebuiltWeeks - 1 > 0 ? `${rebuiltWeeks - 1} following week${rebuiltWeeks - 1 === 1 ? "" : "s"}` : "rest of the plan"}
                </span>{" "}
                were re-planned with the latest improvements.
              </>
            ) : (
              <>Nothing left to update — the plan is already finished.</>
            )}
          </p>
          {newVdot != null && (
            <p className="text-sm">
              Training paces are now set from your current fitness —{" "}
              <span className="font-bold tabular-nums">VDOT {newVdot.toFixed(1)}</span>. Your goal
              time is unchanged.
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
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            We regularly improve how plans are built. This rebuilds{" "}
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>
              this week and every week ahead
            </span>{" "}
            using your plan&apos;s current settings, so your schedule picks up the
            latest improvements.
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Everything already done is kept: past weeks, completed runs, recorded
            times, notes and Garmin history. Upcoming sessions may change distance
            or type; sessions already sent to Garmin are replaced on your next sync.
          </p>
          <label
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
            style={{ background: "var(--surface-2)" }}
          >
            <input
              type="checkbox"
              checked={includeStrength}
              onChange={(e) => setIncludeStrength(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            <span className="text-sm">
              <span className="font-semibold">Include strength sessions</span>{" "}
              <span style={{ color: "var(--muted)" }}>
                (two short bodyweight routines a week on easy days)
              </span>
            </span>
          </label>
          {estimateVdot != null && (
            <label
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
              style={{ background: "var(--surface-2)" }}
            >
              <input
                type="checkbox"
                checked={recalibrate}
                onChange={(e) => setRecalibrate(e.target.checked)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              <span className="text-sm">
                <span className="font-semibold">
                  Set paces from your current VDOT{" "}
                  <span className="tabular-nums">
                    ({currentVdot.toFixed(1)} → {estimateVdot.toFixed(1)})
                  </span>
                </span>{" "}
                <span style={{ color: "var(--muted)" }}>
                  (easy and workout paces re-planned from your recorded runs; your goal time stays
                  the same)
                </span>
              </span>
            </label>
          )}
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => close(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirm} disabled={busy}>
              {busy ? "Updating…" : "Update workouts"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
