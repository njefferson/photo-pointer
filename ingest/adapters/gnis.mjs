// Named natural features — via USGS GNIS (The National Map geonames service).
// Source #3 of the "point to Atlas-Obscura locations" plan, and the one that's
// independent of Overpass/Wikidata: the US Board on Geographic Names gazetteer.
//
// WHY GNIS: it's the federal standard catalog of named US places — every named
// waterfall, natural arch, cave and hot spring, with coordinates. It's US
// GOVERNMENT PUBLIC DOMAIN (no license restriction, no key), and it covers
// features OSM and Wikidata miss (especially named natural features off the
// beaten path). We take the FACTS (name + coords + feature class) and link out
// to the USGS gazetteer entry. These become `oddity` spots carrying a curiosity
// KIND, so refineCategory splits them into Waterfall / Hot spring pins at load
// and Arch / Cave stay under the Oddity catch-all — exactly like sources #1/#2.
//
// ACCESS: the geonames ArcGIS REST MapServer (JSON, bbox-queryable, no key). Like
// Overpass/WDQS it is UNREACHABLE from the sandbox (egress 403s the CONNECT), so
// this runs on a GitHub Actions runner. The service groups natural features under
// a "Landforms" feature layer; we DISCOVER that layer's id at runtime (from the
// service's /layers listing) rather than hard-code it, so a service reorg doesn't
// silently break the query. Fields (confirmed via the service metadata):
// gaz_id, gaz_name, gaz_featureclass, plus point geometry.

export const meta = {
  source: 'gnis',
  name: 'USGS GNIS (The National Map geonames — named natural features)',
  license: 'public-domain',
  attribution: 'U.S. Geological Survey, Geographic Names Information System (public domain)',
  status: 'working',
};

export const BASE_URL =
  'https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer';
export const USER_AGENT =
  'photo-pointer/1.5 (personal open-data map; github.com/njefferson/photo-pointer)';

// GNIS feature classes we surface, and how each maps to a curiosity. Falls / Arch
// / Cave map straight through; "Spring" is only a curiosity when it's a HOT one
// (a plain cold spring isn't a photo draw and there are thousands), detected from
// the name. Each carries a synthetic OSM-style `natural` tag so the popup + the
// notability keep-rules treat it like any other natural feature.
export const FEATURE_CLASSES = ['Falls', 'Arch', 'Cave', 'Spring', 'Geyser'];
const HOT_RE = /\b(hot|warm|thermal|geyser)\b/i;

// featureclass (+ name) -> curiosity mapping, or null to skip.
export function mapFeature(featureclass, name) {
  switch (featureclass) {
    case 'Falls':  return { curiosity: 'Waterfall', natural: 'waterfall', subject_type: ['water', 'landscape'], best_season: ['spring'] };
    case 'Arch':   return { curiosity: 'Natural arch', natural: 'arch', subject_type: ['landscape'] };
    case 'Cave':   return { curiosity: 'Cave', natural: 'cave_entrance', subject_type: [] };
    case 'Geyser': return { curiosity: 'Hot spring', natural: 'geyser', subject_type: ['landscape'] };
    case 'Spring':
      return HOT_RE.test(name || '')
        ? { curiosity: 'Hot spring', natural: 'hot_spring', subject_type: ['landscape'] }
        : null; // a plain (cold) spring isn't a curiosity — skip
    default: return null;
  }
}

// `gaz_featureclass IN ('Falls','Arch','Cave','Spring')` — one WHERE for the query.
export function buildWhere() {
  return `gaz_featureclass IN (${FEATURE_CLASSES.map((c) => `'${c}'`).join(',')})`;
}

async function getJson(url, fetchFn, wait) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429 || res.status === 503) { await wait(10000); continue; }
      // 4xx (other than 429) is a permanent client error — fail fast, don't retry
      // (e.g. the Antarctica layer 400s a US-bbox query; retrying just wastes time).
      if (res.status >= 400 && res.status < 500) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // ArcGIS returns 200 with an {error:{...}} body on a bad query — permanent.
      if (json && json.error) { const e = new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`); e.fatal = true; throw e; }
      return json;
    } catch (e) {
      if (e.fatal || attempt === 2) throw e;
      await wait(3000 * (attempt + 1));
    }
  }
}

// EVERY GNIS point layer that carries a `gaz_featureclass` field. The geonames
// service partitions features across many category layers (Water Features,
// Landforms, …), so our classes (Falls/Arch/Cave/Spring) can live in more than
// one — we query them all and dedup by gaz_id, rather than guess a single layer
// (a wrong guess returns almost nothing). Sub-layers of a group are skipped only
// if they have no queryable class field.
// Layers that definitionally hold no natural features — populated places, civil/
// political boundaries, road crossings, Antarctica (which also 400s a US-bbox
// query). Skipped so we only query the landform/hydrographic/physical layers.
const SKIP_LAYER = /place|civil|census|crossing|antarctic|political|boundary/i;
export function pickLayers(layersDoc) {
  const layers = layersDoc?.layers ?? [];
  return layers
    .filter((l) => (l.fields ?? []).some((f) => f.name === 'gaz_featureclass'))
    .filter((l) => !SKIP_LAYER.test(l.name || ''))
    .map((l) => ({ id: l.id, name: l.name }));
}

// One ArcGIS feature -> a Spot-shaped record, or null (unnamed / non-curiosity).
export function normalizeFeature(f, today) {
  const a = f.attributes ?? {};
  const name = (a.gaz_name || '').trim() || null;
  if (!name) return null; // GNIS is a NAMED gazetteer; an unnamed row is noise
  const cls = a.gaz_featureclass;
  const kind = mapFeature(cls, name);
  if (!kind) return null;
  const g = f.geometry ?? {};
  const lat = Number(g.y), lng = Number(g.x);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const id = a.gaz_id != null ? String(a.gaz_id) : null;
  if (!id) return null;
  return {
    name,
    lat,
    lng,
    category: 'oddity', // refineCategory splits Waterfall/Hot spring out at load
    subject_type: kind.subject_type,
    best_light: [],
    best_season: kind.best_season ?? [],
    access_difficulty: 'unknown',
    notes: null,
    tags: { curiosity: kind.curiosity, natural: kind.natural, gnis: id },
    sources: [{
      source: meta.source,
      source_id: id,
      source_license: meta.license,
      source_url: `https://edits.nationalmap.gov/apps/gaz-domestic/public/summary/${id}`,
      first_seen: today,
      last_seen: today,
    }],
  };
}

// Query one layer by the region bbox, paging past the per-request row cap.
async function queryLayer(baseUrl, layerId, region, fetchFn, wait) {
  const b = region.bbox;
  const envelope = encodeURIComponent(`${b.west},${b.south},${b.east},${b.north}`);
  const where = encodeURIComponent(buildWhere());
  const PAGE = 1000;
  const raw = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${baseUrl}/${layerId}/query?where=${where}`
      + `&geometry=${envelope}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`
      + `&outFields=gaz_id,gaz_name,gaz_featureclass&returnGeometry=true&outSR=4326`
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

// Query EVERY class-bearing layer by the region bbox and dedup across them.
export async function ingest(region, { fetchFn = fetch, today, log = () => {}, sleep, baseUrl = BASE_URL } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const layersDoc = await getJson(`${baseUrl}/layers?f=json`, fetchFn, wait);
  const layers = pickLayers(layersDoc);
  if (layers.length === 0) throw new Error('gnis: no gaz_featureclass layers found in the geonames service');
  log(`gnis: ${layers.length} class-bearing layers: ${layers.map((l) => `${l.id}:${l.name}`).join(', ')}`);
  const records = [];
  const seen = new Set();
  for (const layer of layers) {
    let raw;
    try {
      raw = await queryLayer(baseUrl, layer.id, region, fetchFn, wait);
    } catch (e) {
      log(`gnis: layer ${layer.id} (${layer.name}) query failed: ${e.message} — skipping`);
      continue;
    }
    let kept = 0;
    for (const f of raw) {
      const rec = normalizeFeature(f, today);
      if (!rec) continue;
      const id = rec.sources[0].source_id;
      if (seen.has(id)) continue; // same feature can appear in multiple scale layers
      seen.add(id);
      records.push(rec);
      kept++;
    }
    if (raw.length) log(`gnis: layer ${layer.id} (${layer.name}) → ${raw.length} raw, ${kept} kept`);
  }
  const byKind = {};
  for (const r of records) byKind[r.tags.curiosity] = (byKind[r.tags.curiosity] || 0) + 1;
  log(`gnis: ${records.length} named natural features ${JSON.stringify(byKind)}`);
  return records;
}
