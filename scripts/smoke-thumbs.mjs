// Thumbnails on a discovered place's card.
//
// The sandbox cannot reach Wikimedia, so the Commons API and the image host are
// intercepted — which is the point: this proves the REQUEST we make, the CSP
// that has to allow it, the parse, and what actually renders, on a real card in
// the real region. And it proves the two rules that matter:
//   1. a photograph whose licence we cannot state is not shown at all;
//   2. every thumbnail that IS shown carries its photographer and licence.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel === '/' ? '/index.html' : rel);
  let body = null;
  try { body = await readFile(p); } catch { /* not found */ }
  if (body) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'text/plain' }); res.end(body); }
  else { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// A 1x1 PNG stands in for every thumbnail.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); } catch {} });
await ctx.route('**/tile.openstreetmap.org/**', (r) => r.abort());

let apiUrl = null;
await ctx.route('**/commons.wikimedia.org/w/api.php**', (route) => {
  apiUrl = route.request().url();
  const mk = (n, extra) => ({
    title: `File:Photo ${n}.jpg`,
    imageinfo: [{
      thumburl: `https://upload.wikimedia.org/thumb-${n}.png`,
      thumbwidth: 320, thumbheight: 240,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:Photo_${n}.jpg`,
      extmetadata: extra,
    }],
  });
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ query: { pages: [
      mk(1, { Artist: { value: '<a href="/wiki/User:Jane">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }),
      mk(2, { Credit: { value: '<span>National Park Service</span>' }, LicenseShortName: { value: 'Public domain' } }),
      // No licence we can state → must never reach the card.
      mk(3, { Artist: { value: 'Nobody' } }),
      // Attribution that tries to be markup.
      mk(4, { Artist: { value: '<img src=x onerror="window.__pwned=1">Trickster' }, LicenseShortName: { value: 'CC0' } }),
    ] } }),
  });
});
await ctx.route('**/upload.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/index.html');
await page.waitForFunction(() => document.querySelectorAll('.region-pill').length > 0);
await page.waitForTimeout(1500);
await page.evaluate(() => { for (const d of document.querySelectorAll('dialog')) d.close?.(); });

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

const out = await page.evaluate(async () => {
  const mv = await import('./src/ui/mapview.js');
  const doc = await (await fetch('data/regions/sac-eldorado-placer.json')).json();
  const discovered = doc.spots.filter((s) => s.category === 'photo_cluster')
    .sort((a, b) => b.tags.commons.spots - a.tags.commons.spots)[0];
  const ordinary = doc.spots.find((s) => s.category !== 'photo_cluster' && s.tags?.commons?.photos);
  const host = document.createElement('div');
  host.style.cssText = 'width:390px;height:600px';
  document.body.appendChild(host);
  const region = { id: 'sac', name: 'S', bbox: { south: 38, west: -122, north: 39.4, east: -119.8 },
    center: { lat: discovered.lat, lng: discovered.lng, zoom: 13 } };
  const view = mv.createMapView(host, { region, regions: [region] });
  view.setSpots(doc.spots);

  view.focusSpot(discovered);
  await new Promise((r) => setTimeout(r, 700));
  const hasButton = !!document.querySelector('.popup-thumbs button');
  document.querySelector('.popup-thumbs button')?.click();
  await new Promise((r) => setTimeout(r, 900));
  const tiles = [...document.querySelectorAll('.thumb-tile')].map((a) => ({
    credit: a.querySelector('.thumb-credit')?.textContent ?? '',
    href: a.getAttribute('href'),
    alt: a.querySelector('img')?.getAttribute('alt') ?? '',
    imgW: a.querySelector('img')?.getBoundingClientRect().width ?? 0,
  }));

  // An ORDINARY photographed place must NOT get the thumbnail affordance.
  document.body.replaceChildren();
  const host2 = document.createElement('div');
  host2.style.cssText = 'width:390px;height:600px';
  document.body.appendChild(host2);
  const v2 = mv.createMapView(host2, { region: { ...region, center: { lat: ordinary.lat, lng: ordinary.lng, zoom: 13 } }, regions: [region] });
  v2.setSpots(doc.spots);
  v2.focusSpot(ordinary);
  await new Promise((r) => setTimeout(r, 700));
  const ordinaryHasButton = !!document.querySelector('.popup-thumbs');
  const ordinaryHasLink = !!document.querySelector('a.popup-linkbtn');

  return { discovered: discovered.id, hasButton, tiles, ordinaryHasButton, ordinaryHasLink,
           pwned: !!window.__pwned, popupWidth: document.querySelector('.leaflet-popup-content')?.getBoundingClientRect().width ?? 0 };
});

check(out.hasButton, 'a discovered place offers "Show the photographs" — behind a tap, not automatic');
check(out.tiles.length === 3, `three of the four files render; the one with no stateable licence is dropped (${out.tiles.length})`);
check(out.tiles.every((t) => /·/.test(t.credit) && t.credit.length > 4),
  `every thumbnail carries photographer and licence — ${JSON.stringify(out.tiles.map((t) => t.credit))}`);
check(out.tiles.some((t) => t.credit.startsWith('Jane Doe · CC BY-SA 4.0')), 'the author link became plain text, not markup');
check(out.tiles.some((t) => t.credit.includes('National Park Service')), 'Credit stands in for a missing Artist');
check(out.pwned === false, 'attribution HTML from an uploader cannot execute');
check(out.tiles.every((t) => /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(t.href)),
  'each tile links to the original file page, where the full licence lives');
check(apiUrl !== null && /generator=geosearch/.test(apiUrl) && /iiurlwidth=320/.test(apiUrl),
  'one request, asking Wikimedia to do the scaling');
check(!/maxlag/.test(apiUrl ?? ''), 'no maxlag on an interactive request — it exists for batch jobs');
check(out.ordinaryHasButton === false, 'an ordinary photographed place gets NO thumbnails');
check(out.ordinaryHasLink === true, 'it keeps the link out instead');
check(out.tiles.every((t) => t.imgW > 0 && t.imgW <= out.popupWidth),
  `no thumbnail is wider than the card it sits in (card ${Math.round(out.popupWidth)}px)`);
check(errors.length === 0, `zero page errors (${errors.slice(0, 2).join(' | ')})`);

await browser.close();
server.close();
if (fail.length) { console.error(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nthumbnails: all checks passed');
