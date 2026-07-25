import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayers, normalizeFeature, listedYear, ingest, meta } from '../ingest/adapters/nrhp.mjs';
import { makeSpot, validateSpot } from '../src/model/spot.js';

const TODAY = '2026-07-25';
const REGION = { id: 't', bbox: { south: 38.5, west: -121.5, north: 39.5, east: -120.5 } };

const LAYERS = { layers: [
  { id: 0, name: 'National Register Of Historic Places Points', geometryType: 'esriGeometryPoint',
    fields: [{ name: 'RESNAME' }, { name: 'NRIS_Refnum' }, { name: 'LISTED_DATE' }] },
  // Polygons (districts) are skipped — a boundary isn't a place to stand.
  { id: 1, name: 'National Register of Historic Places Polygons', geometryType: 'esriGeometryPolygon',
    fields: [{ name: 'RESNAME' }] },
  // A layer with no name field is skipped.
  { id: 2, name: 'Metadata', geometryType: 'esriGeometryPoint', fields: [{ name: 'OBJECTID' }] },
] };

test('pickLayers takes point layers with a name field and reports the fields it found', () => {
  const ls = pickLayers(LAYERS);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].id, 0);
  assert.equal(ls[0].nameField, 'RESNAME');
  assert.equal(ls[0].idField, 'NRIS_Refnum');
  assert.equal(ls[0].dateField, 'LISTED_DATE');
  assert.deepEqual(pickLayers({ layers: [] }), []);
});

test('pickLayers matches field names case-insensitively', () => {
  const ls = pickLayers({ layers: [{ id: 5, name: 'Points', geometryType: 'esriGeometryPoint',
    fields: [{ name: 'resname' }, { name: 'cr_id' }] }] });
  assert.equal(ls[0].nameField, 'resname');
  assert.equal(ls[0].idField, 'cr_id');
  assert.equal(ls[0].dateField, null);
});

test('listedYear handles epoch millis, strings and junk', () => {
  assert.equal(listedYear(Date.UTC(1978, 4, 3)), 1978);
  assert.equal(listedYear('1966-10-15'), 1966);
  assert.equal(listedYear(''), null);
  assert.equal(listedYear(null), null);
  assert.equal(listedYear(12), null); // not a plausible year
});

test('normalizeFeature builds a valid historic_site spot linking to its record', () => {
  const layer = pickLayers(LAYERS)[0];
  const f = { attributes: { RESNAME: 'Old Sacramento Historic District', NRIS_Refnum: '66000212', LISTED_DATE: Date.UTC(1966, 9, 15) },
    geometry: { x: -121.504, y: 38.583 } };
  const rec = normalizeFeature(f, layer, TODAY);
  assert.equal(rec.category, 'historic_site');
  assert.equal(rec.name, 'Old Sacramento Historic District');
  assert.equal(rec.tags.nrhp, '66000212');
  assert.equal(rec.tags.nrhp_listed, 1966);
  assert.equal(rec.sources[0].source_license, 'public-domain');
  assert.match(rec.sources[0].source_url, /npgallery\.nps\.gov\/AssetDetail\/NRIS\/66000212/);
  assert.deepEqual(validateSpot(makeSpot(rec)), []);
});

test('normalizeFeature cites the dataset when the id is not a reference number', () => {
  const layer = { nameField: 'RESNAME', idField: 'CR_ID', dateField: null };
  const rec = normalizeFeature({ attributes: { RESNAME: 'Some Place', CR_ID: 'abc-123' }, geometry: { x: -121, y: 39 } }, layer, TODAY);
  assert.match(rec.sources[0].source_url, /nps\.gov\/subjects\/nationalregister/);
  assert.equal(rec.tags.nrhp_listed, undefined);
});

test('normalizeFeature drops unnamed, id-less and bad-geometry rows', () => {
  const layer = pickLayers(LAYERS)[0];
  assert.equal(normalizeFeature({ attributes: { RESNAME: '  ', NRIS_Refnum: '1' }, geometry: { x: -121, y: 39 } }, layer, TODAY), null);
  assert.equal(normalizeFeature({ attributes: { RESNAME: 'X', NRIS_Refnum: '' }, geometry: { x: -121, y: 39 } }, layer, TODAY), null);
  assert.equal(normalizeFeature({ attributes: { RESNAME: 'X', NRIS_Refnum: '1' }, geometry: {} }, layer, TODAY), null);
});

test('ingest discovers layers, pages, and dedups by id', async () => {
  const page0 = { exceededTransferLimit: true, features: Array.from({ length: 1000 }, (_, i) => (
    { attributes: { RESNAME: `Place ${i}`, NRIS_Refnum: String(10000000 + i), LISTED_DATE: Date.UTC(1980, 0, 1) },
      geometry: { x: -121.0, y: 39.0 } })) };
  const page1 = { features: [
    { attributes: { RESNAME: 'Depot', NRIS_Refnum: '77000123', LISTED_DATE: Date.UTC(1977, 2, 8) }, geometry: { x: -121.1, y: 39.1 } },
    { attributes: { RESNAME: 'Depot', NRIS_Refnum: '77000123', LISTED_DATE: Date.UTC(1977, 2, 8) }, geometry: { x: -121.1, y: 39.1 } }, // dup
  ] };
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    let body;
    if (url.includes('/layers')) body = LAYERS;
    else if (url.includes('resultOffset=0')) body = page0;
    else body = page1;
    return { ok: true, status: 200, json: async () => body };
  };
  const recs = await ingest(REGION, { fetchFn, today: TODAY, sleep: async () => {} });
  assert.equal(recs.length, 1001); // 1000 + Depot, dup dropped
  assert.equal(meta.source, 'nrhp');
  // Only the points layer (id 0) was queried — polygons and metadata skipped.
  assert.ok(urls.some((u) => u.includes('/0/query')));
  assert.ok(!urls.some((u) => u.includes('/1/query')));
});

test('ingest fails fast on a 4xx instead of retrying', async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: false, status: 400, json: async () => ({}) }; };
  await assert.rejects(() => ingest(REGION, { fetchFn, today: TODAY, sleep: async () => {} }));
  assert.equal(calls, 1);
});
