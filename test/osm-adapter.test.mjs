import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, normalizeElement, TAG_RULES, meta } from '../ingest/adapters/osm-overpass.mjs';
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
