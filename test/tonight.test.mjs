import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonTonight, moonPhaseName, milkyWayTonight, CORE_MIN_ALTITUDE } from '../src/model/tonight.js';

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

// The dark window tells you when it is dark. It does not tell you whether the
// galactic core is above the horizon — and for most of the year, up here, it
// isn't. That is the fact that decides whether the shot exists.
test('the Milky Way core is a summer object at northern latitudes', () => {
  const july = milkyWayTonight(38.9, -120.9, new Date('2026-07-15T12:00:00Z'));
  assert.equal(july.visible, true);
  // Culmination altitude = 90 - |lat - dec| = 90 - (38.9 + 29.0) = 22.1
  assert.ok(Math.abs(july.maxAltitude - 22) <= 1, `got ${july.maxAltitude}`);
  assert.ok(Math.abs(july.azimuthAtPeak - 180) <= 12, 'culminates due south');

  const december = milkyWayTonight(38.9, -120.9, new Date('2026-12-15T12:00:00Z'));
  assert.equal(december.visible, false, 'below the horizon through the dark hours');
  assert.ok(december.maxAltitude < 0);
});

test('the core rides far higher from lower latitudes', () => {
  // 90 - |19.8 - (-29.0)| = 41.2
  const hi = milkyWayTonight(19.8, -155.5, new Date('2026-07-15T12:00:00Z'));
  assert.ok(Math.abs(hi.maxAltitude - 41) <= 2, `got ${hi.maxAltitude}`);
  assert.ok(hi.maxAltitude > 30, 'genuinely overhead compared with Sacramento');
});

test('a usable window is only counted in genuinely dark sky', () => {
  const r = milkyWayTonight(38.9, -120.9, new Date('2026-07-15T12:00:00Z'));
  assert.ok(r.start instanceof Date && r.end instanceof Date);
  assert.ok(r.end > r.start);
  assert.equal(typeof r.moonFree, 'boolean');
  assert.ok(r.maxAltitude >= CORE_MIN_ALTITUDE);
});
