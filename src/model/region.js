// Region access for the app (browser). The ingest scripts read the same
// config/regions.json via fs — one file, two consumers, zero drift.
//
// Multi-region: config/regions.json holds { default, regions:[...] }. Each
// region keeps the single-region shape (id, name, bbox, counties). The app
// loads the list, lets you switch, and fetches data/regions/<id>.json.

import { inBBox } from './geo.js';

let cached = null;

export async function loadRegions() {
  if (cached) return cached;
  const res = await fetch('./config/regions.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`regions config: HTTP ${res.status}`);
  cached = await res.json();
  return cached;
}

// One region by id (default region when id is omitted/unknown).
export async function loadRegion(id) {
  const doc = await loadRegions();
  return pickRegion(doc, id);
}

export function pickRegion(doc, id) {
  const regions = doc.regions ?? [];
  return regions.find((r) => r.id === id) ?? regions.find((r) => r.id === doc.default) ?? regions[0];
}

// Which covered region should a GPS fix land in? Among the regions whose box
// holds the fix, the one whose box is smallest (area in degrees), so a town's
// box beats the statewide box that also holds it. An exact tie goes to the
// region whose id is `activeId`, then to file order. Null when there is no fix,
// no list, or no box holds the fix.
export function regionForFix(regions, coords, activeId) {
  if (!coords || !Array.isArray(regions)) return null;
  let best = null;
  let bestArea = Infinity;
  for (const r of regions) {
    if (!r.bbox || !inBBox(coords.lat, coords.lng, r.bbox)) continue;
    const area = (r.bbox.north - r.bbox.south) * (r.bbox.east - r.bbox.west);
    if (area < bestArea || (area === bestArea && r.id === activeId && best?.id !== activeId)) {
      best = r;
      bestArea = area;
    }
  }
  return best;
}

// Node-safe validation, shared with ingest's `validate` command and tests.
export function validateRegion(region) {
  const errs = [];
  if (!region.id) errs.push('region missing id');
  if (!region.name) errs.push('region missing name');
  const b = region.bbox;
  if (!b || !(b.south < b.north) || !(b.west < b.east)) {
    errs.push('region bbox invalid (need south<north, west<east)');
  }
  if (!Array.isArray(region.counties) || region.counties.length === 0) {
    errs.push('region needs at least one county');
  } else {
    for (const c of region.counties) {
      if (!c.name || !c.osm_area_name) errs.push(`county ${c.fips ?? '?'} missing name/osm_area_name`);
      if (!/^\d{5}$/.test(c.fips ?? '')) errs.push(`county ${c.name} bad fips`);
    }
  }
  return errs;
}

// Validate the whole multi-region doc (unique ids, valid default, each region).
export function validateRegions(doc) {
  const errs = [];
  const regions = doc.regions ?? [];
  if (!regions.length) errs.push('no regions');
  const ids = new Set();
  for (const r of regions) {
    if (ids.has(r.id)) errs.push(`duplicate region id: ${r.id}`);
    ids.add(r.id);
    for (const e of validateRegion(r)) errs.push(`[${r.id}] ${e}`);
  }
  if (doc.default && !ids.has(doc.default)) errs.push(`default '${doc.default}' is not a region`);
  return errs;
}
