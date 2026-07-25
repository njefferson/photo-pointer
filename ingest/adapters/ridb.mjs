// Recreation.gov / RIDB — federal campgrounds, trailheads, day-use areas and
// visitor centers. The Recreation Information Database is the authoritative
// federal inventory (NPS, USFS, BLM, USACE, FWS, BOR), US GOVERNMENT PUBLIC
// DOMAIN — so unlike a city or district website we may carry its DESCRIPTIONS,
// not just link to them. That matters: it's the one source that fills the bare
// cards for the categories OSM covers thinnest.
//
// KEY REQUIRED (the only source here that needs one). A key can never ship in a
// client-side app, so RIDB is an INGEST-TIME source like eBird/GNIS/NRHP: the
// runner reads RIDB_API_KEY from repo secrets and commits the resulting data.
// Never log the key, and never write it into a data file.
//
// WHAT WE TAKE: facility identity, coordinates, type, a trimmed plain-text
// description, and the official link. WHAT WE SKIP: /media (third-party image
// licensing), /campsites (individual numbered sites — reservation granularity,
// no photographic value), /permits, /tours.

import { inBBox } from '../../src/model/geo.js';

export const meta = {
  source: 'ridb',
  name: 'Recreation.gov (RIDB) — federal recreation facilities',
  license: 'public-domain',
  attribution: 'Recreation Information Database (RIDB), U.S. federal recreation agencies',
  status: 'working',
};

export const BASE_URL = 'https://ridb.recreation.gov/api/v1';
export const PAGE_SIZE = 50; // RIDB's per-request maximum

// FacilityTypeDescription → our pin type. Anything not listed is skipped rather
// than dumped into a generic bucket (the 1.11.0 lesson: a wrong label is worse
// than no pin).
const TYPE_CATEGORY = [
  [/campground|camping/i, 'campsite'],
  [/trailhead|trail/i, 'trailhead'],
  [/day use|picnic|recreation area|recarea/i, 'park'],
  [/visitor center|interpretive|museum/i, 'historic_site'],
];

export function categoryForType(typeDesc) {
  const s = String(typeDesc ?? '');
  for (const [re, cat] of TYPE_CATEGORY) if (re.test(s)) return cat;
  return null;
}

// RIDB descriptions are HTML. Strip to plain text, collapse whitespace and trim
// to a card-sized excerpt at a word boundary (the full text is a tap away).
export function plainText(html, max = 400) {
  if (!html) return null;
  let s = String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (s.length > max) {
    const cut = s.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
  }
  return s;
}

// A radius (miles) that covers the whole region bbox from its centre, so one
// paged sweep reaches every facility; results are bbox-filtered afterwards.
export function regionQuery(region) {
  const b = region.bbox;
  const lat = (b.south + b.north) / 2;
  const lng = (b.west + b.east) / 2;
  const latMi = ((b.north - b.south) / 2) * 69.0;
  const lngMi = ((b.east - b.west) / 2) * 69.0 * Math.cos((lat * Math.PI) / 180);
  const radius = Math.ceil(Math.sqrt(latMi * latMi + lngMi * lngMi)) + 5; // + margin
  return { lat, lng, radius };
}

export function buildUrl({ lat, lng, radius }, offset) {
  return `${BASE_URL}/facilities?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`
    + `&radius=${radius}&limit=${PAGE_SIZE}&offset=${offset}`;
}

// One RIDB facility -> a Spot-shaped record, or null (unusable / not a kind we map).
export function normalizeFacility(f, today) {
  const id = f?.FacilityID != null ? String(f.FacilityID) : null;
  const name = String(f?.FacilityName ?? '').trim() || null;
  if (!id || !name) return null;
  if (f.Enabled === false) return null; // decommissioned
  const lat = Number(f.FacilityLatitude);
  const lng = Number(f.FacilityLongitude);
  // RIDB uses 0,0 for "no coordinate on file" — never a real US facility.
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const category = categoryForType(f.FacilityTypeDescription);
  if (!category) return null;
  const notes = plainText(f.FacilityDescription);
  const url = f.FacilityReservationURL
    || (category === 'campsite' ? `https://www.recreation.gov/camping/campgrounds/${id}` : null);
  const subject = category === 'historic_site' ? ['historic'] : ['landscape'];
  return {
    name,
    lat,
    lng,
    category,
    subject_type: subject,
    best_light: [],
    best_season: [],
    access_difficulty: 'roadside', // federal facilities are drive-up by definition
    notes,
    tags: {
      ridb: id,
      ridb_type: f.FacilityTypeDescription ?? null,
      ...(f.Reservable === true ? { reservable: true } : {}),
    },
    sources: [{
      source: meta.source,
      source_id: id,
      source_license: meta.license,
      source_url: url,
      first_seen: today,
      last_seen: today,
    }],
  };
}

async function getJson(url, apiKey, fetchFn, wait) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { apikey: apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429 || res.status === 503) { await wait(10000); continue; }
      if (res.status === 401 || res.status === 403) {
        const e = new Error(`RIDB rejected the API key (HTTP ${res.status}) — check the RIDB_API_KEY repo secret`);
        e.fatal = true; throw e;
      }
      if (res.status >= 400 && res.status < 500) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e.fatal || attempt === 2) throw e;
      await wait(3000 * (attempt + 1));
    }
  }
}

export async function ingest(region, { fetchFn = fetch, today, log = () => {}, sleep, apiKey = process.env.RIDB_API_KEY } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  if (!apiKey) throw new Error('ridb: no API key — set the RIDB_API_KEY repo secret');
  const q = regionQuery(region);
  log(`ridb: sweeping ${q.radius} mi around ${q.lat.toFixed(3)},${q.lng.toFixed(3)}`);
  const records = [];
  const seen = new Set();
  let outside = 0;
  let skipped = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const json = await getJson(buildUrl(q, offset), apiKey, fetchFn, wait);
    const rows = json?.RECDATA ?? [];
    const total = Number(json?.METADATA?.RESULTS?.TOTAL_COUNT ?? 0);
    for (const f of rows) {
      const rec = normalizeFacility(f, today);
      if (!rec) { skipped++; continue; }
      if (!inBBox(rec.lat, rec.lng, region.bbox)) { outside++; continue; }
      const id = rec.sources[0].source_id;
      if (seen.has(id)) continue;
      seen.add(id);
      records.push(rec);
    }
    if (rows.length < PAGE_SIZE || offset + PAGE_SIZE >= total) break;
    await wait(250);
  }
  const byCat = {};
  for (const r of records) byCat[r.category] = (byCat[r.category] || 0) + 1;
  const described = records.filter((r) => r.notes).length;
  log(`ridb: ${records.length} facilities ${JSON.stringify(byCat)} — ${described} with a description `
    + `(${outside} outside bbox, ${skipped} unmapped/unusable)`);
  return records;
}
