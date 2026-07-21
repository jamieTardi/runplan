"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, Download, Trash2 } from "lucide-react";
import { diffDaysISO, todayISO } from "@/lib/plan/dates";
import { goalPaceSecPerKm } from "@/lib/plan/goal";
import { paceZones } from "@/lib/plan/vdot";
import { PHASE_META, raceLabel, softBg } from "@/lib/planMeta";
import { creditedKm, type PlanVM, type WeekVM } from "@/lib/plan/viewModel";
import { distanceIn, formatDuration, formatPace, formatPaceRange, type Unit } from "@/lib/units";
import { EditWorkoutDialog, type WorkoutPatch } from "./EditWorkoutDialog";
import { EditPlanDialog } from "./EditPlanDialog";
import { WeekDayGrid } from "./WeekDayGrid";
import { VolumeChart } from "./VolumeChart";

export function PlanView({ plan: initial, unit }: { plan: PlanVM; unit: Unit }) {
  const router = useRouter();
  const [weeks, setWeeks] = useState<WeekVM[]>(initial.weeks);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const today = todayISO();

  const currentWeekIdx = useMemo(() => {
    const w = weeks.find((wk) => {
      const end = weeks.find((x) => x.weekIndex === wk.weekIndex + 1)?.startDate ?? plan_end(wk);
      return wk.startDate <= today && today < end;
    });
    return w?.weekIndex ?? (today < weeks[0]?.startDate ? 0 : weeks.length - 1);
  }, [weeks, today]);

  const [expanded, setExpanded] = useState<Set<number>>(new Set([currentWeekIdx]));

  const editDay = editId ? weeks.flatMap((w) => w.workouts).find((d) => d.id === editId) ?? null : null;

  // --- mutations -----------------------------------------------------------
  function applyLocal(id: string, patch: Partial<(typeof weeks)[0]["workouts"][0]>) {
    setWeeks((prev) =>
      prev.map((w) => ({
        ...w,
        workouts: w.workouts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      })),
    );
  }

  async function patchWorkout(id: string, patch: WorkoutPatch & { completed?: boolean }) {
    applyLocal(id, patch as never);
    try {
      const res = await fetch(`/api/workouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) router.refresh();
    } catch {
      router.refresh();
    }
  }

  function toggle(id: string, next: boolean) {
    patchWorkout(id, { completed: next });
  }

  async function swap(aId: string, bId: string) {
    setWeeks((prev) =>
      prev.map((w) => {
        const a = w.workouts.find((d) => d.id === aId);
        const b = w.workouts.find((d) => d.id === bId);
        if (!a || !b) return w;
        const workouts = w.workouts
          .map((d) =>
            d.id === aId
              ? { ...d, date: b.date, dow: b.dow }
              : d.id === bId
                ? { ...d, date: a.date, dow: a.dow }
                : d,
          )
          .sort((x, y) => x.dow - y.dow);
        return { ...w, workouts };
      }),
    );
    try {
      const res = await fetch("/api/workouts/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId, bId }),
      });
      if (!res.ok) router.refresh();
    } catch {
      router.refresh();
    }
  }

  async function deletePlan() {
    if (!confirm("Delete this plan permanently?")) return;
    await fetch(`/api/plans/${initial.id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  // --- derived -------------------------------------------------------------
  const allDays = weeks.flatMap((w) => w.workouts);
  const runDays = allDays.filter((d) => d.type !== "rest");
  const doneCount = runDays.filter((d) => d.completed).length;
  const totalKm = allDays.reduce((a, d) => a + d.distanceKm, 0);
  const doneKm = allDays.reduce((a, d) => a + creditedKm(d), 0);

  const easyZ = paceZones(initial.currentVdot);
  const goalZ = paceZones(initial.goalVdot);
  const goalPace = goalPaceSecPerKm(initial.raceType, initial.goalTimeS, initial.customDistanceKm);
  const daysToRace = diffDaysISO(initial.raceDate, today);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold truncate">{initial.name}</h1>
              {initial.status === "archived" && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--faint)" }}>
                  Archived
                </span>
              )}
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {raceLabel(initial.raceType, initial.customDistanceKm, unit)} · goal{" "}
              <span className="font-bold" style={{ color: "var(--foreground)" }}>{formatDuration(initial.goalTimeS)}</span>{" "}
              · {formatPace(goalPace, unit)}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setEditPlanOpen(true)}>
              <CalendarClock size={16} /> <span className="hidden sm:inline">Edit plan</span>
            </button>
            <a className="btn btn-ghost" href={`/api/plans/${initial.id}/pdf`}>
              <Download size={16} /> <span className="hidden sm:inline">PDF</span>
            </a>
            <button className="btn btn-ghost" onClick={deletePlan} aria-label="Delete plan" style={{ color: "var(--danger)" }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat label="Race day" value={daysToRace >= 0 ? `${daysToRace}d` : "done"} sub={`${Math.max(0, Math.round(daysToRace / 7))} weeks`} />
          <Stat label="Progress" value={`${runDays.length ? Math.round((doneCount / runDays.length) * 100) : 0}%`} sub={`${doneCount}/${runDays.length} runs`} />
          <Stat label="Volume done" value={`${distanceIn(doneKm, unit).toFixed(0)}`} sub={`of ${distanceIn(totalKm, unit).toFixed(0)} ${unit}`} />
          <Stat label="VDOT" value={initial.goalVdot.toFixed(1)} sub={`from ${initial.currentVdot.toFixed(1)}`} />
        </div>

        {/* pace legend */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Pace label="Easy" value={formatPaceRange(easyZ.easyFast, easyZ.easySlow, unit)} />
          <Pace label="Race pace" value={formatPace(goalPace, unit)} />
          <Pace label="Threshold" value={formatPace(goalZ.threshold, unit)} />
          <Pace label="Interval" value={formatPace(goalZ.interval, unit)} />
          <Pace label="Recovery" value={formatPace(easyZ.recovery, unit)} />
        </div>
      </div>

      {/* Volume overview */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm" style={{ color: "var(--muted)" }}>WEEKLY VOLUME</h2>
          <div className="flex gap-3 text-[11px]" style={{ color: "var(--faint)" }}>
            {(["endurance", "lt", "race_prep", "taper"] as const).map((p) => (
              <span key={p} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: PHASE_META[p].color }} />
                {PHASE_META[p].short}
              </span>
            ))}
          </div>
        </div>
        <VolumeChart
          weeks={weeks.map((w) => ({
            weekIndex: w.weekIndex,
            phase: w.phase,
            plannedVolumeKm: w.plannedVolumeKm,
            isCutback: w.isCutback,
            doneKm: w.workouts.reduce((a, d) => a + creditedKm(d), 0),
          }))}
          unit={unit}
          height={110}
          highlightWeek={currentWeekIdx}
        />
      </div>

      {/* Weeks */}
      <div className="flex flex-col gap-3">
        {weeks.map((week) => (
          <WeekBlock
            key={week.id}
            week={week}
            unit={unit}
            today={today}
            isCurrent={week.weekIndex === currentWeekIdx}
            expanded={expanded.has(week.weekIndex)}
            onToggleExpand={() =>
              setExpanded((prev) => {
                const n = new Set(prev);
                n.has(week.weekIndex) ? n.delete(week.weekIndex) : n.add(week.weekIndex);
                return n;
              })
            }
            onToggleDay={toggle}
            onEditDay={setEditId}
            onSwapDay={swap}
          />
        ))}
      </div>

      {editDay && (
        <EditWorkoutDialog
          day={editDay}
          unit={unit}
          open={Boolean(editId)}
          onOpenChange={(o) => !o && setEditId(null)}
          onSave={(patch) => patchWorkout(editDay.id, patch)}
        />
      )}
      <EditPlanDialog
        planId={initial.id}
        unit={unit}
        current={{
          raceDate: initial.raceDate,
          daysPerWeek: initial.daysPerWeek,
          longRunDow: initial.longRunDow,
          restDow: initial.restDow,
          peakVolumeKm: initial.peakVolumeKm,
        }}
        open={editPlanOpen}
        onOpenChange={setEditPlanOpen}
      />
    </div>
  );
}

function WeekBlock({
  week,
  unit,
  today,
  isCurrent,
  expanded,
  onToggleExpand,
  onToggleDay,
  onEditDay,
  onSwapDay,
}: {
  week: WeekVM;
  unit: Unit;
  today: string;
  isCurrent: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleDay: (id: string, next: boolean) => void;
  onEditDay: (id: string) => void;
  onSwapDay: (aId: string, bId: string) => void;
}) {
  const phase = PHASE_META[week.phase];
  const done = week.workouts.reduce((a, d) => a + creditedKm(d), 0);
  const runDays = week.workouts.filter((d) => d.type !== "rest");
  const doneRuns = runDays.filter((d) => d.completed).length;
  const pct = runDays.length ? Math.round((doneRuns / runDays.length) * 100) : 0;

  return (
    <div className="card overflow-hidden" style={{ borderColor: isCurrent ? "var(--primary)" : undefined }}>
      <button onClick={onToggleExpand} className="w-full flex items-center gap-3 p-4 text-left">
        <span className="text-xs font-bold px-2 py-1 rounded-md shrink-0" style={{ background: softBg(phase.color, 16), color: phase.color }}>
          {phase.short}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold">Week {week.weekIndex + 1}</span>
            {isCurrent && <span className="text-[10px] font-bold px-1.5 rounded" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>CURRENT</span>}
            {week.isCutback && <span className="text-[10px] font-semibold" style={{ color: "var(--faint)" }}>· cutback</span>}
          </div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {distanceIn(week.plannedVolumeKm, unit).toFixed(0)} {unit} planned · {distanceIn(done, unit).toFixed(0)} done
          </div>
        </div>
        {/* mini progress ring */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: phase.color }} />
          </div>
          <span className="text-xs tabular-nums w-9 text-right" style={{ color: "var(--muted)" }}>{pct}%</span>
        </div>
        <ChevronDown size={18} style={{ color: "var(--faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <WeekDayGrid
            days={week.workouts}
            unit={unit}
            today={today}
            onToggle={onToggleDay}
            onEdit={onEditDay}
            onSwap={onSwapDay}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] font-semibold" style={{ color: "var(--faint)" }}>{label}</div>
      <div className="text-xl font-extrabold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function Pace({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--surface-2)" }}>
      <span className="font-semibold" style={{ color: "var(--faint)" }}>{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

// End date fallback for the last week (7 days after its start).
function plan_end(w: WeekVM): string {
  const [y, m, d] = w.startDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 7));
  return dt.toISOString().slice(0, 10);
}
