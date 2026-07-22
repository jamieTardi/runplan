import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft, Watch } from "lucide-react";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { WORKOUT_META } from "@/lib/planMeta";
import { formatDistance, formatDuration, formatPace, formatPaceRange } from "@/lib/units";
import { isoDayOfWeek } from "@/lib/plan/dates";
import { GarminPanel } from "@/components/workout/GarminPanel";
import { isPro } from "@/lib/billing/plan";
import { UploadFit } from "@/components/workout/UploadFit";
import type { WorkoutSegment } from "@/lib/plan/types";

const DAYNAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDayDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${DAYNAMES[isoDayOfWeek(iso) - 1]} ${d} ${MONTHS[m - 1]}`;
}

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db
    .select({ workout: workouts, planId: plans.id, planName: plans.name, ownerId: plans.userId })
    .from(workouts)
    .innerJoin(plans, eq(workouts.planId, plans.id))
    .where(eq(workouts.id, id))
    .limit(1);

  if (!row || row.ownerId !== user.id) notFound();

  const w = row.workout;
  const pro = isPro(user);
  const meta = WORKOUT_META[w.type];
  const unit = user.unitPref;
  const dateISO = String(w.date).slice(0, 10);
  const segments = (w.segments ?? null) as WorkoutSegment[] | null;
  const actualPace =
    w.actualDistanceKm && w.actualDurationS && w.actualDistanceKm > 0
      ? Math.round(w.actualDurationS / w.actualDistanceKm)
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/plans/${row.planId}`}
          className="inline-flex items-center gap-1 text-sm mb-2"
          style={{ color: "var(--muted)" }}
        >
          <ChevronLeft size={16} /> {row.planName}
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 rounded-full shrink-0"
              style={{ background: meta.color }}
            />
            {meta.label} — {fmtDayDate(dateISO)}
          </h1>
          {w.type !== "rest" && pro && (
            <a className="btn btn-ghost" href={`/api/workouts/${w.id}/fit`}>
              <Watch size={16} /> .FIT
            </a>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <section className="card p-5">
          <h2 className="font-bold mb-3">Planned</h2>
          <div className="flex flex-col gap-1.5 text-sm">
            {w.distanceKm > 0 && (
              <p>
                <strong>{formatDistance(w.distanceKm, unit)}</strong>
                {w.paceLowSPerKm && w.paceHighSPerKm && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}
                    @ {formatPaceRange(w.paceLowSPerKm, w.paceHighSPerKm, unit)}
                  </span>
                )}
              </p>
            )}
            <p style={{ color: "var(--muted)" }}>{w.description}</p>
            {segments && segments.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {segments.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: "var(--primary)" }}
                    />
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-bold mb-3">Completed</h2>
          {w.completed ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <p>
                {w.actualDistanceKm ? (
                  <>
                    <strong>{formatDistance(w.actualDistanceKm, unit, 2)}</strong>
                    {w.actualDurationS && (
                      <span style={{ color: "var(--muted)" }}> in {formatDuration(w.actualDurationS)}</span>
                    )}
                    {actualPace && (
                      <span style={{ color: "var(--muted)" }}> · {formatPace(actualPace, unit)}</span>
                    )}
                  </>
                ) : (
                  <strong>Done ✓</strong>
                )}
              </p>
              {w.notes && <p style={{ color: "var(--muted)" }}>{w.notes}</p>}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--faint)" }}>
              Not completed yet.
            </p>
          )}
        </section>
      </div>

      {!pro ? (
        <section className="card p-5">
          <h2 className="font-bold mb-2">Garmin activity</h2>
          <p className="text-sm" style={{ color: "var(--faint)" }}>
            Route maps, heart rate, pace and laps from your Garmin runs are part of{" "}
            <Link href="/settings" style={{ color: "var(--primary)" }}>RunPlan Pro</Link>.
          </p>
        </section>
      ) : w.garminActivityId ? (
        <GarminPanel workoutId={w.id} unit={unit} />
      ) : (
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-bold">Garmin activity</h2>
          <p className="text-sm" style={{ color: "var(--faint)" }}>
            No Garmin activity is linked to this session. A sync links it automatically when it
            matches a run — or upload the file yourself:
          </p>
          <UploadFit workoutId={w.id} />
        </section>
      )}
    </div>
  );
}
