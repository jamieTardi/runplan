"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { addDaysISO } from "@/lib/plan/dates";
import { performanceVdot, raceDistanceM, vdotToRaceTime } from "@/lib/plan/vdot";
import { RACE_TYPE_LABEL } from "@/lib/planMeta";
import { KM_PER_MI, formatDuration, parseDuration, type Unit } from "@/lib/units";
import type { RaceType } from "@/db/schema";

const RACE_TYPES: RaceType[] = ["5k", "10k", "half", "marathon", "50k", "100k", "100mi", "custom"];

/** Sensible default follow-up distance: one step up, capped at the marathon. */
const NEXT_UP: Partial<Record<RaceType, RaceType>> = {
  "5k": "10k",
  "10k": "half",
  half: "marathon",
};

/**
 * "Plan your next race": chain a follow-up plan straight onto this plan's
 * race. The new plan starts the Monday after race day with recovery week(s),
 * rebuilds on the banked fitness and tapers into the new race — e.g. a
 * marathon 4–6 weeks after your half.
 */
export function NextRaceDialog({
  planId,
  prevRaceType,
  prevCustomDistanceKm,
  prevRaceDateISO,
  prevRaceLabel,
  basisTimeS,
  basisIsActual,
  unit,
  open,
  onOpenChange,
}: {
  planId: string;
  prevRaceType: RaceType;
  prevCustomDistanceKm: number | null;
  prevRaceDateISO: string;
  prevRaceLabel: string;
  /** Time the fitness estimate is anchored on: recorded finish or goal time. */
  basisTimeS: number;
  basisIsActual: boolean;
  unit: Unit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const distLabel = unit === "mi" ? "mi" : "km";
  const toKm = (v: number) => (unit === "mi" ? v * KM_PER_MI : v);

  const prevDistM = raceDistanceM(prevRaceType, prevCustomDistanceKm);
  const basisVdot = performanceVdot(prevDistM, basisTimeS);

  function suggestedTime(rt: RaceType, customKm: number | null): number | null {
    const distM = raceDistanceM(rt, customKm);
    if (!distM || !Number.isFinite(distM)) return null;
    // Equivalent-effort prediction off the previous race, rounded up to a minute.
    return Math.ceil(vdotToRaceTime(basisVdot, distM) / 60) * 60;
  }

  const defaultType = NEXT_UP[prevRaceType] ?? (prevRaceType === "custom" ? "marathon" : prevRaceType);
  const [raceType, setRaceType] = useState<RaceType>(defaultType);
  const [customDist, setCustomDist] = useState("");
  const [raceDate, setRaceDate] = useState(addDaysISO(prevRaceDateISO, 35));
  const [goalTime, setGoalTime] = useState(() => {
    const s = suggestedTime(defaultType, null);
    return s ? formatDuration(s) : "";
  });
  const [goalTouched, setGoalTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function customKm(): number | null {
    const v = parseFloat(customDist);
    return Number.isFinite(v) && v > 0 ? toKm(v) : null;
  }

  function refreshSuggestion(rt: RaceType, km: number | null) {
    if (goalTouched) return;
    const s = suggestedTime(rt, km);
    if (s) setGoalTime(formatDuration(s));
  }

  async function confirm() {
    setError(null);
    const goalTimeS = parseDuration(goalTime);
    if (!goalTimeS) {
      setError("Enter a goal time like 3:45:00");
      return;
    }
    if (raceType === "custom" && !customKm()) {
      setError(`Enter your race distance in ${distLabel}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${planId}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceType,
          customDistanceKm: raceType === "custom" ? customKm() : null,
          goalTimeS,
          raceDateISO: raceDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      onOpenChange(false);
      router.push(`/plans/${data.id}`);
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
      title="Plan your next race"
      description={`Carry your training straight on from ${prevRaceLabel} race day.`}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          The new plan starts the Monday after your race with{" "}
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>
            post-race recovery
          </span>
          , rebuilds on the fitness you&apos;ve already banked, and tapers into the new race —
          no starting from scratch.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Race</span>
            <select
              className="input"
              value={raceType}
              onChange={(e) => {
                const rt = e.target.value as RaceType;
                setRaceType(rt);
                refreshSuggestion(rt, rt === "custom" ? customKm() : null);
              }}
            >
              {RACE_TYPES.map((rt) => (
                <option key={rt} value={rt}>{RACE_TYPE_LABEL[rt]}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Race date</span>
            <input
              type="date"
              className="input"
              value={raceDate}
              min={addDaysISO(prevRaceDateISO, 1)}
              onChange={(e) => setRaceDate(e.target.value)}
            />
          </div>
        </div>

        {raceType === "custom" && (
          <div>
            <span className="label">Distance ({distLabel})</span>
            <input
              type="number"
              className="input"
              value={customDist}
              min={1}
              placeholder={unit === "mi" ? "e.g. 30" : "e.g. 50"}
              onChange={(e) => {
                setCustomDist(e.target.value);
                const v = parseFloat(e.target.value);
                refreshSuggestion("custom", Number.isFinite(v) && v > 0 ? toKm(v) : null);
              }}
            />
          </div>
        )}

        <div>
          <span className="label">Goal time</span>
          <input
            type="text"
            className="input"
            value={goalTime}
            placeholder="h:mm:ss"
            onChange={(e) => {
              setGoalTouched(true);
              setGoalTime(e.target.value);
            }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>
            Suggested from your {prevRaceLabel} {basisIsActual ? "finish" : "goal"} of{" "}
            {formatDuration(basisTimeS)} (equivalent effort{raceType !== prevRaceType ? " at the new distance" : ""}).
          </p>
        </div>

        <p className="text-xs" style={{ color: "var(--faint)" }}>
          Works best 3–8 weeks out: you&apos;ll get{" "}
          {prevDistM >= 42000 ? "two recovery weeks" : "a recovery week"}, a short sharpening
          block at your current volume, then the taper. Longer gaps get a full training build
          after the recovery.
        </p>

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Creating…" : "Create next plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
