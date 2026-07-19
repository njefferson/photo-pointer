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

  // Collect absolute URLs that look like data files or GFZ datapub links.
  const urls = new Set();
  const re = /https?:\/\/[^\s"'<>()]+/g;
  for (const m of html.matchAll(re)) {
    const u = m[0].replace(/[.,)]+$/, '');
    if (/datapub\.gfz|\.tif\b|\.tiff\b|\.zip\b/i.test(u)) urls.add(u);
  }

  const ranked = [...urls].sort((a, b) => score(b) - score(a));
  if (ranked.length === 0) {
    process.stderr.write('No candidate data URLs found on the landing page.\n');
    process.exit(4);
  }
  for (const u of ranked) console.log(u);
}

function score(u) {
  let s = 0;
  if (/\.tif\b|\.tiff\b/i.test(u)) s += 3;
  if (/datapub\.gfz/i.test(u)) s += 2;
  if (/\.zip\b/i.test(u)) s += 1;
  return s;
}

main();
