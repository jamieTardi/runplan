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
  open,
  onOpenChange,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebuiltWeeks, setRebuiltWeeks] = useState<number | null>(null);

  function close(o: boolean) {
    if (!o) setRebuiltWeeks(null);
    onOpenChange(o);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/refresh`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      setRebuiltWeeks(data.rebuiltWeeks ?? 0);
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
