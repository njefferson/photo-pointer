#!/usr/bin/env node
// Resolve the Falchi 2016 world-atlas GeoTIFF download URL from its DOI.
// Runs on a GitHub runner (open internet); the session sandbox 403s GFZ.
//
// Prints candidate download URLs (one per line) found on the DOI landing page,
// preferring GFZ datapub .tif / .zip links. The light-pollution workflow feeds
// the first candidate to gdalinfo /vsicurl to read the header without a full
// 2.9 GB download. License of the data: CC BY-NC 4.0 (attribution + noncommercial).

const DOI = 'https://doi.org/10.5880/GFZ.1.4.2016.001';

async function main() {
  let html = '';
  try {
    const res = await fetch(DOI, {
      redirect: 'follow',
      headers: { 'User-Agent': 'photo-pointer-ingest/0.1 (personal noncommercial project)' },
      signal: AbortSignal.timeout(60000),
    });
    process.stderr.write(`landing: ${res.status} ${res.url}\n`);
    html = await res.text();
  } catch (e) {
    process.stderr.write(`DOI fetch failed: ${e.message}\n`);
    process.exit(3);
  }

  const base = 'https://ernie.rz-vm499.gfz.de/';
  // Collect every href/src, resolve relative → absolute.
  const urls = new Set();
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      urls.add(new URL(m[1], base).href);
    } catch { /* skip */ }
  }
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()]+/g)) {
    urls.add(m[0].replace(/[.,)]+$/, ''));
  }

  // Print download-looking candidates first (a file component or archive),
  // then everything else so the probe log reveals the real pattern.
  const all = [...urls];
  const dl = all.filter((u) => /download|content|component|\.tif|\.tiff|\.zip|atlas/i.test(u));
  const ranked = dl.sort((a, b) => score(b) - score(a));
  process.stderr.write(`--- ${dl.length} download-candidate links ---\n`);
  for (const u of ranked) console.log(u);
  process.stderr.write(`--- all ${all.length} links (for reference) ---\n`);
  for (const u of all) process.stderr.write(u + '\n');
  if (ranked.length === 0) process.exit(4);
}

function score(u) {
  let s = 0;
  if (/\.tif\b|\.tiff\b/i.test(u)) s += 4;
  if (/\.zip\b/i.test(u)) s += 3;
  if (/content|component/i.test(u)) s += 2;
  if (/datapub\.gfz/i.test(u)) s += 2;
  if (/atlas/i.test(u)) s += 1;
  return s;
}

main();
