#!/usr/bin/env node
// Should tonight's scheduled ingest actually ask Overpass anything?
//
// THE POINT OF THIS FILE is Noah's condition (2026-07-27): run "until complete,
// without just running that forever blindly". A cron that fires every night and
// re-fetches a region that is already done is precisely the blind hammering we
// spent the afternoon removing. So the schedule wakes, asks this, and in the
// normal case exits in a second having touched nobody.
//
// It answers one of four ways:
//   run       — there is real work to do
//   complete  — this region is done for the way it is currently defined
//   refresh   — done, but the data is old enough to be worth redoing
//   exhausted — it has failed too many nights running; stop and say so loudly
//
// The state lives in ingest/inputs/<region>-osm-schedule.json, committed, so the
// decision survives the runner and is auditable in the history.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { pickRegion } from '../src/model/region.js';
import { bboxTiles, TAG_RULES } from '../ingest/adapters/osm-overpass.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// How many nights in a row it may fail before it stops trying. A configuration
// that cannot succeed must not poke a volunteer service every night forever;
// after this it needs a person to look at it.
export const MAX_ATTEMPTS = 7;

// OpenStreetMap keeps changing, so a finished region is worth redoing
// eventually — but monthly, not nightly. This is the difference between a
// maintained dataset and a cron nobody turned off.
export const REFRESH_DAYS = 30;

// WHAT WE ARE ASKING FOR. If the box, the tiling or the selectors change, the
// old answer is not an answer to the new question, so "complete" stops applying
// and it runs again. This is what made three counties appear: the question
// changed, and the state has to notice.
export function fingerprint(region, rules = TAG_RULES) {
  const b = region.bbox;
  const parts = [
    `${b.south},${b.west},${b.north},${b.east}`,
    `tiles:${bboxTiles(b).length}`,
    `rules:${rules.map((r) => `${r.k}=${r.v}`).sort().join(',')}`,
  ].join('|');
  return createHash('sha256').update(parts).digest('hex').slice(0, 16);
}

export function decide(state, fp, { now = new Date(), refreshDays = REFRESH_DAYS, maxAttempts = MAX_ATTEMPTS } = {}) {
  // A different question — anything we knew about the old one does not apply.
  if (state?.fingerprint !== fp) {
    return { action: 'run', why: state ? 'the region is defined differently now' : 'never run for this region' };
  }
  if (state.completedAt) {
    const ageDays = (now - Date.parse(state.completedAt)) / 864e5;
    if (ageDays < refreshDays) {
      return { action: 'complete', why: `finished ${Math.floor(ageDays)} days ago; next refresh at ${refreshDays}` };
    }
    return { action: 'refresh', why: `finished ${Math.floor(ageDays)} days ago — OpenStreetMap has moved on` };
  }
  if ((state.attempts ?? 0) >= maxAttempts) {
    return {
      action: 'exhausted',
      why: `${state.attempts} attempts without finishing. Stopping rather than asking a `
        + `volunteer service again every night. Someone needs to look at this.`,
    };
  }
  return { action: 'run', why: `attempt ${(state.attempts ?? 0) + 1} of ${maxAttempts}` };
}

function stateFile(regionId) {
  return path.join(ROOT, 'ingest', 'inputs', `${regionId}-osm-schedule.json`);
}

// WHY THIS EXISTS: so the run says what happened without anyone reading a log.
// The sweep spans nights, and the person who wants to know whether it finished
// should not have to open a job transcript to find out — the commit subject and
// the run's summary page should just say it. Everything here is read from
// committed files, so it is as true tomorrow as it was at the moment it ran.
export function statusLine({ state, cachedTiles, totalTiles, spots }) {
  const tiles = `${cachedTiles} of ${totalTiles} map tiles`;
  const places = spots == null ? '' : `, ${spots.toLocaleString('en-US')} places`;
  if (state?.completedAt) return `complete — ${tiles}${places}`;
  if (!cachedTiles) return `no tiles answered yet${places}`;
  return `unfinished — ${tiles} answered${places}; it will carry on tomorrow night`;
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function status(region) {
  const cache = await readJson(path.join(ROOT, 'ingest', 'inputs', `${region.id}-osm-tiles.json`));
  const data = await readJson(path.join(ROOT, 'data', 'regions', `${region.id}.json`));
  return statusLine({
    state: await readState(region.id),
    cachedTiles: Object.keys(cache?.tiles ?? {}).length,
    totalTiles: bboxTiles(region.bbox).length,
    spots: data?.spots?.length ?? null,
  });
}

async function readState(regionId) {
  try { return JSON.parse(await readFile(stateFile(regionId), 'utf8')); } catch { return null; }
}

async function writeState(regionId, state) {
  await mkdir(path.dirname(stateFile(regionId)), { recursive: true });
  await writeFile(stateFile(regionId), JSON.stringify(state, null, 2) + '\n');
}

// CLI: `decide <region>` prints the action (the workflow gates on it);
//      `attempt <region>` records that tonight tried;
//      `done <region>` records that it finished;
//      `status <region>` prints one plain sentence about where it has got to.
const [cmd, regionId] = process.argv.slice(2);
if (cmd) {
  const doc = JSON.parse(await readFile(path.join(ROOT, 'config', 'regions.json'), 'utf8'));
  const region = pickRegion(doc, regionId);
  if (!region) { console.error(`no such region '${regionId}'`); process.exit(1); }
  const fp = fingerprint(region);
  const state = await readState(region.id);

  if (cmd === 'decide') {
    const { action, why } = decide(state, fp);
    console.log(`${action}: ${why}`);
    // The workflow reads this line.
    console.log(`::set-action::${action}`);
    if (action === 'exhausted') process.exitCode = 0; // not a failure of the runner
  } else if (cmd === 'attempt') {
    const carry = state?.fingerprint === fp ? state : {};
    await writeState(region.id, {
      fingerprint: fp,
      attempts: (carry.attempts ?? 0) + 1,
      lastAttemptAt: new Date().toISOString(),
      completedAt: null,
    });
  } else if (cmd === 'done') {
    await writeState(region.id, {
      fingerprint: fp,
      attempts: 0,
      lastAttemptAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    console.log(`osm-schedule: ${region.id} recorded complete`);
  } else if (cmd === 'status') {
    console.log(await status(region));
  } else {
    console.error('usage: osm-schedule.mjs <decide|attempt|done|status> <region>');
    process.exit(1);
  }
}
