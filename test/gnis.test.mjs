import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayers, mapFeature, normalizeFeature, buildWhere, ingest, meta } from '../ingest/adapters/gnis.mjs';
import { makeSpot, validateSpot } from '../src/model/spot.js';

const TODAY = '2026-07-25';

test('pickLayers returns every class-bearing layer, skipping ones without the field', () => {
  const doc = { layers: [
    { id: 0, name: 'Group Layer', fields: [] },
    { id: 1, name: 'Water Features', fields: [{ name: 'gaz_id' }, { name: 'gaz_featureclass' }] },
    { id: 4, name: 'Landforms', fields: [{ name: 'gaz_name' }, { name: 'gaz_featureclass' }] },
  ] };
  assert.deepEqual(pickLayers(doc), [{ id: 1, name: 'Water Features' }, { id: 4, name: 'Landforms' }]);
  assert.deepEqual(pickLayers({ layers: [] }), []);
});

test('buildWhere lists the GNIS classes', () => {
  assert.equal(buildWhere(), "gaz_featureclass IN ('Falls','Arch','Cave','Spring')");
});

test('mapFeature maps classes; a plain Spring is skipped, a hot one kept', () => {
  assert.equal(mapFeature('Falls', 'Feather Falls').curiosity, 'Waterfall');
  assert.equal(mapFeature('Arch', 'Rainbow Arch').curiosity, 'Natural arch');
  assert.equal(mapFeature('Cave', 'Bat Cave').curiosity, 'Cave');
  assert.equal(mapFeature('Spring', 'Cold Spring'), null);
  assert.equal(mapFeature('Spring', 'Grover Hot Springs').curiosity, 'Hot spring');
  assert.equal(mapFeature('Spring', 'Steamboat Geyser').curiosity, 'Hot spring');
  assert.equal(mapFeature('Summit', 'Some Peak'), null); // not in our set
});

test('normalizeFeature makes a valid oddity spot carrying the curiosity kind', () => {
  const f = { attributes: { gaz_id: 251234, gaz_name: 'Feather Falls', gaz_featureclass: 'Falls' }, geometry: { x: -121.27, y: 39.63 } };
  const rec = normalizeFeature(f, TODAY);
  assert.equal(rec.category, 'oddity'); // refineCategory splits Waterfall out at load
  assert.equal(rec.tags.curiosity, 'Waterfall');
  assert.equal(rec.tags.natural, 'waterfall');
  assert.equal(rec.tags.gnis, '251234');
  assert.equal(rec.sources[0].source, 'gnis');
  assert.equal(rec.sources[0].source_license, 'public-domain');
  assert.deepEqual(validateSpot(makeSpot(rec)), []);
});

test('normalizeFeature drops unnamed rows, non-curiosity classes and bad geometry', () => {
  assert.equal(normalizeFeature({ attributes: { gaz_id: 1, gaz_name: '', gaz_featureclass: 'Falls' }, geometry: { x: -121, y: 39 } }, TODAY), null);
  assert.equal(normalizeFeature({ attributes: { gaz_id: 2, gaz_name: 'Cold Spring', gaz_featureclass: 'Spring' }, geometry: { x: -121, y: 39 } }, TODAY), null);
  assert.equal(normalizeFeature({ attributes: { gaz_id: 3, gaz_name: 'X Falls', gaz_featureclass: 'Falls' }, geometry: {} }, TODAY), null);
});

test('ingest queries every class-bearing layer, pages, and dedups by gaz_id across layers', async () => {
  const region = { id: 't', bbox: { south: 39, west: -122, north: 40, east: -121 } };
  // Two class-bearing layers: 1 = Water (Falls + a hot Spring), 4 = Landforms (an Arch + a dup of the hot Spring).
  const layersDoc = { layers: [
    { id: 1, name: 'Water Features', fields: [{ name: 'gaz_featureclass' }] },
    { id: 4, name: 'Landforms', fields: [{ name: 'gaz_featureclass' }] },
  ] };
  const layer1page0 = { exceededTransferLimit: true, features: Array.from({ length: 1000 }, (_, i) => (
    { attributes: { gaz_id: i, gaz_name: `Falls ${i}`, gaz_featureclass: 'Falls' }, geometry: { x: -121.5, y: 39.5 } })) };
  const layer1page1 = { features: [
    { attributes: { gaz_id: 1000, gaz_name: 'Grover Hot Springs', gaz_featureclass: 'Spring' }, geometry: { x: -121.4, y: 39.4 } },
    { attributes: { gaz_id: 1001, gaz_name: 'Cold Spring', gaz_featureclass: 'Spring' }, geometry: { x: -121.3, y: 39.3 } }, // skipped
  ] };
  const layer4 = { features: [
    { attributes: { gaz_id: 2000, gaz_name: 'Rainbow Arch', gaz_featureclass: 'Arch' }, geometry: { x: -121.2, y: 39.2 } },
    { attributes: { gaz_id: 1000, gaz_name: 'Grover Hot Springs', gaz_featureclass: 'Spring' }, geometry: { x: -121.4, y: 39.4 } }, // dup of layer1
  ] };
  const fetchFn = async (url) => {
    let body;
    if (url.includes('/layers')) body = layersDoc;
    else if (url.includes('/1/query')) body = url.includes('resultOffset=0') ? layer1page0 : layer1page1;
    else if (url.includes('/4/query')) body = layer4;
    else body = { features: [] };
    return { ok: true, status: 200, json: async () => body };
  };
  const recs = await ingest(region, { fetchFn, today: TODAY, sleep: async () => {} });
  // 1000 falls + 1 hot spring + 1 arch (cross-layer dup dropped, cold spring skipped)
  assert.equal(recs.length, 1002);
  assert.equal(recs.filter((r) => r.tags.curiosity === 'Hot spring').length, 1);
  assert.equal(recs.filter((r) => r.tags.curiosity === 'Natural arch').length, 1);
  assert.equal(meta.source, 'gnis');
});
