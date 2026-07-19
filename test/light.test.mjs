import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimesFor, sunAzimuth, compass, clock } from '../src/model/light.js';

// Sacramento, a fixed clear reference day.
const LAT = 38.5816;
const LNG = -121.4944;
const DAY = new Date(Date.UTC(2026, 5, 21)); // 2026-06-21, near solstice

test('produces a coherent ordered set of light windows', () => {
  const t = sunTimesFor(LAT, LNG, DAY);
  assert.ok(t.sunrise instanceof Date && t.sunset instanceof Date);
  assert.ok(t.sunrise < t.sunset, 'sunrise before sunset');
  assert.ok(!t.polar);
  // Morning order: blue → golden → sunrise falls inside/after golden start.
  assert.ok(t.blueMorning.start < t.blueMorning.end);
  assert.ok(t.goldenMorning.start < t.goldenMorning.end);
  assert.ok(t.blueMorning.end <= t.goldenMorning.end);
  // Golden morning brackets sunrise; golden evening brackets sunset.
  assert.ok(t.goldenMorning.start <= t.sunrise && t.sunrise <= t.goldenMorning.end);
  assert.ok(t.goldenEvening.start <= t.sunset && t.sunset <= t.goldenEvening.end);
  // Evening order: golden then blue, and after the morning.
  assert.ok(t.goldenEvening.start < t.goldenEvening.end);
  assert.ok(t.blueEvening.start < t.blueEvening.end);
  assert.ok(t.goldenEvening.start > t.goldenMorning.end);
});

test('near the summer solstice the sun rises in the NE and sets in the NW', () => {
  const t = sunTimesFor(LAT, LNG, DAY);
  // Solstice sunrise well north of due east, sunset well north of due west.
  assert.ok(t.sunriseAzimuth > 45 && t.sunriseAzimuth < 90, `sunrise az ${t.sunriseAzimuth}`);
  assert.ok(t.sunsetAzimuth > 270 && t.sunsetAzimuth < 315, `sunset az ${t.sunsetAzimuth}`);
  assert.equal(compass(t.sunriseAzimuth), 'NE');
  assert.equal(compass(t.sunsetAzimuth), 'NW');
});

test('Sacramento solstice sunrise lands in the expected local-time neighborhood', () => {
  const t = sunTimesFor(LAT, LNG, DAY);
  // ~05:41 PDT = ~12:41 UTC. Assert the UTC hour to stay zone-independent.
  const h = t.sunrise.getUTCHours() + t.sunrise.getUTCMinutes() / 60;
  assert.ok(Math.abs(h - 12.68) < 0.5, `sunrise UTC hour ${h}`);
});

test('compass maps degrees to 8 points, wrapping cleanly', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(360), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(225), 'SW');
  assert.equal(compass(-90), 'W');
  assert.equal(compass(null), null);
});

test('polar day is reported, not crashed', () => {
  // Above the Arctic Circle at solstice: sun never sets.
  const t = sunTimesFor(78.0, 15.0, DAY);
  assert.equal(t.polar, true);
});

test('sunAzimuth agrees with the times computation at sunrise', () => {
  const t = sunTimesFor(LAT, LNG, DAY);
  const az = sunAzimuth(LAT, LNG, t.sunrise);
  assert.ok(Math.abs(az - t.sunriseAzimuth) < 0.001);
});

test('clock formats and tolerates null', () => {
  assert.equal(clock(null), null);
  assert.match(clock(new Date(Date.UTC(2026, 0, 1, 15, 5))), /\d/);
});
