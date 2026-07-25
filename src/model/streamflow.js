// streamflow.js — is the water actually running? Live river flow from the USGS
// Water Services API (US public domain, no key), fetched when a water spot's
// popup opens. Fails soft (null) so the app never depends on the network.
//
// WHY IT MATTERS: a named waterfall is a year-round pin, but the SHOT isn't —
// half of them are a dry stain on a rock in late summer and a torrent in spring.
// Now that GNIS + OSM have filled the map with named falls, "is it running today,
// and is that high or low for this date?" is the question worth answering before
// a drive. Gage height also flags a river too high/muddy to shoot.
//
// HOW (mirrors tides.js): USGS publishes readings per GAUGE, so we (1) pull every
// active gauge in the region bbox WITH its latest reading in one call, cached per
// region for the session, then (2) for the nearest gauge, pull that gauge's
// long-term MEDIAN flow for today's calendar day so the number has context
// ("about normal", "well above normal"). Beyond MAX_GAUGE_KM the nearest gauge
// stops describing this spot's water, so we show nothing rather than mislead.

import { distanceM } from './geo.js';

const IV_URL = 'https://waterservices.usgs.gov/nwis/iv/';
const STAT_URL = 'https://waterservices.usgs.gov/nwis/stat/';

// Discharge (cubic feet/second) and gage height (feet) — the two parameters that
// answer "is it running" and "is it too high".
export const P_DISCHARGE = '00060';
export const P_GAGE_HEIGHT = '00065';

// Beyond this the nearest gauge is on different water — don't pretend it applies.
export const MAX_GAUGE_KM = 25;

const gaugeCache = new Map(); // regionId → [{id,name,lat,lng,cfs,gageFt,when}]
const medianCache = new Map(); // `${siteId}:${mm}-${dd}` → number | null

// One USGS call per region: every active gauge in the bbox with its latest values.
export function buildIvUrl(bbox) {
  const n = (v) => Number(v).toFixed(4);
  const bb = `${n(bbox.west)},${n(bbox.south)},${n(bbox.east)},${n(bbox.north)}`;
  return `${IV_URL}?format=json&bBox=${bb}&parameterCd=${P_DISCHARGE},${P_GAGE_HEIGHT}`
    + '&siteStatus=active';
}

// USGS returns one timeSeries per (site, parameter) — fold them into one row per
// site carrying whichever of discharge / gage height that site reports.
export function parseGauges(json) {
  const series = json?.value?.timeSeries ?? [];
  const bySite = new Map();
  for (const ts of series) {
    const info = ts.sourceInfo ?? {};
    const id = info.siteCode?.[0]?.value;
    const geo = info.geoLocation?.geogLocation ?? {};
    const lat = Number(geo.latitude);
    const lng = Number(geo.longitude);
    if (!id || !isFinite(lat) || !isFinite(lng)) continue;
    const code = ts.variable?.variableCode?.[0]?.value;
    const v = ts.values?.[0]?.value?.[0];
    const num = v ? Number(v.value) : NaN;
    // USGS uses -999999 for "no reading".
    if (!isFinite(num) || num <= -999999) continue;
    const row = bySite.get(id) ?? { id, name: info.siteName ?? `Gauge ${id}`, lat, lng, cfs: null, gageFt: null, when: null };
    if (code === P_DISCHARGE) row.cfs = num;
    else if (code === P_GAGE_HEIGHT) row.gageFt = num;
    if (v?.dateTime) row.when = v.dateTime;
    bySite.set(id, row);
  }
  // A gauge with neither reading tells us nothing.
  return [...bySite.values()].filter((g) => g.cfs != null || g.gageFt != null);
}

export async function loadGauges(region, { fetchFn = fetch } = {}) {
  if (!region?.bbox) return null;
  if (gaugeCache.has(region.id)) return gaugeCache.get(region.id);
  try {
    const res = await fetchFn(buildIvUrl(region.bbox), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const list = parseGauges(await res.json());
    if (!list.length) { gaugeCache.set(region.id, []); return []; }
    gaugeCache.set(region.id, list);
    return list;
  } catch {
    return null;
  }
}

// Nearest gauge to a point, or null when none is close enough to be meaningful.
export function nearestGauge(lat, lng, gauges) {
  if (!gauges?.length) return null;
  let best = null;
  let bestM = Infinity;
  for (const g of gauges) {
    const m = distanceM({ lat, lng }, { lat: g.lat, lng: g.lng });
    if (m < bestM) { bestM = m; best = g; }
  }
  if (!best || bestM > MAX_GAUGE_KM * 1000) return null;
  return { ...best, distanceKm: Math.round(bestM / 1000) };
}

// USGS statistics come back as RDB: '#' comments, a header row, a format row,
// then tab-separated data. Pull the median discharge for one month/day.
export function parseMedianRdb(text, month, day) {
  const lines = String(text ?? '').split('\n').filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return null;
  const head = lines[0].split('\t');
  const iMonth = head.indexOf('month_nu');
  const iDay = head.indexOf('day_nu');
  const iMed = head.indexOf('median_va');
  if (iMonth < 0 || iDay < 0 || iMed < 0) return null;
  for (const line of lines.slice(2)) { // skip the '5s 15s ...' format row
    const c = line.split('\t');
    if (Number(c[iMonth]) === month && Number(c[iDay]) === day) {
      const v = Number(c[iMed]);
      return isFinite(v) ? v : null;
    }
  }
  return null;
}

// The long-term median flow for this gauge on today's calendar day (context for
// the current reading). Cached per site+day; fails soft to null.
export async function medianForToday(siteId, { fetchFn = fetch, date = new Date() } = {}) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const key = `${siteId}:${month}-${day}`;
  if (medianCache.has(key)) return medianCache.get(key);
  const url = `${STAT_URL}?format=rdb&sites=${encodeURIComponent(siteId)}`
    + `&statReportType=daily&statTypeCd=median&parameterCd=${P_DISCHARGE}`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { medianCache.set(key, null); return null; }
    const med = parseMedianRdb(await res.text(), month, day);
    medianCache.set(key, med);
    return med;
  } catch {
    return null;
  }
}

// Current vs the median for this date, in plain words. Deliberately coarse —
// the ratio is the honest signal; a finer scale would imply precision we lack.
export function relativeFlow(cfs, median) {
  if (cfs == null || !median || median <= 0) return null;
  const r = cfs / median;
  if (r < 0.4) return 'much lower than usual for the date';
  if (r < 0.75) return 'lower than usual for the date';
  if (r <= 1.5) return 'about normal for the date';
  if (r <= 3) return 'higher than usual for the date';
  return 'much higher than usual for the date';
}

// Whether a spot is about moving water at all — only those get a flow line.
export function isWaterSpot(spot) {
  if (!spot) return false;
  if (spot.category === 'waterfall') return true;
  if (spot.tags?.curiosity === 'Waterfall') return true;
  const nat = spot.tags?.natural;
  if (nat === 'waterfall' || nat === 'spring' || nat === 'hot_spring') return true;
  return (spot.subject_type ?? []).includes('water');
}

// Live flow near a spot: { site, distanceKm, cfs, gageFt, when, median, relative }
// or null (not a water spot, no gauge near, offline, USGS down) — always soft.
export async function flowNow(spot, region, { fetchFn = fetch, date = new Date() } = {}) {
  if (!isWaterSpot(spot)) return null;
  const gauges = await loadGauges(region, { fetchFn });
  const g = nearestGauge(spot.lat, spot.lng, gauges);
  if (!g) return null;
  const median = g.cfs != null ? await medianForToday(g.id, { fetchFn, date }) : null;
  return {
    site: g.name,
    siteId: g.id,
    distanceKm: g.distanceKm,
    cfs: g.cfs,
    gageFt: g.gageFt,
    when: g.when,
    median,
    relative: relativeFlow(g.cfs, median),
  };
}

// "River running 412 cfs — about normal for the date (Bear River, 6 km away)"
export function formatFlow(f) {
  if (!f) return null;
  const bits = [];
  if (f.cfs != null) bits.push(`${Math.round(f.cfs).toLocaleString()} cfs`);
  if (f.gageFt != null) bits.push(`${f.gageFt.toFixed(1)} ft gage`);
  if (!bits.length) return null;
  const rel = f.relative ? ` — ${f.relative}` : '';
  return `Water now: ${bits.join(' · ')}${rel} (${f.site}, ${f.distanceKm} km away)`;
}
