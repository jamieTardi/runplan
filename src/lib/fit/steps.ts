// Pure translation of a planned workout into FIT workout steps. No I/O.
//
// Segment labels are produced by src/lib/plan/buildWeek.ts with a small, known
// grammar ("warm-up 3 km easy", "5 × 1000m @ interval pace, 2:30 jog recovery",
// "final 12 km @ marathon pace", "6 × 20s strides", …). Anything unparseable
// falls back to a single steady step so the export never fails.

import type { PaceZones } from "@/lib/plan/vdot";
import type { WorkoutSegment } from "@/lib/plan/types";

export interface FitStepPlan {
  kind: "step";
  name: string;
  intensity: "warmup" | "active" | "rest" | "cooldown" | "recovery";
  /** Distance-based duration in metres (exclusive with durationS; neither = lap press). */
  durationM?: number;
  /** Time-based duration in seconds. */
  durationS?: number;
  /** Target pace band, sec/km. Omitted = open target. */
  paceFastSPerKm?: number;
  paceSlowSPerKm?: number;
}

export interface FitRepeatPlan {
  kind: "repeat";
  /** Step index the repeat jumps back to. */
  fromIndex: number;
  count: number;
}

export type FitPlanItem = FitStepPlan | FitRepeatPlan;

export interface FitWorkoutInput {
  type: string;
  distanceKm: number;
  paceLowSPerKm: number | null;
  paceHighSPerKm: number | null;
  segments: WorkoutSegment[] | null;
  description: string;
}

/** A single exact pace makes a uselessly narrow watch target — widen it a touch. */
function band(fast: number, slow: number): { fast: number; slow: number } {
  if (slow - fast >= 10) return { fast, slow };
  const pad = Math.max(5, Math.round(fast * 0.02));
  return { fast: fast - pad, slow: slow + pad };
}

function paced(step: Omit<FitStepPlan, "kind" | "paceFastSPerKm" | "paceSlowSPerKm">, fast: number, slow: number): FitStepPlan {
  const b = band(fast, slow);
  return { kind: "step", ...step, paceFastSPerKm: b.fast, paceSlowSPerKm: b.slow };
}

/** "2:30" → 150, "3 min" → 180, "90s" → 90. */
function parseRecoverySeconds(text: string): number | null {
  let m = text.match(/(\d+):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = text.match(/(\d+)\s*min/);
  if (m) return Number(m[1]) * 60;
  m = text.match(/(\d+)\s*s\b/);
  if (m) return Number(m[1]);
  return null;
}

interface ParsedReps {
  count: number;
  /** One of the two is set. */
  repM?: number;
  repS?: number;
  recoveryS: number;
}

/** "5 × 1000m @ … 2:30 jog recovery" / "2 × 15 min @ … 3 min jog …" / "3 × 1600m @ …, 90s jog". */
function parseReps(label: string): ParsedReps | null {
  const m = label.match(/^(\d+)\s*×\s*([\d.]+)\s*(m|km|min)\b(.*)$/);
  if (!m) return null;
  const count = Number(m[1]);
  const qty = Number(m[2]);
  if (!count || !qty) return null;
  const rest = m[4] ?? "";
  const recoveryS = parseRecoverySeconds(rest) ?? 120;
  if (m[3] === "min") return { count, repS: qty * 60, recoveryS };
  return { count, repM: m[3] === "km" ? qty * 1000 : qty, recoveryS };
}

/** "6 × 20s strides…" → { count, seconds }. */
function parseStrides(label: string): { count: number; seconds: number } | null {
  const m = label.match(/(\d+)\s*×\s*(\d+)\s*s\s*strides/);
  return m ? { count: Number(m[1]), seconds: Number(m[2]) } : null;
}

function parseKm(label: string): number | null {
  const m = label.match(/([\d.]+)\s*km/);
  return m ? Number(m[1]) : null;
}

/**
 * Build the FIT step list for a planned workout, or null for rest days.
 * `zones` are the runner's current-fitness Daniels zones (for warm-up,
 * cool-down, recovery and stride paces the workout row doesn't carry).
 */
export function buildWorkoutSteps(w: FitWorkoutInput, zones: PaceZones): FitPlanItem[] | null {
  if (w.type === "rest" || w.distanceKm <= 0) return null;

  const easyFast = Math.round(zones.easyFast);
  const easySlow = Math.round(zones.easySlow);
  const fast = w.paceLowSPerKm ?? easyFast;
  const slow = w.paceHighSPerKm ?? easySlow;

  const mainStep = (): FitStepPlan =>
    paced(
      { name: w.description || "Run", intensity: "active", durationM: Math.round(w.distanceKm * 1000) },
      fast,
      slow,
    );

  const segments = w.segments ?? [];
  if (segments.length === 0) return [mainStep()];

  const items: FitPlanItem[] = [];
  let handledMain = false;
  let unparsed = false;

  for (const seg of segments) {
    if (seg.kind === "warmup" || seg.kind === "cooldown") {
      const km = parseKm(seg.label);
      items.push(
        paced(
          {
            name: seg.kind === "warmup" ? "Warm-up" : "Cool-down",
            intensity: seg.kind,
            ...(km ? { durationM: Math.round(km * 1000) } : {}), // no distance → lap press
          },
          easyFast,
          easySlow,
        ),
      );
      continue;
    }

    if (seg.kind === "strides") {
      const s = parseStrides(seg.label);
      if (!s) {
        unparsed = true;
        continue;
      }
      // Strides ride on an easy run: main distance first, then the strides block.
      if (!handledMain) {
        items.push(mainStep());
        handledMain = true;
      }
      const from = items.length;
      items.push(
        paced(
          { name: "Stride", intensity: "active", durationS: s.seconds },
          Math.round(zones.rep),
          Math.round(zones.rep),
        ),
      );
      items.push({ kind: "step", name: "Recover", intensity: "recovery", durationS: 60 });
      items.push({ kind: "repeat", fromIndex: from, count: s.count });
      handledMain = true;
      continue;
    }

    // steady / reps
    const reps = parseReps(seg.label);
    if (reps && reps.count > 1) {
      const from = items.length;
      items.push(
        paced(
          {
            name: seg.label.split(",")[0].trim(),
            intensity: "active",
            ...(reps.repM ? { durationM: Math.round(reps.repM) } : { durationS: reps.repS }),
          },
          fast,
          slow,
        ),
      );
      items.push({ kind: "step", name: "Jog recovery", intensity: "recovery", durationS: reps.recoveryS });
      items.push({ kind: "repeat", fromIndex: from, count: reps.count });
      handledMain = true;
      continue;
    }

    // Long run finishing at marathon pace: easy portion, then the MP block.
    const finalMatch = seg.label.match(/^final\s+([\d.]+)\s*km\s*@\s*marathon pace/i);
    if (finalMatch) {
      const mpKm = Number(finalMatch[1]);
      const easyKm = Math.max(w.distanceKm - mpKm, 0);
      if (easyKm > 0) {
        items.push(
          paced(
            { name: "Long run (easy)", intensity: "active", durationM: Math.round(easyKm * 1000) },
            easyFast,
            easySlow,
          ),
        );
      }
      items.push(
        paced(
          { name: `Final ${mpKm} km @ MP`, intensity: "active", durationM: Math.round(mpKm * 1000) },
          Math.round(zones.marathon),
          Math.round(zones.marathon),
        ),
      );
      handledMain = true;
      continue;
    }

    // Time-based steady block ("40 min continuous @ threshold", "20 min @ threshold").
    const minMatch = seg.label.match(/^.*?(\d+)\s*min\b/);
    if (minMatch && !seg.label.includes("×")) {
      items.push(
        paced(
          { name: seg.label, intensity: "active", durationS: Number(minMatch[1]) * 60 },
          fast,
          slow,
        ),
      );
      handledMain = true;
      continue;
    }

    // Distance-based steady block, or the goal/tune-up race itself.
    const km = parseKm(seg.label) ?? w.distanceKm;
    items.push(
      paced({ name: seg.label, intensity: "active", durationM: Math.round(km * 1000) }, fast, slow),
    );
    handledMain = true;
  }

  // Structured work with no explicit warm-up/cool-down (e.g. the taper
  // sharpener): bracket it with lap-press easy steps so the watch flow works.
  const hasWork = items.some((i) => i.kind === "repeat");
  const hasWarmup = items.some((i) => i.kind === "step" && i.intensity === "warmup");
  if (hasWork && !hasWarmup && w.type !== "easy" && w.type !== "general_aerobic") {
    items.unshift(
      paced({ name: "Warm-up (lap to end)", intensity: "warmup" }, easyFast, easySlow),
    );
    // unshift shifted every index by one
    for (const i of items) if (i.kind === "repeat") i.fromIndex += 1;
    items.push(
      paced({ name: "Cool-down (lap to end)", intensity: "cooldown" }, easyFast, easySlow),
    );
  }

  if (!handledMain || items.length === 0 || (unparsed && items.length === 0)) {
    return [mainStep()];
  }
  return items;
}
