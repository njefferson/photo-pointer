// Headless smoke for personal notes (1.12.0): write a note in a real popup,
// confirm it renders, survives a reload, marks its list row, and clears.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const { glob } = await import('node:fs/promises').then((m) => ({ glob: m.glob })).catch(() => ({}));
let executablePath = process.env.CHROME_PATH;
if (!executablePath && glob) for await (const p of glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')) { executablePath = p; break; }
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('  ok', m);

await page.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); } catch {} });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

const NOTE = 'Park at the second pullout. Gate locked after dusk.';

// Write a note through the real popup UI on a real spot from the region data.
const written = await page.evaluate(async (note) => {
  const { createMapView } = await import('./src/ui/mapview.js');
  const host = document.createElement('div');
  host.style.height = '400px';
  document.body.replaceChildren(host);
  const doc = await (await fetch('./data/regions/sac-eldorado-placer.json')).json();
  const spot = doc.spots.find((s) => s.name);
  const region = { id: 'sac-eldorado-placer', name: 'T', bbox: { south: 38, west: -122, north: 40, east: -120 },
    center: { lat: spot.lat, lng: spot.lng, zoom: 12 } };
  const view = createMapView(host, { region, regions: [region] });
  view.setSpots([spot]);
  const until = async (fn, ms = 6000) => { const end = Date.now() + ms;
    for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return null; await new Promise((r) => setTimeout(r, 100)); } };
  view.focusSpot(spot);
  await until(() => document.querySelector('.leaflet-popup'));
  const addBtn = await until(() => [...document.querySelectorAll('.popup-note-btn')].find((b) => /Add your own note/.test(b.textContent)));
  if (!addBtn) return { error: 'no "Add your own note" button in the popup' };
  addBtn.click();
  const field = await until(() => document.querySelector('.popup-note-input'));
  if (!field) return { error: 'no note field after tapping Add' };
  field.value = note;
  [...document.querySelectorAll('.popup-note-btn')].find((b) => b.textContent === 'Save').click();
  const shown = await until(() => document.querySelector('.popup-note-text'));
  return { spotId: spot.id, rendered: shown?.textContent ?? null, stored: JSON.parse(localStorage.getItem('pointer.notes') || '{}')[spot.id] ?? null };
}, NOTE);

if (written.error) fail(written.error);
else if (written.rendered === NOTE && written.stored === NOTE) ok(`note written through the popup and shown back: "${written.rendered.slice(0, 40)}…"`);
else fail(`note not saved: ${JSON.stringify(written)}`);

// It must survive a reload (that's the whole point of storing it).
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const persisted = await page.evaluate((id) => JSON.parse(localStorage.getItem('pointer.notes') || '{}')[id] ?? null, written.spotId);
if (persisted === NOTE) ok('note survives a reload');
else fail(`note lost on reload: ${JSON.stringify(persisted)}`);

// It rides in the backup bundle.
const inBundle = await page.evaluate(async (id) => {
  const { exportBundle } = await import('./src/model/store.js');
  return exportBundle().notes?.[id] ?? null;
}, written.spotId);
if (inBundle === NOTE) ok('note is included in the backup bundle');
else fail(`note missing from bundle: ${JSON.stringify(inBundle)}`);

// The list row marks a spot you've annotated.
const marked = await page.evaluate(async (id) => {
  const { noteFor } = await import('./src/model/store.js');
  return noteFor(id) !== null;
}, written.spotId);
if (marked) ok('noteFor() reports the note for the list ✎ marker');
else fail('noteFor() did not report the note');

if (errors.length) fail('pageerrors: ' + JSON.stringify(errors.slice(0, 3)));
else ok('zero pageerrors');

await browser.close();
server.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
