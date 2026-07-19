import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonTonight, moonPhaseName } from '../src/model/tonight.js';

const LAT = 38.5816, LNG = -121.4944;

test('moonPhaseName maps angles to the right names', () => {
  assert.equal(moonPhaseName(0), 'new');
  assert.equal(moonPhaseName(180), 'full');
  assert.equal(moonPhaseName(90), 'first quarter');
  assert.equal(moonPhaseName(270), 'last quarter');
  assert.equal(moonPhaseName(360), 'new');
});

test('a known new moon reads near-zero illumination', () => {
  // 2026-01-18 was a new moon.
  const t = moonTonight(LAT, LNG, new Date(Date.UTC(2026, 0, 18)));
  assert.ok(t.illumination < 0.08, `illum ${t.illumination}`);
  assert.equal(t.phaseName, 'new');
});

test('a known full moon reads near-full illumination', () => {
  // 2026-01-03 was a full moon.
  const t = moonTonight(LAT, LNG, new Date(Date.UTC(2026, 0, 3)));
  assert.ok(t.illumination > 0.95, `illum ${t.illumination}`);
  assert.equal(t.phaseName, 'full');
});

test('astronomical night is present and ordered at mid-latitude', () => {
  const t = moonTonight(LAT, LNG, new Date(Date.UTC(2026, 5, 21)));
  assert.ok(t.astroNight, 'has an astro night');
  assert.ok(t.astroNight.start < t.astroNight.end);
  assert.ok(!t.polar);
});

test('on a new-moon night the dark window covers most of astronomical night', () => {
  const t = moonTonight(LAT, LNG, new Date(Date.UTC(2026, 0, 18)));
  assert.ok(t.darkWindow, 'has a dark window');
  const night = t.astroNight.end - t.astroNight.start;
  const dark = t.darkWindow.end - t.darkWindow.start;
  assert.ok(dark > night * 0.7, `dark ${dark} vs night ${night}`);
});

test('moonrise/set are Dates or null, never NaN', () => {
  const t = moonTonight(LAT, LNG);
  for (const v of [t.moonrise, t.moonset]) {
    assert.ok(v === null || (v instanceof Date && !Number.isNaN(v.getTime())));
  }
});
