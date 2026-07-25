// Headless smoke for the Events layer (1.7.0): the Upcoming sort, dated rows,
// the balloon race as a real event, computed meteor showers, and the honesty note.
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
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource|tile\.openstreetmap/i.test(t)) return;
  errors.push('console: ' + t);
});
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('  ok', m);

await page.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); } catch {} });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

// Switch to the Reno region (the balloon race lives there).
await page.locator('.region-pill', { hasText: 'Reno' }).first().click();
await page.waitForTimeout(1200);

// Turn everything on, go to the list, sort by Upcoming.
await page.click('.filters-toggle');
await page.waitForTimeout(200);
await page.locator('.chips .chip', { hasText: 'Show all' }).first().click();
await page.waitForTimeout(300);
await page.locator('.vt-btn', { hasText: 'List' }).first().click();
await page.waitForTimeout(400);
await page.locator('.list-sort', { hasText: 'Upcoming' }).first().click();
await page.waitForTimeout(500);

// 1) The honesty note is present in the Upcoming view.
const note = await page.$eval('.list-eventsnote', (e) => e.textContent).catch(() => '');
if (/hand-picked/i.test(note) && /isn’t a complete listing|not a complete listing/i.test(note) && /approximate/i.test(note))
  ok('events limitations note shown (hand-picked, not complete, approximate)');
else fail(`events note missing/incomplete: "${note.slice(0, 120)}"`);

// 2) The first rows are dated events (Upcoming sorts them to the top).
const firstRows = await page.$$eval('.list-row', (rows) => rows.slice(0, 8).map((r) => ({
  name: r.querySelector('.list-name')?.textContent ?? '',
  meta: r.querySelector('.list-meta')?.textContent ?? '',
})));
const dated = firstRows.filter((r) => /\b(in \d+ days|today|tomorrow|[A-Z][a-z]{2} \d+)/.test(r.meta));
if (dated.length >= 3) ok(`Upcoming puts dated events first (e.g. "${dated[0].name}" — ${dated[0].meta.slice(0, 60)})`);
else fail(`expected dated events at top, got ${JSON.stringify(firstRows.slice(0, 4))}`);

// 3) The balloon race is present as an Event (not an oddity).
const balloon = await page.$$eval('.list-row', (rows) => {
  const r = rows.find((x) => /Balloon Race/i.test(x.querySelector('.list-name')?.textContent ?? ''));
  return r ? { meta: r.querySelector('.list-meta')?.textContent ?? '', pin: r.querySelector('.pin')?.className ?? '' } : null;
});
if (balloon && /pin-event/.test(balloon.pin) && /Sep/.test(balloon.meta))
  ok(`balloon race is an Event with dates: ${balloon.meta.slice(0, 70)}`);
else fail(`balloon race wrong: ${JSON.stringify(balloon)}`);

// 4) Computed meteor showers appear (region-wide sky events).
const meteor = await page.$$eval('.list-row .list-name', (n) => n.map((e) => e.textContent).filter((t) => /meteor shower/i.test(t)));
if (meteor.length >= 3) ok(`computed meteor showers present (${meteor.length}, e.g. ${meteor[0]})`);
else fail(`expected meteor shower events, got ${JSON.stringify(meteor)}`);

// 5) The Event pin type filters like any other category.
if ((await page.$('.chips')) === null) { await page.click('.filters-toggle'); await page.waitForTimeout(200); }
await page.locator('.chips .chip', { hasText: 'Hide all' }).first().click();
await page.waitForTimeout(200);
await page.locator('.chips .chip', { hasText: 'Event' }).first().click();
await page.waitForTimeout(400);
const rowsNow = await page.$$eval('.list-row .pin', (p) => p.map((e) => e.className));
const allEvents = rowsNow.length > 0 && rowsNow.every((c) => /pin-event/.test(c));
if (allEvents) ok(`Event filter → ${rowsNow.length} rows, all event pins`);
else fail(`Event filter wrong: ${rowsNow.length} rows, sample ${JSON.stringify(rowsNow.slice(0, 3))}`);

if (errors.length) fail('pageerrors: ' + JSON.stringify(errors.slice(0, 4)));
else ok('zero pageerrors');

await browser.close();
server.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
