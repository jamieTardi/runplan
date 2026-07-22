import "server-only";

// Small in-memory TTL stores for short-lived auth state (WebAuthn challenges,
// rate-limit counters). Single long-lived Node process, so a Map is fine.

const store = new Map<string, { value: string; expiresAt: number }>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}

export function putChallenge(key: string, value: string, ttlMs = 5 * 60 * 1000): void {
  prune();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Retrieves and consumes (single use). */
export function takeChallenge(key: string): string | null {
  prune();
  const hit = store.get(key);
  if (!hit) return null;
  store.delete(key);
  return hit.value;
}

// --- Fixed-window rate limiter --------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();

/** True when the caller is within `max` hits per `windowMs` for this key. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}
