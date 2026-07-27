// OpenStreetMap via Overpass — the one WORKING adapter.
//
// LICENSE: ODbL 1.0 (Open Database License). Requirements we honor:
//  - Attribution "© OpenStreetMap contributors" (map UI + README).
//  - Share-alike applies to the *database*: our derived spot data stays
//    openly inspectable in this repo. Do not mix ODbL data into a dataset
//    whose license forbids share-alike.
//
// NETWORK NOTE (measured 2026-07-19): Overpass hosts are unreachable from a
// Claude session sandbox (egress policy 403s the CONNECT). Run this on a
// GitHub Actions runner (.github/workflows/ingest-osm.yml) or any normal
// machine. `node ingest/ingest.mjs probe` settles reachability in seconds.

export const meta = {
  source: 'osm',
  name: 'OpenStreetMap (Overpass API)',
  license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
  status: 'working',
  // Overpass publishes a daily budget (~10k requests, <1 GB) rather than a rate:
  // we send one query PER COUNTY per region, run rarely, one at a time. Six
  // small questions cost their servers far less than one that runs for nineteen
  // minutes and 504s — the budget is about work done, not requests made.
  // Heavy users are load-shed first, so keeping the footprint small IS the
  // etiquette. If our usage ever approaches those numbers the answer is to run
  // our own instance, not to spread across more mirrors.
  policy: {
    url: 'https://dev.overpass-api.de/overpass-doc/en/preface/commons.html',
    maxConcurrency: 1,
    minGapMs: 0,          // no stated per-request rate; the budget is daily
    dailyRequestBudget: 10000,
  },
  pacing: { concurrency: 1, gapMs: 2000 },
};

// A walking pace between county queries. Nothing published requires it; it is
// simply what we hold ourselves to when we are the ones asking repeatedly.
export const OVERPASS_GAP_MS = meta.pacing.gapMs;

// How many tiles in a row may fail before we conclude the service is having a
// bad time and stop asking altogether.
export const GIVE_UP_AFTER = 3;

// DON'T ASK TWICE FOR WHAT THEY ALREADY GAVE US. A run that gives up part-way
// used to mean the next attempt re-fetched every tile that had already answered
// — asking a service we had just decided was struggling to redo work it had
// already done for us. Tiles that answered are kept for a day, so a re-run after
// a failure only asks about what is actually missing. This is the same rule the
// Commons sweep already follows, and it is the one that turns "sorry" into a
// behaviour rather than a sentiment.
export const TILE_CACHE_HOURS = 24;

export function freshTiles(cache, tiles, { hours = TILE_CACHE_HOURS, now = Date.now() } = {}) {
  const cutoff = now - hours * 3600e3;
  const kept = new Map();
  for (const [key, entry] of Object.entries(cache ?? {})) {
    if (Date.parse(entry?.at ?? '') >= cutoff) kept.set(key, entry);
  }
  return { have: kept, todo: tiles.filter((t) => !kept.has(tileKey(t))) };
}

export function tileKey(box) {
  return `${box.south.toFixed(2)},${box.west.toFixed(2)}`;
}

// Ordered rules: first match wins. Each rule = OSM tag selector → category +
// photographer-intent seeds. Kept as data so curation is a table edit.
export const TAG_RULES = [
  { k: 'tourism', v: 'viewpoint', category: 'viewpoint', subject_type: ['landscape'], best_light: ['golden_hour'] },
  { k: 'waterway', v: 'waterfall', category: 'viewpoint', subject_type: ['water', 'landscape'], best_season: ['spring'] },
  { k: 'natural', v: 'peak', category: 'viewpoint', subject_type: ['landscape'], namedOnly: true },
  { k: 'historic', v: 'memorial', category: 'marker', subject_type: ['historic'] },
  { k: 'historic', v: 'monument', category: 'marker', subject_type: ['historic'] },
  { k: 'historic', v: 'wayside_shrine', category: 'marker', subject_type: ['historic'] },
  { k: 'historic', v: 'ruins', category: 'oddity', subject_type: ['historic'] },
  { k: 'historic', v: 'mine', category: 'oddity', subject_type: ['historic'], namedOnly: true },
  { k: 'tourism', v: 'artwork', category: 'oddity', subject_type: ['art'] },
  { k: 'tourism', v: 'attraction', category: 'oddity', namedOnly: true },
  { k: 'leisure', v: 'park', category: 'park', namedOnly: true },
  { k: 'leisure', v: 'nature_reserve', category: 'park', subject_type: ['wildlife'], namedOnly: true },
  { k: 'boundary', v: 'national_park', category: 'park', namedOnly: true },
  { k: 'highway', v: 'trailhead', category: 'trailhead' },
  { k: 'tourism', v: 'camp_site', category: 'campsite', namedOnly: true },
];

// SOURCE #2: specific OSM feature tags for Atlas-Obscura-type curiosities (ODbL).
// Run as a SEPARATE, lighter query (the `osm-features` command) — folding these
// into the main TAG_RULES query made it too heavy for Overpass's 300s server
// limit (it timed out). Each carries a `curiosity` kind (the same field the
// Wikidata adapter sets) so refineCategory + the popup treat them uniformly —
// Waterfall/Hot spring/Lighthouse become their own pin type; the rest show their
// kind under Oddity. namedOnly so unnamed natural nodes don't become map cruft.
export const FEATURE_RULES = [
  { k: 'natural', v: 'waterfall', category: 'oddity', curiosity: 'Waterfall', subject_type: ['water', 'landscape'], best_season: ['spring'], namedOnly: true },
  { k: 'natural', v: 'hot_spring', category: 'oddity', curiosity: 'Hot spring', subject_type: ['landscape'], namedOnly: true },
  { k: 'natural', v: 'geyser', category: 'oddity', curiosity: 'Hot spring', subject_type: ['landscape'], namedOnly: true },
  { k: 'natural', v: 'arch', category: 'oddity', curiosity: 'Natural arch', subject_type: ['landscape'], namedOnly: true },
  { k: 'natural', v: 'cave_entrance', category: 'oddity', curiosity: 'Cave', namedOnly: true },
  { k: 'man_made', v: 'lighthouse', category: 'oddity', curiosity: 'Lighthouse', namedOnly: true },
  { k: 'historic', v: 'archaeological_site', category: 'oddity', curiosity: 'Archaeological site', subject_type: ['historic'], namedOnly: true },
  { k: 'historic', v: 'wreck', category: 'oddity', curiosity: 'Shipwreck', subject_type: ['historic'], namedOnly: true },
];

// normalizeElement matches against BOTH rule sets (an element from either query
// finds its rule); the queries themselves fetch only their own selector set.
// FEATURE_RULES come FIRST so a specific natural/man_made feature wins over the
// generic tourism=attraction oddity rule when an element carries both — e.g.
// Old Faithful (natural=geyser + tourism=attraction) resolves to a Hot spring
// with its curiosity kind, not a bare oddity. (Feature rules are namedOnly, so
// an unnamed feature still falls through to the generic rule.)
export const ALL_RULES = [...FEATURE_RULES, ...TAG_RULES];

// One Overpass query for the whole region: union of the counties' admin
// areas, belt-and-braces bounded by the region bbox.
// ASK BY BOX, IN TILES — and the county list is not part of this any more.
//
// TWO MEASURED FAILURES got us here. One query carrying six county areas × 15
// selectors spent nineteen minutes being retried across all three mirrors and
// ended in HTTP 504. Splitting it per county worked — real data came back — but
// SACRAMENTO COUNTY ALONE TOOK SIXTEEN MINUTES (819 places), so six counties at
// that pace is an hour and a half, past any sane ceiling.
//
// THE COUNTY WAS ALWAYS THE WRONG UNIT HERE. The map is a BOUNDING BOX; the
// merge already drops anything outside it. So the `area` filter only ever
// removed places the app would happily have shown — that is exactly how
// Calaveras, Nevada and Amador stayed invisible while sitting inside the box —
// and it charged an admin-boundary membership test per element for the
// privilege. Asking by box removes both the cost and the coverage hole, and it
// cannot come back: whatever the map draws is what we ask about.
//
// TILES because a single box over a whole region is one big question again.
// Small ones finish inside the per-attempt timeout, and a tile that fails costs
// a tile. Counties still matter elsewhere (eBird and RIDB really are organised
// that way) — just not here.
export function buildQuery(region, rules = TAG_RULES, box = region.bbox) {
  const selectors = rules.map((r) => {
    const named = r.namedOnly ? '["name"]' : '';
    return `  nwr["${r.k}"="${r.v}"]${named};`;
  }).join('\n');
  return `[out:json][timeout:${TILE_SERVER_TIMEOUT_S}][bbox:${box.south},${box.west},${box.north},${box.east}];
(
${selectors}
);
out center tags;
`;
}

// How big a tile to ask for. Measured against the failures above: a whole dense
// county was 16 minutes, so the unit needs to be well under that. ~0.35° is
// roughly 39 × 31 km here — small enough to finish, few enough to stay a polite
// number of requests.
// What we ask the SERVER to spend on one tile. Measured: a healthy tile answers
// in 3–14 seconds, so 60 is already generous — and it tells a struggling server
// to abandon us quickly rather than grind. 180 was sized for a whole region.
export const TILE_SERVER_TIMEOUT_S = 60;

export const TILE_DEG = 0.35;
// …but a big region must not turn into hundreds of requests. Yellowstone at
// 0.35° is 110 tiles; doubling until the count fits keeps every region a polite
// number of questions, and a sparse region does not need fine tiles anyway.
export const MAX_TILES = 40;

export function bboxTiles(bbox, deg = TILE_DEG, max = MAX_TILES) {
  let d = deg;
  while (tileGrid(bbox, d).length > max) d *= 2;
  return tileGrid(bbox, d);
}

function tileGrid(bbox, deg) {
  const tiles = [];
  for (let s = bbox.south; s < bbox.north; s += deg) {
    for (let w = bbox.west; w < bbox.east; w += deg) {
      tiles.push({
        south: s, west: w,
        north: Math.min(s + deg, bbox.north),
        east: Math.min(w + deg, bbox.east),
      });
    }
  }
  return tiles;
}

export const OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Overpass instances answer 406/403 to anonymous UAs — identify honestly
// (their usage policy asks for a contactable User-Agent).
import { backoffMs, USER_AGENT } from './http-etiquette.mjs';

// Overpass instances answer 406/403 to anonymous callers and their usage policy
// asks for a contactable User-Agent. Re-exported from the shared one so there is
// exactly ONE identity across every service we call, carrying the real version.
export { USER_AGENT };

// AT MOST TWO ATTEMPTS, AND NEVER ON ANOTHER MIRROR.
//
// This used to cycle three mirrors three times — up to NINE requests for one
// query. MEASURED on the 2026-07-27 run: 11 tiles answered in 3–14 s (median 5),
// and 8 tiles took 86–739 s. That extra time was not Overpass computing. It was
// this loop failing, sleeping, and asking the NEXT VOLUNTEER SERVER the same
// question. One tile spent 333 seconds to be told there was nothing there.
//
// A 504 from an overloaded server means "this is too much right now". Asking a
// different volunteer the identical question is not a retry, it is moving our
// load onto someone else who is probably also busy — and three of them are all
// the public Overpass there is. So: one host per attempt, at most two attempts,
// and if it says no twice we take no for an answer.
export const OVERPASS_MAX_ATTEMPTS = 2;

export async function fetchOverpass(query, {
  fetchFn = fetch, hosts = OVERPASS_HOSTS, sleepFn = sleep, host = hosts[0],
} = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < OVERPASS_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchFn(host, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: 'data=' + encodeURIComponent(query),
        // Just past the server's own [timeout:] directive, so we stop waiting
        // shortly after IT has given up rather than holding a connection open
        // on work that is already abandoned.
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt + 1 >= OVERPASS_MAX_ATTEMPTS) break;
        // If the operator stated how long to wait, wait THAT long — it is their
        // terms, and guessing shorter ignores them. A 429 is an instruction.
        await sleepFn(backoffMs(res, attempt, { base: 30000 }));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error('no elements array');
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt + 1 >= OVERPASS_MAX_ATTEMPTS) break;
      await sleepFn(15000);
    }
  }
  throw lastErr ?? new Error('overpass: no answer');
}

// Normalize one Overpass element to a Spot-shaped record (single provenance
// entry; ids assigned later by the merge step).
export function normalizeElement(el, today) {
  const tags = el.tags ?? {};
  const rule = ALL_RULES.find((r) => tags[r.k] === r.v && (!r.namedOnly || tags.name));
  if (!rule) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const outTags = keepTags(tags);
  // A curiosity feature (source #2) carries its kind so refineCategory + the
  // popup treat it like a Wikidata curiosity.
  if (rule.curiosity) outTags.curiosity = rule.curiosity;
  return {
    name: tags.name ?? null,
    lat,
    lng,
    category: rule.category,
    subject_type: rule.subject_type ?? [],
    best_light: rule.best_light ?? [],
    best_season: rule.best_season ?? [],
    access_difficulty: accessFromTags(tags),
    notes: null,
    tags: outTags,
    sources: [
      {
        source: meta.source,
        source_id: `${el.type}/${el.id}`,
        source_license: meta.license,
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        first_seen: today,
        last_seen: today,
      },
    ],
  };
}

function accessFromTags(tags) {
  if (tags.wheelchair === 'yes') return 'roadside';
  if (tags.sac_scale === 'strenuous_alpine_hiking' || tags.sac_scale === 'difficult_alpine_hiking') {
    return 'strenuous';
  }
  if (tags.sac_scale) return 'hike';
  return 'unknown';
}

const KEPT_TAGS = [
  'name', 'ele', 'description', 'wikipedia', 'wikidata', 'website',
  'opening_hours', 'fee', 'access', 'operator', 'sac_scale', 'wheelchair',
  'direction', 'artwork_type', 'historic', 'tourism', 'natural', 'leisure',
  'waterway', 'highway', 'boundary', 'man_made',
  // Historical-marker detail (ODbL, from OSM contributors) — the plaque text
  // and a reference link (often an HMdb page). Shown on the marker card.
  'inscription', 'memorial', 'note', 'heritage', 'wikimedia_commons',
];

function keepTags(tags) {
  const out = {};
  for (const k of KEPT_TAGS) if (tags[k] != null) out[k] = tags[k];
  return out;
}

export async function ingest(region, {
  fetchFn, today, log = () => {}, rules = TAG_RULES, sleepFn = sleep, tileDeg = TILE_DEG,
  now = () => Date.now(), hostIndex = 0, cache = {},
} = {}) {
  const records = [];
  const seen = new Set();   // an element on a tile edge comes back twice; count it once
  const failed = [];
  const allTiles = bboxTiles(region.bbox, tileDeg);
  const { have, todo } = freshTiles(cache, allTiles, { now: now() });
  const tiles = todo;
  // Elements a recent run already fetched — replayed, not re-requested.
  const reused = {};
  for (const [key, entry] of have) reused[key] = entry;
  let consecutive = 0;
  // ONE host for the whole run. Rotating on failure sprays our load across every
  // volunteer mirror there is; rotating per RUN spreads the steady load without
  // ever turning one server's "no" into three servers' problem.
  const host = OVERPASS_HOSTS[hostIndex % OVERPASS_HOSTS.length];
  log(`overpass: asking ${host} only (one mirror per run, never on failure)`);
  log(`overpass: ${allTiles.length} tiles over the region box, ${rules.length} selectors each`
    + (have.size ? ` — ${have.size} answered within ${TILE_CACHE_HOURS}h, asking about ${tiles.length}` : ''));
  // Replay what a recent run already got, without asking again.
  for (const entry of have.values()) {
    for (const el of entry.elements ?? []) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rec = normalizeElement(el, today);
      if (rec) records.push(rec);
    }
  }
  for (const [i, box] of tiles.entries()) {
    const label = `${box.south.toFixed(2)},${box.west.toFixed(2)}`;
    let json;
    const t0 = now();
    try {
      json = await fetchOverpass(buildQuery(region, rules, box), { fetchFn, sleepFn, host });
    } catch (e) {
      // A tile that will not answer is NOT an empty tile. Name it, keep the
      // rest — the same rule as a failed Commons probe.
      failed.push(`${label}: ${e.message}`);
      consecutive += 1;
      log(`  overpass: tile ${i + 1}/${tiles.length} ${label} FAILED — ${e.message}`);
      // KNOW WHEN TO GO AWAY. If several tiles in a row will not answer, the
      // service is having a bad time and the considerate response is to stop —
      // not to grind through the remaining tiles proving it. On 2026-07-27 the
      // right moment to abandon was tile 2; instead the run spent 45 minutes
      // and roughly fifty failed requests to end up cancelled anyway.
      if (consecutive >= GIVE_UP_AFTER) {
        log(`overpass: ${consecutive} tiles in a row did not answer — Overpass is `
          + `struggling, so we stop asking. Re-run later; nothing is committed from `
          + `a partial sweep.`);
        const err = new Error(`overpass: gave up after ${consecutive} consecutive failures`);
        err.gaveUp = true;
        err.partial = records;
        // The tiles that DID answer go home with us, so the next attempt asks
        // only about what is missing.
        err.cache = reused;
        throw err;
      }
      await sleepFn(OVERPASS_GAP_MS);
      continue;
    }
    consecutive = 0;
    let kept = 0;
    for (const el of json.elements) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rec = normalizeElement(el, today);
      if (rec) { records.push(rec); kept++; }
    }
    // Per-tile timing, so the next run says whether the tile size is right
    // instead of leaving it to be guessed at again.
    reused[tileKey(box)] = { at: new Date(now()).toISOString(), elements: json.elements };
    log(`  overpass: tile ${i + 1}/${tiles.length} ${label} → ${kept} places in ${Math.round((now() - t0) / 1000)}s`);
    if (i < tiles.length - 1) await sleepFn(OVERPASS_GAP_MS);
  }
  if (failed.length) {
    log(`overpass: ${failed.length} of ${tiles.length} tiles did not answer — ${failed.join(' | ')}`);
  }
  log(`normalized ${records.length} records from ${tiles.length - failed.length}/${tiles.length} tiles`);
  records.failedTiles = failed;
  records.cache = reused;
  return records;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
