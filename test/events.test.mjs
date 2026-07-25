import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, formatEventWhen, upcomingKey, buildCelestialEvents, METEOR_SHOWERS } from '../src/model/events.js';
import { keepSpot } from '../src/model/notability.js';

// A fixed "now" so the relative math is deterministic (local time, mid-2026).
const NOW = new Date(2026, 6, 1); // Jul 1 2026

test('nextOccurrence: an upcoming annual event this year', () => {
  const occ = nextOccurrence({ month: 9, day: 11, days: 3, recurs: 'annual' }, NOW);
  assert.equal(occ.start.getMonth(), 8); // September (0-based)
  assert.equal(occ.start.getDate(), 11);
  assert.equal(occ.end.getDate(), 13);
  assert.ok(occ.daysUntil > 0 && occ.daysUntil < 100);
});

test('nextOccurrence: a past annual event rolls to next year', () => {
  const occ = nextOccurrence({ month: 1, day: 3, recurs: 'annual' }, NOW); // Jan 3, already past
  assert.equal(occ.start.getFullYear(), 2027);
  assert.ok(occ.daysUntil > 150);
});

test('nextOccurrence: a multi-day run still counts as current on its last day', () => {
  const now = new Date(2026, 8, 13); // Sep 13 — last day of an 11–13 run
  const occ = nextOccurrence({ month: 9, day: 11, days: 3, recurs: 'annual' }, now);
  assert.equal(occ.start.getFullYear(), 2026); // not rolled forward
  assert.equal(occ.daysUntil, -2);
});

test('formatEventWhen: range + relative phrase', () => {
  const occ = nextOccurrence({ month: 9, day: 11, days: 3, recurs: 'annual' }, new Date(2026, 8, 1));
  const s = formatEventWhen(occ, new Date(2026, 8, 1));
  assert.match(s, /Sep 11.*Sep 13/);
  assert.match(s, /in 10 days/);
});

test('upcomingKey sorts dated events ahead of undated spots', () => {
  const ev = { tags: { event: { month: 9, day: 11, recurs: 'annual' } } };
  const plain = { tags: {} };
  assert.ok(upcomingKey(ev, NOW) < upcomingKey(plain, NOW));
  assert.equal(upcomingKey(plain, NOW), Infinity);
});

test('buildCelestialEvents makes valid, keepable event spots at the region centre', () => {
  const region = { id: 'r', center: { lat: 39.5, lng: -119.8 }, bbox: { south: 39, west: -120, north: 40, east: -119 } };
  const evs = buildCelestialEvents(region);
  assert.equal(evs.length, METEOR_SHOWERS.length);
  for (const e of evs) {
    assert.equal(e.category, 'event');
    assert.equal(e.lat, 39.5);
    assert.equal(e.tags.event.skywide, true);
    assert.ok(keepSpot(e)); // events aren't filtered out by notability
    assert.ok(nextOccurrence(e.tags.event, NOW).daysUntil >= 0);
  }
});
