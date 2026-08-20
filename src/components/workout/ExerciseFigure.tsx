"use client";

import { useEffect, useState } from "react";
import { EXERCISE_ART, type Point } from "@/lib/plan/exerciseArt";

/**
 * Renders one strength exercise as a stick figure in the app's shared
 * illustration style. Two-pose exercises loop a slow, eased movement between
 * poses (SMIL path interpolation); one-pose exercises (isometric holds) and
 * users preferring reduced motion get the static start pose.
 */

const DUR = "2.8s";
const EASE = { keyTimes: "0; 0.5; 1", calcMode: "spline", keySplines: "0.45 0 0.55 1; 0.45 0 0.55 1" };

function pathD(pts: Point[]): string {
  return "M" + pts.map(([x, y]) => `${x} ${y}`).join(" L");
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function ExerciseFigure({ exerciseId, label }: { exerciseId: string; label: string }) {
  const reduced = useReducedMotion();
  const art = EXERCISE_ART[exerciseId];
  if (!art) return null;
  const { poseA } = art;
  const poseB = reduced ? undefined : art.poseB;

  return (
    <svg viewBox="0 0 120 90" role="img" aria-label={label} className="block w-full h-auto">
      <line
        x1={8}
        y1={80}
        x2={112}
        y2={80}
        stroke="var(--border-strong)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {Object.entries(poseA.parts).map(([name, pts]) => {
        const far = name.endsWith("B");
        const a = pathD(pts);
        const b = poseB ? pathD(poseB.parts[name] ?? pts) : a;
        return (
          <path
            key={name}
            d={a}
            fill="none"
            stroke={far ? "var(--faint)" : "var(--foreground)"}
            strokeWidth={far ? 4.5 : 5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={far ? 0.55 : 1}
          >
            {b !== a && <animate attributeName="d" values={`${a}; ${b}; ${a}`} dur={DUR} repeatCount="indefinite" {...EASE} />}
          </path>
        );
      })}
      <circle cx={poseA.head[0]} cy={poseA.head[1]} r={6} fill="var(--foreground)">
        {poseB && poseB.head[0] !== poseA.head[0] && (
          <animate attributeName="cx" values={`${poseA.head[0]}; ${poseB.head[0]}; ${poseA.head[0]}`} dur={DUR} repeatCount="indefinite" {...EASE} />
        )}
        {poseB && poseB.head[1] !== poseA.head[1] && (
          <animate attributeName="cy" values={`${poseA.head[1]}; ${poseB.head[1]}; ${poseA.head[1]}`} dur={DUR} repeatCount="indefinite" {...EASE} />
        )}
      </circle>
    </svg>
  );
}
