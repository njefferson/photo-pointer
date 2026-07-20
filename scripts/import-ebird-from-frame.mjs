#!/usr/bin/env node
// Import eBird hotspots for a region (or all regions) from the sibling
// Bird-location-scouting ("Frame") app, which already commits full hotspot data
// for these counties. The reuse Noah asked for: don't re-fetch what a sibling
// repo already curated.
//
// We take only the hotspot IDENTITY + LOCATION (locId, name, lat, lng,
// nSpecies) — NOT the per-month observation frequencies. That subset is the
// wildlife_hotspot spot; it carries eBird attribution and puts the place on the
// map. Observation data stays in Frame (eBird's terms restrict bulk redistribution).
//
// Usage:
//   node scripts/import-ebird-from-frame.mjs [regionId|all] [path-to-frame-repo]
// Default region: all. Default frame path: ../Bird-location-scouting.
// Writes ingest/inputs/<regionId>-ebird-hotspots.json (committed; the ingest
// reads it with no key and no network). For a region Frame does NOT cover, use
// the live eBird API instead (see the TODO in ingest/adapters/ebird-hotspots.mjs).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2] ?? 'all';
const framePath = process.argv[3] ?? path.join(ROOT, '..', 'Bird-location-scouting');

const doc = JSON.parse(await readFile(path.join(ROOT, 'config', 'regions.json'), 'utf8'));
const targets = which === 'all' ? doc.regions : doc.regions.filter((r) => r.id === which);
if (targets.length === 0) {
  console.error(`no region '${which}' in config/regions.json`);
  process.exit(1);
}

for (const region of targets) {
  const hotspots = [];
  const countyBuilt = {};
  let missing = 0;
  for (const county of region.counties) {
    const code = county.ebird_region;
    if (!code) { console.error(`  ${county.name} has no ebird_region — skipping`); continue; }
    const file = path.join(framePath, 'frame', 'data', 'counties', `${code}.json`);
    let cd;
    try {
      cd = JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      console.error(`  ${code} (${county.name}): NOT in Frame (${e.code ?? e.message}) — skipped`);
      missing++;
      continue;
    }
    countyBuilt[code] = cd.builtAt ?? null;
    for (const h of cd.hotspots ?? []) {
      if (typeof h.lat !== 'number' || typeof h.lng !== 'number') continue;
      hotspots.push({ locId: h.locId, name: h.name, lat: h.lat, lng: h.lng, nSpecies: h.nSpecies ?? null, county: code });
    }
    console.log(`  ${code} (${county.name}): ${cd.hotspots?.length ?? 0} hotspots, built ${cd.builtAt}`);
  }
  hotspots.sort((a, b) => a.locId.localeCompare(b.locId));
  const out = {
    source: 'ebird',
    region: region.id,
    note: 'Hotspot identity + location only, imported from Bird-location-scouting county data. Observation frequencies omitted (eBird terms). Refresh with scripts/import-ebird-from-frame.mjs.',
    attribution: 'Hotspot data from eBird, Cornell Lab of Ornithology',
    license: 'eBird API Terms of Use — attribution required, no bulk redistribution',
    countyBuilt,
    hotspots,
  };
  await mkdir(path.join(ROOT, 'ingest', 'inputs'), { recursive: true });
  const outFile = path.join(ROOT, 'ingest', 'inputs', `${region.id}-ebird-hotspots.json`);
  await writeFile(outFile, JSON.stringify(out, null, 2) + '\n');
  console.log(`[${region.id}] wrote ingest/inputs/${region.id}-ebird-hotspots.json (${hotspots.length} hotspots${missing ? `, ${missing} counties not in Frame` : ''})\n`);
}
