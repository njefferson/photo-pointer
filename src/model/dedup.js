// Entity resolution — first-class, not an afterthought.
//
// One real-world place appears in many sources (an OSM viewpoint, an HMdb
// marker, a Flickr geotag cluster) with slightly different names and
// coordinates. This module collapses them into one Spot.
//
// Strategy:
//  - Candidate search uses a ~550 m grid (3×3 neighbor cells), so matches are
//    never missed across a geohash cell boundary.
//  - Two records match when they are within MATCH_DIST_M of each other AND
//    their names are similar (token Jaccard ≥ NAME_SIM_MIN); unnamed records
//    match only very close records (TIGHT_DIST_M) of the same category.
//  - The dedup_key (Spot.id) derives from the canonical record: the one from
//    the highest-priority source. It is `<name-slug>@<geohash6>`, or
//    `<category>@<geohash7>` when unnamed. Geohash makes it compact and
//    stable; the slug keeps two named places in one cell distinct.
//
// Node-safe; shared by ingest (merge step) and the app (user-pin collision).

import { distanceM, geohash } from './geo.js';

export const MATCH_DIST_M = 250; // named records: same place if within this…
export const NAME_SIM_MIN = 0.6; // …and names this similar (token Jaccard)
export const TIGHT_DIST_M = 60;  // unnamed records: same place only if this close

// Higher priority = wins naming/geometry when records merge.
export const SOURCE_PRIORITY = ['user', 'osm', 'hmdb', 'ebird', 'inaturalist', 'flickr'];

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'on', 'in', 'to']);

export function nameSlug(name) {
  if (!name) return null;
  const tokens = nameTokens(name);
  return tokens.length ? tokens.join('-') : null;
}

export function nameTokens(name) {
  if (!name) return [];
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

export function nameSimilarity(a, b) {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function dedupKey(spot) {
  const slug = nameSlug(spot.name);
  return slug
    ? `${slug}@${geohash(spot.lat, spot.lng, 6)}`
    : `${spot.category}@${geohash(spot.lat, spot.lng, 7)}`;
}

function sourcePriority(spot) {
  const names = (spot.sources ?? []).map((s) => s.source);
  let best = SOURCE_PRIORITY.length;
  for (const n of names) {
    const i = SOURCE_PRIORITY.indexOf(n);
    if (i !== -1 && i < best) best = i;
  }
  return best;
}

// ~0.005° latitude ≈ 550 m. Longitude cells shrink toward the poles, which
// only makes candidate search stricter — never misses within MATCH_DIST_M
// at mid-latitudes.
const CELL = 0.005;

function cellKey(lat, lng) {
  return `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}`;
}

function* neighborKeys(lat, lng) {
  const clat = Math.round(lat / CELL);
  const clng = Math.round(lng / CELL);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      yield `${clat + dy}:${clng + dx}`;
    }
  }
}

export function isSamePlace(a, b) {
  const d = distanceM(a, b);
  if (a.name && b.name) {
    return d <= MATCH_DIST_M && nameSimilarity(a.name, b.name) >= NAME_SIM_MIN;
  }
  // One or both unnamed: only collapse when nearly coincident and same kind.
  return d <= TIGHT_DIST_M && a.category === b.category;
}

// Merge b into a (a wins on conflicts when it has the higher-priority source).
export function mergeSpots(a, b) {
  const [hi, lo] = sourcePriority(a) <= sourcePriority(b) ? [a, b] : [b, a];
  const merged = {
    ...hi,
    name: hi.name ?? lo.name,
    notes: hi.notes ?? lo.notes,
    access_difficulty:
      hi.access_difficulty !== 'unknown' ? hi.access_difficulty : lo.access_difficulty,
    subject_type: [...new Set([...(hi.subject_type ?? []), ...(lo.subject_type ?? [])])],
    best_light: [...new Set([...(hi.best_light ?? []), ...(lo.best_light ?? [])])],
    best_season: [...new Set([...(hi.best_season ?? []), ...(lo.best_season ?? [])])],
    tags: { ...lo.tags, ...hi.tags },
    sources: mergeSources(hi.sources ?? [], lo.sources ?? []),
  };
  merged.id = dedupKey(merged);
  return merged;
}

function mergeSources(a, b) {
  const byKey = new Map();
  for (const s of [...a, ...b]) {
    const k = `${s.source}:${s.source_id}`;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...s });
    } else {
      if (s.first_seen && (!prev.first_seen || s.first_seen < prev.first_seen)) {
        prev.first_seen = s.first_seen;
      }
      if (s.last_seen && (!prev.last_seen || s.last_seen > prev.last_seen)) {
        prev.last_seen = s.last_seen;
      }
    }
  }
  return [...byKey.values()].sort((x, y) =>
    `${x.source}:${x.source_id}`.localeCompare(`${y.source}:${y.source_id}`)
  );
}

// Resolve a flat list of records (possibly from many sources) into deduped
// Spots. Deterministic: input order does not affect the final set, because
// records are processed in a stable sort order.
export function resolveSpots(records) {
  const sorted = [...records].sort((a, b) => {
    const p = sourcePriority(a) - sourcePriority(b);
    if (p !== 0) return p;
    return dedupKey(a).localeCompare(dedupKey(b));
  });

  const grid = new Map(); // cellKey -> spot[]
  const out = [];

  for (const rec of sorted) {
    let matched = null;
    for (const k of neighborKeys(rec.lat, rec.lng)) {
      for (const existing of grid.get(k) ?? []) {
        if (isSamePlace(existing, rec)) {
          matched = existing;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) {
      const merged = mergeSpots(matched, rec);
      // Replace in place: geometry (and so cell) is the canonical record's,
      // which is already `matched`'s cell when matched has priority.
      Object.assign(matched, merged);
    } else {
      const spot = { ...rec, id: dedupKey(rec) };
      out.push(spot);
      const k = cellKey(spot.lat, spot.lng);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(spot);
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}
