import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refineCategory } from '../src/model/notability.js';

test('refineCategory splits oddity by curiosity kind', () => {
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Ghost town' } }).category, 'ghost_town');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Waterfall' } }).category, 'waterfall');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Hot spring' } }).category, 'hot_spring');
  assert.equal(refineCategory({ category: 'oddity', tags: { curiosity: 'Lighthouse' } }).category, 'lighthouse');
});

test('refineCategory maps OSM ruins/mines to ruins', () => {
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'ruins' } }).category, 'ruins');
  assert.equal(refineCategory({ category: 'oddity', tags: { historic: 'mine' } }).category, 'ruins');
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
  // OSM ruins mapping only fires from the oddity bucket, not from markers.
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
