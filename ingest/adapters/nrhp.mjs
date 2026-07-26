// National Register of Historic Places — via the NPS map service (US GOVERNMENT
// PUBLIC DOMAIN, no key). The deep historic layer: every listed building,
// district, site and structure, not just the ones that happen to have a plaque.
//
// WHY IT MATTERS: our `marker` pins come from OSM/Wikidata and skew to roadside
// plaques and monuments. The National Register is the authoritative inventory of
// what's actually historic and photogenic — courthouses, bridges, depots, mining
// complexes, main-street districts. For an architecture or history shooter this
// is the single richest US source, and it's public domain.
//
// PRIVACY / SENSITIVITY: NPS publishes only the public, NON-SENSITIVE listings —
// restricted archaeological locations are withheld at the source. We add no
// location precision of our own, so nothing sensitive is exposed by this adapter.
//
// ACCESS: an ArcGIS REST MapServer, same shape as GNIS. Unreachable from the
// sandbox (egress 403s the CONNECT), so it runs on a GitHub Actions runner.
// Field names are DISCOVERED at runtime rather than hard-coded — the GNIS lesson
// (a guessed layer/field returned almost nothing and cost a debug cycle).

export const meta = {
  source: 'nrhp',
  name: 'National Register of Historic Places (NPS)',
  license: 'public-domain',
  attribution: 'National Park Service — National Register of Historic Places',
  status: 'working',
};

export const BASE_URL =
  'https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer';

export const USER_AGENT =
  'photo-pointer/1.15 (https://github.com/njefferson/photo-pointer)';

// The service's attributes are deliberately sparse, and capitalisation has moved
// between releases — so match candidates CASE-INSENSITIVELY and take what exists.
const NAME_FIELDS = ['resname', 'resource_name', 'name'];
const ID_FIELDS = ['nris_refnum', 'refnum', 'cr_id', 'survey_id', 'objectid'];
const DATE_FIELDS = ['listed_date', 'listeddate', 'nr_date'];

function pickField(fieldNames, candidates) {
  const lower = new Map(fieldNames.map((f) => [f.toLowerCase(), f]));
  for (const c of candidates) if (lower.has(c)) return lower.get(c);
  return null;
}

// Point layers only — the service also publishes polygons (districts), which we
// skip: a district's boundary isn't a place to stand with a camera, and its
// point record is already in the points layer.
export function pickLayers(layersDoc) {
  const layers = layersDoc?.layers ?? [];
  return layers
    .filter((l) => (l.geometryType ?? '').toLowerCase().includes('point'))
    .filter((l) => (l.fields ?? []).some((f) => NAME_FIELDS.includes(String(f.name).toLowerCase())))
    .map((l) => ({
      id: l.id,
      name: l.name,
      nameField: pickField((l.fields ?? []).map((f) => f.name), NAME_FIELDS),
      idField: pickField((l.fields ?? []).map((f) => f.name), ID_FIELDS),
      dateField: pickField((l.fields ?? []).map((f) => f.name), DATE_FIELDS),
    }));
}

async function getJson(url, fetchFn, wait) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429 || res.status === 503) { await wait(10000); continue; }
      // 4xx is permanent — fail fast rather than burn retries (the GNIS lesson).
      if (res.status >= 400 && res.status < 500) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.error) { const e = new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`); e.fatal = true; throw e; }
      return json;
    } catch (e) {
      if (e.fatal || attempt === 2) throw e;
      await wait(3000 * (attempt + 1));
    }
  }
}

// A listing's year, from an epoch-ms or string date. Null when absent/unparseable.
export function listedYear(v) {
  if (v == null || v === '') return null;
  // The Register opened in 1966, so any year outside 1960..next-year is bad data.
  const plausible = (y) => (y >= 1960 && y <= new Date().getUTCFullYear() + 1 ? y : null);
  if (typeof v === 'number') {
    // Guard against junk numbers: a real listing date in epoch-ms is far from 0
    // (1966 is about -1.1e11), so anything within days of the epoch isn't a date.
    if (!isFinite(v) || Math.abs(v) < 1e8) return null;
    return plausible(new Date(v).getUTCFullYear());
  }
  const m = String(v).match(/(19|20)\d{2}/);
  return m ? plausible(Number(m[0])) : null;
}

// One ArcGIS feature -> a Spot-shaped record, or null (unnamed / bad geometry).
export function normalizeFeature(f, layer, today) {
  const a = f.attributes ?? {};
  const name = String(a[layer.nameField] ?? '').trim() || null;
  if (!name) return null; // an unnamed listing gives the user nothing
  const g = f.geometry ?? {};
  const lat = Number(g.y);
  const lng = Number(g.x);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const rawId = layer.idField ? a[layer.idField] : null;
  const id = rawId != null && String(rawId).trim() !== '' ? String(rawId).trim() : null;
  if (!id) return null; // no stable id → can't dedup or cite it
  const year = layer.dateField ? listedYear(a[layer.dateField]) : null;
  // A National Register reference number is 8 digits; only then does the NPGallery
  // deep link resolve. Otherwise cite the dataset itself rather than guess a URL.
  const isRefnum = /^\d{8}$/.test(id);
  return {
    name,
    lat,
    lng,
    category: 'historic_site',
    subject_type: ['historic', 'architecture'],
    best_light: [],
    best_season: [],
    access_difficulty: 'unknown',
    notes: null,
    tags: {
      nrhp: id,
      ...(year ? { nrhp_listed: year } : {}),
    },
    sources: [{
      source: meta.source,
      source_id: id,
      source_license: meta.license,
      source_url: isRefnum
        ? `https://npgallery.nps.gov/AssetDetail/NRIS/${id}`
        : 'https://www.nps.gov/subjects/nationalregister/database-research.htm',
      first_seen: today,
      last_seen: today,
    }],
  };
}

async function queryLayer(baseUrl, layer, region, fetchFn, wait) {
  const b = region.bbox;
  const envelope = encodeURIComponent(`${b.west},${b.south},${b.east},${b.north}`);
  const fields = [layer.nameField, layer.idField, layer.dateField].filter(Boolean).join(',');
  const PAGE = 1000;
  const raw = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${baseUrl}/${layer.id}/query?where=1%3D1`
      + `&geometry=${envelope}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`
      + `&outFields=${encodeURIComponent(fields)}&returnGeometry=true&outSR=4326`
      + `&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;
    const page = await getJson(url, fetchFn, wait);
    const feats = page?.features ?? [];
    raw.push(...feats);
    if (feats.length < PAGE && !page?.exceededTransferLimit) break;
    if (feats.length === 0) break;
    await wait(300);
  }
  return raw;
}

export async function ingest(region, { fetchFn = fetch, today, log = () => {}, sleep, baseUrl = BASE_URL } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const layersDoc = await getJson(`${baseUrl}/layers?f=json`, fetchFn, wait);
  const layers = pickLayers(layersDoc);
  if (!layers.length) throw new Error('nrhp: no point layer with a name field found in the NPS service');
  log(`nrhp: ${layers.length} point layer(s): ${layers.map((l) => `${l.id}:${l.name}[name=${l.nameField},id=${l.idField}]`).join(', ')}`);
  const records = [];
  const seen = new Set();
  for (const layer of layers) {
    let raw;
    try {
      raw = await queryLayer(baseUrl, layer, region, fetchFn, wait);
    } catch (e) {
      log(`nrhp: layer ${layer.id} (${layer.name}) query failed: ${e.message} — skipping`);
      continue;
    }
    let kept = 0;
    for (const f of raw) {
      const rec = normalizeFeature(f, layer, today);
      if (!rec) continue;
      const id = rec.sources[0].source_id;
      if (seen.has(id)) continue;
      seen.add(id);
      records.push(rec);
      kept++;
    }
    if (raw.length) log(`nrhp: layer ${layer.id} (${layer.name}) → ${raw.length} raw, ${kept} kept`);
  }
  log(`nrhp: ${records.length} listed historic places`);
  return records;
}
