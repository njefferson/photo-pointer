// Does the app honour a reader who enlarges only their DEFAULT TEXT SIZE?
//
// THIS IS THE DIAGNOSTIC, NOT THE GATE. The gate is test/textsize.test.mjs,
// which reads the stylesheet directly — because this script can only prove
// things about surfaces it manages to open, and when it was first written it
// reported a clean pass while never having opened a place card at all. Trust
// the numbers below for what they cover; trust the unit test for completeness.
//
// This is the gap left open since 2026-07-26. Browser/OS page-zoom scales `px`,
// so the card-fitting work covered that path — but a reader who goes into their
// browser settings and raises the default font size from 16 to, say, 24 changes
// the ROOT font size and nothing else. A stylesheet written entirely in `px`
// ignores that completely: the text does not move at all.
//
// This script measures it rather than assuming it. It reads the computed
// font-size of every visible element twice — once at a 16px root, once at 24px —
// and reports how many actually changed. Run it before and after a conversion:
// BEFORE, almost nothing should scale (that is the bug); AFTER, the same
// elements must render IDENTICALLY at 16px (no visual change for anyone on
// defaults) and must scale at 24px.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (q, s) => {
  try {
    const p = decodeURIComponent(q.url.split('?')[0]);
    const f = join(ROOT, p === '/' ? '/index.html' : p);
    const b = await readFile(f);
    s.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
    s.end(b);
  } catch { s.writeHead(404); s.end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME });

async function measure(rootPx) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/tile\.openstreetmap\.org|open-meteo\.com|tidesandcurrents\.noaa\.gov|waterservices\.usgs\.gov|commons\.wikimedia\.org|upload\.wikimedia\.org/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); localStorage.setItem('pointer.seenVersion', '99.0.0'); } catch {} });
  // The reader's browser setting IS the root font size. Raising the default
  // text size does this and nothing else — no viewport change, no page zoom.
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${px}px`; });
  }, px_(rootPx));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  // EACH STEP DESTROYS THE LAST ONE'S SURFACE — opening the filter panel and
  // then tapping "Show all" re-renders the header and closes the panel again.
  // So snapshot after every step and merge, rather than measuring once at the
  // end and quietly proving nothing about the surfaces that are no longer there.
  const merged = {};
  const snap = async (step) => {
    const s = await page.evaluate((tag) => {
      const out = {};
      let i = 0;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (!el.textContent?.trim()) continue;
        out[`${tag}|${el.tagName}.${el.className?.toString().slice(0, 40)}#${i++}`] = getComputedStyle(el).fontSize;
      }
      return out;
    }, step);
    Object.assign(merged, s);
  };

  await snap('map');
  // Filter chips live behind the toggle.
  await page.locator('.filters-toggle').first().click().catch(() => {});
  await page.waitForTimeout(400);
  await snap('filters');
  // Turn everything on so there are pins to tap, then close the panel again.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => (x.textContent || '').replace(/\u2713/g, '').trim() === 'Show all');
    b?.click();
  });
  await page.waitForTimeout(1200);
  await page.locator('.filters-toggle').first().click().catch(() => {});
  await page.waitForTimeout(600);
  // A real place card, opened by tapping a pin — the path a reader takes, and
  // the only one that reliably opens a Leaflet popup headlessly. Cluster pins
  // zoom instead of opening a card, so skip them.
  for (const ic of await page.$$('.leaflet-marker-icon')) {
    if (await ic.evaluate((el) => !!el.querySelector('.pin.is-cluster'))) continue;
    await ic.click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    if (await page.$('.leaflet-popup')) break;
  }
  await page.waitForTimeout(400);
  await snap('card');

  await ctx.close();
  return merged;
}
const px_ = (n) => n;

const at16 = await measure(16);
const at24 = await measure(24);

const keys = Object.keys(at16).filter((k) => k in at24);
const scaled = keys.filter((k) => at16[k] !== at24[k]);
console.log(`measured ${keys.length} visible text elements`);
console.log(`scaled when the reader raised default text 16px -> 24px: ${scaled.length} (${Math.round(100 * scaled.length / keys.length)}%)`);
console.log(`did NOT move: ${keys.length - scaled.length}`);

// Report which surfaces this run actually reached. A surface it missed is NOT
// a failure here — it is a gap in this run's coverage, and the reason the real
// guarantee lives in test/textsize.test.mjs instead.
let failed = 0;
for (const [name, re] of Object.entries({ 'map view': /^map\|/, 'filter panel': /^filters\|/, 'place card': /^card\|/, 'map control': /leaflet-control/i })) {
  const n = keys.filter((k) => re.test(k)).length;
  console.log(`  ${name}: ${n} element(s) reached${n ? '' : '  (not covered by this run)'}`);
}
if (scaled.length !== keys.length) {
  console.error(`FAIL: ${keys.length - scaled.length} element(s) ignore the reader's text size`);
  failed = 1;
}

const out = process.argv[2];
if (out) { await writeFile(out, JSON.stringify(at16, null, 1)); console.log(`baseline at 16px root written to ${out}`); }

await browser.close();
server.close();
process.exit(failed);
