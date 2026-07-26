// PAD-US — the Protected Areas Database of the United States (USGS GAP), the
// authoritative national inventory of protected land. US GOVERNMENT PUBLIC
// DOMAIN, no key.
//
// WHY IT MATTERS, and why it isn't a duplicate of the OSM public-lands layer:
// OSM tells us a boundary exists. PAD-US tells us WHO MANAGES IT, WHAT KIND of
// protected area it is, and WHETHER THE PUBLIC MAY ENTER — the three facts a
// photographer actually needs before driving somewhere ("is this open, and whose
// rules apply?"). It also covers STATE, COUNTY and LOCAL government land, not
// just federal, so a small county or district park gets an authoritative manager
// name instead of nothing.
//
// SHAPE: polygons, like public-lands.mjs. We fetch the areas intersecting the
// region bbox (geometry generalised — we only need containment, not detail),
// then point-in-polygon every spot locally and write tags.padus. No ring
// geometry ever ships to the browser.
//
// ACCESS: an ArcGIS REST service, unreachable from the sandbox (egress 403s the
// CONNECT), so it runs on a runner. Layer AND field names are DISCOVERED at
// runtime, case-insensitively — PAD-US renames fields between versions (v3 → v4)
// and a hard-coded guess is exactly what cost a debug cycle on GNIS and NRHP.

export const meta = {
  source: 'padus',
  name: 'Protected Areas Database of the United States (USGS)',
  license: 'public-domain',
  attribution: 'USGS Gap Analysis Project — PAD-US',
  status: 'working',
};

// PAD-US is published in several places and the USGS-hosted site has been seen
// returning 500 SITE_NOT_INITIALIZED (its ArcGIS site down or restarting). So we
// TRY CANDIDATES IN ORDER rather than betting on one URL, and log which one
// answered. Override with PADUS_SERVICE_URL to pin a specific service without a
// code change.
export const BASE_CANDIDATES = [
  // Esri Living Atlas hosted PAD-US (a FeatureServer; /layers works the same).
  'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name/FeatureServer',
  // USGS-hosted, newest first.
  'https://gis1.usgs.gov/arcgis/rest/services/padus4/Combined_Proclamation_Marine_Fee_Designation_Easement/MapServer',
  'https://gis1.usgs.gov/arcgis/rest/services/padus3/Combined_Proclamation_Marine_Fee_Designation_Easement/MapServer',
];
export const BASE_URL = BASE_CANDIDATES[0];

export const USER_AGENT =
  'photo-pointer/1.13 (personal open-data map; github.com/njefferson/photo-pointer)';

// Field candidates, lowest-common-denominator first. PAD-US ships both coded
// fields (Mang_Name) and decoded "domain" versions (d_Mang_Nam); prefer decoded,
// since that's the human-readable text we want to show.
const NAME_FIELDS = ['unit_nm', 'loc_nm', 'name'];
const MANAGER_FIELDS = ['d_mang_nam', 'mang_name', 'd_mang_typ', 'mang_type'];
const DESIGNATION_FIELDS = ['d_des_tp', 'des_tp', 'd_feat_cls', 'feat_cls'];
const ACCESS_FIELDS = ['d_pub_access', 'pub_access', 'access'];

function pick(fieldNames, candidates) {
  const lower = new Map(fieldNames.map((f) => [String(f).toLowerCase(), f]));
  for (const c of candidates) if (lower.has(c)) return lower.get(c);
  return null;
}

// Polygon layers carrying a PAD-US unit name. Marine layers are skipped — an
// offshore protected area never contains a land spot and just costs a query.
export function pickLayers(layersDoc) {
  const layers = layersDoc?.layers ?? [];
  return layers
    .filter((l) => (l.geometryType ?? '').toLowerCase().includes('polygon'))
    .filter((l) => !/marine/i.test(l.name || ''))
    .map((l) => {
      const names = (l.fields ?? []).map((f) => f.name);
      return {
        id: l.id,
        name: l.name,
        nameField: pick(names, NAME_FIELDS),
        managerField: pick(names, MANAGER_FIELDS),
        designationField: pick(names, DESIGNATION_FIELDS),
        accessField: pick(names, ACCESS_FIELDS),
      };
    })
    .filter((l) => l.nameField);
}

async function getJson(url, fetchFn, wait) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      if (res.status === 429 || res.status === 503) { await wait(10000); continue; }
      if (res.status >= 400 && res.status < 500) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.error) {
        const e = new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        // A 500/SITE_NOT_INITIALIZED means that SITE is unavailable, not that the
        // query is wrong — surface it so the caller can try the next candidate.
        e.fatal = !/SITE_NOT_INITIALIZED/i.test(String(json.error.message ?? ''));
        e.siteDown = !e.fatal;
        throw e;
      }
      return json;
    } catch (e) {
      if (e.fatal || attempt === 2) throw e;
      await wait(3000 * (attempt + 1));
    }
  }
}

// PAD-US stores DOMAIN CODES ("USFS", "NF", "OA"). The Esri-hosted service
// carries only the coded fields, so decode here — "NF — public access: oa" is
// jargon, not information. An unrecognised code falls back to the raw value
// (honest, and visible enough to be reported) rather than being dropped.
const MANAGER_DECODE = {
  USFS: 'U.S. Forest Service', NPS: 'National Park Service', BLM: 'Bureau of Land Management',
  FWS: 'U.S. Fish & Wildlife Service', USBR: 'Bureau of Reclamation', DOD: 'Department of Defense',
  USACE: 'Army Corps of Engineers', ACE: 'Army Corps of Engineers', TVA: 'Tennessee Valley Authority',
  DOE: 'Department of Energy', OTHF: 'Other federal agency', TRIB: 'Tribal land',
  STAT: 'State agency', SPR: 'State parks & recreation', SDNR: 'State natural resources',
  SDC: 'State conservation agency', SDOL: 'State land agency', SFW: 'State fish & wildlife',
  SDFW: 'State fish & wildlife', OTHS: 'Other state agency',
  CITY: 'City', CNTY: 'County', DIST: 'Regional agency or district', JNT: 'Jointly managed',
  // REG surfaced on a real run (Fairchild Park) via the raw-code fallback.
  REG: 'Regional agency', RWD: 'Regional water district', OTHR: 'Other',
  NGO: 'Non-profit conservation group', PVT: 'Private', UNK: null, UNKL: null,
};
const DESIGNATION_DECODE = {
  NF: 'National Forest', NP: 'National Park', NM: 'National Monument',
  NWR: 'National Wildlife Refuge', NRA: 'National Recreation Area', NST: 'National Scenic Trail',
  WA: 'Wilderness Area', WSA: 'Wilderness Study Area', ACEC: 'Area of Critical Environmental Concern',
  SP: 'State Park', SREC: 'State Recreation Area', SF: 'State Forest', SW: 'State Wilderness',
  SHCA: 'State Historic or Cultural Area', SCA: 'State Conservation Area',
  LP: 'Local Park', LREC: 'Local Recreation Area', LCONS: 'Local Conservation Area',
  LHCA: 'Local Historic or Cultural Area', REC: 'Recreation Management Area',
  HCA: 'Historic or Cultural Area', CONE: 'Conservation Easement', RECE: 'Recreation Easement',
  MIL: 'Military Land', PROC: 'Proclamation Boundary', OTHER: null, UNK: null, UNKL: null,
};
// Access is a claim about whether you may legally be there — only the four
// documented codes are mapped; anything else is omitted rather than guessed.
const ACCESS_DECODE = {
  OA: 'open', RA: 'restricted', XA: 'closed', UK: null,
  // The decoded d_Pub_Access spellings, so either field shape lands on one word.
  OPEN: 'open', 'OPEN ACCESS': 'open',
  RESTRICTED: 'restricted', 'RESTRICTED ACCESS': 'restricted',
  CLOSED: 'closed', 'CLOSED ACCESS': 'closed', UNKNOWN: null,
};

function decode(table, v, { fallback = true } = {}) {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const key = raw.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  // Already-decoded text (a d_* field) passes through unchanged.
  if (raw.length > 5 || /\s/.test(raw)) return raw;
  return fallback ? raw : null;
}

// "Unknown"/"Not designated" style placeholders carry no information — treat
// them as absent rather than showing the user a shrug.
const EMPTY_RE = /^\s*(|unknown|not\s+designated|n\/?a|none|other)\s*$/i;
function clean(v) {
  const s = v == null ? '' : String(v).trim();
  return EMPTY_RE.test(s) ? null : s;
}

// One ArcGIS polygon feature -> { name, manager, designation, access, bbox, rings }
export function normalizeArea(f, layer) {
  const a = f.attributes ?? {};
  const name = clean(a[layer.nameField]);
  const rings = (f.geometry?.rings ?? []).filter((r) => Array.isArray(r) && r.length > 2);
  if (!rings.length) return null;
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const r of rings) {
    for (const [x, y] of r) {
      if (y < south) south = y;
      if (y > north) north = y;
      if (x < west) west = x;
      if (x > east) east = x;
    }
  }
  if (!isFinite(south) || !isFinite(west)) return null;
  return {
    name,
    manager: layer.managerField ? decode(MANAGER_DECODE, clean(a[layer.managerField])) : null,
    designation: layer.designationField ? decode(DESIGNATION_DECODE, clean(a[layer.designationField])) : null,
    access: layer.accessField ? decode(ACCESS_DECODE, clean(a[layer.accessField]), { fallback: false }) : null,
    bbox: { south, west, north, east },
    // geo.pointInRing expects [lat,lng] pairs; ArcGIS gives [x,y] = [lng,lat].
    rings: rings.map((r) => r.map(([x, y]) => [y, x])),
  };
}

async function queryLayer(baseUrl, layer, region, fetchFn, wait) {
  const b = region.bbox;
  const envelope = encodeURIComponent(`${b.west},${b.south},${b.east},${b.north}`);
  const fields = [layer.nameField, layer.managerField, layer.designationField, layer.accessField]
    .filter(Boolean).join(',');
  const PAGE = 200; // polygons are heavy — page small
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${baseUrl}/${layer.id}/query?where=1%3D1`
      + `&geometry=${envelope}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`
      + `&outFields=${encodeURIComponent(fields)}&returnGeometry=true&outSR=4326`
      // Generalise: we only need containment, not cartographic detail. This is
      // what keeps a statewide query from returning tens of MB of vertices.
      + '&maxAllowableOffset=0.0005&geometryPrecision=5'
      + `&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;
    const page = await getJson(url, fetchFn, wait);
    const feats = page?.features ?? [];
    for (const f of feats) {
      const area = normalizeArea(f, layer);
      if (area) out.push(area);
    }
    if (feats.length < PAGE && !page?.exceededTransferLimit) break;
    if (feats.length === 0) break;
    await wait(300);
  }
  return out;
}

// Probe the candidates and return the first that answers with usable layers.
export async function resolveService(fetchFn, wait, log, candidates) {
  const errs = [];
  for (const base of candidates) {
    try {
      const doc = await getJson(`${base}/layers?f=json`, fetchFn, wait);
      const layers = pickLayers(doc);
      if (layers.length) { log(`padus: using ${base}`); return { baseUrl: base, layers }; }
      errs.push(`${base}: no usable polygon layer`);
    } catch (e) {
      errs.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`padus: no PAD-US service answered —\n  ${errs.join('\n  ')}`);
}

export async function ingest(region, { fetchFn = fetch, log = () => {}, sleep, baseUrl = null } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const candidates = baseUrl ? [baseUrl] : (process.env.PADUS_SERVICE_URL ? [process.env.PADUS_SERVICE_URL] : BASE_CANDIDATES);
  const resolved = await resolveService(fetchFn, wait, log, candidates);
  baseUrl = resolved.baseUrl;
  const layers = resolved.layers;
  log(`padus: ${layers.length} polygon layer(s): ${layers.map((l) => `${l.id}:${l.name}[name=${l.nameField},mgr=${l.managerField},des=${l.designationField},acc=${l.accessField}]`).join(' | ')}`);
  const areas = [];
  for (const layer of layers) {
    try {
      const got = await queryLayer(baseUrl, layer, region, fetchFn, wait);
      if (got.length) log(`padus: layer ${layer.id} (${layer.name}) → ${got.length} areas`);
      areas.push(...got);
    } catch (e) {
      log(`padus: layer ${layer.id} (${layer.name}) failed: ${e.message} — skipping`);
    }
  }
  log(`padus: ${areas.length} protected areas intersecting the region`);
  return areas;
}
