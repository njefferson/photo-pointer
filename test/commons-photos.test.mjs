import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geosearchTile, tileCenters, harvestBBox, RADIUS_M, meta, harvestAroundSpots } from '../ingest/adapters/commons-photos.mjs';

test('geosearchTile returns {pageid,lat,lng} from the geosearch result', async () => {
  let url = null;
  const fetchFn = async (u) => {
    url = u;
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [
      { pageid: 1, lat: 38.6, lon: -121.3 }, { pageid: 2, lat: 38.61, lon: -121.31 },
    ] } }) };
  };
  const hits = await geosearchTile(38.6, -121.3, { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], { pageid: 1, lat: 38.6, lng: -121.3 });
  assert.match(url, /gsradius=10000/);
  assert.match(url, /gsnamespace=6/);
});

test('tileCenters covers the bbox with overlapping tiles', () => {
  const centers = tileCenters({ south: 38.0, west: -121.95, north: 39.4, east: -119.85 });
  assert.ok(centers.length > 50 && centers.length < 400, `got ${centers.length} tiles`);
  // every center is inside the bbox
  for (const c of centers) {
    assert.ok(c.lat >= 38.0 && c.lat <= 39.4 && c.lng >= -121.95 && c.lng <= -119.85);
  }
});

test('harvestBBox dedups photos across overlapping tiles by pageid', async () => {
  // Every tile returns the same two photos → dedup to 2 regardless of tile count.
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ query: { geosearch: [
    { pageid: 100, lat: 38.5, lon: -121.4 }, { pageid: 200, lat: 38.9, lon: -120.9 },
  ] } }) });
  const imgs = await harvestBBox({ south: 38.0, west: -121.95, north: 39.4, east: -119.85 },
    { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(imgs.length, 2);
  assert.deepEqual(imgs[0], { lat: 38.5, lng: -121.4 });
});

test('geosearchTile retries then throws on persistent failure', async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: false, status: 500 }; };
  await assert.rejects(() => geosearchTile(38, -121, { fetchFn, sleep: () => Promise.resolve() }), /commons geosearch/);
  assert.equal(calls, 4);
});

test('meta declares a keyless, count-only Commons source', () => {
  assert.equal(meta.source, 'wikimedia_commons');
  assert.equal(meta.status, 'working');
  assert.equal(RADIUS_M, 800);
});

// A sparse statewide region has far fewer spots than bbox tiles — probing the
// spots is then the cheap sweep, and tiling would blow the workflow timeout
// (California Ghost Towns: 205 spots vs 4,264 tiles, roughly three hours).
test('harvestAroundSpots probes each spot at the counting radius and dedups', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    // The same photo is in range of both spots — it must be counted once.
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [
      { pageid: 7, lat: 37.9, lon: -118.2 },
    ] } }) };
  };
  const spots = [{ lat: 37.9, lng: -118.2 }, { lat: 37.901, lng: -118.201 }];
  const out = await harvestAroundSpots(spots, { fetchFn, sleep: async () => {} });
  assert.equal(out.images.length, 1, 'the shared photo is deduped by pageid');
  assert.deepEqual(out.failed, []);
  assert.equal(urls.length, 2, 'one geosearch per spot');
  assert.ok(urls.every((u) => u.includes(`gsradius=${RADIUS_M}`)),
    'uses the 800 m counting radius, not the 10 km tile radius');
});

test('a failing spot probe is REPORTED, not silently treated as "no photos"', async () => {
  // geosearchTile retries, so the failing spot has to fail every attempt —
  // which is what a throttled runner IP actually looks like.
  const fetchFn = async (url) => {
    if (url.includes('gscoord=1%7C2')) throw new Error('network');
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [{ pageid: 1, lat: 3, lon: 4 }] } }) };
  };
  const out = await harvestAroundSpots([{ lat: 1, lng: 2, name: 'Bodie' }, { lat: 3, lng: 4 }], { fetchFn, sleep: async () => {} });
  assert.equal(out.images.length, 1);
  // The whole point: a place whose probe failed must be named, not quietly
  // reported as having no photos near it.
  assert.deepEqual(out.failed, ['Bodie']);
});
