import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSpot, validateSpot, CATEGORIES } from '../src/model/spot.js';

const goodSource = {
  source: 'osm',
  source_id: 'node/1',
  source_license: 'ODbL-1.0',
  source_url: 'https://www.openstreetmap.org/node/1',
  first_seen: '2026-07-19',
  last_seen: '2026-07-19',
};

test('a well-formed spot validates clean', () => {
  const s = makeSpot({
    name: 'Test Vista', lat: 38.6, lng: -121.2, category: 'viewpoint',
    subject_type: ['landscape'], best_light: ['sunset'], best_season: ['fall'],
    sources: [goodSource],
  });
  assert.deepEqual(validateSpot(s), []);
});

test('provenance is mandatory — a spot with no sources fails', () => {
  const s = makeSpot({ lat: 38.6, lng: -121.2, category: 'viewpoint' });
  assert.ok(validateSpot(s).some((e) => e.includes('provenance')));
});

test('a source without a license fails — license tracking is structural', () => {
  const s = makeSpot({
    lat: 38.6, lng: -121.2, category: 'viewpoint',
    sources: [{ ...goodSource, source_license: undefined }],
  });
  assert.ok(validateSpot(s).some((e) => e.includes('source_license')));
});

test('unknown category and vocab values are rejected', () => {
  const s = makeSpot({
    lat: 38.6, lng: -121.2, category: 'instagram_spot',
    subject_type: ['selfies'], sources: [goodSource],
  });
  const errs = validateSpot(s);
  assert.ok(errs.some((e) => e.includes('bad category')));
  assert.ok(errs.some((e) => e.includes('subject_type')));
});

test('out-of-range coordinates are rejected', () => {
  const s = makeSpot({ lat: 138.6, lng: -321.2, category: 'viewpoint', sources: [goodSource] });
  const errs = validateSpot(s);
  assert.ok(errs.some((e) => e.includes('bad lat')));
  assert.ok(errs.some((e) => e.includes('bad lng')));
});

test('category vocabulary is exactly the nine agreed kinds', () => {
  assert.deepEqual(CATEGORIES, [
    'viewpoint', 'marker', 'oddity', 'park', 'trailhead',
    'campsite', 'wildlife_hotspot', 'dark_sky', 'user_pin',
  ]);
});
