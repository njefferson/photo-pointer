import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIvUrl, parseGauges, nearestGauge, parseMedianRdb, relativeFlow,
  isWaterSpot, flowNow, formatFlow, MAX_GAUGE_KM,
} from '../src/model/streamflow.js';

const REGION = { id: 'test-region', bbox: { south: 38.5, west: -121.5, north: 39.5, east: -120.5 } };

// One timeSeries per (site, parameter) — the shape USGS actually returns.
function ivJson() {
  const site = (id, name, lat, lng, code, value, dateTime) => ({
    sourceInfo: {
      siteName: name,
      siteCode: [{ value: id }],
      geoLocation: { geogLocation: { latitude: lat, longitude: lng } },
    },
    variable: { variableCode: [{ value: code }] },
    values: [{ value: [{ value: String(value), dateTime }] }],
  });
  return { value: { timeSeries: [
    site('11446500', 'AMERICAN R AT FAIR OAKS', 38.6355, -121.2277, '00060', '2140', '2026-07-25T14:15:00.000-07:00'),
    site('11446500', 'AMERICAN R AT FAIR OAKS', 38.6355, -121.2277, '00065', '3.42', '2026-07-25T14:15:00.000-07:00'),
    site('11427000', 'NF AMERICAN R AT NORTH FORK DAM', 38.9363, -121.0233, '00060', '318', '2026-07-25T14:00:00.000-07:00'),
    // A site reporting the USGS "no reading" sentinel is dropped entirely.
    site('99999999', 'BROKEN GAUGE', 39.0, -121.0, '00060', '-999999', '2026-07-25T14:00:00.000-07:00'),
  ] } };
}

test('buildIvUrl asks for discharge + gage height over the region bbox', () => {
  const u = buildIvUrl(REGION.bbox);
  assert.match(u, /bBox=-121\.5000,38\.5000,-120\.5000,39\.5000/);
  assert.match(u, /parameterCd=00060,00065/);
  assert.match(u, /format=json/);
});

test('parseGauges folds parameters into one row per site and drops no-reading sites', () => {
  const g = parseGauges(ivJson());
  assert.equal(g.length, 2); // the -999999 site is gone
  const fairOaks = g.find((x) => x.id === '11446500');
  assert.equal(fairOaks.cfs, 2140);
  assert.equal(fairOaks.gageFt, 3.42);
  assert.equal(fairOaks.name, 'AMERICAN R AT FAIR OAKS');
  assert.ok(fairOaks.when.startsWith('2026-07-25'));
});

test('nearestGauge picks the closest and refuses one that is too far', () => {
  const g = parseGauges(ivJson());
  const near = nearestGauge(38.64, -121.23, g); // right by Fair Oaks
  assert.equal(near.id, '11446500');
  assert.ok(near.distanceKm <= 2);
  // Far out in Nevada — nothing within MAX_GAUGE_KM.
  assert.equal(nearestGauge(39.5, -119.8, g), null);
  assert.equal(nearestGauge(38.6, -121.2, []), null);
});

test('parseMedianRdb reads the median for the requested calendar day', () => {
  const rdb = [
    '# comment line',
    '# another',
    'agency_cd\tsite_no\tparameter_cd\tmonth_nu\tday_nu\tmedian_va',
    '5s\t15s\t5s\t2n\t2n\t12n',
    'USGS\t11446500\t00060\t7\t24\t1900',
    'USGS\t11446500\t00060\t7\t25\t1850',
    'USGS\t11446500\t00060\t7\t26\t1800',
  ].join('\n');
  assert.equal(parseMedianRdb(rdb, 7, 25), 1850);
  assert.equal(parseMedianRdb(rdb, 12, 1), null); // day not present
  assert.equal(parseMedianRdb('', 7, 25), null);
});

test('relativeFlow bands current against the median, and stays silent without one', () => {
  assert.equal(relativeFlow(1850, 1850), 'about normal for the date');
  assert.equal(relativeFlow(300, 1850), 'much lower than usual for the date');
  assert.equal(relativeFlow(1100, 1850), 'lower than usual for the date');
  assert.equal(relativeFlow(4000, 1850), 'higher than usual for the date');
  assert.equal(relativeFlow(9000, 1850), 'much higher than usual for the date');
  assert.equal(relativeFlow(1850, null), null);
  assert.equal(relativeFlow(null, 1850), null);
});

test('isWaterSpot recognises water spots and rejects dry ones', () => {
  assert.ok(isWaterSpot({ category: 'waterfall' }));
  assert.ok(isWaterSpot({ category: 'oddity', tags: { curiosity: 'Waterfall' } }));
  assert.ok(isWaterSpot({ category: 'viewpoint', subject_type: ['water', 'landscape'] }));
  assert.ok(isWaterSpot({ category: 'oddity', tags: { natural: 'hot_spring' } }));
  assert.equal(isWaterSpot({ category: 'ghost_town', subject_type: ['historic'], tags: {} }), false);
  assert.equal(isWaterSpot(null), false);
});

test('flowNow: a waterfall near a gauge gets flow + median context', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/nwis/iv/')) return { ok: true, json: async () => ivJson() };
    return { ok: true, text: async () => [
      'agency_cd\tsite_no\tparameter_cd\tmonth_nu\tday_nu\tmedian_va',
      '5s\t15s\t5s\t2n\t2n\t12n',
      'USGS\t11446500\t00060\t7\t25\t1850',
    ].join('\n') };
  };
  const spot = { category: 'waterfall', lat: 38.64, lng: -121.23, tags: {} };
  const f = await flowNow(spot, REGION, { fetchFn, date: new Date(2026, 6, 25) });
  assert.equal(f.cfs, 2140);
  assert.equal(f.median, 1850);
  assert.equal(f.relative, 'about normal for the date');
  assert.match(formatFlow(f), /2,140 cfs/);
  assert.match(formatFlow(f), /about normal for the date/);
  assert.ok(calls.some((u) => u.includes('/nwis/stat/')));
});

test('flowNow returns null for a dry spot and for water with no gauge near', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ivJson() });
  // Not a water spot → no call needed at all.
  assert.equal(await flowNow({ category: 'ghost_town', lat: 38.64, lng: -121.23, tags: {} }, REGION, { fetchFn }), null);
  // Water, but far from every gauge.
  assert.equal(await flowNow({ category: 'waterfall', lat: 39.49, lng: -119.9, tags: {} }, REGION, { fetchFn }), null);
});

test('flowNow fails soft when USGS is unreachable', async () => {
  const fetchFn = async () => { throw new Error('network down'); };
  const spot = { category: 'waterfall', lat: 38.64, lng: -121.23, tags: {} };
  assert.equal(await flowNow(spot, { id: 'offline-region', bbox: REGION.bbox }, { fetchFn }), null);
  assert.ok(MAX_GAUGE_KM > 0);
});
