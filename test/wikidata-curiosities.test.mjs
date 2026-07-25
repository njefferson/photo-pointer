import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, parsePoint, normalizeBinding, CURIOSITY_CLASSES } from '../ingest/adapters/wikidata-curiosities.mjs';

const REGION = { bbox: { south: 38, west: -121.95, north: 39.4, east: -119.85 } };

test('buildQuery bounds the box and lists every curiosity class', () => {
  const q = buildQuery(REGION);
  assert.match(q, /cornerSouthWest "Point\(-121.95 38\)"/);
  assert.match(q, /cornerNorthEast "Point\(-119.85 39.4\)"/);
  for (const c of CURIOSITY_CLASSES) assert.ok(q.includes(`wd:${c.qid}`), `query includes ${c.qid}`);
  assert.match(q, /wdt:P31\/wdt:P279\*/); // instance-or-subclass
  assert.match(q, /schema:isPartOf <https:\/\/en\.wikipedia\.org\/>/); // pulls the Wikipedia article
});

test('parsePoint reads WKT lon-lat order', () => {
  assert.deepEqual(parsePoint('Point(-119.013 38.212)'), { lng: -119.013, lat: 38.212 });
  assert.equal(parsePoint('nope'), null);
});

test('normalizeBinding builds an oddity spot with kind + wikipedia link', () => {
  const row = {
    item: { value: 'http://www.wikidata.org/entity/Q808558' },   // Bodie
    itemLabel: { value: 'Bodie' },
    coord: { value: 'Point(-119.0125 38.2121)' },
    cls: { value: 'http://www.wikidata.org/entity/Q74047' },   // ghost town
    article: { value: 'https://en.wikipedia.org/wiki/Bodie,_California' },
  };
  const rec = normalizeBinding(row, '2026-07-25');
  assert.equal(rec.name, 'Bodie');
  assert.equal(rec.category, 'oddity');
  assert.equal(rec.tags.curiosity, 'Ghost town');
  assert.equal(rec.tags.wikidata, 'Q808558');
  assert.equal(rec.tags.wikipedia, 'https://en.wikipedia.org/wiki/Bodie,_California');
  assert.equal(rec.sources[0].source, 'wikidata');
  assert.equal(rec.sources[0].source_license, 'CC0-1.0');
  assert.equal(rec.sources[0].source_url, 'https://en.wikipedia.org/wiki/Bodie,_California');
});

test('normalizeBinding drops unnamed items and bad coords', () => {
  const noName = { item: { value: '.../Q1' }, itemLabel: { value: 'Q1' }, coord: { value: 'Point(-119 38)' }, cls: { value: '.../Q34038' } };
  assert.equal(normalizeBinding(noName, '2026-07-25'), null);
  const noCoord = { item: { value: '.../Q2' }, itemLabel: { value: 'Falls' }, coord: { value: '' }, cls: { value: '.../Q34038' } };
  assert.equal(normalizeBinding(noCoord, '2026-07-25'), null);
});

test('unknown class falls back to a generic kind', () => {
  const row = { item: { value: '.../Q9' }, itemLabel: { value: 'Thing' }, coord: { value: 'Point(-120 39)' }, cls: { value: '.../Q999999' } };
  assert.equal(normalizeBinding(row, '2026-07-25').tags.curiosity, 'Curiosity');
});

// ---- Source #2: OSM feature tags carry a curiosity kind (osm-overpass adapter) ----
import { normalizeElement } from '../ingest/adapters/osm-overpass.mjs';
import { refineCategory } from '../src/model/notability.js';

test('OSM feature tags produce a curiosity kind that refineCategory reclassifies', () => {
  const falls = normalizeElement({ type: 'node', id: 1, lat: 39, lon: -120, tags: { natural: 'waterfall', name: 'Hidden Falls' } }, '2026-07-25');
  assert.equal(falls.tags.curiosity, 'Waterfall');
  assert.equal(refineCategory(falls).category, 'waterfall');

  const spring = normalizeElement({ type: 'node', id: 2, lat: 44, lon: -110, tags: { natural: 'hot_spring', name: 'Boiling Spring' } }, '2026-07-25');
  assert.equal(refineCategory(spring).category, 'hot_spring');

  const geyser = normalizeElement({ type: 'node', id: 3, lat: 44, lon: -110, tags: { natural: 'geyser', name: 'Old Faithful' } }, '2026-07-25');
  assert.equal(refineCategory(geyser).category, 'hot_spring'); // geysers filter as hot springs

  const arch = normalizeElement({ type: 'node', id: 4, lat: 37, lon: -111, tags: { natural: 'arch', name: 'Stone Arch' } }, '2026-07-25');
  assert.equal(arch.tags.curiosity, 'Natural arch');
  assert.equal(refineCategory(arch).category, 'arch'); // now its own pin type

  const dig = normalizeElement({ type: 'node', id: 5, lat: 37, lon: -111, tags: { historic: 'archaeological_site', name: 'Old Village' } }, '2026-07-25');
  assert.equal(refineCategory(dig).category, 'archaeological'); // NOT "ruins & mines"
});

test('unnamed OSM feature nodes are skipped (namedOnly)', () => {
  assert.equal(normalizeElement({ type: 'node', id: 6, lat: 39, lon: -120, tags: { natural: 'waterfall' } }, '2026-07-25'), null);
});
