// Atlas-Obscura-type curiosities — via Wikidata (CC0). Source #1 of the "point
// to Atlas-Obscura locations" plan.
//
// WHY WIKIDATA: Atlas Obscura's own database is copyrighted with no open API, so
// we can't ingest it. But the real-world curiosities it catalogs — ghost towns,
// follies, land art, roadside attractions, lighthouses, observation towers,
// natural arches, waterfalls, hot springs — are classified in Wikidata, which is
// CC0 (public-domain dedication), machine-queryable, and carries coordinates +
// a Wikipedia link. We take the FACTS (name + coords + which kind of curiosity)
// and LINK OUT to Wikipedia / the Wikidata item. No copyrighted content copied.
//
// These become `oddity` spots (the curiosity pin), each tagged with its KIND so
// the popup can say "Ghost town", "Waterfall", etc. Only NAMED items are kept
// (an unnamed curiosity gives the user nothing — matches the oddity cleanup).
//
// LICENSE: Wikidata CC0. KEY: none, but the Query Service REQUIRES a descriptive
// User-Agent (a bare/absent UA gets 403) and is unreachable from the sandbox, so
// this runs on a runner (like the markers adapter).
//
// CURIOSITY CLASSES (Wikidata QIDs). NOTE per LESSONS.md: WDQS 403s the sandbox,
// so class QIDs are confirmed by a runner pass, not locally — if a class returns
// nothing across regions, verify its QID via WebSearch and correct it here.

export const meta = {
  source: 'wikidata',
  name: 'Curiosities (Wikidata, CC0 — ghost towns, follies, arches, waterfalls…)',
  license: 'CC0-1.0',
  attribution: 'Facts from Wikidata (CC0); details via Wikipedia',
  status: 'working',
};

export const ENDPOINT = 'https://query.wikidata.org/sparql';
export const USER_AGENT =
  'photo-pointer/1.5 (personal open-data map; github.com/njefferson/photo-pointer)';

// key = a Wikidata class; label = the human "kind" shown in the popup. Matched by
// P31 (instance of) OR P279* (subclass chain) so subtypes are caught too.
export const CURIOSITY_CLASSES = [
  { qid: 'Q74047',    kind: 'Ghost town' },          // verified 2026-07-25 (was Q5153359 — wrong, returned 0)
  { qid: 'Q326478',   kind: 'Land art' },            // verified (was Q338786)
  { qid: 'Q14915208', kind: 'Roadside attraction' }, // verified (was Q2380335)
  { qid: 'Q39715',    kind: 'Lighthouse' },          // verified working (2 in Sac)
  { qid: 'Q1440300',  kind: 'Observation tower' },   // verified (was Q1440476) — fire lookouts etc.
  { qid: 'Q954501',   kind: 'Natural arch' },        // verified (was Q771035)
  { qid: 'Q34038',    kind: 'Waterfall' },           // verified working (6 in Sac)
  { qid: 'Q177380',   kind: 'Hot spring' },          // verified id (sparse in the Sac bbox)
];

// The classes to query for a region: all of them by default, or a restricted
// set when the region config names `curiosityClasses` (e.g. the statewide
// ghost-town region asks for just Q74047 so it doesn't pull every CA waterfall).
export function classesFor(region) {
  const only = region.curiosityClasses;
  if (Array.isArray(only) && only.length) {
    return CURIOSITY_CLASSES.filter((c) => only.includes(c.qid));
  }
  return CURIOSITY_CLASSES;
}

export function buildQuery(region) {
  const b = region.bbox;
  // One VALUES list of classes; ?item is an instance (P31) or subclass* of one.
  const values = classesFor(region).map((c) => `wd:${c.qid}`).join(' ');
  return `SELECT DISTINCT ?item ?itemLabel ?coord ?cls ?article WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${b.west} ${b.south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${b.east} ${b.north})"^^geo:wktLiteral .
  }
  VALUES ?cls { ${values} }
  ?item wdt:P31/wdt:P279* ?cls .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;
}

// "Point(-119.0 38.2)" -> { lat, lng }  (WKT is lon-lat order)
export function parsePoint(wkt) {
  const m = /Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(wkt || '');
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

const KIND_BY_QID = new Map(CURIOSITY_CLASSES.map((c) => [c.qid, c.kind]));

// One SPARQL binding -> a Spot-shaped record, or null. Drops unnamed items.
export function normalizeBinding(row, today) {
  const p = parsePoint(row.coord?.value);
  if (!p) return null;
  const qid = (row.item?.value || '').split('/').pop() || null;
  if (!qid) return null;
  const name = row.itemLabel?.value && row.itemLabel.value !== qid ? row.itemLabel.value : null;
  if (!name) return null; // an unnamed curiosity is noise (see notability cleanup)
  const clsQid = (row.cls?.value || '').split('/').pop();
  const kind = KIND_BY_QID.get(clsQid) || 'Curiosity';
  const article = row.article?.value || null;
  return {
    name,
    lat: p.lat,
    lng: p.lng,
    category: 'oddity',
    subject_type: ['historic'],
    best_light: [],
    best_season: [],
    access_difficulty: 'unknown',
    notes: null,
    tags: { curiosity: kind, wikidata: qid, ...(article ? { wikipedia: article } : {}) },
    sources: [{
      source: meta.source,
      source_id: qid,
      source_license: meta.license,
      source_url: article || `https://www.wikidata.org/wiki/${qid}`,
      first_seen: today,
      last_seen: today,
    }],
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
      if (attempt === 2) throw new Error(`wikidata curiosities: ${e.message}`);
      await wait(3000 * (attempt + 1));
    }
  }
  const rows = json?.results?.bindings ?? [];
  log(`wikidata: ${rows.length} raw curiosity bindings`);
  const records = [];
  const seen = new Set();
  for (const row of rows) {
    const rec = normalizeBinding(row, today);
    if (!rec) continue;
    const qid = rec.sources[0].source_id;
    if (seen.has(qid)) continue; // an item matching two classes returns twice
    seen.add(qid);
    records.push(rec);
  }
  const byKind = {};
  for (const r of records) byKind[r.tags.curiosity] = (byKind[r.tags.curiosity] || 0) + 1;
  log(`wikidata: ${records.length} curiosities ${JSON.stringify(byKind)}`);
  return records;
}
