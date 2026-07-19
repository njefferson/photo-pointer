// Historical markers — WORKING (category 'marker'), via Wikidata (CC0).
//
// WHY NOT HMdb DIRECTLY: HMdb.org has no official public API and its marker
// inscriptions/photos/commentary are COPYRIGHTED (see hmdb.mjs). So we take the
// FACTS (name + coordinates) from Wikidata, which is CC0 (public-domain
// dedication) and machine-queryable, and LINK OUT to the marker's HMdb page
// when Wikidata records its HMdb Marker ID (property P7883). No HMdb content is
// copied — this is exactly HMdb's "links only" posture, done cleanly.
//
// WHAT WE PULL (in the region bbox): items that carry either
//   • P7883 — Historical Marker Database ID (→ a real HMdb marker), or
//   • P5651 — California Historical Landmark number (the roadside history
//     plaques this Gold Rush region is dense with).
// Both are external-identifier properties, so a hit unambiguously means "this
// is a historical marker/landmark" — no fragile instance-of class guessing.
//
// LICENSE: Wikidata is CC0. Attribution is courteous, not required. HMdb links
// are references only.
//
// KEY: none. The Wikidata Query Service is keyless but REQUIRES a descriptive
// User-Agent (a bare/absent UA gets 403). Runs on a runner (sandbox blocked).

export const meta = {
  source: 'wikidata',
  name: 'Historical markers (Wikidata, CC0 — links out to HMdb)',
  license: 'CC0-1.0',
  attribution: 'Marker facts from Wikidata (CC0); marker pages via HMdb.org',
  status: 'working',
};

export const ENDPOINT = 'https://query.wikidata.org/sparql';
export const USER_AGENT =
  'photo-pointer/0.9 (personal open-data map; github.com/njefferson/photo-pointer)';

export function buildQuery(region) {
  const b = region.bbox;
  return `SELECT ?item ?itemLabel ?coord ?hmdb ?chl WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${b.west} ${b.south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${b.east} ${b.north})"^^geo:wktLiteral .
  }
  { ?item wdt:P7883 ?hmdb. } UNION { ?item wdt:P5651 ?chl. }
  OPTIONAL { ?item wdt:P7883 ?hmdb. }
  OPTIONAL { ?item wdt:P5651 ?chl. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;
}

// "Point(-121.49 38.58)" -> { lat, lng }  (WKT is lon-lat order)
export function parsePoint(wkt) {
  const m = /Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(wkt || '');
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

// One SPARQL binding -> a Spot-shaped record, or null.
export function normalizeBinding(row, today) {
  const p = parsePoint(row.coord?.value);
  if (!p) return null;
  const qid = (row.item?.value || '').split('/').pop() || null;
  if (!qid) return null;
  const name = row.itemLabel?.value && row.itemLabel.value !== qid ? row.itemLabel.value : null;
  const hmdbId = row.hmdb?.value || null;
  const chl = row.chl?.value || null;
  // Prefer the HMdb marker page as the outbound link; else the Wikidata item.
  const source_url = hmdbId
    ? `https://www.hmdb.org/m.asp?m=${hmdbId}`
    : `https://www.wikidata.org/wiki/${qid}`;
  const tags = {};
  if (hmdbId) tags.hmdb = hmdbId;
  if (chl) tags.california_landmark = chl;
  return {
    name,
    lat: p.lat,
    lng: p.lng,
    category: 'marker',
    subject_type: ['historic'],
    best_light: [],
    best_season: [],
    access_difficulty: 'roadside',
    notes: null, // NEVER store HMdb inscription text — link only
    tags,
    sources: [
      {
        source: meta.source,
        source_id: qid,
        source_license: meta.license,
        source_url,
        first_seen: today,
        last_seen: today,
      },
    ],
  };
}

export async function ingest(region, { fetchFn = fetch, today, log = () => {}, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const query = buildQuery(region);
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  let json;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429) { await wait(10000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
      break;
    } catch (e) {
      if (attempt === 2) throw new Error(`wikidata markers: ${e.message}`);
      await wait(3000 * (attempt + 1));
    }
  }
  const rows = json?.results?.bindings ?? [];
  log(`wikidata: ${rows.length} raw marker bindings`);
  const records = [];
  const seen = new Set();
  for (const row of rows) {
    const rec = normalizeBinding(row, today);
    if (!rec) continue;
    const qid = rec.sources[0].source_id;
    if (seen.has(qid)) continue; // a marker with both IDs returns twice
    seen.add(qid);
    records.push(rec);
  }
  const withHmdb = records.filter((r) => r.tags.hmdb).length;
  log(`wikidata: ${records.length} historical markers (${withHmdb} linked to HMdb pages)`);
  return records;
}
