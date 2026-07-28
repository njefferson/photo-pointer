import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { deriveUrl, expandSource, expandSources, URL_PATTERNS } from '../src/model/sources.js';

test('a stored value always wins, so a full file survives untouched', () => {
  const stored = {
    source: 'osm',
    source_id: 'node/1',
    source_license: 'ODbL-1.0',
    source_url: 'https://example.invalid/hand-written',
  };
  assert.deepEqual(expandSource(stored, { osm: 'SOMETHING ELSE' }), stored,
    'expanding must never overwrite what the file already says — this is what lets '
    + 'the app ship before the ingest changes shape');
});

test('what the lean file leaves out comes back', () => {
  const lean = { source: 'ebird', source_id: 'L123' };
  const out = expandSource(lean, { ebird: 'eBird API Terms of Use' });
  assert.equal(out.source_license, 'eBird API Terms of Use', 'the licence is still stated');
  assert.equal(out.source_url, 'https://ebird.org/hotspot/L123');
});

test('a source with no derivable link shape yields null, never a guess', () => {
  assert.equal(URL_PATTERNS.wikidata, null,
    'a Wikidata link is a Wikipedia ARTICLE TITLE — a QID cannot produce it');
  assert.equal(deriveUrl('wikidata', 'Q4741743'), null);
  assert.equal(deriveUrl('nrhp', ''), null, 'an empty id must not build a URL to nowhere');
  assert.equal(deriveUrl('nrhp', null), null);
  assert.equal(deriveUrl('nrhp', '84000929'), 'https://npgallery.nps.gov/AssetDetail/NRIS/84000929');
  assert.equal(deriveUrl('nrhp', '100008586'), null,
    'a 9-digit National Register id has no NPGallery page — it must not be guessed');
  assert.equal(deriveUrl('something-new', '7'), null, 'an unknown source is not guessed at');
});

test('expandSources leaves a spot without sources alone', () => {
  const spots = [{ id: 'a' }, { id: 'b', sources: [] }];
  assert.deepEqual(expandSources(spots, {}), spots);
  assert.deepEqual(expandSources(null, {}), []);
});

// THE GATE. Every link we can rebuild must rebuild BYTE-IDENTICALLY against the
// real shipped data. If a source changes its URL shape, this fails here rather
// than shipping a card whose "View on …" link is silently wrong.
test('every derivable link rebuilds exactly, on the real regions', () => {
  let checked = 0;
  const wrong = [];
  const kept = new Map();

  for (const file of readdirSync('data/regions')) {
    const doc = JSON.parse(readFileSync(`data/regions/${file}`, 'utf8'));
    for (const spot of doc.spots ?? []) {
      for (const e of spot.sources ?? []) {
        if (!e.source_url) continue;
        const built = deriveUrl(e.source, e.source_id);
        if (built === null) { kept.set(e.source, (kept.get(e.source) ?? 0) + 1); continue; }
        checked++;
        if (built !== e.source_url) wrong.push(`${file} ${e.source} ${e.source_id}\n  want ${built}\n  got  ${e.source_url}`);
      }
    }
  }

  assert.equal(wrong.length, 0,
    `${wrong.length} link(s) no longer rebuild from their id — a source changed shape:\n${wrong.slice(0, 5).join('\n')}`);
  assert.ok(checked > 9000, `expected to check the whole corpus, only saw ${checked}`);
  // Sources that legitimately ship their link verbatim. Named, so that adding a
  // new one is a deliberate act rather than a silent widening.
  assert.deepEqual([...kept.keys()].sort(), ['curated', 'nrhp', 'wikidata'],
    'only Wikidata, curated pins, and the 9-digit National Register listings that '
    + 'have no NPGallery page should ship their link verbatim');
  assert.equal(kept.get('nrhp'), 37,
    'the 9-digit National Register ids must stay dataset links — deriving would '
    + 'invent 37 deep links to pages that do not exist');
});
