import Link from "next/link";
import { ArrowRight, CalendarPlus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isPro } from "@/lib/billing/plan";
import { getGarminAccount } from "@/lib/garmin/store";
import { getPlanDetail, getUserPlans } from "@/lib/plan/queries";
import { addDaysISO, diffDaysISO, isoDayOfWeek, todayISO } from "@/lib/plan/dates";
import { creditedKm } from "@/lib/plan/viewModel";
import type { WorkoutSegment } from "@/lib/plan/types";
import { PHASE_META, raceLabel, softBg } from "@/lib/planMeta";
import { distanceIn, formatDuration } from "@/lib/units";
import { VolumeChart } from "@/components/plan/VolumeChart";
import { ThisWeek } from "@/components/plan/ThisWeek";
import { GarminAutoSync } from "@/components/app/GarminAutoSync";

export default async function DashboardPage() {
  const user = await requireUser();
  const unit = user.unitPref;
  const plans = await getUserPlans(user.id);
  const first = user.name.split(" ")[0];

  if (plans.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Hi {first} 👋</h1>
        <div className="card p-8 mt-6 text-center flex flex-col items-center gap-4">
          <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
            <Sparkles size={26} />
          </span>
          <div>
            <h2 className="text-lg font-bold">Build your first training plan</h2>
            <p className="text-sm mt-1 max-w-sm" style={{ color: "var(--muted)" }}>
              Tell us your goal race and time — we&apos;ll generate a periodised, science-based plan you can follow and tick off.
            </p>
          </div>
          <Link href="/plans/new" className="btn btn-primary">
            <CalendarPlus size={16} /> Create a plan
          </Link>
        </div>
      </div>
    );
  }

  const active = plans.find((p) => p.status === "active") ?? plans[0];
  const detail = await getPlanDetail(user.id, active.id);
  const today = todayISO();
  const garminConnected = isPro(user) && !!(await getGarminAccount(user.id));

  // Current training week (falls back to first/last).
  const currentWeek =
    detail?.weeks.find((w) => w.startDate <= today && today < addDaysISO(w.startDate, 7)) ??
    (detail && today < detail.weeks[0].startDate ? detail.weeks[0] : detail?.weeks.at(-1));

  const allDays = detail?.weeks.flatMap((w) => w.workouts) ?? [];
  const runDays = allDays.filter((d) => d.type !== "rest");
  const doneRuns = runDays.filter((d) => d.completed).length;
  const pct = runDays.length ? Math.round((doneRuns / runDays.length) * 100) : 0;
  const daysToRace = diffDaysISO(active.raceDate, today);

  return (
    <div className="flex flex-col gap-6">
      {garminConnected && <GarminAutoSync />}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Hi {first} 👋</h1>
        <Link href="/plans/new" className="btn btn-primary">
          <CalendarPlus size={16} /> <span className="hidden sm:inline">New plan</span>
        </Link>
      </div>

      {/* Active plan hero */}
      {detail && (
        <div className="card p-5">
          <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-center">
            <div>
              <Link href={`/plans/${detail.id}`} className="group inline-flex items-center gap-2">
                <h2 className="text-xl font-extrabold group-hover:underline">{detail.name}</h2>
                <ArrowRight size={18} style={{ color: "var(--faint)" }} />
              </Link>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                {raceLabel(detail.raceType, detail.customDistanceKm, unit)} · goal {formatDuration(detail.goalTimeS)}
              </p>

              <div className="grid grid-cols-3 gap-3 mt-4">
                <HeroStat value={daysToRace >= 0 ? `${daysToRace}` : "—"} unit="days to race" />
                <HeroStat value={`${pct}%`} unit={`${doneRuns}/${runDays.length} done`} />
                <HeroStat value={`${distanceIn(detail.weeks.reduce((a, w) => a + w.workouts.reduce((b, d) => b + creditedKm(d), 0), 0), unit).toFixed(0)}`} unit={`${unit} logged`} />
              </div>

              <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--primary)" }} />
              </div>
            </div>

            <div>
              <VolumeChart
                weeks={detail.weeks.map((w) => ({
                  weekIndex: w.weekIndex,
                  phase: w.phase,
                  plannedVolumeKm: w.plannedVolumeKm,
                  isCutback: w.isCutback,
                  doneKm: w.workouts.reduce((a, d) => a + creditedKm(d), 0),
                }))}
                unit={unit}
                height={96}
                highlightWeek={currentWeek?.weekIndex}
              />
            </div>
          </div>
        </div>
      )}

      {/* This week */}
      {currentWeek && detail && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-bold">This week</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: softBg(PHASE_META[currentWeek.phase].color, 16), color: PHASE_META[currentWeek.phase].color }}>
              Week {currentWeek.weekIndex + 1} · {PHASE_META[currentWeek.phase].label}
            </span>
          </div>
          <ThisWeek
            unit={unit}
            initialDays={currentWeek.workouts.map((d) => ({
              id: d.id,
              date: d.date,
              dow: d.dow,
              type: d.type,
              distanceKm: d.distanceKm,
              paceLowSPerKm: d.paceLowSPerKm,
              paceHighSPerKm: d.paceHighSPerKm,
              segments: (d.segments as WorkoutSegment[] | null) ?? null,
              description: d.description,
              completed: d.completed,
              actualDistanceKm: d.actualDistanceKm,
              actualDurationS: d.actualDurationS,
              notes: d.notes,
            }))}
          />
        </div>
      )}

      {/* All plans */}
      <div>
        <h2 className="font-bold mb-3">Your plans</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map((p) => {
            const d = diffDaysISO(p.raceDate, today);
            return (
              <Link key={p.id} href={`/plans/${p.id}`} className="card p-4 hover:border-[var(--primary)] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-bold truncate">{p.name}</span>
                  {p.id === active.id && (
                    <span className="text-[10px] font-bold px-1.5 rounded" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>ACTIVE</span>
                  )}
                </div>
                <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                  {raceLabel(p.raceType, p.customDistanceKm, unit)} · {formatDuration(p.goalTimeS)}
                </p>
                <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>
                  {d >= 0 ? `${d} days to race` : "race passed"} · {p.raceDate}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, unit }: { value: string; unit: string }) {
  return (
    <div>
      <div className="text-2xl font-extrabold tabular-nums leading-none">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: "var(--faint)" }}>{unit}</div>
    </div>
  );
}
