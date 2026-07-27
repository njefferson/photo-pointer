// USA National Phenology Network — when things bloom and leaf out.
//
// WHY A PHOTOGRAPHER CARES: wildflower peak, leaf-out and autumn colour are the
// most time-sensitive subjects there are, and the window is a couple of weeks
// that moves every year with the season. Nothing else in this app answers "when
// is it worth going for the bloom".
//
// SHAPE: these become EVENTS, not places. A bloom is a date attached to an area,
// so each result is an ordinary Spot with category 'event' carrying
// tags.event {month, day, days, recurs:'annual'} — exactly the shape the 1.7.0
// events layer already sorts, filters and renders. The date is derived from the
// TYPICAL day-of-year across observers' records, which is why it is annual and
// approximate: it is a planning hint, never a promise about this year.
//
// LICENSE + TERMS (read before touching this — Doctrine §15):
//   https://www.usanpn.org/about/terms
// USA-NPN requires no API key but DOES require callers to self-identify on an
// honour system, via a `request_source` parameter, so their operators can see
// who is drawing on the data. We send the project name and a contactable URL —
// honouring an honour-system request is exactly where character shows.
// Observational records are contributed by volunteers; data is "as is" and we
// present it as approximate rather than authoritative.

import { backoffMs, USER_AGENT } from './http-etiquette.mjs';
import { inBBox } from '../../src/model/geo.js';

export const meta = {
  source: 'usanpn',
  name: 'USA National Phenology Network — bloom and leaf-out timing',
  license: 'public-domain',
  attribution: 'USA National Phenology Network (usanpn.org) and its volunteer observers',
  status: 'working',
  policy: {
    url: 'https://www.usanpn.org/about/terms',
    // No published per-client rate limit. They ask to be told WHO is calling
    // rather than HOW OFTEN, so the standard we hold ourselves to is our own:
    // serial, with a gap, and a request_source on every call.
    maxConcurrency: 1,
    minGapMs: 0,
    selfIdentifies: true,
  },
  pacing: { concurrency: 1, gapMs: 400 },
};

// The honour-system identifier USA-NPN asks for. Not decoration: it is the one
// thing their terms actually require of us.
export const REQUEST_SOURCE = 'photo-pointer (https://github.com/njefferson/photo-pointer)';

// Endpoint candidates, probed in order. The PAD-US lesson: a guessed service URL
// costs a whole runner cycle, so try rather than bet, and fail loudly and by name.
export const BASE_CANDIDATES = [
  'https://services.usanpn.org/npn_portal',
  'https://www.usanpn.org/npn_portal',
];

// Phenophases we care about photographically. NPN tracks dozens (breaking leaf
// buds, ripe fruit, pollen release); these are the ones that are worth a drive.
export const PHENOPHASES = [
  { match: /open flowers|full flowering|flowers/i, kind: 'Bloom' },
  { match: /colored leaves|fall color/i, kind: 'Autumn colour' },
];

export function classifyPhenophase(name) {
  for (const p of PHENOPHASES) if (p.match.test(String(name ?? ''))) return p.kind;
  return null;
}

// day-of-year → {month, day}, on a non-leap reference year. Bloom timing is
// approximate to within days, so the leap-year shift is well inside the noise.
export function dayOfYearToDate(doy) {
  const d = new Date(Date.UTC(2001, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.round(doy) - 1);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// The TYPICAL day-of-year for a set of records — the median, not the mean, so a
// single freak-warm-winter record cannot drag the whole window.
export function typicalDayOfYear(days) {
  const xs = days.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

// A species needs this many independent observations before we will put a date
// on it. Below this it is one person's garden, not a regional bloom.
export const MIN_RECORDS = 8;

// Group raw NPN observation rows into one annual event per species+phenophase.
export function summarize(rows, { minRecords = MIN_RECORDS } = {}) {
  const groups = new Map();
  for (const r of rows ?? []) {
    const kind = classifyPhenophase(r.phenophase_description);
    if (!kind) continue;
    const doy = Number(r.day_of_year);
    const lat = Number(r.latitude), lng = Number(r.longitude);
    if (!Number.isFinite(doy) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Only records where the phenophase was actually observed, not merely looked for.
    if (Number(r.phenophase_status) !== 1) continue;
    const name = String(r.common_name ?? '').trim();
    if (!name) continue;
    const key = `${kind}|${name.toLowerCase()}`;
    const g = groups.get(key) ?? groups.set(key, { kind, name, days: [], lats: [], lngs: [] }).get(key);
    g.days.push(doy); g.lats.push(lat); g.lngs.push(lng);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.days.length < minRecords) continue;
    const doy = typicalDayOfYear(g.days);
    if (doy == null) continue;
    out.push({
      kind: g.kind,
      species: g.name,
      dayOfYear: doy,
      records: g.days.length,
      lat: g.lats.reduce((a, b) => a + b, 0) / g.lats.length,
      lng: g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length,
    });
  }
  return out.sort((a, b) => a.dayOfYear - b.dayOfYear);
}

// One summary → a Spot-shaped event record.
export function toEvent(s, today) {
  const { month, day } = dayOfYearToDate(s.dayOfYear);
  const title = s.kind === 'Bloom' ? `${s.species} in bloom` : `${s.species} in autumn colour`;
  return {
    name: title,
    lat: s.lat,
    lng: s.lng,
    category: 'event',
    subject_type: ['landscape'],
    best_light: [],
    best_season: [],
    access_difficulty: null,
    // Said plainly on the card: this is a typical date from volunteer records,
    // not a forecast for this year.
    notes: `Typically around this date, from ${s.records} volunteer observations `
      + `recorded nearby. Timing shifts with the season — treat it as a window, not a date.`,
    tags: {
      event: { month, day, days: 14, recurs: 'annual', skywide: false },
      phenology: { species: s.species, kind: s.kind, records: s.records },
    },
    sources: [{
      source: meta.source,
      source_id: `${s.kind}:${s.species}`.toLowerCase().replace(/\s+/g, '-'),
      source_license: meta.license,
      source_url: 'https://www.usanpn.org/data',
      first_seen: today,
      last_seen: today,
    }],
  };
}

// BEWARE THE AXIS NAMES. USA-NPN's bounding-box parameters are called x1/y1 and
// x2/y2, but x is LATITUDE and y is LONGITUDE — the opposite of the usual
// convention, and the opposite of every other adapter here. Confirmed against
// their own R client, which documents the argument order as
// `c(lower_left_lat, lower_left_long, upper_right_lat, upper_right_long)`.
// Passing them the obvious way round returns HTTP 200 with zero records, which
// looks exactly like "this region has no data" — it cost a runner cycle.
export function buildBody(region, { startDate, endDate }) {
  const b = region.bbox;
  return new URLSearchParams({
    // request_src is what USA-NPN's terms actually ask of us: say who is calling.
    request_src: REQUEST_SOURCE,
    climate_data: '0',
    start_date: startDate,
    end_date: endDate,
    bottom_left_x1: String(b.south),   // latitude, despite the name
    bottom_left_y1: String(b.west),    // longitude, despite the name
    upper_right_x2: String(b.north),
    upper_right_y2: String(b.east),
  });
}

export function endpoint(base) {
  return `${base}/observations/getObservations.json`;
}

// A YEAR AT A TIME. Their own client loops per calendar year and sends a
// start_date/end_date inside that year; one range spanning five years is not a
// query they answer, it is a query they ignore. That distinction is invisible
// from the outside — both come back HTTP 200 with `[]`.
export function yearWindows(thisYear, count = 5) {
  const out = [];
  for (let y = thisYear - count; y < thisYear; y++) {
    out.push({ year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31` });
  }
  return out;
}

// POST WITH A FORM BODY, not GET with a query string. Confirmed against their R
// client (`req_method("POST")` + `req_body_form()`). A GET is answered 200 with
// an empty array — the exact shape of "this region has no data", which is how
// two runner cycles were spent believing a wrong request was a true zero.
async function postJson(url, body, fetchFn, wait) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(120000),
    });
    if (res.status === 429 || res.status === 503) { await wait(backoffMs(res, attempt, { base: 5000 })); continue; }
    if (res.status >= 400 && res.status < 500) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('phenology: throttled past our retries');
}

export async function ingest(region, {
  fetchFn = fetch, today = new Date().toISOString().slice(0, 10), log = () => {},
  sleep, bases = BASE_CANDIDATES, windows,
} = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const spans = windows ?? yearWindows(new Date().getUTCFullYear());

  // Find an endpoint that answers at all, using the first year as the probe.
  let base = null; const tried = [];
  for (const cand of bases) {
    try {
      await postJson(endpoint(cand), buildBody(region, spans[0]), fetchFn, wait);
      base = cand; break;
    } catch (e) { tried.push(`${cand}: ${e.message}`); }
    await wait(meta.pacing.gapMs);
  }
  if (!base) throw new Error(`phenology: no endpoint answered — ${tried.join(' | ')}`);

  const rows = [];
  for (const span of spans) {
    const got = await postJson(endpoint(base), buildBody(region, span), fetchFn, wait);
    const n = Array.isArray(got) ? got.length : 0;
    log(`phenology: ${span.year} → ${n} records`);
    // SHOW THE SHAPE OF THE FIRST ROW ONCE. I cannot reach this API from the
    // sandbox, so the field names here are read from their docs, not measured —
    // print them so the next run says whether they are right instead of leaving
    // a silent zero to be read as fact.
    if (n && !rows.length) log(`phenology: a record looks like ${JSON.stringify(Object.keys(got[0]))}`);
    if (n) rows.push(...got);
    await wait(meta.pacing.gapMs);
  }
  if (!rows.length) {
    log(`phenology: zero records across ${spans.length} years — the request was `
      + `POST ${endpoint(base)} with ${buildBody(region, spans[0])}`);
  }

  const inRegion = rows.filter((r) =>
    inBBox(Number(r.latitude), Number(r.longitude), region.bbox));
  const summaries = summarize(inRegion);
  log(`phenology: ${inRegion.length} usable records → ${summaries.length} species with enough to date`);
  return summaries.map((s) => toEvent(s, today));
}
