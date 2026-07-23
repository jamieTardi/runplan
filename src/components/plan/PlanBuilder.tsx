"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RaceType } from "@/db/schema";
import { generatePlan } from "@/lib/plan/generatePlan";
import type { GenerateInput } from "@/lib/plan/types";
import { RACE_TYPE_LABEL } from "@/lib/planMeta";
import {
  KM_PER_MI,
  formatDistance,
  formatPace,
  formatPaceRange,
  parseDuration,
  type Unit,
} from "@/lib/units";
import { VolumeChart } from "./VolumeChart";

const RACE_TYPES: RaceType[] = ["5k", "10k", "half", "marathon", "50k", "100k", "100mi", "custom"];
// Fixed-length distances usable as a recent-race fitness marker.
const RECENT_RACE_TYPES = RACE_TYPES.filter((r) => r !== "custom") as Exclude<RaceType, "custom">[];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GOAL_PLACEHOLDER: Record<RaceType, string> = {
  "5k": "18:30",
  "10k": "38:00",
  half: "1:25:00",
  marathon: "2:59:00",
  "50k": "4:30:00",
  "100k": "10:00:00",
  "100mi": "24:00:00",
  custom: "5:00:00",
};

const VERDICT_COLOR: Record<string, string> = {
  comfortable: "#10b981",
  realistic: "#22c55e",
  ambitious: "#f59e0b",
  very_ambitious: "#ef4444",
};
const VERDICT_LABEL: Record<string, string> = {
  comfortable: "Comfortable",
  realistic: "Realistic",
  ambitious: "Ambitious",
  very_ambitious: "Very ambitious",
};

function toKm(v: number, unit: Unit) {
  return unit === "mi" ? v * KM_PER_MI : v;
}

export function PlanBuilder({
  unit,
  todayISO,
  defaultRaceDateISO,
}: {
  unit: Unit;
  todayISO: string;
  defaultRaceDateISO: string;
}) {
  const router = useRouter();
  const distLabel = unit === "mi" ? "mi" : "km";

  const [name, setName] = useState("");
  const [raceType, setRaceType] = useState<RaceType>("marathon");
  const [customDist, setCustomDist] = useState("");
  const [goalTime, setGoalTime] = useState("2:59:00");
  const [raceDate, setRaceDate] = useState(defaultRaceDateISO);
  const [fitnessMode, setFitnessMode] = useState<"race" | "estimate">("race");
  const [recentRaceType, setRecentRaceType] = useState<Exclude<RaceType, "custom">>("half");
  const [recentTime, setRecentTime] = useState("1:25:00");
  const [easyPace, setEasyPace] = useState(unit === "mi" ? "8:00" : "5:00");
  const [currentVol, setCurrentVol] = useState(unit === "mi" ? "45" : "70");
  const [peakVol, setPeakVol] = useState(unit === "mi" ? "62" : "100");
  const [daysPerWeek, setDaysPerWeek] = useState(6);
  const [longRunDow, setLongRunDow] = useState(7);
  const [restDow, setRestDow] = useState<number | null>(1); // Monday by default
  const [includeTuneups, setIncludeTuneups] = useState(true);
  const [allowDoubles, setAllowDoubles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Build metric input & preview ----------------------------------------
  const { input, plan, buildError } = useMemo(() => {
    try {
      const goalTimeS = parseDuration(goalTime);
      const startVolumeKm = toKm(parseFloat(currentVol), unit);
      const peakVolumeKm = toKm(parseFloat(peakVol), unit);
      if (!goalTimeS || !startVolumeKm || !peakVolumeKm) {
        return { input: null, plan: null, buildError: null };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) {
        return { input: null, plan: null, buildError: "Choose a race date" };
      }

      let customDistanceKm: number | null = null;
      if (raceType === "custom") {
        const parsed = toKm(parseFloat(customDist), unit);
        if (!parsed || parsed <= 0) {
          return { input: null, plan: null, buildError: "Enter your race distance" };
        }
        customDistanceKm = Math.round(parsed * 10) / 10;
      }

      let currentFitness: GenerateInput["currentFitness"];
      if (fitnessMode === "race") {
        const timeS = parseDuration(recentTime);
        if (!timeS) return { input: null, plan: null, buildError: "Enter your recent race time" };
        currentFitness = { mode: "race", raceType: recentRaceType, timeS };
      } else {
        const perUnit = parseDuration(easyPace);
        if (!perUnit) return { input: null, plan: null, buildError: "Enter your easy pace" };
        const easyPaceSecPerKm = unit === "mi" ? perUnit / KM_PER_MI : perUnit;
        currentFitness = { mode: "estimate", weeklyKm: startVolumeKm, easyPaceSecPerKm };
      }

      const built: GenerateInput = {
        name: name.trim() || undefined,
        raceType,
        customDistanceKm,
        goalTimeS,
        raceDateISO: raceDate,
        todayISO,
        currentFitness,
        startVolumeKm,
        peakVolumeKm: Math.max(peakVolumeKm, startVolumeKm),
        daysPerWeek,
        longRunDow,
        restDow: daysPerWeek === 7 ? null : restDow,
        includeTuneups,
        allowDoubles,
      };
      return { input: built, plan: generatePlan(built), buildError: null };
    } catch (e) {
      return { input: null, plan: null, buildError: (e as Error).message };
    }
  }, [
    name, raceType, customDist, goalTime, raceDate, fitnessMode, recentRaceType, recentTime,
    easyPace, currentVol, peakVol, daysPerWeek, longRunDow, restDow, includeTuneups, allowDoubles, unit, todayISO,
  ]);

  async function submit() {
    if (!input) return;
    setSubmitting(true);
    setError(null);
    const { todayISO: _t, ...payload } = input;
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create plan");
        setSubmitting(false);
        return;
      }
      router.push(`/plans/${data.id}`);
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
      {/* ---------------- Form ---------------- */}
      <div className="flex flex-col gap-5">
        <Section n={1} title="Your goal race">
          <Field label="Plan name (optional)">
            <input className="input" value={name} placeholder="e.g. Autumn marathon build" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Race distance">
            <div className="grid grid-cols-4 gap-1.5">
              {RACE_TYPES.map((r) => (
                <Chip key={r} active={raceType === r} onClick={() => setRaceType(r)}>
                  {RACE_TYPE_LABEL[r].replace(" marathon", "").replace(" miles", " mi")}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            {raceType === "custom" && (
              <Field label={`Race distance (${distLabel})`}>
                <input
                  type="number"
                  className="input"
                  value={customDist}
                  min={1}
                  placeholder={unit === "mi" ? "e.g. 50" : "e.g. 80"}
                  onChange={(e) => setCustomDist(e.target.value)}
                />
              </Field>
            )}
            <Field label="Goal finish time (h:mm:ss)">
              <input className="input" value={goalTime} placeholder={GOAL_PLACEHOLDER[raceType]} onChange={(e) => setGoalTime(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Race date">
            <input type="date" className="input" value={raceDate} min={todayISO} onChange={(e) => setRaceDate(e.target.value)} />
          </Field>
        </Section>

        <Section n={2} title="Current fitness">
          <div className="grid grid-cols-2 gap-1.5 mb-1">
            <Chip active={fitnessMode === "race"} onClick={() => setFitnessMode("race")}>
              Recent race result
            </Chip>
            <Chip active={fitnessMode === "estimate"} onClick={() => setFitnessMode("estimate")}>
              Estimate from training
            </Chip>
          </div>
          {fitnessMode === "race" ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Distance">
                <select className="input" value={recentRaceType} onChange={(e) => setRecentRaceType(e.target.value as Exclude<RaceType, "custom">)}>
                  {RECENT_RACE_TYPES.map((r) => (
                    <option key={r} value={r}>{RACE_TYPE_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Time (h:mm:ss)">
                <input className="input" value={recentTime} onChange={(e) => setRecentTime(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
          ) : (
            <Field label={`Typical easy pace (m:ss /${distLabel})`}>
              <input className="input" value={easyPace} onChange={(e) => setEasyPace(e.target.value)} inputMode="numeric" />
            </Field>
          )}
        </Section>

        <Section n={3} title="Training volume & schedule">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={`Current weekly volume (${distLabel})`}>
              <input type="number" className="input" value={currentVol} min={0} onChange={(e) => setCurrentVol(e.target.value)} />
            </Field>
            <Field label={`Target peak volume (${distLabel})`}>
              <input type="number" className="input" value={peakVol} min={0} onChange={(e) => setPeakVol(e.target.value)} />
            </Field>
          </div>
          <Field label="Running days per week">
            <div className="grid grid-cols-5 gap-1.5">
              {[3, 4, 5, 6, 7].map((d) => (
                <Chip key={d} active={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                  {d}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Long run day">
              <select
                className="input"
                value={longRunDow}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLongRunDow(v);
                  if (restDow === v) setRestDow(null);
                }}
              >
                {DOW.map((d, i) => (
                  <option key={d} value={i + 1}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Rest day">
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
            </Field>
          </div>
          {daysPerWeek === 7 && (
            <p className="text-xs -mt-1" style={{ color: "var(--faint)" }}>
              Running 7 days a week — no rest day.
            </p>
          )}
          <label className="flex items-center gap-2.5 mt-1 cursor-pointer">
            <input type="checkbox" checked={includeTuneups} onChange={(e) => setIncludeTuneups(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="text-sm">Include tune-up races during race prep</span>
          </label>
          <label className="flex items-center gap-2.5 mt-1 cursor-pointer">
            <input type="checkbox" checked={allowDoubles} onChange={(e) => setAllowDoubles(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="text-sm">
              Add double run days on high-volume weeks{" "}
              <span style={{ color: "var(--faint)" }}>(splits long easy days into AM + a short PM shakeout — recommended from ~90 km / 55 mi weeks)</span>
            </span>
          </label>
        </Section>
      </div>

      {/* ---------------- Live preview ---------------- */}
      <div className="lg:sticky lg:top-20 card p-5 flex flex-col gap-4">
        <h3 className="font-bold text-sm" style={{ color: "var(--muted)" }}>PLAN PREVIEW</h3>

        {!plan ? (
          <p className="text-sm" style={{ color: "var(--faint)" }}>
            {buildError ?? "Fill in your goal to preview the plan."}
          </p>
        ) : (
          <>
            <div>
              <div className="text-2xl font-extrabold">
                {plan.totalWeeks} weeks
                <span className="text-sm font-medium ml-2" style={{ color: "var(--faint)" }}>
                  · {formatDistance(plan.summary.totalDistanceKm, unit, 0)} total
                </span>
              </div>
              <div className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                Peaks at {formatDistance(plan.summary.peakVolumeKm, unit, 0)}/wk
              </div>
            </div>

            <div
              className="rounded-lg px-3 py-2.5 text-sm"
              style={{
                background: `color-mix(in srgb, ${VERDICT_COLOR[plan.feasibility.verdict]} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${VERDICT_COLOR[plan.feasibility.verdict]} 40%, transparent)`,
              }}
            >
              <div className="font-bold mb-0.5" style={{ color: VERDICT_COLOR[plan.feasibility.verdict] }}>
                {VERDICT_LABEL[plan.feasibility.verdict]} goal
              </div>
              <span style={{ color: "var(--muted)" }}>{plan.feasibility.message}</span>
            </div>

            <VolumeChart
              weeks={plan.weeks.map((w) => ({
                weekIndex: w.weekIndex,
                phase: w.phase,
                plannedVolumeKm: w.plannedVolumeKm,
                isCutback: w.isCutback,
              }))}
              unit={unit}
              height={90}
            />

            <div className="grid grid-cols-2 gap-2 text-sm">
              <PaceStat label="Easy" value={formatPaceRange(plan.zones.current.easyFast, plan.zones.current.easySlow, unit)} />
              <PaceStat label="Goal pace" value={formatPace(plan.goalPaceSecPerKm, unit)} />
              <PaceStat label="Threshold" value={formatPace(plan.zones.goal.threshold, unit)} />
              <PaceStat label="Interval" value={formatPace(plan.zones.goal.interval, unit)} />
            </div>

            <div className="text-xs" style={{ color: "var(--faint)" }}>
              Current VDOT {plan.currentVdot.toFixed(1)} → goal {plan.goalVdot.toFixed(1)}
            </div>
          </>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        <button className="btn btn-primary w-full" disabled={!plan || submitting} onClick={submit}>
          {submitting ? "Creating…" : "Create plan"}
        </button>
      </div>
    </div>
  );
}

// --- small UI atoms ---------------------------------------------------------

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className="inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold"
          style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
        >
          {n}
        </span>
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn text-sm py-2 px-1"
      style={{
        background: active ? "var(--primary-soft)" : "var(--surface)",
        border: `1px solid ${active ? "var(--primary)" : "var(--border-strong)"}`,
        color: active ? "var(--primary)" : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}

function PaceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] font-semibold" style={{ color: "var(--faint)" }}>{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}
