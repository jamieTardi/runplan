// Small pure geo helpers shared by the course and activity views.

export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Cumulative metres along a [lat, lng] polyline; same length as the input. */
export function cumulativeDistancesM(route: [number, number][]): number[] {
  if (route.length === 0) return [];
  const out: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    out.push(out[i - 1] + haversineM(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]));
  }
  return out;
}

/** Index of the closest cumulative distance to dM (binary search; ascending input). */
export function nearestIndexByDistance(distances: number[], dM: number): number {
  if (distances.length === 0) return -1;
  let lo = 0;
  let hi = distances.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] < dM) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && dM - distances[lo - 1] < distances[lo] - dM ? lo - 1 : lo;
}
