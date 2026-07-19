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
};

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

// One Overpass query for the whole region: union of the counties' admin
// areas, belt-and-braces bounded by the region bbox.
export function buildQuery(region) {
  const b = region.bbox;
  const areas = region.counties
    .map(
      (c) =>
        `  area["boundary"="administrative"]["admin_level"="6"]["name"="${c.osm_area_name}"];`
    )
    .join('\n');
  const selectors = TAG_RULES.map((r) => {
    const named = r.namedOnly ? '["name"]' : '';
    return `  nwr["${r.k}"="${r.v}"]${named}(area.region);`;
  }).join('\n');
  return `[out:json][timeout:300][bbox:${b.south},${b.west},${b.north},${b.east}];
(
${areas}
)->.region;
(
${selectors}
);
out center tags;
`;
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

export async function fetchOverpass(query, { fetchFn = fetch, hosts = OVERPASS_HOSTS } = {}) {
  let lastErr = null;
  // Overpass public instances 504/timeout often when busy — that is transient,
  // so cycle the hosts several times with backoff before giving up.
  for (let round = 0; round < 4; round++) {
    for (const host of hosts) {
      try {
        const res = await fetchFn(host, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(300000), // matches [timeout:300] in the query
        });
        if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
          lastErr = new Error(`${host}: HTTP ${res.status}`);
          await sleep(20000 * (round + 1));
          continue;
        }
        if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json.elements)) throw new Error(`${host}: no elements array`);
        return json;
      } catch (e) {
        lastErr = e; // network error / timeout — try the next host, then back off
        await sleep(5000 * (round + 1));
      }
    }
  }
  throw lastErr ?? new Error('overpass: all hosts failed');
}

// Normalize one Overpass element to a Spot-shaped record (single provenance
// entry; ids assigned later by the merge step).
export function normalizeElement(el, today) {
  const tags = el.tags ?? {};
  const rule = TAG_RULES.find((r) => tags[r.k] === r.v && (!r.namedOnly || tags.name));
  if (!rule) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
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
    tags: keepTags(tags),
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
  'waterway', 'highway', 'boundary',
];

function keepTags(tags) {
  const out = {};
  for (const k of KEPT_TAGS) if (tags[k] != null) out[k] = tags[k];
  return out;
}

export async function ingest(region, { fetchFn, today, log = () => {} } = {}) {
  const query = buildQuery(region);
  log(`overpass query: ${query.length} chars, ${TAG_RULES.length} selectors`);
  const json = await fetchOverpass(query, { fetchFn });
  log(`overpass returned ${json.elements.length} elements`);
  const records = [];
  for (const el of json.elements) {
    const rec = normalizeElement(el, today);
    if (rec) records.push(rec);
  }
  log(`normalized ${records.length} records`);
  return records;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
