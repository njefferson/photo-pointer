import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateRegion, validateRegions, pickRegion, regionForFix } from '../src/model/region.js';
import { inBBox } from '../src/model/geo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(await readFile(path.join(ROOT, 'config', 'regions.json'), 'utf8'));
const byId = Object.fromEntries(doc.regions.map((r) => [r.id, r]));

test('committed regions config is valid (unique ids, valid default, each region)', () => {
  assert.deepEqual(validateRegions(doc), []);
});

test('all regions are present', () => {
  assert.deepEqual(
    doc.regions.map((r) => r.id).sort(),
    ['california-ghost-towns', 'hahira', 'humboldt', 'panama-city-beach', 'reno', 'sac-eldorado-placer', 'solvang', 'yellowstone']
  );
});

test('pickRegion resolves by id and falls back to the default', () => {
  assert.equal(pickRegion(doc, 'yellowstone').id, 'yellowstone');
  assert.equal(pickRegion(doc, 'nope').id, doc.default);
  assert.equal(pickRegion(doc, undefined).id, doc.default);
});

// The home region grew on 2026-07-27, and the reason is worth keeping: the map
// was always a bounding BOX while the OpenStreetMap ingest asked by COUNTY, so
// everything in the box outside the three original counties had no data at all.
// The photo-density layer fell into that hole and found it — 26 of 43
// discoveries in cells holding fewer than five known places. Calaveras, Nevada
// and Amador are where people demonstrably go and we knew nothing.
test('the home region covers the counties inside its own bounding box', () => {
  assert.deepEqual(byId['sac-eldorado-placer'].counties.map((c) => c.fips).sort(),
    ['06005', '06009', '06017', '06057', '06061', '06067']);
});

test('every county named in a region is one we could actually be asked about', () => {
  for (const r of doc.regions) {
    for (const c of r.counties) {
      assert.ok(c.osm_area_name, `${r.id}: a county with no OSM area name cannot be ingested`);
      assert.match(c.fips ?? '', /^\d{5}$/, `${r.id}/${c.name}: fips`);
    }
  }
});

test('each region bbox covers a known place inside it', () => {
  assert.ok(inBBox(38.5816, -121.4944, byId['sac-eldorado-placer'].bbox), 'Sacramento');
  assert.ok(inBBox(40.8021, -124.1637, byId['humboldt'].bbox), 'Eureka');
  assert.ok(inBBox(44.4280, -110.5885, byId['yellowstone'].bbox), 'Old Faithful');
  assert.ok(inBBox(30.9902, -83.3724, byId['hahira'].bbox), 'Hahira, GA');
  assert.ok(inBBox(30.1766, -85.8055, byId['panama-city-beach'].bbox), 'Panama City Beach, FL');
  assert.ok(inBBox(34.5958, -120.1377, byId['solvang'].bbox), 'Solvang, CA');
});

// A fix belongs to the region with the SMALLEST box that holds it. The statewide
// ghost-town box comes before Solvang and Reno in the file and holds both, so
// the old first-in-file-order rule sent a reader standing in either of them to
// the statewide map.
test('a fix in Solvang resolves to the Solvang region, not the statewide map', () => {
  assert.equal(regionForFix(doc.regions, { lat: 34.5958, lng: -120.1377 }, doc.default).id, 'solvang');
});

test("a fix at Reno's centre resolves to Reno, not the statewide map", () => {
  assert.equal(regionForFix(doc.regions, { lat: 39.5528, lng: -119.8213 }, doc.default).id, 'reno');
});

test('a fix at Cameron Park resolves to the home region', () => {
  assert.equal(regionForFix(doc.regions, { lat: 38.6785, lng: -120.9872 }, doc.default).id, 'sac-eldorado-placer');
});

test('a fix in Los Angeles resolves to the statewide ghost-town region', () => {
  assert.equal(regionForFix(doc.regions, { lat: 34.0522, lng: -118.2437 }, doc.default).id, 'california-ghost-towns');
});

test('a fix in New York resolves to no region', () => {
  assert.equal(regionForFix(doc.regions, { lat: 40.7128, lng: -74.006 }, doc.default), null);
});

test('Yellowstone spans three states', () => {
  assert.deepEqual([...new Set(byId['yellowstone'].counties.map((c) => c.state))].sort(), ['ID', 'MT', 'WY']);
});

test('validateRegion catches a broken bbox', () => {
  const bad = { ...byId['humboldt'], bbox: { south: 40, north: 39, west: -121, east: -120 } };
  assert.ok(validateRegion(bad).length > 0);
});
