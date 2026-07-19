# photo-pointer

One map of every photo-worthy place in your region — viewpoints, historical
markers, roadside oddities, parks, trailheads, campsites, wildlife hotspots,
and dark-sky quality — built entirely on free, license-clean open data.

A personal tool: free, on-device, offline-first, no account, no tracking.
**No Instagram. No social-platform scraping.** Ever.

## How it works

- Every place is a canonical **Spot** (`src/model/spot.js`): geometry, name,
  one of nine categories, photographer-intent fields (subject, best light,
  best season, access difficulty), and full **provenance** — every source
  that contributed, with its license, first-seen and last-seen dates.
- **Entity resolution is first-class** (`src/model/dedup.js`): one real-world
  place seen by several sources collapses into a single Spot with a stable
  `dedup_key`. Records match by proximity + name similarity; provenance is
  never discarded.
- Ingest adapters (`ingest/adapters/`) — one module per source, each
  declaring its own license so a violation can't be built in. They run on
  GitHub Actions runners and commit their output to this repo: the committed
  JSON **is** the durable, immutable-history data store.
- The app (`index.html` + `src/`) is a no-build vanilla-JS PWA: Leaflet map,
  category filters, offline via service worker. Your own pins live in
  localStorage with a versioned export/import backup bundle.

## Setup

No build step, no dependencies.

```
python3 -m http.server 8080     # then open http://localhost:8080
node --test                     # unit tests (Node 22+)
node scripts/check-contrast.mjs # WCAG contrast gate
node ingest/ingest.mjs probe    # can this machine reach Overpass?
node ingest/ingest.mjs all      # fetch OSM + merge + validate (network needed)
```

Deploy: push to `staging` (Cloudflare Pages preview) or `main` (production)
— `.github/workflows/deploy.yml`. Needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repo secrets; skips gracefully until they exist.

Data refresh: dispatch the **Ingest OSM** workflow (or commit to
`.github/trigger/ingest-osm`). It probes, fetches, dedups, validates, and
commits `data/` to the branch it ran on.

## Data sources & licenses

| Source | What | License / terms | Status |
| --- | --- | --- | --- |
| OpenStreetMap (Overpass) | viewpoints, waterfalls, peaks, markers, oddities, parks, trailheads, campsites | **ODbL 1.0** — attribution "© OpenStreetMap contributors"; share-alike on the database | **Working** |
| HMdb.org | historical markers | Content **copyrighted** — store name/coords/link only, never republish inscriptions or photos | Stub |
| eBird (Cornell Lab) | wildlife hotspots | API terms — attribution required, no bulk redistribution | **Working** |
| iNaturalist | wildlife observation clusters | Per-record CC licensing — ingest filters to CC0/CC-BY/CC-BY-SA only | Stub |
| Flickr | where CC photographers actually shoot | Per-photo — **only CC/public-domain licensed photos**; needs `FLICKR_API_KEY` | Stub |
| VIIRS / World Atlas | light-pollution raster | TBD at implementation (attribution required; World Atlas is non-commercial) — a map **layer**, not points | Stub |
| CPAD / PAD-US | public-land boundaries | CPAD free w/ attribution · PAD-US public domain | Stub |
| Map tiles | OSM carto + Esri World Imagery | © OpenStreetMap contributors · Imagery © Esri | Working |
| Sun times | on-device golden/blue-hour, sunrise/sunset + sun direction | astronomy-engine © Don Cross, MIT (vendored) | Working |

Each adapter's header comment is the authoritative license note — read it
before extending that source.

The eBird hotspot layer is imported from the sibling Bird-location-scouting
app's committed county data (hotspot name + location only — no observation
frequencies), refreshable with `node scripts/import-ebird-from-frame.mjs`.
For a region that app doesn't cover, the adapter documents the live-API path
(needs `EBIRD_API_TOKEN`).

## License

**PolyForm Noncommercial License 1.0.0** (see `LICENSE.md`) — the same
license as Clear Horizons. The app's own source is free for any
noncommercial purpose. The ingested open data keeps its own terms (OSM is
ODbL, eBird per the API terms above); those obligations stand regardless of
this project's code license, and `LICENSE.md` lists them.

## Expanding the region

Coverage is bounded by `config/region.json` (seeded: Sacramento, El Dorado,
and Placer counties, CA). To expand:

1. Add a county object to `config/region.json` (`name`, `state`, `fips`,
   `osm_area_name`, `ebird_region`) and widen `bbox` to cover it.
2. Re-run the **Ingest OSM** workflow.
3. That's it. Expanding coverage is a config + data change — never a code
   change. (If coverage ever leaves one map's worth of world, steal the
   multi-area `MAP_AREAS` pattern from the Bird-location-scouting repo.)

## Accessibility

Color is never the sole carrier of meaning: category pins carry letter
glyphs, filter state is shown by strikethrough + luminance, contrast is
computed (not eyeballed) by a CI gate in both themes, focus rings are
visible, and reduced motion is honored.
