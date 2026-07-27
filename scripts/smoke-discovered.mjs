// Proves the two new layers actually render on a real region: a discovered
// photo-density pin opens a card that says what earned it, and a bloom event
// shows in the Upcoming list with a date.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/home/user/photo-pointer';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png' };
const server = createServer(async (req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? '/index.html' : req.url.split('?')[0]);
  try { res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'text/plain' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
await ctx.route('**/tile.openstreetmap.org/**', (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/index.html');
await page.waitForFunction(() => document.querySelectorAll('.region-pill').length > 0);
await page.waitForTimeout(2500);

const out = await page.evaluate(async () => {
  const mv = await import('./src/ui/mapview.js');
  const doc = await (await fetch('data/regions/sac-eldorado-placer.json')).json();
  const cluster = doc.spots.filter((s) => s.category === 'photo_cluster')
    .sort((a, b) => b.tags.commons.spots - a.tags.commons.spots)[0];
  const bloom = doc.spots.find((s) => s.tags?.phenology?.kind === 'Bloom');
  const host = document.createElement('div');
  host.style.cssText = 'width:390px;height:600px'; document.body.appendChild(host);
  const region = { id: 'sac-eldorado-placer', name: 'Sac', bbox: { south: 38, west: -122, north: 39.5, east: -119.8 },
    center: { lat: cluster.lat, lng: cluster.lng, zoom: 13 } };
  const view = mv.createMapView(host, { region, regions: [region] });
  view.setSpots(doc.spots);
  view.focusSpot(cluster);
  await new Promise((r) => setTimeout(r, 800));
  const pop = document.querySelector('.leaflet-popup-content');
  return {
    clusterName: mv.spotDisplayName(cluster),
    clusterSpots: cluster.tags.commons.spots,
    clusterPhotos: cluster.tags.commons.photos,
    popupText: pop ? pop.innerText.replace(/\s+/g, ' ').slice(0, 260) : null,
    bloomName: bloom?.name ?? null,
    bloomWhen: bloom ? `${bloom.tags.event.month}/${bloom.tags.event.day}` : null,
    bloomNotes: bloom?.notes ?? null,
  };
});

console.log(JSON.stringify(out, null, 2));

// The Upcoming list must carry the bloom events too. Dismiss the first-visit
// welcome dialog first, or every row read is that dialog's install steps.
await page.evaluate(() => { for (const d of document.querySelectorAll('dialog')) d.close?.(); });
// Pin types default to all-off and the master toggle lives inside the collapsed
// Filters panel, so an empty list would otherwise mean nothing at all.
await page.click('button:has-text("Filters")').catch(() => {});
await page.waitForTimeout(200);
await page.click('button:has-text("Show all")').catch(() => {});
await page.waitForTimeout(300);
await page.click('button:has-text("List")').catch(() => {});
await page.waitForTimeout(500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /^Upcoming$/i.test(x.textContent.trim()));
  b?.click();
});
await page.waitForTimeout(600);
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('.list-row')].slice(0, 6).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 90)));

console.log('upcoming rows:', JSON.stringify(rows, null, 2));
if (!rows.some((r) => /bloom|autumn colour/i.test(r))) {
  console.error('FAIL: no bloom or autumn-colour event in the Upcoming list');
  errors.push('no phenology event in Upcoming');
}
console.log('pageerrors:', errors.length, errors.slice(0, 3));

await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
