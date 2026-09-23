"use client";

import { Plus, X } from "lucide-react";
import type { RaceType } from "@/db/schema";
import type { RacePriority, SupportingRace } from "@/lib/plan/types";
import { RACE_TYPE_LABEL } from "@/lib/planMeta";
import { KM_PER_MI, formatDuration, parseDuration, type Unit } from "@/lib/units";

const RACE_TYPES: RaceType[] = ["5k", "10k", "half", "marathon", "50k", "100k", "100mi", "custom"];

/** What each priority buys you, in the runner's words. */
export const PRIORITY_META: Record<RacePriority, { label: string; blurb: string }> = {
  b: {
    label: "B — it matters",
    blurb: "A few easy days before and after, so you arrive fresh and recover properly.",
  },
  c: {
    label: "C — training race",
    blurb: "Run it as a hard session inside the block: one easy day before, back to work after.",
  },
};

/** A row being edited. Text fields stay strings until the whole list is parsed. */
export interface RaceDraft {
  id: string;
  name: string;
  raceType: RaceType;
  customDist: string;
  dateISO: string;
  priority: RacePriority;
  goalTime: string;
}

function newId(): string {
  const c = globalThis.crypto;
  // randomUUID needs a secure context; the fallback is only a list key.
  return c?.randomUUID ? c.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newRaceDraft(dateISO: string): RaceDraft {
  return { id: newId(), name: "", raceType: "10k", customDist: "", dateISO, priority: "c", goalTime: "" };
}

export function racesToDrafts(races: SupportingRace[], unit: Unit): RaceDraft[] {
  return races.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    raceType: r.raceType,
    customDist:
      r.customDistanceKm != null
        ? String(+(unit === "mi" ? r.customDistanceKm / KM_PER_MI : r.customDistanceKm).toFixed(1))
        : "",
    dateISO: r.dateISO,
    priority: r.priority,
    goalTime: r.goalTimeS ? formatDuration(r.goalTimeS) : "",
  }));
}

/** Parse the rows into plan input. Returns the first problem found, if any. */
export function draftsToRaces(
  drafts: RaceDraft[],
  unit: Unit,
): { races: SupportingRace[]; error: string | null } {
  const races: SupportingRace[] = [];
  for (const d of drafts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateISO)) {
      return { races: [], error: "Give every race a date" };
    }
    let customDistanceKm: number | null = null;
    if (d.raceType === "custom") {
      const v = parseFloat(d.customDist);
      if (!Number.isFinite(v) || v <= 0) {
        return { races: [], error: "Enter a distance for your custom race" };
      }
      customDistanceKm = Math.round((unit === "mi" ? v * KM_PER_MI : v) * 10) / 10;
    }
    let goalTimeS: number | null = null;
    if (d.goalTime.trim()) {
      const parsed = parseDuration(d.goalTime);
      if (!parsed) return { races: [], error: "Race times look like 45:00 or 1:35:00" };
      goalTimeS = parsed;
    }
    races.push({
      id: d.id,
      name: d.name.trim() || null,
      raceType: d.raceType,
      customDistanceKm,
      dateISO: d.dateISO,
      priority: d.priority,
      goalTimeS,
    });
  }
  return { races, error: null };
}

/**
 * Editor for the season's other races — the B and C races that sit inside a
 * plan built around one goal race. Shared by the plan builder and the plan
 * page so adding a race later works exactly like adding one up front.
 */
export function RaceListEditor({
  value,
  onChange,
  unit,
  maxDateISO,
  minDateISO,
  max = 6,
}: {
  value: RaceDraft[];
  onChange: (next: RaceDraft[]) => void;
  unit: Unit;
  /** Latest date a supporting race may sit on (a week before the goal race). */
  maxDateISO: string;
  minDateISO?: string;
  max?: number;
}) {
  const distLabel = unit === "mi" ? "mi" : "km";

  function patch(id: string, p: Partial<RaceDraft>) {
    onChange(value.map((d) => (d.id === id ? { ...d, ...p } : d)));
  }

  function add() {
    const seed = value.length ? value[value.length - 1].dateISO : (minDateISO ?? maxDateISO);
    onChange([...value, newRaceDraft(seed > maxDateISO ? maxDateISO : seed)]);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((d) => (
        <div
          key={d.id}
          className="rounded-xl p-3 flex flex-col gap-2.5"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)" }}
        >
          <div className="flex items-start gap-2">
            <input
              className="input flex-1"
              value={d.name}
              maxLength={60}
              placeholder="Race name (optional)"
              onChange={(e) => patch(d.id, { name: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-ghost px-2 py-2 shrink-0"
              onClick={() => onChange(value.filter((x) => x.id !== d.id))}
              aria-label="Remove race"
              style={{ color: "var(--danger)" }}
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col">
              <span className="label">Distance</span>
              <select
                className="input"
                value={d.raceType}
                onChange={(e) => patch(d.id, { raceType: e.target.value as RaceType })}
              >
                {RACE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>{RACE_TYPE_LABEL[rt]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="label">Date</span>
              <input
                type="date"
                className="input"
                value={d.dateISO}
                min={minDateISO}
                max={maxDateISO}
                onChange={(e) => patch(d.id, { dateISO: e.target.value })}
              />
            </label>
          </div>

          {d.raceType === "custom" && (
            <label className="flex flex-col">
              <span className="label">Race distance ({distLabel})</span>
              <input
                type="number"
                className="input"
                value={d.customDist}
                min={1}
                placeholder={unit === "mi" ? "e.g. 6" : "e.g. 10"}
                onChange={(e) => patch(d.id, { customDist: e.target.value })}
              />
            </label>
          )}

          <div>
            <span className="label">How much does it matter?</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(["b", "c"] as RacePriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch(d.id, { priority: p })}
                  className="btn text-sm py-2 px-1"
                  style={{
                    background: d.priority === p ? "var(--primary-soft)" : "var(--surface)",
                    border: `1px solid ${d.priority === p ? "var(--primary)" : "var(--border-strong)"}`,
                    color: d.priority === p ? "var(--primary)" : "var(--muted)",
                  }}
                >
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--faint)" }}>
              {PRIORITY_META[d.priority].blurb}
            </p>
          </div>

          <label className="flex flex-col">
            <span className="label">Target time (optional)</span>
            <input
              className="input"
              value={d.goalTime}
              placeholder="Leave blank and we'll predict it"
              inputMode="numeric"
              onChange={(e) => patch(d.id, { goalTime: e.target.value })}
            />
          </label>
        </div>
      ))}

      {value.length < max && (
        <button
          type="button"
          className="btn btn-ghost self-start"
          onClick={add}
          style={{ border: "1px dashed var(--border-strong)" }}
        >
          <Plus size={16} /> {value.length ? "Add another race" : "Add a race"}
        </button>
      )}
    </div>
  );
}
