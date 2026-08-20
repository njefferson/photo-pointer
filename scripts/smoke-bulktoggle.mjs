// The toolbar Show all / Hide all / Restore button.
//
// The requirement, settled 2026-07-27: show-all and hide-all belong at the top,
// so the most-used filter action does not require opening the filter panel; and
// hiding all offers a one-tap way back to the previous set.
//
// The trap this guards: Restore must never put back a set the reader has since
// edited. Any other change to what is showing has to retire the offer.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel === '/' ? '/index.html' : rel);
  try { res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'text/plain' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/tile.openstreetmap.org/**', (r) => r.abort());
// The first-visit welcome dialog is modal and would intercept every click.
await ctx.addInitScript(() => { try { localStorage.setItem('pointer.welcomed', '1'); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/index.html');
await page.waitForFunction(() => document.querySelectorAll('.region-pill').length > 0);
await page.waitForTimeout(1200);
await page.evaluate(() => { for (const d of document.querySelectorAll('dialog')) d.close?.(); });

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

// The button lives in the toolbar, NOT inside the collapsed Filters panel.
const bulk = () => page.locator('.bar-actions > button').filter({ hasText: /Show all|Hide all/ }).first();
const restore = () => page.locator('.bar-actions > button').filter({ hasText: /Restore/ });
const label = async () => (await bulk().textContent()).trim();
const onCount = () => page.evaluate(() => document.querySelectorAll('.chips .chip[aria-pressed="true"]').length);

check(await bulk().count() === 1, 'a bulk toggle is in the toolbar without opening Filters');
check(await label() === 'Show all', `starts as "Show all" (all pin types are off by default) — got "${await label()}"`);

await bulk().click();
await page.waitForTimeout(400);
check(await restore().count() === 1, 'a separate Restore appears beside it');
check(await label() === 'Hide all',
  `and the bulk action is STILL one tap — after Show all it offers Hide all, got "${await label()}"`);

// Prove it really showed everything: open the panel and count the on-chips.
await page.click('button:has-text("Filters")');
await page.waitForTimeout(250);
const allOn = await onCount();
check(allOn > 20, `Show all turned on every pin type (${allOn} chips on)`);

// Restore puts back what was there before — nothing.
await restore().click();
await page.waitForTimeout(400);
check(await onCount() === 0, 'Restore put back the empty set that was showing before');
check(await restore().count() === 0, 'and the offer is spent, so Restore is gone');

// Build a real set by hand, then Hide all, then Restore it.
await page.evaluate(() => {
  const chips = [...document.querySelectorAll('.chips .chip:not(.chip-all)')];
  chips[0].click(); chips[1].click(); chips[2].click();
});
await page.waitForTimeout(400);
const built = await onCount();
check(built === 3, `built a set of 3 pin types by hand (${built})`);

check(await label() === 'Show all', 'a partial set offers Show all, not Hide all');
await bulk().click();               // Show all
await page.waitForTimeout(300);
await restore().click();            // back to the 3
await page.waitForTimeout(300);
check(await onCount() === 3, 'Restore brought back the hand-built set of 3');

// THE TRAP: edit the set after a bulk change, and Restore must retire.
await bulk().click();               // Show all (remembers the 3)
await page.waitForTimeout(300);
check(await restore().count() === 1, 'offer is live right after a bulk change');
await page.evaluate(() => document.querySelector('.chips .chip:not(.chip-all)').click());
await page.waitForTimeout(300);
check(await restore().count() === 0,
  'editing a chip retires the offer, so a stale set can never be restored');

check(errors.length === 0, `zero page errors (${errors.slice(0, 2).join(' | ')})`);

await browser.close();
server.close();
if (fail.length) { console.error(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nbulk toggle: all checks passed');
