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
  // Recreation.gov's RIDB. Key-authenticated and federally run, with no
  // published per-client rate limit; we page serially with a gap.
  policy: {
    url: 'https://ridb.recreation.gov/docs',
    maxConcurrency: 1,
    minGapMs: 0,
  },
  pacing: { concurrency: 1, gapMs: 200 },
};

import { backoffMs } from './http-etiquette.mjs';

export const BASE_URL = 'https://ridb.recreation.gov/api/v1';
// Identify ourselves to every service we call, so an operator seeing this
// traffic can tell what it is and who to contact.
export const USER_AGENT =
  'photo-pointer/1.15 (https://github.com/njefferson/photo-pointer)';
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

// MEASURED on the first full runs: almost every non-campground facility comes
// back with the GENERIC type "Facility" (Georgia: Facility=85 of 87 unmapped),
// so a type-only rule finds campgrounds and nothing else. For those rows — and
// ONLY those — the facility NAME is the next-best evidence. A specific type we
// simply don't want (Library, Ticket Facility) is still skipped outright: it is
// named accurately and the answer is no.
const GENERIC_TYPE = /^(facility|site|other)?$/i;

export function isGenericType(typeDesc) {
  return GENERIC_TYPE.test(String(typeDesc ?? '').trim());
}

// Name → pin type. Deliberately conservative: a name that says what the place
// IS gets that pin, and a name that doesn't gets NO pin. The 1.11.0 rule holds —
// a wrong label is worse than no pin — so there is no "probably a park" bucket.
const NAME_CATEGORY = [
  [/\btrail\s?heads?\b/i, 'trailhead'],
  [/\bvisitor (cent(er|re)|station)\b|\binterpretive\b|\bmuseum\b/i, 'historic_site'],
  [/\b(fire )?lookout\b|\bfire tower\b/i, 'lookout_tower'],
  [/\boverlooks?\b|\bviewpoints?\b|\bvista\b/i, 'viewpoint'],
  [/\bcampgrounds?\b|\bcamping\b|\bcampsites?\b/i, 'campsite'],
  [/\bday\s?use\b|\bpicnic\b|\bboat (launch|ramp)\b|\bswim(ming)? (area|beach)\b/i, 'park'],
];

export function categoryForName(name) {
  const s = String(name ?? '');
  for (const [re, cat] of NAME_CATEGORY) if (re.test(s)) return cat;
  return null;
}

// The full decision: the declared TYPE is the strongest claim and wins; the name
// only speaks when the type said nothing useful.
export function categoryForFacility(f) {
  return categoryForType(f?.FacilityTypeDescription)
    ?? (isGenericType(f?.FacilityTypeDescription) ? categoryForName(f?.FacilityName) : null);
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

// Sweep by STATE, not by a lat/lng radius. A radius search proved unreliable —
// RIDB's radius semantics are undocumented at the sizes our regions need, and it
// returns SHORT pages while more results remain, so a radius sweep silently
// under-returned (the first Sacramento run found 7 facilities instead of
// hundreds). Every region already declares its counties' states, so we page each
// state to its reported TOTAL_COUNT and bbox-filter afterwards: deterministic,
// complete, and independent of any distance semantics.
export function statesFor(region) {
  const set = new Set();
  for (const c of region.counties ?? []) {
    const st = (c.state || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(st)) set.add(st);
  }
  return [...set];
}

export function buildUrl(state, offset) {
  return `${BASE_URL}/facilities?state=${encodeURIComponent(state)}`
    + `&limit=${PAGE_SIZE}&offset=${offset}`;
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
  const category = categoryForFacility(f);
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
        headers: { apikey: apiKey, accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429 || res.status === 503) { await wait(backoffMs(res, attempt, { base: 10000 })); continue; }
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
  const states = statesFor(region);
  if (!states.length) throw new Error(`ridb: region ${region.id} declares no county states`);
  log(`ridb: sweeping ${states.join(', ')}`);
  const records = [];
  const seen = new Set();
  let outside = 0;
  let skipped = 0;
  let fetched = 0;
  const unmappedTypes = new Map();
  const unmappedNames = [];
  for (const state of states) {
    let total = Infinity;
    // Page strictly to the reported TOTAL_COUNT — RIDB returns SHORT pages while
    // more rows remain, so "a short page means the end" is wrong and silently
    // truncates. MAX_PAGES is a runaway guard, and it's logged if ever hit.
    const MAX_PAGES = 400;
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      if (offset >= total) break;
      const json = await getJson(buildUrl(state, offset), apiKey, fetchFn, wait);
      const rows = json?.RECDATA ?? [];
      const reported = Number(json?.METADATA?.RESULTS?.TOTAL_COUNT);
      if (isFinite(reported) && reported > 0) total = reported;
      fetched += rows.length;
      for (const f of rows) {
        const rec = normalizeFacility(f, today);
        if (!rec) {
          skipped++;
          // Record WHY, so a whole facility kind can't be silently left on the
          // table — the log names the unmapped types and how many of each.
          if (f?.FacilityName && categoryForFacility(f) === null) {
            const t = String(f.FacilityTypeDescription ?? '(none)');
            unmappedTypes.set(t, (unmappedTypes.get(t) ?? 0) + 1);
            // For the generic bucket the type says nothing, so the NAME is the
            // only evidence about what was left behind — sample a few verbatim.
            if (isGenericType(t) && unmappedNames.length < 15) unmappedNames.push(f.FacilityName);
          }
          continue;
        }
        if (!inBBox(rec.lat, rec.lng, region.bbox)) { outside++; continue; }
        const id = rec.sources[0].source_id;
        if (seen.has(id)) continue;
        seen.add(id);
        records.push(rec);
      }
      if (!rows.length) break; // nothing more is coming
      if (page === MAX_PAGES - 1) log(`ridb: ${state} hit the ${MAX_PAGES}-page cap — results may be incomplete`);
      await wait(200);
    }
  }
  log(`ridb: fetched ${fetched} facility rows across ${states.length} state(s)`);
  const byCat = {};
  for (const r of records) byCat[r.category] = (byCat[r.category] || 0) + 1;
  const described = records.filter((r) => r.notes).length;
  log(`ridb: ${records.length} facilities ${JSON.stringify(byCat)} — ${described} with a description `
    + `(${outside} outside bbox, ${skipped} unmapped/unusable)`);
  if (unmappedTypes.size) {
    const top = [...unmappedTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([t, n]) => `${t}=${n}`).join(', ');
    log(`ridb: unmapped facility types (statewide, pre-bbox): ${top}`);
  }
  if (unmappedNames.length) {
    log(`ridb: sample generic-type names still unmapped: ${unmappedNames.join(' | ')}`);
  }
  return records;
}
