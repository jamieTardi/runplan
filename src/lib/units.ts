// Canonical storage is metric (km, seconds-per-km). These helpers convert and
// format for display based on the user's unit preference.

export type Unit = "km" | "mi";

export const KM_PER_MI = 1.609344;

export function kmToMi(km: number): number {
  return km / KM_PER_MI;
}

export function miToKm(mi: number): number {
  return mi * KM_PER_MI;
}

/** Distance value in the given unit (unrounded). */
export function distanceIn(km: number, unit: Unit): number {
  return unit === "mi" ? kmToMi(km) : km;
}

/** Format a distance for display, e.g. "16.1 km" / "10.0 mi". */
export function formatDistance(km: number, unit: Unit, digits = 1): string {
  const v = distanceIn(km, unit);
  return `${v.toFixed(digits)} ${unit}`;
}

/** Convert a pace in seconds-per-km to seconds per the display unit. */
export function paceIn(secPerKm: number, unit: Unit): number {
  return unit === "mi" ? secPerKm * KM_PER_MI : secPerKm;
}

/** Format m:ss, e.g. 255.9 -> "4:16". */
export function formatMinSec(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

/** Format a pace (sec/km) for display, e.g. "4:16 /km" or "6:52 /mi". */
export function formatPace(secPerKm: number, unit: Unit): string {
  return `${formatMinSec(paceIn(secPerKm, unit))} /${unit}`;
}

/** Format a pace range (fast..slow, both sec/km). */
export function formatPaceRange(fastSPerKm: number, slowSPerKm: number, unit: Unit): string {
  if (Math.abs(fastSPerKm - slowSPerKm) < 1) return formatPace(fastSPerKm, unit);
  return `${formatMinSec(paceIn(fastSPerKm, unit))}–${formatPace(slowSPerKm, unit)}`;
}

/** Format a duration in seconds as h:mm:ss or m:ss. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

/** Parse "h:mm:ss" or "mm:ss" or "m" into seconds. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(":").map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0] * 60; // bare minutes
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}
