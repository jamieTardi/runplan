"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 60_000;

/**
 * Background Garmin sync while the page is open: once on mount, then every
 * POLL_MS, plus whenever the tab regains visibility. Only rendered for pro
 * users with a connected Garmin account, so there's no wasted polling.
 */
export function GarminAutoSync() {
  const router = useRouter();
  const inFlight = useRef(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;

    async function sync() {
      if (inFlight.current || stopped.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/garmin/sync", { method: "POST" });
        if (res.status === 400 || res.status === 401 || res.status === 402) {
          // Disconnected, signed out or no longer pro — stop polling.
          stopped.current = true;
          return;
        }
        if (!res.ok) return;
        const result = (await res.json()) as { matched?: number; autoSent?: number };
        if ((result.matched ?? 0) > 0 || (result.autoSent ?? 0) > 0) router.refresh();
      } catch {
        // Network hiccup — the next tick retries.
      } finally {
        inFlight.current = false;
      }
    }

    void sync();
    const timer = setInterval(sync, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped.current = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
