#!/usr/bin/env node
// Ingest runner. Every command takes an optional REGION ID (the config default
// when omitted). Data is per-region:
//   data/regions/<id>.json          — the merged, enriched spots for a region
//   data/sources/<id>/<source>.json — that region's raw source records
//   data/layers/<id>/...            — that region's derived layer artifacts
//
// Commands:
//   probe                     — Overpass reachability check (verdict DATA/BLOCKED)
//   osm <id>                  — fetch + normalize OSM → data/sources/<id>/osm.json
//   ebird <id>                — normalize the eBird snapshot for <id>
//   markers <id>              — historical markers (Wikidata CC0) for <id>
//   public-lands|inaturalist|commons <id> — enrich <id>'s spots (tag, no re-merge)
//   merge <id>                — resolve data/sources/<id>/*.json → data/regions/<id>.json
//   validate <id>             — schema-check <id>'s committed data (CI gate, exit 1)
//   all <id>                  — osm + ebird + markers + merge + validate for <id>
//
// Network adapters run on a GitHub Actions runner — the sandbox can't reach
// Overpass. Everything is deterministic (stable sort, 2-space JSON).

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveSpots } from '../src/model/dedup.js';
import { makeSpot, validateSpot } from '../src/model/spot.js';
import { validateRegion, pickRegion } from '../src/model/region.js';
import * as osm from './adapters/osm-overpass.mjs';
import * as ebird from './adapters/ebird-hotspots.mjs';
import * as publicLands from './adapters/public-lands.mjs';
import * as inaturalist from './adapters/inaturalist.mjs';
import * as markers from './adapters/wikidata-markers.mjs';
import * as commons from './adapters/commons-photos.mjs';
import { pointInArea, distanceM, inBBox } from '../src/model/geo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config', 'regions.json');

const today = new Date().toISOString().slice(0, 10);
const log = (m) => console.log(m);

// Resolve a region by id (default region when omitted/unknown) and validate it.
async function loadRegionFor(id) {
  const doc = JSON.parse(await readFile(CONFIG, 'utf8'));
  const region = pickRegion(doc, id);
  if (!region) {
    console.error(`no such region '${id}' in config/regions.json`);
    process.exit(1);
  }
  const errs = validateRegion(region);
  if (errs.length) {
    for (const e of errs) console.error(`region ${region.id}: ${e}`);
    process.exit(1);
  }
  return region;
}

function regionPaths(id) {
  return {
    spotsFile: path.join(ROOT, 'data', 'regions', `${id}.json`),
    sourcesDir: path.join(ROOT, 'data', 'sources', id),
    layersDir: path.join(ROOT, 'data', 'layers', id),
  };
}

async function cmdProbe() {
  // Tiny query near Sacramento — settles in seconds whether Overpass answers
  // with DATA from this machine (region-agnostic; the wall is the network).
  const q = '[out:json][timeout:25];node["tourism"="viewpoint"](38.4,-121.6,38.8,-121.2);out 3;';
  for (let round = 0; round < 4; round++) {
    for (const host of osm.OVERPASS_HOSTS) {
      try {
        const res = await fetch(host, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': osm.USER_AGENT },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(40000),
        });
        const body = await res.text();
        const isJson = body.trimStart().startsWith('{');
        log(`${host} → HTTP ${res.status}, ${isJson ? 'JSON' : 'non-JSON'} (${body.length} bytes)`);
        if (res.ok && isJson) { log('VERDICT: DATA — Overpass reachable from here.'); return; }
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

// Write one source's records to data/sources/<id>/<file>, carrying forward
// first_seen from the previous file so provenance survives re-ingest.
async function writeSource(sourcesDir, file, meta, region, records) {
  const prev = await readJsonIfExists(path.join(sourcesDir, file));
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
  await mkdir(sourcesDir, { recursive: true });
  await writeFile(
    path.join(sourcesDir, file),
    JSON.stringify({ source: meta, region: region.id, builtAt: today, records }, null, 2) + '\n'
  );
  log(`wrote data/sources/${region.id}/${file} (${records.length} records)`);
}

async function cmdOsm(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await osm.ingest(region, { today, log });
  if (records.length === 0) {
    console.error('osm: 0 records — refusing to write an empty file over good data');
    process.exit(1);
  }
  await writeSource(P.sourcesDir, 'osm.json', osm.meta, region, records);
}

async function cmdEbird(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  // A region Frame doesn't cover has no committed hotspot snapshot yet. Skip
  // eBird (don't abort the `all` run) — its bird hotspots can be layered in
  // later from Frame (scripts/import-ebird-from-frame.mjs) or the live API.
  if (!(await ebird.hasSnapshot(region))) {
    log(`ebird: no hotspot snapshot for ${region.id} — skipping (add later from Frame or the live eBird API)`);
    return;
  }
  const records = await ebird.ingest(region, { today, log });
  if (records.length === 0) {
    console.error('ebird: 0 records — refusing to write an empty file over good data');
    process.exit(1);
  }
  await writeSource(P.sourcesDir, 'ebird.json', ebird.meta, region, records);
}

async function cmdMarkers(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await markers.ingest(region, { today, log });
  if (records.length === 0) {
    // The 0-guard protects an EXISTING marker file from being clobbered by a
    // transient empty fetch. With no prior file, 0 just means this area has no
    // Wikidata markers yet — skip (don't abort the `all` run so OSM still merges).
    if (await readJsonIfExists(path.join(P.sourcesDir, 'wikidata.json'))) {
      console.error('markers: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`markers: no Wikidata markers for ${region.id} — skipping (none in this area yet)`);
    return;
  }
  await writeSource(P.sourcesDir, 'wikidata.json', markers.meta, region, records);
}

async function requireSpots(P, cmdName) {
  const doc = await readJsonIfExists(P.spotsFile);
  if (!doc) {
    console.error(`${cmdName}: no ${path.relative(ROOT, P.spotsFile)} — run merge first`);
    process.exit(1);
  }
  return doc;
}

async function writeLayer(P, file, obj) {
  await mkdir(P.layersDir, { recursive: true });
  await writeFile(path.join(P.layersDir, file), JSON.stringify(obj, null, 2) + '\n');
}

// Enrich a region's spots with public-land membership (re-run after a full OSM
// refresh, which regenerates the spots file).
async function cmdPublicLands(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const areas = await publicLands.ingest(region, { log });
  if (areas.length === 0) {
    // Protect an existing layer from a transient empty fetch on re-run. On a
    // brand-new region with no prior layer, 0 just means no OSM-mapped public
    // land here (e.g. rural Lowndes County, GA) — record an empty layer and
    // skip, don't fail the enrichment.
    if (await readJsonIfExists(path.join(P.layersDir, 'public-lands.json'))) {
      console.error('public-lands: 0 areas — refusing to wipe tags');
      process.exit(1);
    }
    log(`[${region.id}] no OSM-mapped protected areas — writing an empty public-lands layer`);
    await writeLayer(P, 'public-lands.json', { source: publicLands.meta, builtAt: today, count: 0, areas: [] });
    return;
  }
  const doc = await requireSpots(P, 'public-lands');
  const areaSize = (a) => (a.bbox.north - a.bbox.south) * (a.bbox.east - a.bbox.west);
  let tagged = 0;
  for (const s of doc.spots) {
    const hits = areas.filter((a) => pointInArea(s.lat, s.lng, a));
    if (hits.length) {
      hits.sort((a, b) => areaSize(a) - areaSize(b));
      const h = hits[0];
      (s.tags ??= {}).publicLand = { name: h.name, class: h.class, operator: h.operator };
      tagged++;
    } else if (s.tags?.publicLand) {
      delete s.tags.publicLand;
    }
  }
  await writeFile(P.spotsFile, JSON.stringify(doc, null, 2) + '\n');
  await writeLayer(P, 'public-lands.json', {
    source: publicLands.meta, builtAt: today, count: areas.length,
    areas: areas.map((a) => ({ name: a.name, class: a.class, operator: a.operator, bbox: a.bbox })),
  });
  log(`[${region.id}] tagged ${tagged}/${doc.spots.length} spots on public land (${areas.length} areas)`);
}

// Enrich a region's spots with nearby iNaturalist wildlife density (non-bird).
async function cmdINaturalist(id) {
  const RADIUS_M = 500;
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const obs = await inaturalist.ingest(region, { log });
  if (obs.length === 0) {
    console.error('inaturalist: 0 observations — refusing to wipe tags');
    process.exit(1);
  }
  const doc = await requireSpots(P, 'inaturalist');
  const CELL = 0.006;
  const grid = new Map();
  const gkey = (lat, lng) => `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}`;
  for (const s of doc.spots) {
    const k = gkey(s.lat, s.lng);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(s);
  }
  const acc = new Map();
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
    if (a && a.n >= 3) {
      const topGuild = Object.entries(a.guilds).sort((x, y) => y[1] - x[1])[0][0];
      (s.tags ??= {}).inaturalist = { observations: a.n, species: a.taxa.size, topGuild };
      tagged++;
    } else if (s.tags?.inaturalist) {
      delete s.tags.inaturalist;
    }
  }
  await writeFile(P.spotsFile, JSON.stringify(doc, null, 2) + '\n');
  await writeLayer(P, 'inaturalist.json', { source: inaturalist.meta, builtAt: today, observations: obs.length, spotsTagged: tagged });
  log(`[${region.id}] tagged ${tagged}/${doc.spots.length} spots with iNaturalist wildlife density (${obs.length} observations)`);
}

// Enrich a region's spots with nearby Wikimedia Commons photo density.
async function cmdCommons(id) {
  const MIN = 3;
  const RADIUS_M = commons.RADIUS_M;
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const doc = await requireSpots(P, 'commons');
  const images = await commons.harvestBBox(region.bbox, { log });
  if (images.length === 0) {
    console.error('commons: 0 photos harvested — refusing to wipe (likely a fetch problem)');
    process.exit(1);
  }
  const CELL = 0.008;
  const grid = new Map();
  const gkey = (lat, lng) => `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}`;
  for (const im of images) {
    const k = gkey(im.lat, im.lng);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(im);
  }
  let tagged = 0;
  for (const s of doc.spots) {
    const clat = Math.round(s.lat / CELL);
    const clng = Math.round(s.lng / CELL);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const im of grid.get(`${clat + dy}:${clng + dx}`) ?? []) {
          if (distanceM(s, im) <= RADIUS_M) n++;
        }
      }
    }
    if (n >= MIN) {
      (s.tags ??= {}).commons = { photos: n };
      tagged++;
    } else if (s.tags?.commons) {
      delete s.tags.commons;
    }
  }
  await writeFile(P.spotsFile, JSON.stringify(doc, null, 2) + '\n');
  await writeLayer(P, 'commons.json', { source: commons.meta, builtAt: today, photosHarvested: images.length, spotsTagged: tagged });
  log(`[${region.id}] tagged ${tagged}/${doc.spots.length} spots with Commons photo density (${images.length} photos harvested)`);
}

// Enrichment tags are written AFTER merge by the layer passes — a fresh merge
// would drop them, so carry them forward for spots whose id is unchanged.
const ENRICH_TAGS = ['bortle', 'publicLand', 'horizon', 'inaturalist', 'commons'];

async function cmdMerge(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const files = (await readdir(P.sourcesDir).catch(() => [])).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`merge: no data/sources/${region.id}/*.json — run an adapter first`);
    process.exit(1);
  }
  const prev = await readJsonIfExists(P.spotsFile);
  const prevTags = new Map();
  for (const s of prev?.spots ?? []) {
    const carry = {};
    for (const k of ENRICH_TAGS) if (s.tags?.[k] !== undefined) carry[k] = s.tags[k];
    if (Object.keys(carry).length) prevTags.set(s.id, carry);
  }
  const all = [];
  for (const f of files) {
    const doc = JSON.parse(await readFile(path.join(P.sourcesDir, f), 'utf8'));
    log(`merge: ${region.id}/${f} (${doc.records.length} records, source=${doc.source?.source})`);
    all.push(...doc.records.map((r) => makeSpot(r)));
  }
  const resolved = resolveSpots(all);
  // Drop spots whose point falls outside the region bbox — `out center` gives
  // the CENTROID of large multi-county areas (a national forest, a wilderness),
  // which can land tens of km outside the region. Those aren't useful pins here.
  const spots = resolved.filter((s) => inBBox(s.lat, s.lng, region.bbox));
  const offMap = resolved.length - spots.length;
  const collapsed = all.length - resolved.length;
  let carried = 0;
  for (const s of spots) {
    const carry = prevTags.get(s.id);
    if (carry) { s.tags = { ...(s.tags ?? {}), ...carry }; carried++; }
  }
  await mkdir(path.dirname(P.spotsFile), { recursive: true });
  await writeFile(P.spotsFile, JSON.stringify({ region: region.id, builtAt: today, spots }, null, 2) + '\n');
  log(`wrote data/regions/${region.id}.json: ${spots.length} spots from ${all.length} records ` +
      `(${collapsed} collapsed by dedup; ${offMap} dropped outside bbox; ${carried} kept enrichment tags across the merge)`);
}

async function cmdValidate(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const doc = await readJsonIfExists(P.spotsFile);
  if (!doc) {
    log(`validate: no data/regions/${region.id}.json yet (ok before first ingest)`);
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
      errs.push('outside region bbox');
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
const regionId = process.argv[3]; // optional — defaults to the config default
const commands = {
  probe: cmdProbe,
  osm: cmdOsm,
  ebird: cmdEbird,
  'public-lands': cmdPublicLands,
  inaturalist: cmdINaturalist,
  commons: cmdCommons,
  markers: cmdMarkers,
  merge: cmdMerge,
  validate: cmdValidate,
  all: async (id) => { await cmdOsm(id); await cmdEbird(id); await cmdMarkers(id); await cmdMerge(id); await cmdValidate(id); },
};
if (!commands[cmd]) {
  console.error(`usage: node ingest/ingest.mjs <${Object.keys(commands).join('|')}> [regionId]`);
  process.exit(1);
}
await commands[cmd](regionId);
