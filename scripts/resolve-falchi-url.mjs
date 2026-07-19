#!/usr/bin/env node
// Resolve the Falchi 2016 world-atlas GeoTIFF download URL. Runs on a runner
// (open internet); the session sandbox 403s GFZ + DataCite. The GFZ landing
// page is a JS single-page app, so we query the DataCite metadata API for the
// DOI instead — it carries contentUrl / related URLs for the data files.
// License of the data: CC BY-NC 4.0 (attribution + noncommercial).
//
// Prints candidate download URLs to stdout, most-likely-a-data-file first.
// Diagnostics go to stderr.

const DOI = '10.5880/GFZ.1.4.2016.001';
const UA = 'photo-pointer-ingest/0.1 (personal noncommercial project)';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  process.stderr.write(`${url} -> ${res.status}\n`);
  if (!res.ok) return null;
  return res.json();
}

function collectUrls(node, out) {
  if (node == null) return;
  if (typeof node === 'string') {
    const m = node.match(/https?:\/\/[^\s"'<>()]+/g);
    if (m) for (const u of m) out.add(u.replace(/[.,)]+$/, ''));
    return;
  }
  if (Array.isArray(node)) { for (const v of node) collectUrls(v, out); return; }
  if (typeof node === 'object') { for (const v of Object.values(node)) collectUrls(v, out); }
}

function score(u) {
  let s = 0;
  if (/\.tif\b|\.tiff\b/i.test(u)) s += 5;
  if (/\.zip\b/i.test(u)) s += 4;
  if (/download|content|file/i.test(u)) s += 2;
  if (/datapub|dataservices|gfz/i.test(u)) s += 1;
  if (/\.js\b|\.css\b|fonts|assets\//i.test(u)) s -= 10; // SPA junk
  return s;
}

async function main() {
  const urls = new Set();

  // 1) DataCite metadata API — the authoritative machine-readable record.
  const dc = await getJson(`https://api.datacite.org/dois/${DOI}`);
  if (dc) {
    const a = dc.data?.attributes ?? {};
    for (const u of a.contentUrl ?? []) urls.add(u);
    collectUrls(a.relatedIdentifiers, urls);
    collectUrls(a.descriptions, urls);
    if (a.url) urls.add(a.url);
    process.stderr.write(`datacite contentUrl: ${JSON.stringify(a.contentUrl ?? null)}\n`);
    process.stderr.write(`datacite formats: ${JSON.stringify(a.formats ?? null)} sizes: ${JSON.stringify(a.sizes ?? null)}\n`);
  }

  const ranked = [...urls].filter((u) => score(u) > 0).sort((x, y) => score(y) - score(x));
  process.stderr.write(`--- ${ranked.length} ranked candidates ---\n`);
  for (const u of ranked) console.log(u);
  process.stderr.write(`--- all ${urls.size} urls seen ---\n`);
  for (const u of urls) process.stderr.write(u + '\n');
  if (ranked.length === 0) process.exit(4);
}

main().catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(3); });
