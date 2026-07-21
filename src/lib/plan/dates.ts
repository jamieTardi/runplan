// UTC-based ISO date helpers ("YYYY-MM-DD"). Deterministic and timezone-safe so
// plan generation is pure and testable.

const MS_PER_DAY = 86_400_000;

export function parseISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISO(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  return toISO(parseISO(iso) + days * MS_PER_DAY);
}

export function diffDaysISO(a: string, b: string): number {
  return Math.round((parseISO(a) - parseISO(b)) / MS_PER_DAY);
}

/** ISO day of week: Mon = 1 … Sun = 7. */
export function isoDayOfWeek(iso: string): number {
  const dow = new Date(parseISO(iso)).getUTCDay(); // Sun = 0 … Sat = 6
  return dow === 0 ? 7 : dow;
}

/** The Monday (ISO week start) on or before the given date. */
export function mondayOfWeekISO(iso: string): string {
  return addDaysISO(iso, -(isoDayOfWeek(iso) - 1));
}

/** Today's date in UTC as an ISO string. */
export function todayISO(): string {
  return toISO(Date.now());
}
