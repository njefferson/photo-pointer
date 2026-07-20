import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateRegion, validateRegions, pickRegion } from '../src/model/region.js';
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
    ['hahira', 'humboldt', 'panama-city-beach', 'sac-eldorado-placer', 'yellowstone']
  );
});

test('pickRegion resolves by id and falls back to the default', () => {
  assert.equal(pickRegion(doc, 'yellowstone').id, 'yellowstone');
  assert.equal(pickRegion(doc, 'nope').id, doc.default);
  assert.equal(pickRegion(doc, undefined).id, doc.default);
});

test('home region is Sacramento + El Dorado + Placer', () => {
  assert.deepEqual(byId['sac-eldorado-placer'].counties.map((c) => c.fips).sort(), ['06017', '06061', '06067']);
});

test('each region bbox covers a known place inside it', () => {
  assert.ok(inBBox(38.5816, -121.4944, byId['sac-eldorado-placer'].bbox), 'Sacramento');
  assert.ok(inBBox(40.8021, -124.1637, byId['humboldt'].bbox), 'Eureka');
  assert.ok(inBBox(44.4280, -110.5885, byId['yellowstone'].bbox), 'Old Faithful');
  assert.ok(inBBox(30.9902, -83.3724, byId['hahira'].bbox), 'Hahira, GA');
  assert.ok(inBBox(30.1766, -85.8055, byId['panama-city-beach'].bbox), 'Panama City Beach, FL');
});

test('Yellowstone spans three states', () => {
  assert.deepEqual([...new Set(byId['yellowstone'].counties.map((c) => c.state))].sort(), ['ID', 'MT', 'WY']);
});

test('validateRegion catches a broken bbox', () => {
  const bad = { ...byId['humboldt'], bbox: { south: 40, north: 39, west: -121, east: -120 } };
  assert.ok(validateRegion(bad).length > 0);
});
