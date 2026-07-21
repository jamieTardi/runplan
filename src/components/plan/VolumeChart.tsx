"use client";

import type { Phase } from "@/db/schema";
import { PHASE_META } from "@/lib/planMeta";
import { distanceIn, type Unit } from "@/lib/units";

export interface VolumeBar {
  weekIndex: number;
  phase: Phase;
  plannedVolumeKm: number;
  isCutback: boolean;
  doneKm?: number;
}

/** Compact responsive SVG bar chart of weekly volume, coloured by phase. */
export function VolumeChart({
  weeks,
  unit,
  height = 120,
  highlightWeek,
}: {
  weeks: VolumeBar[];
  unit: Unit;
  height?: number;
  highlightWeek?: number;
}) {
  if (weeks.length === 0) return null;
  const W = 100;
  const H = 40;
  const max = Math.max(...weeks.map((w) => w.plannedVolumeKm), 1);
  const gap = 0.6;
  const bw = (W - gap * (weeks.length - 1)) / weeks.length;

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        role="img"
        aria-label="Weekly training volume"
      >
        {weeks.map((w, i) => {
          const x = i * (bw + gap);
          const h = (w.plannedVolumeKm / max) * (H - 2);
          const color = PHASE_META[w.phase].color;
          const isHi = highlightWeek === w.weekIndex;
          const doneH = w.doneKm != null ? Math.min(h, (w.doneKm / max) * (H - 2)) : 0;
          return (
            <g key={i}>
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={h}
                rx={0.6}
                fill={color}
                opacity={w.isCutback ? 0.42 : isHi ? 1 : 0.72}
              />
              {w.doneKm != null && doneH > 0 && (
                <rect x={x} y={H - doneH} width={bw} height={doneH} rx={0.6} fill={color} />
              )}
              {isHi && (
                <rect x={x} y={0} width={bw} height={H} fill={color} opacity={0.12} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px]" style={{ color: "var(--faint)" }}>
        <span>Wk 1</span>
        <span>
          Peak {distanceIn(max, unit).toFixed(0)} {unit}
        </span>
        <span>Wk {weeks.length}</span>
      </div>
    </div>
  );
}
