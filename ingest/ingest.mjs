#!/usr/bin/env node
// Ingest runner. Commands:
//
//   node ingest/ingest.mjs probe      — 15-second Overpass reachability check
//                                       (verdict DATA / BLOCKED) before any run
//   node ingest/ingest.mjs osm        — fetch + normalize OSM → data/sources/osm.json
//   node ingest/ingest.mjs merge      — resolve all data/sources/*.json → data/spots.json
//   node ingest/ingest.mjs validate   — schema-check committed data (CI gate, exit 1)
//   node ingest/ingest.mjs all        — osm + merge + validate
//
// Adapters that need the network run on a GitHub Actions runner
// (.github/workflows/ingest-osm.yml) — the session sandbox can't reach
// Overpass. Everything is deterministic (stable sort, 2-space JSON) so
// re-ingest diffs are honest.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveSpots } from '../src/model/dedup.js';
import { makeSpot, validateSpot } from '../src/model/spot.js';
import { validateRegion } from '../src/model/region.js';
import * as osm from './adapters/osm-overpass.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_DIR = path.join(ROOT, 'data', 'sources');
const SPOTS_FILE = path.join(ROOT, 'data', 'spots.json');

const today = new Date().toISOString().slice(0, 10);
const log = (m) => console.log(m);

async function loadRegionFile() {
  const region = JSON.parse(await readFile(path.join(ROOT, 'config', 'region.json'), 'utf8'));
  const errs = validateRegion(region);
  if (errs.length) {
    for (const e of errs) console.error(`region config: ${e}`);
    process.exit(1);
  }
  return region;
}

async function cmdProbe() {
  // Tiny query: a handful of viewpoints near Sacramento. Settles in seconds
  // whether Overpass answers with DATA from this machine.
  const q = '[out:json][timeout:10];node["tourism"="viewpoint"](38.4,-121.6,38.8,-121.2);out 3;';
  for (const host of osm.OVERPASS_HOSTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(host, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': osm.USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(20000),
        });
        const body = await res.text();
        const isJson = body.trimStart().startsWith('{');
        log(`${host} → HTTP ${res.status}, ${isJson ? 'JSON' : 'non-JSON'} (${body.length} bytes)`);
        if (res.ok && isJson) {
          log('VERDICT: DATA — Overpass reachable from here.');
          return;
        }
        if (res.status === 429) {
          log('  rate-limited, waiting 20s…');
          await new Promise((r) => setTimeout(r, 20000));
          continue;
        }
        break; // other statuses: try the next host
      } catch (e) {
        log(`${host} → ${e.message}`);
        break;
      }
    }
  }
  log('VERDICT: BLOCKED — run ingest on a GitHub Actions runner (ingest-osm.yml).');
  process.exit(2);
}

async function cmdOsm() {
  const region = await loadRegionFile();
  const records = await osm.ingest(region, { today, log });
  if (records.length === 0) {
    console.error('osm: 0 records — refusing to write an empty file over good data');
    process.exit(1);
  }
  // Carry forward first_seen from the previous file so provenance survives
  // re-ingest (last_seen refreshes to today).
  const prev = await readJsonIfExists(path.join(SOURCES_DIR, 'osm.json'));
  if (prev) {
    const seen = new Map();
    for (const r of prev.records ?? []) {
      for (const s of r.sources ?? []) seen.set(`${s.source}:${s.source_id}`, s.first_seen);
    }
    for (const r of records) {
      for (const s of r.sources) {
        const first = seen.get(`${s.source}:${s.source_id}`);
        if (first) s.first_seen = first;
      }
    }
  }
  records.sort((a, b) =>
    (a.sources[0].source_id).localeCompare(b.sources[0].source_id)
  );
  await mkdir(SOURCES_DIR, { recursive: true });
  await writeFile(
    path.join(SOURCES_DIR, 'osm.json'),
    JSON.stringify({ source: osm.meta, region: region.id, builtAt: today, records }, null, 2) + '\n'
  );
  log(`wrote data/sources/osm.json (${records.length} records)`);
}

async function cmdMerge() {
  const region = await loadRegionFile();
  const files = (await readdir(SOURCES_DIR).catch(() => [])).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('merge: no data/sources/*.json — run an adapter first');
    process.exit(1);
  }
  const all = [];
  for (const f of files) {
    const doc = JSON.parse(await readFile(path.join(SOURCES_DIR, f), 'utf8'));
    log(`merge: ${f} (${doc.records.length} records, source=${doc.source?.source})`);
    all.push(...doc.records.map((r) => makeSpot(r)));
  }
  const spots = resolveSpots(all);
  const collapsed = all.length - spots.length;
  await writeFile(
    SPOTS_FILE,
    JSON.stringify({ region: region.id, builtAt: today, spots }, null, 2) + '\n'
  );
  log(`wrote data/spots.json: ${spots.length} spots from ${all.length} records (${collapsed} collapsed by dedup)`);
}

async function cmdValidate() {
  const region = await loadRegionFile();
  const doc = await readJsonIfExists(SPOTS_FILE);
  if (!doc) {
    log('validate: no data/spots.json yet (ok on a fresh clone before first ingest)');
    return;
  }
  let bad = 0;
  const ids = new Set();
  for (const s of doc.spots) {
    const errs = validateSpot(s);
    if (ids.has(s.id)) errs.push(`duplicate id: ${s.id}`);
    ids.add(s.id);
    if (
      s.lat < region.bbox.south || s.lat > region.bbox.north ||
      s.lng < region.bbox.west || s.lng > region.bbox.east
    ) {
      errs.push(`outside region bbox`);
    }
    if (errs.length) {
      bad++;
      console.error(`spot ${s.id ?? '?'} (${s.name ?? 'unnamed'}): ${errs.join('; ')}`);
    }
  }
  if (bad) {
    console.error(`validate: ${bad}/${doc.spots.length} spots invalid`);
    process.exit(1);
  }
  log(`validate: ${doc.spots.length} spots ok (region ${doc.region}, builtAt ${doc.builtAt})`);
}

async function readJsonIfExists(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

const cmd = process.argv[2];
const commands = {
  probe: cmdProbe,
  osm: cmdOsm,
  merge: cmdMerge,
  validate: cmdValidate,
  all: async () => { await cmdOsm(); await cmdMerge(); await cmdValidate(); },
};
if (!commands[cmd]) {
  console.error(`usage: node ingest/ingest.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}
await commands[cmd]();
