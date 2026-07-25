// Headless smoke for the on/off "must have" filter redesign (1.5.16).
// Serves the repo statically and drives Chromium through the new filter bar.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

// The web-task sandbox ships a pre-installed Chromium (path varies by build);
// override with CHROME_PATH, else let Playwright find its own.
const { glob } = await import('node:fs/promises').then((m) => ({ glob: m.glob })).catch(() => ({}));
let executablePath = process.env.CHROME_PATH;
if (!executablePath && glob) {
  for await (const p of glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')) { executablePath = p; break; }
}
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // Sandbox blocks OSM tile egress (tiles bypass the SW by design) — not an app error.
  if (/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource|tile\.openstreetmap/i.test(t)) return;
  errors.push('console: ' + t);
});

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok', msg);

await page.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); } catch {} });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// Dismiss any dialog that still opened (welcome / what's-new) so it can't intercept.
await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
await page.waitForTimeout(150);

// Open the Filters panel.
await page.click('.filters-toggle');
await page.waitForTimeout(200);

// 1) Two labeled groups with the new headings.
const labels = await page.$$eval('.filter-group-label', (els) => els.map((e) => e.textContent.trim()));
if (labels.includes('Show these place types') && labels.some((l) => l.startsWith('Only show places that also have')))
  ok(`group headings: ${JSON.stringify(labels)}`);
else fail(`group headings wrong: ${JSON.stringify(labels)}`);

// 2) No "Dark sky" PIN TYPE chip (it lived in .chips); Dark sky only as a layer.
const pinChips = await page.$$eval('.chips .chip', (els) => els.map((e) => e.textContent.trim()));
if (!pinChips.some((t) => /Dark sky/i.test(t))) ok('no "Dark sky" pin-type chip');
else fail(`"Dark sky" still a pin type: ${JSON.stringify(pinChips)}`);
const layerChips = await page.$$eval('.layer-row .layer-chip', (els) => els.map((e) => e.textContent.trim()));
if (layerChips.some((t) => /Dark sky/i.test(t))) ok(`Dark sky present as a layer: ${layerChips.length} layers`);
else fail(`Dark sky layer missing: ${JSON.stringify(layerChips)}`);

// 3) Layer chip is on/off: tap Dark sky layer on → aria-pressed true + ✓; tap off → false.
const darkSel = '.layer-row .layer-chip >> text=Dark sky';
const darkBtn = page.locator('.layer-row .layer-chip', { hasText: 'Dark sky' }).first();
await darkBtn.click();
await page.waitForTimeout(150);
let pressed = await darkBtn.getAttribute('aria-pressed');
let hasCheck = (await darkBtn.textContent()).includes('✓');
if (pressed === 'true' && hasCheck) ok('layer tap → on (aria-pressed true, ✓ shown)');
else fail(`layer on-state wrong: pressed=${pressed} check=${hasCheck}`);

// 3b) The toggle LOOK: no chip is ever struck-through, and a selected chip is a
// filled pill (its background differs from an unselected one). Standard filter
// chips, not the old amateur strike-through.
const struck = await page.$$eval('.chips .chip, .layer-row .layer-chip',
  (els) => els.filter((e) => getComputedStyle(e).textDecorationLine.includes('line-through')).length);
if (struck === 0) ok('no chip uses strike-through (real toggle look)');
else fail(`${struck} chip(s) still struck through`);
const [selBg, unselBg] = await page.evaluate(() => {
  const sel = document.querySelector('.layer-row .layer-chip[aria-pressed="true"]');
  const unsel = document.querySelector('.layer-row .layer-chip[aria-pressed="false"]');
  return [sel && getComputedStyle(sel).backgroundColor, unsel && getComputedStyle(unsel).backgroundColor];
});
if (selBg && unselBg && selBg !== unselBg) ok(`selected chip is filled (${selBg}) vs unselected (${unselBg})`);
else fail(`selected/unselected fill not distinct: ${selBg} vs ${unselBg}`);

// 4) Layer on while all pin types off → the "turn on a place type" hint shows.
const hint = await page.$('.layer-hint');
const hintText = hint ? (await hint.textContent()) : '';
if (/Turn on a place type above/i.test(hintText)) ok('layer-on-but-no-type hint shown');
else fail(`expected hint, got: ${JSON.stringify(hintText)}`);

// 5) Turn on Viewpoint → list should be viewpoints that ALL carry the Dark sky layer.
await page.locator('.chips .chip', { hasText: 'Viewpoint' }).first().click();
await page.waitForTimeout(200);
// hint should be gone now (a type is on)
const hintGone = (await page.$('.layer-hint')) === null;
if (hintGone) ok('hint clears once a place type is on');
else fail('hint still present after enabling a place type');

// Switch to list, verify rows exist and every row carries Bortle (the Dark sky layer).
await page.locator('.vt-btn', { hasText: 'List' }).first().click();
await page.waitForTimeout(400);
const rowCount = await page.$$eval('.list-row', (r) => r.length);
const bortleRows = await page.$$eval('.list-row .list-meta', (m) => m.filter((e) => /Bortle/i.test(e.textContent)).length);
if (rowCount > 0 && bortleRows === rowCount) ok(`list narrowed to ${rowCount} viewpoints, all Bortle-tagged`);
else fail(`list narrowing wrong: rows=${rowCount} bortleRows=${bortleRows}`);

// 6) Tap the layer OFF from the header while in list → rows should grow (fewer constraints).
// Ensure the panel is open (filtersOpen persists across the view switch).
if ((await page.$('.layer-row')) === null) { await page.click('.filters-toggle'); await page.waitForTimeout(150); }
await page.locator('.layer-row .layer-chip', { hasText: 'Dark sky' }).first().click();
await page.waitForTimeout(300);
const rowCount2 = await page.$$eval('.list-row', (r) => r.length);
if (rowCount2 >= rowCount) ok(`layer off → list widened ${rowCount}→${rowCount2}`);
else fail(`layer off did not widen list: ${rowCount}→${rowCount2}`);

if (errors.length) fail('pageerrors: ' + JSON.stringify(errors.slice(0, 4)));
else ok('zero pageerrors');

await browser.close();
server.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
