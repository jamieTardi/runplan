"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { todayISO } from "@/lib/plan/dates";
import { KM_PER_MI, type Unit } from "@/lib/units";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface PlanSettings {
  raceDate: string;
  daysPerWeek: number;
  longRunDow: number;
  restDow: number | null;
  peakVolumeKm: number;
  allowDoubles: boolean;
}

export function EditPlanDialog({
  planId,
  unit,
  current,
  open,
  onOpenChange,
}: {
  planId: string;
  unit: Unit;
  current: PlanSettings;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const distLabel = unit === "mi" ? "mi" : "km";
  const fromKm = (km: number) => (unit === "mi" ? km / KM_PER_MI : km);
  const toKm = (v: number) => (unit === "mi" ? v * KM_PER_MI : v);

  const [raceDate, setRaceDate] = useState(current.raceDate);
  const [daysPerWeek, setDaysPerWeek] = useState(current.daysPerWeek);
  const [longRunDow, setLongRunDow] = useState(current.longRunDow);
  const [restDow, setRestDow] = useState<number | null>(current.restDow);
  const [peak, setPeak] = useState(String(+fromKm(current.peakVolumeKm).toFixed(1)));
  const [allowDoubles, setAllowDoubles] = useState(current.allowDoubles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseLongRun(dow: number) {
    setLongRunDow(dow);
    if (restDow === dow) setRestDow(null); // can't rest on the long-run day
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const peakKm = toKm(parseFloat(peak));
    try {
      const res = await fetch(`/api/plans/${planId}/rebuild`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceDateISO: raceDate,
          daysPerWeek,
          longRunDow,
          restDow: daysPerWeek === 7 ? null : restDow,
          peakVolumeKm: Number.isFinite(peakKm) ? peakKm : undefined,
          allowDoubles,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update");
        setBusy(false);
        return;
      }
      onOpenChange(false);
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
      title="Edit plan"
      description="The schedule is rebuilt around your changes. Completed sessions are kept."
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className="label">Race date</span>
          <input type="date" className="input" value={raceDate} min={todayISO()} onChange={(e) => setRaceDate(e.target.value)} />
        </div>

        <div>
          <span className="label">Running days per week</span>
          <div className="grid grid-cols-5 gap-1.5">
            {[3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDaysPerWeek(d)}
                className="btn py-2"
                style={{
                  background: daysPerWeek === d ? "var(--primary-soft)" : "var(--surface)",
                  border: `1px solid ${daysPerWeek === d ? "var(--primary)" : "var(--border-strong)"}`,
                  color: daysPerWeek === d ? "var(--primary)" : "var(--muted)",
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Long run day</span>
            <select className="input" value={longRunDow} onChange={(e) => chooseLongRun(Number(e.target.value))}>
              {DOW.map((d, i) => (
                <option key={d} value={i + 1}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Rest day</span>
            <select
              className="input"
              value={restDow ?? ""}
              disabled={daysPerWeek === 7}
              onChange={(e) => setRestDow(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Auto</option>
              {DOW.map((d, i) => (
                <option key={d} value={i + 1} disabled={i + 1 === longRunDow}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        {daysPerWeek === 7 && (
          <p className="text-xs -mt-2" style={{ color: "var(--faint)" }}>
            No rest day at 7 days per week — lower the days to add one.
          </p>
        )}

        <div>
          <span className="label">Target peak volume ({distLabel})</span>
          <input type="number" className="input" value={peak} min={0} onChange={(e) => setPeak(e.target.value)} />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={allowDoubles} onChange={(e) => setAllowDoubles(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          <span className="text-sm">
            Double run days on high-volume weeks{" "}
            <span style={{ color: "var(--faint)" }}>(AM run + short PM shakeout)</span>
          </span>
        </label>

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Rebuilding…" : "Rebuild plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
