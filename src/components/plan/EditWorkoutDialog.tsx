"use client";

import { useState } from "react";
import { BarChart3, Send, Watch } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { WORKOUT_META } from "@/lib/planMeta";
import { workoutTypes, type WorkoutType } from "@/db/schema";
import type { DayVM } from "@/lib/plan/viewModel";
import { fmtDayDate } from "./DayCard";
import {
  KM_PER_MI,
  formatDuration,
  parseDuration,
  type Unit,
} from "@/lib/units";

export interface WorkoutPatch {
  completed?: boolean;
  actualDistanceKm?: number | null;
  actualDurationS?: number | null;
  notes?: string | null;
  type?: WorkoutType;
  distanceKm?: number;
}

export function EditWorkoutDialog({
  day,
  unit,
  open,
  onOpenChange,
  onSave,
}: {
  day: DayVM;
  unit: Unit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (patch: WorkoutPatch) => void;
}) {
  const distLabel = unit === "mi" ? "mi" : "km";
  const fromKm = (km: number) => (unit === "mi" ? km / KM_PER_MI : km);
  const toKm = (v: number) => (unit === "mi" ? v * KM_PER_MI : v);

  const [completed, setCompleted] = useState(day.completed);
  const [actualDist, setActualDist] = useState(
    day.actualDistanceKm != null ? String(+fromKm(day.actualDistanceKm).toFixed(2)) : "",
  );
  const [actualTime, setActualTime] = useState(
    day.actualDurationS != null ? formatDuration(day.actualDurationS) : "",
  );
  const [notes, setNotes] = useState(day.notes ?? "");
  const [type, setType] = useState<WorkoutType>(day.type);
  const [plannedDist, setPlannedDist] = useState(String(+fromKm(day.distanceKm).toFixed(2)));
  const [garminState, setGarminState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [garminError, setGarminError] = useState<string | null>(null);

  async function sendToGarmin() {
    setGarminState("sending");
    setGarminError(null);
    try {
      const res = await fetch(`/api/workouts/${day.id}/garmin`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sending to Garmin failed");
      setGarminState("sent");
    } catch (err) {
      setGarminState("error");
      setGarminError(err instanceof Error ? err.message : "Sending to Garmin failed");
    }
  }

  function save() {
    const patch: WorkoutPatch = { completed };
    patch.type = type;
    const pd = parseFloat(plannedDist);
    if (!Number.isNaN(pd)) patch.distanceKm = toKm(pd);

    const ad = parseFloat(actualDist);
    patch.actualDistanceKm = actualDist.trim() === "" || Number.isNaN(ad) ? null : toKm(ad);
    const at = actualTime.trim() === "" ? null : parseDuration(actualTime);
    patch.actualDurationS = at ?? null;
    patch.notes = notes.trim() === "" ? null : notes.trim();

    onSave(patch);
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={WORKOUT_META[day.type].label}
      description={fmtDayDate(day.date)}
    >
      <div className="flex flex-col gap-4">
        <label
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
          style={{ background: "var(--surface-2)" }}
        >
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          <span className="font-semibold text-sm">Mark this session complete</span>
        </label>

        {completed && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">Actual distance ({distLabel})</span>
              <input
                className="input"
                value={actualDist}
                inputMode="decimal"
                placeholder={String(+fromKm(day.distanceKm).toFixed(1))}
                onChange={(e) => setActualDist(e.target.value)}
              />
            </div>
            <div>
              <span className="label">Actual time (h:mm:ss)</span>
              <input
                className="input"
                value={actualTime}
                inputMode="numeric"
                placeholder="optional"
                onChange={(e) => setActualTime(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <span className="label">Notes</span>
          <textarea
            className="input"
            rows={2}
            value={notes}
            placeholder="How did it feel?"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <details className="rounded-lg" style={{ background: "var(--surface-2)" }}>
          <summary className="px-3 py-2 text-sm font-semibold cursor-pointer" style={{ color: "var(--muted)" }}>
            Adjust the planned session
          </summary>
          <div className="grid grid-cols-2 gap-3 p-3 pt-1">
            <div>
              <span className="label">Type</span>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as WorkoutType)}>
                {workoutTypes.map((t) => (
                  <option key={t} value={t}>{WORKOUT_META[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">Planned distance ({distLabel})</span>
              <input
                className="input"
                value={plannedDist}
                inputMode="decimal"
                onChange={(e) => setPlannedDist(e.target.value)}
              />
            </div>
          </div>
        </details>

        <div className="flex gap-2 items-center">
          {day.type !== "rest" && (
            <>
              <a className="btn btn-ghost" href={`/workouts/${day.id}`} title="Full workout detail with Garmin data">
                <BarChart3 size={16} /> <span className="hidden sm:inline">Details</span>
              </a>
              <a
                className="btn btn-ghost"
                href={`/api/workouts/${day.id}/fit`}
                title="Download a structured workout file for your Garmin watch (copy to GARMIN/Workouts over USB)"
              >
                <Watch size={16} /> <span className="hidden sm:inline">.FIT</span>
              </a>
              <button
                className="btn btn-ghost"
                onClick={sendToGarmin}
                disabled={garminState === "sending" || garminState === "sent"}
                title="Create this workout in Garmin Connect, scheduled on this date — it syncs to your watch automatically"
              >
                <Send size={16} />{" "}
                <span className="hidden sm:inline">
                  {garminState === "sending" ? "Sending…" : garminState === "sent" ? "Sent ✓" : "To Garmin"}
                </span>
              </button>
            </>
          )}
          <div className="flex gap-2 justify-end flex-1">
            <button className="btn btn-ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
          </div>
        </div>
        {garminState === "sent" && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Scheduled in Garmin Connect — it will appear on your watch after its next sync.
          </p>
        )}
        {garminError && (
          <p className="text-xs" style={{ color: "var(--danger, #e5484d)" }}>
            {garminError}
          </p>
        )}
      </div>
    </Modal>
  );
}
