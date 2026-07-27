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
  return `[out:json][timeout:180][bbox:${box.south},${box.west},${box.north},${box.east}];
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
export const USER_AGENT =
  'photo-pointer-ingest/0.1 (personal project; https://github.com/njefferson/photo-pointer)';

import { backoffMs } from './http-etiquette.mjs';

export async function fetchOverpass(query, { fetchFn = fetch, hosts = OVERPASS_HOSTS, sleepFn = sleep } = {}) {
  let lastErr = null;
  // Overpass public instances 504/timeout often when busy — that is transient,
  // so cycle the hosts a few times with backoff before giving up. The job's
  // timeout-minutes is the hard ceiling if a whole Overpass hour is bad.
  for (let round = 0; round < 3; round++) {
    for (const host of hosts) {
      try {
        const res = await fetchFn(host, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(query),
          // Per-attempt cap must clear the REAL query time (~180 s healthy)
          // yet still bail on a mirror that accepted the connection and went
          // silent. 210 s does both; rounds/hosts handle transient overload.
          signal: AbortSignal.timeout(210000),
        });
        if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
          lastErr = new Error(`${host}: HTTP ${res.status}`);
          // If the mirror stated how long to wait, wait THAT long — it is the
          // operator's own terms, and guessing shorter ignores them. Overpass is
          // volunteer-run; a 429 is an instruction, not an obstacle.
          await sleepFn(backoffMs(res, round, { base: 20000 }));
          continue;
        }
        if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json.elements)) throw new Error(`${host}: no elements array`);
        return json;
      } catch (e) {
        lastErr = e; // network error / timeout — try the next host, then back off
        await sleepFn(5000 * (round + 1));
      }
    }
  }
  throw lastErr ?? new Error('overpass: all hosts failed');
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
  fetchFn, today, log = () => {}, rules = TAG_RULES, sleepFn = sleep, tileDeg = TILE_DEG, now = () => Date.now(),
} = {}) {
  const records = [];
  const seen = new Set();   // an element on a tile edge comes back twice; count it once
  const failed = [];
  const tiles = bboxTiles(region.bbox, tileDeg);
  log(`overpass: ${tiles.length} tiles over the region box, ${rules.length} selectors each`);
  for (const [i, box] of tiles.entries()) {
    const label = `${box.south.toFixed(2)},${box.west.toFixed(2)}`;
    let json;
    const t0 = now();
    try {
      json = await fetchOverpass(buildQuery(region, rules, box), { fetchFn, sleepFn });
    } catch (e) {
      // A tile that will not answer is NOT an empty tile. Name it, keep the
      // rest — the same rule as a failed Commons probe.
      failed.push(`${label}: ${e.message}`);
      log(`  overpass: tile ${i + 1}/${tiles.length} ${label} FAILED — ${e.message}`);
      continue;
    }
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
    log(`  overpass: tile ${i + 1}/${tiles.length} ${label} → ${kept} places in ${Math.round((now() - t0) / 1000)}s`);
    if (i < tiles.length - 1) await sleepFn(OVERPASS_GAP_MS);
  }
  if (failed.length) {
    log(`overpass: ${failed.length} of ${tiles.length} tiles did not answer — ${failed.join(' | ')}`);
  }
  log(`normalized ${records.length} records from ${tiles.length - failed.length}/${tiles.length} tiles`);
  records.failedTiles = failed;
  return records;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
