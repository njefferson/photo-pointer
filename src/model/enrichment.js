// Shared curated enrichment — hand-written detail layered onto ingested spots,
// keyed by spot id. The version of "personal notes" that ships to everyone.
//
// It only ever FILLS GAPS: a field the ingested data already provides is left
// alone, so improving the upstream source (the whole point of the OSM edit link)
// always wins over a stale hand-written line. Applied at LOAD, like
// refineCategory — no re-ingest needed to publish a correction.
//
// LICENSING is the load-bearing rule and lives in the data file's _readme: our
// OWN words only, never prose lifted from a city/district/business site (facts
// are free, sentences are not), and a link so the reader can go to the source.

import { LIGHT, SEASONS, ACCESS, SUBJECT_TYPES } from './spot.js';

const FILE = './data/curated/enrichment.json';

let cache = null;

// Load once per session; fails soft to an empty map (offline, or not deployed).
export async function loadEnrichment(fetchFn = fetch, url = FILE) {
  if (cache) return cache;
  try {
    const res = await fetchFn(url, { cache: 'no-cache' });
    if (!res.ok) { cache = {}; return cache; }
    const doc = await res.json();
    cache = doc && typeof doc.spots === 'object' && doc.spots ? doc.spots : {};
  } catch {
    cache = {};
  }
  return cache;
}

// Only accept vocabulary the schema knows, so a typo in the curated file can't
// put an unknown value on a spot.
const only = (vals, allowed) =>
  (Array.isArray(vals) ? vals : []).filter((v) => allowed.includes(v));

// Apply one curated entry to a spot, filling gaps only. Returns a copy when it
// changes anything, else the original (cheap for the 99% with no entry).
export function applyEnrichment(spot, entry) {
  if (!entry || typeof entry !== 'object') return spot;
  const out = {};
  if (!spot.notes && typeof entry.notes === 'string' && entry.notes.trim()) {
    out.notes = entry.notes.trim();
  }
  if (!(spot.best_light ?? []).length) {
    const v = only(entry.best_light, LIGHT);
    if (v.length) out.best_light = v;
  }
  if (!(spot.best_season ?? []).length) {
    const v = only(entry.best_season, SEASONS);
    if (v.length) out.best_season = v;
  }
  if (!(spot.subject_type ?? []).length) {
    const v = only(entry.subject_type, SUBJECT_TYPES);
    if (v.length) out.subject_type = v;
  }
  if ((!spot.access_difficulty || spot.access_difficulty === 'unknown')
      && ACCESS.includes(entry.access_difficulty)) {
    out.access_difficulty = entry.access_difficulty;
  }
  // The link is additive: it's OUR pointer to the official page, and never
  // replaces a source_url the ingest already carries.
  if (typeof entry.link === 'string' && /^https:\/\//.test(entry.link)) {
    out.tags = { ...(spot.tags ?? {}), curatedLink: entry.link, curatedLinkLabel: entry.link_label || 'Official page' };
  }
  return Object.keys(out).length ? { ...spot, ...out } : spot;
}

// Map over a region's spots, applying any curated entry by id.
export function enrichSpots(spots, entries) {
  if (!entries || !Object.keys(entries).length) return spots;
  return spots.map((s) => applyEnrichment(s, entries[s.id]));
}
