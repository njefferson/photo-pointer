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
- **Cross-layer synthesis** (`src/model/synthesis.js`) is the point of putting
  everything on one data model: it scores each place by how many layers line up
  — a park that's also a birding hotspot, an open viewpoint facing the evening
  light, easy to reach — and the **★ Top spots** panel ranks and filters by
  those combinations. New data sources plug in as new *signals* without
  touching the scorer (a park's dark-sky rating will light up its score the
  moment that layer lands). No single existing app does this cross-layer query.
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

Each entry names what the source gives, the terms it is under, and whether
it is working. This was a table until 2026-08-29; tables do not render on the
device this is read on, so the columns were being lost silently.

**OpenStreetMap (Overpass)** — Working

- Viewpoints, waterfalls, peaks, markers, oddities, parks, trailheads, campsites.
- Terms: **ODbL 1.0** — attribution "© OpenStreetMap contributors"; share-alike on the database

**Historical markers** — Working

- HMdb markers + California Historical Landmarks as spots, linking out to HMdb.
- Terms: Facts from **Wikidata (CC0)**; HMdb pages linked, never copied (HMdb content is copyrighted)

**eBird (Cornell Lab)** — Working

- Wildlife hotspots.
- Terms: API terms — attribution required, no bulk redistribution

**iNaturalist** — Working

- Non-bird wildlife density (mammals/reptiles/amphibians/insects) near each spot.
- Terms: Per-record CC licensing — ingest fetches CC0/CC-BY/CC-BY-SA only, counts not content

**Wikimedia Commons** — Working

- How many freely-licensed photos are taken near each spot (photogenic proxy).
- Terms: All Commons media is **CC/public-domain**; derived counts only, no images copied

**World Atlas (Falchi 2016)** — Working

- Dark-sky / light-pollution raster → Bortle per spot + map overlay.
- Terms: **CC BY-NC 4.0**, doi:10.5880/GFZ.1.4.2016.001

**Public lands** — Working

- Protected-area boundaries → which spots are on public land.
- Terms: OpenStreetMap, ODbL

**Terrain (SRTM)** — Working

- 30 m elevation model → each spot's real horizon openness + E/W/S ridge angles.
- Terms: **Public domain** (NASA/USGS SRTM, via AWS Terrain Tiles)

**Map tiles** — Working

- OSM carto + Esri World Imagery.
- Terms: © OpenStreetMap contributors · Imagery © Esri

**Sun & moon** — Working

- On-device golden/blue-hour, sunrise/sunset + direction, moon phase + Milky-Way dark window.
- Terms: astronomy-engine © Don Cross, MIT (vendored)

**Weather** — Working

- Live clear-sky (cloud) forecast for tonight, per spot.
- Terms: Open-Meteo, free, no key (CC BY 4.0)

**Air quality** — Working

- Live US AQI + wildfire-smoke note today, per spot.
- Terms: Open-Meteo Air Quality, free, no key (CC BY 4.0)


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

## Regions

The app is **multi-region** — `config/regions.json` holds a list, and you
switch between them with the pills at the top of the app. Seeded regions:
**Sacramento · El Dorado · Placer**, **Humboldt Coast**, **Yellowstone**
(WY/MT/ID), **Hahira, GA** (Lowndes County), and **Panama City Beach, FL**
(Bay County). Each region's data lives in `data/regions/<id>.json`; the map only
mounts the pins currently on screen, so dense regions stay smooth.

To add a region:

1. Add a region object to `config/regions.json` (`id`, `name`, `bbox`, and a
   `counties` array with `name`/`state`/`fips`/`osm_area_name`/`ebird_region`).
2. If a sibling checkout of `Bird-location-scouting` has those counties, run
   `node scripts/import-ebird-from-frame.mjs <id>` to seed the birding hotspots.
3. Dispatch the **Ingest OSM** workflow with that region id (adds viewpoints,
   parks, trailheads, markers). Enrichment workflows (dark sky, horizon, public
   lands, wildlife, photos) each take the same region id.
4. That's it — expanding coverage is a config + data change, never a code one.
   Leaflet handles far-apart regions natively (no custom map-projection code).

## Accessibility

Color is never the sole carrier of meaning: category pins carry letter
glyphs, filter state is shown by strikethrough + luminance, contrast is
computed (not eyeballed) by a CI gate in both themes, focus rings are
visible, and reduced motion is honored.
