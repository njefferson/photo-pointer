import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPhotosNear, RADIUS_M, GS_LIMIT, meta } from '../ingest/adapters/commons-photos.mjs';

test('countPhotosNear returns the geosearch result count', async () => {
  let calledUrl = null;
  const fetchFn = async (url) => {
    calledUrl = url;
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [{ pageid: 1 }, { pageid: 2 }, { pageid: 3 }] } }) };
  };
  const r = await countPhotosNear(38.9, -120.1, { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(r.photos, 3);
  assert.equal(r.capped, false);
  assert.match(calledUrl, /gsradius=800/);
  assert.match(calledUrl, /gsnamespace=6/);
  assert.match(calledUrl, /gscoord=38\.9%7C-120\.1/);
});

test('countPhotosNear flags a capped (gslimit-hit) result', async () => {
  const full = { query: { geosearch: Array.from({ length: GS_LIMIT }, (_, i) => ({ pageid: i })) } };
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => full });
  const r = await countPhotosNear(38, -121, { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(r.photos, GS_LIMIT);
  assert.equal(r.capped, true);
});

test('countPhotosNear retries then throws on persistent failure', async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: false, status: 500 }; };
  await assert.rejects(
    () => countPhotosNear(38, -121, { fetchFn, sleep: () => Promise.resolve() }),
    /commons geosearch/
  );
  assert.equal(calls, 3);
});

test('meta declares a keyless, count-only Commons source', () => {
  assert.equal(meta.source, 'wikimedia_commons');
  assert.equal(meta.status, 'working');
  assert.equal(RADIUS_M, 800);
});
