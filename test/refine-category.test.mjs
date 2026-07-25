import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refineCategory } from '../src/model/notability.js';

test('refineCategory splits oddity by curiosity kind', () => {
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Ghost town' } }).category, 'ghost_town');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Waterfall' } }).category, 'waterfall');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Hot spring' } }).category, 'hot_spring');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Lighthouse' } }).category, 'lighthouse');
});

test('refineCategory maps OSM ruins to ruins and mines to their own type', () => {
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'ruins' } }).category, 'ruins');
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'mine' } }).category, 'mine');
});

test('refineCategory leaves the catch-all kinds as oddity', () => {
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Roadside attraction' } }).category, 'oddity');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Balloon festival' } }).category, 'oddity');
  assert.equal(refineCategory({ category: 'oddity', tags: {} }).category, 'oddity');
});

test('a curiosity kind wins even when the spot deduped into another category', () => {
  // A waterfall that merged into an OSM viewpoint still filters as a Waterfall.
  assert.equal(refineCategory({ category: 'viewpoint', tags: { curiosity: 'Waterfall' } }).category, 'waterfall');
});

test('refineCategory leaves non-oddity spots without a curiosity kind alone', () => {
  const p = { category: 'park', tags: {} };
  assert.equal(refineCategory(p), p); // same reference, no copy
  // A raw OSM tag only refines the BROAD buckets — it must not hijack a spot
  // that already makes a specific claim (a marker that merged with a ruins node).
  assert.equal(refineCategory({ category: 'marker', tags: { historic: 'ruins' } }).category, 'marker');
});

test('refineCategory maps OSM-native feature tags even without a curiosity kind', () => {
  // Old Faithful: natural=geyser + tourism=attraction → matched the generic
  // oddity rule at ingest (no curiosity kind), but still becomes a Hot spring.
  assert.equal(refineCategory({ category: 'oddity', tags: { natural: 'geyser', tourism: 'attraction' } }).category, 'hot_spring');
  assert.equal(refineCategory({ category: 'oddity', tags: { natural: 'hot_spring' } }).category, 'hot_spring');
  assert.equal(refineCategory({ category: 'viewpoint', tags: { natural: 'waterfall' } }).category, 'waterfall');
  assert.equal(refineCategory({ category: 'oddity', tags: { man_made: 'lighthouse' } }).category, 'lighthouse');
  // A curiosity kind still takes precedence over the raw tag.
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Ghost town', natural: 'hot_spring' } }).category, 'ghost_town');
});

test('refineCategory splits the big over-collapsed buckets', () => {
  // A named PEAK is a summit, not a generic "viewpoint" (1,283 of these).
  assert.equal(refineCategory({ category: 'viewpoint', tags: { natural: 'peak' } }).category, 'summit');
  // A nature reserve is not a city park.
  assert.equal(refineCategory({ category: 'park', tags: { leisure: 'nature_reserve' } }).category, 'nature_reserve');
  // A mural/sculpture is art, not an "oddity".
  assert.equal(refineCategory({ category: 'oddity', tags: { tourism: 'artwork' } }).category, 'public_art');
});

test('refineCategory gives archaeological sites their own type, NOT "ruins"', () => {
  // Native cultural sites (e.g. bedrock grinding mortars) must not read as
  // "Ruins & mines" — that is both inaccurate and a poor label for the place.
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'archaeological_site' } }).category, 'archaeological');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Archaeological site' } }).category, 'archaeological');
  // Mines split from ruins too.
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'mine' } }).category, 'mine');
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'ruins' } }).category, 'ruins');
});

test('refineCategory handles the long tail of curiosity kinds', () => {
  const k = (kind) => refineCategory({ category: 'oddity', tags: { curiosity: kind } }).category;
  assert.equal(k('Cave'), 'cave');
  assert.equal(k('Natural arch'), 'arch');
  assert.equal(k('Observation tower'), 'lookout_tower');
  assert.equal(k('Shipwreck'), 'shipwreck');
  assert.equal(k('Land art'), 'public_art');
  assert.equal(refineCategory({ category: 'oddity', tags: { natural: 'tree' } }).category, 'notable_tree');
  // The quirky catch-all stays exactly that.
  assert.equal(k('Roadside attraction'), 'oddity');
});

test('refineCategory never reclassifies events or the user’s own pins', () => {
  const ev = { category: 'event', tags: { event: {}, natural: 'peak' } };
  assert.equal(refineCategory(ev), ev);
  const pin = { category: 'user_pin', tags: { natural: 'peak' } };
  assert.equal(refineCategory(pin), pin);
});
