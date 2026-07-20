import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const CATS = [
  ['V', '#a34a00'], ['M', '#8a2f2b'], ['O', '#7b3f8f'], ['P', '#3f6d2a'],
  ['T', '#2a5f6d'], ['C', '#6d5424'], ['W', '#365f8a'], ['D', '#3a3670'],
];
const pins = CATS.map(([l, c]) => `<div class="pin" style="background:${c}">${l}</div>`).join('');
// New icon (full-bleed PNG); CSS rounds it like an app icon.
const iconPng = await readFile('/home/user/photo-pointer/icon-512.png');
const iconDataUri = 'data:image/png;base64,' + iconPng.toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; }
  body { width:1280px; height:640px; background:#f5f1e8; color:#2e2618;
    font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
    position:relative; overflow:hidden; }
  body::before { content:""; position:absolute; inset:0;
    background-image:
      radial-gradient(circle at 82% 22%, rgba(163,74,0,.10), transparent 42%),
      repeating-linear-gradient(0deg, rgba(46,38,24,.045) 0 1px, transparent 1px 64px),
      repeating-linear-gradient(90deg, rgba(46,38,24,.045) 0 1px, transparent 1px 64px);
  }
  .wrap { position:relative; padding:88px 96px; height:100%; display:flex; flex-direction:column; }
  .top { display:flex; align-items:center; gap:30px; }
  .icon { width:132px; height:132px; border-radius:30px; box-shadow:0 8px 28px rgba(46,38,24,.22); object-fit:cover; }
  h1 { font-size:96px; font-weight:800; letter-spacing:-2.5px; line-height:1; }
  .tag { margin-top:36px; font-size:41px; font-weight:600; line-height:1.28; max-width:1000px; color:#3a3020; }
  .pins { margin-top:auto; display:flex; gap:18px; }
  .pin { width:78px; height:78px; border-radius:50%; color:#fff; font-weight:800;
    font-size:38px; display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 12px rgba(46,38,24,.22); border:2px solid rgba(255,255,255,.55); }
  .foot { margin-top:34px; display:flex; justify-content:space-between; align-items:baseline; }
  .cats { font-size:26px; color:#6d5f49; font-weight:600; }
  .url { font-size:28px; color:#a34a00; font-weight:800; }
</style></head><body>
  <div class="wrap">
    <div class="top">
      <img class="icon" src="ICON"/>
      <h1>photo&#8209;pointer</h1>
    </div>
    <div class="tag">One map of every photo&#8209;worthy place in your region — viewpoints, markers, parks, trails, wildlife, dark skies.</div>
    <div class="pins">${pins}</div>
    <div class="foot">
      <div class="cats">Open&nbsp;data&nbsp;only · no account · works offline</div>
      <div class="url">photo-pointer.pages.dev</div>
    </div>
  </div>
</body></html>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html.replace('ICON', iconDataUri), { waitUntil: 'networkidle' });
// Blank-tile guard (sibling lesson): never write a card whose logo failed to paint.
const ok = await page.evaluate(() => { const i = document.querySelector('.icon'); return !!(i && i.complete && i.naturalWidth > 0); });
if (!ok) { await b.close(); throw new Error('icon image did not load — aborting'); }
await page.screenshot({ path: '/home/user/photo-pointer/social-preview.png' });
await b.close();
console.log('wrote social-preview.png (icon loaded ok)');
