"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Flag, Mountain, Trash2, Upload } from "lucide-react";
import { distanceIn, formatDistance, formatDuration, type Unit } from "@/lib/units";
import { LineChart } from "@/components/workout/LineChart";

const RouteMap = dynamic(() => import("@/components/workout/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 280, borderRadius: 12 }} />,
});

export interface RaceCourseVM {
  name: string | null;
  distanceM: number;
  elevGainM: number | null;
  elevLossM: number | null;
  route: [number, number][];
  elevSeries: { dM: number; elevM: number }[];
}

function daysUntil(raceDateISO: string): number {
  const [y, m, d] = raceDateISO.split("-").map(Number);
  const race = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((race.getTime() - today.getTime()) / 86_400_000);
}

function countdownText(days: number): string {
  if (days === 0) return "Race day! 🏁";
  if (days < 0) return `Race was ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} to go`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return `${weeks} week${weeks === 1 ? "" : "s"}${rem ? ` ${rem} day${rem === 1 ? "" : "s"}` : ""} to go`;
}

export function RaceCard({
  planId,
  raceLabel,
  raceDateISO,
  goalTimeS,
  raceDistanceKm,
  unit,
  course,
}: {
  planId: string;
  raceLabel: string;
  raceDateISO: string;
  goalTimeS: number;
  raceDistanceKm: number;
  unit: Unit;
  course: RaceCourseVM | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = daysUntil(raceDateISO);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/plans/${planId}/course`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    router.refresh();
  }

  async function removeCourse() {
    if (!confirm("Remove the race course?")) return;
    await fetch(`/api/plans/${planId}/course`, { method: "DELETE" });
    router.refresh();
  }

  const courseKm = course ? course.distanceM / 1000 : null;
  const mismatch =
    courseKm != null && raceDistanceKm > 0 && Math.abs(courseKm - raceDistanceKm) / raceDistanceKm > 0.1;

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Flag size={18} style={{ color: "var(--primary)" }} /> {raceLabel}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            {new Date(raceDateISO).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · goal "}
            {formatDuration(goalTimeS)}
          </p>
        </div>
        <div
          className="rounded-xl px-4 py-2 text-center"
          style={{ background: days >= 0 ? "var(--primary-soft)" : "var(--surface-2)" }}
        >
          <div className="font-bold tabular-nums" style={{ color: days >= 0 ? "var(--primary)" : "var(--muted)" }}>
            {countdownText(days)}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {course ? (
        <>
          <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: "var(--muted)" }}>
            <Mountain size={15} />
            <span>
              <strong style={{ color: "var(--foreground)" }}>{formatDistance(course.distanceM / 1000, unit, 1)}</strong>
              {course.elevGainM != null && (
                <>
                  {" · "}
                  <strong style={{ color: "var(--foreground)" }}>{Math.round(course.elevGainM)} m</strong> climb
                </>
              )}
              {course.elevLossM != null && <> · {Math.round(course.elevLossM)} m descent</>}
              {course.name && <> · {course.name}</>}
            </span>
          </div>
          {mismatch && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}>
              Heads up: this course measures {formatDistance(courseKm!, unit, 1)} but the plan&apos;s race
              distance is {formatDistance(raceDistanceKm, unit, 1)} — double-check you uploaded the right file.
            </p>
          )}
          {course.route.length > 1 && <RouteMap route={course.route} />}
          {course.elevSeries.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--muted)" }}>
                Elevation profile
              </h3>
              <LineChart
                points={course.elevSeries.map((p) => ({ x: distanceIn(p.dM / 1000, unit), y: p.elevM }))}
                color="var(--accent)"
                area
                height={140}
                formatX={(x) => `${x.toFixed(1)} ${unit}`}
                formatY={(y) => `${Math.round(y)} m`}
              />
            </div>
          )}
          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-ghost text-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload size={14} /> {busy ? "Parsing…" : "Replace course"}
            </button>
            <button className="btn btn-ghost text-sm" onClick={removeCourse} disabled={busy} style={{ color: "var(--danger)" }}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: "var(--faint)" }}>
            Upload the race&apos;s course GPX to see the route and elevation profile here — most
            races link one on their website, or export it from Strava/Garmin/Komoot.
          </p>
          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          <button
            className="btn btn-ghost self-start"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{ border: "1px dashed var(--border-strong)" }}
          >
            <Upload size={16} /> {busy ? "Parsing…" : "Upload course .gpx"}
          </button>
        </div>
      )}
    </section>
  );
}
