import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateRegion } from '../src/model/region.js';
import { inBBox } from '../src/model/geo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const region = JSON.parse(await readFile(path.join(ROOT, 'config', 'region.json'), 'utf8'));

test('committed region config is valid', () => {
  assert.deepEqual(validateRegion(region), []);
});

test('seed region is Sacramento + El Dorado + Placer', () => {
  assert.deepEqual(
    region.counties.map((c) => c.fips).sort(),
    ['06017', '06061', '06067']
  );
});

test('bbox covers the three county seats', () => {
  assert.ok(inBBox(38.5816, -121.4944, region.bbox), 'Sacramento');
  assert.ok(inBBox(38.7296, -120.7985, region.bbox), 'Placerville');
  assert.ok(inBBox(38.8966, -121.0769, region.bbox), 'Auburn');
});

test('validateRegion catches a broken bbox', () => {
  const bad = { ...region, bbox: { south: 40, north: 39, west: -121, east: -120 } };
  assert.ok(validateRegion(bad).length > 0);
});
