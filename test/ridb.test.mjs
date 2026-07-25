import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryForType, plainText, regionQuery, buildUrl, normalizeFacility, ingest, meta, PAGE_SIZE,
} from '../ingest/adapters/ridb.mjs';
import { makeSpot, validateSpot } from '../src/model/spot.js';

const TODAY = '2026-07-25';
const REGION = { id: 't', bbox: { south: 38.5, west: -121.5, north: 39.5, east: -120.5 } };

test('categoryForType maps the useful facility kinds and skips the rest', () => {
  assert.equal(categoryForType('Campground'), 'campsite');
  assert.equal(categoryForType('Trailhead'), 'trailhead');
  assert.equal(categoryForType('Day Use Area'), 'park');
  assert.equal(categoryForType('Visitor Center'), 'historic_site');
  // Unmapped kinds are skipped rather than dumped in a generic bucket.
  assert.equal(categoryForType('Permit'), null);
  assert.equal(categoryForType(''), null);
  assert.equal(categoryForType(undefined), null);
});

test('plainText strips HTML, decodes entities and trims at a word boundary', () => {
  assert.equal(plainText('<p>Sierra <b>campground</b> &amp; picnic&nbsp;area.</p>'),
    'Sierra campground & picnic area.');
  const long = plainText('<p>' + 'word '.repeat(200) + '</p>', 60);
  assert.ok(long.length <= 61, `too long: ${long.length}`);
  assert.ok(long.endsWith('…'));
  assert.ok(!/\s…$/.test(long), 'should not leave a dangling space before the ellipsis');
  assert.equal(plainText(''), null);
  assert.equal(plainText(null), null);
});

test('regionQuery covers the whole bbox from its centre', () => {
  const q = regionQuery(REGION);
  assert.ok(Math.abs(q.lat - 39.0) < 1e-9);
  assert.ok(Math.abs(q.lng - -121.0) < 1e-9);
  // Half-diagonal of this bbox is ~44 mi; the radius must exceed it.
  assert.ok(q.radius > 44, `radius too small: ${q.radius}`);
  assert.ok(q.radius < 100, `radius implausibly large: ${q.radius}`);
  assert.match(buildUrl(q, 50), /offset=50/);
  assert.match(buildUrl(q, 0), new RegExp(`limit=${PAGE_SIZE}`));
});

test('normalizeFacility builds a valid spot with description and official link', () => {
  const f = {
    FacilityID: 232447, FacilityName: 'Loon Lake Campground',
    FacilityLatitude: 38.98, FacilityLongitude: -120.32,
    FacilityTypeDescription: 'Campground',
    FacilityDescription: '<p>Set on the shore of <b>Loon Lake</b> in the Crystal Basin.</p>',
    Reservable: true, Enabled: true,
  };
  const rec = normalizeFacility(f, TODAY);
  assert.equal(rec.category, 'campsite');
  assert.equal(rec.notes, 'Set on the shore of Loon Lake in the Crystal Basin.');
  assert.equal(rec.tags.ridb, '232447');
  assert.equal(rec.tags.reservable, true);
  assert.equal(rec.access_difficulty, 'roadside');
  assert.match(rec.sources[0].source_url, /recreation\.gov\/camping\/campgrounds\/232447/);
  assert.equal(rec.sources[0].source_license, 'public-domain');
  assert.deepEqual(validateSpot(makeSpot(rec)), []);
});

test('normalizeFacility rejects unusable rows', () => {
  const base = { FacilityID: 1, FacilityName: 'X', FacilityTypeDescription: 'Campground', FacilityLatitude: 39, FacilityLongitude: -121 };
  assert.equal(normalizeFacility({ ...base, FacilityName: '' }, TODAY), null);      // unnamed
  assert.equal(normalizeFacility({ ...base, FacilityID: null }, TODAY), null);      // no id
  assert.equal(normalizeFacility({ ...base, Enabled: false }, TODAY), null);        // decommissioned
  assert.equal(normalizeFacility({ ...base, FacilityLatitude: 0, FacilityLongitude: 0 }, TODAY), null); // no coords on file
  assert.equal(normalizeFacility({ ...base, FacilityTypeDescription: 'Permit' }, TODAY), null); // unmapped kind
});

test('ingest pages, sends the key as a header, and drops facilities outside the bbox', async () => {
  const inside = (i) => ({
    FacilityID: i, FacilityName: `Camp ${i}`, FacilityTypeDescription: 'Campground',
    FacilityLatitude: 39.0, FacilityLongitude: -121.0, Enabled: true,
    FacilityDescription: '<p>A camp.</p>',
  });
  const far = { FacilityID: 9999, FacilityName: 'Far Camp', FacilityTypeDescription: 'Campground',
    FacilityLatitude: 41.9, FacilityLongitude: -119.0, Enabled: true };
  const seenHeaders = [];
  const fetchFn = async (url, opts) => {
    seenHeaders.push(opts.headers);
    const offset = Number(new URL(url).searchParams.get('offset'));
    const RECDATA = offset === 0
      ? Array.from({ length: PAGE_SIZE }, (_, i) => inside(i))
      : [inside(100), far, inside(100)]; // includes a dup and an out-of-bbox row
    return { ok: true, status: 200, json: async () => ({ METADATA: { RESULTS: { TOTAL_COUNT: PAGE_SIZE + 3 } }, RECDATA }) };
  };
  const recs = await ingest(REGION, { fetchFn, today: TODAY, sleep: async () => {}, apiKey: 'test-key' });
  assert.equal(recs.length, PAGE_SIZE + 1); // dup collapsed, far one dropped
  assert.equal(seenHeaders[0].apikey, 'test-key');
  assert.equal(seenHeaders[0].accept, 'application/json');
  assert.equal(meta.source, 'ridb');
});

test('ingest fails clearly on a missing or rejected key', async () => {
  await assert.rejects(
    () => ingest(REGION, { fetchFn: async () => ({ ok: true, json: async () => ({}) }), today: TODAY, apiKey: '' }),
    /RIDB_API_KEY/);
  let calls = 0;
  const denies = async () => { calls++; return { ok: false, status: 403, json: async () => ({}) }; };
  await assert.rejects(
    () => ingest(REGION, { fetchFn: denies, today: TODAY, sleep: async () => {}, apiKey: 'bad' }),
    /rejected the API key/);
  assert.equal(calls, 1, 'a rejected key must fail fast, not retry');
});
