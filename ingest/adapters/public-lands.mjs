// Public-land boundaries — WORKING. Which spots sit on protected public land
// (parks, forests, reserves) — the "can I actually go shoot here" layer.
//
// LICENSE: OpenStreetMap via Overpass — ODbL 1.0, "© OpenStreetMap
// contributors". Same source and terms as the OSM points adapter; reuses its
// Overpass fetcher. Runs on a runner (sandbox can't reach Overpass).
//
// Output is AREAS (polygons), not points: {name, class, operator, bbox, rings}.
// The ingest point-in-polygons every spot against these and writes
// tags.publicLand — no ring geometry ships to the browser.
//
// HONEST LIMIT: OSM has boundaries, not reliable night-access hours. The
// signal says "on public land (manager/type)", not "legal to be here at
// night" — the UI says "check access hours".

import { buildQuery as osmAreaHeader, fetchOverpass, OVERPASS_HOSTS, USER_AGENT } from './osm-overpass.mjs';

export const meta = {
  source: 'public_lands',
  name: 'Public-land boundaries (OpenStreetMap)',
  license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
  status: 'working',
};

// True protected land only. City parks are excluded on purpose — they're
// already `park` spots, and pulling every named park's full polygon across
// Sacramento made the `out geom` query too heavy for Overpass (it hung).
const SELECTORS = [
  'wr["boundary"="protected_area"]',
  'wr["leisure"="nature_reserve"]',
  'wr["boundary"="national_park"]',
];

export function buildQuery(region) {
  const b = region.bbox;
  const areas = region.counties
    .map((c) => `  area["boundary"="administrative"]["admin_level"="6"]["name"="${c.osm_area_name}"];`)
    .join('\n');
  const sel = SELECTORS.map((s) => `  ${s}(area.region);`).join('\n');
  return `[out:json][timeout:300][bbox:${b.south},${b.west},${b.north},${b.east}];
(
${areas}
)->.region;
(
${sel}
);
out geom;
`;
}

function ringsOf(el) {
  if (el.type === 'way' && Array.isArray(el.geometry)) {
    return [el.geometry.map((p) => [p.lat, p.lon])];
  }
  if (el.type === 'relation' && Array.isArray(el.members)) {
    return el.members
      .filter((m) => m.type === 'way' && Array.isArray(m.geometry))
      .map((m) => m.geometry.map((p) => [p.lat, p.lon]));
  }
  return [];
}

function bboxOf(rings) {
  let s = 90, n = -90, w = 180, e = -180;
  for (const r of rings) for (const [lat, lng] of r) {
    if (lat < s) s = lat; if (lat > n) n = lat; if (lng < w) w = lng; if (lng > e) e = lng;
  }
  return { south: s, west: w, north: n, east: e };
}

export function normalizeArea(el) {
  const rings = ringsOf(el).filter((r) => r.length >= 4);
  if (rings.length === 0) return null;
  const tags = el.tags ?? {};
  return {
    name: tags.name ?? null,
    class: tags.protect_class ?? tags.boundary ?? tags.leisure ?? 'protected',
    operator: tags.operator ?? null,
    access: tags.access ?? null,
    source_id: `${el.type}/${el.id}`,
    bbox: bboxOf(rings),
    rings,
  };
}

export async function ingest(region, { fetchFn = fetch, log = () => {} } = {}) {
  const query = buildQuery(region);
  log(`public-lands query: ${query.length} chars`);
  const json = await fetchOverpass(query, { fetchFn, hosts: OVERPASS_HOSTS });
  log(`overpass returned ${json.elements.length} elements`);
  const areas = [];
  for (const el of json.elements) {
    const a = normalizeArea(el);
    if (a) areas.push(a);
  }
  areas.sort((a, b) => a.source_id.localeCompare(b.source_id));
  log(`normalized ${areas.length} protected areas`);
  return areas;
}

// Re-export so ingest.mjs can send the polite UA if it fetches directly.
export { USER_AGENT };
