"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { DayVM } from "@/lib/plan/viewModel";
import type { Unit } from "@/lib/units";
import { DayCard } from "./DayCard";

function Cell({
  sessions,
  unit,
  today,
  onToggle,
  onEdit,
}: {
  sessions: DayVM[]; // 1 (single) or 2 (AM + PM double) workouts on one day
  unit: Unit;
  today: string;
  onToggle: (id: string, next: boolean) => void;
  onEdit: (id: string) => void;
}) {
  const lead = sessions[0];
  const isDouble = sessions.length > 1;
  // Drag/drop by day: the whole cell moves (both sessions), keyed on the lead id.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: lead.id });
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setDropRef}
      className="flex flex-col gap-1.5"
      style={{
        borderRadius: 12,
        outline: isOver ? "2px dashed var(--primary)" : "2px dashed transparent",
        outlineOffset: 2,
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity .12s",
      }}
    >
      {sessions.map((d, i) => (
        <DayCard
          key={d.id}
          day={d}
          unit={unit}
          isToday={d.date === today}
          slotLabel={isDouble ? (d.session === "pm" ? "PM" : "AM") : null}
          onToggle={() => onToggle(d.id, !d.completed)}
          onEdit={() => onEdit(d.id)}
          handleRef={i === 0 ? setDragRef : undefined}
          handleListeners={i === 0 ? listeners : undefined}
          handleAttributes={i === 0 ? attributes : undefined}
        />
      ))}
    </div>
  );
}

/** A week's day cards with drag-to-rearrange (swaps two days' calendar slots). */
export function WeekDayGrid({
  days,
  unit,
  today,
  onToggle,
  onEdit,
  onSwap,
}: {
  days: DayVM[];
  unit: Unit;
  today: string;
  onToggle: (id: string, next: boolean) => void;
  onEdit: (id: string) => void;
  onSwap: (aId: string, bId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) onSwap(String(active.id), String(over.id));
  }

  // Group into calendar days (a double day = AM + PM in one cell).
  const cells: DayVM[][] = [];
  for (const d of days) {
    const last = cells[cells.length - 1];
    if (last && last[0].dow === d.dow) last.push(d);
    else cells.push([d]);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {cells.map((sessions) => (
          <Cell
            key={sessions[0].id}
            sessions={sessions}
            unit={unit}
            today={today}
            onToggle={onToggle}
            onEdit={onEdit}
          />
        ))}
      </div>
    </DndContext>
  );
}
