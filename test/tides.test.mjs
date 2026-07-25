import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestStation, parsePredictions, formatTides, tidesToday, ymd, MAX_STATION_KM } from '../src/model/tides.js';

const STATIONS = [
  { id: '9418767', name: 'North Spit, Humboldt Bay', lat: 40.7663, lng: -124.2172 },
  { id: '8729108', name: 'Panama City', lat: 30.1523, lng: -85.6669 },
  { id: '9414290', name: 'San Francisco', lat: 37.8063, lng: -122.4659 },
];

test('nearestStation picks the closest station within range', () => {
  const s = nearestStation(40.8, -124.16, STATIONS); // Arcata/Humboldt coast
  assert.equal(s.id, '9418767');
  assert.ok(s.distanceKm < MAX_STATION_KM);
});

test('nearestStation returns null for an inland spot (no meaningful tide)', () => {
  assert.equal(nearestStation(38.68, -120.98, STATIONS), null); // Cameron Park, inland
  assert.equal(nearestStation(44.6, -110.5, STATIONS), null);   // Yellowstone
  assert.equal(nearestStation(40.8, -124.16, []), null);
  assert.equal(nearestStation(40.8, -124.16, null), null);
});

test('ymd formats a local date as yyyymmdd', () => {
  assert.equal(ymd(new Date(2026, 6, 4)), '20260704');
  assert.equal(ymd(new Date(2026, 11, 25)), '20261225');
});

test('parsePredictions maps NOAA hi/lo rows', () => {
  const rows = parsePredictions({ predictions: [
    { t: '2026-07-25 06:12', v: '0.412', type: 'L' },
    { t: '2026-07-25 12:40', v: '5.06', type: 'H' },
    { t: 'bad', v: 'x', type: 'H' },
  ] });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { type: 'low', time: '06:12', feet: 0.412 });
  assert.equal(rows[1].type, 'high');
});

test('formatTides renders a readable 12-hour line', () => {
  const s = formatTides({ events: [
    { type: 'low', time: '06:12', feet: 0.4 },
    { type: 'high', time: '12:40', feet: 5.1 },
    { type: 'low', time: '18:55', feet: 1.1 },
  ] });
  assert.equal(s, 'Low 6:12am (0.4 ft) · High 12:40pm (5.1 ft) · Low 6:55pm (1.1 ft)');
  assert.equal(formatTides(null), null);
  assert.equal(formatTides({ events: [] }), null);
});

test('tidesToday returns null inland without calling the predictions API', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ stations: STATIONS }) };
  };
  const t = await tidesToday(44.6, -110.5, { fetchFn }); // Yellowstone
  assert.equal(t, null);
  assert.equal(calls.filter((u) => /datagetter/.test(u)).length, 0); // no wasted call
});

test('tidesToday fetches predictions for a coastal spot', async () => {
  const fetchFn = async (url) => ({
    ok: true, status: 200,
    json: async () => (/stations\.json/.test(url)
      ? { stations: STATIONS }
      : { predictions: [
          { t: '2026-07-25 06:12', v: '0.4', type: 'L' },
          { t: '2026-07-25 12:40', v: '5.1', type: 'H' },
        ] }),
  });
  const t = await tidesToday(40.8, -124.16, { fetchFn, date: new Date(2026, 6, 25) });
  assert.equal(t.stationId, '9418767');
  assert.equal(t.events.length, 2);
  assert.match(formatTides(t), /Low 6:12am/);
});

test('tidesToday fails soft when NOAA is unavailable', async () => {
  const bad = async () => { throw new Error('offline'); };
  assert.equal(await tidesToday(40.8, -124.16, { fetchFn: bad }), null);
});
