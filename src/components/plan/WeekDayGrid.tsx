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
  day,
  unit,
  today,
  onToggle,
  onEdit,
}: {
  day: DayVM;
  unit: Unit;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: day.id });
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id: day.id });

  return (
    <div
      ref={setDropRef}
      style={{
        borderRadius: 12,
        outline: isOver ? "2px dashed var(--primary)" : "2px dashed transparent",
        outlineOffset: 2,
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity .12s",
      }}
    >
      <DayCard
        day={day}
        unit={unit}
        isToday={day.date === today}
        onToggle={onToggle}
        onEdit={onEdit}
        handleRef={setDragRef}
        handleListeners={listeners}
        handleAttributes={attributes}
      />
    </div>
  );
}

/** A week's 7 day cards with drag-to-rearrange (swap two days' slots). */
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {days.map((d) => (
          <Cell
            key={d.id}
            day={d}
            unit={unit}
            today={today}
            onToggle={() => onToggle(d.id, !d.completed)}
            onEdit={() => onEdit(d.id)}
          />
        ))}
      </div>
    </DndContext>
  );
}
