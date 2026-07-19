#!/usr/bin/env node
// Import eBird hotspots for the configured region from the sibling
// Bird-location-scouting ("Frame") app, which already commits full hotspot
// data for these counties. This is the reuse Noah asked for: don't re-fetch
// what a sibling repo already curated.
//
// We take only the hotspot IDENTITY + LOCATION (locId, name, lat, lng,
// nSpecies) — NOT the per-month observation frequencies. That subset is the
// wildlife_hotspot spot; it carries the eBird attribution and is enough to
// put the place on the map. Observation data stays in Frame (eBird's terms
// restrict bulk redistribution).
//
// Usage:
//   node scripts/import-ebird-from-frame.mjs [path-to-frame-repo]
// Default frame path: ../Bird-location-scouting (sibling checkout).
// Writes ingest/inputs/ebird-hotspots.json (committed; the ingest reads it
// with no key and no network). Refresh by re-running when Frame's data or the
// region config changes. For a region Frame does NOT cover, use the live eBird
// API instead (see the TODO in ingest/adapters/ebird-hotspots.mjs).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const framePath = process.argv[2] ?? path.join(ROOT, '..', 'Bird-location-scouting');

const region = JSON.parse(await readFile(path.join(ROOT, 'config', 'region.json'), 'utf8'));

const hotspots = [];
const countyBuilt = {};
for (const county of region.counties) {
  const code = county.ebird_region;
  if (!code) {
    console.error(`county ${county.name} has no ebird_region — skipping`);
    continue;
  }
  const file = path.join(framePath, 'frame', 'data', 'counties', `${code}.json`);
  let doc;
  try {
    doc = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    console.error(`could not read ${file}: ${e.message}`);
    console.error('Pass the Frame repo path as the first argument if it lives elsewhere.');
    process.exit(1);
  }
  countyBuilt[code] = doc.builtAt ?? null;
  for (const h of doc.hotspots ?? []) {
    if (typeof h.lat !== 'number' || typeof h.lng !== 'number') continue;
    hotspots.push({
      locId: h.locId,
      name: h.name,
      lat: h.lat,
      lng: h.lng,
      nSpecies: h.nSpecies ?? null,
      county: code,
    });
  }
  console.log(`${code} (${county.name}): ${doc.hotspots?.length ?? 0} hotspots, built ${doc.builtAt}`);
}

hotspots.sort((a, b) => a.locId.localeCompare(b.locId));

const out = {
  source: 'ebird',
  note: 'Hotspot identity + location only, imported from the Bird-location-scouting county data. Observation frequencies deliberately omitted (eBird terms). Refresh with scripts/import-ebird-from-frame.mjs.',
  attribution: 'Hotspot data from eBird, Cornell Lab of Ornithology',
  license: 'eBird API Terms of Use — attribution required, no bulk redistribution',
  countyBuilt,
  hotspots,
};

await mkdir(path.join(ROOT, 'ingest', 'inputs'), { recursive: true });
await writeFile(
  path.join(ROOT, 'ingest', 'inputs', 'ebird-hotspots.json'),
  JSON.stringify(out, null, 2) + '\n'
);
console.log(`wrote ingest/inputs/ebird-hotspots.json (${hotspots.length} hotspots)`);
