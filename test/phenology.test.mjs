import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize, toEvent, classifyPhenophase, dayOfYearToDate, typicalDayOfYear, REQUEST_SOURCE, MIN_RECORDS, meta,
  buildBody, endpoint, yearWindows, ingest, peakWindow,
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

// The first run put California poppy at 25 June in the Sierra foothills, where
// it peaks in early April. Nothing was broken — the median of a March-to-August
// season really is late June. It was the wrong question, and a wrong answer
// arrived at correctly is still someone driving out to an empty hillside.
test('the date is the busiest fortnight, not the middle of a long season', () => {
  const days = [];
  for (let i = 0; i < 30; i++) days.push(95 + Math.floor(i / 6));  // dense early April
  for (let d = 140; d <= 230; d += 2) days.push(d);                // long tail to August
  const w = peakWindow(days);
  assert.equal(w.start, 95, 'the peak is where the observations actually pile up');
  assert.equal(w.inWindow, 30);
  assert.equal(w.total, 76);
  assert.ok(w.center < 110, `centre ${w.center} should be early April, not midsummer`);
  // And the median, for contrast, lands in the empty tail.
  assert.ok(typicalDayOfYear(days) > 130, 'which is exactly why we stopped using it');
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

// The axis names are a trap and cost a runner cycle: USA-NPN calls the bounding
// box x1/y1 and x2/y2, but x is LATITUDE and y is LONGITUDE — the opposite of
// every other adapter here. Getting it backwards returns HTTP 200 with zero
// records, which reads exactly like "no data in this region".
const REGION = { bbox: { south: 38.2, west: -121.6, north: 39.4, east: -119.9 } };

test('the bounding box is sent as lat/lng, not the x/y the names suggest', () => {
  const q = buildBody(REGION, { startDate: '2021-01-01', endDate: '2021-12-31' });
  assert.equal(q.get('bottom_left_x1'), '38.2', 'x1 carries the SOUTH LATITUDE');
  assert.equal(q.get('bottom_left_y1'), '-121.6', 'y1 carries the WEST LONGITUDE');
  assert.equal(q.get('upper_right_x2'), '39.4');
  assert.equal(q.get('upper_right_y2'), '-119.9');
  assert.equal(q.get('start_date'), '2021-01-01');
  assert.equal(q.get('end_date'), '2021-12-31');
  assert.ok(q.get('request_src').includes('photo-pointer'));
});

// Each of these three cost a real runner cycle, because getting any of them
// wrong is answered HTTP 200 with `[]` — indistinguishable from "no data here".
test('one window per calendar year, never a single multi-year range', () => {
  const w = yearWindows(2026, 5);
  assert.equal(w.length, 5);
  assert.deepEqual(w[0], { year: 2021, startDate: '2021-01-01', endDate: '2021-12-31' });
  assert.equal(w.at(-1).year, 2025, 'the current year is incomplete, so it is left out');
  for (const s of w) assert.equal(s.startDate.slice(0, 4), s.endDate.slice(0, 4));
});

test('the request is a POST with a form body, not a GET with a query string', async () => {
  const seen = [];
  const fetchFn = async (url, opts) => {
    seen.push({ url, opts });
    return { ok: true, status: 200, json: async () => [] };
  };
  await ingest(REGION, {
    fetchFn, log: () => {}, sleep: async () => {},
    bases: ['https://example.test/npn_portal'],
    windows: [{ year: 2024, startDate: '2024-01-01', endDate: '2024-12-31' }],
  });
  assert.ok(seen.length >= 1);
  const { url, opts } = seen[0];
  assert.equal(url, endpoint('https://example.test/npn_portal'));
  assert.equal(url.includes('?'), false, 'the parameters belong in the body');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.ok(opts.body.includes('request_src=photo-pointer'));
  assert.ok(opts.headers['User-Agent']);
});

test('records from every year are pooled before a date is decided', async () => {
  const byYear = { 2023: 100, 2024: 110 };
  const fetchFn = async (_url, opts) => {
    const year = new URLSearchParams(opts.body).get('start_date').slice(0, 4);
    return { ok: true, status: 200, json: async () => Array.from({ length: 5 }, () => row({
      day_of_year: byYear[year], latitude: 38.9, longitude: -120.9 })) };
  };
  const out = await ingest(REGION, {
    fetchFn, log: () => {}, sleep: async () => {},
    bases: ['https://example.test/npn_portal'],
    windows: [
      { year: 2023, startDate: '2023-01-01', endDate: '2023-12-31' },
      { year: 2024, startDate: '2024-01-01', endDate: '2024-12-31' },
    ],
  });
  // 5 records a year is under MIN_RECORDS; 10 across two years clears it, which
  // is the whole reason we ask for several years rather than the latest one.
  assert.equal(out.length, 1);
  assert.equal(out[0].tags.phenology.records, 10);
});

// The threshold belongs on the fortnight being named, not on the whole season.
// Counting the season let Pacific dogwood be dated 2 February off six sightings
// and Fremont cottonwood off three — a date on a card with nothing behind it.
test('a date needs enough sightings inside the window it names', () => {
  // 30 records, but scattered — no fortnight of them holds MIN_RECORDS.
  const scattered = Array.from({ length: 30 }, (_, i) => row({ day_of_year: 1 + i * 12 }));
  assert.deepEqual(summarize(scattered), [], 'a long thin season is not a date');
  // The same 30 records with a real cluster in them do earn one.
  const withPeak = [...scattered, ...Array.from({ length: MIN_RECORDS }, (_, i) => row({ day_of_year: 100 + i }))];
  const out = summarize(withPeak);
  assert.equal(out.length, 1);
  assert.ok(out[0].records >= MIN_RECORDS);
  assert.ok(out[0].seasonRecords > out[0].records, 'and the card still shows how diffuse the season is');
});
