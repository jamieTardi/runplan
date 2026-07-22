"use client";

import { useEffect } from "react";

/** Registers the service worker (PWA installability + offline fallback). */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
