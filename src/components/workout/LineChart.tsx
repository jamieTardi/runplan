"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Minimal single-series SVG line chart with a crosshair tooltip.
 * Colors come in as CSS variables so light/dark themes both work.
 */
export function LineChart({
  points,
  color,
  height = 170,
  invertY = false,
  area = false,
  formatX,
  formatY,
  yTicks = 3,
  onHover,
}: {
  points: ChartPoint[];
  color: string;
  height?: number;
  /** Pace-style axis: smaller values plotted higher. */
  invertY?: boolean;
  area?: boolean;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  yTicks?: number;
  /** Fires when the hovered point changes (null when the pointer leaves). */
  onHover?: (point: ChartPoint | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null); // point index
  const [pinned, setPinned] = useState(false); // click/tap freezes the crosshair
  const lastNotified = useRef<number | null>(null);

  function notify(index: number | null) {
    if (!onHover || lastNotified.current === index) return;
    lastNotified.current = index;
    onHover(index == null ? null : points[index]);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PAD = { left: 44, right: 10, top: 10, bottom: 22 };
  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;

  const domain = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const yPadding = (yMax - yMin || 1) * 0.08;
    return {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: yMin - yPadding,
      y1: yMax + yPadding,
    };
  }, [points]);

  const sx = useCallback(
    (x: number) => PAD.left + ((x - domain.x0) / (domain.x1 - domain.x0 || 1)) * plotW,
    [domain, plotW, PAD.left],
  );
  const sy = useCallback(
    (y: number) => {
      const t = (y - domain.y0) / (domain.y1 - domain.y0 || 1);
      return PAD.top + (invertY ? t : 1 - t) * plotH;
    },
    [domain, plotH, invertY, PAD.top],
  );

  const path = useMemo(() => {
    if (!points.length) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
  }, [points, sx, sy]);

  const areaPath = useMemo(() => {
    if (!area || !points.length) return "";
    const base = PAD.top + plotH;
    return `${path}L${sx(points[points.length - 1].x).toFixed(1)},${base}L${sx(points[0].x).toFixed(1)},${base}Z`;
  }, [area, path, points, sx, plotH, PAD.top]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i <= yTicks; i++) out.push(domain.y0 + ((domain.y1 - domain.y0) / yTicks) * i);
    return out;
  }, [domain, yTicks]);

  function indexAt(clientX: number): number | null {
    const el = wrapRef.current;
    if (!el || !points.length) return null;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const targetX = domain.x0 + ((px - PAD.left) / plotW) * (domain.x1 - domain.x0);
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - targetX) < Math.abs(points[best].x - targetX)) best = i;
    }
    return best;
  }

  function onMove(clientX: number) {
    if (pinned) return;
    const best = indexAt(clientX);
    if (best == null) return;
    setHover(best);
    notify(best);
  }

  // Click (or tap) pins the crosshair in place; click again to release.
  function onClick(clientX: number) {
    const best = indexAt(clientX);
    if (best == null) return;
    setPinned(!pinned);
    setHover(best);
    notify(best);
  }

  if (points.length < 2) return null;
  const hp = hover != null ? points[hover] : null;

  return (
    <div
      ref={wrapRef}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => {
        if (pinned) return;
        setHover(null);
        notify(null);
      }}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onTouchEnd={() => {
        if (pinned) return;
        setHover(null);
        notify(null);
      }}
      onClick={(e) => onClick(e.clientX)}
      style={{ position: "relative", width: "100%", cursor: "crosshair" }}
    >
      <svg width={width || "100%"} height={height} style={{ display: "block" }} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={sy(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--faint)"
            >
              {formatY(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={height - 6} fontSize={10} fill="var(--faint)">
          {formatX(domain.x0)}
        </text>
        <text x={PAD.left + plotW} y={height - 6} textAnchor="end" fontSize={10} fill="var(--faint)">
          {formatX(domain.x1)}
        </text>

        {area && <path d={areaPath} fill={color} opacity={0.14} />}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {hp && (
          <g>
            <line
              x1={sx(hp.x)}
              x2={sx(hp.x)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
            {pinned && (
              <circle cx={sx(hp.x)} cy={sy(hp.y)} r={8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
            )}
          </g>
        )}
      </svg>
      {hp && (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(sx(hp.x) - 50, 0), Math.max(width - 110, 0)),
            top: 0,
            pointerEvents: "none",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 12,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          {pinned && <span aria-hidden>📍 </span>}
          <span style={{ color: "var(--muted)" }}>{formatX(hp.x)}</span>{" "}
          <strong>{formatY(hp.y)}</strong>
        </div>
      )}
    </div>
  );
}
