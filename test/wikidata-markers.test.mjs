import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoint, normalizeBinding, buildQuery, ingest, meta } from '../ingest/adapters/wikidata-markers.mjs';

test('parsePoint reads WKT lon-lat order', () => {
  assert.deepEqual(parsePoint('Point(-121.49 38.58)'), { lng: -121.49, lat: 38.58 });
  assert.equal(parsePoint('nonsense'), null);
});

test('a marker with an HMdb ID links to its HMdb page', () => {
  const rec = normalizeBinding({
    item: { value: 'http://www.wikidata.org/entity/Q42' },
    itemLabel: { value: 'Sutter’s Mill Marker' },
    coord: { value: 'Point(-120.89 38.80)' },
    hmdb: { value: '12345' },
  }, '2026-07-19');
  assert.equal(rec.category, 'marker');
  assert.deepEqual(rec.subject_type, ['historic']);
  assert.equal(rec.sources[0].source, 'wikidata');
  assert.equal(rec.sources[0].source_id, 'Q42');
  assert.equal(rec.sources[0].source_license, 'CC0-1.0');
  assert.equal(rec.sources[0].source_url, 'https://www.hmdb.org/m.asp?m=12345');
  assert.equal(rec.tags.hmdb, '12345');
  assert.equal(rec.notes, null, 'never stores inscription text');
});

test('a California Historical Landmark (no HMdb id) links to Wikidata and is flagged', () => {
  const rec = normalizeBinding({
    item: { value: 'http://www.wikidata.org/entity/Q99' },
    itemLabel: { value: 'Old Sacramento' },
    coord: { value: 'Point(-121.50 38.58)' },
    chl: { value: 'true' },
  }, '2026-07-19');
  assert.equal(rec.sources[0].source_url, 'https://www.wikidata.org/wiki/Q99');
  assert.equal(rec.tags.california_landmark, true);
  assert.equal(rec.tags.hmdb, undefined);
});

test('an unlabeled item (label === QID) keeps a null name', () => {
  const rec = normalizeBinding({
    item: { value: 'http://www.wikidata.org/entity/Q7' },
    itemLabel: { value: 'Q7' },
    coord: { value: 'Point(-121 38.5)' },
    hmdb: { value: '5' },
  }, '2026-07-19');
  assert.equal(rec.name, null);
});

test('buildQuery embeds the region bbox as SW/NE WKT corners', () => {
  const q = buildQuery({ bbox: { south: 38, west: -121.95, north: 39.4, east: -119.85 } });
  assert.match(q, /cornerSouthWest "Point\(-121\.95 38\)"/);
  assert.match(q, /cornerNorthEast "Point\(-119\.85 39\.4\)"/);
  assert.match(q, /P7883/);
  assert.match(q, /Q2933979/); // California Historical Landmark type
  assert.match(q, /Q4989906/); // monument
});

test('ingest dedups a marker returned twice (both IDs) and counts HMdb links', async () => {
  const binding = {
    item: { value: 'http://www.wikidata.org/entity/Q42' },
    itemLabel: { value: 'Double Marker' },
    coord: { value: 'Point(-120.89 38.80)' },
    hmdb: { value: '12345' }, chl: { value: '5' },
  };
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ results: { bindings: [binding, binding] } }) });
  const recs = await ingest({ bbox: { south: 38, west: -121, north: 39, east: -120 } }, { fetchFn, today: '2026-07-19', sleep: () => Promise.resolve() });
  assert.equal(recs.length, 1, 'the duplicate QID is collapsed');
  assert.equal(meta.license, 'CC0-1.0');
});
