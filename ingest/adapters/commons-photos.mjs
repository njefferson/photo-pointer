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
      if (res.status === 429) { await wait(3000 * (attempt + 1)); continue; }
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
