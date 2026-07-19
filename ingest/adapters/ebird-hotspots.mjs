// eBird hotspots — WORKING (wildlife_hotspot).
//
// LICENSE: eBird API Terms of Use — attribution required ("Data from eBird,
// Cornell Lab of Ornithology"); bulk redistribution of observation data is
// restricted. We ingest hotspot NAME + COORDINATES only (the safe subset),
// never observation frequencies.
//
// SOURCE: this adapter normalizes ingest/inputs/ebird-hotspots.json, a
// committed snapshot imported from the sibling Bird-location-scouting app
// (which already commits full hotspot data for these counties). No key, no
// network — refresh the snapshot with scripts/import-ebird-from-frame.mjs.
// For a region that app does NOT cover, fetch from the live API instead:
//   GET https://api.ebird.org/v2/ref/hotspot/{ebird_region}?fmt=json
//   header 'X-eBirdApiToken: <EBIRD_API_TOKEN>'  (per county in region config)
// then map each row the same way as normalizeHotspot() below.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const meta = {
  source: 'ebird',
  name: 'eBird hotspots (Cornell Lab of Ornithology)',
  license: 'eBird API Terms of Use — attribution required, no bulk redistribution',
  attribution: 'Hotspot data from eBird, Cornell Lab of Ornithology',
  status: 'working',
};

// Normalize one hotspot snapshot row to a Spot-shaped record.
export function normalizeHotspot(h, today) {
  if (typeof h.lat !== 'number' || typeof h.lng !== 'number' || !h.locId) return null;
  return {
    name: h.name ?? null,
    lat: h.lat,
    lng: h.lng,
    category: 'wildlife_hotspot',
    // Birds are a dawn subject; wildlife generally.
    subject_type: ['birds', 'wildlife'],
    best_light: ['sunrise', 'golden_hour'],
    best_season: [],
    access_difficulty: 'unknown',
    notes: null,
    tags: h.nSpecies != null ? { ebird_species: h.nSpecies } : {},
    sources: [
      {
        source: meta.source,
        source_id: h.locId,
        source_license: meta.license,
        source_url: `https://ebird.org/hotspot/${h.locId}`,
        first_seen: today,
        last_seen: today,
      },
    ],
  };
}

export async function ingest(region, { today, log = () => {} } = {}) {
  const file = path.join(ROOT, 'ingest', 'inputs', 'ebird-hotspots.json');
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    throw new Error(
      `ebird: cannot read the hotspot snapshot (${e.message}). Generate it with scripts/import-ebird-from-frame.mjs`
    );
  }
  const records = [];
  for (const h of snapshot.hotspots ?? []) {
    const rec = normalizeHotspot(h, today);
    if (rec) records.push(rec);
  }
  log(`ebird: ${records.length} hotspots from snapshot (built ${JSON.stringify(snapshot.countyBuilt ?? {})})`);
  return records;
}
