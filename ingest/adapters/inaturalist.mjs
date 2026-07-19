// iNaturalist observations — WORKING (wildlife enrichment, non-bird).
//
// LICENSE: per-OBSERVATION licensing — observers choose CC0/CC-BY/CC-BY-SA/
// CC-BY-NC/all-rights-reserved. The API returns license_code on every record;
// this adapter fetches ONLY the open licenses (cc0, cc-by, cc-by-sa) and never
// stores verbatim content — we derive an AGGREGATE "how much wildlife is
// photographed near here" from research-grade records. No per-photo content,
// no inscriptions, just counts + taxa names (which are facts).
//
// WHY NON-BIRD: eBird already provides the bird layer (2,362 hotspots). iNat's
// unique contribution is everything else a photographer shoots — mammals,
// reptiles, amphibians, insects — so we EXCLUDE Aves to avoid double-counting.
//
// KEY: none. Public API, rate-limited (~1 req/s, hard cap 10k results/query) —
// we pace requests and cap pages, and set a descriptive User-Agent (required).
//
// SHAPE: an ENRICHMENT, like public-lands/horizon — it tags existing spots
// (nearest within RADIUS_M) with tags.inaturalist, never invents new spots. A
// dense wildlife area far from any spot is therefore not surfaced; in a region
// this densely spotted by OSM+eBird that is a rare gap (documented, honest).

export const meta = {
  source: 'inaturalist',
  name: 'iNaturalist',
  license: 'per-record CC licensing — fetched to CC0/CC-BY/CC-BY-SA only',
  attribution: 'Observation data from iNaturalist (per-record open licenses)',
  status: 'working',
};

export const API = 'https://api.inaturalist.org/v1/observations';
export const USER_AGENT =
  'photo-pointer/0.8 (personal open-data map; github.com/njefferson/photo-pointer)';

// Animals a photographer shoots that eBird does NOT cover. Aves excluded.
export const ICONIC = ['Mammalia', 'Reptilia', 'Amphibia', 'Insecta', 'Arachnida', 'Mollusca'];
export const MAX_PAGES = 30; // 30×200 = 6,000 most-recent obs — bounded + honest

// Map an iNat iconic taxon to our coarse subject/guild label.
export function guildOf(iconic) {
  return {
    Mammalia: 'mammals', Reptilia: 'reptiles', Amphibia: 'amphibians',
    Insecta: 'insects', Arachnida: 'insects', Mollusca: 'wildlife',
  }[iconic] ?? 'wildlife';
}

// Normalize one API result to {lat, lng, taxon, guild, license, id} or null.
export function normalizeObs(o) {
  const c = o?.geojson?.coordinates;
  let lat, lng;
  if (Array.isArray(c) && c.length === 2) {
    lng = c[0]; lat = c[1];
  } else if (typeof o?.location === 'string') {
    const [a, b] = o.location.split(',').map(Number);
    lat = a; lng = b;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const lic = (o.license_code || '').toLowerCase();
  if (!['cc0', 'cc-by', 'cc-by-sa'].includes(lic)) return null; // open only
  const iconic = o.taxon?.iconic_taxon_name;
  return {
    lat, lng,
    taxon: o.taxon?.preferred_common_name || o.taxon?.name || null,
    guild: guildOf(iconic),
    license: lic,
    id: o.id,
  };
}

// Fetch all open, research-grade, non-bird observations in the region bbox.
export async function ingest(region, { fetchFn = fetch, log = () => {}, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const b = region.bbox;
  const base =
    `${API}?quality_grade=research&captive=false&geoprivacy=open` +
    `&license=cc0,cc-by,cc-by-sa&iconic_taxa=${ICONIC.join(',')}` +
    `&nelat=${b.north}&nelng=${b.east}&swlat=${b.south}&swlng=${b.west}` +
    `&order_by=observed_on&order=desc&per_page=200`;
  const obs = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let json;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetchFn(`${base}&page=${page}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(60000),
        });
        if (res.status === 429) { await wait(5000); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
        break;
      } catch (e) {
        if (attempt === 2) throw new Error(`inaturalist page ${page}: ${e.message}`);
        await wait(1500 * (attempt + 1));
      }
    }
    const results = json?.results ?? [];
    for (const o of results) {
      const n = normalizeObs(o);
      if (n) obs.push(n);
    }
    log(`  page ${page}: ${results.length} raw, ${obs.length} kept so far (total avail ${json?.total_results ?? '?'})`);
    if (results.length < 200) break; // last page
    await wait(1100); // polite ~1 req/s
  }
  log(`inaturalist: ${obs.length} open non-bird research observations`);
  return obs;
}
