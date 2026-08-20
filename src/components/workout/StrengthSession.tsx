import { Dumbbell } from "lucide-react";
import type { StrengthRoutine } from "@/lib/plan/strength";
import { ExerciseFigure } from "./ExerciseFigure";

/**
 * The exercise breakdown for a strength session: one tile per exercise with
 * its animated figure, sets/reps and a short form cue. All figures come from
 * the same renderer so the illustrations stay visually consistent.
 */
export function StrengthSession({ routine }: { routine: StrengthRoutine }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold flex items-center gap-2">
        <Dumbbell size={18} style={{ color: "var(--primary)" }} /> The exercises
      </h2>
      <p className="text-sm mt-1 mb-4" style={{ color: "var(--muted)" }}>
        {routine.name} — work through the exercises in order, resting about a minute between sets.
        No equipment needed.
      </p>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4">
        {routine.exercises.map((ex) => (
          <div
            key={ex.id}
            className="rounded-xl border p-3 flex flex-col gap-2"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)" }}>
              <ExerciseFigure exerciseId={ex.id} label={ex.name} />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{ex.name}</p>
              <p className="text-xs font-medium mt-0.5" style={{ color: "var(--primary)" }}>
                {ex.scheme}
              </p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {ex.cue}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
