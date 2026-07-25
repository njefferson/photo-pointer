// Headless smoke for the streamflow line (1.9.0). USGS is unreachable from the
// sandbox, so the USGS endpoints are MOCKED via route interception — this proves
// the UI wiring + fetch/CSP/parse/format path (water spot shows flow; dry spot
// shows nothing), not USGS itself. The real-data check is Noah's device.
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

// MOCK USGS: one gauge near the test waterfall, plus its daily-median stats.
const IV = { value: { timeSeries: [
  {
    sourceInfo: { siteName: 'NF AMERICAN R NR AUBURN', siteCode: [{ value: '11427000' }],
      geoLocation: { geogLocation: { latitude: 38.9363, longitude: -121.0233 } } },
    variable: { variableCode: [{ value: '00060' }] },
    values: [{ value: [{ value: '3180', dateTime: '2026-07-25T14:00:00.000-07:00' }] }],
  },
  {
    sourceInfo: { siteName: 'NF AMERICAN R NR AUBURN', siteCode: [{ value: '11427000' }],
      geoLocation: { geogLocation: { latitude: 38.9363, longitude: -121.0233 } } },
    variable: { variableCode: [{ value: '00065' }] },
    values: [{ value: [{ value: '4.10', dateTime: '2026-07-25T14:00:00.000-07:00' }] }],
  },
] } };
const STAT_ROWS = ['agency_cd\tsite_no\tparameter_cd\tmonth_nu\tday_nu\tmedian_va', '5s\t15s\t5s\t2n\t2n\t12n'];
// Median for EVERY calendar day = 1000 cfs, so "today" always resolves (3180/1000 → higher than usual).
for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) STAT_ROWS.push(`USGS\t11427000\t00060\t${m}\t${d}\t1000`);
await ctx.route('**/waterservices.usgs.gov/**', async (route) => {
  const url = route.request().url();
  if (url.includes('/nwis/stat/')) {
    await route.fulfill({ status: 200, contentType: 'text/plain', body: STAT_ROWS.join('\n') });
  } else {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IV) });
  }
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

// 1) The MODULE, end-to-end in a real browser under the app's CSP: fetch USGS
// (mocked), find the nearest gauge, fetch its median, band it, format it.
const out = await page.evaluate(async () => {
  const m = await import('./src/model/streamflow.js');
  const region = { id: 'smoke', bbox: { south: 38.5, west: -121.5, north: 39.5, east: -120.5 } };
  const falls = { category: 'waterfall', lat: 38.94, lng: -121.03, tags: {} };
  const dry = { category: 'ghost_town', lat: 38.94, lng: -121.03, subject_type: ['historic'], tags: {} };
  const farWater = { category: 'waterfall', lat: 39.49, lng: -120.55, tags: {} };
  const f = await m.flowNow(falls, region);
  return {
    line: f ? m.formatFlow(f) : null,
    cfs: f?.cfs ?? null, median: f?.median ?? null, relative: f?.relative ?? null,
    dry: await m.flowNow(dry, region),
    far: await m.flowNow(farWater, region),
  };
});
if (out.cfs === 3180 && out.median === 1000) ok(`flow + median fetched in-browser (${out.cfs} cfs vs ${out.median} median)`);
else fail(`flow/median wrong: ${JSON.stringify(out)}`);
// 3180 / 1000 = 3.18× the median → the top band.
if (out.relative === 'much higher than usual for the date') ok(`relative band correct: "${out.relative}"`);
else fail(`relative band wrong: ${JSON.stringify(out.relative)}`);
if (out.line && /3,180 cfs/.test(out.line) && /4\.1 ft gage/.test(out.line)) ok(`formatted: "${out.line}"`);
else fail(`format wrong: ${JSON.stringify(out.line)}`);
if (out.dry === null) ok('a dry (non-water) spot returns null — no line, no wasted call');
else fail(`dry spot should be null, got ${JSON.stringify(out.dry)}`);
if (out.far === null) ok('water far from any gauge returns null');
else fail(`far water should be null, got ${JSON.stringify(out.far)}`);

// 2) The POPUP wiring: a waterfall renders the flow line; a dry spot removes it.
// Each spot gets a FRESH map + host so no stale popup DOM from a previous read can
// be matched (that made an earlier version of this check pass spuriously).
const readPopup = (spot) => page.evaluate(async (s) => {
  const { createMapView } = await import('./src/ui/mapview.js');
  const host = document.createElement('div');
  host.style.height = '300px';
  document.body.replaceChildren(host); // wipe any previous run's popup DOM
  const region = { id: `smoke-${s.id}`, name: 'T', bbox: { south: 38.5, west: -121.5, north: 39.5, east: -120.5 }, center: { lat: s.lat, lng: s.lng, zoom: 10 } };
  const view = createMapView(host, { region, regions: [region] });
  view.setSpots([s]);
  // Opening a Leaflet popup headlessly is timing-sensitive, so poll to a deadline
  // instead of sleeping a fixed amount (the fixed-sleep version was flaky).
  const until = async (fn, ms = 6000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  view.focusSpot(s);
  await until(() => document.querySelector('.leaflet-popup'));
  await until(() => { const d = document.querySelector('.popup-more'); if (d) { d.open = true; return true; } return false; });
  // The line starts as "checking…" and settles to real text or removes itself.
  await until(() => {
    const e = document.querySelector('.popup-flow');
    return e ? !/checking/.test(e.textContent) : true;
  });
  // Give a removal a moment to land so "absent" is a real answer, not a race.
  await new Promise((r) => setTimeout(r, 400));
  return document.querySelector('.popup-flow')?.textContent ?? null;
}, spot);

const wet = await readPopup({ id: 'w', name: 'Test Falls', lat: 38.94, lng: -121.03, category: 'waterfall', tags: {}, sources: [] });
if (wet && /Water now/.test(wet) && /3,180 cfs/.test(wet) && /AMERICAN/.test(wet))
  ok(`popup shows the flow line: "${wet.slice(0, 100)}"`);
else fail(`popup flow line missing/wrong: ${JSON.stringify(wet)}`);

const dryText = await readPopup({ id: 'd', name: 'Dry Town', lat: 38.95, lng: -121.04, category: 'ghost_town', subject_type: ['historic'], tags: {}, sources: [] });
if (dryText === null) ok('dry-spot popup shows NO flow line (removed itself)');
else fail(`dry-spot popup still shows a flow line: ${JSON.stringify(dryText)}`);

if (errors.length) fail('pageerrors: ' + JSON.stringify(errors.slice(0, 4)));
else ok('zero pageerrors');

await browser.close();
server.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
