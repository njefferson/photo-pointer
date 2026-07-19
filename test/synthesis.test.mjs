import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, scoreSpot, rankSpots, SIGNALS } from '../src/model/synthesis.js';

const src = (source, id) => ({ source, source_id: id, source_license: 't', first_seen: '2026-07-19', last_seen: '2026-07-19' });

// A small hand-built world near Sacramento.
const spots = [
  { id: 'a', name: 'Overlook Park Preserve', lat: 38.60, lng: -121.20, category: 'park',
    subject_type: ['landscape', 'birds', 'wildlife'], access_difficulty: 'short_walk',
    tags: {}, sources: [src('osm', 'w1'), src('ebird', 'L1')] },
  { id: 'b', name: 'Lone Marker', lat: 38.90, lng: -121.90, category: 'marker',
    subject_type: ['historic'], access_difficulty: 'roadside', tags: {}, sources: [src('osm', 'n2')] },
  { id: 'c', name: 'Cosumnes Hotspot', lat: 38.601, lng: -121.201, category: 'wildlife_hotspot',
    subject_type: ['birds', 'wildlife'], access_difficulty: 'unknown',
    tags: { ebird_species: 270 }, sources: [src('ebird', 'L2')] },
  { id: 'd', name: 'Cliff Viewpoint', lat: 38.70, lng: -121.30, category: 'viewpoint',
    subject_type: ['landscape'], access_difficulty: 'hike', tags: { direction: 'W' }, sources: [src('osm', 'n3')] },
];

test('a multi-source, multi-subject place outscores a lone single-source one', () => {
  const ranked = rankSpots(spots);
  const byId = Object.fromEntries(ranked.map((r) => [r.spot.id, r.score]));
  assert.ok(byId['a'] > byId['b'], 'layered park beats lone marker');
});

test('the breakdown explains WHY, layer by layer', () => {
  const ctx = buildContext(spots);
  const park = scoreSpot(spots[0], ctx);
  const keys = park.parts.map((p) => p.key);
  assert.ok(keys.includes('layered'), 'credits the layering');
  assert.ok(keys.includes('wildlife'), 'credits the adjacent hotspot');
  // The park sits ~140 m from the hotspot → wildlife signal fires by proximity.
  const wildlife = park.parts.find((p) => p.key === 'wildlife');
  assert.match(wildlife.note, /km away/);
});

test('a hotspot scores its own species richness', () => {
  const ctx = buildContext(spots);
  const hot = scoreSpot(spots[2], ctx);
  const w = hot.parts.find((p) => p.key === 'wildlife');
  assert.match(w.note, /270 species/);
});

test('a viewpoint that faces a known direction gets the golden-hour signal with a compass note', () => {
  const ctx = buildContext(spots);
  const view = scoreSpot(spots[3], ctx);
  const v = view.parts.find((p) => p.key === 'view');
  assert.ok(v, 'view signal fires');
  assert.match(v.note, /evening light from the [NSEW]/);
});

test('unknown access does not penalize (signal absent, not zero)', () => {
  const ctx = buildContext(spots);
  const hot = scoreSpot(spots[2], ctx); // access_difficulty unknown
  assert.ok(!hot.parts.some((p) => p.key === 'access'));
});

// THE EXTENSIBILITY CONTRACT: the darkSky signal is dormant until a source
// writes tags.bortle — then it lights up with NO change to the scorer.
test('the dark-sky signal is dormant with no data and activates when tags.bortle appears', () => {
  const ctx = buildContext(spots);
  const before = scoreSpot(spots[3], ctx);
  assert.ok(!before.parts.some((p) => p.key === 'darkSky'), 'dormant without data');

  const withDark = { ...spots[3], tags: { ...spots[3].tags, bortle: 3 } };
  const ctx2 = buildContext([withDark]);
  const after = scoreSpot(withDark, ctx2);
  const dark = after.parts.find((p) => p.key === 'darkSky');
  assert.ok(dark, 'activates once its data source lands');
  assert.match(dark.note, /Bortle 3/);
});

// Same plug-in contract for the measured horizon: dormant until the terrain
// ingest writes tags.horizon, then it scores with NO change to the scorer.
test('the open-horizon signal is dormant with no data and activates on tags.horizon', () => {
  const ctx = buildContext(spots);
  const before = scoreSpot(spots[3], ctx);
  assert.ok(!before.parts.some((p) => p.key === 'openHorizon'), 'dormant without data');

  const withHorizon = { ...spots[3], tags: { ...spots[3].tags, horizon: { open: 0.9, e: 0.5, w: 1.2 } } };
  const ctx2 = buildContext([withHorizon]);
  const after = scoreSpot(withHorizon, ctx2);
  const oh = after.parts.find((p) => p.key === 'openHorizon');
  assert.ok(oh, 'activates once its data source lands');
  assert.equal(oh.value, 0.9);
  assert.match(oh.note, /wide open/);
});

test('cross-layer require: "dark AND open view" filters to spots satisfying both', () => {
  const world = [
    { ...spots[3], id: 'darkview', tags: { direction: 'W', bortle: 3 } }, // view + dark
    { ...spots[3], id: 'brightview', tags: { direction: 'W' } },          // view only
    { ...spots[2], id: 'darkonly', tags: { ebird_species: 5, bortle: 2 } }, // wildlife + dark, not a view
  ];
  const ranked = rankSpots(world, { require: ['darkSky', 'view'] });
  const ids = ranked.map((r) => r.spot.id);
  assert.deepEqual(ids, ['darkview'], 'only the dark open viewpoint qualifies');
});

test('rankSpots respects a category filter and a limit', () => {
  const ranked = rankSpots(spots, { categories: ['park', 'viewpoint'], limit: 1 });
  assert.equal(ranked.length, 1);
  assert.ok(['park', 'viewpoint'].includes(ranked[0].spot.category));
});

test('every signal has the required shape', () => {
  for (const s of SIGNALS) {
    assert.ok(s.key && s.label && typeof s.weight === 'number' && typeof s.evaluate === 'function');
  }
});
