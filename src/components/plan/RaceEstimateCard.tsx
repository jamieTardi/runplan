import { Gauge, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { RaceEstimate } from "@/lib/plan/raceEstimator";
import { formatDuration, formatPace, type Unit } from "@/lib/units";

const TREND_META = {
  improving: { icon: TrendingUp, label: "Improving", color: "#22c55e" },
  steady: { icon: Minus, label: "Holding steady", color: "var(--muted)" },
  fading: { icon: TrendingDown, label: "Fading", color: "#f59e0b" },
} as const;

const CONFIDENCE_LABEL = { low: "Low", medium: "Medium", high: "High" } as const;

function goalDelta(estimateS: number, goalS: number): { text: string; ahead: boolean } {
  const diff = Math.round(goalS - estimateS);
  const abs = Math.abs(diff);
  return {
    text: `${formatDuration(abs)} ${diff >= 0 ? "ahead of" : "behind"} goal`,
    ahead: diff >= 0,
  };
}

/**
 * Server-rendered race prediction from completed training. Renders nothing at
 * all when there isn't enough recorded data — the empty state lives with the
 * estimate so users know why it's missing.
 */
export function RaceEstimateCard({
  estimate,
  goalTimeS,
  unit,
}: {
  estimate: RaceEstimate | null;
  goalTimeS: number;
  unit: Unit;
}) {
  if (!estimate) {
    return (
      <section className="card p-5 flex flex-col gap-1.5">
        <h2 className="font-bold flex items-center gap-2">
          <Gauge size={18} style={{ color: "var(--primary)" }} /> Race estimator
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Complete a few training runs with recorded time and distance — via Garmin sync or a FIT
          upload — and RunPlan will predict your finish time from how you&apos;re actually running.
        </p>
      </section>
    );
  }

  const delta = goalDelta(estimate.timeS, goalTimeS);
  const trend = estimate.trend ? TREND_META[estimate.trend] : null;
  const sinceLabel = new Date(estimate.sinceISO).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Gauge size={18} style={{ color: "var(--primary)" }} /> Race estimator
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            Predicted from {estimate.runCount} recorded run{estimate.runCount === 1 ? "" : "s"}
            {estimate.qualityCount > 0 &&
              ` (${estimate.qualityCount} quality session${estimate.qualityCount === 1 ? "" : "s"})`}{" "}
            since {sinceLabel}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          title="Based on how many recent runs have recorded data and how consistent they are"
        >
          {CONFIDENCE_LABEL[estimate.confidence]} confidence
        </span>
      </div>

      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--primary)" }}>
            {formatDuration(estimate.timeS)}
          </div>
          <div className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
            {formatDuration(estimate.fastTimeS)}–{formatDuration(estimate.slowTimeS)} ·{" "}
            {formatPace(estimate.paceSPerKm, unit)}
          </div>
        </div>
        <div className="flex flex-col gap-1 pb-0.5">
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: delta.ahead ? "#22c55e" : "#f59e0b" }}
          >
            {delta.text}
          </span>
          {trend && (
            <span className="text-sm flex items-center gap-1" style={{ color: trend.color }}>
              <trend.icon size={14} /> {trend.label}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Assumes a full taper and race-day conditions. Easy mileage counts less than workouts and
        races, and recent runs count more than older ones.
      </p>
    </section>
  );
}
