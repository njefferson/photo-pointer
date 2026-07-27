import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, normalizeElement, TAG_RULES, meta, ingest, OVERPASS_GAP_MS } from '../ingest/adapters/osm-overpass.mjs';
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

test('buildQuery names every county area and carries the bbox guard', () => {
  const q = buildQuery(region);
  assert.match(q, /Sacramento County/);
  assert.match(q, /\[bbox:38,-121\.95,39\.4,-119\.85\]/);
  assert.match(q, /out center tags/);
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

// ONE QUERY PER COUNTY. Asking for all of them at once was fine at three
// counties and fell over at six: nineteen minutes of retries across all three
// mirrors, ending in HTTP 504. Overpass bills by how much work one query does,
// so the fix is smaller questions rather than more patience.
test('one Overpass query per county, not one for the whole region', async () => {
  const region = {
    bbox: { south: 38, west: -122, north: 39.4, east: -119.8 },
    counties: [
      { osm_area_name: 'Sacramento County' },
      { osm_area_name: 'Calaveras County' },
      { osm_area_name: 'Nevada County' },
    ],
  };
  const bodies = [];
  const fetchFn = async (_url, opts) => {
    bodies.push(decodeURIComponent(opts.body.replace(/^data=/, '')));
    return { ok: true, status: 200, json: async () => ({ elements: [] }) };
  };
  await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} });
  assert.equal(bodies.length, 3, 'three counties, three queries');
  for (const [i, c] of region.counties.entries()) {
    assert.ok(bodies[i].includes(`"name"="${c.osm_area_name}"`), c.osm_area_name);
    const named = bodies[i].match(/admin_level"="6"/g) ?? [];
    assert.equal(named.length, 1, 'each query asks about exactly one county');
  }
});

test('an element on a county line is counted once, not twice', async () => {
  const region = { bbox: { south: 38, west: -122, north: 39.4, east: -119.8 },
    counties: [{ osm_area_name: 'A' }, { osm_area_name: 'B' }] };
  const el = { type: 'node', id: 42, lat: 38.5, lon: -121, tags: { tourism: 'viewpoint', name: 'On the line' } };
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ elements: [el] }) });
  const out = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} });
  assert.equal(out.length, 1, 'both counties returned it; it is one place');
});

// A county that will not answer is not a county with no places in it.
test('a failing county is named and the rest of the region still lands', async () => {
  const region = { bbox: { south: 38, west: -122, north: 39.4, east: -119.8 },
    counties: [{ osm_area_name: 'Good' }, { osm_area_name: 'Broken' }] };
  const fetchFn = async (_url, opts) => {
    const body = decodeURIComponent(opts.body);
    if (body.includes('"name"="Broken"')) return { ok: false, status: 504 };
    return { ok: true, status: 200, json: async () => ({ elements: [
      { type: 'node', id: 1, lat: 38.5, lon: -121, tags: { tourism: 'viewpoint', name: 'Kept' } },
    ] }) };
  };
  const out = await ingest(region, { fetchFn, today: '2026-07-27', sleepFn: async () => {} });
  assert.equal(out.length, 1, 'the county that answered is not thrown away');
  assert.equal(out.failedCounties.length, 1);
  assert.match(out.failedCounties[0], /Broken/, 'and the one that failed is named, not silently zero');
});
