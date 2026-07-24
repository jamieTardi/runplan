"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Check, GripVertical } from "lucide-react";
import { isoDayOfWeek } from "@/lib/plan/dates";
import { WORKOUT_META, softBg } from "@/lib/planMeta";
import type { DayVM } from "@/lib/plan/viewModel";
import { formatDistance, formatPace, formatPaceRange, type Unit } from "@/lib/units";

const DAYNAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDayDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${DAYNAMES[isoDayOfWeek(iso) - 1]} ${d} ${MONTHS[m - 1]}`;
}

export function DayCard({
  day,
  unit,
  isToday,
  slotLabel,
  onToggle,
  onEdit,
  handleRef,
  handleListeners,
  handleAttributes,
}: {
  day: DayVM;
  unit: Unit;
  isToday?: boolean;
  slotLabel?: string | null;
  onToggle: () => void;
  onEdit: () => void;
  handleRef?: (el: HTMLElement | null) => void;
  handleListeners?: DraggableSyntheticListeners;
  handleAttributes?: DraggableAttributes;
}) {
  const meta = WORKOUT_META[day.type];
  const isRest = day.type === "rest";
  const pace =
    day.paceLowSPerKm != null
      ? day.paceHighSPerKm != null && day.paceHighSPerKm !== day.paceLowSPerKm
        ? formatPaceRange(day.paceLowSPerKm, day.paceHighSPerKm, unit)
        : formatPace(day.paceLowSPerKm, unit)
      : null;

  return (
    <button
      onClick={onEdit}
      className="relative text-left rounded-xl p-3 pl-3.5 w-full transition-colors"
      style={{
        background: day.completed ? softBg(meta.color, 10) : "var(--surface)",
        border: `1px solid ${isToday ? "var(--primary)" : "var(--border)"}`,
        borderLeft: `4px solid ${meta.color}`,
        opacity: isRest ? 0.7 : day.missed && !day.completed ? 0.65 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--faint)" }}>
              {fmtDayDate(day.date)}
            </span>
            {slotLabel && (
              <span className="text-[9px] font-bold px-1 rounded" style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                {slotLabel}
              </span>
            )}
            {isToday && (
              <span className="text-[9px] font-bold px-1 rounded" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>
                TODAY
              </span>
            )}
            {day.missed && !day.completed && (
              <span className="text-[9px] font-bold px-1 rounded" style={{ background: softBg("#f59e0b", 18), color: "#f59e0b" }}>
                MISSED
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
        {handleListeners && (
          <span
            ref={handleRef}
            {...handleAttributes}
            {...handleListeners}
            aria-label="Drag to move day"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center h-6 w-5 cursor-grab active:cursor-grabbing"
            style={{ color: "var(--faint)", touchAction: "none" }}
          >
            <GripVertical size={15} />
          </span>
        )}
        {!isRest && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }
            }}
            aria-label={day.completed ? "Mark incomplete" : "Mark complete"}
            className="inline-flex items-center justify-center h-6 w-6 rounded-full shrink-0 transition-colors"
            style={{
              background: day.completed ? meta.color : "transparent",
              border: `2px solid ${day.completed ? meta.color : "var(--border-strong)"}`,
              color: "#fff",
            }}
          >
            {day.completed && <Check size={13} strokeWidth={3} />}
          </span>
        )}
        </div>
      </div>

      {!isRest && day.type !== "strength" && (
        <div className="mt-1.5">
          <span className="text-base font-extrabold tabular-nums">
            {formatDistance(day.distanceKm, unit, day.distanceKm % 1 === 0 ? 0 : 1)}
          </span>
          {pace && (
            <span className="text-xs ml-1.5 tabular-nums" style={{ color: "var(--muted)" }}>
              {pace}
            </span>
          )}
        </div>
      )}

      <p className="mt-1 text-xs leading-snug" style={{ color: isRest ? "var(--faint)" : "var(--muted)" }}>
        {day.description}
      </p>

      {day.segments && day.segments.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {day.segments.map((s, i) => (
            <li key={i} className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--faint)" }}>
              <span className="inline-block h-1 w-1 rounded-full" style={{ background: meta.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {day.notes && (
        <p className="mt-1.5 text-[11px] italic rounded px-1.5 py-1" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          {day.notes}
        </p>
      )}
    </button>
  );
}
