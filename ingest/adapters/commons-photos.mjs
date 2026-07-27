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
  // The published terms this adapter operates under. Read them before changing
  // any pacing here; scripts/check-etiquette.mjs fails if we drift outside them.
  policy: {
    url: 'https://www.mediawiki.org/wiki/API:Etiquette',
    maxConcurrency: 1,   // "a total concurrency of at most 1"
    minGapMs: 1000,      // "a delay between requests of at least 1 second"
  },
  pacing: { concurrency: 1, gapMs: 1000 },
};

import { distanceM } from '../../src/model/geo.js';
import { backoffMs } from './http-etiquette.mjs';

export const API = 'https://commons.wikimedia.org/w/api.php';
export const USER_AGENT =
  'photo-pointer/1.15 (https://github.com/njefferson/photo-pointer)';
// WIKIMEDIA'S PUBLISHED LIMITS, not our own invention. API:Etiquette asks for
// serial requests — "a total concurrency of at most 1, and a delay between
// requests of at least 1 second" — and maxlag on non-interactive jobs. We had
// been running 4 concurrent with a 120 ms gap, which is why we got throttled:
// we were outside their stated terms, and the throttle was the service asking
// us to stop. https://www.mediawiki.org/wiki/API:Etiquette
// Read back OUT of meta.pacing, so what the etiquette gate checks is literally
// what the harvester uses — a declaration that can drift from the behaviour is
// worse than none, because it reads as a guarantee.
export const WIKIMEDIA_CONCURRENCY = meta.pacing.concurrency;
export const WIKIMEDIA_MIN_GAP_MS = meta.pacing.gapMs;
export const MAXLAG_SECONDS = 5;

export const RADIUS_M = 800;      // "near this spot" (used by the ingest counter)
export const TILE_RADIUS_M = 10000; // geosearch max radius, for harvesting
export const TILE_LIMIT = 500;      // geosearch max results per call

// One wide geosearch tile → [{ pageid, lat, lng }] of geotagged files.
export async function geosearchTile(lat, lng, { fetchFn = fetch, sleep, radius = TILE_RADIUS_M, limit = TILE_LIMIT } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url =
    `${API}?action=query&format=json&list=geosearch&gsnamespace=6` +
    `&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}` +
    // maxlag: Wikimedia's Action API etiquette asks non-interactive jobs to send
    // it, so our reads step aside when their databases are lagging instead of
    // adding to the problem. A lagged reply comes back 503 with Retry-After,
    // which we honour.
    `&maxlag=${MAXLAG_SECONDS}`;
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
      // The TITLE comes back in the same response, free. Keeping it is what lets
      // a discovered place say what people came to photograph, instead of being
      // an anonymous dot — and it costs Wikimedia nothing extra.
      return (j?.query?.geosearch ?? []).map((g) => ({ pageid: g.pageid, lat: g.lat, lng: g.lon, title: g.title }));
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
export async function harvestAroundSpots(spots, { fetchFn = fetch, log = () => {}, sleep, pool = WIKIMEDIA_CONCURRENCY, gap = WIKIMEDIA_MIN_GAP_MS } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const images = new Map(); // pageid → {lat,lng}, deduped across overlapping spots
  let failed = [];          // the SPOTS whose probe never answered
  const probe = async (s) => {
    // Only the counting radius is needed here, not the 10 km tile radius.
    const hits = await geosearchTile(s.lat, s.lng, { fetchFn, sleep, radius: RADIUS_M, limit: TILE_LIMIT });
    for (const h of hits) images.set(h.pageid, { lat: h.lat, lng: h.lng, title: h.title });
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
      await wait(Math.max(gap, WIKIMEDIA_MIN_GAP_MS));
    }
  }

  log(`  commons: probed ${spots.length} spots → ${images.size} unique photos, ${failed.length} still failing after retries`);
  if (failed.length) {
    log(`  commons: FAILED probes (sample): ${failed.slice(0, 10).map((s) => s.name ?? `${s.lat},${s.lng}`).join(' | ')}`);
  }
  return { images: [...images.values()], failed: failed.map((s) => s.name ?? `${s.lat},${s.lng}`) };
}

// Harvest every unique geotagged Commons file in the region bbox → [{lat,lng}].
export async function harvestBBox(bbox, { fetchFn = fetch, log = () => {}, sleep, pool = WIKIMEDIA_CONCURRENCY, gap = WIKIMEDIA_MIN_GAP_MS } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const centers = tileCenters(bbox);
  const images = new Map(); // pageid -> {lat,lng} (dedups across overlapping tiles)
  let idx = 0, done = 0;
  async function worker() {
    while (idx < centers.length) {
      const c = centers[idx++];
      try {
        const hits = await geosearchTile(c.lat, c.lng, { fetchFn, sleep });
        for (const h of hits) images.set(h.pageid, { lat: h.lat, lng: h.lng, title: h.title });
      } catch { /* skip a bad tile; others cover the overlap */ }
      done++;
      if (done % 20 === 0) log(`  commons: ${done}/${centers.length} tiles, ${images.size} photos harvested`);
      await wait(gap);
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));
  log(`commons: harvested ${images.size} unique geotagged photos from ${centers.length} tiles`);
  return [...images.values()];
}

// ── DISCOVERY: where people photograph that nothing in our data lists ────────
//
// Every other layer here starts from a place someone catalogued — an OSM node, a
// Wikidata item, a National Register listing. This one starts from BEHAVIOUR. We
// already fetch every geotagged Commons photo in the region to count them per
// spot, and then throw the coordinates away. Keeping them costs Wikimedia
// nothing extra and answers a question no catalogue can: what are people
// standing in front of that nobody wrote down?
//
// Grid-cluster the points, then keep only clusters that no known spot already
// explains. Deliberately conservative — a cluster must be BOTH dense enough to
// mean something AND genuinely away from everything we know, or it is noise.

export const CLUSTER_CELL_DEG = 0.0035;  // ~390 m at 39°N — one viewpoint, not one town
export const CLUSTER_MIN_PHOTOS = 12;    // below this it is a passer-by, not a subject
export const CLUSTER_MIN_DISTANCE_M = 400; // must be this far from any known spot

// A COORDINATE ON A ROUND GRID IS NOT A LOCATION. 1,785 of the home region's
// 18,185 harvested photos sit on an exact 0.1° grid point — 38.1, -121.0 and
// the like. Nobody's GPS produces that; it is someone typing roughly where they
// were, and a 0.1° cell is about 11 km across. Clustering them produces a
// confident pin in the middle of a field. Real fixes land on a round tenth
// about once in ten thousand, so this throws away almost nothing true.
export function isPlaceholderCoord(lat, lng, grid = 0.1) {
  const onGrid = (v) => Math.abs(v / grid - Math.round(v / grid)) < 1e-9;
  return onGrid(lat) && onGrid(lng);
}

// Group points into grid cells and return each cell's centroid, densest first.
// The centroid (not the cell centre) so the pin lands on the subject.
//
// WHAT IS COUNTED IS DISTINCT COORDINATES, NOT FILES. The densest cell in the
// home region held 187 photos, 160 of them at one identical coordinate — a
// single upload batch geotagged once, which says one person was here, not that
// this is somewhere people go. Counting the distinct places a camera was put
// down measures the thing actually being claimed. `photos` is still reported,
// so a card can say how much material exists without the count deciding.
export function clusterPoints(points, {
  cell = CLUSTER_CELL_DEG, minPhotos = CLUSTER_MIN_PHOTOS, mergeM = CLUSTER_MIN_DISTANCE_M,
} = {}) {
  const cells = new Map();
  for (const p of points) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    if (isPlaceholderCoord(lat, lng)) continue;
    const key = `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
    const c = cells.get(key) ?? cells.set(key, { n: 0, sLat: 0, sLng: 0, seen: new Set(), titles: [] }).get(key);
    c.n++; c.sLat += lat; c.sLng += lng; c.seen.add(`${lat},${lng}`);
    if (p.title) c.titles.push(p.title);
  }
  const found = [...cells.values()]
    .map((c) => ({ lat: c.sLat / c.n, lng: c.sLng / c.n, photos: c.n, spots: c.seen.size, titles: c.titles }))
    .filter((c) => c.spots >= minPhotos)
    .sort((a, b) => b.spots - a.spots);
  return mergeAdjacent(found, mergeM);
}

// WHAT ARE THE PHOTOGRAPHS OF? A discovered place is, by construction, one we
// have no name for — but the people who went there named their own files, and
// those titles come back in the geosearch response we already make. Where a
// phrase recurs across many separate files, that phrase is what they came for.
//
// This is EVIDENCE, NOT A NAME. It is reported as "photos here are titled things
// like X", never assigned as the place's name, because a recurring phrase can
// just as easily be a photographer's habit as a landmark. The app says what was
// observed and lets the reader draw the conclusion.

// Words that recur across photo titles without saying anything about the place.
const NOISE = new Set([
  'file', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'gif', 'svg', 'webp',
  'the', 'a', 'an', 'of', 'in', 'at', 'on', 'from', 'and', 'near', 'by', 'to',
  'ca', 'usa', 'us', 'california', 'nevada', 'county', 'photo', 'photos',
  'img', 'dsc', 'image', 'view', 'looking',
]);

export function titleWords(title) {
  return String(title ?? '')
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w) && !NOISE.has(w));
}

// The longest phrase (up to six words — long enough for "Calaveras Big Trees
// State Park") that appears in the most titles, provided enough of them share
// it. A phrase in one file out of eighty is one person's filename, not a
// subject.
export const SUBJECT_MIN_SHARE = 0.25;

export function describeCluster(titles, { minShare = SUBJECT_MIN_SHARE } = {}) {
  const seqs = (titles ?? []).map(titleWords).filter((w) => w.length);
  if (seqs.length < 4) return null;
  const counts = new Map();
  for (const words of seqs) {
    // Count each phrase ONCE per file, or a title that repeats a word wins by
    // repetition rather than by agreement between photographers.
    const here = new Set();
    for (let n = 6; n >= 1; n--) {
      for (let i = 0; i + n <= words.length; i++) here.add(words.slice(i, i + n).join(' '));
    }
    for (const phrase of here) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const need = Math.max(3, Math.ceil(seqs.length * minShare));
  let best = null;
  for (const [phrase, n] of counts) {
    if (n < need) continue;
    const words = phrase.split(' ').length;
    // Prefer the most specific phrase that still clears the bar; break ties on
    // how many files agree.
    if (!best || words > best.words || (words === best.words && n > best.n)) {
      best = { phrase, n, words };
    }
  }
  if (!best) return null;
  return {
    subject: best.phrase.replace(/\b\p{L}/gu, (c) => c.toUpperCase()),
    files: best.n,
    of: seqs.length,
  };
}

// Fetch titles for the clusters we are actually going to publish — one small
// geosearch each, at the published pacing. Deliberately AFTER the "nothing else
// explains this" filter: asking about 43 places we will keep is proportionate;
// asking about 88 to throw half away is not. Skipped entirely when the harvest
// already kept titles (it does now), so this is a one-time catch-up for
// coordinate files gathered before that.
export async function fetchClusterTitles(clusters, {
  fetchFn = fetch, log = () => {}, sleep, gap = WIKIMEDIA_MIN_GAP_MS, radius = 350,
} = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out = [];
  for (const c of clusters) {
    let titles = [];
    try {
      const hits = await geosearchTile(c.lat, c.lng, { fetchFn, sleep, radius, limit: TILE_LIMIT });
      titles = hits.map((h) => h.title).filter(Boolean);
    } catch (e) {
      // A place we could not ask about simply goes unnamed. It is still a real
      // cluster; we just do not get to say what the photographs are of.
      log(`  commons: no titles for ${c.lat.toFixed(4)},${c.lng.toFixed(4)} — ${e.message}`);
    }
    out.push({ ...c, titles });
    await wait(gap);
  }
  return out;
}

// ONE CAMERA MOVING IS NOT A PLACE PEOPLE GO — and this is what finally caught
// it. Counting distinct coordinates was supposed to mean "distinct places a
// camera was set down", and it defeats a batch upload geotagged once. It does
// NOT defeat a 360 rig capturing continuously from a moving vehicle: every frame
// lands on its own coordinate, so a stretch of road scored 376 "vantage points"
// off one person on one afternoon.
//
// The titles give it away where the coordinates could not. Commons 360 uploads
// are named "<random token> with <device>", so a cluster whose files nearly all
// carry the same equipment tail, or nearly all start with the same style of
// machine-generated token, is one rig — however many coordinates it produced.
const RIG_TAIL = /\bwith\s+([\p{L}\p{N}]+(?:\s+[\p{L}\p{N}]+){0,2})\s*$/iu;
const MACHINE_TOKEN = /(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{16,}/i;

export const RIG_SHARE = 0.6;

export function singleRigShare(titles) {
  const clean = (titles ?? []).map((t) => String(t ?? '')
    .replace(/^File:/i, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim());
  if (clean.length < 4) return 0;
  const tails = new Map();
  let machine = 0;
  for (const t of clean) {
    const m = t.match(RIG_TAIL);
    if (m) { const k = m[1].toLowerCase(); tails.set(k, (tails.get(k) ?? 0) + 1); }
    if (MACHINE_TOKEN.test(t)) machine++;
  }
  const topTail = Math.max(0, ...tails.values());
  return Math.max(topTail, machine) / clean.length;
}

export function isSingleRig(titles, { share = RIG_SHARE } = {}) {
  return singleRigShare(titles) >= share;
}

// IS THIS SOMEWHERE YOU COULD GO AND PHOTOGRAPH THE THING? That is the whole
// test, and it is Noah's, in his words (2026-07-27) on the first real output:
//   - IKEA: no.
//   - Botanical specimens: "good if it's a flower that can be photographed
//     there — not good if it's someone's personal potted plants."
//   - Archives: "old historical photos that may not be there to photograph
//     today, so not useful — but if they are of an ancient tree or something
//     then maybe useful."
// So a Latin binomial is NOT disqualifying; a wild thistle growing on a hillside
// is exactly what this app is for. What disqualifies is CULTIVATION (nursery
// stock, a greenhouse, a herbarium sheet), COMMERCE, and an organisation's own
// RECORDS — photographs of something that happened rather than something that
// is there. The permanent-feature exception is Noah's ancient tree: an archive
// of a thing that is still standing is still worth the drive.
//
// This is a hand-written vocabulary, which the doctrine warns about — but no
// service publishes "is this a photo destination", and the alternative is
// leaving an IKEA on the map. It is kept honest by REPORTING every rejection
// with its reason, so the list is auditable rather than a silent filter.
const NOT_A_DESTINATION = [
  { why: 'a shop is not a place to photograph',
    re: /\b(ikea|walmart|costco|target store|home depot|lowe'?s|safeway|kohls|mall|shopping cent|dealership|showroom|supermarket|warehouse|storefront)\b/i },
  { why: 'cultivated stock, not something growing where you would go and find it',
    // NO LEADING WORD BOUNDARY on the run-together ones: Commons filenames
    // routinely concatenate, and "Placervillenursery" is exactly the case this
    // rule exists for.
    re: /(nurser(y|ies)|greenhouse|garden cent(er|re)|potted|houseplant|herbari(um|a)|cultivar|cultivated|seedlings?|plant materials|arboretum accession)/i },
  { why: "an organisation's own records — a photograph of something that happened, not something that is there",
    re: /\b(nrcs|usda|research station|experiment(al)? station|field office|silvicultur\w*|treatment|study (site|plot)|plot \d|annual report|archives?|collection of|staff|personnel|conference|awards?|honou?r|ceremony|groundbreaking|ribbon cutting)\b/i },
];

// Noah's exception, kept explicit: an archive OF SOMETHING STILL STANDING is
// still worth the drive.
const STILL_THERE = /\b(ancient|old.?growth|giant|champion|heritage|historic tree|sequoia|redwood|oak|waterfall|falls|arch|canyon|summit|peak|lake|river|bridge|lighthouse|trail|grove)\b/i;

export function photoDestination(subject, titles = []) {
  const hay = [subject ?? '', ...(titles ?? []).slice(0, 60)].join(' ');
  for (const rule of NOT_A_DESTINATION) {
    if (!rule.re.test(hay)) continue;
    if (STILL_THERE.test(hay)) return { ok: true, kept: 'an archive, but of something still standing' };
    return { ok: false, why: rule.why };
  }
  return { ok: true };
}

// Which clusters nothing in our data already explains.
//
// PINS THIS PASS MADE LAST TIME ARE NOT PRIOR KNOWLEDGE. Counting them makes the
// layer erase itself: the second real run found its 43 discoveries, decided each
// was already explained by the pin it had created for it, and wrote an empty
// layer that deleted all 128. A discovery pass must be able to run twice.
export function unexplainedBy(clusters, spots, withinM = CLUSTER_MIN_DISTANCE_M) {
  const CELL = 0.008;
  const grid = new Map();
  for (const sp of spots) {
    if (sp.category === 'photo_cluster') continue;
    const k = `${Math.round(sp.lat / CELL)}:${Math.round(sp.lng / CELL)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(sp);
  }
  const explained = (c) => {
    const a = Math.round(c.lat / CELL), b = Math.round(c.lng / CELL);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const sp of grid.get(`${a + dy}:${b + dx}`) ?? []) {
        if (distanceM(c, sp) <= withinM) return true;
      }
    }
    return false;
  };
  return clusters.filter((c) => !explained(c));
}

// A grid is arbitrary, and a big subject straddles it. Four cells in a row along
// the Sacramento delta were four pins on one stretch of the same river. Anything
// closer together than we require a cluster to be from a KNOWN place has no
// business being two separate discoveries either — so fold them, densest first.
export function mergeAdjacent(clusters, withinM = CLUSTER_MIN_DISTANCE_M) {
  const out = [];
  for (const c of clusters) {
    const near = out.find((o) => distanceM(o, c) <= withinM);
    if (!near) { out.push({ ...c }); continue; }
    const total = near.photos + c.photos;
    near.lat = (near.lat * near.photos + c.lat * c.photos) / total;
    near.lng = (near.lng * near.photos + c.lng * c.photos) / total;
    near.photos = total;
    near.spots += c.spots;
    near.titles = [...(near.titles ?? []), ...(c.titles ?? [])];
  }
  return out.sort((a, b) => b.spots - a.spots);
}
