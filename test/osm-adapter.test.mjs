import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, normalizeElement, TAG_RULES, meta, ingest, OVERPASS_GAP_MS, bboxTiles, MAX_TILES, fetchOverpass, OVERPASS_MAX_ATTEMPTS, GIVE_UP_AFTER, TILE_SERVER_TIMEOUT_S, freshTiles, tileKey } from '../ingest/adapters/osm-overpass.mjs';
import { decide, fingerprint, statusLine, MAX_ATTEMPTS } from '../scripts/osm-schedule.mjs';
import { validateSpot } from '../src/model/spot.js';
import { makeSpot } from '../src/model/spot.js';

const region = {
  id: 'test',
  name: 'Test',
  bbox: { south: 38.0, west: -121.95, north: 39.4, east: -119.85 },
  counties: [
    { name: 'Sacramento County', osm_area_name: 'Sacramento County', fips: '06067' },
  ],
};

// This test used to assert that the query NAMED EVERY COUNTY. That was the bug:
// the app draws a bounding box, so an area filter could only ever remove places
// it would have shown — and did, for three whole counties.
test('buildQuery carries the box and every selector, and names no county', () => {
  const q = buildQuery(region);
  assert.match(q, /\[bbox:38,-121\.95,39\.4,-119\.85\]/);
  assert.match(q, /out center tags/);
  assert.ok(!/County/.test(q), 'the county list is not part of asking OpenStreetMap any more');
  for (const r of TAG_RULES) assert.match(q, new RegExp(`"${r.k}"="${r.v}"`));
});

test('a viewpoint node normalizes to a valid Spot record', () => {
  const el = {
    type: 'node', id: 42, lat: 38.9, lng: undefined, lon: -121.07,
    tags: { tourism: 'viewpoint', name: 'Auburn Overlook', direction: 'W' },
  };
  const rec = normalizeElement(el, '2026-07-19');
  assert.equal(rec.category, 'viewpoint');
  assert.equal(rec.name, 'Auburn Overlook');
  assert.equal(rec.sources[0].source_id, 'node/42');
  assert.equal(rec.sources[0].source_license, 'ODbL-1.0');
  assert.equal(rec.tags.direction, 'W');
  assert.deepEqual(validateSpot(makeSpot(rec)), []);
});

test('a way uses its center coordinate', () => {
  const el = {
    type: 'way', id: 7, center: { lat: 38.5, lon: -121.5 },
    tags: { leisure: 'park', name: 'Test Park' },
  };
  const rec = normalizeElement(el, '2026-07-19');
  assert.equal(rec.lat, 38.5);
  assert.equal(rec.category, 'park');
});

test('namedOnly rules drop unnamed elements; others keep them', () => {
  const unnamedPeak = { type: 'node', id: 1, lat: 39, lon: -120.5, tags: { natural: 'peak' } };
  assert.equal(normalizeElement(unnamedPeak, '2026-07-19'), null);
  const unnamedViewpoint = { type: 'node', id: 2, lat: 39, lon: -120.5, tags: { tourism: 'viewpoint' } };
  assert.ok(normalizeElement(unnamedViewpoint, '2026-07-19'));
});

test('untagged/unmatched elements are dropped', () => {
  const el = { type: 'node', id: 3, lat: 39, lon: -120.5, tags: { amenity: 'bench' } };
  assert.equal(normalizeElement(el, '2026-07-19'), null);
});

test('adapter declares its license', () => {
  assert.equal(meta.license, 'ODbL-1.0');
  assert.match(meta.attribution, /OpenStreetMap/);
});

test('a specific feature tag wins over the generic oddity rule (feature-first)', () => {
  // Old Faithful carries BOTH natural=geyser and tourism=attraction. The feature
  // rule must win so it gets a Hot spring curiosity kind, not a bare oddity.
  const el = {
    type: 'node', id: 99, lat: 44.46, lon: -110.83,
    tags: { name: 'Old Faithful', natural: 'geyser', tourism: 'attraction' },
  };
  const rec = normalizeElement(el, '2026-07-19');
  assert.equal(rec.tags.curiosity, 'Hot spring');
});

// ASK BY BOX, IN TILES. Two measured failures got here: one query with six
// county areas 504'd after nineteen minutes of retries, and splitting per county
// still took SIXTEEN MINUTES for Sacramento County alone. The county was always
// the wrong unit — the map is a box, the merge drops anything outside it, so the
// area filter only ever removed places the app would have shown. That is exactly
// how three counties inside the box stayed invisible.
test('the query asks by box and names no county at all', () => {
  const region = { bbox: { south: 38, west: -122, north: 39.4, east: -119.8 }, counties: [{ osm_area_name: 'Sacramento County' }] };
  const q = buildQuery(region, TAG_RULES, { south: 38, west: -122, north: 38.35, east: -121.65 });
  assert.match(q, /\[bbox:38,-122,38\.35,-121\.65\]/);
  assert.ok(!/area/.test(q), 'no admin-boundary membership test');
  assert.ok(!/Sacramento County/.test(q), 'and no county name');
});

test('tiles cover the whole box, do not overlap, and stay a polite number', () => {
  const bbox = { south: 38, west: -121.95, north: 39.4, east: -119.85 };
  const tiles = bboxTiles(bbox);
  assert.ok(tiles.length > 1 && tiles.length <= MAX_TILES, `${tiles.length} tiles`);
  assert.equal(Math.min(...tiles.map((t) => t.south)), bbox.south);
  assert.equal(Math.max(...tiles.map((t) => t.north)), bbox.north);
  assert.equal(Math.min(...tiles.map((t) => t.west)), bbox.west);
  assert.equal(Math.max(...tiles.map((t) => t.east)), bbox.east);
  for (const t of tiles) assert.ok(t.north > t.south && t.east > t.west, 'no empty tile');
  // A huge region must not become hundreds of requests.
  const huge = bboxTiles({ south: 32.4, west: -124.6, north: 42.1, east: -117 });
  assert.ok(huge.length <= MAX_TILES, `a statewide box is ${huge.length} tiles`);
});

test('one query per tile, and an element on a tile edge is counted once', async () => {
  const region = { bbox: { south: 38, west: -122, north: 38.7, east: -121.3 }, counties: [] };
  const el = { type: 'node', id: 42, lat: 38.35, lon: -121.65, tags: { tourism: 'viewpoint', name: 'On the edge' } };
  const boxes = [];
  const fetchFn = async (_url, opts) => {
    boxes.push(decodeURIComponent(opts.body).match(/\[bbox:([^\]]+)\]/)[1]);
    return { ok: true, status: 200, json: async () => ({ elements: [el] }) };
  };
  const out = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} });
  assert.ok(boxes.length >= 4, `tiled into ${boxes.length} queries`);
  assert.equal(new Set(boxes).size, boxes.length, 'every tile is a different box');
  assert.equal(out.length, 1, 'every tile returned it; it is one place');
});

// A tile that will not answer is not an empty tile.
test('a failing tile is named and the rest of the region still lands', async () => {
  const region = { bbox: { south: 38, west: -122, north: 38.7, east: -121.3 }, counties: [] };
  // Key the failure on the TILE, not a call counter — fetchOverpass retries
  // across three mirrors, so a counter would let the retry succeed.
  let id = 0;
  const doomed = bboxTiles(region.bbox)[1];
  const fetchFn = async (_url, opts) => {
    const box = decodeURIComponent(opts.body).match(/\[bbox:([^\]]+)\]/)[1];
    if (box === `${doomed.south},${doomed.west},${doomed.north},${doomed.east}`) {
      return { ok: false, status: 504 };
    }
    id += 1;
    return { ok: true, status: 200, json: async () => ({ elements: [
      { type: 'node', id, lat: 38.1, lon: -121.9, tags: { tourism: 'viewpoint', name: `Kept ${id}` } },
    ] }) };
  };
  const out = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} });
  assert.ok(out.length >= 1, 'the tiles that answered are not thrown away');
  assert.equal(out.failedTiles.length, 1);
  assert.match(out.failedTiles[0], /504/, 'and the one that failed is named, not silently zero');
});

// BEING CONSIDERATE IS A GATE, NOT AN INTENTION. The requirement, settled
// 2026-07-27: a retry must not hammer a volunteer service and make its load
// worse. MEASURED on the run that
// prompted it: 11 tiles answered in 3-14 s, and 8 took 86-739 s. That extra time
// was not Overpass computing — it was the retry loop asking the NEXT VOLUNTEER
// SERVER the same question. One tile spent 333 seconds to be told there was
// nothing there.
test('a refused query is never re-asked on another mirror', async () => {
  const asked = [];
  const fetchFn = async (host) => { asked.push(host); return { ok: false, status: 504 }; };
  await assert.rejects(() => fetchOverpass('q', { fetchFn, sleepFn: async () => {} }));
  assert.equal(asked.length, OVERPASS_MAX_ATTEMPTS, `at most ${OVERPASS_MAX_ATTEMPTS} attempts, not nine`);
  assert.equal(new Set(asked).size, 1, "one server's 'no' must not become three servers' problem");
});

test('a stated Retry-After is waited out rather than guessed at', async () => {
  const waits = [];
  const fetchFn = async () => ({ ok: false, status: 429, headers: { get: (k) => (k === 'retry-after' ? '45' : null) } });
  await assert.rejects(() => fetchOverpass('q', { fetchFn, sleepFn: async (ms) => waits.push(ms) }));
  assert.deepEqual(waits, [45000], 'their number, not ours');
});

// The important one. When a service is struggling, the considerate response is
// to stop asking — not to grind through the remaining tiles proving it.
test('several failures in a row means stop asking, not keep going', async () => {
  const region = { bbox: { south: 38, west: -122, north: 39.4, east: -119.8 }, counties: [] };
  let calls = 0;
  const fetchFn = async () => { calls += 1; return { ok: false, status: 504 }; };
  const err = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} })
    .then(() => null, (e) => e);
  assert.ok(err?.gaveUp, 'the run abandons itself rather than hammering');
  assert.ok(calls <= GIVE_UP_AFTER * OVERPASS_MAX_ATTEMPTS,
    `${calls} requests before giving up — must be at most ${GIVE_UP_AFTER * OVERPASS_MAX_ATTEMPTS}`);
  assert.ok(bboxTiles(region.bbox).length > calls, 'it did NOT work through every tile to prove the point');
});

test('a run that gives up commits nothing, so a partial sweep never looks complete', async () => {
  const region = { bbox: { south: 38, west: -122, north: 39.4, east: -119.8 }, counties: [] };
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    // One good tile, then the service falls over.
    if (n === 1) return { ok: true, status: 200, json: async () => ({ elements: [
      { type: 'node', id: 1, lat: 38.1, lon: -121.9, tags: { tourism: 'viewpoint', name: 'Kept' } },
    ] }) };
    return { ok: false, status: 503 };
  };
  const err = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} })
    .then(() => null, (e) => e);
  assert.ok(err?.gaveUp);
  assert.equal(err.partial.length, 1, 'what it did get is attached for the log, but it THROWS');
});

test('we ask the server for a minute per tile, not three', () => {
  const q = buildQuery({ bbox: { south: 38, west: -122, north: 39.4, east: -119.8 } });
  assert.match(q, new RegExp(`\\[timeout:${TILE_SERVER_TIMEOUT_S}\\]`),
    'a healthy tile answers in seconds; a struggling server should abandon us quickly');
});

// DON'T ASK TWICE FOR WHAT THEY ALREADY GAVE US. A run that gives up part-way
// used to mean the next attempt re-fetched every tile that had already answered
// — asking a service we had just decided was struggling to redo its own work.
test('a re-run only asks about the tiles that are actually missing', async () => {
  const region = { bbox: { south: 38, west: -122, north: 38.7, east: -121.3 }, counties: [] };
  const tiles = bboxTiles(region.bbox);
  const cache = {
    [tileKey(tiles[0])]: { at: new Date().toISOString(), elements: [
      { type: 'node', id: 7, lat: 38.1, lon: -121.9, tags: { tourism: 'viewpoint', name: 'Already have this' } },
    ] },
  };
  const asked = [];
  const fetchFn = async (_u, opts) => {
    asked.push(decodeURIComponent(opts.body).match(/\[bbox:([^\]]+)\]/)[1]);
    return { ok: true, status: 200, json: async () => ({ elements: [] }) };
  };
  const out = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {}, cache });
  assert.equal(asked.length, tiles.length - 1, 'the cached tile is not requested again');
  assert.ok(out.some((r) => r.name === 'Already have this'), 'but its places are still in the result');
});

test('a stale cache entry is asked for again rather than trusted forever', () => {
  const tiles = bboxTiles({ south: 38, west: -122, north: 38.7, east: -121.3 });
  const old = new Date(Date.now() - 48 * 3600e3).toISOString();
  const { have, todo } = freshTiles({ [tileKey(tiles[0])]: { at: old } }, tiles);
  assert.equal(have.size, 0, 'two days old is not "we already have it"');
  assert.equal(todo.length, tiles.length);
});

// The scheduled sweep must be able to STOP: run until the region is complete,
// then stop, rather than firing forever against a region already built. These
// pin the four answers.
test('a finished region asks Overpass nothing on the next scheduled night', () => {
  const fp = 'abc';
  const now = new Date('2026-08-01T04:00:00Z');
  assert.equal(decide({ fingerprint: fp, completedAt: '2026-07-30T00:00:00Z' }, fp, { now }).action,
    'complete', 'two days after finishing there is nothing to ask for');
  assert.equal(decide({ fingerprint: fp, completedAt: '2026-06-22T00:00:00Z' }, fp, { now }).action,
    'refresh', 'but a month later OpenStreetMap has moved on');
});

test('changing what we ask for makes a finished region unfinished', () => {
  const done = { fingerprint: 'OLD', completedAt: '2026-07-30T00:00:00Z' };
  assert.equal(decide(done, 'NEW').action, 'run',
    'the old answer is not an answer to the new question — this is how three counties appeared');
});

test('it gives up rather than asking a volunteer service every night forever', () => {
  const fp = 'abc';
  assert.equal(decide({ fingerprint: fp, attempts: MAX_ATTEMPTS - 1 }, fp).action, 'run');
  assert.equal(decide({ fingerprint: fp, attempts: MAX_ATTEMPTS }, fp).action, 'exhausted');
});

test('the fingerprint notices the things that change the answer', () => {
  const base = { bbox: { south: 38, west: -122, north: 39.4, east: -119.8 } };
  const wider = { bbox: { south: 38, west: -122.5, north: 39.4, east: -119.8 } };
  assert.notEqual(fingerprint(base), fingerprint(wider), 'a different box is a different question');
  assert.notEqual(fingerprint(base), fingerprint(base, TAG_RULES.slice(0, 3)),
    'and so is asking for fewer kinds of place');
  assert.equal(fingerprint(base), fingerprint(base), 'but the same question is stable');
});

test('the run says where it got to, in words, without anyone reading a log', () => {
  assert.match(
    statusLine({ state: { completedAt: '2026-07-28T02:00:00Z' }, cachedTiles: 28, totalTiles: 28, spots: 3480 }),
    /^complete — 28 of 28 map tiles, 3,480 places$/);

  const partial = statusLine({ state: { attempts: 1 }, cachedTiles: 19, totalTiles: 28, spots: 2799 });
  assert.match(partial, /unfinished — 19 of 28 map tiles answered/);
  assert.match(partial, /carry on tomorrow night/,
    'an unfinished night is the design, not a failure — the sentence has to say so');

  assert.match(statusLine({ state: null, cachedTiles: 0, totalTiles: 28, spots: 2799 }),
    /^no tiles answered yet/, 'a night that got nothing must not read as progress');
});
