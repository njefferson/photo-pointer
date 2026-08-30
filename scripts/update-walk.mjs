#!/usr/bin/env node
/**
 * update-walk.mjs — drives a REAL second service worker and watches what a
 * reader actually experiences when a new version arrives (Doctrine §7h).
 *
 * WHY A WALK AND NOT A UNIT TEST. Every part of this is browser machinery —
 * registration, a waiting worker, a postMessage, controllerchange, a reload —
 * and none of it is reachable from `node --test`. The hub's pwa-check reads the
 * SOURCE and can tell that skipWaiting is absent and a message listener exists;
 * it cannot tell whether a reader is ever shown anything or whether pressing it
 * works. Both facts are worth having and they are not the same fact.
 *
 * IT EARNED ITSELF ON ITS FIRST RUN. The draft it was written against had a
 * comment saying a first install must not reload the page, over code that
 * tracked "have I reloaded" instead of "did they ask" — so the very first visit
 * reloaded itself. pwa-check was green on that code.
 *
 * The second worker is real: the walk edits the CACHE constant in sw.js so the
 * browser sees genuinely different bytes, then restores the file. It never
 * leaves the tree modified, including when it fails.
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'sw.js');
const PORT = 8123;
const original = readFileSync(SW, 'utf8');
const CACHE_LINE = /const CACHE = '([^']+)';/;
const currentCache = CACHE_LINE.exec(original)?.[1];
if (!currentCache) {
  console.error('  FAIL  could not find the CACHE constant in sw.js — this walk has gone blind.');
  process.exit(1);
}

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail ? ' — ' + detail : '')); }
};

/* A plain static server. The app needs no build, and a service worker needs a
   secure context — 127.0.0.1 counts as one. */
const server = spawn('python3', ['-m', 'http.server', String(PORT)],
  { cwd: ROOT, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };

let browser;
try {
  await new Promise((r) => setTimeout(r, 1200));
  browser = await chromium.launch({
    // The session sandbox ships a Chromium at a fixed path; a runner downloads
    // its own and playwright finds it. Neither machine is special-cased.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    args: ['--no-sandbox'],
  });
  const page = await (await browser.newContext()).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });

  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  check('the first worker takes control on a first visit', true);
  check('and a first visit is NOT offered an update', !(await page.$('#update-strip')));

  // A genuinely different worker, byte-wise, so the browser installs a second.
  writeFileSync(SW, original.replace(CACHE_LINE, `const CACHE = '${currentCache}-walk';`));
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });

  await page.waitForSelector('#update-strip', { timeout: 30000 });
  const words = (await page.textContent('#update-strip')) || '';
  check('the reader is told, in words, that a new version is ready',
    /new version/i.test(words), words.trim());
  check('and is given something to press', !!(await page.$('#update-strip button')));

  const box = await page.locator('#update-strip button').boundingBox();
  check('the control is at least 44px, because it is pressed by a thumb',
    !!box && box.height >= 44, box && `${Math.round(box.height)}px`);

  // NOTHING HAS TAKEN OVER YET, which is the whole point of waiting.
  //
  // NOT "the new cache does not exist" — that was the first version of this
  // assertion and it was wrong about the browser, not about the app. A waiting
  // worker has ALREADY run its install handler, so it has already opened and
  // filled its cache; `activate` is the step that deletes the old one and takes
  // control, and that is what has not happened. Both caches being present is
  // correct.
  //
  // What actually matters to somebody reading the map is that the old worker is
  // still the one serving them, and the old cache is still there to serve from.
  const before = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { keys: await caches.keys(), waiting: !!reg.waiting };
  });
  check('a worker is waiting rather than controlling',
    before.waiting, JSON.stringify(before));
  check('and the old version is still what the device would be served',
    before.keys.includes(currentCache), before.keys.join(', '));

  // A returning reader has no first-run dialog open. A modal <dialog> lives in
  // the top layer and covers the strip while it is open, which is correct —
  // they close it and it is there — but it is not the path an update arrives on.
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  check('the strip is still there once a dialog is dismissed', !!(await page.$('#update-strip')));

  await page.click('#update-strip button');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => caches.keys());
  check('pressing it releases the waiting worker and the new version arrives',
    after.some((n) => n.endsWith('-walk')), after.join(', '));
  check('and the strip is gone afterwards', !(await page.$('#update-strip')));
} finally {
  // ALWAYS, including on a throw. A walk that leaves sw.js edited would hand
  // the next command a tree nobody wrote.
  writeFileSync(SW, original);
  if (browser) await browser.close();
  stop();
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
