"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { addDaysISO } from "@/lib/plan/dates";
import { MAX_SUPPORTING_RACES, MIN_RACE_LEAD_DAYS } from "@/lib/plan/inputSchema";
import type { SupportingRace } from "@/lib/plan/types";
import type { Unit } from "@/lib/units";
import {
  RaceListEditor,
  draftsToRaces,
  racesToDrafts,
  type RaceDraft,
} from "./RaceListEditor";

/**
 * Add, change or drop the season's other races on an existing plan, then
 * rebuild the schedule around them. Everything already run is kept.
 */
export function RacesDialog({
  planId,
  unit,
  races,
  goalRaceLabel,
  goalRaceDateISO,
  planStartISO,
  open,
  onOpenChange,
}: {
  planId: string;
  unit: Unit;
  races: SupportingRace[];
  goalRaceLabel: string;
  goalRaceDateISO: string;
  planStartISO: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<RaceDraft[]>(() => racesToDrafts(races, unit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the rows whenever the dialog is reopened on fresh plan data.
  const [prevRaces, setPrevRaces] = useState(races);
  if (prevRaces !== races) {
    setPrevRaces(races);
    setDrafts(racesToDrafts(races, unit));
  }

  const lastAllowedISO = addDaysISO(goalRaceDateISO, -MIN_RACE_LEAD_DAYS);

  async function confirm() {
    const { races: parsed, error: parseError } = draftsToRaces(drafts, unit);
    if (parseError) {
      setError(parseError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/rebuild`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ races: parsed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update your races");
        setBusy(false);
        return;
      }
      onOpenChange(false);
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
      onOpenChange={onOpenChange}
      title="Your other races"
      description="Add the rest of the season and the plan is rebuilt around it. Completed sessions are kept."
    >
      <div className="flex flex-col gap-4">
        <div
          className="rounded-lg px-3 py-2.5 text-sm"
          style={{ background: "var(--primary-soft)", color: "var(--muted)" }}
        >
          <span className="font-semibold" style={{ color: "var(--primary)" }}>A race</span> ·{" "}
          {goalRaceLabel} on{" "}
          {new Date(goalRaceDateISO).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          — this plan&apos;s goal, with the full taper.
        </div>

        <RaceListEditor
          value={drafts}
          onChange={setDrafts}
          unit={unit}
          minDateISO={planStartISO}
          maxDateISO={lastAllowedISO}
          max={MAX_SUPPORTING_RACES}
        />

        <p className="text-xs" style={{ color: "var(--faint)" }}>
          Each race becomes a race day in the plan — the week around it is reshaped by how much it
          matters, and the training either side is adjusted to suit. Races have to be at least{" "}
          {MIN_RACE_LEAD_DAYS} days before {goalRaceLabel} race day.
        </p>

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Rebuilding…" : "Save & rebuild"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
