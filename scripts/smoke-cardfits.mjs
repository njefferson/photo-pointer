// A place card must remain usable when the reader enlarges their text.
//
// THE BUG THIS PINS, found 2026-07-26 by asking whether the popup was a fixed
// size that could fail at a raised font size. It was, and that is an
// accessibility failure rather than a cosmetic one: the popup carried maxWidth
// 320 and a hard
// `Math.max(240, innerHeight*0.6)` floor, computed ONCE when the marker was
// built. It never looked at the map. MEASURED at 200% text on a 320px phone:
// the map is 114px tall and the card was still demanding 240, so it did not
// open at all. At 150% it rendered WIDER than the map and pushed the × close
// off the screen — readable, but impossible to dismiss.
//
// Raising text size is equivalent to shrinking the viewport, which is how the
// sizes below are derived: 200% text on a 390x844 phone is a 195x422 viewport.
//
// TWO ROUTES to a card, both walked at every size: pressing a pin on the map,
// and pressing a place's name in the list (added 2026-10-09). The list route
// ended with the card's top and × 80px above the screen at 390x844: the map was
// shown and focusSpot ran in the same call, while Leaflet still held the height
// the map had before the list was up, so a re-measure one frame later fired a
// moveend that used up focusSpot's own handler before its animation ended.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT=process.cwd();
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(q,s)=>{try{const p=decodeURIComponent(q.url.split('?')[0]);const f=join(ROOT,p==='/'?'/index.html':p);const b=await readFile(f);s.writeHead(200,{'content-type':T[extname(f)]??'application/octet-stream'});s.end(b);}catch{s.writeHead(404);s.end('nf');}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME});
let failures=0;

async function probe(label, {width,height,zoom}, route='pin') {
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true});
  await ctx.route(/tile\.openstreetmap\.org|open-meteo\.com|tidesandcurrents\.noaa\.gov|waterservices\.usgs\.gov/,r=>r.abort());
  const page=await ctx.newPage();
  await page.addInitScript(()=>{try{localStorage.setItem('pointer.welcomed','1');localStorage.setItem('pointer.seenVersion','99.0.0');}catch{}});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForTimeout(2400);
  for (const d of await page.$$('dialog[open]')) await page.evaluate(el=>el.close(), d);
  await (await page.$('.filters-toggle'))?.click(); await page.waitForTimeout(300);
  for(const b of await page.$$('button')) if((await b.textContent()||'').replace(/✓/g,'').trim()==='Show all'){await b.click();break;}
  await page.waitForTimeout(900);
  await (await page.$('.filters-toggle'))?.click(); await page.waitForTimeout(600);
  let routeError=null, routeNote=null;
  if (route==='list') {
    // Open a card by PRESSING A PLACE'S NAME IN THE LIST — the other way a
    // reader reaches one. focusSpot shows the map and opens the card in one go.
    try {
      await page.locator('button.vt-btn',{hasText:'List'}).first().click({timeout:8000});
      await page.waitForTimeout(600);
      const row=page.locator('button.list-name').first();
      try { await row.click({timeout:4000}); }
      catch (e) {
        // At 200% text the list's sticky sort and filter controls are taller than the
        // list itself (154px of 169, 192px of 114), so NO row can be pressed by a
        // finger there. That is a defect of its own, recorded in the notes and not
        // this smoke's to hide: say so, then press the row with the page's own click
        // so the card it opens is still measured.
        if (!/intercepts pointer events/.test(String(e.message||e))) throw e;
        routeNote='the list\'s own controls cover every row here, so the row was pressed by the page\'s own click';
        await row.dispatchEvent('click');
      }
      await page.waitForTimeout(2400);
    } catch (e) { routeError='the list route could not be walked: '+String(e.message||e).split('\n').slice(0,8).join(' | '); }
  } else {
    // Open a card by TAPPING A PIN — the path a user actually takes on the map.
    // Avoid cluster pins — tapping one zooms instead of opening a card.
    const icons = await page.$$('.leaflet-marker-icon');
    for (const ic of icons) {
      const isCluster = await ic.evaluate((el)=>!!el.querySelector('.pin.is-cluster'));
      if (isCluster) continue;
      await ic.click({force:true}).catch(()=>{});
      await page.waitForTimeout(1800);
      if (await page.$('.leaflet-popup')) break;
    }
  }
  const r = await page.evaluate(() => {
    const pop=document.querySelector('.leaflet-popup');
    const content=document.querySelector('.leaflet-popup-content');
    const wrap=document.querySelector('.leaflet-popup-content-wrapper');
    const close=document.querySelector('.leaflet-popup-close-button');
    const mapEl=document.querySelector('.map-root');
    const mapEl0=document.querySelector('.map-root'), bar=document.querySelector('.bar');
    if(!pop||!content) return {open:false,
      barH: bar?Math.round(bar.getBoundingClientRect().height):null,
      mapH: mapEl0?Math.round(mapEl0.getBoundingClientRect().height):null,
      markers: document.querySelectorAll('.leaflet-marker-icon').length,
      viewportH: innerHeight};
    const pb=pop.getBoundingClientRect(), mb=mapEl.getBoundingClientRect(), cb=close?.getBoundingClientRect();
    return {
      open:true,
      popupH:Math.round(pb.height), popupW:Math.round(pb.width),
      mapH:Math.round(mb.height), mapW:Math.round(mb.width),
      overflowsMap: pb.height > mb.height + 1,
      scrollable: content.scrollHeight > content.clientHeight + 1,
      contentScrollH: content.scrollHeight, contentClientH: content.clientHeight,
      closeVisible: cb ? (cb.top>=0 && cb.bottom<=innerHeight && cb.left>=0 && cb.right<=innerWidth) : null,
      popupTopOffscreen: pb.top < 0,
      popupBottomOffscreen: pb.bottom > innerHeight,
      bodyScrollsX: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  const bad = [];
  if (routeError) bad.push(routeError);
  if (!r.open) bad.push('card did not open');
  if (r.open && r.overflowsMap) bad.push('card is taller than the map');
  if (r.open && !r.closeVisible) bad.push('the × close is off-screen — the card cannot be dismissed');
  if (r.open && r.popupBottomOffscreen) bad.push('card hangs below the viewport');
  if (r.open && r.popupTopOffscreen) bad.push('card runs off the top of the viewport');
  if (r.bodyScrollsX) bad.push('the page scrolls sideways');
  const tag=`${label} ${route==='list'?'[list row]':'[pin]'}`;
  if (bad.length) { console.error(`FAIL ${tag}: ${bad.join('; ')}`); failures++; }
  else console.log(` ok  ${tag.padEnd(40)} map ${r.mapW}x${r.mapH}, card ${r.popupW}x${r.popupH}, scrolls inside: ${r.scrollable}${routeNote?`\n     note: ${routeNote}`:''}`);
  await ctx.close();
}

// A user raising text size to N% is equivalent to a viewport 1/N the size.
for (const route of ['pin','list']) {
  await probe('iPhone 390x844  (100% text)', {width:390,height:844}, route);
  await probe('  same at 150% text', {width:260,height:563}, route);
  await probe('  same at 200% text', {width:195,height:422}, route);
  await probe('small phone 320x568', {width:320,height:568}, route);
  await probe('  same at 200% text', {width:160,height:284}, route);
}
await browser.close(); server.close();
if (failures) { console.error(`\n${failures} size(s) leave the card unusable.`); process.exit(1); }
console.log('\nsmoke-cardfits: the card fits and stays dismissable at every text size.');
