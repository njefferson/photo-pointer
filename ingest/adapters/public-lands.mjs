// Park / public-land boundaries — STUB. Primarily a MAP LAYER (polygons),
// secondarily a source of `park` spots for major named units.
//
// LICENSE OPTIONS (both clean):
//  - PAD-US (USGS Protected Areas Database of the U.S.): public domain
//    (US Government work). National coverage.
//  - CPAD (California Protected Areas Database, calands.org): free with
//    attribution ("CPAD, GreenInfo Network"). Better California fidelity
//    (holdings, managing agency) — the likely pick for this region.
//
// TODO(public-lands):
//  - Download CPAD holdings (GeoJSON export) once, clip to region bbox,
//    simplify (RDP, like Frame's gen-county-shapes EPS=0.9 approach), commit
//    as data/layers/public-lands.json.
//  - Render as a subtle Leaflet GeoJSON layer (fill + text label — meaning
//    never hue-only); emit `park` spots for units above an acreage floor
//    that OSM doesn't already carry (dedup.js collapses overlaps).
//  - Land MANAGER matters to photographers (state park hours vs BLM
//    dispersed access) — keep the agency field.

export const meta = {
  source: 'public_lands',
  name: 'Public-land boundaries (CPAD / PAD-US)',
  license: 'PAD-US: public domain · CPAD: free with attribution',
  attribution: 'Boundaries: CPAD (GreenInfo Network) / PAD-US (USGS)',
  status: 'stub',
  kind: 'layer+points',
};

export async function ingest() {
  throw new Error(
    'public-lands adapter is a stub — see TODO in ingest/adapters/public-lands.mjs'
  );
}
