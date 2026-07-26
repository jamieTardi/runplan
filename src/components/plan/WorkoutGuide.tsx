import { BookOpen } from "lucide-react";
import { workoutTypes } from "@/db/schema";
import { WORKOUT_META } from "@/lib/planMeta";

/**
 * Collapsible glossary explaining every workout type a plan can prescribe —
 * what the session is for and how it should feel. Server-rendered, no state.
 */
export function WorkoutGuide() {
  return (
    <details className="card">
      <summary className="p-5 cursor-pointer">
        <span className="font-bold inline-flex items-center gap-2">
          <BookOpen size={18} style={{ color: "var(--primary)" }} /> Workout guide
        </span>
        <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
          what each session means and how it should feel
        </span>
      </summary>
      <ul className="px-5 pb-5 flex flex-col gap-3">
        {workoutTypes.map((t) => (
          <li key={t} className="flex gap-2.5">
            <span
              className="mt-1.5 inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: WORKOUT_META[t].color }}
            />
            <div>
              <span className="text-sm font-semibold">{WORKOUT_META[t].label}</span>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {WORKOUT_META[t].blurb}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
