// A card opened by TAPPING A PIN must stay open.
//
// HONEST SCOPE: this does NOT reproduce the 2026-07-26 defect — a Ghost town
// card that opened and immediately collapsed, caught mid-fade in a screenshot
// beside a "2" cluster badge. That was chased hard — mouse clicks, real touch taps,
// forced pans, and 20 cards left completely alone — and every card stayed open,
// with and without the guard added alongside this file. So the cause is still
// UNKNOWN and this smoke would not have caught it.
//
// What it DOES guard is the invariant the leading theory rested on: an open
// card must survive the declutter pass. Leaflet auto-pans to fit a popup, which
// fires moveend → cull(), and the 40px grid shifts underneath; a pin that lost
// its cell to a higher-scoring neighbour would be unmounted and take its open
// card with it. Worth holding onto either way.
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
    const file = join(ROOT, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({ executablePath: process.env.CHROME });
// iPad landscape WITH TOUCH — the report came from a real iPad, and touch input
// takes a different path through Leaflet than a synthetic mouse click.
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });
// Only the network this test actually needs; the rest fails slowly through the
// sandbox proxy and just adds noise.
await ctx.route(/tile\.openstreetmap\.org|open-meteo\.com|tidesandcurrents\.noaa\.gov|waterservices\.usgs\.gov/,
  (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try { localStorage.setItem('pointer.welcomed', '1'); localStorage.setItem('pointer.seenVersion', '99.0.0'); } catch {}
});
await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
for (const d of await page.$$('dialog[open]')) await page.evaluate((el) => el.close(), d);

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

await (await page.$('.filters-toggle'))?.click();
await page.waitForTimeout(300);
for (const b of await page.$$('button')) {
  if ((await b.textContent() || '').replace(/✓/g, '').trim() === 'Show all') { await b.click(); break; }
}
await page.waitForTimeout(1200);
await (await page.$('.filters-toggle'))?.click(); // collapse so the map has room
await page.waitForTimeout(800);

// Tap a spread of pins. The bug only bit pins that lost their declutter cell to
// a neighbour after the auto-pan, so one tap proves nothing — sweep several.
const total = await page.$$eval('.leaflet-marker-icon', (e) => e.length);
check(total > 0, `map has markers to tap (${total})`);

let opened = 0, survived = 0;
for (let i = 0; i < 14; i++) {
  const icons = await page.$$('.leaflet-marker-icon');
  if (!icons.length) break;
  const icon = icons[(i * 3) % icons.length];
  await icon.tap({ force: true }).catch(async () => { await icon.click({ force: true }).catch(() => {}); });
  await page.waitForTimeout(250);
  const isOpen = await page.$$eval('.leaflet-popup', (e) => e.length);
  if (!isOpen) continue;          // a cluster pin zooms instead of opening — fine
  opened += 1;
  // Let the auto-pan settle and cull() run — that is when the card vanished.
  await page.waitForTimeout(1100);
  const stillOpen = await page.$$eval('.leaflet-popup', (e) => e.length);
  if (stillOpen) survived += 1;
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

check(opened >= 3, `opened enough cards to be meaningful (${opened})`);
check(survived === opened, `every opened card stayed open after the map settled (${survived}/${opened})`);
console.log('pageerrors:', errors.length, errors.slice(0, 3));
if (errors.length) fails.push('pageerrors');
await browser.close();
server.close();
if (fails.length) { console.error('\nFAILED:', fails.join('; ')); process.exit(1); }
console.log('\nsmoke-popupstays: green');
