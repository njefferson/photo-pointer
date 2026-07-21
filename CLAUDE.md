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

## SETTLED, don't re-offer:
## - FLICKR is DEAD as a source (Noah verified 2026-07-19 with a screenshot):
##   "API key creation is currently disabled for free accounts. API key creation
##   is available to all Flickr PRO subscribers." So no free Flickr key exists.
##   We do NOT pay for Flickr PRO for a free personal tool. The "where CC
##   photographers shoot" value is served instead by WIKIMEDIA COMMONS photo
##   density (keyless, and everything on Commons is already free-licensed — no
##   per-photo filtering needed). Do not re-propose Flickr.
## - AIR QUALITY / SMOKE uses OPEN-METEO AIR QUALITY (keyless, CORS, live,
##   client-side per spot — us_aqi + pm2_5, and PM2.5 captures wildfire smoke),
##   NOT NASA FIRMS. FIRMS 24h active-fire is an ephemeral snapshot that would go
##   stale the moment it's committed; Open-Meteo AQI is live at view time (same
##   pattern as the Tonight weather). Don't commit a fire snapshot into spots.json.

## Versioning (Noah, 2026-07-20): version.capability.iteration (same as the
## sibling apps). sw.js CACHE = `pointer-<x.y.z>` and src/data/changelog.js
## CHANGELOG[0].v carry the SAME triplet — bump both together; the ⓘ panel's
## "Version" stamp renders CHANGELOG[0].v. Major (x) is Noah's call. 1.0.0 was
## declared at the first full release (2026-07-20).

## Project facts (append on every release, unprompted)
- 2026-07-21 PROMOTED 1.5.1 to main (Noah's "promote all"). Production ==
  origin/staging == 482356b (clean 1-commit fast-forward from 1.5.0). "Find
  Noah's other free tools" (an ITERATION) — the ⓘ panel (openAbout, src/ui/
  install.js) now ends with a link to the personal hub noahjefferson.pages.dev's
  sibling apps: a `<p class="dim">` with an `<a style="color:inherit;text-
  decoration:underline">More free tools by Noah Jefferson ↗</a>` (inherits the
  gated --dim colour so no new contrast pair; underline is the non-colour
  affordance). Part of a cross-app initiative (the hub links OUT to each app;
  this adds the RETURN path). sw CACHE pointer-1.5.1; changelog[0] 1.5.1.
  VERIFIED headless: ⓘ/welcome dialog shows the link, 6.1:1 contrast, zero
  pageerrors; check-contrast.mjs green. The SAME back-link shipped the same day
  to Frame (3.1.1), Clear Horizons (2.16.7) and Jefferson-Photography-Studio.
  NEEDS NOAH'S HANDS: real tap on the link on iOS Safari (taste, not regression).
- 2026-07-21 PROMOTED 1.4.3 + 1.5.0 to main (Noah's "promote"). Production ==
  origin/staging == 2f4a410 (clean 2-commit fast-forward from 1.4.2). Ships the
  tap-a-cluster-to-zoom-in gesture (1.4.3) AND the eBird bird hotspots for
  Hahira (23) & Panama City Beach (168), reused from Frame with no API/cookie
  (1.5.0). staging == main after this. NOTE 1.5.0 widened PCB's geographic
  scope (added Gulf + Walton counties, St. Joseph Peninsula ~50 km SE and
  Grayton Beach NW) to match Frame's PCB region — if Noah later wants PCB kept
  tight to the beach, narrow its counties/bbox back.
- 2026-07-21 1.5.0 "Bird hotspots for Hahira & Panama City Beach" (a CAPABILITY)
  BUILT on staging (awaiting on-device pass — NEEDS NOAH'S HANDS: how the two
  areas feel now that the bird-hotspot pins are on them, and the wider region
  frame on region-switch). Fills the ONE remaining data layer for these two
  regions (the eBird bird hotspots that 1.4.0/1.4.1 documented as pending —
  Frame didn't cover GA/FL then; it now does, built 2026-07-21 via Frame's
  cookie-gated pipeline). NO eBird API / cookie touched — pure data REUSE from
  the sibling Bird-location-scouting repo, exactly the Humboldt/Yellowstone
  pattern (import-ebird-from-frame.mjs → ebird → merge → validate, all local,
  no network). MECHANISM: the two regions already existed (1.4.0) but each
  listed only ONE county (Lowndes / Bay). To land ALL the data Frame captured
  I EXPANDED each region's `counties` in config/regions.json to Frame's full
  scope and WIDENED the bboxes to cover the added counties' hotspots:
  * hahira: +Lanier (US-GA-173, 13173), +Brooks (US-GA-027, 13027), +Cook
    (US-GA-075, 13075) → 4 counties. bbox widened to
    S30.45/W-83.72/N31.22/E-82.95 (was S30.5/W-83.65/N31.1/E-82.95 — hotspots
    reached lat 31.16 / lng -83.655, would've been dropped). 23 hotspots
    imported (Lowndes 12/Lanier 5/Brooks 3/Cook 3).
  * panama-city-beach: +Gulf (US-FL-045, 12045), +Walton (US-FL-131, 12131) →
    3 counties. bbox widened to S29.6/W-86.45/N31.05/E-85.0 (was
    S29.9/W-86.05/N30.65/E-85.3 — the Gulf/Walton hotspots span lat 29.67..30.99
    / lng -86.39..-85.06, mostly OUTSIDE the Bay-only box). 168 hotspots
    imported (Bay 81/Gulf 33/Walton 54). NOTE this is a real GEOGRAPHIC
    EXPANSION of PCB — St. Joseph Peninsula (Gulf) is ~50 km SE, Grayton Beach
    (Walton) is to the NW; matches Frame's own PCB region definition. If Noah
    wants PCB kept tight to the beach, narrow the counties/bbox back.
  SCHEMA TRANSFORM (the only real adaptation): Frame's county files carry
  per-species freqByMonth + checklistsByMonth; Photo-Pointer DELIBERATELY does
  NOT store those (eBird terms — no bulk redistribution). import-ebird-from-frame
  .mjs already strips to hotspot IDENTITY only {locId,name,lat,lng,nSpecies} →
  wildlife_hotspot spots (category), popup links to ebird.org/hotspot/<locId>.
  So NO frequency data was copied — same license-honoring subset as the CA
  regions. RESULT (merged, enrichment tags preserved across the merge):
  hahira 134→156 spots (all 23 hotspots present; 22 as wildlife_hotspot, 1
  deduped into a colocated OSM park, SOURCE_PRIORITY osm>ebird); PCB 83→239
  spots (all 168 present; 156 wildlife_hotspot, 12 deduped into OSM parks).
  0 dropped outside bbox (widening worked); 134/83 OSM spots kept their
  bortle/horizon/inat/commons tags. NEW eBird hotspot spots have no enrichment
  tags yet (dormant, honest — a future OSM/enrichment run over the widened
  counties would add them; OSM still only covers Lowndes/Bay). Files: config
  /regions.json, ingest/inputs/{hahira,panama-city-beach}-ebird-hotspots.json
  (committed snapshots), data/sources/<id>/ebird.json, data/regions/<id>.json;
  sw CACHE pointer-1.5.0 (config/regions.json is precached → bump needed);
  changelog[0] 1.5.0. VERIFIED headless (playwright, tiles blocked): all 5
  region pills incl. both new; switch Hahira → h1 "photo-pointer — Hahira, GA"
  + 10 wildlife_hotspot pins in the town viewport (47 pins total, rest culled);
  switch PCB → h1 correct + 32 hotspot pins (105 total); ZERO pageerrors. Data
  counts verified from the region JSON (156/239 spots, all 23/168 imported
  hotspots carry an eBird source). 91 tests + contrast green. BRANCH NOTE:
  web-task harness designated a claude/* branch; landed on `staging` per the
  standing staging-only rule (as with 1.4.0/1.4.1).
- 2026-07-20 1.4.3 "Tap a cluster to zoom in" BUILT on staging (awaiting
  on-device pass — NEEDS NOAH'S HANDS: the tap-to-zoom feel on a real touch
  screen). Noah's ask: the neutral numbered summary pins should, when tapped,
  zoom in until the pins beneath them become visible. IMPLEMENTED in
  ui/mapview.js: cull() now records each kept cluster's members (cellMembers by
  40px grid cell) onto the rec (rec.clusterCount, rec.clusterMembers). New
  zoomToCluster(rec) fitBounds()es the members' bounds (padding 50); the
  resulting moveend re-runs cull() which drops them into their own cells and they
  separate. If getBoundsZoom(bounds) <= current zoom (members too tight to split
  even at max, e.g. near-coincident), it falls back to opening the top place's
  card so the tap still does something. WIRING GOTCHA (cost a debug cycle):
  Leaflet's bindPopup registers `click:this._openPopup` capturing the FUNCTION
  REFERENCE at bind time, so reassigning marker._openPopup does NOT intercept —
  the popup still opens. Correct fix: `marker.off({click:marker._openPopup,
  keypress:marker._onKeyPress})` to detach Leaflet's exact handlers, then add our
  own click+keypress(Enter) `activate()` that zooms for a cluster else
  rememberViewForPopup()+openPopup(). Covers mouse AND keyboard. Legend + cluster
  aria-label reworded to "tap to zoom in" / "activate to zoom in". sw CACHE
  pointer-1.4.3; changelog[0] 1.4.3. VERIFIED headless (playwright): zoomed out to
  z8 (48 clusters), tapped the "99+" cluster → zoomed to z11, NO popup, pins
  declustered (48→245 finer pins); regression — a single non-cluster pin still
  opens its card; zero pageerrors. 91 tests + contrast green.
- 2026-07-20 PROMOTED 1.4.2 to main (Noah's "Promote"). Production ==
  origin/staging == 6b5f4f2 (clean 1-commit fast-forward from 1.4.1). Ships the
  basemap fix: Referrer-Policy no-referrer → strict-origin-when-cross-origin so
  OSM tile requests carry a Referer and stop 403'ing to the "Access blocked"
  placeholder. Affected every region. staging == main.
- 2026-07-20 1.4.2 "The map background is back" BUILT on staging (awaiting
  on-device pass — NEEDS NOAH'S HANDS: confirm the OSM basemap tiles actually
  render on his device). BUG (Noah screenshot, home region): the ENTIRE basemap
  was OSM's "Access blocked — Referer is required by tile usage policy of
  OpenStreetMap's volunteer-run servers: osm.wiki/Blocked" placeholder — every
  tile 403'd; pins/popup/data all fine (app logic unaffected). ROOT CAUSE: the
  _headers file set `Referrer-Policy: no-referrer`, which strips the Referer from
  the cross-origin tile requests to tile.openstreetmap.org; OSM's tile servers now
  REQUIRE a Referer (or identifiable UA — browsers can't set UA) and block
  requests without one. FIX: Referrer-Policy → `strict-origin-when-cross-origin`
  (the modern browser default — sends only the ORIGIN on cross-origin HTTPS, no
  path leak, no https→http downgrade), plus a comment in _headers so it's never
  reverted to no-referrer. VERIFIED headless A/B (playwright request-header
  capture): under no-referrer a cross-origin tile request carries NO Referer;
  under strict-origin-when-cross-origin it carries the origin. Could NOT hit
  tile.openstreetmap.org from the sandbox (egress blocked), so the final
  tiles-render proof is NOAH'S DEVICE. Affects ALL regions, not just the new
  ones. sw CACHE pointer-1.4.2; changelog[0] 1.4.2. 91 tests + contrast green.
- 2026-07-20 PROMOTED 1.4.1 to main (Noah's "Promote"). Production ==
  origin/staging == 6e84e35 (clean 12-commit fast-forward from 1.4.0). Ships all
  5 enrichment layers for both new regions (hahira + panama-city-beach:
  bortle/horizon on every spot, public-land/iNaturalist/Commons on the subset
  with data) + the empty-public-lands robustness fix. staging == main. The ONLY
  remaining layer for these two areas is eBird bird hotspots (needs the live API +
  an EBIRD_API_TOKEN repo secret — a Noah manual step, still not done). No new
  GitHub metadata step (regions aren't repo metadata; description/website/topics
  unchanged).
- 2026-07-20 1.4.1 "Full data layers for Hahira & Panama City Beach" BUILT on
  staging (awaiting on-device pass — NEEDS NOAH'S HANDS: how the two areas feel
  with the full layer set + the dark-sky overlay on each). ALL 5 ENRICHMENT
  LAYERS run for both new regions (Noah's "Do the 5"), each a per-region
  workflow_dispatch on staging (MCP actions_run_trigger), landed one enrichment
  type per round with both regions in parallel (different data/regions/<id>.json
  files → clean rebase; NEVER two enrichments on the SAME region at once — they'd
  race the same file). COVERAGE: hahira (134 spots) bortle 134, horizon 134,
  publicLand 0, inaturalist 7, commons 70; panama-city-beach (83) bortle 83,
  horizon 83, publicLand 2, inaturalist 9, commons 11 (bortle+horizon tag every
  spot from the raster/DEM; the point layers tag subsets — all honest). ONE MORE
  PIPELINE ROBUSTNESS FIX (same shape as the markers one): cmdPublicLands now
  records an EMPTY public-lands layer + skips when a brand-new region has 0
  OSM-mapped protected areas, instead of exit(1). WHY: hahira's first public-lands
  run FAILED — Overpass returned 0 protected areas for Lowndes County GA (rural,
  none mapped) and the 0-guard aborted; after the fix, re-ran → empty layer
  recorded. PCB had 2 and succeeded first try. light-pollution used the baked-in
  Drive zip_id default (Falchi World Atlas 2015); horizon pulled SRTM tiles from
  AWS elevation-tiles-prod; all keyless. NO eBird bird hotspots for these two
  still (Frame doesn't cover GA/FL — the live-API + EBIRD_API_TOKEN follow-up is
  the ONLY remaining layer). sw CACHE pointer-1.4.1; changelog[0] 1.4.1. VERIFIED
  headless (playwright, TZ=LA, tiles blocked): both regions load + switch, Hahira
  19 / PCB 55 pins after Show all, titles right, switch home clean, ZERO
  pageerrors; both validate clean; 91 tests + contrast green. GIT HYGIENE NOTE:
  after promoting 1.4.0 I was left on local `main`; caught it, reset local main
  to origin/main and moved the enrichment work onto local `staging` before any
  push — production main never received enrichment WIP. Landed on staging per the
  standing rule (task harness's claude/* branch ignored, as with 1.4.0).
- 2026-07-20 PROMOTED 1.4.0 to main (Noah's "Promote"). Production ==
  origin/staging == c29df83 (clean 6-commit fast-forward from 1.3.1). Ships the
  two new regions — Hahira / Lowndes County, GA and Panama City Beach / Bay
  County, FL — with their OSM base data (hahira 134 spots, panama-city-beach 83),
  plus the eBird graceful-skip and the markers 0-guard fix that let a
  Frame-uncovered / marker-less region build. staging == main after this. STILL
  the documented follow-up for these two areas: bird hotspots (live eBird API +
  EBIRD_API_TOKEN secret — Noah manual step) and the 5 enrichment layers
  (bortle/horizon/public-lands/inaturalist/commons, one workflow dispatch each).
- 2026-07-20 1.4.0 "Two new areas: Hahira, GA & Panama City Beach" BUILT on
  staging (awaiting on-device pass — NEEDS NOAH'S HANDS: real iPad region-switch
  to Hahira + Panama City Beach and how those two areas feel). TWO NEW REGIONS
  added to config/regions.json (a config + data change, no app code): `hahira`
  = Lowndes County, GA (fips 13185, US-GA-185, bbox 30.5..31.1 / -83.65..-82.95,
  center Hahira 30.9902,-83.3724) and `panama-city-beach` = Bay County, FL (fips
  12005, US-FL-005, bbox 29.9..30.65 / -86.05..-85.3, center PCB 30.1766,
  -85.8055). DATA via ingest-osm.yml runner dispatched on staging (MCP
  actions_run_trigger): hahira 134 spots (78 oddity, 32 park, 23 marker, 1
  viewpoint), panama-city-beach 83 spots (64 park, 8 oddity, 6 marker, 4
  campsite, 1 trailhead). Both validate clean; each region `center` opens on the
  named town. TWO PIPELINE ROBUSTNESS FIXES were needed because Frame (the eBird
  source) doesn't cover GA/FL: (1) eBird now SKIPS GRACEFULLY when a region has
  no committed hotspot snapshot (ebird.mjs snapshotFile/hasSnapshot +
  cmdEbird guard) instead of aborting `all` — so these two launch with NO bird
  hotspots for now (add later from the live eBird API, GET ref/hotspot/{region}
  with an EBIRD_API_TOKEN repo secret — a Noah manual step, not done). (2) the
  markers 0-guard now only refuses when an EXISTING wikidata.json would be
  clobbered; a brand-new region with 0 Wikidata markers skips gracefully. WHY:
  the FIRST hahira run FAILED — OSM fetched 151 places, eBird skipped fine, then
  `markers: 0 records` (Lowndes County GA has no Wikidata monuments/HMdb items)
  aborted the whole `all` before merge; PCB had markers and succeeded first try.
  After the guard fix, re-dispatched hahira → merged. (Note hahira's 23 markers
  are OSM historic=memorial/monument tags, not Wikidata.) ENRICHMENT LAYERS
  (bortle/horizon/public-lands/inaturalist/commons) NOT yet run for either
  region — the documented follow-up (dispatch each workflow with region=hahira /
  panama-city-beach), exactly how Humboldt/Yellowstone were built up; their
  synthesis signals stay dormant until then. sw CACHE pointer-1.4.0;
  changelog[0] 1.4.0. VERIFIED headless (playwright, TZ=LA, tiles blocked as
  usual): all 5 region pills render incl. both new ones; switch Hahira → h1
  "photo-pointer — Hahira, GA" + 18 pins mounted after Show all; switch Panama
  City Beach → 54 pins; switch back to home clean; ZERO pageerrors. 91 tests +
  contrast green. No new GitHub metadata step (description/website/topics
  unchanged; regions aren't repo metadata). BRANCH NOTE: the web-task harness
  designated a `claude/add-hahira-pcb-regions-md0yyb` branch, but per the
  standing staging-only rule this landed on `staging` (flagged to Noah).
- 2026-07-20 PROMOTED 1.3.1 to main (Noah's "Promote"). Production ==
  origin/staging == a8c6564 (clean fast-forward from 1.3.0). New app icon +
  matching social-preview.png. Noah CONFIRMED he uploaded the new
  social-preview.png to GitHub Settings → Social preview (the one manual step
  the API can't do); repo description/website/topics already confirmed set.
  staging == main.
- 2026-07-20 1.3.1 "A brand-new icon" BUILT on staging (Noah: the old dark-brown
  #2e2618 pin-on-square icon was "poop brown"; he generated a new one with
  another AI — the camera-aperture map pin over a bright golden-hour valley
  (mountains, pines, stone bridge, river, a dirt trail, and a CA historical-
  landmark sign). He iterated once: v1's busy tall foreground grass → v2 swapped
  it for a calmer dirt trail/river foreground, which he chose. ASSET PIPELINE
  (sharp, installed from npm in the repo dir — sandbox reaches registry.npmjs.org):
  source at assets/icon-source.png (1254², kept for regen). The source had baked
  ROUNDED CORNERS with a black border (radius ≈222px, black reaching ~66px along
  the diagonal), so scripts cropped an 80px inset each side → clean full-bleed
  square (no black, ~6% edge loss), then resized to apple-touch-icon.png (180),
  icon-192.png, icon-512.png (flatten #fff, opaque). Full-bleed so iOS/Android
  apply their OWN mask — never bake rounding/black into an icon PNG. index.html
  rel=icon → icon-192.png; manifest icons → 192+512 png "any"; sw.js precaches
  the three PNGs; OLD icon.svg DELETED (all refs updated). sw CACHE pointer-1.3.1;
  changelog[0] 1.3.1. VERIFIED: post-crop corners are sky/ground not black;
  renders clean + legible (pin is the hero) at 60/120/180; manifest valid JSON;
  91 tests + contrast + smoke48 green, zero pageerrors. NEEDS NOAH'S HANDS +
  IOS CAVEAT: iOS captures a PWA's home-screen icon AT INSTALL time, so an
  already-installed app won't show the new icon until he REMOVES it from the home
  screen and re-adds it (Share → Add to Home Screen); new installs get it
  automatically. To regenerate icons from a new source: sharp crop-inset +
  resize (see this entry).
- 2026-07-20 PROMOTED 1.3.0 to main (Noah's "Promote"). Production ==
  origin/staging == 25ebf85 (clean fast-forward from 1.2.1). Seamless
  auto-update on relaunch + "Check for updates" button are live. staging == main.
- 2026-07-20 1.3.0 "Updates arrive on their own" BUILT on staging (Noah: "I don't
  like having to force close my app twice every time to see new updates. My kids
  will never get them" + asked for a "force update" button). ROOT CAUSE of the
  double-close: sw.js skipWaiting()+clients.claim() so a new SW ACTIVATES on the
  first relaunch, but nothing told the already-loaded PAGE to reload and the code
  modules are cache-first (SWR) — so launch#1 ran old code while caching new,
  launch#2 finally served it. FIX (main.js setupServiceWorker): a
  `controllerchange` listener reloads the page ONCE when a new worker takes
  control, guarded by `hadController` (no reload on the first-ever install/claim)
  and a `reloading` flag (no loop). reg.update() on every open so a new SW is
  discovered at launch. Net: a SINGLE relaunch (or the button) lands the new
  version. MANUAL BUTTON (install.js checkForUpdates + updateButton, rendered in
  openAbout under a new "Updates" h3): calls reg.update(); on `updatefound` →
  "Updating…" + the controllerchange reload takes over; else after 2s a "You're
  on the latest version (vX)" toast; offline/unsupported fail soft with a toast.
  CSS .update-btn (weight + firmer border, gated ink/bg). sw CACHE pointer-1.3.0;
  changelog[0] 1.3.0. IMPORTANT HONESTY: the auto-reload + button live in the
  NEW page/SW, so getting TO 1.3.0 from 1.2.1 may STILL need the old dance once
  (the 1.2.1 page has no controllerchange handler); every update 1.3.0→onward is
  seamless. VERIFIED (smoke49, REAL service workers over a mutable local server
  that flips the advertised version = a simulated deploy): first visit installs
  v1.3.0, relaunch stays controlled at v1.3.0 (no spurious reload), then after
  the server flips to v1.4.0 a SINGLE relaunch auto-updated the ver-stamp to
  v1.4.0 + fired the "What's new" dialog, and the manual button reports "You're
  on the latest version (v1.4.0)"; zero pageerrors. 91 tests + contrast + axe
  (zero across 16 surface×theme, incl. the About "Updates" button) green;
  smoke48 still green. GITHUB METADATA CONFIRMED (read via API, Noah did it):
  description + website (photo-pointer.pages.dev) + all 6 topics set correctly;
  the social-preview IMAGE is the one field the API can't expose to verify.
- 2026-07-20 PROMOTED 1.2.0 + 1.2.1 to main (Noah's "Promote to main" after he
  caught the blue-on-blue button on his phone and it was fixed). Production ==
  origin/staging == a7e0a88 (clean fast-forward from 1.1.1). Ships the 7-item
  feedback batch (collapsible legend, prominent photo/wildlife buttons, focusSpot
  first-tap + stay-centred, 🏆 Top-spots icon, "My pins", add-pin help, Top-spots
  filter narrows the map) AND the 1.2.1 contrast fix. staging == main after this.
- 2026-07-20 1.2.1 "Photo button is readable" BUILT on staging (Noah caught it
  on his phone from a screenshot: the new Commons/iNaturalist link BUTTONS
  rendered BLUE TEXT ON BLUE — #0078A8 on #1663a8, ~1.3:1). ROOT CAUSE + DURABLE
  LESSON: leaflet.css has `.leaflet-container a { color:#0078A8 }` (specificity
  0,1,1) which BEATS a bare `.popup-linkbtn` class (0,1,0), so my white was
  silently overridden. FIX: every popup link colour MUST out-specify it — qualify
  with `.leaflet-container a.<class>` (e.g. `.leaflet-container a.popup-linkbtn`,
  `.leaflet-container a.popup-srclink`). WHY THE AXE AUDIT MISSED IT (the second
  bug): Leaflet popups use CSS transforms, so axe's color-contrast rule can't
  resolve the background and drops the check into `incomplete` — NOT
  `violations` — and the audit only read `violations`. GUARD ADDED: the a11y
  harness now runs a `popupContrast()` walker that computes WCAG ratio directly
  for every popup link/button/badge vs its first opaque ancestor bg (proven to
  FIRE on the bug: flagged both buttons at 1.26:1, then clean after the fix).
  NOTE the token-based scripts/check-contrast.mjs gate CANNOT catch popup-local
  fixed hex (#1663a8/#0078A8/#a34a00 etc. aren't :root tokens) — popup contrast
  is guarded ONLY by that headless walker; run the a11y audit on any popup CSS
  change. sw CACHE pointer-1.2.1 (bumped so the fixed styles.css re-precaches on
  device, not lingering behind the 1.2.0 cache); changelog[0] 1.2.1. VERIFIED:
  linkbtn computed color now rgb(255,255,255) on #1663a8 (~6.2:1); axe zero
  violations + popupContrast clean across 16 surface×theme combos; smoke48 +
  91 tests + token contrast still green.
- 2026-07-20 1.2.0 "A map legend, clearer links & pin help" BUILT on staging
  (awaiting on-device pass — NEEDS NOAH'S HANDS on real iPad/iPhone: legend
  collapse/expand feel, the 🏆 Top-spots glyph read, and the map-filter banner
  ergonomics). A batch of 7 feedback items, all in src/. (1) COLLAPSIBLE LEGEND
  (mapview.js LegendControl, bottom-left; CSS .map-legend/.legend-*): a "Legend ▸"
  button expands a themed card listing every category letter+colour, plus a gold-
  ring swatch (photos nearby) and a neutral "3" circle (cluster). Default
  collapsed; aria-expanded/aria-controls; a footer tip on drop-a-pin. (2) PHOTO/
  WILDLIFE LINK-OUTS are now solid buttons (.popup-linkbtn, white on #1663a8 ≈
  5.2:1) under a plain caption instead of a word buried in a sentence (popupFor).
  (3) focusSpot REWRITE: a `forcedId` keeps the chosen spot MOUNTED + UNCLUSTERED
  in cull() (so it's there on the FIRST tap even inside a decluttered patch), and
  a `focusCenter` recenters the map on the spot when its popup closes instead of
  the popup-restore panning back to the old view. ALSO fixed a latent declutter
  bug: markerById recs never carried `id`, so scoreOf(rec.id)→undefined→0 made
  "highest score wins" a no-op (insertion-order instead); recs now store id.
  (4) Top-spots header button glyph ★→🏆 (★ read as favourites). (5) CATEGORY_META
  user_pin label 'My pin'→'My pins'. (6) ADD/MANAGE PINS help in openAbout
  (install.js): long-press/right-click to drop, tap→Remove pin (undo), ⤓ to back
  up. (7) TOP-SPOTS FILTER NOW NARROWS THE MAP: topSpotsPanel takes onFilter;
  each require/exclude apply() calls mapView.setSpotFilter(idSet|null). cull()'s
  candidate test honours spotFilter (OVERRIDING the category toggles) so requiring
  a layer from an all-off map still populates it; a standing .map-filter-banner
  ("Map filtered to N top spots" + "Show all") announces the mode and exits it.
  setSpotFilter(null) is also called from main.applyVisible (driving categories
  clears the filter) and on region switch (stale ids). .map-root got
  position:relative so the banner anchors to the map, not the page. sw CACHE
  pointer-1.2.0; changelog[0] 1.2.0. VERIFIED headless (smoke48): My pins label,
  🏆 icon, legend collapse→expand (11 rows, gold+cluster swatches, aria), gold
  ring + neutral cluster on the map, focus PhotoPeak0 → popup on first click +
  Commons button in it + map stays on the spot after close (nearest marker 63px
  from centre), require Photographed → 6 rows + banner "Map filtered to 6 top
  spots" + only those 6 pins on the map + banner clears; zero pageerrors. 91
  tests + contrast green; axe-core across 16 surface×theme combos (incl. the new
  legend + filter banner) = ZERO violations. Prior smokes 44/45/46/47 still green.
- 2026-07-20 PROMOTED 1.1.1 to main (rolled up 1.0.1→1.1.1: popup snaps back,
  accessibility pass, tidy toolbar + always-there close + version stamp, photo-
  ring + "+N" cluster badge, neutral cluster count). Production == origin/staging.
- 2026-07-20 PROMOTED 1.0.0 to main (Noah's "Promote to main as version 1.0.0")
  — the FIRST MAJOR release, declared by Noah. Production == origin/staging
  (clean fast-forward from 0.14.0). Rolls up everything since 0.14.0: 0.15.0
  notability badges + source/data link-outs + tri-state Top-spots chips; 0.15.1
  dark-map-via-CSS-filter (dropped external CARTO tiles — they didn't load /
  weren't offline) + scrollable popups (Leaflet maxHeight) + backdrop-dismiss on
  every dialog (closeOnBackdrop in dom.js) + un-clipped Map/List toggle; 0.15.2
  verified-only historical markers (model/notability.js keepSpot — drops
  unverified OSM `historic=*` junk unless it has commons/wildlife data; ~41 junk
  dropped in Sacramento, 70 verified kept); 0.16.1 zoomed-out pin declutter (one
  pin per ~40px grid cell in cull(), highest synthesis score wins, user pins
  always kept — FEWER mounted nodes, no lag); 0.16.2 per-region opening `center`
  (config/regions.json) — Humboldt opens on Arcata. NOTE: category buttons are
  ON/OFF TOGGLES, not tri-state (Noah corrected a mis-build: only the Top-spots
  LAYER chips are tri-state require/exclude; the pin-type buttons stay simple
  show/hide, all-off default). sw CACHE pointer-1.0.0. All gates green (91 tests,
  contrast), each change headless-smoked.
- 2026-07-20 PROMOTED 0.13.6 to main — SECOND promotion, completes Yellowstone +
  ships the welcome/ⓘ UI batch (Noah's "Promote when it's done"). Production ==
  origin/staging (clean FF). YELLOWSTONE NOW FULLY DONE: 2789 spots, all 5
  enrichment layers (publicLand 485, horizon 2789, inat 297, bortle 2789, commons
  517) + OSM re-run folded in marker inscriptions (only 1 — Yellowstone backcountry
  has few historic plaques vs Gold-Rush Sacramento; honest, tag-preserving merge
  kept all 5 layers). All THREE regions now complete: Sacramento (5 layers, 22
  insc, 2409), Humboldt (5 layers, 17 insc, 1130), Yellowstone (5 layers, 1 insc,
  2789). Commons for Yellowstone took ~50 min (700 tiles, Wikimedia throttle) —
  commons.yml timeout is 55 min; if a bigger region is ever added, raise it again.
  UI ITERATIONS shipped in this promotion (0.13.4/5/6, all with headless smokes +
  91 tests + contrast green): 0.13.4 empty-map guidance — a "turn on a pin type"
  pop-up (showStartTip) on open when all categories are off, plus a standing
  .filter-tip header banner; 0.13.5 WELCOME + INSTALL pop-up (src/ui/install.js,
  first-visit, localStorage pointer.welcomed) — platform-aware Add-to-Home-Screen
  steps (iOS Share glyph) / native beforeinstallprompt on Android+desktop,
  isStandalone/platform detection; 0.13.6 the ⓘ panel = openAbout(): WHY the app
  exists (thesis) + install + collapsed CHANGELOG (src/data/changelog.js, VERSION
  === sw CACHE, keep in sync) + Version stamp, opened by a header .info-btn ⓘ and
  reachable from Backup. sw CACHE pointer-0.13.6. NOTE the earlier same-day fact
  below (0.13.0→0.13.3) is SUPERSEDED for Yellowstone — it's no longer 4/5.
- 2026-07-20 PROMOTED 0.13.0→0.13.3 to main (Noah's "Promote now" — he chose to
  ship before Yellowstone fully finished). Production == 7a654f3 (SW cache
  pointer-0.13.3, Deploy on main green). Clean 24-commit fast-forward, main was
  0.12.0. WHAT'S LIVE: the whole multi-region app (3 region pills, viewport
  culling, region-aware GPS landing) + these 0.13.x iterations — 0.13.1 marker
  inscription + clear reference link (Sacramento 22 + Humboldt 17 markers) and
  the all-off filter tip; 0.13.2 Wikipedia link-out from OSM wikipedia/wikidata
  tags (fetch-free/link-only — Wikipedia idea option (a); option (b) geosearch
  source NOT built); 0.13.3 region-aware GPS (a fix in Humboldt/Yellowstone
  switches to that region + centers, else Cameron Park). Data live: Sacramento
  (5 layers + 22 insc, 2409 spots), Humboldt (5 layers + 17 insc, 1130 spots),
  Yellowstone (4/5 layers — publicLand485/horizon2789/inat297/bortle2789, NO
  commons yet, 0 marker inscriptions, 2789 spots). PENDING → NEEDS A 2ND
  PROMOTION: Yellowstone commons (run 29718802870, ~700-tile harvest, 55-min
  ceiling — commons.yml timeout bumped 25→55) then its OSM re-run (inscriptions),
  both landing on staging; when done, staging re-diverges and Noah promotes again
  to complete Yellowstone in production. Everything else: staging == main.
- 2026-07-20 0.13.0 "Three regions + map trimming" BUILT on staging (awaiting
  on-device pass): Noah's "all the map trimming and Humboldt + Yellowstone
  regions, like Frame". FULL MULTI-REGION REFACTOR. config/regions.json = {
  default, regions:[...] } (old config/region.json DELETED); region.js gains
  loadRegions/pickRegion/validateRegions. DATA IS PER-REGION: data/regions/<id>
  .json (spots), data/sources/<id>/*.json, data/layers/<id>/* — migrated the
  Sacramento data into that layout (git mv). ingest.mjs: EVERY command takes an
  optional regionId 2nd arg (defaults to config default), per-region paths via
  regionPaths(id); `all <id>` = osm+ebird+markers+merge+validate. eBird for the
  new regions IMPORTED FROM FRAME (free, no runner): import-ebird-from-frame.mjs
  now region-aware, writes ingest/inputs/<id>-ebird-hotspots.json; Frame had all
  needed counties committed (Humboldt US-CA-023 597 hotspots; Yellowstone 5
  counties 721). Ran ebird+merge+validate LOCALLY → data/regions/humboldt.json
  (594 spots) + yellowstone.json (720). BBOXES widened to cover offshore/edge
  eBird hotspots (Humboldt pelagic west of coast; Powell WY east) — validate
  bbox check caught them. APP: main.js region switcher pills (.region-pill,
  active = weight+fill+accent-underline, not hue), store.js K_REGION persists
  choice, loadRegionData(id) fetches data/regions/<id>.json, switchRegion re-
  frames. mapview.js setRegion(region,{locate}) — geolocate on the HOME region
  boot, fitBounds on manual switch / other regions; fallbackCenter() = Cameron
  Park for home region else bboxCenter. lightlayer.js per-region path, overlay
  swaps on region change. MAP TRIMMING = viewport culling: markers CREATED once
  but only mounted while in a visible category AND within map.getBounds().pad
  (0.35); cull() on moveend/zoomend (rAF-debounced) — mirrors Frame's
  virtualization. Dropped the per-category LayerGroups. sw.js precaches DEFAULT
  region only (data/regions/sac-eldorado-placer.json + its layers); other
  regions runtime-cache on first visit. ALL workflows region-aware (workflow_
  dispatch `region` input + REGION env + "$REGION" arg + git add data/); ingest-
  osm.yml runs `all "$REGION"`. sw CACHE pointer-0.13.0. VERIFIED headless
  (smoke25): 3 region pills, all-off start (0 pins), Show all mounts 604/2409
  (CULLING PROVEN — only the viewport), switch Humboldt→594 pins + real hotspots
  (Arcata Bottoms/Ferndale Bottoms/Mad River), switch Yellowstone→720, zero
  pageerrors; 91 tests, contrast green. NEEDS RUNNER: OSM for humboldt +
  yellowstone (dispatch ingest-osm.yml region=<id>) to add viewpoints/parks/
  trailheads (they have eBird+markers-capable base now). NEEDS NOAH'S HANDS: real
  iPad region-switch feel + GPS. Enrichments (bortle/horizon/lands/inat/commons)
  for new regions = follow-up (workflows ready with region input; signals dormant
  until then). OSM RUNS DONE (ingest-osm.yml region=humboldt/yellowstone on
  staging): Humboldt now 1130 spots (207 viewpoints, 148 parks, 77 campsites, 69
  oddities, 38 markers, 28 trailheads, 563 hotspots); Yellowstone 2789 (1098
  viewpoints, 403 campsites, 303 parks, 139 trailheads, 119 oddities, 46 markers,
  681 hotspots). FIRST OSM RUNS FAILED at validate: `out center` returns the
  CENTROID of large multi-county areas (Klamath NF, Trinity Alps/Siskiyou
  Wilderness for Humboldt) which lands outside the region bbox → FIX: cmdMerge
  now drops spots outside region.bbox (inBBox filter, logged as "N dropped
  outside bbox"); re-ran, both green. VERIFIED (smoke26): switch Yellowstone →
  2789 pins, Humboldt → 1130, Sacramento culled 604/2409, 0 pageerrors.
- 2026-07-20 PROMOTED 0.12.0 to main (Noah's "Promote to main" after his device
  pass): production == 0.12.0 (photo-pointer.pages.dev, Deploy run #45 on main,
  green). Clean 1-commit fast-forward. staging == main after this. "Opens where
  you are" (geo start + center button + Cameron Park fallback + all-off default +
  Show all/Hide all) is live.
- 2026-07-20 0.12.0 "Opens where you are" BUILT on staging (awaiting on-device
  pass — needs Noah's HANDS: real iPad GPS + the Safari location-permission
  prompt, only Chromium-verified here). Noah's asks, all four done: (1) MASTER
  TOGGLE — main.js renderHeader adds a `.chip-all` button first in the chips row,
  label "Show all" when not-all-on / "Hide all" when all-on, sets
  applyVisible(all|none). (2) DEFAULT ALL-OFF — filter semantics CHANGED: the
  stored set is now the EXACT visible set (empty = nothing shown), dropping the
  old "empty means all" convention; store.js K_FILTERS bumped to
  'pointer.filters.v2' so a returning device starts all-off cleanly.
  currentVisible()=activeFilters() raw. (3) GEO START + CENTER BUTTON —
  mapview.js opens at map.setView(Cameron Park, 12) NOT fitBounds, then
  centerOnLocation() runs on boot: navigator.geolocation.getCurrentPosition →
  resolveCenter(coords) uses the fix if inBBox(region) (setView zoom 14) else the
  fallback; fails soft (denied/timeout → stays Cameron Park). A Leaflet
  CenterControl (◎, .map-center-btn, topleft by zoom) re-runs it. (4) OUT-OF-AREA
  → CAMERON PARK — FALLBACK_CENTER = {38.6785,-120.9872} (El Dorado County); any
  GPS fix outside region.bbox (or no fix) centers there + toast "You're outside
  the covered area — centered on Cameron Park, CA". sw CACHE pointer-0.12.0.
  VERIFIED headless (Playwright geolocation): all-off start = 0 pins in DOM (the
  groups aren't mounted), Show all → 2409 pins → Hide all → 0; center button
  present; in-area (Auburn fix) = no toast (centers on user), out-of-area (NYC
  fix) = Cameron Park toast; zero pageerrors in all three geo scenarios; 88
  tests, contrast green (added .chip-all/.map-center-btn — ink-on-card, gated).
- 2026-07-19 PROMOTED 0.5.0→0.11.0 to main in one fast-forward (Noah's "Promote
  to main" after his on-device pass on staging): production == 0.11.0
  (photo-pointer.pages.dev, Deploy run #41 on main). Seven releases went live at
  once — Tonight (moon/dark-window/clouds), Public lands, Open horizon, Wild
  subjects (iNaturalist), Historical sites (Wikidata/HMdb), Photographed
  (Commons), Air today (Open-Meteo AQI). That completes the WHOLE integrations
  list (Tiers 1-3). A top spot can now stack eight independent layers. main was
  0.4.0 → clean 23-commit fast-forward, main an ancestor of staging. staging ==
  main after this; next candidate re-diverges staging.
- 2026-07-19 0.11.0 "Air today" BUILT on staging (awaiting on-device pass): Tier
  3 item #3 (air quality / wildfire smoke). Uses OPEN-METEO AIR QUALITY (keyless,
  CORS, live client-side) NOT NASA FIRMS — a committed fire snapshot goes stale;
  live AQI at view time is the right shape (same as the Tonight weather), and
  PM2.5 IS the wildfire-smoke signal. model/airquality.js airToday(lat,lng):
  hits air-quality-api.open-meteo.com/v1/air-quality (hourly us_aqi,pm2_5,
  forecast_days=1, timezone=auto), returns {maxAqi, category, pm25peak, smoke}.
  Reports TODAY'S PEAK (robust without a reliable cross-tz "now"; peak is what
  matters for planning); smoke=true when pm25peak≥35 µg/m³ (unhealthy-for-
  sensitive line, ≈ wildfire smoke out here). aqiCategory() = US AQI bands. NOT a
  ranking signal (ephemeral/per-spot-live, like moon/weather) — it's a popup
  readout. UI: mapview airLine(spot) — async popup <p.popup-air> "Air today: up
  to AQI N (category) — likely wildfire smoke", fills async, fails soft. CSP
  connect-src adds air-quality-api.open-meteo.com (_headers). sw CACHE
  pointer-0.11.0 (airquality.js precached). VERIFIED: unit tests (AQI bands, peak
  AQI, smoke flag on PM2.5 spike, fail-soft); headless with mocked AQI → popup
  shows "up to AQI 161 (unhealthy) — likely wildfire smoke", zero pageerrors; 87
  tests, contrast green. FLICKR IS DEAD (PRO-only keys) — see SETTLED; replaced
  by Commons (0.10.0).
- 2026-07-19 0.10.0 "Photographed" BUILT on staging (awaiting on-device pass +
  a commons.yml runner pass to tag the data): Tier 3 item #4, Flickr's clean
  replacement (Flickr keys are PRO-only now — see SETTLED). ingest/adapters/
  commons-photos.mjs: countPhotosNear(lat,lng) hits the keyless MediaWiki
  geosearch (commons.wikimedia.org/w/api.php, list=geosearch, gsnamespace=6
  File, gsradius=800, gslimit=100) and returns {photos, capped}. EVERYTHING on
  Commons is CC/PD by definition, so NO per-photo license filter needed (the
  Flickr problem vanishes). ENRICHMENT (like inaturalist): ingest.mjs `commons`
  command probes every spot via a 6-worker CONCURRENCY POOL (~2362 calls, ~2-3
  min), writes tags.commons {photos, capped} on spots with ≥3 nearby photos +
  data/layers/commons.json. ADDED 'commons' to ENRICH_TAGS so the tag survives a
  re-merge. synthesis.js commonsPhotos signal (weight 0.6, value = log10(n)/2
  clamped 0.3..1, dormant until tagged). UI: popup "N freely-licensed photos
  taken near here" (.popup-photos) + Top-spots "Photographed" chip (in BOTH
  synthesis.SIGNALS and ui/synthesis.js LAYER_CHIPS). RE-RUN commons.yml after a
  full OSM refresh. sw CACHE pointer-0.10.0. VERIFIED: adapter unit-tested
  (geosearch URL params, count, capped-flag, retry-then-throw); commonsPhotos
  dormant→active test; 83 tests, contrast green. FIRST RUNNER RUN THROTTLED OUT:
  the initial per-spot design (2362 geosearch calls, 6-worker pool) crawled and
  was CANCELLED at ~19 min — Wikimedia THROTTLES GitHub Actions datacenter IPs
  hard, and concurrency reads as abuse. REWORKED to a TILED HARVEST (commons-
  photos.mjs harvestBBox/geosearchTile/tileCenters): ~195 wide tiles (10 km
  radius, gslimit 500) over the region bbox at pool 4, dedup images by pageid,
  then cmdCommons counts per spot LOCALLY (0.008° grid, within RADIUS_M=800) —
  no per-spot API calls. RUNNER RESULT (run 29700240178, ~8 min — still slow from
  the IP throttling but BOUNDED and it committed): harvested 10,687 unique
  geotagged photos, tagged 286 spots (median 7, max 368 Camp Alta; Locke Historic
  District 102, South Yuba Canal Office 316 — real photographed places). ALL
  enrichment tags survived (bortle/horizon 2362, inat 134 — tag-preserving merge
  held). VERIFIED LIVE: "Photographed" chip → 30 rows all crediting it; popup "N
  freely-licensed photos taken near here"; 88 tests, contrast green, zero
  pageerrors. LESSON: for Wikimedia from a runner, MINIMIZE call count (tile-
  harvest, not per-spot) — the IP throttling is the wall, not the total work.
- 2026-07-19 0.9.0 "Historical markers" BUILT on staging (awaiting on-device
  pass + a markers.yml runner pass to add the data): Tier 3 item #2 (Noah's "Do
  1 and 2"). HMdb has NO public API + its content is COPYRIGHTED, so the clean
  path is Wikidata (CC0): ingest/adapters/wikidata-markers.mjs SPARQL-queries the
  Wikidata Query Service for items in the region bbox carrying P7883 (Historical
  Marker Database ID → real HMdb markers) OR P5651 (California Historical Landmark
  number — dense in this Gold Rush region). FACTS from Wikidata (CC0), LINK OUT
  to hmdb.org/m.asp?m=<P7883> (verified property, formatter URL); NO HMdb content
  copied (notes always null). source='wikidata' (ADDED to dedup SOURCE_PRIORITY
  after osm), source_license CC0-1.0. KEY GOTCHA: the WDQS returns 403 without a
  descriptive User-Agent (set in adapter); runner-only (sandbox blocked; even
  WebFetch got 403 — UA-gated). This is a SOURCE adapter (creates marker spots)
  not an enrichment → needs a re-merge. TO AVOID the re-merge wiping every
  enrichment tag, cmdMerge is now TAG-PRESERVING: it snapshots ENRICH_TAGS
  ['bortle','publicLand','horizon','inaturalist'] by spot id before resolveSpots
  and carries them forward to unchanged ids (VERIFIED locally: a full osm+ebird
  re-merge kept all 2362 bortle/2362 horizon/488 publicLand/134 inaturalist tags;
  spot set reproduced exactly). markers.yml = markers → merge → validate →
  commit; NEW marker spots lack enrichment tags until the next full refresh (or a
  horizon/public-lands dispatch) — their signals just stay dormant, honest. `all`
  command now includes markers. UI: popup shows "Historical marker — read it on
  HMdb" (tags.hmdb) or "California Historical Landmark No. X" (tags.california_
  landmark); .popup-marker (no CSS needed). No new synthesis signal (markers feed
  'layered' when colocated). sw CACHE pointer-0.9.0. VERIFIED: adapter unit-tested
  (parsePoint WKT lon-lat; HMdb-vs-Wikidata link selection; CHL flag; unlabeled→
  null name; bbox in query; double-ID dedup); tag-preserving merge proven locally;
  app boots zero pageerrors; 78 tests, contrast green. BUG CAUGHT ON FIRST RUNNER
  RUN (run 29698936061): the initial query keyed on P7883 OR **P5651** and got
  only 1 marker — because P5651 is "Expedia hotel ID", NOT a landmark property
  (verified via search; the CHL type is Q2933979, not a number property I could
  confirm). REWROTE type-based: bbox items with P7883 OR P31=Q2933979 (California
  Historical Landmark) OR P31/P279* of Q4989906 (monument) / Q5003624 (memorial);
  CHL now a boolean flag. RUNNER RESULT (run 29699065005): 62 markers/monuments
  (was 1) — Angels Camp, Auburn (CHL), Brighton School (HMdb), Columbia State
  Historic Park, Donner Memorial/Monument, etc. — exactly the region's Gold Rush /
  pioneer history, all CC0. Total spots 2362→2409 (some monuments deduped into
  existing OSM spots — SOURCE_PRIORITY osm>wikidata keeps their category); ALL
  enrichment tags survived the re-merge (bortle/horizon 2362, proving the tag-
  preserving merge on a real source add). 125 marker pins render, zero pageerrors.
  GOTCHA for later: WDQS 403s WebFetch AND the r.jina.ai proxy (UA-gated) — you
  CANNOT test SPARQL from the sandbox; verify property/type IDs via WebSearch and
  iterate on the runner. HONEST COVERAGE: Wikidata has few of HMdb's small brass
  markers (1 here) — this surfaces notable monuments/landmarks + the HMdb markers
  WD knows, not every roadside plaque (stated in changelog + adapter header).
- 2026-07-19 0.8.0 "Wild subjects" BUILT on staging (awaiting on-device pass +
  an inaturalist.yml runner pass to tag the data): Tier 3 item #1 of the
  integrations list (Noah's "Do 1 and 2"). NON-BIRD wildlife density per spot —
  the layer eBird can't give. ingest/adapters/inaturalist.mjs (per-record CC,
  FETCHES only cc0/cc-by/cc-by-sa research-grade, captive=false, geoprivacy=
  open, iconic_taxa Mammalia/Reptilia/Amphibia/Insecta/Arachnida/Mollusca —
  Aves EXCLUDED to not double-count eBird). No key; sandbox can't reach
  api.inaturalist.org so it's runner-only. MAX_PAGES=30 (×200 = 6000 most-recent
  obs, bounded/honest — documented cap). ENRICHMENT not source (like public-
  lands/horizon): ingest.mjs `inaturalist` command assigns each obs to the
  NEAREST spot within RADIUS_M=500 via a 0.006° spot grid, aggregates, writes
  tags.inaturalist {observations, species, topGuild} on spots with ≥3 open obs +
  data/layers/inaturalist.json. So it tags EXISTING spots, never invents new
  ones (a dense wildlife area far from any spot is missed — rare gap given
  OSM+eBird density, documented). synthesis.js iNatWildlife signal (weight 0.7,
  value = species/25 clamped 0.3..1, dormant until tagged). UI: popup "Wildlife
  photographed nearby: N non-bird species" (.popup-wild, no CSS needed — uses
  .popup p) + Top-spots "Wild subjects" require chip (ADD signals to BOTH
  synthesis.SIGNALS and ui/synthesis.js LAYER_CHIPS). RE-RUN inaturalist.yml
  after a full OSM refresh (same ordering caveat). sw CACHE pointer-0.8.0.
  VERIFIED: adapter unit-tested (normalizeObs license filter cc0/cc-by/cc-by-sa
  only, rejects cc-by-nc/null; geojson + location parsing; mocked-fetch
  pagination stops on short page); iNatWildlife signal dormant→active test; app
  boots zero pageerrors, "Wild subjects" chip renders + DORMANT (0 rows)
  pre-data; 72 tests, contrast green. RUNNER RESULT (run 29698697538, ~2 min):
  fetched 6000 obs (the MAX_PAGES cap — total available is larger, so it's the
  6000 MOST-RECENT, honest/documented), tagged 134 spots (≥3 obs). Mississippi
  Bar tops it (185 non-bird spp, 979 obs, insects — a real famous American River
  nature spot, correct); median 4 spp/spot. VERIFIED LIVE: "Wild subjects" → 30
  rows all crediting it; stacking Wild subjects + Dark sky + Open horizon → spots
  layering SEVEN signals ("A layered place · Wildlife · Wildlife photographed
  here · Open view · Open horizon · Public land · Dark sky"), zero pageerrors.
  NEXT: Tier 3 #2 = markers (HMdb has NO clean API + copyrighted → license-clean
  path is Wikidata CC0 P7883/P5651 for facts + HMdb link-out; SOURCE adapter).
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
  mirrors the proven light-pollution script exactly. RUNNER RESULT (run
  29698317857, whole job <60 s — DEM download 23 s, trace+tag 2 s): the AWS
  `elevation-tiles-prod` skadi source WORKS from a runner, no key. 2362/2362
  tagged; openness min/median/max 0.00/0.91/1.00 with a real spread (361 spots
  ≤0.2 closed, 1479 ≥0.8 open — valley-dominated region, correct). SANITY
  (measured, correct): Emerald Bay overlook @2078 m reads open 0.0 (ringed by
  the Tahoe basin, ridges 5–11° all around — an "overlook" NOT open to low sun,
  the measurement earning its keep); American River valley floor @21 m reads
  0.82 (near-flat E1° W0.7°). VERIFIED LIVE on the tagged data: Top-spots "Open
  horizon" → 30 rows all crediting it; the 3-layer astro shortlist (Open horizon
  + Dark sky + Public land) → 30 rows, top ones layering SIX signals ("A layered
  place · Wildlife · Open view · Open horizon · Public land · Dark sky"), zero
  pageerrors. OPEN_DEG=6.0 confirmed good (no bunching).
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
