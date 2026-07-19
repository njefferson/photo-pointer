#!/usr/bin/env node
// Find the Falchi 2016 world-atlas GeoTIFF file URL behind GFZ's "ernie" JS
// app. Runs on a runner (open internet). The landing page is a single-page
// app and DataCite exposes no file URL, so we fetch the app's JS bundles and
// extract the backend API/file-endpoint strings, then derive candidate
// download URLs. License of the data: CC BY-NC 4.0.
//
// stdout = candidate download URLs (most-likely first). stderr = diagnostics.

const LANDING = 'https://ernie.rz-vm499.gfz.de/10.5880/gfz.1.4.2016.001/supplement-to-the-new-world-atlas-of-artificial';
const ORIGIN = 'https://ernie.rz-vm499.gfz.de';
const UA = 'photo-pointer-ingest/0.1 (personal noncommercial project)';

async function get(url, asText = true) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) { process.stderr.write(`${url} -> ${res.status}\n`); return null; }
  return asText ? res.text() : res.json();
}

async function main() {
  const landing = await get(LANDING);
  if (!landing) process.exit(3);

  // Bundle URLs from the page (hashes change per deploy — read them live).
  const bundles = [...landing.matchAll(/\/build\/assets\/[A-Za-z0-9._-]+\.js/g)].map((m) => ORIGIN + m[0]);
  const uniq = [...new Set(bundles)];
  // Bundles most likely to hold the data/file API.
  const priority = uniq.filter((u) => /Files|Download|metadata|resolve|Query|template-data|section-catalog|app-|dist-/i.test(u));
  const toFetch = [...new Set([...priority, ...uniq])].slice(0, 30);
  process.stderr.write(`fetching ${toFetch.length}/${uniq.length} bundles\n`);

  let js = '';
  for (const u of toFetch) {
    const t = await get(u);
    if (t) js += '\n' + t;
  }

  // Extract endpoint hints.
  const hits = new Set();
  const add = (s) => { if (s) hits.add(s); };
  for (const m of js.matchAll(/https?:\/\/[^\s"'`<>()]+/g)) add(m[0]);
  for (const m of js.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)) add(m[1]);
  for (const m of js.matchAll(/["'`](\/[a-z0-9_\-/]*(?:records|files|download|content|datasets|blob)[a-z0-9_\-/.{}]*)["'`]/gi)) add(m[1]);

  const interesting = [...hits].filter((s) =>
    /\/api\/|records|files|download|content|datapub|dataservices|\.tif|\.zip/i.test(s) &&
    !/\.(js|css|svg|png|woff2?)(\?|$)/i.test(s)
  );
  process.stderr.write(`--- ${interesting.length} endpoint hints ---\n`);
  for (const s of interesting) process.stderr.write(s + '\n');

  // Derive candidate download URLs. The DOI's record id is its suffix.
  const rid = '10.5880/gfz.1.4.2016.001';
  const apiBases = interesting
    .filter((s) => /\/api\//.test(s))
    .map((s) => (s.startsWith('http') ? s : ORIGIN + s));
  const guesses = [
    `${ORIGIN}/api/records/${rid}`,
    `${ORIGIN}/api/records/${rid}/files`,
    `${ORIGIN}/api/datasets/${rid}`,
    `${ORIGIN}/api/datasets/${rid}/files`,
    `${ORIGIN}/api/${rid}`,
    ...apiBases,
  ];

  // Try each JSON endpoint; if it lists files, emit their content URLs.
  const out = new Set();
  for (const g of [...new Set(guesses)]) {
    try {
      const j = await get(g, false);
      if (!j) continue;
      process.stderr.write(`OK JSON: ${g}\n`);
      const urls = new Set();
      collect(j, urls);
      for (const u of urls) if (/\.tif|\.zip|files|content|download/i.test(u)) out.add(u.startsWith('http') ? u : ORIGIN + u);
      // InvenioRDM-style: entries[].links.content
      const entries = j.entries ?? j.files ?? j.data ?? [];
      if (Array.isArray(entries)) for (const e of entries) {
        const link = e?.links?.content ?? e?.links?.self ?? e?.content ?? null;
        if (link) out.add(link);
      }
    } catch (e) { process.stderr.write(`${g} err ${e.message}\n`); }
  }

  const ranked = [...out].sort((a, b) => sc(b) - sc(a));
  for (const u of ranked) console.log(u);
  if (ranked.length === 0) { process.stderr.write('No file URL derived.\n'); process.exit(4); }
}

function collect(node, out) {
  if (node == null) return;
  if (typeof node === 'string') { const m = node.match(/https?:\/\/[^\s"'<>()]+/g); if (m) m.forEach((u) => out.add(u)); return; }
  if (Array.isArray(node)) return node.forEach((v) => collect(v, out));
  if (typeof node === 'object') for (const v of Object.values(node)) collect(v, out);
}
function sc(u) { let s = 0; if (/\.tif/i.test(u)) s += 5; if (/\.zip/i.test(u)) s += 4; if (/content|download/i.test(u)) s += 2; return s; }

main().catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(3); });
