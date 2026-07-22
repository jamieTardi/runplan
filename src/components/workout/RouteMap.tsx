"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** OpenStreetMap route trace of the activity, themed via globals.css. */
export function RouteMap({
  route,
  highlight,
}: {
  route: [number, number][];
  /** Optional position to spotlight (e.g. driven by elevation-chart hover). */
  highlight?: [number, number] | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const highlightRef = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      leafletRef.current = L;

      map = L.map(ref.current, {
        zoomControl: true,
        scrollWheelZoom: true, // wheel zoom while the pointer is over the map
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
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      highlightRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, [route]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!highlight) {
      highlightRef.current?.remove();
      highlightRef.current = null;
      return;
    }
    if (!highlightRef.current) {
      highlightRef.current = L.circleMarker(highlight, {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 1,
      }).addTo(map);
    } else {
      highlightRef.current.setLatLng(highlight);
    }
  }, [highlight]);

  return (
    <div
      ref={ref}
      className="route-map"
      style={{ height: 320, borderRadius: 12, overflow: "hidden", zIndex: 0 }}
      aria-label="Route map"
    />
  );
}
