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
import * as curiosities from './adapters/wikidata-curiosities.mjs';
import * as gnis from './adapters/gnis.mjs';
import * as nrhp from './adapters/nrhp.mjs';
import * as ridb from './adapters/ridb.mjs';
import * as padus from './adapters/padus.mjs';
import * as commons from './adapters/commons-photos.mjs';
import * as phenology from './adapters/phenology.mjs';
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
  // What a recent run already got, so we never ask Overpass to redo work it has
  // already done for us.
  // The file name carries WHICH QUESTION was asked. osm-features runs the same
  // adapter over the same tiles with a DIFFERENT rule set, and replaying one as
  // the other would silently swap two sources' data for each other.
  const cacheFile = path.join(ROOT, 'ingest', 'inputs', `${region.id}-osm-tiles.json`);
  const cache = (await readJsonIfExists(cacheFile))?.tiles ?? {};
  let records;
  const keepCache = async (tiles) => {
    if (!tiles || !Object.keys(tiles).length) return;
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ builtAt: today, tiles }) + '\n');
  };
  try {
    records = await osm.ingest(region, { today, log, cache });
  } catch (e) {
    // The adapter abandons a sweep when Overpass is clearly struggling. That is
    // a deliberate stop, not a crash: say so plainly, keep the good data that is
    // already committed, and exit so nobody reads a partial sweep as the truth.
    if (e.gaveUp) {
      // Keep what they already gave us even though we write no region data —
      // a re-run then asks only about the tiles that are actually missing.
      await keepCache(e.cache);
      console.error(`osm: stopped early to stop asking a struggling service `
        + `(${e.partial?.length ?? 0} places gathered before that). Nothing written; `
        + `the tiles that answered are kept, so a re-run asks only for what is missing.`);
      process.exit(1);
    }
    throw e;
  }
  if (records.length === 0) {
    console.error('osm: 0 records — refusing to write an empty file over good data');
    process.exit(1);
  }
  await keepCache(records.cache);
  await writeSource(P.sourcesDir, 'osm.json', osm.meta, region, records);
}

// SOURCE #2: a SEPARATE light Overpass query for just the curiosity feature tags
// (natural=waterfall/hot_spring/…, man_made=lighthouse, historic=archaeological_
// site/wreck) → its own source file the merge folds in. Kept out of the main osm
// query, which got too heavy for Overpass's 300s limit when they were combined.
async function cmdOsmFeatures(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  // Its OWN tile cache — same tiles, different question (see cmdOsm).
  const cacheFile = path.join(ROOT, 'ingest', 'inputs', `${region.id}-osm-features-tiles.json`);
  const cache = (await readJsonIfExists(cacheFile))?.tiles ?? {};
  let records;
  try {
    records = await osm.ingest(region, { today, log, rules: osm.FEATURE_RULES, cache });
  } catch (e) {
    if (e.gaveUp) {
      if (e.cache && Object.keys(e.cache).length) {
        await mkdir(path.dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, JSON.stringify({ builtAt: today, tiles: e.cache }) + '\n');
      }
      console.error('osm-features: stopped early to stop asking a struggling service; '
        + 'the tiles that answered are kept, so a re-run asks only for what is missing.');
      process.exit(1);
    }
    throw e;
  }
  if (records.cache && Object.keys(records.cache).length) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ builtAt: today, tiles: records.cache }) + '\n');
  }
  if (records.length === 0) {
    // No feature nodes here — skip without clobbering a good existing file.
    if (await readJsonIfExists(path.join(P.sourcesDir, 'osm-features.json'))) {
      console.error('osm-features: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`osm-features: none for ${region.id} — skipping`);
    return;
  }
  await writeSource(P.sourcesDir, 'osm-features.json', osm.meta, region, records);
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

// Atlas-Obscura-type curiosities from Wikidata (CC0) → oddity spots. Its own
// source file (wikidata-curiosities.json) that cmdMerge folds in like the rest.
async function cmdCuriosities(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await curiosities.ingest(region, { today, log });
  if (records.length === 0) {
    // 0-guard: don't clobber a good existing file with a transient empty fetch;
    // a brand-new region with no curiosities just skips (doesn't abort `all`).
    if (await readJsonIfExists(path.join(P.sourcesDir, 'wikidata-curiosities.json'))) {
      console.error('curiosities: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`curiosities: none for ${region.id} — skipping`);
    return;
  }
  await writeSource(P.sourcesDir, 'wikidata-curiosities.json', curiosities.meta, region, records);
}

// SOURCE #3: USGS GNIS named natural features (waterfalls, arches, caves, hot
// springs) via The National Map geonames REST service — US public domain,
// independent of Overpass/Wikidata. Its own source file the merge folds in.
async function cmdGnis(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await gnis.ingest(region, { today, log });
  if (records.length === 0) {
    // 0-guard: don't clobber a good existing file with a transient empty fetch;
    // a region with no named natural features just skips (doesn't abort `all`).
    if (await readJsonIfExists(path.join(P.sourcesDir, 'gnis.json'))) {
      console.error('gnis: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`gnis: none for ${region.id} — skipping`);
    return;
  }
  await writeSource(P.sourcesDir, 'gnis.json', gnis.meta, region, records);
}

// The National Register of Historic Places (NPS, US public domain) — the deep
// historic layer beyond OSM/Wikidata plaques. Its own source file the merge folds in.
async function cmdNrhp(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await nrhp.ingest(region, { today, log });
  if (records.length === 0) {
    if (await readJsonIfExists(path.join(P.sourcesDir, 'nrhp.json'))) {
      console.error('nrhp: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`nrhp: none for ${region.id} — skipping`);
    return;
  }
  await writeSource(P.sourcesDir, 'nrhp.json', nrhp.meta, region, records);
}

// Recreation.gov / RIDB federal facilities (campgrounds, trailheads, day-use,
// visitor centers) — US public domain, but the ONLY source needing an API key,
// read from the RIDB_API_KEY repo secret on the runner. Never logged.
async function cmdRidb(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await ridb.ingest(region, { today, log });
  if (records.length === 0) {
    if (await readJsonIfExists(path.join(P.sourcesDir, 'ridb.json'))) {
      console.error('ridb: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`ridb: none for ${region.id} — skipping`);
    return;
  }
  await writeSource(P.sourcesDir, 'ridb.json', ridb.meta, region, records);
}

// PAD-US (USGS) — WHO manages a protected area, WHAT KIND it is, and WHETHER the
// public may enter. An ENRICHMENT (point-in-polygon onto existing spots), not a
// source of new pins; complements the OSM public-lands boundaries with the
// authoritative manager/designation/access facts, including state/county/local land.
async function cmdPadus(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const areas = await padus.ingest(region, { log });
  if (areas.length === 0) {
    if (await readJsonIfExists(path.join(P.layersDir, 'padus.json'))) {
      console.error('padus: 0 areas — refusing to wipe tags');
      process.exit(1);
    }
    log(`[${region.id}] no PAD-US areas here — writing an empty layer`);
    await writeLayer(P, 'padus.json', { source: padus.meta, builtAt: today, count: 0, areas: [] });
    return;
  }
  const doc = await requireSpots(P, 'padus');
  const areaSize = (a) => (a.bbox.north - a.bbox.south) * (a.bbox.east - a.bbox.west);
  let tagged = 0;
  for (const s of doc.spots) {
    const hits = areas.filter((a) => pointInArea(s.lat, s.lng, a));
    if (hits.length) {
      // Smallest containing area wins — the most specific claim about this point
      // (a county park inside a national forest describes the spot better).
      hits.sort((a, b) => areaSize(a) - areaSize(b));
      const h = hits[0];
      const t = {};
      if (h.name) t.name = h.name;
      if (h.manager) t.manager = h.manager;
      if (h.designation) t.designation = h.designation;
      if (h.access) t.access = h.access;
      if (Object.keys(t).length) { (s.tags ??= {}).padus = t; tagged++; }
    } else if (s.tags?.padus) {
      delete s.tags.padus;
    }
  }
  await writeFile(P.spotsFile, JSON.stringify(doc, null, 2) + '\n');
  await writeLayer(P, 'padus.json', {
    source: padus.meta, builtAt: today, count: areas.length,
    areas: areas.map((a) => ({ name: a.name, manager: a.manager, designation: a.designation, access: a.access, bbox: a.bbox })),
  });
  log(`[${region.id}] tagged ${tagged}/${doc.spots.length} spots with PAD-US manager/access (${areas.length} areas)`);
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
// Count, per spot, how many harvested photos fall within RADIUS_M — a local
// grid pass, no further requests. Only the spots PASSED IN are touched, so an
// incremental harvest can't wipe the ones it deliberately skipped.
function countCommons(spots, images, _doc) {
  const MIN = 3;
  const RADIUS_M = commons.RADIUS_M;
  const CELL = 0.008;
  const grid = new Map();
  const gkey = (lat, lng) => `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}`;
  for (const im of images) {
    const k = gkey(im.lat, im.lng);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(im);
  }
  for (const s of spots) {
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
    if (n >= MIN) (s.tags ??= {}).commons = { photos: n };
    else if (s.tags?.commons) delete s.tags.commons;
  }
}

// The harvested photo COORDINATES, kept ingest-side (ingest/inputs/, never
// shipped to the browser) so the discovery pass can cluster them without asking
// Wikimedia for anything a second time.
async function saveCommonsPoints(regionId, images) {
  const file = path.join(ROOT, 'ingest', 'inputs', `${regionId}-commons-points.json`);
  await mkdir(path.dirname(file), { recursive: true });
  // Round to ~1 m; full float precision is noise and triples the file size.
  const pts = images.map((im) => [Number(im.lat.toFixed(5)), Number(im.lng.toFixed(5)), im.title ?? null]);
  await writeFile(file, JSON.stringify({ builtAt: today, count: pts.length, points: pts }) + '\n');
  log(`  commons: kept ${pts.length} photo coordinates for the discovery pass`);
}

// Places people photograph that nothing in our data lists. Reads the coordinates
// the harvest already kept — NO network at all — clusters them, and drops every
// cluster a known spot already explains. What survives is, by construction,
// somewhere our catalogues missed.
// Bloom and autumn-colour timing as dated events (USA-NPN, volunteer records).
async function cmdPhenology(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const records = await phenology.ingest(region, { today, log });
  if (records.length === 0) {
    if (await readJsonIfExists(path.join(P.sourcesDir, 'phenology.json'))) {
      console.error('phenology: 0 records — refusing to write an empty file over good data');
      process.exit(1);
    }
    log(`phenology: none for ${region.id} — skipping`);
    return;
  }
  await writeSource(P.sourcesDir, 'phenology.json', phenology.meta, region, records);
  log(`[${region.id}] ${records.length} bloom/colour events`);
}

async function cmdCommonsClusters(id) {
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const doc = await requireSpots(P, 'commons-clusters');
  const file = path.join(ROOT, 'ingest', 'inputs', `${region.id}-commons-points.json`);
  const input = await readJsonIfExists(file);
  if (!input?.points?.length) {
    console.error(`commons-clusters: no photo coordinates for ${region.id} — run \`commons\` first`);
    process.exit(1);
  }
  const pts = input.points.map(([lat, lng, title]) => ({ lat, lng, title }));
  const clusters = commons.clusterPoints(pts);
  let fresh = commons.unexplainedBy(clusters, doc.spots);
  // Only ask about the ones we are keeping, and only if the harvest predates
  // titles being kept. A coordinate file gathered since needs no requests.
  if (fresh.length && !fresh.some((c) => c.titles?.length)) {
    log(`commons-clusters: asking what ${fresh.length} discovered places are photographs OF `
      + `(one small request each, ${commons.WIKIMEDIA_MIN_GAP_MS} ms apart)`);
    fresh = await commons.fetchClusterTitles(fresh, { log });
  }
  log(`commons-clusters: ${clusters.length} photo clusters, ${clusters.length - fresh.length} already explained by a known spot`);
  if (!fresh.length) {
    log(`commons-clusters: nothing undiscovered in ${region.id} — skipping`);
    return;
  }
  // Drop the ones the titles reveal to be one camera rig, not a place.
  const rigs = fresh.filter((c) => c.titles?.length && commons.isSingleRig(c.titles));
  if (rigs.length) {
    log(`commons-clusters: ${rigs.length} clusters are ONE camera rig moving, not a place people go `
      + `(360 or dashcam captures — every frame gets its own coordinate). Dropped:`);
    for (const r of rigs) log(`  ${r.spots} coords @ ${r.lat.toFixed(4)},${r.lng.toFixed(4)} — `
      + `${Math.round(commons.singleRigShare(r.titles) * 100)}% of files share one device signature`);
  }
  fresh = fresh.filter((c) => !(c.titles?.length && commons.isSingleRig(c.titles)));

  // And the ones that are somewhere, but not somewhere you could go and take
  // the photograph — a shop, a nursery's stock, an organisation's own records.
  const notPlaces = [];
  fresh = fresh.filter((c) => {
    const verdict = commons.photoDestination(commons.describeCluster(c.titles)?.subject, c.titles);
    if (!verdict.ok) notPlaces.push({ c, why: verdict.why });
    return verdict.ok;
  });
  if (notPlaces.length) {
    log(`commons-clusters: ${notPlaces.length} clusters are not somewhere you could go and photograph the thing:`);
    for (const { c, why } of notPlaces) {
      log(`  ${String(c.spots).padStart(3)} coords @ ${c.lat.toFixed(4)},${c.lng.toFixed(4)} — `
        + `"${commons.describeCluster(c.titles)?.subject ?? '?'}" — ${why}`);
    }
  }
  if (!fresh.length) {
    log(`commons-clusters: nothing left once single-rig captures are removed — skipping`);
    return;
  }
  const records = fresh.map((c) => ({
    // NO INVENTED NAME. We know people photograph here and nothing more; the app
    // renders an unnamed photo-backed spot as "A photographed spot".
    name: null,
    lat: c.lat,
    lng: c.lng,
    category: 'photo_cluster',
    subject_type: ['landscape'],
    best_light: [],
    best_season: [],
    access_difficulty: null,
    notes: null,
    // `spots` is what earned the pin — the number of DISTINCT coordinates a
    // camera was put down at. `photos` is how much material exists there, which
    // is worth showing but must not be what decides.
    tags: {
      commons: { photos: c.photos, spots: c.spots },
      // What the photographers called their own files, where enough of them
      // agree. Reported as evidence, never adopted as the place's name.
      ...(commons.describeCluster(c.titles) ? { subject: commons.describeCluster(c.titles) } : {}),
      discovered: 'photo-density',
    },
    sources: [{
      source: commons.meta.source,
      source_id: `cluster:${c.lat.toFixed(5)},${c.lng.toFixed(5)}`,
      source_license: commons.meta.license,
      source_url: `https://commons.wikimedia.org/wiki/Special:Search?search=nearcoord:1km,${c.lat.toFixed(5)},${c.lng.toFixed(5)}`,
      first_seen: today,
      last_seen: today,
    }],
  }));
  await writeSource(P.sourcesDir, 'commons-clusters.json', commons.meta, region, records);
  log(`[${region.id}] ${records.length} photographed places nothing else in our data lists `
    + `(densest ${records[0].tags.commons.photos} photos)`);
  reportCoverageGaps(region, doc.spots, records);
}

// WHERE OUR SOURCES DO NOT REACH. A discovery pass that starts from behaviour is
// also, for free, an audit of coverage: a place people demonstrably photograph
// and we know nothing about within kilometres is not an obscure place, it is a
// place we never asked about. The home region's map is a BOX; its OSM ingest is
// by COUNTY, and everything in the box outside those counties has no OSM data at
// all. This prints that mismatch instead of leaving it to be noticed by accident.
function reportCoverageGaps(region, spots, records) {
  const CELL = 0.1; // ~11 km
  const key = (s) => `${Math.floor(s.lat / CELL)}:${Math.floor(s.lng / CELL)}`;
  const known = new Map();
  for (const s of spots) {
    if (s.category === 'photo_cluster') continue;
    known.set(key(s), (known.get(key(s)) ?? 0) + 1);
  }
  const bare = new Map();
  for (const r of records) {
    if ((known.get(key(r)) ?? 0) >= 5) continue;
    const g = bare.get(key(r)) ?? bare.set(key(r), { n: 0, known: known.get(key(r)) ?? 0, lat: r.lat, lng: r.lng }).get(key(r));
    g.n++;
  }
  if (!bare.size) { log('coverage: every discovery sits among places we already know'); return; }
  const total = [...bare.values()].reduce((a, b) => a + b.n, 0);
  log(`coverage: ${total} of ${records.length} discoveries are in areas where we know `
    + `almost nothing — probably not obscure places, but places our sources were never asked about:`);
  for (const g of [...bare.values()].sort((a, b) => b.n - a.n)) {
    log(`  ${String(g.n).padStart(3)} discovered · ${String(g.known).padStart(4)} known  near `
      + `${g.lat.toFixed(2)},${g.lng.toFixed(2)}`);
  }
}

async function cmdCommons(id) {
  const MIN = 3;
  const RADIUS_M = commons.RADIUS_M;
  const region = await loadRegionFor(id);
  const P = regionPaths(region.id);
  const doc = await requireSpots(P, 'commons');
  // Pick the cheaper sweep. Tiling a county beats probing its thousands of
  // spots; probing a sparse statewide region beats tiling all of California.
  const tiles = commons.tileCenters(region.bbox).length;
  let images;
  if (doc.spots.length < tiles) {
    // DON'T ASK TWICE FOR WHAT WE ALREADY HAVE. The layer file records which
    // spots were successfully probed and when; those are skipped on a re-run.
    // The California re-run cost 205 requests to Wikimedia when only 84 were
    // actually missing — that is someone else's bandwidth spent to be told what
    // we already knew. `force` re-probes everything when the data really is stale.
    const prev = await readJsonIfExists(path.join(P.layersDir, 'commons.json'));
    const probed = (!process.env.COMMONS_FORCE && prev?.probed) || {};
    const FRESH_DAYS = 30;
    const cutoff = Date.now() - FRESH_DAYS * 864e5;
    const stale = (sid) => !probed[sid] || Date.parse(probed[sid]) < cutoff;
    const todo = doc.spots.filter((sp) => stale(sp.id));
    const skipped = doc.spots.length - todo.length;
    log(`commons: ${doc.spots.length} spots vs ${tiles} tiles — probing per spot`
      + (skipped ? ` (${skipped} already probed within ${FRESH_DAYS} days, skipping)` : ''));
    if (!todo.length) { log('commons: nothing to re-probe — leaving the data as it is'); return; }
    const res = await commons.harvestAroundSpots(todo, { log });
    images = res.images;
    // REFUSE a holed result. Each failed probe becomes a place that silently
    // reports "no photos nearby", and committing that is worse than committing
    // nothing — it looks like an answer. Wikimedia throttles runner IPs, so this
    // is a re-run, not a bug.
    const limit = Math.max(2, Math.floor(todo.length * 0.02));
    if (res.failed.length > limit) {
      console.error(`commons: ${res.failed.length}/${todo.length} probes failed (limit ${limit}) — refusing to commit a partial harvest; re-run`);
      process.exit(1);
    }
    // Only the spots we actually probed may have their tag rewritten — a
    // partial harvest must not wipe the ones we deliberately skipped.
    countCommons(todo, images, doc);
    const nowProbed = { ...probed };
    for (const sp of todo) nowProbed[sp.id] = today;
    await writeLayer(P, 'commons.json', {
      source: commons.meta, builtAt: today,
      photosHarvested: images.length,
      spotsTagged: doc.spots.filter((sp) => sp.tags?.commons).length,
      probed: nowProbed,
    });
    await saveCommonsPoints(region.id, images);
    await writeFile(P.spotsFile, JSON.stringify(doc, null, 2) + '\n');
    log(`[${region.id}] tagged ${doc.spots.filter((sp) => sp.tags?.commons).length}/${doc.spots.length} spots with Commons photo density `
      + `(${images.length} photos, ${todo.length} probed, ${skipped} skipped)`);
    return;
  } else {
    log(`commons: ${tiles} tiles vs ${doc.spots.length} spots — sweeping by tile`);
    images = await commons.harvestBBox(region.bbox, { log });
  }
  if (images.length === 0) {
    console.error('commons: 0 photos harvested — refusing to wipe (likely a fetch problem)');
    process.exit(1);
  }
  countCommons(doc.spots, images, doc);
  await saveCommonsPoints(region.id, images);
  const tagged = doc.spots.filter((s) => s.tags?.commons).length;
  await writeFile(P.spotsFile, JSON.stringify(doc, null, 2) + '\n');
  await writeLayer(P, 'commons.json', { source: commons.meta, builtAt: today, photosHarvested: images.length, spotsTagged: tagged });
  log(`[${region.id}] tagged ${tagged}/${doc.spots.length} spots with Commons photo density (${images.length} photos harvested)`);
}

// Enrichment tags are written AFTER merge by the layer passes — a fresh merge
// would drop them, so carry them forward for spots whose id is unchanged.
const ENRICH_TAGS = ['bortle', 'publicLand', 'horizon', 'inaturalist', 'commons', 'padus'];

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
  'osm-features': cmdOsmFeatures,
  ebird: cmdEbird,
  'public-lands': cmdPublicLands,
  inaturalist: cmdINaturalist,
  commons: cmdCommons,
  'commons-clusters': cmdCommonsClusters,
  phenology: cmdPhenology,
  markers: cmdMarkers,
  curiosities: cmdCuriosities,
  gnis: cmdGnis,
  nrhp: cmdNrhp,
  ridb: cmdRidb,
  padus: cmdPadus,
  merge: cmdMerge,
  validate: cmdValidate,
  all: async (id) => { await cmdOsm(id); await cmdOsmFeatures(id); await cmdEbird(id); await cmdMarkers(id); await cmdCuriosities(id); await cmdGnis(id); await cmdNrhp(id); await cmdRidb(id); await cmdMerge(id); await cmdValidate(id); },
};
if (!commands[cmd]) {
  console.error(`usage: node ingest/ingest.mjs <${Object.keys(commands).join('|')}> [regionId]`);
  process.exit(1);
}
await commands[cmd](regionId);
