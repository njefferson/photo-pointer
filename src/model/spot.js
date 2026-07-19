// The canonical Spot — source-agnostic, dedup-aware. Node-safe.
//
// A Spot is ONE real-world place. Records from multiple sources collapse into
// a single Spot via dedup.js; each contributing source lives on in `sources`
// (provenance is never discarded). The schema is settled BEFORE more sources
// arrive — every later adapter multiplies the cost of changing it.

export const CATEGORIES = [
  'viewpoint',
  'marker',
  'oddity',
  'park',
  'trailhead',
  'campsite',
  'wildlife_hotspot',
  'dark_sky',
  'user_pin',
];

// Photographer-intent vocabularies. Open-ended by design (curation grows
// them), but validate() warns on values outside these so typos surface.
export const SUBJECT_TYPES = [
  'landscape', 'water', 'wildlife', 'birds', 'historic', 'architecture',
  'art', 'night_sky', 'macro', 'people', 'abstract',
];
export const LIGHT = ['sunrise', 'golden_hour', 'midday', 'sunset', 'blue_hour', 'night', 'any'];
export const SEASONS = ['spring', 'summer', 'fall', 'winter', 'any'];
export const ACCESS = ['roadside', 'short_walk', 'hike', 'strenuous', 'unknown'];

// A provenance record — one per (source, source_id) that contributed.
// { source, source_id, source_license, source_url, first_seen, last_seen }
// first_seen: date this ingest first saw the record (ISO yyyy-mm-dd).
// last_seen: date of the most recent ingest that still returned it.

export function makeSpot(p) {
  return {
    id: p.id ?? null, // assigned by dedup.js (stable dedup_key)
    name: p.name ?? null,
    lat: p.lat,
    lng: p.lng,
    category: p.category,
    subject_type: p.subject_type ?? [],
    best_light: p.best_light ?? [],
    best_season: p.best_season ?? [],
    access_difficulty: p.access_difficulty ?? 'unknown',
    notes: p.notes ?? null,
    sources: p.sources ?? [],
    tags: p.tags ?? {}, // raw source-tag pass-through, kept for later curation
  };
}

// Returns a list of problem strings; empty list = valid.
export function validateSpot(s) {
  const errs = [];
  if (typeof s.lat !== 'number' || !isFinite(s.lat) || s.lat < -90 || s.lat > 90) {
    errs.push(`bad lat: ${s.lat}`);
  }
  if (typeof s.lng !== 'number' || !isFinite(s.lng) || s.lng < -180 || s.lng > 180) {
    errs.push(`bad lng: ${s.lng}`);
  }
  if (!CATEGORIES.includes(s.category)) errs.push(`bad category: ${s.category}`);
  if (!Array.isArray(s.sources) || s.sources.length === 0) {
    errs.push('no provenance: every Spot needs at least one source record');
  } else {
    for (const src of s.sources) {
      if (!src.source) errs.push('source record missing source');
      if (!src.source_license) errs.push(`source ${src.source} missing source_license`);
      if (src.source !== 'user' && !src.source_id) errs.push(`source ${src.source} missing source_id`);
    }
  }
  for (const t of s.subject_type ?? []) {
    if (!SUBJECT_TYPES.includes(t)) errs.push(`unknown subject_type: ${t}`);
  }
  for (const l of s.best_light ?? []) {
    if (!LIGHT.includes(l)) errs.push(`unknown best_light: ${l}`);
  }
  for (const ss of s.best_season ?? []) {
    if (!SEASONS.includes(ss)) errs.push(`unknown best_season: ${ss}`);
  }
  if (s.access_difficulty != null && !ACCESS.includes(s.access_difficulty)) {
    errs.push(`unknown access_difficulty: ${s.access_difficulty}`);
  }
  return errs;
}
