// Geo primitives. Node-safe (no browser globals) — shared by the app and
// the ingest scripts, like Frame's counties.js.

export const EARTH_R = 6371000; // metres

const RAD = Math.PI / 180;

// Great-circle distance in metres (haversine).
export function distanceM(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

// Standard geohash encode. Precision 6 ≈ 1.2 km × 0.6 km cell — used only to
// make dedup ids compact and stable, never for proximity search (see dedup.js).
export function geohash(lat, lng, precision = 6) {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let hash = '';
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lonMin = mid; } else { idx = idx * 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += B32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

export function inBBox(lat, lng, bbox) {
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

export function bboxCenter(bbox) {
  return {
    lat: (bbox.south + bbox.north) / 2,
    lng: (bbox.west + bbox.east) / 2,
  };
}

// Even-odd ray cast: is (lat,lng) inside a ring of [lat,lng] points?
export function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    const hit = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

// Inside ANY ring of an area, with a fast bbox reject first.
export function pointInArea(lat, lng, area) {
  const b = area.bbox;
  if (b && (lat < b.south || lat > b.north || lng < b.west || lng > b.east)) return false;
  return (area.rings ?? []).some((r) => pointInRing(lat, lng, r));
}
