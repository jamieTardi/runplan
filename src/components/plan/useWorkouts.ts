"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DayVM } from "@/lib/plan/viewModel";
import type { WorkoutPatch } from "./EditWorkoutDialog";

/** Local optimistic workout state backed by the PATCH endpoint. */
export function useWorkouts(initial: DayVM[]) {
  const router = useRouter();
  const [days, setDays] = useState<DayVM[]>(initial);

  // Adopt fresh server data when a router.refresh() re-serialises props
  // (background Garmin sync, failed-patch recovery).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setDays(initial);
  }

  async function patch(id: string, p: WorkoutPatch) {
    setDays((prev) => prev.map((d) => (d.id === id ? { ...d, ...(p as Partial<DayVM>) } : d)));
    try {
      const res = await fetch(`/api/workouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) router.refresh();
    } catch {
      router.refresh();
    }
  }

  async function swap(aId: string, bId: string) {
    setDays((prev) => {
      const a = prev.find((d) => d.id === aId);
      const b = prev.find((d) => d.id === bId);
      if (!a || !b) return prev;
      return prev
        .map((d) =>
          d.id === aId
            ? { ...d, date: b.date, dow: b.dow }
            : d.id === bId
              ? { ...d, date: a.date, dow: a.dow }
              : d,
        )
        .sort((x, y) => x.dow - y.dow);
    });
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

  return {
    days,
    patch,
    swap,
    toggle: (id: string, next: boolean) => patch(id, { completed: next }),
  };
}
