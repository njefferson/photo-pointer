import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, geohash, inBBox } from '../src/model/geo.js';

test('geohash matches the canonical published vector', () => {
  // Wikipedia's worked example: (42.605, -5.603) -> ezs42
  assert.equal(geohash(42.605, -5.603, 5), 'ezs42');
});

test('geohash precision extends the same prefix', () => {
  const g6 = geohash(38.5816, -121.4944, 6);
  const g7 = geohash(38.5816, -121.4944, 7);
  assert.equal(g7.slice(0, 6), g6);
  assert.equal(g6.length, 6);
});

test('haversine: one degree of longitude at the equator ≈ 111.19 km', () => {
  const d = distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(d - 111195) < 200, `got ${d}`);
});

test('haversine: zero distance for identical points', () => {
  assert.equal(distanceM({ lat: 38.6, lng: -121.5 }, { lat: 38.6, lng: -121.5 }), 0);
});

test('inBBox', () => {
  const bbox = { south: 38, west: -122, north: 39.4, east: -119.85 };
  assert.ok(inBBox(38.58, -121.49, bbox)); // Sacramento
  assert.ok(!inBBox(37.0, -121.49, bbox)); // south of region
});
