import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nameSlug, nameSimilarity, dedupKey, isSamePlace, mergeSpots, resolveSpots,
} from '../src/model/dedup.js';

const src = (source, id, extra = {}) => ({
  source,
  source_id: id,
  source_license: 'test',
  source_url: null,
  first_seen: '2026-07-19',
  last_seen: '2026-07-19',
  ...extra,
});

test('nameSlug normalizes case, punctuation, diacritics, stopwords', () => {
  assert.equal(nameSlug("The Auburn Overlook"), 'auburn-overlook');
  assert.equal(nameSlug("Sutter's Mill"), 'sutter-s-mill');
  assert.equal(nameSlug('Cañón Vista'), 'canon-vista');
});

test('nameSimilarity is high for near-identical names, low for different places', () => {
  assert.ok(nameSimilarity('Auburn Overlook', 'The Auburn Overlook') >= 0.9);
  assert.ok(nameSimilarity('Folsom Lake Overlook', 'Auburn Dam Overlook') < 0.6);
});

test('same place from two sources collapses into one Spot with both provenances', () => {
  const a = {
    name: 'Auburn Overlook', lat: 38.9010, lng: -121.0700, category: 'viewpoint',
    subject_type: ['landscape'], best_light: [], best_season: [],
    access_difficulty: 'unknown', notes: null, tags: {},
    sources: [src('osm', 'node/1')],
  };
  const b = {
    name: 'The Auburn Overlook', lat: 38.9015, lng: -121.0705, category: 'marker',
    subject_type: ['historic'], best_light: [], best_season: [],
    access_difficulty: 'unknown', notes: null, tags: {},
    sources: [src('hmdb', '12345', { first_seen: '2026-01-01' })],
  };
  const out = resolveSpots([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sources.length, 2);
  // OSM outranks HMdb → OSM's name and category win.
  assert.equal(out[0].name, 'Auburn Overlook');
  assert.equal(out[0].category, 'viewpoint');
  // Photographer-intent unions.
  assert.deepEqual([...out[0].subject_type].sort(), ['historic', 'landscape']);
  // Earliest first_seen survives.
  const hmdb = out[0].sources.find((s) => s.source === 'hmdb');
  assert.equal(hmdb.first_seen, '2026-01-01');
});

test('nearby but differently-named places stay distinct', () => {
  const a = {
    name: 'Folsom Powerhouse', lat: 38.6800, lng: -121.1800, category: 'marker',
    sources: [src('osm', 'node/2')], tags: {},
  };
  const b = {
    name: 'Rainbow Bridge', lat: 38.6805, lng: -121.1810, category: 'viewpoint',
    sources: [src('osm', 'node/3')], tags: {},
  };
  assert.equal(resolveSpots([a, b]).length, 2);
});

test('unnamed records collapse only when nearly coincident and same category', () => {
  const a = { name: null, lat: 38.70000, lng: -121.10000, category: 'viewpoint', sources: [src('osm', 'node/4')], tags: {} };
  const near = { name: null, lat: 38.70020, lng: -121.10020, category: 'viewpoint', sources: [src('osm', 'node/5')], tags: {} };
  const far = { name: null, lat: 38.70200, lng: -121.10200, category: 'viewpoint', sources: [src('osm', 'node/6')], tags: {} };
  const otherCat = { name: null, lat: 38.70001, lng: -121.10001, category: 'campsite', sources: [src('osm', 'node/7')], tags: {} };
  assert.equal(resolveSpots([a, near]).length, 1);
  assert.equal(resolveSpots([a, far]).length, 2);
  assert.equal(resolveSpots([a, otherCat]).length, 2);
});

test('match works across a grid-cell boundary', () => {
  // 0.005° cells: put two records a few metres apart straddling a cell edge.
  const edge = 0.005 * Math.round(38.7 / 0.005) + 0.0025; // a cell boundary
  const a = { name: 'Edge Vista', lat: edge - 0.0001, lng: -121.2, category: 'viewpoint', sources: [src('osm', 'node/8')], tags: {} };
  const b = { name: 'Edge Vista', lat: edge + 0.0001, lng: -121.2, category: 'viewpoint', sources: [src('hmdb', '99')], tags: {} };
  assert.equal(resolveSpots([a, b]).length, 1);
});

test('dedupKey is stable and distinguishes named/unnamed', () => {
  const named = { name: 'Auburn Overlook', lat: 38.9010, lng: -121.0700, category: 'viewpoint' };
  assert.equal(dedupKey(named), dedupKey({ ...named }));
  assert.match(dedupKey(named), /^auburn-overlook@[0-9a-z]{6}$/);
  const unnamed = { name: null, lat: 38.9010, lng: -121.0700, category: 'viewpoint' };
  assert.match(dedupKey(unnamed), /^viewpoint@[0-9a-z]{7}$/);
});

test('resolveSpots is order-independent', () => {
  const recs = [
    { name: 'A Vista', lat: 38.8, lng: -121.3, category: 'viewpoint', sources: [src('osm', 'node/10')], tags: {} },
    { name: 'A Vista', lat: 38.8001, lng: -121.3001, category: 'viewpoint', sources: [src('flickr', 'p1')], tags: {} },
    { name: 'B Marker', lat: 38.9, lng: -121.4, category: 'marker', sources: [src('hmdb', '7')], tags: {} },
  ];
  const fwd = resolveSpots(recs).map((s) => s.id);
  const rev = resolveSpots([...recs].reverse()).map((s) => s.id);
  assert.deepEqual(fwd, rev);
});

test('mergeSpots unions sources without duplicating the same record', () => {
  const a = { name: 'X', lat: 1, lng: 1, category: 'park', sources: [src('osm', 'way/1')], tags: {} };
  const merged = mergeSpots(a, { ...a, sources: [src('osm', 'way/1', { last_seen: '2026-08-01' })] });
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.sources[0].last_seen, '2026-08-01');
});

test('distinct places that collide on a dedup key get unique ids', () => {
  // Two different markers, same name, ~300 m apart (same geohash6 cell but
  // beyond MATCH_DIST_M) — must stay separate AND end up with unique ids.
  // These two share geohash6 cell 9qcgd5 but are 278 m apart (> MATCH_DIST_M).
  const a = { name: 'Sportsmans Hall Landmark', lat: 38.6006, lng: -121.2000, category: 'marker', sources: [src('osm', 'node/100')], tags: {} };
  const b = { name: 'Sportsmans Hall Landmark', lat: 38.6031, lng: -121.2000, category: 'marker', sources: [src('osm', 'node/101')], tags: {} };
  const out = resolveSpots([a, b]);
  assert.equal(out.length, 2, 'two distinct places stay separate');
  assert.equal(new Set(out.map((s) => s.id)).size, 2, 'ids are unique');
  // One keeps the clean base key; the other is suffixed.
  assert.ok(out.some((s) => !s.id.includes('~')));
  assert.ok(out.some((s) => s.id.includes('~')));
});

test('dedup-key disambiguation is order-independent', () => {
  const a = { name: 'Twin Oaks', lat: 38.6006, lng: -121.2000, category: 'viewpoint', sources: [src('osm', 'node/200')], tags: {} };
  const b = { name: 'Twin Oaks', lat: 38.6031, lng: -121.2000, category: 'viewpoint', sources: [src('osm', 'node/201')], tags: {} };
  const fwd = resolveSpots([a, b]).map((s) => s.id).sort();
  const rev = resolveSpots([b, a]).map((s) => s.id).sort();
  assert.deepEqual(fwd, rev);
});

test('isSamePlace requires name agreement for named pairs', () => {
  const a = { name: 'North Table Vista', lat: 38.75, lng: -121.25, category: 'viewpoint' };
  const b = { name: 'Completely Different Spot', lat: 38.75, lng: -121.25, category: 'viewpoint' };
  assert.equal(isSamePlace(a, b), false);
});
