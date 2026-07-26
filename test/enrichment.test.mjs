import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEnrichment, enrichSpots, loadEnrichment } from '../src/model/enrichment.js';
import { readFileSync } from 'node:fs';

const base = () => ({ id: 'x@1', name: 'A Place', lat: 39, lng: -121, category: 'park',
  subject_type: [], best_light: [], best_season: [], access_difficulty: 'unknown', notes: null, tags: {} });

test('enrichment fills gaps on a bare spot', () => {
  const out = applyEnrichment(base(), {
    notes: 'Look down at the flat rock.', best_light: ['golden_hour'],
    access_difficulty: 'short_walk', subject_type: ['historic'],
    link: 'https://example.gov/park', link_label: 'Official page',
  });
  assert.equal(out.notes, 'Look down at the flat rock.');
  assert.deepEqual(out.best_light, ['golden_hour']);
  assert.equal(out.access_difficulty, 'short_walk');
  assert.deepEqual(out.subject_type, ['historic']);
  assert.equal(out.tags.curatedLink, 'https://example.gov/park');
});

test('enrichment NEVER overwrites what the ingest already provides', () => {
  const rich = { ...base(), notes: 'from the source', best_light: ['sunset'],
    access_difficulty: 'hike', subject_type: ['landscape'] };
  const out = applyEnrichment(rich, {
    notes: 'hand-written', best_light: ['golden_hour'],
    access_difficulty: 'roadside', subject_type: ['historic'],
  });
  assert.equal(out.notes, 'from the source');
  assert.deepEqual(out.best_light, ['sunset']);
  assert.equal(out.access_difficulty, 'hike');
  assert.deepEqual(out.subject_type, ['landscape']);
});

test('unknown vocabulary in the curated file is dropped, not written onto a spot', () => {
  const out = applyEnrichment(base(), {
    best_light: ['dawn', 'golden_hour'],      // 'dawn' is not in the LIGHT enum
    subject_type: ['historic', 'nonsense'],
    access_difficulty: 'teleport',
  });
  assert.deepEqual(out.best_light, ['golden_hour']);
  assert.deepEqual(out.subject_type, ['historic']);
  assert.equal(out.access_difficulty, 'unknown'); // rejected → untouched
});

test('a non-https link is refused', () => {
  const out = applyEnrichment(base(), { link: 'http://insecure.example/x' });
  assert.equal(out.tags?.curatedLink, undefined);
});

test('a spot with no entry is returned untouched (same reference)', () => {
  const s = base();
  assert.equal(applyEnrichment(s, undefined), s);
  assert.equal(applyEnrichment(s, null), s);
  const list = [s];
  assert.equal(enrichSpots(list, {}), list);
});

test('enrichSpots applies entries by spot id', () => {
  const spots = [base(), { ...base(), id: 'y@2' }];
  const out = enrichSpots(spots, { 'y@2': { notes: 'only this one' } });
  assert.equal(out[0].notes, null);
  assert.equal(out[1].notes, 'only this one');
});

test('loadEnrichment fails soft when the file is missing or bad', async () => {
  assert.deepEqual(await loadEnrichment(async () => ({ ok: false }), './nope-a.json'), {});
  assert.deepEqual(await loadEnrichment(async () => { throw new Error('offline'); }, './nope-b.json'), {});
});

test('the shipped curated file is valid and its entries apply cleanly', () => {
  const doc = JSON.parse(readFileSync('./data/curated/enrichment.json', 'utf8'));
  assert.ok(doc.spots && typeof doc.spots === 'object');
  for (const [id, entry] of Object.entries(doc.spots)) {
    assert.ok(id.length, 'every entry needs a spot id');
    const out = applyEnrichment(base(), entry);
    // Whatever the entry claims must survive validation into real fields.
    if (entry.notes) assert.equal(typeof out.notes, 'string');
    if (entry.link) assert.match(entry.link, /^https:\/\//);
    if (entry.best_light) assert.ok(out.best_light.length, `bad best_light in ${id}`);
    if (entry.access_difficulty) assert.notEqual(out.access_difficulty, 'unknown', `bad access in ${id}`);
  }
});
