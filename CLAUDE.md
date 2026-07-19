# Standing rules for Claude sessions on this repo

Read `LESSONS.md` (the conventions contract derived from the sibling repos)
and `NOTES.md` (source of truth: thesis, roadmap, settled decisions) before
doing anything.

## 0. NEVER use the AskUserQuestion / choice-popup tool (Noah, 2026-07-17,
## absolute and permanent, applies to every repo). Present choices as plain
## text; he replies in his own words.

## Branches: only `staging` and `main`, ever (Noah, 2026-07-19). No `claude/*`,
## no other branches, and NO pull requests — he does not use them. EVERY build
## lands on `staging`; his hands-on device test happens there; he EXPLICITLY
## says "promote to main" and only then does it go to `main` (= production
## deploy). Never promote to main on your own read of "it's ready." Docs-only
## changes may go straight to main. Start every session by checking whether
## `staging` is ahead of `main` — that candidate is already waiting on his
## test; surface it, never rebuild it (it's also logged in Project facts).

## Accessibility is a top priority (owner mandate). Hue-only encoding is a
## fail state. Every new visual encoding states its non-hue channel at design
## time; `node scripts/check-contrast.mjs` is a gate (add new fg/bg pairs in
## the same commit); keyboard + focus-visible always.

## License: PolyForm Noncommercial 1.0.0 (LICENSE.md), same as Clear Horizons
## (Noah, 2026-07-19 — corrected from an earlier wrong "no LICENSE" reading).
## Keep the header scope current when third-party material changes.

## Licensing is load-bearing. Every ingest adapter declares its source's
## license in its header and honors it structurally (HMdb: links only;
## Flickr: CC/PD only; eBird: no bulk redistribution). Never add a source
## without reading its terms first. NO Instagram, NO social-platform
## scraping — settled at project creation, do not re-offer.

## Verify before delegating / claiming. Sandbox egress blocks Overpass and
## most APIs (probe first: `node ingest/ingest.mjs probe`); ingest runs on
## Actions runners via workflow dispatch (MCP actions_run_trigger is the
## proven channel). State what was VERIFIED (headless, request inspection)
## vs what NEEDS NOAH'S HANDS (real iPad/iPhone feel).

## The owner is iPad-first, often driving: one step at a time, no
## desktop-required steps unless every alternative is exhausted, finished
## work only. Commit messages and changelogs are written for the END USER.

## Repo metadata (description, website, topics, social preview) is a manual
## GitHub-UI step the session token cannot perform. Canonical values:
## - Description: `One map of every photo-worthy place in your region — viewpoints, markers, oddities, parks, trails, wildlife, dark skies. Open data only.`
## - Website: `https://photo-pointer.pages.dev`
## - Topics: `photography` `maps` `openstreetmap` `pwa` `offline-first` `poi`
## List these and ask Noah to confirm each is done; never report the repo
## "set up" while any is unconfirmed.

## Project facts (append on every release, unprompted)
- 2026-07-19 0.7.0 "Open horizon" BUILT on staging (awaiting on-device pass +
  a horizon.yml runner pass to tag the data): Tier 2b of the integrations list.
  MEASURED terrain horizon per spot — the distinct-from-`view` layer (`view` is
  a category guess; this is real geometry). scripts/build-horizon.py (GDAL +
  numpy on a runner, mirrors build-light-pollution.py): downloads SRTM 1-arc-sec
  DEM tiles (AWS Open Data `elevation-tiles-prod` skadi/HGT — PUBLIC, NO KEY,
  public domain), mosaics via gdalbuildvrt, then per spot traces a radial
  horizon (24 az × 24 log-spaced dists 150 m–45 km), max apparent altitude per
  ray with earth-curvature + refraction k=0.13 (geometry PORTED from
  clear-horizons src/model/terrain.js). Writes tags.horizon =
  {open 0..1, n,e,s,w ridge °, site_m} on every spot + data/layers/horizon.json
  (manifest only, no geometry). WHY A DEM NOT OPEN-METEO ELEVATION: Clear
  Horizons uses Open-Meteo /v1/elevation but that meters ~600 COORDINATES/MINUTE
  (its on-device gotcha) — a radial trace ×2362 spots = hours of API hammering.
  DEM raster = no rate limit, seconds. OPEN_DEG=6.0 is THE tuning knob (mean
  ridge° → openness 0); the script's 4 sanity probes (Sacramento flat / Auburn
  foothills / Emerald Bay basin / canyon floor) reveal the real spread — retune
  if they bunch. synthesis.js openHorizon signal (weight 0.8, dormant until
  tags.horizon written). UI: popup "Light today" gains a land-horizon line
  (E/W ridge °, "trees not counted"); Top-spots "Open horizon" require chip
  (ADD new signals to BOTH synthesis.SIGNALS and ui/synthesis.js LAYER_CHIPS).
  RE-RUN horizon.yml after a full OSM refresh (regenerates spots.json, drops the
  tags — same ordering caveat as light-pollution/public-lands). sw CACHE
  pointer-0.7.0. VERIFIED: geometry validated headless vs synthetic surfaces
  (distance round-trip exact, 100 m@1 km=5.59°, flat→open 1.0, ridged→0,
  directional rays correct); app boots zero pageerrors, "Open horizon" chip
  renders + correctly DORMANT (0 rows) pre-data; 65 tests (added openHorizon
  dormant→active), contrast green. GDAL is runner-only (not installable in the
  sandbox) — like build-light-pollution.py, the python glue is unrun locally but
  mirrors the proven light-pollution script exactly.
- 2026-07-19 0.6.0 "Public lands" BUILT on staging (awaiting on-device pass):
  Tier 2a of the integrations list. ingest/adapters/public-lands.mjs (OSM/
  Overpass, ODbL): fetches protected-area POLYGONS (out geom) — boundary=
  protected_area / leisure=nature_reserve / boundary=national_park ONLY (the
  leisure=park["name"] selector made out geom HANG on Overpass across
  Sacramento's city parks — dropped it; city parks are already `park` spots).
  ingest.mjs `public-lands` command point-in-polygons every spot
  (geo.js pointInArea, smallest-containing-area wins) → tags.publicLand
  {name,class,operator}; writes data/layers/public-lands.json (metadata, no
  rings — repo stays lean). Own workflow public-lands.yml (RE-RUN after a full
  OSM refresh, which regenerates spots.json and drops publicLand+bortle tags —
  same ordering caveat as light-pollution). synthesis.js publicLand signal
  (weight 0.6, dormant until tagged). ui: popup "On public land: X — check
  access hours" + Top-spots "Public land" require chip (ADD new signals to
  BOTH synthesis.SIGNALS and ui/synthesis.js LAYER_CHIPS). RESULT: 488/2362
  spots on public land (protected_area 220, forest cls6 135, reserve 52,
  wilderness 1b 39, ...), 97 areas. sw CACHE pointer-0.6.0. VERIFIED headless:
  Top-spots "Public land" require → 30 all-public, "Public land"+"Dark sky" →
  30 satisfying both, popup note renders, 64 tests, contrast green, zero
  pageerrors.
- 2026-07-19 0.5.0 "Tonight" BUILT on staging (awaiting on-device pass): moon +
  clear-sky = Tier 1 of Noah's "do all integrations in order" list. model/
  tonight.js (on-device via astronomy-engine): moon phase/illumination,
  moonrise/set, astronomical night (sun<−18°), and the DARK WINDOW (longest
  stretch of astro-night with the moon also down, sampled at 12-min steps) —
  the Milky-Way time. GOTCHA: anchor the sun/moon search at local NOON (not
  midnight) so the COMING night's dusk→dawn are found in order. model/
  weather.js: cloudTonight() live from Open-Meteo (free, no key, CORS), fetched
  PER SPOT on popup open (not for all 2362), fails soft. UI: "Tonight" panel in
  the popup (ui/mapview.js tonightSection). CSP connect-src adds
  api.open-meteo.com (_headers). NOT ranking signals (moon/weather are global-
  ish or per-spot-network, don't fit the spatial one-time scorer) — they're the
  Tonight readout; synthesis stays spatial. sw CACHE pointer-0.5.0. Verified
  headless (mocked Open-Meteo): panel shows moon "first quarter 34% lit", dark
  window 11:29PM–3:53AM, "Sky tonight: clear (8% cloud)"; 58 tests, contrast
  green, zero pageerrors. REMAINING in-order: (Tier2) public-lands boundaries
  +night-access signal, open-horizon/elevation signal; (Tier3) air-quality/
  smoke, iNaturalist seasonal wildlife, HMdb markers, Flickr CC density.
- 2026-07-19 PROMOTED 0.2.0 + 0.3.0 + 0.4.0 to main in one fast-forward
  (Noah's "Push main"): production == 0.4.0 (photo-pointer.pages.dev). Golden
  Hour, cross-layer synthesis, and the dark-sky/Bortle layer are all live.
  staging == main after this; next candidate re-diverges staging.
- 2026-07-19 SCAFFOLDED (this repo's genesis): Spot schema + dedup
  (src/model/), OSM/Overpass adapter working + 6 stub adapters with license
  notes (ingest/adapters/), region config seeded Sacramento/El Dorado/Placer
  (config/region.json), Leaflet map app (no build step), sw.js offline,
  contrast gate, 33 node --test tests, CI/deploy/ingest workflows.
- 2026-07-19 0.4.0 "Dark skies" BUILT on staging (awaiting on-device pass): the
  light-pollution layer + Bortle per spot. Data = Falchi 2016 World Atlas of
  Artificial Night Sky Brightness (CC BY-NC 4.0, doi:10.5880/GFZ.1.4.2016.001).
  KEY LESSON (cost hours): the GFZ file is NOT machine-downloadable (JS-app
  landing, no DataCite contentUrl, backend API not scrapeable) — DO NOT try to
  hack GFZ again. Noah shared World_Atlas_2015.zip (684 MB raw GeoTIFF) +
  a KMZ from his Drive; the Google Drive MCP connector caps downloads at 10 MB,
  so a RUNNER fetches the public Drive link
  (https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t)
  — that's the working pattern for any big Drive file. Pipeline
  (.github/workflows/light-pollution.yml + scripts/build-light-pollution.py,
  GDAL+python on a runner): download zip → crop World_Atlas_2015.tif to region
  bbox → artificial brightness mcd/m² → total sky mag/arcsec² (natural sky
  0.174 mcd/m²) → Bortle via the SQM table → write tags.bortle on every spot +
  render data/layers/light-pollution.{png,json} (overlay + labeled legend).
  This AUTO-ACTIVATED the dormant darkSky synthesis signal. UI: ui/lightlayer.js
  (Leaflet ImageOverlay + opacity + text legend, toggled in the layers control).
  sw CACHE pointer-0.4.0. VERIFIED headless: overlay + 9-class legend render,
  Top-spots "Dark sky" require returns 30 spots all Bortle-tagged, popup shows
  the Bortle part, zero pageerrors; ingest sanity Sacramento=7, Auburn=5,
  Desolation Wilderness=1 (all correct); 2,362/2,362 spots tagged. 52 tests,
  contrast green.
- 2026-07-19 0.3.0 "Cross-layer synthesis" BUILT on staging (awaiting on-device
  pass): the app's DIFFERENTIATOR. Competitive research (real, this session)
  showed every layer is already served better by a dedicated app — the only
  unmet need is scoring spots where MULTIPLE layers line up. src/model/
  synthesis.js is a SIGNAL REGISTRY: new data source = append one signal
  {key,label,weight,evaluate(spot,ctx)->{value,note}|null}; scoreSpot NEVER
  changes. Score = Σ(value·weight)/(Σ weights of LIVE signals) so breadth wins
  and dormant sources don't suppress scores. darkSky signal ships DORMANT →
  auto-activates when a source writes tags.bortle (tested). UI: ★ Top spots
  panel (ui/synthesis.js — rank + require-layer chips + fly-to via
  mapview.focusSpot) + "Why this spot" popup breakdown. sw CACHE pointer-0.3.0.
  Verified headless: top spot "Upper Eagle Falls" 65 (layered+wildlife+view),
  require Dark-sky→empty (dormant proof), 3-layer require→3 spots all matching,
  52 tests, contrast green, zero pageerrors. See the synthesis contract in
  NOTES.md — don't edit scoreSpot to add a source.
- 2026-07-19 0.1.0 PROMOTED to main (Noah's "Promote to main"): production
  live at photo-pointer.pages.dev (Deploy run on main green). Then eBird added
  (2,362 spots) + PolyForm license. main == 0.1.0.
- 2026-07-19 0.2.0 "Golden Hour" BUILT on staging (awaiting on-device pass):
  per-spot "Light today" in the popup — blue/golden-hour, sunrise, sunset +
  sun COMPASS direction, computed on-device (src/model/light.js) via vendored
  astronomy-engine (MIT, src/vendor/astronomy.js). GOTCHA baked into light.js:
  anchor the rise/set search at the spot's LOCAL midnight (est. from lng,
  solar time = UTC + lng/15h) — a UTC-midnight anchor returns YESTERDAY's
  sunset for US sites. sw CACHE pointer-0.2.0 (astronomy.js + light.js
  precached). Verified headless (TZ=America/Los_Angeles): popup shows
  "Sunrise 5:54 AM NE", 6 windows ordered, polar day handled, zero pageerrors;
  43 tests, contrast green.
- 2026-07-19 FIRST LIVE DATA: Ingest OSM committed data/spots.json = 1,711
  deduped spots for Sacramento/El Dorado/Placer (OSM/Overpass, ODbL). Deploy
  auto-creates the Pages project; staging deploys are green (no secrets step
  needed — they're inherited from Noah's account). GOTCHAS learned this
  session: (1) Overpass rejects anonymous UAs (406/429) — send a real
  User-Agent; (2) Overpass public mirrors hang/504 under load — retry across
  3 mirrors with a 210s per-attempt cap + a 25-min job timeout; (3) the
  dedup_key can collide for two DIFFERENT nearby places sharing a geohash
  cell — resolveSpots suffixes collisions (`~2`) so ids stay unique.
