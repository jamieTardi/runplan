"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";
import type { GarminActivityData } from "@/lib/garmin/activity";
import {
  distanceIn,
  formatDistance,
  formatDuration,
  formatPace,
  type Unit,
} from "@/lib/units";
import { LineChart, type ChartPoint } from "./LineChart";
import { UploadFit } from "./UploadFit";

const RouteMap = dynamic(() => import("./RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 320, borderRadius: 12 }} />,
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--faint)" }}>
        {label}
      </div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function GarminPanel({ workoutId, unit }: { workoutId: string; unit: Unit }) {
  const [data, setData] = useState<GarminActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/workouts/${workoutId}/garmin`);
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError(body.error ?? "Failed to load the Garmin activity");
      else setData(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutId]);

  const dist = (m: number) => distanceIn(m / 1000, unit);
  const xFormat = (x: number) => `${x.toFixed(1)} ${unit}`;

  const hrPoints = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    return data.samples
      .filter((s) => s.hr != null && s.dM != null)
      .map((s) => ({ x: dist(s.dM!), y: s.hr! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, unit]);

  const pacePoints = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    const raw = data.samples.filter((s) => s.paceSPerKm != null && s.dM != null);
    if (!raw.length) return [];
    // Clamp GPS/stop spikes so the scale stays readable.
    const sorted = raw.map((s) => s.paceSPerKm!).sort((a, b) => a - b);
    const cap = Math.min(sorted[Math.floor(sorted.length * 0.97)] ?? 900, 900);
    return raw.map((s) => ({
      x: dist(s.dM!),
      y: Math.min(s.paceSPerKm!, cap) * (unit === "mi" ? 1.609344 : 1),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, unit]);

  const elevPoints = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    const pts = data.samples
      .filter((s) => s.elevM != null && s.dM != null)
      .map((s) => ({ x: dist(s.dM!), y: s.elevM! }));
    // Flat treadmill traces aren't worth a chart.
    if (pts.length < 2) return [];
    const ys = pts.map((p) => p.y);
    return Math.max(...ys) - Math.min(...ys) < 8 ? [] : pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, unit]);

  if (error) {
    return (
      <section className="card p-5 flex flex-col gap-3">
        <h2 className="font-bold">Garmin activity</h2>
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          You can load this workout&apos;s data manually instead:
        </p>
        <UploadFit workoutId={workoutId} />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card p-5 flex flex-col gap-3">
        <h2 className="font-bold">Garmin activity</h2>
        <div className="skeleton" style={{ height: 64, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 170, borderRadius: 12 }} />
      </section>
    );
  }

  const paceFmt = (secPerUnit: number) =>
    `${Math.floor(secPerUnit / 60)}:${String(Math.round(secPerUnit % 60)).padStart(2, "0")}`;

  const stats: Array<[string, string | null]> = [
    ["Distance", formatDistance(data.distanceM / 1000, unit, 2)],
    ["Moving time", data.movingDurationS ? formatDuration(data.movingDurationS) : formatDuration(data.durationS)],
    ["Avg pace", data.avgPaceSPerKm ? formatPace(data.avgPaceSPerKm, unit) : null],
    ["Avg HR", data.avgHr ? `${Math.round(data.avgHr)} bpm` : null],
    ["Max HR", data.maxHr ? `${Math.round(data.maxHr)} bpm` : null],
    ["Elev gain", data.elevGainM != null ? `${Math.round(data.elevGainM)} m` : null],
    ["Calories", data.calories ? `${Math.round(data.calories)}` : null],
    ["Cadence", data.avgCadence ? `${Math.round(data.avgCadence)} spm` : null],
  ];

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Garmin activity</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{data.activityName}</p>
        </div>
        {data.activityId > 0 && (
          <a
            className="btn btn-ghost text-sm shrink-0"
            href={`https://connect.garmin.com/modern/activity/${data.activityId}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} /> <span className="hidden sm:inline">Garmin Connect</span>
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats
          .filter((s): s is [string, string] => s[1] != null)
          .map(([label, value]) => (
            <Stat key={label} label={label} value={value} />
          ))}
      </div>

      {data.route.length > 1 && <RouteMap route={data.route} />}

      {hrPoints.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--muted)" }}>
            Heart rate
          </h3>
          <LineChart
            points={hrPoints}
            color="var(--danger)"
            formatX={xFormat}
            formatY={(y) => `${Math.round(y)} bpm`}
          />
        </div>
      )}

      {pacePoints.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--muted)" }}>
            Pace
          </h3>
          <LineChart
            points={pacePoints}
            color="var(--primary)"
            invertY
            formatX={xFormat}
            formatY={(y) => `${paceFmt(y)} /${unit}`}
          />
        </div>
      )}

      {elevPoints.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--muted)" }}>
            Elevation
          </h3>
          <LineChart
            points={elevPoints}
            color="var(--accent)"
            area
            height={120}
            formatX={xFormat}
            formatY={(y) => `${Math.round(y)} m`}
          />
        </div>
      )}

      {data.laps.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--muted)" }}>
            Laps
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--faint)" }}>
                  <th className="py-1 pr-3">Lap</th>
                  <th className="py-1 pr-3">Distance</th>
                  <th className="py-1 pr-3">Time</th>
                  <th className="py-1 pr-3">Pace</th>
                  <th className="py-1 pr-3">Avg HR</th>
                  <th className="py-1">Elev +</th>
                </tr>
              </thead>
              <tbody>
                {data.laps.map((lap) => (
                  <tr key={lap.index} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-1.5 pr-3" style={{ color: "var(--muted)" }}>{lap.index}</td>
                    <td className="py-1.5 pr-3">{formatDistance(lap.distanceM / 1000, unit, 2)}</td>
                    <td className="py-1.5 pr-3">{formatDuration(lap.durationS)}</td>
                    <td className="py-1.5 pr-3">
                      {lap.avgPaceSPerKm ? formatPace(lap.avgPaceSPerKm, unit) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{lap.avgHr ? Math.round(lap.avgHr) : "—"}</td>
                    <td className="py-1.5">{lap.elevGainM != null ? `${Math.round(lap.elevGainM)} m` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
