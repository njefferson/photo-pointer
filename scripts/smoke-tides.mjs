// Headless smoke for the tides line (1.8.0). NOAA is unreachable from the
// sandbox, so the NOAA endpoints are MOCKED via route interception — this proves
// the UI wiring (coastal spot shows tides; inland spot shows nothing), not NOAA
// itself. The real-data check is Noah's device.
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
const base = `http://localhost:${server.address().port}`;

const { glob } = await import('node:fs/promises').then((m) => ({ glob: m.glob })).catch(() => ({}));
let executablePath = process.env.CHROME_PATH;
if (!executablePath && glob) {
  for await (const p of glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')) { executablePath = p; break; }
}
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

// MOCK NOAA: a Humboldt Bay station + a fixed hi/lo day.
await ctx.route('**/api.tidesandcurrents.noaa.gov/**', async (route) => {
  const url = route.request().url();
  const body = /stations\.json/.test(url)
    ? { stations: [{ id: '9418767', name: 'North Spit, Humboldt Bay', lat: 40.7663, lng: -124.2172 }] }
    : { predictions: [
        { t: '2026-07-25 06:12', v: '0.4', type: 'L' },
        { t: '2026-07-25 12:40', v: '5.1', type: 'H' },
        { t: '2026-07-25 18:55', v: '1.1', type: 'L' },
      ] };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('  ok', m);

await page.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); } catch {} });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

// 1) The MODULE, end-to-end in a real browser under the app's CSP: fetch NOAA
// (mocked), find the nearest station, parse and format. Coastal → data;
// inland → null (and no wasted predictions call).
const out = await page.evaluate(async () => {
  const m = await import('./src/model/tides.js');
  const coastal = await m.tidesToday(40.8, -124.16); // Humboldt coast
  const inland = await m.tidesToday(44.6, -110.5);   // Yellowstone, far inland
  return { coastal: coastal && { station: coastal.station, line: m.formatTides(coastal) }, inland };
});
if (out.coastal && /Low 6:12am \(0\.4 ft\)/.test(out.coastal.line) && /High 12:40pm \(5\.1 ft\)/.test(out.coastal.line))
  ok(`coastal tides fetched + formatted: "${out.coastal.line}"`);
else fail(`coastal tides wrong: ${JSON.stringify(out.coastal)}`);
if (out.coastal?.station === 'North Spit, Humboldt Bay') ok('nearest NOAA station identified');
else fail(`station wrong: ${JSON.stringify(out.coastal?.station)}`);
if (out.inland === null) ok('inland returns null (no tide line will render)');
else fail(`inland should be null, got ${JSON.stringify(out.inland)}`);

// 2) The POPUP wiring: build a popup for a coastal spot and confirm the tide line
// renders inside it, then for an inland spot and confirm it removes itself.
const popup = await page.evaluate(async () => {
  const { createMapView } = await import('./src/ui/mapview.js');
  // Render into a detached host; we only need popupFor's DOM, not a live map.
  const host = document.createElement('div');
  host.style.height = '300px';
  document.body.appendChild(host);
  const region = { id: 't', name: 'T', bbox: { south: 39, west: -125, north: 42, east: -123 }, center: { lat: 40.8, lng: -124.16, zoom: 10 } };
  const view = createMapView(host, { region, regions: [region] });
  const coastal = { id: 'c', name: 'Coastal Spot', lat: 40.8, lng: -124.16, category: 'viewpoint', tags: {}, sources: [] };
  const inland = { id: 'i', name: 'Inland Spot', lat: 44.6, lng: -110.5, category: 'viewpoint', tags: {}, sources: [] };
  view.setSpots([coastal, inland]);
  view.focusSpot(coastal);
  await new Promise((r) => setTimeout(r, 2500));
  const d = document.querySelector('.popup-more'); if (d) d.open = true;
  await new Promise((r) => setTimeout(r, 1500));
  const coastalText = document.querySelector('.popup-tides')?.textContent ?? null;
  view.focusSpot(inland);
  await new Promise((r) => setTimeout(r, 2500));
  const d2 = document.querySelector('.popup-more'); if (d2) d2.open = true;
  await new Promise((r) => setTimeout(r, 1500));
  const inlandEl = document.querySelector('.popup-tides');
  return { coastalText, inlandPresent: inlandEl !== null };
});
if (popup.coastalText && /Tides today/.test(popup.coastalText) && /Humboldt Bay/.test(popup.coastalText))
  ok(`popup shows the tide line: "${popup.coastalText.slice(0, 90)}"`);
else fail(`popup tide line missing/wrong: ${JSON.stringify(popup.coastalText)}`);
if (!popup.inlandPresent) ok('inland popup shows NO tide line (removed itself)');
else fail('inland popup still shows a tide line');

if (errors.length) fail('pageerrors: ' + JSON.stringify(errors.slice(0, 4)));
else ok('zero pageerrors');

await browser.close();
server.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
