// Wikimedia Commons photo density — WORKING (enrichment).
//
// The replacement for Flickr (whose API keys are now PRO-only, 2026-07-19).
// EVERYTHING on Wikimedia Commons is already freely licensed (CC0/CC-BY/
// CC-BY-SA/public-domain) — that is the entry requirement for the site — so
// unlike Flickr there is NO per-photo license to filter: a geolocated file on
// Commons is, by definition, a reusable photo of that place. We count how many
// exist near each spot as a "how photographed / how photogenic" signal, and
// store only the COUNT (a fact), never the images.
//
// HOW (efficiently): we do NOT hit the API once per spot (2,362 calls throttle
// hard and crawl). Instead we HARVEST once — a coarse grid of wide geosearch
// tiles over the region bbox collects every geotagged file's coordinates, then
// the ingest counts, per spot, how many fall within RADIUS_M locally. ~170
// tile calls instead of thousands.
//
// LICENSE: derived counts are ours; the media counted is CC/PD on Commons.
// KEY: none. MediaWiki geosearch is keyless but wants a descriptive User-Agent.

export const meta = {
  source: 'wikimedia_commons',
  name: 'Wikimedia Commons geotagged photo density',
  license: 'CC/public-domain media (Commons); derived counts only',
  attribution: 'Photo locations from Wikimedia Commons',
  status: 'working',
};

import { backoffMs } from './http-etiquette.mjs';

export const API = 'https://commons.wikimedia.org/w/api.php';
export const USER_AGENT =
  'photo-pointer/0.10 (personal open-data map; github.com/njefferson/photo-pointer)';
export const RADIUS_M = 800;      // "near this spot" (used by the ingest counter)
export const TILE_RADIUS_M = 10000; // geosearch max radius, for harvesting
export const TILE_LIMIT = 500;      // geosearch max results per call

// One wide geosearch tile → [{ pageid, lat, lng }] of geotagged files.
export async function geosearchTile(lat, lng, { fetchFn = fetch, sleep, radius = TILE_RADIUS_M, limit = TILE_LIMIT } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url =
    `${API}?action=query&format=json&list=geosearch&gsnamespace=6` +
    `&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      // Wikimedia throttles datacenter IPs; wait as long as it asks.
      if (res.status === 429 || res.status === 503) { await wait(backoffMs(res, attempt, { base: 3000 })); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      return (j?.query?.geosearch ?? []).map((g) => ({ pageid: g.pageid, lat: g.lat, lng: g.lon }));
    } catch (e) {
      if (attempt === 3) throw new Error(`commons geosearch: ${e.message}`);
      await wait(1500 * (attempt + 1));
    }
  }
}

// Grid of tile centers covering a bbox. Spacing < TILE_RADIUS so circles
// overlap (no gaps); lng spacing widened by latitude.
export function tileCenters(bbox, stepLat = 0.12, stepLng = 0.15) {
  const centers = [];
  for (let lat = bbox.south + stepLat / 2; lat < bbox.north + stepLat; lat += stepLat) {
    for (let lng = bbox.west + stepLng / 2; lng < bbox.east + stepLng; lng += stepLng) {
      centers.push({ lat: Math.min(lat, bbox.north), lng: Math.min(lng, bbox.east) });
    }
  }
  return centers;
}

// Harvest around the SPOTS instead of tiling the bbox. The tiled sweep assumes a
// region whose spots outnumber its tiles — true for a county (2,362 spots vs 195
// tiles), badly false for a sparse statewide theme region like California Ghost
// Towns (205 spots vs 4,264 tiles, ~3 hours, past the workflow timeout). There
// the spots ARE the cheap index: one small geosearch each.
export async function harvestAroundSpots(spots, { fetchFn = fetch, log = () => {}, sleep, pool = 2, gap = 250 } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const images = new Map(); // pageid → {lat,lng}, deduped across overlapping spots
  let failed = [];          // the SPOTS whose probe never answered
  const probe = async (s) => {
    // Only the counting radius is needed here, not the 10 km tile radius.
    const hits = await geosearchTile(s.lat, s.lng, { fetchFn, sleep, radius: RADIUS_M, limit: TILE_LIMIT });
    for (const h of hits) images.set(h.pageid, { lat: h.lat, lng: h.lng });
  };

  let idx = 0, done = 0;
  async function worker() {
    while (idx < spots.length) {
      const s = spots[idx++];
      // A failed probe here is NOT harmless: unlike the tile sweep, where
      // neighbouring tiles overlap and cover each other, one spot = one probe.
      // Swallowing it silently means that place reports "no photos", which is a
      // WRONG ANSWER dressed up as a real one.
      try { await probe(s); } catch { failed.push(s); }
      done++;
      if (done % 25 === 0) log(`  commons: ${done}/${spots.length} spots probed, ${images.size} photos found`);
      await wait(gap);
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));

  // Wikimedia throttles datacenter IPs in BURSTS — a real run lost 84 of 205 in
  // one alphabetical block, not scattered at random. So the failures are a
  // timing artefact, not "these places have no photos", and re-probing just
  // those slowly and one at a time recovers them for far less than a re-run.
  for (let round = 1; round <= 2 && failed.length; round++) {
    const retry = failed;
    failed = [];
    log(`  commons: retry pass ${round} for ${retry.length} throttled spots`);
    for (const s of retry) {
      try { await probe(s); } catch { failed.push(s); }
      await wait(1200);
    }
  }

  log(`  commons: probed ${spots.length} spots → ${images.size} unique photos, ${failed.length} still failing after retries`);
  if (failed.length) {
    log(`  commons: FAILED probes (sample): ${failed.slice(0, 10).map((s) => s.name ?? `${s.lat},${s.lng}`).join(' | ')}`);
  }
  return { images: [...images.values()], failed: failed.map((s) => s.name ?? `${s.lat},${s.lng}`) };
}

// Harvest every unique geotagged Commons file in the region bbox → [{lat,lng}].
export async function harvestBBox(bbox, { fetchFn = fetch, log = () => {}, sleep, pool = 4 } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const centers = tileCenters(bbox);
  const images = new Map(); // pageid -> {lat,lng} (dedups across overlapping tiles)
  let idx = 0, done = 0;
  async function worker() {
    while (idx < centers.length) {
      const c = centers[idx++];
      try {
        const hits = await geosearchTile(c.lat, c.lng, { fetchFn, sleep });
        for (const h of hits) images.set(h.pageid, { lat: h.lat, lng: h.lng });
      } catch { /* skip a bad tile; others cover the overlap */ }
      done++;
      if (done % 20 === 0) log(`  commons: ${done}/${centers.length} tiles, ${images.size} photos harvested`);
      await wait(120);
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));
  log(`commons: harvested ${images.size} unique geotagged photos from ${centers.length} tiles`);
  return [...images.values()];
}
