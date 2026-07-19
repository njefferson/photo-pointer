import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHotspot, meta } from '../ingest/adapters/ebird-hotspots.mjs';
import { validateSpot, makeSpot } from '../src/model/spot.js';

test('a hotspot row normalizes to a valid wildlife_hotspot Spot', () => {
  const rec = normalizeHotspot(
    { locId: 'L656782', name: 'Cosumnes River Preserve', lat: 38.2658, lng: -121.4395, nSpecies: 270, county: 'US-CA-067' },
    '2026-07-19'
  );
  assert.equal(rec.category, 'wildlife_hotspot');
  assert.equal(rec.name, 'Cosumnes River Preserve');
  assert.deepEqual(rec.subject_type, ['birds', 'wildlife']);
  assert.equal(rec.sources[0].source, 'ebird');
  assert.equal(rec.sources[0].source_id, 'L656782');
  assert.match(rec.sources[0].source_url, /ebird\.org\/hotspot\/L656782/);
  assert.equal(rec.tags.ebird_species, 270);
  assert.deepEqual(validateSpot(makeSpot(rec)), []);
});

test('rows without coordinates or locId are dropped', () => {
  assert.equal(normalizeHotspot({ locId: 'L1', name: 'x' }, '2026-07-19'), null);
  assert.equal(normalizeHotspot({ name: 'x', lat: 38, lng: -121 }, '2026-07-19'), null);
});

test('adapter declares eBird attribution and no-bulk-redistribution terms', () => {
  assert.match(meta.attribution, /eBird/);
  assert.match(meta.license, /no bulk redistribution/);
  assert.equal(meta.status, 'working');
});
