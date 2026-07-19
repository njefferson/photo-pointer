import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObs, guildOf, ingest, meta } from '../ingest/adapters/inaturalist.mjs';

test('normalizeObs keeps open licenses and reads geojson coordinates', () => {
  const o = normalizeObs({
    id: 1, license_code: 'CC-BY',
    geojson: { coordinates: [-121.3, 38.6] },
    taxon: { preferred_common_name: 'Mule Deer', iconic_taxon_name: 'Mammalia' },
  });
  assert.equal(o.lat, 38.6);
  assert.equal(o.lng, -121.3);
  assert.equal(o.taxon, 'Mule Deer');
  assert.equal(o.guild, 'mammals');
  assert.equal(o.license, 'cc-by');
});

test('normalizeObs rejects closed / all-rights-reserved licenses', () => {
  assert.equal(normalizeObs({ id: 2, license_code: 'CC-BY-NC', geojson: { coordinates: [-121, 38] }, taxon: {} }), null);
  assert.equal(normalizeObs({ id: 3, license_code: null, geojson: { coordinates: [-121, 38] }, taxon: {} }), null);
});

test('normalizeObs falls back to the location string and rejects missing coords', () => {
  const o = normalizeObs({ id: 4, license_code: 'cc0', location: '38.5,-121.1', taxon: { name: 'Newt', iconic_taxon_name: 'Amphibia' } });
  assert.equal(o.lat, 38.5);
  assert.equal(o.guild, 'amphibians');
  assert.equal(normalizeObs({ id: 5, license_code: 'cc0', taxon: {} }), null);
});

test('guildOf maps iconic taxa, defaulting to wildlife', () => {
  assert.equal(guildOf('Reptilia'), 'reptiles');
  assert.equal(guildOf('Insecta'), 'insects');
  assert.equal(guildOf('Fungi'), 'wildlife');
});

test('ingest paginates, filters, and stops on a short page (mocked fetch)', async () => {
  const region = { bbox: { south: 38, west: -122, north: 39, east: -121 } };
  const page1 = { total_results: 3, results: [
    { id: 1, license_code: 'cc-by', geojson: { coordinates: [-121.5, 38.5] }, taxon: { name: 'A', iconic_taxon_name: 'Mammalia' } },
    { id: 2, license_code: 'all-rights-reserved', geojson: { coordinates: [-121.5, 38.5] }, taxon: { name: 'B', iconic_taxon_name: 'Insecta' } },
  ] };
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => page1 });
  const obs = await ingest(region, { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(obs.length, 1, 'only the open-licensed record survives');
  assert.equal(obs[0].guild, 'mammals');
});

test('adapter declares open-license-only in its meta', () => {
  assert.match(meta.license, /CC0\/CC-BY\/CC-BY-SA/);
  assert.equal(meta.status, 'working');
});
