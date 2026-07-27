import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize, toEvent, classifyPhenophase, dayOfYearToDate, typicalDayOfYear,
  REQUEST_SOURCE, MIN_RECORDS, meta,
} from '../ingest/adapters/phenology.mjs';
import { makeSpot, validateSpot } from '../src/model/spot.js';

const row = (o) => ({ common_name: 'California poppy', phenophase_description: 'Open flowers',
  phenophase_status: 1, day_of_year: 100, latitude: 38.9, longitude: -120.9, ...o });

test('only photographically useful phenophases are picked up', () => {
  assert.equal(classifyPhenophase('Open flowers'), 'Bloom');
  assert.equal(classifyPhenophase('Colored leaves'), 'Autumn colour');
  assert.equal(classifyPhenophase('Ripe fruit'), null);
  assert.equal(classifyPhenophase('Pollen release'), null);
  assert.equal(classifyPhenophase(undefined), null);
});

test('a species needs enough independent records before we put a date on it', () => {
  const many = Array.from({ length: MIN_RECORDS }, (_, i) => row({ day_of_year: 95 + i }));
  const few = Array.from({ length: MIN_RECORDS - 1 }, () => row({ common_name: 'Rare thing' }));
  const out = summarize([...many, ...few]);
  assert.equal(out.length, 1, 'one person’s garden is not a regional bloom');
  assert.equal(out[0].species, 'California poppy');
  assert.equal(out[0].records, MIN_RECORDS);
});

test('"looked for but not seen" is not evidence that it bloomed', () => {
  // phenophase_status 0 means the observer checked and it was NOT happening.
  const rows = Array.from({ length: 20 }, () => row({ phenophase_status: 0 }));
  assert.deepEqual(summarize(rows), []);
});

test('the typical date is the median, so one freak year cannot drag it', () => {
  assert.equal(typicalDayOfYear([100, 101, 102, 103, 300]), 102);
  assert.equal(typicalDayOfYear([]), null);
  assert.equal(typicalDayOfYear([10, 20]), 15);
});

test('day-of-year converts to a real calendar date', () => {
  assert.deepEqual(dayOfYearToDate(1), { month: 1, day: 1 });
  assert.deepEqual(dayOfYearToDate(100), { month: 4, day: 10 });
  assert.deepEqual(dayOfYearToDate(365), { month: 12, day: 31 });
});

test('a summary becomes a valid annual event the events layer already understands', () => {
  const out = summarize(Array.from({ length: 10 }, (_, i) => row({ day_of_year: 95 + i })));
  const ev = toEvent(out[0], '2026-07-26');
  assert.equal(ev.category, 'event');
  assert.equal(ev.tags.event.recurs, 'annual');
  assert.equal(ev.tags.event.month, 4);
  assert.ok(ev.tags.event.days >= 7, 'a bloom is a window, not a day');
  // The card must say plainly that this is typical timing, not a forecast.
  assert.match(ev.notes, /window, not a date/);
  assert.doesNotThrow(() => validateSpot(makeSpot(ev)));
});

test('we self-identify, which is the one thing their terms actually require', () => {
  assert.match(REQUEST_SOURCE, /photo-pointer/);
  assert.match(REQUEST_SOURCE, /^.*https:\/\/github\.com/);
  assert.equal(meta.policy.selfIdentifies, true);
  assert.match(meta.policy.url, /^https:\/\/www\.usanpn\.org/);
});
