"use client";

import { useState } from "react";
import { todayISO } from "@/lib/plan/dates";
import type { DayVM } from "@/lib/plan/viewModel";
import type { Unit } from "@/lib/units";
import { EditWorkoutDialog } from "./EditWorkoutDialog";
import { WeekDayGrid } from "./WeekDayGrid";
import { useWorkouts } from "./useWorkouts";

export function ThisWeek({ initialDays, unit }: { initialDays: DayVM[]; unit: Unit }) {
  const { days, patch, toggle, swap } = useWorkouts(initialDays);
  const [editId, setEditId] = useState<string | null>(null);
  const today = todayISO();
  const editDay = editId ? days.find((d) => d.id === editId) ?? null : null;

  return (
    <>
      <WeekDayGrid days={days} unit={unit} today={today} onToggle={toggle} onEdit={setEditId} onSwap={swap} />
      {editDay && (
        <EditWorkoutDialog
          day={editDay}
          unit={unit}
          open={Boolean(editId)}
          onOpenChange={(o) => !o && setEditId(null)}
          onSave={(p) => patch(editDay.id, p)}
        />
      )}
    </>
  );
}
