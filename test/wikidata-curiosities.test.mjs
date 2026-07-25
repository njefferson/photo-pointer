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
    cls: { value: 'http://www.wikidata.org/entity/Q5153359' },   // ghost town
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
