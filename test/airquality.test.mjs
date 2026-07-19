import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aqiCategory, airToday } from '../src/model/airquality.js';

test('aqiCategory maps the US AQI bands', () => {
  assert.equal(aqiCategory(20), 'good');
  assert.equal(aqiCategory(75), 'moderate');
  assert.equal(aqiCategory(130), 'unhealthy for sensitive groups');
  assert.equal(aqiCategory(180), 'unhealthy');
  assert.equal(aqiCategory(260), 'very unhealthy');
  assert.equal(aqiCategory(400), 'hazardous');
});

test('airToday returns today’s peak AQI and category', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ hourly: { us_aqi: [30, 42, 51, 38], pm2_5: [5, 8, 10, 6] } }) });
  const a = await airToday(38.5, -121.4, { fetchFn });
  assert.equal(a.maxAqi, 51);
  assert.equal(a.category, 'moderate');
  assert.equal(a.smoke, false);
});

test('airToday flags likely wildfire smoke on a PM2.5 spike', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ hourly: { us_aqi: [120, 165], pm2_5: [40, 88] } }) });
  const a = await airToday(38.5, -121.4, { fetchFn });
  assert.equal(a.maxAqi, 165);
  assert.equal(a.category, 'unhealthy');
  assert.equal(a.pm25peak, 88);
  assert.equal(a.smoke, true);
});

test('airToday fails soft on a network/HTTP error', async () => {
  assert.equal(await airToday(38, -121, { fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await airToday(38, -121, { fetchFn: async () => { throw new Error('offline'); } }), null);
});
