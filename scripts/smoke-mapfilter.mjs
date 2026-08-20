// The map must obey the "must have" layer filters the same way the list does.
//
// Two real bugs this pins. The report that found them: the Photographed filter
// worked in the LIST view and not on the MAP.
//   1. The matches were all OFF-SCREEN, so the map sat empty while the banner
//      announced "286 places match" — indistinguishable from a broken filter.
//   2. setSpotFilter treated an EMPTY match set as "no filter", so a filter that
//      matched nothing showed EVERY pin instead of none.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = join(ROOT, p === '/' ? '/index.html' : p);
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try { localStorage.setItem('pointer.welcomed', '1'); localStorage.setItem('pointer.seenVersion', '99.0.0'); } catch {}
});
await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
for (const d of await page.$$('dialog[open]')) await page.evaluate((el) => el.close(), d);

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

// Real map markers only — `.pin` also matches the legend's inline swatches.
const markers = () => page.$$eval('.leaflet-marker-icon', (e) => e.length).catch(() => 0);
const banner = () => page.$eval('.map-filter-banner', (e) => e.textContent.trim()).catch(() => '');
const chip = async (label) => {
  for (const b of await page.$$('button')) {
    if ((await b.textContent() || '').replace(/✓/g, '').trim() === label) { await b.click(); await page.waitForTimeout(900); return true; }
  }
  return false;
};

await (await page.$('.filters-toggle'))?.click();
await page.waitForTimeout(300);
await chip('Show all');
const allPins = await markers();
check(allPins > 0, `all pin types on → map has markers (${allPins})`);

// 1. The reported bug: a layer whose matches are off-screen.
await chip('Photographed');
const photoPins = await markers();
const photoBanner = await banner();
check(photoPins > 0, `"Photographed" on → map still shows markers (${photoPins}), not an empty map`);
check(/\d+ places match/.test(photoBanner), `banner reports the match count (${photoBanner.replace('Clear', '')})`);

// The map must agree with the list, which is what made the bug visible.
for (const b of await page.$$('button')) if ((await b.textContent() || '').trim() === 'List') { await b.click(); break; }
await page.waitForTimeout(900);
const rows = await page.$$eval('.list-row', (e) => e.length).catch(() => 0);
check(rows > 0, `list shows the same filter's results (${rows} rows)`);
for (const b of await page.$$('button')) if ((await b.textContent() || '').trim() === 'Map') { await b.click(); break; }
await page.waitForTimeout(1200);
const backToMap = await markers();
check(backToMap > 0, `returning to Map keeps the filtered markers (${backToMap})`);

// 2. Zero matches must show NO pins — not fall back to showing everything.
//    A nonsense search is the shortest real user path into an empty match set.
await page.fill('.search-row input', 'zzzzqqqq-no-such-place');
await page.waitForTimeout(1200);
const nPins = await markers();
const emptyBanner = await banner();
check(nPins === 0, `a filter matching nothing shows 0 markers (${nPins}), not every pin`);
check(/No places match/.test(emptyBanner), `banner says so plainly ("${emptyBanner.replace('Clear', '')}")`);

// And clearing it brings the map back.
await page.fill('.search-row input', '');
await page.waitForTimeout(1200);
const backPins = await markers();
check(backPins > 0, `clearing the search restores the map (${backPins} markers)`);

console.log('pageerrors:', errors.length, errors.slice(0, 3));
if (errors.length) fails.push('pageerrors');
await browser.close();
server.close();
if (fails.length) { console.error('\nFAILED:', fails.join('; ')); process.exit(1); }
console.log('\nsmoke-mapfilter: green');
