// tides.js — today's high and low tides, live from NOAA CO-OPS (US public
// domain, no key, CORS-friendly), fetched per spot when its popup opens. Fails
// soft (null) so the app never depends on the network.
//
// WHY IT MATTERS: on the coast, tide state IS the shot — low tide opens tide
// pools, sea stacks, arches and wet-sand reflections; high tide drowns them.
// Humboldt and Panama City Beach are coastal regions, so this answers "when do
// I go?" the way the Tonight panel answers "when's the dark window?".
//
// HOW: NOAA publishes tide predictions per STATION, so we (1) find the nearest
// station to the spot from the public station list, then (2) pull today's
// hi/lo predictions for it. Both calls are keyless. The station list is fetched
// once per session and cached in memory. If the nearest station is far away the
// numbers stop being meaningful, so anything beyond MAX_STATION_KM is treated as
// "no tide data here" (inland spots simply never show the line).

import { distanceM } from './geo.js';

const STATIONS_URL =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
const PREDICTIONS_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

// Beyond this, the nearest tide station is too far to describe the spot's water.
export const MAX_STATION_KM = 40;

let stationCache = null; // in-memory per session: [{id, name, lat, lng}]

export async function loadStations({ fetchFn = fetch } = {}) {
  if (stationCache) return stationCache;
  try {
    const res = await fetchFn(STATIONS_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const j = await res.json();
    const list = (j?.stations ?? [])
      .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
      .map((s) => ({ id: String(s.id), name: s.name, lat: s.lat, lng: s.lng }));
    if (!list.length) return null;
    stationCache = list;
    return stationCache;
  } catch {
    return null;
  }
}

// Nearest station to a point, or null when none is close enough to be meaningful.
export function nearestStation(lat, lng, stations) {
  if (!stations?.length) return null;
  let best = null;
  let bestM = Infinity;
  for (const s of stations) {
    const m = distanceM({ lat, lng }, { lat: s.lat, lng: s.lng });
    if (m < bestM) { bestM = m; best = s; }
  }
  if (!best || bestM > MAX_STATION_KM * 1000) return null;
  return { ...best, distanceKm: Math.round(bestM / 1000) };
}

// yyyymmdd in LOCAL time — NOAA wants a plain date and we want the user's today.
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// Parse NOAA's hi/lo predictions into {type:'high'|'low', time, feet}.
export function parsePredictions(json) {
  const rows = json?.predictions ?? [];
  return rows.map((r) => ({
    type: r.type === 'H' ? 'high' : 'low',
    // NOAA returns "2026-07-25 06:12" in the station's local time.
    time: typeof r.t === 'string' ? r.t.slice(11) : null,
    feet: Number(r.v),
  })).filter((r) => r.time && isFinite(r.feet));
}

// Today's tides for a spot: { station, distanceKm, events:[{type,time,feet}] }
// or null (inland, offline, or NOAA unavailable) — always fails soft.
export async function tidesToday(lat, lng, { fetchFn = fetch, date = new Date() } = {}) {
  const stations = await loadStations({ fetchFn });
  const st = nearestStation(lat, lng, stations);
  if (!st) return null; // inland, or no station near enough to mean anything
  const day = ymd(date);
  const url = `${PREDICTIONS_URL}?product=predictions&interval=hilo&datum=MLLW`
    + `&units=english&time_zone=lst_ldt&format=json&application=photo-pointer`
    + `&begin_date=${day}&end_date=${day}&station=${st.id}`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const events = parsePredictions(await res.json());
    if (!events.length) return null;
    return { station: st.name, stationId: st.id, distanceKm: st.distanceKm, events };
  } catch {
    return null;
  }
}

// "Low 6:12am (0.4 ft) · High 12:40pm (5.1 ft) · Low 6:55pm (1.1 ft)"
export function formatTides(t) {
  if (!t?.events?.length) return null;
  return t.events.map((e) => {
    const [hh, mm] = e.time.split(':');
    let h = Number(hh);
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    const label = e.type === 'high' ? 'High' : 'Low';
    return `${label} ${h}:${mm}${ampm} (${e.feet.toFixed(1)} ft)`;
  }).join(' · ');
}
