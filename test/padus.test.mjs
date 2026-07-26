import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayers, normalizeArea, ingest, meta } from '../ingest/adapters/padus.mjs';
import { pointInArea } from '../src/model/geo.js';

const REGION = { id: 't', bbox: { south: 38.5, west: -121.5, north: 39.5, east: -120.5 } };

const LAYERS = { layers: [
  { id: 0, name: 'PADUS Fee', geometryType: 'esriGeometryPolygon',
    fields: [{ name: 'Unit_Nm' }, { name: 'd_Mang_Nam' }, { name: 'd_Des_Tp' }, { name: 'd_Pub_Access' }] },
  // Marine areas can't contain a land spot — skipped.
  { id: 1, name: 'PADUS Marine', geometryType: 'esriGeometryPolygon', fields: [{ name: 'Unit_Nm' }] },
  // A point layer isn't a boundary — skipped.
  { id: 2, name: 'Reference Points', geometryType: 'esriGeometryPoint', fields: [{ name: 'Unit_Nm' }] },
  // No unit-name field — skipped.
  { id: 3, name: 'Metadata', geometryType: 'esriGeometryPolygon', fields: [{ name: 'OBJECTID' }] },
] };

// A square around (39.0, -121.0), in ArcGIS [x=lng, y=lat] order.
const square = (cx, cy, r) => [[
  [cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r],
]];

test('pickLayers takes polygon layers with a unit name, skipping marine/point/fieldless', () => {
  const ls = pickLayers(LAYERS);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].id, 0);
  assert.equal(ls[0].nameField, 'Unit_Nm');
  assert.equal(ls[0].managerField, 'd_Mang_Nam');     // decoded field preferred
  assert.equal(ls[0].designationField, 'd_Des_Tp');
  assert.equal(ls[0].accessField, 'd_Pub_Access');
  assert.deepEqual(pickLayers({ layers: [] }), []);
});

test('pickLayers matches fields case-insensitively and falls back to coded names', () => {
  const ls = pickLayers({ layers: [{ id: 7, name: 'Fee', geometryType: 'esriGeometryPolygon',
    fields: [{ name: 'UNIT_NM' }, { name: 'MANG_NAME' }, { name: 'DES_TP' }] }] });
  assert.equal(ls[0].nameField, 'UNIT_NM');
  assert.equal(ls[0].managerField, 'MANG_NAME');
  assert.equal(ls[0].accessField, null); // absent → simply not reported
});

test('normalizeArea converts rings to [lat,lng], derives a bbox, and is point-testable', () => {
  const layer = pickLayers(LAYERS)[0];
  const f = {
    attributes: { Unit_Nm: 'Folsom Lake SRA', d_Mang_Nam: 'State Parks', d_Des_Tp: 'State Recreation Area', d_Pub_Access: 'Open' },
    geometry: { rings: square(-121.0, 39.0, 0.1) },
  };
  const a = normalizeArea(f, layer);
  assert.equal(a.name, 'Folsom Lake SRA');
  assert.equal(a.manager, 'State Parks');
  assert.equal(a.access, 'open'); // normalised to one word, whichever field shape
  assert.deepEqual(a.bbox, { south: 38.9, west: -121.1, north: 39.1, east: -120.9 });
  // The whole point of the geometry: does a spot fall inside it?
  assert.equal(pointInArea(39.0, -121.0, a), true);
  assert.equal(pointInArea(38.0, -121.0, a), false);
});

test('placeholder attribute values are treated as absent, not shown as "Unknown"', () => {
  const layer = pickLayers(LAYERS)[0];
  const a = normalizeArea({
    attributes: { Unit_Nm: 'Somewhere', d_Mang_Nam: 'Unknown', d_Des_Tp: '  ', d_Pub_Access: 'N/A' },
    geometry: { rings: square(-121, 39, 0.05) },
  }, layer);
  assert.equal(a.manager, null);
  assert.equal(a.designation, null);
  assert.equal(a.access, null);
});

test('normalizeArea rejects features with no usable ring', () => {
  const layer = pickLayers(LAYERS)[0];
  assert.equal(normalizeArea({ attributes: { Unit_Nm: 'X' }, geometry: { rings: [] } }, layer), null);
  assert.equal(normalizeArea({ attributes: { Unit_Nm: 'X' }, geometry: { rings: [[[1, 2], [3, 4]]] } }, layer), null);
  assert.equal(normalizeArea({ attributes: { Unit_Nm: 'X' } }, layer), null);
});

test('ingest discovers layers, generalises geometry, pages, and skips marine', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes('/layers')) return { ok: true, status: 200, json: async () => LAYERS };
    const offset = Number(new URL(url).searchParams.get('resultOffset'));
    const features = offset === 0
      ? Array.from({ length: 200 }, (_, i) => ({
          attributes: { Unit_Nm: `Area ${i}`, d_Mang_Nam: 'USFS', d_Des_Tp: 'National Forest', d_Pub_Access: 'Open' },
          geometry: { rings: square(-121, 39, 0.05) } }))
      : [{ attributes: { Unit_Nm: 'Last', d_Mang_Nam: 'BLM' }, geometry: { rings: square(-121, 39, 0.02) } }];
    return { ok: true, status: 200, json: async () => ({ features }) };
  };
  const areas = await ingest(REGION, { fetchFn, sleep: async () => {} });
  assert.equal(areas.length, 201); // paged past the first full page
  assert.ok(urls.some((u) => u.includes('/0/query')));
  assert.ok(!urls.some((u) => u.includes('/1/query')), 'marine layer must not be queried');
  assert.ok(urls.some((u) => u.includes('maxAllowableOffset')), 'geometry must be generalised');
  assert.equal(meta.license, 'public-domain');
});

test('a failing layer is skipped rather than losing the whole run', async () => {
  const fetchFn = async (url) => {
    if (url.includes('/layers')) return { ok: true, status: 200, json: async () => LAYERS };
    return { ok: false, status: 400, json: async () => ({}) };
  };
  const areas = await ingest(REGION, { fetchFn, sleep: async () => {} });
  assert.deepEqual(areas, []);
});

test('resolveService falls past a service whose SITE is down to the next candidate', async () => {
  const good = 'https://good.example/FeatureServer';
  const down = 'https://down.example/MapServer';
  const tried = [];
  const fetchFn = async (url) => {
    tried.push(url);
    if (url.startsWith(down)) {
      // The real failure seen on the first run: the ArcGIS SITE isn't running.
      return { ok: true, status: 200, json: async () => ({ error: { code: 500, message: '9017$SITE_NOT_INITIALIZED' } }) };
    }
    return { ok: true, status: 200, json: async () => LAYERS };
  };
  const { resolveService } = await import('../ingest/adapters/padus.mjs');
  const r = await resolveService(fetchFn, async () => {}, () => {}, [down, good]);
  assert.equal(r.baseUrl, good);
  assert.equal(r.layers.length, 1);
  assert.ok(tried[0].startsWith(down), 'must try the first candidate before falling through');
});

test('resolveService reports every candidate it tried when none answer', async () => {
  const { resolveService } = await import('../ingest/adapters/padus.mjs');
  const fetchFn = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(
    () => resolveService(fetchFn, async () => {}, () => {}, ['https://a.example/x', 'https://b.example/y']),
    (e) => /a\.example/.test(e.message) && /b\.example/.test(e.message));
});

test('PAD-US domain codes are decoded into words a person can read', () => {
  const layer = pickLayers(LAYERS)[0];
  const a = normalizeArea({
    attributes: { Unit_Nm: 'Eldorado National Forest', d_Mang_Nam: 'USFS', d_Des_Tp: 'NF', d_Pub_Access: 'OA' },
    geometry: { rings: square(-121, 39, 0.1) },
  }, layer);
  assert.equal(a.manager, 'U.S. Forest Service');
  assert.equal(a.designation, 'National Forest');
  assert.equal(a.access, 'open');

  const local = normalizeArea({
    attributes: { Unit_Nm: '24th Street Bypass Park', d_Mang_Nam: 'CITY', d_Des_Tp: 'LP', d_Pub_Access: 'XA' },
    geometry: { rings: square(-121, 39, 0.01) },
  }, layer);
  assert.equal(local.manager, 'City');
  assert.equal(local.designation, 'Local Park');
  assert.equal(local.access, 'closed');
});

test('an unknown code falls back to the raw value, but access is never guessed', () => {
  const layer = pickLayers(LAYERS)[0];
  const a = normalizeArea({
    attributes: { Unit_Nm: 'X', d_Mang_Nam: 'ZZZ', d_Des_Tp: 'QQ', d_Pub_Access: 'ZZ' },
    geometry: { rings: square(-121, 39, 0.01) },
  }, layer);
  assert.equal(a.manager, 'ZZZ');       // visible, so it can be reported and mapped
  assert.equal(a.designation, 'QQ');
  assert.equal(a.access, null);          // an access claim is never invented
});

test('an already-decoded d_* value passes through untouched', () => {
  const layer = pickLayers(LAYERS)[0];
  const a = normalizeArea({
    attributes: { Unit_Nm: 'X', d_Mang_Nam: 'California State Parks', d_Des_Tp: 'State Recreation Area' },
    geometry: { rings: square(-121, 39, 0.01) },
  }, layer);
  assert.equal(a.manager, 'California State Parks');
  assert.equal(a.designation, 'State Recreation Area');
});
