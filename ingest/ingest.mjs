#!/usr/bin/env node
// Ingest runner. Commands:
//
//   node ingest/ingest.mjs probe      — 15-second Overpass reachability check
//                                       (verdict DATA / BLOCKED) before any run
//   node ingest/ingest.mjs osm        — fetch + normalize OSM → data/sources/osm.json
//   node ingest/ingest.mjs ebird      — normalize the eBird snapshot → data/sources/ebird.json
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
import * as ebird from './adapters/ebird-hotspots.mjs';
import * as publicLands from './adapters/public-lands.mjs';
import * as inaturalist from './adapters/inaturalist.mjs';
import { pointInArea, distanceM } from '../src/model/geo.js';

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
  const q = '[out:json][timeout:25];node["tourism"="viewpoint"](38.4,-121.6,38.8,-121.2);out 3;';
  // Overpass public instances 504/timeout when busy — that is transient, not
  // "blocked". Cycle the hosts several times with backoff before concluding
  // the network is the problem (a real egress block fails instantly, not slow).
  for (let round = 0; round < 4; round++) {
    for (const host of osm.OVERPASS_HOSTS) {
      try {
        const res = await fetch(host, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': osm.USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(40000),
        });
        const body = await res.text();
        const isJson = body.trimStart().startsWith('{');
        log(`${host} → HTTP ${res.status}, ${isJson ? 'JSON' : 'non-JSON'} (${body.length} bytes)`);
        if (res.ok && isJson) {
          log('VERDICT: DATA — Overpass reachable from here.');
          return;
        }
      } catch (e) {
        log(`${host} → ${e.message}`);
      }
    }
    if (round < 3) {
      log(`  all hosts unhappy this round, backing off ${20 * (round + 1)}s…`);
      await new Promise((r) => setTimeout(r, 20000 * (round + 1)));
    }
  }
  log('VERDICT: BLOCKED — Overpass unreachable after retries (transient overload or egress block).');
  process.exit(2);
}

// Write one source's records to data/sources/<file>, carrying forward
// first_seen from the previous file so provenance survives re-ingest.
async function writeSource(file, meta, region, records) {
  const prev = await readJsonIfExists(path.join(SOURCES_DIR, file));
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
  records.sort((a, b) => a.sources[0].source_id.localeCompare(b.sources[0].source_id));
  await mkdir(SOURCES_DIR, { recursive: true });
  await writeFile(
    path.join(SOURCES_DIR, file),
    JSON.stringify({ source: meta, region: region.id, builtAt: today, records }, null, 2) + '\n'
  );
  log(`wrote data/sources/${file} (${records.length} records)`);
}

async function cmdOsm() {
  const region = await loadRegionFile();
  const records = await osm.ingest(region, { today, log });
  if (records.length === 0) {
    console.error('osm: 0 records — refusing to write an empty file over good data');
    process.exit(1);
  }
  await writeSource('osm.json', osm.meta, region, records);
}

async function cmdEbird() {
  const region = await loadRegionFile();
  const records = await ebird.ingest(region, { today, log });
  if (records.length === 0) {
    console.error('ebird: 0 records — refusing to write an empty file over good data');
    process.exit(1);
  }
  await writeSource('ebird.json', ebird.meta, region, records);
}

// Enrich the committed spots with public-land membership. Runs on its own
// (like light-pollution) so it survives — but note: a full OSM refresh
// regenerates spots.json, so re-run public-lands (and light-pollution) after.
async function cmdPublicLands() {
  const region = await loadRegionFile();
  const areas = await publicLands.ingest(region, { log });
  if (areas.length === 0) {
    console.error('public-lands: 0 areas — refusing to wipe tags');
    process.exit(1);
  }
  const doc = await readJsonIfExists(SPOTS_FILE);
  if (!doc) {
    console.error('public-lands: no data/spots.json — run merge first');
    process.exit(1);
  }
  const areaSize = (a) => (a.bbox.north - a.bbox.south) * (a.bbox.east - a.bbox.west);
  let tagged = 0;
  for (const s of doc.spots) {
    const hits = areas.filter((a) => pointInArea(s.lat, s.lng, a));
    if (hits.length) {
      // Smallest containing area = most specific (a reserve inside a forest).
      hits.sort((a, b) => areaSize(a) - areaSize(b));
      const h = hits[0];
      (s.tags ??= {}).publicLand = { name: h.name, class: h.class, operator: h.operator };
      tagged++;
    } else if (s.tags?.publicLand) {
      delete s.tags.publicLand;
    }
  }
  await writeFile(SPOTS_FILE, JSON.stringify(doc, null, 2) + '\n');
  await mkdir(path.join(ROOT, 'data', 'layers'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'data', 'layers', 'public-lands.json'),
    JSON.stringify({
      source: publicLands.meta, builtAt: today, count: areas.length,
      areas: areas.map((a) => ({ name: a.name, class: a.class, operator: a.operator, bbox: a.bbox })),
    }, null, 2) + '\n'
  );
  log(`tagged ${tagged}/${doc.spots.length} spots on public land (${areas.length} areas)`);
}

// Enrich spots with nearby iNaturalist wildlife density (non-bird, open-
// licensed, research-grade). Assigns each observation to the NEAREST spot
// within RADIUS_M and aggregates. Like public-lands, re-run after a full OSM
// refresh (which regenerates spots.json and drops the tags).
async function cmdINaturalist() {
  const RADIUS_M = 500;
  const region = await loadRegionFile();
  const obs = await inaturalist.ingest(region, { log });
  if (obs.length === 0) {
    console.error('inaturalist: 0 observations — refusing to wipe tags');
    process.exit(1);
  }
  const doc = await readJsonIfExists(SPOTS_FILE);
  if (!doc) {
    console.error('inaturalist: no data/spots.json — run merge first');
    process.exit(1);
  }
  // Spot grid (~0.006° ≈ 600 m cells) for a bounded nearest-spot search.
  const CELL = 0.006;
  const grid = new Map();
  const gkey = (lat, lng) => `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}`;
  for (const s of doc.spots) {
    const k = gkey(s.lat, s.lng);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(s);
  }
  const acc = new Map(); // spot.id -> { n, taxa:Set, guilds:{} }
  for (const o of obs) {
    const clat = Math.round(o.lat / CELL);
    const clng = Math.round(o.lng / CELL);
    let best = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const s of grid.get(`${clat + dy}:${clng + dx}`) ?? []) {
          const d = distanceM(o, s);
          if (d <= RADIUS_M && (!best || d < best.d)) best = { s, d };
        }
      }
    }
    if (!best) continue;
    let a = acc.get(best.s.id);
    if (!a) acc.set(best.s.id, (a = { n: 0, taxa: new Set(), guilds: {} }));
    a.n++;
    if (o.taxon) a.taxa.add(o.taxon);
    a.guilds[o.guild] = (a.guilds[o.guild] ?? 0) + 1;
  }
  let tagged = 0;
  for (const s of doc.spots) {
    const a = acc.get(s.id);
    if (a && a.n >= 3) { // ≥3 open observations to count as a wildlife spot
      const topGuild = Object.entries(a.guilds).sort((x, y) => y[1] - x[1])[0][0];
      (s.tags ??= {}).inaturalist = { observations: a.n, species: a.taxa.size, topGuild };
      tagged++;
    } else if (s.tags?.inaturalist) {
      delete s.tags.inaturalist;
    }
  }
  await writeFile(SPOTS_FILE, JSON.stringify(doc, null, 2) + '\n');
  await mkdir(path.join(ROOT, 'data', 'layers'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'data', 'layers', 'inaturalist.json'),
    JSON.stringify({ source: inaturalist.meta, builtAt: today, observations: obs.length, spotsTagged: tagged }, null, 2) + '\n'
  );
  log(`tagged ${tagged}/${doc.spots.length} spots with iNaturalist wildlife density (${obs.length} observations)`);
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
  ebird: cmdEbird,
  'public-lands': cmdPublicLands,
  inaturalist: cmdINaturalist,
  merge: cmdMerge,
  validate: cmdValidate,
  all: async () => { await cmdOsm(); await cmdEbird(); await cmdMerge(); await cmdValidate(); },
};
if (!commands[cmd]) {
  console.error(`usage: node ingest/ingest.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}
await commands[cmd]();
