"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

const KEY = "runplan-fontscale";
const MIN = 85;
const MAX = 140;
const STEP = 5;
const DEFAULT = 100;

function applyScale(v: number) {
  // The app is sized in rem, so scaling the root font size scales everything.
  document.documentElement.style.fontSize = v === DEFAULT ? "" : `${v}%`;
}

/** Text-size slider, persisted per device (like the theme toggle). */
export function FontSizeControl() {
  const [scale, setScale] = useState(DEFAULT);

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(KEY) ?? "", 10);
    if (!Number.isNaN(stored) && stored >= MIN && stored <= MAX) setScale(stored);
  }, []);

  function update(v: number) {
    setScale(v);
    applyScale(v);
    if (v === DEFAULT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(v));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label htmlFor="font-scale" className="text-sm" style={{ color: "var(--muted)" }}>
          Text size
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{scale}%</span>
          {scale !== DEFAULT && (
            <button
              className="btn btn-ghost text-xs px-2 py-1"
              onClick={() => update(DEFAULT)}
              aria-label="Reset text size to 100%"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span aria-hidden style={{ fontSize: 12, color: "var(--faint)" }}>A</span>
        <input
          id="font-scale"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={scale}
          onChange={(e) => update(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
          aria-valuetext={`${scale} percent`}
        />
        <span aria-hidden style={{ fontSize: 22, color: "var(--faint)" }}>A</span>
      </div>
      <p className="text-xs" style={{ color: "var(--faint)" }}>
        Scales all text and layout across the app. Saved on this device.
      </p>
    </div>
  );
}
