import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArea, buildQuery, meta } from '../ingest/adapters/public-lands.mjs';
import { pointInRing, pointInArea } from '../src/model/geo.js';

test('point-in-ring works for a simple square', () => {
  const sq = [[0, 0], [0, 2], [2, 2], [2, 0]]; // lat,lng
  assert.equal(pointInRing(1, 1, sq), true);
  assert.equal(pointInRing(3, 1, sq), false);
});

test('pointInArea rejects fast via bbox then tests rings', () => {
  const area = { bbox: { south: 0, west: 0, north: 2, east: 2 }, rings: [[[0, 0], [0, 2], [2, 2], [2, 0]]] };
  assert.equal(pointInArea(1, 1, area), true);
  assert.equal(pointInArea(5, 5, area), false); // bbox reject
});

test('normalizeArea builds rings + bbox from an OSM way', () => {
  const el = {
    type: 'way', id: 5, tags: { name: 'Test Preserve', leisure: 'nature_reserve' },
    geometry: [{ lat: 38.6, lon: -121.3 }, { lat: 38.6, lon: -121.2 }, { lat: 38.7, lon: -121.2 }, { lat: 38.7, lon: -121.3 }],
  };
  const a = normalizeArea(el);
  assert.equal(a.name, 'Test Preserve');
  assert.equal(a.class, 'nature_reserve');
  assert.equal(a.rings.length, 1);
  assert.deepEqual(a.bbox, { south: 38.6, west: -121.3, north: 38.7, east: -121.2 });
  assert.equal(pointInArea(38.65, -121.25, a), true);
});

test('normalizeArea assembles relation member ways into rings', () => {
  const el = {
    type: 'relation', id: 9, tags: { name: 'Big Forest', boundary: 'protected_area', protect_class: '6' },
    members: [
      { type: 'way', role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 0 }] },
      { type: 'node', role: 'admin_centre' },
    ],
  };
  const a = normalizeArea(el);
  assert.equal(a.rings.length, 1);
  assert.equal(a.class, '6');
});

test('degenerate geometry is dropped', () => {
  assert.equal(normalizeArea({ type: 'way', id: 1, geometry: [{ lat: 0, lon: 0 }] }), null);
});

test('query names the counties and requests geometry; adapter declares ODbL', () => {
  const q = buildQuery({ bbox: { south: 38, west: -122, north: 39.4, east: -119.85 }, counties: [{ osm_area_name: 'Placer County' }] });
  assert.match(q, /Placer County/);
  assert.match(q, /out geom/);
  assert.match(q, /protected_area/);
  assert.equal(meta.license, 'ODbL-1.0');
});
