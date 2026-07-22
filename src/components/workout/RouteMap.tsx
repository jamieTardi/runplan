"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** OpenStreetMap route trace of the activity, themed via globals.css. */
export function RouteMap({ route }: { route: [number, number][] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      map = L.map(ref.current, {
        zoomControl: true,
        scrollWheelZoom: false, // don't hijack page scroll
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const line = L.polyline(route, { color: "#4f46e5", weight: 3, opacity: 0.9 }).addTo(map);
      L.circleMarker(route[0], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#16a34a",
        fillOpacity: 1,
      }).addTo(map);
      L.circleMarker(route[route.length - 1], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#dc2626",
        fillOpacity: 1,
      }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20] });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route]);

  return (
    <div
      ref={ref}
      className="route-map"
      style={{ height: 320, borderRadius: 12, overflow: "hidden", zIndex: 0 }}
      aria-label="Route map"
    />
  );
}
