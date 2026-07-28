# CLAUDE.md — photo-pointer

> **Inherits the [Universal App Doctrine](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md)**
> (canonical copy: `DOCTRINE.md` in the noahjefferson hub). Single source of truth
> for the rules shared across all of Noah's apps — product values, taste,
> accessibility, honesty, verification, release discipline & taxonomy, licensing
> (PolyForm Noncommercial), privacy, the permanent **AskUserQuestion ban** (§0),
> and the **repo-metadata confirm rule** (§10). **Where anything below overlaps
> the Doctrine, the Doctrine wins.** The rest of this file is repo-specific.

---

# Standing rules for Claude sessions on this repo

Read `NOTES.md` (source of truth: thesis, roadmap, settled decisions) and
`LESSONS.md` (the technical stack contract — build/deploy/vendor conventions,
kept because it is more granular than the Doctrine) before doing anything.

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

## Service etiquette is a GATE, not an intention (Noah, 2026-07-26). Every
## networked ingest adapter DECLARES the published policy it operates under
## (`meta.policy.url` + maxConcurrency/minGapMs) and what it actually does
## (`meta.pacing`); `node scripts/check-etiquette.mjs` FAILS the build if the
## pacing is looser than the cited policy, if no policy is cited, if requests go
## out without a User-Agent, or if a 429 is handled without honouring
## Retry-After. It runs in CI beside check-contrast. Adding a source now REQUIRES
## reading its terms, the same way adding a colour requires passing contrast.
## VERIFIED to bite: reinstating the old 4-concurrent/120 ms Wikimedia config
## fails the gate by name. THE POINT: prose in a file loses to whoever is in a
## hurry — that is exactly how we drifted to four concurrent requests against a
## service asking for one.

## Accessibility is a top priority (owner mandate). Hue-only encoding is a
## fail state. Every new visual encoding states its non-hue channel at design
## time; `node scripts/check-contrast.mjs` is a gate (add new fg/bg pairs in
## the same commit); keyboard + focus-visible always.

## License: PolyForm Noncommercial 1.0.0 (LICENSE.md), same as Clear Horizons
## (Noah, 2026-07-19 — corrected from an earlier wrong "no LICENSE" reading).
## Keep the header scope current when third-party material changes.

## Service etiquette — the RULE lives in the hub Doctrine §14, not here. Read it
## before touching any pacing. What is repo-specific: `scripts/check-etiquette.mjs`
## is the gate (runs in CI beside check-contrast); each adapter declares
## `meta.policy` + `meta.pacing`; the shared helpers are in
## `ingest/adapters/http-etiquette.mjs`. MEASURED HERE, Wikimedia's published
## API:Etiquette vs what this repo had been doing: concurrency 4 (then 2) vs
## their stated MAXIMUM OF 1; 120 ms between requests vs their stated MINIMUM OF
## 1 SECOND; no maxlag; a UA with no contact info; Retry-After ignored. That is
## why they throttled us. Now at their numbers (commons-photos.mjs
## WIKIMEDIA_CONCURRENCY=1, WIKIMEDIA_MIN_GAP_MS=1000, maxlag=5), pinned by tests.
## Per-spot sweeps record what they probed and skip it for 30 days
## (COMMONS_FORCE=1 overrides) — a CA re-run now makes ZERO requests, not 205.
## MEASURED: the GENTLER run got the BETTER answer — 51 spots and Bodie at 313
## photos, vs 32 and Bodie missing.

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

## Cross-app lessons live in the HUB: `LESSONS.md` in noahjefferson, beside the
## Doctrine (Noah, 2026-07-27: "create a place to log lessons learned that this
## and other apps can benefit from instead of learning things repeatedly").
## Read it every session; APPEND to it whenever something learned here would
## have saved time in a different app. THIS repo's own LESSONS.md is a different
## document — the stack contract (build/deploy/vendor conventions).

## Project facts (append on every release, unprompted)
- 2026-07-28 1.20.4 "The smallest writing got bigger" (an ITERATION) BUILT on
  staging, UNPROMOTED — and note WHY, because it is a rule now. Noah: "You can
  merge the ones that are ready, DON'T PROMOTE ANYTHING THAT YOU DIDN'T MAKE."
  This repo's `accessibility` branch is 8 commits ahead of main and only 3 are
  mine; the other 5 are the 1.20.1/1.20.2 candidate, its guard commit, and the
  UNFINISHED overnight map sweep. So main stays where it is and staging gets the
  work. Frame and Studio were 1 commit each, both mine, so those promoted.
  WHAT IT IS: the sub-11px pass, applying FRAME'S A10 RULE (informational text
  >= 11px; a glyph that labels nothing on its own may be smaller IF recorded as
  exempt). `.score-cap` 9px → 11px (the strength WORD anchors the number — its own
  code comment says so, which makes it informational) and `.lp-credit` 10px → 11px
  (a source attribution we are licence-bound to show, so it has to be legible).
  EXEMPT AND DOCUMENTED IN THE CSS — do not "finish the job" on these: `.pin`
  glyphs (`.legend-swatch`, `.pin-inline`) stay 10px. A headless sweep reports 26
  of them, which looks alarming and is not: it is ONE letter per category (V ▲ F
  S K ∩ Y H M ◆ G R X ≈ L …), each a symbol inside a pin with its full-size name
  written beside it in the legend row.
  sw CACHE pointer-1.20.4; changelog[0] 1.20.4. 263 tests + contrast + etiquette +
  smoke-cardfits/thumbs/notes green, 0 pageerrors, no overflow at a 20px default.
- 2026-07-28 1.20.3 "Two last places that ignored your text size" (an ITERATION)
  BUILT on staging, UNPROMOTED — and note WHY it stayed there while three sibling
  apps shipped the same day. Noah said "Merge all"; for Frame / Clear Horizons /
  Studio that meant main, but THIS repo's staging carries the unpromoted 1.20.0
  candidate INCLUDING an unfinished overnight map sweep ("24 of 28 map tiles
  answered… it will carry on tomorrow night"). Promoting the accessibility work
  would have dragged 1.20.1/1.20.2/1.20.0 + partial data into production, so it
  went to staging and the promote decision was handed back to him. THE GENERAL
  RULE: when a fix is based on staging, "merge it" cannot mean main until staging
  itself is promotable — check what else rides along before fast-forwarding.
  WHAT 1.20.3 IS: 1.20.2 (a PARALLEL SESSION's px→rem conversion, commit aa8604a)
  missed two px `line-height`s — `.leaflet-popup-close-button` (font 1.375rem in a
  pinned 26px line box) and `.popup-linkbtn` (0.8125rem in a 20px box). A scaling
  font inside a fixed line box presses text against its own button edge at large
  text sizes. Both → rem.
  1.20.2's WORK WAS INDEPENDENTLY RE-VERIFIED here rather than assumed, by
  swapping origin/main's px stylesheet under the SAME staging JS: old CSS failed
  to scale (349/487 elements), the rem CSS was pixel-identical at a 16px default
  (0 mismatches) and scaled exactly 1.25× at a 20px default (0 mismatches). So
  1.20.2 is SOUND — only the two line-heights were missing.
  ALSO CONFIRMED (do not re-do): the Leaflet +/− controls were already handled
  correctly by 1.20.2 via an override in OUR stylesheet (`.leaflet-touch .leaflet-bar
  a.leaflet-control-zoom-in` etc., doubled class to beat 0,3,1) — src/vendor/
  leaflet.css is UNTOUCHED so a future Leaflet update drops in cleanly. That exact
  pattern was copied to Clear Horizons the same day. MEASURED: 22px at default,
  27.5px at a 20px default.
  sw CACHE pointer-1.20.3; changelog[0] 1.20.3. 263 tests + contrast + etiquette +
  smoke-cardfits (passes at 200% text) + smoke-thumbs + smoke-notes green.
- 2026-07-27 1.19.0 → 1.20.0 BUILT on staging, unpromoted. Noah: "add those and
  right-size the app and what it does and how it does it… region tabs load very
  slowly… earlier conventions may no longer be valid."
  PERFORMANCE, all MEASURED, not guessed. A Yellowstone switch froze the UI for
  1,329 ms here (so several times that on his iPad). (1) RANKING 1,586 → 281 ms:
  the `view` signal asked the astronomy engine for the sun once per ~1.1 km —
  ~1,500 sun models for Sacramento — and what that bought was ONE WORD ("evening
  light from the NW") that does not touch the score. Across the whole 200 km
  region the setting azimuth moves 0.55° and compass() buckets to 16 points, so
  LIGHT_CELL_DEG=0.25 (~28 km) renders identically: VERIFIED every score and
  every note byte-identical over 2,799 spots. (2) RANK CACHE 1.37 MB → 0.40 MB:
  it stored each spot's full `parts` (labels + notes) and wrote that to
  localStorage SYNCHRONOUSLY on every switch, out of a ~5 MB quota shared by
  seven regions. Now caches `keys` only; the readable breakdown is recomputed for
  the ONE open card (breakdownFor in main.js, passed to setSynthesis). (3) LAZY
  MARKERS: 42 → 11 ms. I predicted ~900 ms and was WRONG — measured before
  claiming. Kept because it stops growing with the region.
  COUNTIES: +Calaveras (06009), +Nevada (06057), +Amador (06005); region renamed
  "Sacramento · Gold Country · Tahoe". Chosen from the coverage audit, not taste.
  ONE QUERY PER COUNTY, the convention that stopped being valid. Six county areas
  × 15 selectors in one Overpass query = 19 minutes of retries across all three
  mirrors → HTTP 504. Overpass bills by the WORK a query does, so the fix is
  smaller questions, not more patience. osm.ingest now loops counties, dedups
  elements on county lines by type/id, NAMES failing counties and keeps the rest
  (records.failedCounties), 2 s gap, sleepFn threaded through fetchOverpass so
  tests don't wait. ingest-osm.yml timeout 25 → 45 min.
  JUNK RULES, Noah's words: IKEA out; a wild flower photographable there IN but
  nursery stock OUT (no leading \b — "Placervillenursery" is one word); agency
  archives OUT unless of something still standing (his ancient tree).
  photoDestination() reports every rejection WITH ITS REASON so the list is
  auditable rather than a silent filter.
  SHOW ALL / HIDE ALL in the toolbar + a separate "↺ Restore". FIRST BUILD MADE
  THE ONE BUTTON TURN INTO "Restore" AND THE FILTERS SMOKE CAUGHT IT: after Show
  all there was no one-tap Hide all, because the button had been taken over by
  its own undo. Undo sits BESIDE the action. bulkPrev is cleared by any non-bulk
  applyVisible, so a stale set can never be restored. Full undo/redo → NOTES.md
  roadmap (needs one funnel for every filter path, a bounded stack, and a
  decision on whether hiding a PLACE shares the stack with hiding a TYPE).
  THUMBNAILS (1.20.0) on DISCOVERED pins only, behind a tap. src/model/
  commons-thumbs.js: ONE request, generator=geosearch + prop=imageinfo +
  iiurlwidth=320 + extmetadata, origin=*. NO maxlag — this is INTERACTIVE (one
  request because a person tapped), which API:Etiquette separates from the bulk
  rules our ingest follows; maxlag would only make a tap fail during lag.
  ATTRIBUTION IS THE CONDITION, NOT A CAPTION: no stateable licence → the file is
  not shown at all; Artist/Credit arrive as uploader-written HTML → plainText()
  strips it and it is set as TEXT (smoke fires an onerror payload and proves it
  inert). Ordinary photographed spots keep the link-out — there a photo is
  incidental. CSP += img-src upload.wikimedia.org, connect-src
  commons.wikimedia.org. WHY BEHIND A TAP is mostly NOT bandwidth: Commons is not
  curated for this app and we cannot preview what a geosearch returns.
  NEW SMOKES: smoke-bulktoggle.mjs (12 checks incl. the stale-restore trap),
  smoke-thumbs.mjs (13 checks incl. licence-missing → not rendered, and the XSS
  payload). 230+ tests + contrast + etiquette + all NINE smokes green.
  STILL OPEN: the six-county OSM ingest — the first attempt 504'd (see above),
  the re-dispatch on the per-county code inherited the OLD 25-min ceiling and was
  still in its fetch step at last check. CHECK THE JOB'S OWN CONCLUSION, not the
  branch tip: "still running" is not "still alive" — that is the sibling of the
  "cancelled is not zero" lesson and it caught me out this session.
- 2026-07-27 PROMOTED 1.18.0 to main (Noah's "Promote"). Production ==
  origin/main == origin/staging == daaacd9 (a MERGE, not a fast-forward — main
  carried a tooling-only commit). Ships the two discovery layers with real data.
- 2026-07-27 WHY ARE PHOTOS TAKEN THERE, AND WHY IS THERE NO PIN — Noah's two
  questions, and both had answers worth having.
  (A) THE TITLES WERE ALWAYS IN THE RESPONSE AND WE THREW THEM AWAY. `list=
  geosearch` returns each file's TITLE alongside its coordinates; the harvester
  mapped only pageid/lat/lng. Keeping it costs Wikimedia NOTHING and lets a
  discovered place say what people came for. describeCluster() takes the longest
  phrase (≤6 words) shared by ≥25% of the files; below that it says nothing.
  Rendered as EVIDENCE, never as a name: "most are titled something like
  'X' (43 of 77)" — a recurring phrase can be one photographer's habit.
  (B) THE HEADLINE RESULT WAS WRONG AND THE TITLES ARE WHAT CAUGHT IT. I had
  reported "Donner Summit, 376 distinct vantage points" as the layer's best find.
  It is ONE 360 RIG MOVING: the files are named `<token> with Labpano Pilot One`,
  and another block `with Suzuki Dl1000` — somebody photographing from a
  motorcycle. Every frame of a continuous 360 capture lands on its own
  coordinate, so "distinct coordinates" — which correctly defeats a batch upload
  geotagged once — is SATURATED BY ONE ACTOR MOVING. THE GENERAL LESSON, now in
  the hub: when a metric can be saturated by a single actor, find a second
  INDEPENDENT field that identifies the actor; do not tighten the first metric.
  isSingleRig() drops a cluster when ≥60% of its files share one device tail or
  start with the same style of machine token, and NAMES them in the log.
  MEASURED: 54 discovered → 37 after rejection, and what is left reads right —
  Folsom Dam, Sand Harbor at Lake Tahoe, Bridgeport Covered Bridge, Dave Moore
  Nature Area, Spooner Lake, Amador City, Rough and Ready, the Truckee River
  Legacy Trail, autumn foliage along Brockway Road.
  (C) WHY THERE IS NO PIN: A STRUCTURAL COVERAGE HOLE, not obscurity. The region
  is a BBOX (38.0..39.4 / -121.95..-119.85) but the OSM ingest queries by COUNTY
  (Sacramento, El Dorado, Placer). Everything inside the box and outside those
  three counties has NO OSM DATA AT ALL. MEASURED: 26 of 43 discoveries sat in
  ~11 km cells holding fewer than 5 known places, 19 of them in cells with ZERO.
  The biggest hole is 38.2,-120.4 — nine discoveries, zero known places — which
  is CALAVERAS COUNTY (Murphys, Arnold, Calaveras Big Trees, Sourgrass on the
  Stanislaus). Others: Nevada County (Grass Valley / Nevada City / the Yuba),
  the Nevada shore of Lake Tahoe (Incline Village, Sand Harbor, Spooner), and
  the delta around Antioch / Rio Vista / Pittsburg. reportCoverageGaps() now
  PRINTS this on every discovery run. THE FIX IS NOAH'S CALL, not mine: add the
  counties people demonstrably photograph (Calaveras, Nevada, Amador, and the
  NV side of Tahoe), or narrow the bbox to the counties we actually ingest.
  Adding is the better answer — the photographs are proof people go there.
  STILL JUNK IN THE 37, reported not filtered (a judgement about what counts as
  a photo destination, his to make): single-uploader DOCUMENTATION sets that are
  not destinations — botanical specimen series (Chenopodium botrys, Cirsium
  occidentale), agency archives (NRCS, USFS Pacific Southwest Research Station),
  "Bear Third Treatment", "Placervillenursery Eldorador5" — and an IKEA.
- 2026-07-27 1.18.0 "Places nobody wrote down, and dates worth driving for" (a
  CAPABILITY) BUILT on staging. The two layers 1.16.0/1.17.0 shipped EMPTY now
  carry real data, and getting there was four wrong answers in a row — each one
  arithmetically correct and each one useless, which is the pattern worth
  remembering from this session.
  (A) PHENOLOGY WAS NOT BROKEN, IT WAS BEING ASKED WRONG. Two runs returned
  HTTP 200 with `[]` and I read that as "no records in this region". THREE
  separate mistakes all produce that identical shape: a GET instead of a POST
  form body; one five-year `start_date`/`end_date` span instead of ONE CALENDAR
  YEAR PER CALL; and (already fixed) the x1/y1 axis names being lat/lng. Read
  from their own R client (usa-npn/rnpn npn_data_download.R: `req_method("POST")`
  + `req_body_form()`, and a `for (year in years)` loop). MEASURED after the fix:
  45,222 usable records, 5 years pooled. The adapter now PRINTS the exact request
  behind any zero and the field names of the first row it gets, so the next zero
  is evidence rather than a guess.
  (B) THEN THE STATISTIC WAS WRONG. First real output put CALIFORNIA POPPY at
  25 JUNE in the Sierra foothills, where it peaks in early April. The median of
  every "in flower" record over a March-to-August season really is late June —
  right answer, wrong question, and it sends someone to an empty hillside. Now
  dated by the BUSIEST FORTNIGHT (peakWindow), and the card states how many of
  the season's records fall inside it so a diffuse season reads as diffuse.
  (C) THEN THE THRESHOLD WAS ON THE WRONG THING. MIN_RECORDS was counting the
  SEASON, so Pacific dogwood got dated 2 FEBRUARY off six sightings and Fremont
  cottonwood off three. The bar now applies to the fortnight being named.
  24 species → 18, and the survivors read correctly for the foothills: whiteleaf
  manzanita 2 Apr (63 of 305), buckbrush 10 Apr, blue oak bloom 16 Apr (46 of
  81), blue oak autumn colour 2 Nov (41 of 313), California buckeye going brown
  4 Aug (a real summer-drought signature, not an error).
  (D) PHOTO-DENSITY DISCOVERY, and the two ways its first output was junk.
  MEASURED: 1,785 of 18,185 harvested coordinates sat on an EXACT 0.1° GRID —
  someone typing roughly where they were; a 0.1° cell is ~11 km, and clustered
  they become a confident pin in a field (isPlaceholderCoord drops them). And
  the densest cell held 187 photos, 160 AT ONE IDENTICAL COORDINATE — one upload
  batch geotagged once. So what earns a pin is now the count of DISTINCT
  COORDINATES a camera was set down at, not files; the file count is shown but
  does not decide. Plus mergeAdjacent, because four cells in a row along the
  delta were four pins on one stretch of river. 243 raw clusters → 88.
  (E) THE ONE THAT WOULD HAVE BITTEN SILENTLY FOREVER: the discovery pass counted
  ITS OWN PREVIOUS PINS as prior knowledge. Run two found its 43 discoveries,
  decided each was "already explained" by the pin it had created for it, and
  committed an empty layer that DELETED ALL 128 from run one. unexplainedBy()
  now skips category 'photo_cluster'. A discovery pass must be able to run twice
  — check this on any future discovery-shaped layer.
  RESULT on sac-eldorado-placer: 2,816 spots, 43 photo_cluster, 18 phenology
  events. The discovered pins are real places — Donner Summit (376 distinct
  vantage points), Folsom Lake, the American River at Cal Expo, Sherman Island in
  the delta, Angels Camp. Their cards say "Nothing we know of is listed here, but
  cameras have been set down in N different places within a few hundred metres".
  ETIQUETTE NOTE, mine to own: I dispatched phenology while the commons harvest
  was mid-flight, against the standing "never two enrichments on one region"
  rule. It happened not to conflict. Also, the ONE re-harvest against Wikimedia
  (195 tiles) was needed only because commons.yml did `git add data/` and
  discarded the coordinates in ingest/inputs/ — my bug, their bandwidth. Fixed.
  sw CACHE pointer-1.18.0; changelog[0] 1.18.0. 219 tests + contrast + etiquette
  + validate + all EIGHT smokes green, plus NEW scripts/smoke-discovered.mjs
  which opens the densest discovered pin on the real region, reads its card, and
  proves a bloom event reaches the Upcoming list. 0 pageerrors.
- 2026-07-26 1.15.1 "Place cards fit your text size" (an ITERATION, an
  ACCESSIBILITY FIX). Noah asked the right question: "Is the popup a fixed size
  that could fail if the font size was set higher on the phone for visibility?
  If so, that is a violation of my accessibility values." IT WAS. Measured, on
  the then-PROMOTED build — raising text size is equivalent to shrinking the
  viewport, so 200% text on a 390x844 phone is a 195x422 viewport:
    100% text  map 390x667 — card opens, x reachable
    150% text  map 260x322 — card renders 267 WIDE IN A 260 MAP, x pushed OFF
    200% text  map 195x181 — card does not open at all
    320x568 @200%  map 160x114 — card does not open; header alone was 241 of 284
  THREE fixed sizes, none of which ever looked at the map: `maxWidth: 320`, a
  hard `maxHeight: Math.max(240, innerHeight*0.6)` FLOOR, and `autoPanPadding
  [12,76]` (152px of vertical margin demanded from a 322px map, so Leaflet gave
  up panning and left the card hanging off-screen). All THREE were computed ONCE
  at marker-creation time from window.innerHeight — never from the map, so they
  were also stale after rotation.
  FIX: new sizePopup(marker) runs at every open (activate, zoomToCluster's
  fallback, and focusSpot) and derives maxHeight/maxWidth/autoPanPadding from
  `map.getSize()`. TWO GOTCHAS each cost a cycle: (1) maxWidth is the CONTENT
  width — Leaflet's wrapper adds ~40px of padding/border/shadow, so budgeting
  only 24px still rendered wider than the map; (2) MY OWN FLOORS became the next
  fixed size that fails — a 160px minimum width inside a 160px map re-broke the
  close button. A floor must never exceed the space available.
  ALSO: `.bar` is now max-height 60vh + overflow-y auto. At 200% text it was
  241px of a 284px viewport, leaving the map 43px — the same failure as the
  1.14.1 filters panel, but driven by the reader's text size.
  NEW scripts/smoke-cardfits.mjs is the gate: five viewport sizes, and it FAILS
  if the card does not open, is taller than the map, hangs off any edge, or has
  an unreachable close. VERIFIED TO BITE: 4 of 5 sizes FAIL on the promoted
  build, 0 of 5 after. sw CACHE pointer-1.15.1; changelog[0] 1.15.1.
  STILL OPEN, reported to Noah, NOT changed unilaterally: all 90 font-size
  declarations in styles.css are `px` and there are ZERO rem/em. Browser/OS
  page-zoom scales px so this fix covers that path, but a reader who raises only
  the DEFAULT FONT SIZE gets no change at all. Converting is a sweeping change
  and his call.
- 2026-07-26 STREAMFLOW CONFIRMED ON DEVICE (Noah: "it works"), right after
  tides. Real USGS instantaneous-values + daily-median numbers on a real
  waterfall, so 1.9.0's live path is verified end to end rather than against
  mocks. WITH THIS, EVERY "NEEDS NOAH'S HANDS" ITEM IS CLOSED — the two live
  per-spot sources the sandbox 403s (NOAA tides, USGS streamflow) are both
  confirmed, and nothing in the app now rests on a mocked network path.
  WHAT THIS MEANS FOR THE HARNESS: scripts/smoke-flow.mjs mocks USGS to prove
  fetch+CSP+parse+format, and its in-browser assertions have always passed — the
  flakiness is its POPUP-READ step only. Now that the real path is confirmed on
  device, that smoke's remaining value is regression cover, not proof; do not
  read a flaky run as evidence the feature is broken.
- 2026-07-26 TIDES CONFIRMED ON DEVICE (Noah: "tides confirmed"). Real NOAA
  CO-OPS numbers on a real coastal spot, so 1.8.0's live path — station lookup,
  hilo predictions, formatting, and the CSP allowance — is verified end to end
  and no longer rests on mocks. The sandbox 403s NOAA, which is why this could
  only ever be closed by him.
  NOTE the discoverability lesson that came with it: he could not FIND the tide
  line at first, because it renders inside a COLLAPSED section that was labelled
  "Tonight & light" — a name that says nothing about tides. Renamed to "Tides,
  sun & moon". WHEN HE REPORTED IT I RESTRUCTURED THE CARD INSTEAD OF FIXING THE
  LABEL, which was wrong and he said so; the whole fix is one string. If a
  feature is invisible, check the LABEL before moving anything.
  STILL UNVERIFIED AGAINST REAL DATA: streamflow (1.9.0) — needs a real waterfall
  with a USGS gauge nearby; the sandbox 403s USGS the same way.
- 2026-07-26 SERVICE ETIQUETTE + the ghost-town data gap. Noah asked why the
  "Photographed" filter returned ZERO on California Ghost Towns. ANSWER: not
  that no ghost town is photographed — that region had NO enrichment of any kind
  and never had. Reno was nearly as bare. When those two regions were created
  (1.5.12) only the curiosities adapter ran; the five enrichment workflows were
  never dispatched. MY omission.
  IT ALSO COULD NOT HAVE RUN: the Commons harvest TILES the region bbox, and
  that region's bbox is the whole state — 4,264 tiles, ~3 h, past the 55-min
  timeout. Tiling suits a county (sac: 2,362 spots vs 195 tiles); it is backwards
  for a sparse statewide theme region (205 spots vs 4,264 tiles). cmdCommons now
  picks the cheaper sweep, and harvestAroundSpots probes the spots instead.
  THE NEAR-MISS, and the real lesson: the first per-spot run returned 32 tagged
  and BODIE — the most photographed ghost town in California — with NOTHING. The
  probe was swallowing its own failures, so a throttled request became a place
  that quietly reports "no photos": a WRONG ANSWER dressed as a real one. Only
  Bodie's absence gave it away, and I nearly reported 32 as fact. Failed probes
  are now counted, NAMED in the log, and a run refuses to commit if more than 2%
  fail. The refusal fired immediately: 84/205 failed, in one ALPHABETICAL BLOCK
  (Aurora | Ballarat | Basalt | Belleville…) — a throttle burst, not 84 places
  without photographs.
  FIX + MEASURED RESULT: pool 4→2, longer gap, plus a serial retry pass for
  throttled spots. Second run: 51/205 tagged, 882 photos (vs 336), Bodie 313,
  ZERO failures. THE GENTLER RUN GOT THE BETTER ANSWER — worth remembering next
  time the instinct is to retry harder.
  RENO now complete: commons 243, bortle 395, horizon 397, inat 28, publicLand
  20, padus 181 (four workflows, run ONE AT A TIME — two enrichments on the same
  region race the same file).
  ALSO SHIPPED: Retry-After is now honoured on Overpass/Commons/RIDB; RIDB
  finally sends a User-Agent; and the per-spot sweep RECORDS what it probed
  (layer file `probed`) and skips anything probed within 30 days —
  VERIFIED: a CA re-run now makes ZERO requests instead of 205. COMMONS_FORCE=1
  overrides. A CORRECTION I owe the record: I told Noah "Overpass has no 429
  handling" — WRONG, I had grepped public-lands.mjs, which imports the shared
  fetchOverpass; it handles 429/502/503/504 across mirrors.
  STILL OPEN, deliberately: PAD-US for california-ghost-towns. The adapter bulk-
  downloads every protected-area polygon in the bbox — statewide that is the same
  infeasible shape as the Commons tile sweep. The RIGHT build is an ArcGIS POINT
  query per spot (205 tiny queries, no geometry transferred), not a bulk pull.
  Not built yet; Noah has seen the recommendation.
- 2026-07-26 1.14.2 "A readable build stamp" (an ITERATION, a diagnostics FIX)
  BUILT on staging. Noah: "Put a discrete version identifier for screenshot
  troubleshooting." One ALREADY EXISTED and was useless — 0.13.x put a `.ver-tag`
  at `position:fixed; left:6px; bottom:4px` at 10px in `--dim` on `--card`. On
  his iPad the map LEGEND control sits in that exact corner and the screen edge
  clipped it, so it photographed as a smudge (visible bottom-left in his
  2026-07-26 popup screenshot). It also used an UNGATED pair: check-contrast
  covers dim-on-BG, not dim-on-CARD.
  FIX: moved into the header's `.bar-actions` row (background `--bg`, so
  `--dim` is the already-gated pair), 12px monospace, `margin-left:auto`.
  MEASURED 5.51:1 light / 7.12:1 dark, unoccluded, on-screen, and present in the
  LIST view too (the map corner was map-only).
  CONTENT is the two things a screenshot CANNOT otherwise tell me:
  `v<app> · data <region builtAt>` — the app build (a stale service worker
  reports the OLD version here, which is exactly the signal wanted) and the
  region data's build date (a data-only ingest changes the map without moving
  the app version). Region is NOT repeated — the highlighted pill already says it.
  GOTCHA that would have shipped a dash: both loadRegionData callers run
  renderHeader BEFORE the fetch resolves, so the stamp read "data —" until some
  later interaction re-rendered the header. refresh() now calls a tiny
  updateVerTag() that patches textContent IN PLACE — a full renderHeader there
  would steal focus from the search box (the 1.6.0 reason refreshViews exists).
  sw CACHE pointer-1.14.2; changelog[0] 1.14.2. 192 tests + contrast + all six
  smokes green.
- 2026-07-26 "Card opens, pushes down, then closes" — FIXED, CONFIRMED ON DEVICE
  by Noah ("It works now") and promoted. Three screenshots + his two
  clarifications cracked it; the first pass at this had the wrong theory.
  WHAT HE SAID, and each detail matters: "only zoomed out like this, not zoomed
  in", then "they are NOT one pin when I click. It opens, PUSHES DOWN, and then
  closes."
  THE PAIR: Salmon Falls (ghost_town, pin G, `salmon-falls@9qcumr`) and Old
  Salmon Falls Bridge (ruins, pin R, `old-salmon-falls-bridge@9qcut0`) are
  353 m apart — visible as the two overlapping R/G pins in his third screenshot.
  SYNTHESIS SCORES, the crux: bridge 0.2578, Salmon Falls 0.1260. The card he
  opens is the LOWER-scoring of the two.
  THE CHAIN: at his zoom (~z13) 353 m is ~20px, INSIDE the 40px declutter cell —
  but the two only merge when a cell BOUNDARY doesn't happen to fall between
  them, which is why he sometimes sees two separate pins. He taps G; Leaflet
  AUTO-PANS the map to fit the card, which is the "pushes down" he described;
  that pan fires moveend → cull(); the pixel grid has now SHIFTED, G and R land
  in the SAME cell, R outscores G 2:1 and takes it, G is unmounted — and an
  unmounted marker takes its open popup with it. Zoomed IN the pair is far
  enough apart in px to never share a cell, so the card stays: exactly the
  "only zoomed out" signature. Zoomed OUT FURTHER they are already one cluster
  pin, and a tap zooms instead of opening (the "2" badge in his first shot).
  FIX: popupopen sets `forcedId` from the new `marker.__spotId`; popupclose
  clears it and re-culls so the pin can rejoin its cluster. In cull() forcedId
  makes catOk unconditional, `continue`s the rec OUT of the cell competition,
  and forces `keep` true — so the unmount branch is UNREACHABLE for a pin whose
  card is open. That is a code-level guarantee, not a hope.
  NEVER REPRODUCED HEADLESSLY — the failure needs the grid boundary to start
  BETWEEN the two pins and the auto-pan to move it, and no synthetic tap arranged
  that. THE LESSON: the diagnosis was earned from the SCREENSHOTS plus two exact
  words from Noah ("not one pin", "pushes down") and from MEASURING the data (353
  m apart; scores 0.258 vs 0.126), NOT from the harness. When a headless repro
  won't come, measure the data and read the user's wording literally — an earlier
  pass guessed "cluster tap" from the same screenshots and was wrong.
  WHAT WAS RULED OUT along the way: setClusterState
  mutates the icon in place (no setIcon, so no popup detach); bindPopup runs
  BEFORE `marker.off({click: marker._openPopup})`, so Leaflet's own opener is
  genuinely detached; and 20 cards left completely alone never closed by
  themselves, so nothing closes a card without a map movement.
  scripts/smoke-popupstays.mjs guards the invariant (a tapped card survives the
  declutter pass) and is labelled in-file as not reproducing the report.
- 2026-07-26 1.14.2 "A readable build stamp" (an ITERATION, a diagnostics FIX)
  BUILT on staging. Noah: "Put a discrete version identifier for screenshot
  troubleshooting." One ALREADY EXISTED and was useless — 0.13.x put a `.ver-tag`
  at `position:fixed; left:6px; bottom:4px` at 10px in `--dim` on `--card`. On
  his iPad the map LEGEND control sits in that exact corner and the screen edge
  clipped it, so it photographed as a smudge (visible bottom-left in his
  2026-07-26 popup screenshot). It also used an UNGATED pair: check-contrast
  covers dim-on-BG, not dim-on-CARD.
  FIX: moved into the header's `.bar-actions` row (background `--bg`, so
  `--dim` is the already-gated pair), 12px monospace, `margin-left:auto`.
  MEASURED 5.51:1 light / 7.12:1 dark, unoccluded, on-screen, and present in the
  LIST view too (the map corner was map-only).
  CONTENT is the two things a screenshot CANNOT otherwise tell me:
  `v<app> · data <region builtAt>` — the app build (a stale service worker
  reports the OLD version here, which is exactly the signal wanted) and the
  region data's build date (a data-only ingest changes the map without moving
  the app version). Region is NOT repeated — the highlighted pill already says it.
  GOTCHA that would have shipped a dash: both loadRegionData callers run
  renderHeader BEFORE the fetch resolves, so the stamp read "data —" until some
  later interaction re-rendered the header. refresh() now calls a tiny
  updateVerTag() that patches textContent IN PLACE — a full renderHeader there
  would steal focus from the search box (the 1.6.0 reason refreshViews exists).
  sw CACHE pointer-1.14.2; changelog[0] 1.14.2. 192 tests + contrast + all six
  smokes green.
- 2026-07-26 "Card opens and immediately collapses" — REPORTED, CAUSE NOT FOUND,
  a guard shipped but NOT a confirmed fix. Noah, iPad screenshot: a Ghost town
  card on the Sacramento region caught MID-FADE (Leaflet's popup fade-out), with
  a "2" cluster badge beside it. NOTE THE TIMESTAMP — the screenshot reads
  "20:01 Sat Jul 25", i.e. BEFORE the 1.14.1 promote, so it may predate the
  culling/re-measure changes; FIRST STEP is to have him reload and re-check.
  LEADING THEORY (plausible, unproven): Leaflet auto-pans to fit a popup →
  moveend → cull() → the 40px declutter grid shifts → a pin that loses its cell
  to a higher-scoring neighbour is unmounted and its OPEN CARD goes with it.
  `rememberViewForPopup()` clears forcedId on a manual tap, so a map-tapped card
  had NO protection, while a card reached from the LIST did (focusSpot sets
  forcedId). GUARD SHIPPED: popupopen sets forcedId from `marker.__spotId`;
  popupclose clears it and re-culls so the pin can rejoin its cluster.
  COULD NOT REPRODUCE, and this is the important part — do not assume it's fixed.
  Tried and ALL PASSED (cards stayed open): synthetic mouse clicks; real touch
  taps in a hasTouch iPad-landscape context; forced pans/drags with a card open;
  and 20 cards opened and then left completely ALONE for 2s each. The guard makes
  no measurable difference because nothing failed without it either.
  STILL-OPEN SUSPECTS for whoever picks this up: (a) iOS Safari firing a second
  synthesized click after touchend, so activate() runs TWICE — if cull() set
  clusterCount>1 between the two calls, the second call takes the
  `clusterCount > 1 → zoomToCluster()` branch, fitBounds moves the map and the
  card dies; Playwright's single synthetic tap can't emit that duplicate.
  (b) Leaflet's closePopupOnClick/preclick reaching the map because 1.4.3
  detached Leaflet's own marker click handlers (`marker.off({click:
  marker._openPopup, ...})`) and replaced them with `activate`.
  WHAT TO ASK NOAH: which place exactly (the name is cut off in the shot); every
  time or intermittent; that one place or others; tapping the PIN only or from
  the LIST too; and whether it survives a reload onto 1.14.1.
  NEW scripts/smoke-popupstays.mjs guards the invariant the theory rested on (a
  tapped card survives the declutter pass) and is LABELLED in-file as not
  reproducing the report.
- 2026-07-26 1.14.1 "The map shows what you filtered for" (an ITERATION, a BUG
  FIX) BUILT on staging (awaiting on-device pass). Noah: "Choosing only
  photographed places works on list but not map." REPRODUCED headless, and it was
  THREE separate faults stacked — the first one being the real culprit:
  (1) THE FILTERS PANEL ATE THE WHOLE SCREEN. Measured on a 390×844 phone
  viewport: filters collapsed → `.bar` 188px, map 655px; filters OPEN → `.bar`
  941px, `.view-root` 0px, MAP 0px. `.map-root{flex:1;min-height:0}` correctly
  gets zero when the header exceeds the viewport. This is 1.5.14's problem
  returning, because the panel has since grown from ~10 chips to 25 pin types in
  4 labeled groups + 8 layer chips + the distance row. The LIST is its own
  scrolling column so it was unaffected — which is EXACTLY why the filter looked
  like it "worked in the list but not the map". FIX: `.filters-panel` gets
  `max-height:42vh; overflow-y:auto; overscroll-behavior:contain` — it scrolls
  itself and the map always keeps its place (open now: bar 552, map 291).
  DIAGNOSTIC LESSON: `.pin` ALSO matches the legend's inline swatches, so a
  `.pin` count says the map has markers when it has none — count
  `.leaflet-marker-icon` for real map markers.
  (2) MAP → LIST → MAP CAME BACK EMPTY, filter or no filter. Leaflet caches its
  container size; while the list is up the map is display:none so that cache
  drops to ZERO HEIGHT (measured `map.getSize()` = [390,0], bounds with
  south===north), and cull() then finds nothing in view and unmounts every pin.
  setViewMode called `invalidateSize()` BEFORE `renderHeader()`, i.e. before the
  flex column had been laid out, so it re-measured zero. A requestAnimationFrame
  was ALSO too early (verified: still [390,0]). FIX: a ResizeObserver on the map
  container drives a new `resized()` (invalidateSize + cull) — it fires when the
  height is really there, and covers rotation/window resize too. GOTCHA that cost
  a cycle: the observer must record the ZERO size as well, or 667→0→667 reads as
  "no change" and never re-measures.
  (3) OFF-SCREEN MATCHES LOOKED LIKE NO MATCHES. With Photographed on, the list
  said 286 and the banner said "286 places match" while the map sat empty,
  because none of the 286 was in the default Cameron Park frame. setSpotFilter
  now calls frameFilteredIfOffscreen(): if NOTHING matching is currently mounted
  it fitBounds to the matches (maxZoom 13); if the user can already see matches
  their frame is left alone. ALSO FIXED alongside: `spotFilter = ids && ids.size
  ? ids : null` treated an EMPTY match set as "no filter", so a filter matching
  nothing fell back to the category toggles and showed EVERY pin; it now keeps
  the empty set (map empty) and the banner reads "No places match your filters".
  NEW scripts/smoke-mapfilter.mjs pins all of it: Photographed → map has markers
  (16) not an empty map, banner reports the count, list agrees (286 rows),
  List→Map keeps the markers, a zero-match filter shows 0 markers not every pin,
  clearing restores the map, 0 pageerrors. sw CACHE pointer-1.14.1; changelog[0]
  1.14.1. 192 tests + contrast + smokes green.
  KNOWN, PRE-EXISTING, STILL OPEN: scripts/smoke-flow.mjs is FLAKY on its popup
  assertion — up to 5 of 10 runs fail under load, so the earlier "stable over 3
  consecutive runs" note was optimistic. WHAT IS ESTABLISHED: the failure rate is
  HEAVILY load-dependent and swings run-to-run, so small samples prove nothing
  (an early 3-of-6 vs 1-of-6 reading looked like a difference and was just
  noise — don't draw conclusions from six runs). The ResizeObserver added in
  1.14.1 is NOT the cause: disabled vs enabled both measured 5 of 10 over the
  same 10-run window. The popup and its `.popup-more` DO open every time
  (verified via instrumentation), and the in-browser flowNow/formatFlow
  assertions pass EVERY run — so the streamflow code is fine and this is harness
  timing. The line is REMOVED rather than left at "checking…", meaning flowNow
  resolved empty or rejected. KEY CLUE for whoever picks this up: RAISING the
  poll deadline 6s → 15s made it WORSE (6 of 8), so it is NOT a timeout — the
  line settles and is then torn down. Ruled out: setClusterState mutates the pin
  icon in place (no setIcon), so a re-cull is not detaching the popup.
  TWO REAL HARNESS BUGS WERE FIXED in passing, neither of which cured it: (1) the
  "settled" predicate counted "the line isn't in the DOM yet" as settled, so it
  read before the line was ever inserted — it now waits for presence when a line
  is expected; (2) only USGS was mocked, so tiles/Open-Meteo/NOAA all went out and
  failed SLOWLY through the sandbox proxy — those hosts are now aborted instantly
  so the only network the test waits on is the one it mocks.
- 2026-07-26 1.14.0 "Who manages it, and hand-written detail" (a CAPABILITY)
  BUILT + DATA ROLLED OUT on staging (awaiting on-device pass). Noah's "Promote,
  PADUS then shared enrichment" — the last two items owed from the bare-card
  conversation. TWO things.
  (A) PAD-US (ingest/adapters/padus.mjs, USGS Protected Areas Database, US PUBLIC
  DOMAIN, no key). NOT a duplicate of the OSM public-lands layer: OSM says a
  boundary exists; PAD-US says WHO MANAGES IT, WHAT KIND of protected area it is,
  and WHETHER THE PUBLIC MAY ENTER — and it covers STATE/COUNTY/LOCAL land, so a
  small district park finally gets an authoritative manager instead of nothing.
  An ENRICHMENT (tags.padus, already in ENRICH_TAGS so a re-merge preserves it);
  polygons fetched generalised, point-in-polygon locally, NO ring geometry ships
  to the browser. ROLLED OUT to all 6 OSM regions — 5906 spots tagged: sac
  1673/2755, yellowstone 3304/3995, humboldt 616/1198, reno 181/397, PCB 103/285,
  hahira 29/188. (california-ghost-towns EXCLUDED by design, same as OSM — a
  statewide bbox would pull every protected area in California.) Sample values:
  Fairchild Park → "Regional Agency Land · Local Park — public access: open";
  Eldorado NF → "Forest Service · National Forest — public access: open".
  THREE RUNNER LESSONS, each one a real failure: (1) I GUESSED A SERVICE URL and
  got `ArcGIS error 500: 9017$SITE_NOT_INITIALIZED` — now BASE_CANDIDATES are
  probed in order, SITE_NOT_INITIALIZED is treated as "this site is down, try the
  next" rather than fatal, and PADUS_SERVICE_URL pins one without a code change.
  (2) The first good run stored RAW DOMAIN CODES ("USFS","NF","OA") — "NF —
  public access: oa" is jargon, not information. (3) The decode table I then
  hand-wrote left a LONG TAIL of bare codes (17 designations — POTH, PCON, IRA,
  LCA, WSR, RNA, SRMA… — plus manager NRCS; Fairchild Park had read "REG"). That
  is the raw-code FALLBACK WORKING AS DESIGNED: an unmapped code stays VISIBLE so
  it can be found, instead of being silently dropped. The fix is not 17 more
  hand-written entries — the ArcGIS service PUBLISHES ITS OWN coded-value domains,
  so pickLayers now reads `field.domain.codedValues` at runtime and prefers it
  over the built-in table (which survives only as a fallback for a service that
  publishes none). Same discover-don't-hard-code lesson as GNIS and NRHP; it also
  follows PAD-US forward to v5. ACCESS is the exception — it's a CONTROLLED
  vocabulary, so a published label is expanded and THEN normalised to one word,
  and an unknown access code still yields null (an access claim is never
  invented). A FOURTH pass caught decoded SHRUGS — the domain spells LOTH out as
  "Local Other or Unknown" and UNKE as "Unknown Easement"; those are dropped once
  decoded, the same way a bare "Unknown" was already dropped before decoding
  ("Other Easement" stays — it still says it IS an easement). VERIFIED: after the
  final roll-out, ZERO raw codes and ZERO shrugs remain across all 6 regions, and
  a headless popup read shows the line rendering on a real card AND removing
  itself on a spot with no PAD-US data, 0 pageerrors.
  (B) SHARED CURATED ENRICHMENT (src/model/enrichment.js + data/curated/
  enrichment.json). 1.12.0's notes fix a thin card for ONE device; this is the
  version that SHIPS to everyone. Keyed by spot id; FILLS GAPS ONLY, so a future
  ingest that improves upstream is never clobbered by a stale hand-written line.
  Values validate against the LIGHT/SEASONS/ACCESS/SUBJECT_TYPES enums and links
  must be https. THE LICENSING RULE IS IN THE FILE'S OWN `_readme`, verbatim:
  WRITE YOUR OWN WORDS — facts are free (who runs it, that there is a bedrock
  mortar site), SENTENCES ARE NOT; link to the official page instead of copying
  it; federal sources are public domain but already come in through their own
  adapters; NEVER copy from social platforms. First entry is Fairchild Park
  Indian Grinding Rocks — the exact node Noah pointed at — which now reads
  archaeological, with real notes, golden_hour, short_walk and a link to the CSD
  page it was written FROM but not copied from.
  sw CACHE pointer-1.14.0; changelog[0] 1.14.0. 192 tests + contrast + all five
  smokes (filters/events/tides/flow/notes) green.
- 2026-07-26 RIDB, the generic-"Facility" fix. The unmapped-type diagnostic added
  on 2026-07-25 finally got READ (the get_job_logs tail window kept cutting above
  it; the line is in the FETCH step, so ask for that job and a short tail). It
  said: `Facility=85, Ticket Facility=1, Library=1`. So the KNOWN GAP — every
  mapped facility being a "Campground", zero trailheads/day-use/visitor centers —
  had one cause: RIDB types almost everything that ISN'T a campground as the
  generic "Facility", and a type-only rule therefore found campgrounds and
  nothing else. FIX: for GENERIC-typed rows ONLY (`Facility`/`Site`/`Other`/
  empty), the facility NAME becomes the evidence — trailhead / visitor center /
  overlook / lookout / day-use each get their real pin. A SPECIFIC type we don't
  want (Library, Ticket Facility) is still refused outright and the name is NOT
  allowed to talk us back into a pin; a generic row whose name says nothing still
  gets NO pin (the 1.11.0 rule holds — a wrong label is worse than no pin). The
  diagnostic now also samples the NAMES it left behind, so the next tail is
  readable evidence rather than another guess. +5 tests.
  MEASURED EFFECT (all regions re-run): sac 101 → 137 (98 campsite, 20 park, 10
  trailhead, 2 viewpoint, 2 historic_site, 1 lookout_tower, 4 deduped into eBird
  hotspots), yellowstone 94 → 140 (16 trailheads, 25 parks), humboldt 13 → 15,
  PCB 1, hahira 0 (genuine), and RENO 0 → 3 trailheads — which also SETTLES the
  open "reno + hahira show no ridb.json" question from 2026-07-25: it was never a
  lost commit, the generic-type gap was hiding everything Reno had.
  STILL LEFT BEHIND, and deliberately (the new name-sample log, CA run): things
  whose names genuinely don't say what they are — "Inyo Mountains", "Dick Smith
  Wilderness", "Muslatt Lake", "Trinity River" are wilderness/permit AREAS whose
  coordinate is a centroid, not a place to stand, and "Girard - 4E17" /
  "Ozena - 23W42" are Forest Service trail designators. Pinning those would be
  guessing at a label, so they stay unmapped. Nearly all of them are outside our
  bboxes anyway (the sweep is statewide, then bbox-filtered).
- 2026-07-25 1.13.0 "Thin cards now tell you something" (a CAPABILITY) BUILT on
  staging. The OTHER half of the bare-card problem (1.12.0 was the user's own
  words; this is what the app already knows but wasn't showing). mapview
  isThinCard() = no sourced notes/wiki/HMdb/NRHP/commons/inat/ebird/publicLand/
  event/best_light — nothing but a name and a type. For those cards ONLY,
  glanceSection() renders "What we can tell you" high on the card: Bortle,
  horizon openness NAMING THE LOWEST compass direction (where low sun can
  actually reach), site elevation, and sunset time + bearing. All on-device
  (works offline); a missing layer is simply omitted, never padded. ALSO
  osmEditLink(): any osm-sourced spot gets "Improve this in OpenStreetMap →"
  deep-linked to that exact node/way in the iD editor — the honest open-data
  answer to a thin card (fix once, every OSM consumer benefits, flows back here
  next ingest). VERIFIED headless on Noah's two spots, TZ=America/Los_Angeles:
  Fairchild Park → "Bortle 5 sky · fairly open horizon (lowest N 0.4°) · 201 m up
  · sun sets NW 8:21 PM" + way/588194789 link; the Grinding Rocks node carries no
  bortle/horizon so it shows ONLY "sun sets NW 8:21 PM" + node/5618093482 link —
  honest rather than padded. GOTCHA: headless runs in UTC, so verify time-of-day
  output with TZ=America/Los_Angeles or sunset reads as 3:21 AM. sw CACHE
  pointer-1.13.0. 161 tests + contrast + all smokes green.
- 2026-07-25 RIDB reno + hahira = GENUINE ZERO (resolved, was flagged unknown).
  ALL NINE ridb.yml runs completed with conclusion `success`, including the
  re-dispatches for reno and hahira. The ONLY code path that completes without
  writing a file is cmdRidb's 0-guard ("ridb: none for <region> — skipping"), so
  those two regions genuinely have no Recreation.gov facility inside their bbox
  (reno's bbox is a tight urban box; hahira is rural south-GA farmland). FINAL
  RIDB coverage: Sac 101, Yellowstone 94, Humboldt 13, PCB 1, Reno 0, Hahira 0 —
  every one carrying a federal public-domain description. STILL OPEN: every
  mapped facility is FacilityTypeDescription "Campground"; the unmapped-type
  diagnostic is in the adapter but its log line has not yet been read (the
  get_job_logs tail window kept cutting above it) — read it on the next dispatch
  and extend TYPE_CATEGORY if trailheads/day-use hide under another type name.
- 2026-07-25 1.12.0 "Write your own notes on a place" (a CAPABILITY) BUILT on
  staging (awaiting on-device pass). The half of Noah's bare-card frustration
  (OSM node/5618093482, Fairchild Park) that NO dataset can fix: OSM is bare, the
  El Dorado Hills CSD page is copyrighted prose (LINK ok, COPY not), and Facebook
  is out twice over (standing no-social-scraping rule + their ToS). So: let the
  person who was there write it down. store.js K_NOTES {spotId:text} +
  noteFor/setNote/spotNotes/noteCount; 2000-char cap; empty clears; corrupt JSON
  degrades to {}. In the backup bundle, and ON IMPORT A LOCAL NOTE WINS so an old
  backup can never overwrite what you wrote on this device. mapview noteSection()
  = "✎ Add your own note" on every card, under a rule so a personal note is never
  mistaken for sourced data; listview marks annotated rows with ✎. Nothing leaves
  the device. VERIFIED: 7 unit tests + NEW scripts/smoke-notes.mjs which writes a
  note through the REAL popup UI on a real region spot, then proves it renders,
  survives a reload, lands in the bundle, and marks its list row. sw CACHE
  pointer-1.12.0. 161 tests + contrast + all smokes green.
  STILL OPEN from that same conversation: an "Improve this in OpenStreetMap" deep
  link (fix it upstream for everyone), making THIN CARDS LEAD with what we already
  compute (Bortle/horizon/sun compass) instead of showing empty sections, a
  curated enrichment file keyed by spot id, and PAD-US for park manager/
  designation/access.
- 2026-07-25 PROMOTED 1.9.0 + 1.10.0 + 1.11.0 + RIDB to main (Noah's "Promote to
  main and continue"). Production == origin/staging == origin/main == 044d8cc
  (clean 5-commit fast-forward). Ships: streamflow, National Register (692
  historic_site pins), the 25-pin-type granular relabel, and Recreation.gov
  facilities WITH descriptions. RIDB counts: Sac 101, Yellowstone 94, Humboldt 13,
  PCB 1 — reno + hahira dispatched twice and still show no ridb.json (either a
  genuine 0 for those bboxes or the runs didn't commit; CHECK THE LOG before
  assuming 0). GENERIC-BUCKET AUDIT (Noah: "do the generic buckets still serve a
  purpose"): MEASURED what remains — viewpoint 331 (271 explicit
  tourism=viewpoint), park 1555 (1550 explicit leisure=park), marker 170
  (explicit memorial/monument + Wikidata/HMdb markers with no OSM tag), oddity 95
  (100% tourism=attraction). Conclusion: the first three are real claims, not
  fallbacks — KEEP. The fourth was misnamed, so `oddity`'s LABEL is now
  "Attraction" (the key stays `oddity` to avoid data churn) because that is
  exactly and only what it holds; "Oddity" asserted a judgement the data doesn't
  make. Also swept 12 historic=district → historic_site and 6 tourism=camp_site →
  campsite out of "Park".
- 2026-07-25 RIDB (Recreation.gov) BUILT + rolling out — the LAST parked source,
  unblocked when Noah added the key. ingest/adapters/ridb.mjs; key read from the
  RIDB_API_KEY repo secret, sent as the `apikey` HEADER, never logged and never
  written to a data file (ingest-time only — a key can't ship in a client-side
  app). Carries DESCRIPTIONS: RIDB is federal public domain, so unlike a city/
  district website we may include the text (HTML stripped, trimmed to ~400 chars)
  — this is the direct fix for Noah's bare-card complaint. Counts so far: Sac 101,
  Yellowstone 94, Humboldt 13, PCB 1 (reno + hahira still running), ALL with a
  description. TWO BUGS FOUND ON THE FIRST RUN (both mine, fixed): (1) I broke
  pagination on a SHORT page — RIDB returns fewer rows than `limit` while more
  remain, so the first Sac run got 7 of ~101 and the fetch step ran in ONE second;
  (2) a lat/lng RADIUS sweep was the wrong shape (undocumented semantics at our
  region sizes). NOW: sweep by STATE (every region declares its counties' states
  via counties[].state), page strictly to METADATA.RESULTS.TOTAL_COUNT with a
  logged 400-page runaway cap, bbox-filter after. KNOWN GAP, diagnostic added:
  every mapped facility so far is type "Campground" — 0 trailheads/day-use/visitor
  centers. Rather than guess, the adapter now LOGS the unmapped
  FacilityTypeDescription values (top 12 with counts) on each run; read that log
  line on the next dispatch and extend TYPE_CATEGORY accordingly (suspect a
  generic "Facility" type is carrying trailheads). SKIPPED by design: /media
  (third-party image licensing), /campsites (individual numbered sites),
  /permits, /tours. dedup SOURCE_PRIORITY gains 'ridb' (below osm/wikidata,
  above nrhp/gnis). 8 adapter tests incl. one pinning the short-page paging bug.
- 2026-07-25 1.11.0 "Places called what they actually are" (a CAPABILITY) BUILT
  on staging (awaiting on-device pass). Noah pointed at OSM node/5618093482
  (Fairchild Park Indian Grinding Rocks): bare card AND mislabeled "Ruins &
  mines". He asked to "separate things out granularly… suggest as many labels as
  are necessary and useful". A SURVEY of the real data showed the mislabeling was
  systemic: 1283 natural=peak were "Viewpoint", 251 tourism=artwork were "Oddity",
  171 leisure=nature_reserve were "Park". TEN new pin types (15 → 25): summit ▲,
  public_art A, nature_reserve N, archaeological ◆, mine X, cave K, arch ∩,
  notable_tree Y, lookout_tower I, shipwreck ≈. MEASURED effect across all
  regions: oddity 1359 → 96, viewpoint 1678 → 331, park 1746 → 1572.
  refineCategory rules: a curiosity KIND (our adapters' explicit claim) wins from
  ANY category; a RAW OSM TAG only refines the BROAD buckets (REFINABLE =
  oddity/viewpoint/park) so a stray tag from a dedup merge can't hijack a
  specific category; PROTECTED = event/user_pin are never reclassified.
  ARCHAEOLOGICAL SITES got their own type — filing Native cultural sites under
  "Ruins & mines" was inaccurate and a poor label. CATEGORY_META entries now
  carry a `group`; the filter panel renders 4 labeled sub-groups (Landscape &
  water / Historic / Parks & access / Wildlife, art & events) so 25 chips stay
  scannable. At this many types the HUES can't stay perceptually distinct — the
  glyph is the real non-hue channel (accessibility mandate); all 25 pass 4.5:1.
  3 OLD TESTS had encoded the mislabeling and were updated. sw CACHE
  pointer-1.11.0; changelog[0] 1.11.0. 146 tests + contrast + smoke green.
  STILL OPEN from that conversation (offered, not yet built): per-spot USER NOTES
  (his own words, per-device, in the backup bundle), an "Improve this in
  OpenStreetMap" deep link, making thin cards lead with what we compute
  (Bortle/horizon/light), a curated enrichment file keyed by spot id, and PAD-US
  for park manager/designation/access. FACEBOOK IS OUT (settled: no social
  scraping + ToS); a CSD/city website may be LINKED but its prose is copyrighted
  — only federal sources (RIDB/NRHP/GNIS/USGS/NOAA) may have their text carried.
- 2026-07-25 1.10.0 "Historic places, properly" (a CAPABILITY) BUILT + DATA ROLLED
  OUT on staging (awaiting on-device pass). Noah, sharply — I had stopped to ask
  about RIDB when NRHP needed nothing from him: "Well?? What are you doing??"
  Correct call; NRHP is keyless, so it should have been built without asking.
  NEW SOURCE ingest/adapters/nrhp.mjs — National Register of Historic Places via
  the NPS ArcGIS MapServer (cultural_resources/nrhp_locations), US PUBLIC DOMAIN,
  NO KEY. Discovers its layers AND FIELD NAMES at runtime, case-insensitively
  (the GNIS lesson); POINT layers only (skips the polygon districts — a boundary
  isn't a place to stand, and its point record is already in the points layer);
  fails fast on 4xx. NEW CATEGORY `historic_site` (letter H, --cat-historic_site
  #4d6b2f = 6.07:1 with white) so it filters separately from the plaque-oriented
  `marker` pin. dedup SOURCE_PRIORITY gains 'nrhp' BELOW osm/wikidata and above
  gnis — so a coincident OSM/Wikidata spot KEEPS its category and just gains
  tags.nrhp (measured: 18 existing pins enriched that way across the regions).
  COUNTS (all 6 OSM regions, california-ghost-towns excluded by design):
  Yellowstone 315, Sacramento 218, Reno 64, Humboldt 45, panama-city-beach 37,
  Hahira 32 → 692 new historic_site pins live. sw CACHE pointer-1.10.0;
  changelog[0] 1.10.0. 142 tests (+8 nrhp) + contrast + smoke green.
  DATA LIMITATION, accepted + documented (NOT a bug): the NPS SPATIAL service
  carries deliberately minimal attributes — there is NO listing-date field (dates
  live in the separate NRIS database), so `nrhp_listed` is never set and the popup
  reads "On the National Register of Historic Places" with no year, linking to the
  record. listedYear() still exists + is tested for if a date field ever appears.
  202/218 Sac records had a real 8-digit reference number → NPGallery deep link;
  the rest cite the dataset rather than guess a URL.
  PRIVACY: NPS publishes only public, non-sensitive listings (restricted
  archaeological locations withheld at source); we add no precision of our own.
  RIDB (Recreation.gov) REMAINS PARKED: it needs a free API key from
  ridb.recreation.gov/profile → to be stored as the repo secret RIDB_API_KEY (a
  key can NEVER ship in this client-side app, so RIDB must be an INGEST-time
  source like eBird/GNIS, not a live per-spot call like NOAA/USGS). The Swagger
  "Authorize" dialog on the RIDB docs page is NOT where a key is issued — it only
  accepts a key you already hold. Endpoints we'd use when it lands: /facilities
  (campgrounds/trailheads — the real prize) and /recareas; /events worth checking
  for the 1.7.0 events layer; SKIP /campsites, /permits, /tours, /media (media =
  third-party image licensing risk).
- 2026-07-25 1.9.0 "Is the waterfall actually running?" (a CAPABILITY) — LIVE and
  CONFIRMED ON DEVICE by Noah 2026-07-26 ("it works"): real USGS gauge numbers on
  a real waterfall. Chosen as the next source after the three-part plan shipped
  (Noah: "please continue") — it was my top recommendation after tides, and it
  pays off the GNIS/OSM waterfall data directly: a named fall is a year-round
  pin, the SHOT isn't. NEW src/model/streamflow.js — USGS Water Services, US
  PUBLIC DOMAIN, no key. TWO keyless calls, SAME SHAPE AS TIDES: (1) the
  instantaneous-values service over the region bbox (`/nwis/iv/?format=json&
  bBox=w,s,e,n&parameterCd=00060,00065&siteStatus=active`) returns every active
  gauge WITH its latest reading in ONE call — cached per region in a module Map;
  (2) `/nwis/stat/?format=rdb&sites=<id>&statReportType=daily&statTypeCd=median`
  for the NEAREST gauge only, giving the long-term median for today's calendar
  day so the reading has context. parseGauges folds the per-(site,parameter)
  timeSeries into one row per site and DROPS the USGS -999999 "no reading"
  sentinel. parseMedianRdb handles RDB (# comments, header row, `5s 15s` format
  row, then tab-separated data). relativeFlow() bands cfs/median into coarse
  words (<0.4 much lower / <0.75 lower / <=1.5 about normal / <=3 higher / else
  much higher) — deliberately coarse, the ratio is the honest signal.
  isWaterSpot() gates it (category waterfall, tags.curiosity Waterfall,
  natural=waterfall/spring/hot_spring, or subject_type includes 'water') so dry
  spots never call out; nearestGauge() returns null past MAX_GAUGE_KM=25.
  mapview flowLine() renders in the collapsed "Tonight & light" details and
  REMOVES ITSELF with no nearby gauge; links to waterdata.usgs.gov via the
  already-gated .popup-srclink (NO new contrast pairs). _headers CSP connect-src
  += waterservices.usgs.gov; sw CACHE pointer-1.9.0 + streamflow.js precached;
  changelog[0] 1.9.0. VERIFICATION: sandbox 403s USGS (like NOAA/Overpass/WDQS)
  → scripts/smoke-flow.mjs mocks the USGS routes with ctx.route() then calls
  flowNow IN THE BROWSER (proves fetch+CSP+parse+format for real) and reads the
  popup DOM. TWO HARNESS LESSONS (cost two debug cycles, both test-only): (a)
  calling view.focusSpot() for a second spot while the first popup's pan is
  still in flight makes LEAFLET'S OWN reveal handler throw
  ("Cannot read properties of null (reading 'hasLayer')") — give each spot a
  FRESH map+host instead; (b) querying `.popup-flow` globally can match a STALE
  popup left in the DOM, which made the "removes itself" check pass spuriously —
  wipe the host (document.body.replaceChildren) per read, and POLL to a deadline
  rather than fixed sleeps. Smoke is stable over 3 consecutive runs. 134 tests
  (+9 streamflow) + contrast + ALL FOUR smokes (filters/events/tides/flow) green.
  STILL OPEN from the sources list: National Register of Historic Places (NPS,
  public domain) and Recreation.gov RIDB (needs a free API key = a Noah step).
- 2026-07-25 1.8.0 "Tides for the coast" (a CAPABILITY) — LIVE and CONFIRMED ON
  DEVICE by Noah 2026-07-26 ("tides confirmed"): real NOAA numbers on a real
  coastal spot. That closes the last thing only his hands could check here; the
  sandbox 403s NOAA, so everything before this was mocked. Step #3 (last) of Noah's three-part plan. NEW src/model/tides.js —
  NOAA CO-OPS, US PUBLIC DOMAIN, no key, CORS. TWO keyless calls: the
  tide-predictions STATION list (mdapi .../stations.json?type=tidepredictions,
  fetched ONCE per session, cached in a module var) then today's hilo
  predictions (datagetter, product=predictions&interval=hilo&datum=MLLW&
  units=english&time_zone=lst_ldt) for the nearest station. nearestStation()
  returns null past MAX_STATION_KM=40 → an INLAND spot makes NO predictions call
  at all (unit-tested). mapview tideLine() renders inside the collapsed "Tonight
  & light" details (same live per-spot pattern as weather/AQI): "Tides today: Low
  6:12am (0.4 ft) · High 12:40pm (5.1 ft) — <station>", and REMOVES ITSELF when
  there's no nearby station so inland popups stay clean; fails soft. _headers CSP
  connect-src += api.tidesandcurrents.noaa.gov. sw CACHE pointer-1.8.0 +
  tides.js precached; changelog[0] 1.8.0. VERIFICATION LESSON: the sandbox 403s
  NOAA (like Overpass/WDQS/USGS), AND clicking a Leaflet marker in headless is
  unreliable (the list→focusSpot popup path didn't open a popup in this harness
  either — cost a debug cycle). WORKING PATTERN, now in scripts/smoke-tides.mjs:
  intercept the NOAA routes with ctx.route(), then (a) `await page.evaluate(() =>
  import('./src/model/tides.js'))` and call tidesToday IN THE BROWSER (proves
  fetch+CSP+parse+format for real), and (b) build a map view in a detached host
  and call view.focusSpot(spot) inside the SAME evaluate to render + read the
  actual popup DOM. Both coastal (line + station present) and inland (element
  removed) verified. 125 tests (+8 tides) + contrast + all three smokes green.
  ALL THREE of Noah's asks are now built: 1.6.0 search+distance, 1.7.0 events,
  1.8.0 tides — all UNPROMOTED on staging awaiting his device pass.
- 2026-07-25 1.7.0 "Events" (a CAPABILITY) BUILT on staging (awaiting on-device
  pass). Step #2 of Noah's three ("do them in that order"). Noah mid-build: "make
  sure the events tab explains it's limitations" — so the honesty note is a
  REQUIREMENT, in TWO places. NEW src/model/events.js: an event is an ordinary
  Spot, category 'event', carrying tags.event {month,day,days,when,recurs:
  'annual',skywide}. nextOccurrence() rolls a FINISHED annual event to next year
  but keeps a multi-day run current through its last day; formatEventWhen() →
  "Sep 11–13 · in 12 days"; upcomingKey() drives a new list sort. COMPUTED SKY
  EVENTS: buildCelestialEvents(region) makes the 7 annual meteor-shower peaks at
  the region centre (skywide:true), appended in loadRegionData AFTER the fetch so
  they work OFFLINE and never go stale — no external calendar API exists that's
  license-clean. The GREAT RENO BALLOON RACE became a real dated event (category
  'event' + tags.event Sep 11, 3 days) in data/sources/reno/curated.json; re-
  merged reno LOCALLY (332 spots). 'event' added to spot.CATEGORIES (test/
  spot.test.mjs vocabulary list updated), CATEGORY_META (letter E), --cat-event
  #9b3b6a (6.51:1 white, added to check-contrast CATS) + .pin-event — so it
  filters like any pin type. listview: "Upcoming" sort button + the date in
  detailBits; mapview popupFor: a .popup-event line (+ "visible region-wide" for
  skywide). LIMITATIONS STATED (Noah's ask): a `.list-eventsnote` at the top of
  the Upcoming view — hand-picked, NOT a complete listing (no open/licence-clean
  events database exists), annual dates approximate, confirm with the official
  source — AND a matching "Events" section in the ⓘ panel (install.js openAbout).
  sw CACHE pointer-1.7.0 + events.js PRECACHED; changelog[0] 1.7.0. VERIFIED
  headless (new scripts/smoke-events.mjs, Reno): note present; Upcoming puts
  dated events first (Perseids "in 18 days"); balloon race pin-event "Sep 11–Sep
  13 · in 48 days"; 7 meteor showers; Event-only filter → all pin-event rows;
  ZERO pageerrors. 117 tests (+6 events) + contrast + both smokes green. NEXT:
  #3 NOAA tides (coastal Humboldt/PCB, public domain, live per-spot).
- 2026-07-25 1.6.0 "Search and near-me" — see the entry below; step #1 of the
  same three-part plan.
- 2026-07-25 1.6.0 "Search and near-me" (a CAPABILITY) BUILT on staging (awaiting
  on-device pass). Noah asked for search + a distance filter as the groundwork
  under an events layer ("do them in that order": #1 search+distance, #2 events,
  #3 NOAA tides). (A) SEARCH — a full-width `.search-row` name box under the
  region pills (main.renderHeader), module `searchQuery`. Filters BOTH views by
  name, OVERRIDING the pin-type/layer/distance filters: spotsForList returns
  spotsForMap().filter(matchesSearch) when a query is set; syncMapFilter sets
  setSpotFilter(matchIds) which overrides category visibility in cull() — so a
  name match shows even with its type off. Typing calls a NEW refreshViews()
  (syncMapFilter + renderListView, NO renderHeader) so the input keeps focus.
  (B) DISTANCE — a "Within distance of me" filter group (Any/5/10/25/50 mi,
  module `distanceMi`), withinDistance() via geo.distanceM; composes with the
  category+layer filters on both views. (C) ONE SHARED GEO FIX — new
  main.ensureLocation(then)/userLoc/geoStatus serves BOTH the distance filter and
  the list's Distance sort; listview.js NO LONGER runs its own getCurrentPosition
  (took its userLoc/locating/geoFailed OUT) — it takes userLoc + geoStatus +
  onRequestLocation + searchQuery as props, so the user is prompted at most once.
  List note shows "N results for '<q>'"; empty search → "No places match '<q>'".
  Search suppresses the all-off filter-tip. sw CACHE pointer-1.6.0; changelog[0]
  1.6.0. VERIFIED headless (smoke-filters.mjs, geo granted 38.68/-121.0): search
  "Falls" → 29 results across categories with ALL pin types off (Pecker Falls…);
  5 mi narrows 300→70; dist chips use the standard toggle look; ZERO pageerrors.
  111 tests + contrast green. NEXT (in order): #2 events layer (schedule model +
  Upcoming view, curated + computed celestial events), then #3 NOAA tides.
- 2026-07-25 PROMOTED source #3 (GNIS) to main (Noah's "promote"). Production ==
  origin/staging == origin/main == 2b563ad (clean 4-commit fast-forward). ALL
  THREE curiosity sources are now COMPLETE and live: #1 Wikidata curiosities, #2
  OSM feature tags, #3 USGS GNIS. GNIS counts by region: Yellowstone 252 (104
  waterfalls + 148 hot springs — the `Geyser` GNIS class addition lit it up),
  Sacramento 8 (waterfalls: Eagle/Bassi/Codfish Falls), Humboldt 5 (waterfalls),
  Reno 3 (hot springs), panama-city-beach 1 (waterfall), Hahira 0 (genuine —
  flat GA, no named falls/caves/hot springs, same as its source #2). All 7 gnis
  runs succeeded. california-ghost-towns excluded by design (curiosity-only).
  GNIS features are `oddity` spots carrying tags.curiosity → refineCategory
  splits Waterfall/Hot spring pins at load; dedup source_priority puts gnis last
  so a coincident OSM/Wikidata point keeps its category while the curiosity tag
  survives the merge. This is the LAST of the "three sources" ask — nothing owed
  after this. NO app version bump (pure data + the display path already exists);
  NO GitHub metadata step.
- 2026-07-25 SOURCE #3 (USGS GNIS) TOOLING built + verified (before the promote
  above). ingest/adapters/gnis.mjs queries The National Map geonames ArcGIS REST
  MapServer (US public domain, no key) — bbox + `gaz_featureclass IN (Falls,Arch,
  Cave,Spring,Geyser)`. KEY LESSONS from the runner (sandbox 403s the service, so
  verified on Actions like WDQS/Overpass): (1) the service SPLITS features across
  ~11 category layers (Landforms, Other Hydrographic Features [waterfalls live
  HERE, not Landforms], Historical Physical/Hydrographic, Populated Places, …) —
  a single-layer query got 2/region; FIX = pickLayers queries EVERY layer with a
  gaz_featureclass field, dedup by gaz_id across them, SKIP the non-natural ones
  (/place|civil|census|crossing|antarctic|political|boundary/). (2) the Antarctica
  layer 400s a US-bbox query — getJson now FAILS FAST on 4xx (err.fatal, no retry)
  instead of wasting ~10s. (3) Added the `Geyser` class (→ Hot spring) or
  Yellowstone's geysers are missed. (4) plain (cold) Spring is skipped unless the
  name matches /hot|warm|thermal|geyser/. Falls→Waterfall, Arch→Natural arch,
  Cave→Cave, all as category 'oddity' + tags.curiosity (refineCategory reclassifies
  at load, same as #1/#2). `gnis` command + gnis.yml workflow (on main for
  dispatchability) + `all` includes it; dedup SOURCE_PRIORITY gains 'gnis' (last);
  6 adapter tests (111 total). Runner-only.
- 2026-07-25 SOURCE #2 COMPLETE across all OSM regions (on staging). Final
  osm-features counts: Sacramento 6 (3 caves→oddity, 3 archaeological→ruins),
  Yellowstone 714 (701 hot springs + caves/shipwreck/arch), Humboldt 7 (4
  lighthouses — Cape Mendocino/Humboldt Harbor/Memorial + 2 natural arches
  Elephant Rock/The Portal + 1 shipwreck), panama-city-beach 1 (San Carlos
  Chacatos archaeological site; its 2 lighthouses Cape San Blas/St Joseph Point
  come via source #1 Wikidata), Reno 0, Hahira 0 (both CONFIRMED genuine 0 via
  logs — "osm-features: none, skipping"). california-ghost-towns EXCLUDED by
  design (curiosity-only region, OSM not run). GOTCHA: Humboldt + PCB's FIRST two
  dispatches TIMED OUT (20-min timeout-minutes → GitHub shows conclusion
  "cancelled", NOT a real 0) — Overpass mirrors were overloaded; a re-dispatch
  ~30 min later went through fine. So a "cancelled" osm-features run = Overpass
  timeout, re-dispatch it; only a "success" with "osm-features: none" in the log
  is a true 0. Sac + Yellowstone features are already LIVE on main (promoted);
  Humboldt + PCB feature DATA is STAGING-ONLY (2 runner commits ahead of main,
  5ee7228 + f509fcd) — a data-only PROMOTE CANDIDATE awaiting Noah's call (the
  display code, refineCategory feature-first, is already on main). NEXT: source
  #3 (USGS GNIS, US public domain, independent of Overpass) — the last of the
  "three sources".
- 2026-07-25 PROMOTED 1.5.15 + 1.5.16 + 1.5.17 to main (Noah's "promote what is
  there now to main"). Production == origin/staging == origin/main == cc8af8d.
  NOTE this was a MERGE, not a fast-forward (same shape as the 1.5.9→1.5.12
  promote): main carried a tooling-only commit (834e375 "osm-features
  dispatchable on main") that staging didn't have as a commit, so the branches
  diverged; ONE conflict — the ALL_RULES ordering in osm-overpass.mjs (main had
  the old TAG-first order, staging the feature-first Old-Faithful fix) — resolved
  to staging's side; merged tree VERIFIED byte-identical to origin/staging (git
  diff empty), then re-synced staging to the merge commit (staging == main).
  Ships: 1.5.15 (place cards open at top + collapsed Tonight&light + "A
  photographed spot"), 1.5.16 (simple on/off "must have" layers, two labeled
  filter groups, dropped duplicate dark_sky pin type, layer-on/type-off hint),
  1.5.17 (filter chips are standard filled/outlined toggles + ✓, no strike-
  through) AND source #2 OSM curiosity features for Sacramento (6) + Yellowstone
  (714) + the refineCategory/normalizeElement feature-first fix. 105 tests +
  contrast + smoke green on the merge. NO GitHub metadata step. STILL OWED:
  finish source #2 for Humboldt + panama-city-beach (runners were mid-flight at
  promote time — a future promote if they land features; Reno + Hahira confirmed
  0), then source #3 (USGS GNIS).
- 2026-07-25 1.5.17 "Filter buttons look like real toggles" (an ITERATION, a
  design FIX) BUILT on staging (awaiting on-device pass). Noah, on the 1.5.16
  bar: "'only show places...' is a good explanation. Those should not be crossed
  out though. That is very amateur. They should be toggles or on/off radio
  buttons or lights or something like that. Use actual accepted design principles
  instead of making shit up." The off-state strike-through (a long-standing
  choice as the "non-hue off channel") read as deleted/disabled, not "off". FIX:
  replaced it with the STANDARD FILTER-CHIP pattern (Material/iOS filter pills),
  applied to BOTH the place-type chips AND the layer chips: SELECTED = solid
  filled pill (`.chip[aria-pressed="true"]` → --ink fill / --bg text) + a trailing
  ✓ (`.chip-check` span); UNSELECTED = plain outlined pill (base .chip, no strike,
  no dim). Deleted `.chip[aria-pressed="false"]{opacity:.55;line-through}` and the
  `.req-mark` leading mark. On-state = TWO non-hue channels (fill luminance
  inversion + ✓ shape), grayscale-safe. Reuses the already-gated bg-on-ink
  (selected) + ink-on-card (unselected) pairs — NO new contrast pairs. main
  renderHeader: both chip builders append `chip-check` ✓ when on. sw CACHE
  pointer-1.5.17; changelog[0] 1.5.17. VERIFIED headless (smoke-filters.mjs +
  a light/dark screenshot review): ZERO chips struck through; selected bg
  (rgb 46,38,24 light) distinct from unselected (card); ✓ present on selected;
  looks professional in both themes. 105 tests + contrast green. NO GitHub
  metadata step.
- 2026-07-25 1.5.16 "Filters that make sense: simple 'must also have'" (an
  ITERATION, a UX FIX) BUILT on staging (awaiting on-device pass). Noah: "The
  layers and filters really don't make any sense when I start using them?" I
  named 4 real inconsistencies I'd introduced (two look-alike chip rows with
  DIFFERENT tap rules; a layer does nothing until a pin type is also on;
  strike-through meant BOTH "off" and "exclude"; "Dark sky" existed twice) and
  offered (a) simplify layers to on/off vs (b) keep tri-state but distinguish it.
  Noah answered "a" (confirmed: "the 'a' was me answering your question"). FIX
  (option a): (1) LAYERS ARE NOW SIMPLE ON/OFF "must have" — store K_LAYERS
  bumped v2→v3, activeLayers() is a plain Set of required keys (was a tri-state
  Map); passesLayers requires EVERY layer, no exclude state. main renderHeader
  layerChips are on/off (aria-pressed + leading ✓), matching the pin-type chips —
  so strike-through now means ONE thing everywhere: off. (2) TWO LABELED GROUPS
  in the filters panel: `.filter-group` + `.filter-group-label` "Show these place
  types" and "Only show places that also have…" (was one flat "Layers:" row).
  (3) REMOVED the duplicate `dark_sky` PIN TYPE (CATEGORY_META, --cat-dark_sky
  token, .pin-dark_sky, check-contrast CATS, synthesis openCats) — ZERO spots
  ever used the category; the darkSky LAYER stays. (4) HINT when a layer is on
  but every pin type is off ("Turn on a place type above too — a layer only
  narrows what's already showing"), the invisible AND-logic made visible. Map
  banner reworded ("N places match your filters"). Deleted the tri-state CSS
  (.layer-chip.require/.exclude, the neutral-override) — layer chips inherit the
  pin-type on/off look. sw CACHE pointer-1.5.16; changelog[0] 1.5.16. VERIFIED
  headless (new scripts/smoke-filters.mjs, 390×844): two group headings; NO "Dark
  sky" pin chip, present as 1 of 8 layers; layer tap→on (aria-pressed+✓); hint
  shows when layer-on/type-off then clears when a type turns on; Viewpoint+Dark
  sky → 300 rows all Bortle-tagged; layer off widens; ZERO pageerrors. 103 tests
  + contrast green. NO GitHub metadata step.
- 2026-07-25 SOURCE #2 (OSM curiosity features) — rollout + a correctness fix,
  on staging. COMMITTED so far: Sacramento (6: 3 caves→oddity, 3 archaeological
  sites→ruins) and Yellowstone (714: 701 hot springs, 3 caves, 1 shipwreck, 1
  arch, + 8 famous geysers). BUG FOUND + FIXED: features carrying BOTH a specific
  natural/man_made tag AND tourism=attraction (Old Faithful, Steamboat Geyser,
  Morning Glory Pool) matched the generic oddity TAG_RULE first in normalizeElement
  and never got a curiosity kind. FIX (two layers): (a) refineCategory now also
  reads OSM-native feature tags (natural=hot_spring/geyser/waterfall, man_made=
  lighthouse) so those resolve to the finer pin type at LOAD — fixes the already-
  committed Yellowstone data with NO re-ingest (8 geysers incl. Old Faithful →
  Hot spring, verified); (b) ALL_RULES reordered FEATURE_RULES-first so future
  ingests set the kind at the source. +2 tests (105 total). REMAINING: re-
  dispatched osm-features.yml on staging for humboldt/reno/panama-city-beach/
  hahira (their first-round runs were incomplete — 2 had cancelled; per-region
  concurrency groups, cancel-in-progress:false, so this batch queues safely).
  california-ghost-towns correctly has NO osm-features (OSM isn't run there —
  curiosity-only). STILL OWED after this: SOURCE #3 (USGS GNIS, US public domain,
  independent of Overpass).
- 2026-07-25 PROMOTED 1.5.13 + 1.5.14 to main (Noah's "Promote"). Production ==
  origin/staging == origin/main == 5c132c0 (clean 2-commit fast-forward from
  1.5.12 / bd74f03). Ships: 1.5.13 (oddity split into Ghost town/Waterfall/Hot
  spring/Lighthouse/Ruins pin types + filter buttons, refineCategory at load) and
  1.5.14 (collapsible "Filters" header so the chips don't eat half a phone screen
  — fixes the "half the screen is covered, tiles won't open" regression). Noah's
  trigger: "no way to turn on ghost towns on a normal layer" — the dedicated
  Ghost town button existed only on staging until this promote. staging == main
  after this. NO GitHub metadata step. STILL OWED: source #2 (specific OSM feature
  tags) + source #3 (USGS GNIS) from the "three sources" ask.
- 2026-07-25 1.5.14 "Collapsible filters (map fills the screen)" (an ITERATION,
  mobile BUG FIX) BUILT on staging (awaiting on-device pass). Noah (phone
  screenshot, v1.5.12): "Half the screen is covered and tiles won't open now
  because of it." ROOT CAUSE: the filter header had grown unbounded — 7 region
  pills (wrapping to 3 rows) + 10→15 category chips + 8 layer chips + hint + view
  toggle ≈ 10+ rows ≈ HALF a phone screen; the map was squished so pin popups had
  no room ("tiles won't open"). 1.5.13's 5 new category chips made it worse. FIX
  (main.renderHeader + styles.css): (1) the category + layer chip rows are now
  behind a labeled `.filters-toggle` ("Filters (N) ▾", N = active count, aria-
  expanded/controls) — COLLAPSED BY DEFAULT (module `filtersOpen=false`); tapping
  it reveals `.filters-panel`. (2) `.regions` is now a single nowrap horizontal-
  scroll row (region-pill flex:0 0 auto) instead of wrapping to 3 rows. (3) the
  empty-state tip adapts: collapsed → "Nothing is showing — tap Filters to choose
  what to see." MEASURED headless (390×844 iPhone viewport): header 147px
  collapsed (was ~420px+), map-root 709px = 84% of screen (was ~half); expands to
  477px only when the user opens Filters; popup opens fine via list-focus
  (Bonanza Park). `.filters-toggle.on` = bg-on-ink (existing gated pair). sw CACHE
  pointer-1.5.14; changelog[0] 1.5.14. 101 tests + contrast green; ZERO
  pageerrors. NOTE this is a PRODUCTION UX regression (1.5.12 is live) — worth
  promoting soon.
- 2026-07-25 1.5.13 "Split 'oddity' into finer pin types" (an ITERATION) BUILT on
  staging (awaiting on-device pass). Noah: "I feel like 'oddities' should be split
  to more filter buttons?" The oddity bucket had become a grab-bag (curiosities +
  OSM art/ruins). SPLIT into 5 new CATEGORIES + kept oddity as the catch-all:
  ghost_town (G), waterfall (F), hot_spring (S), lighthouse (L), ruins (R, historic
  ruins/mines). Reclassified at LOAD (no re-ingest): main.loadRegionData now does
  .filter(keepSpot).map(refineCategory). notability.refineCategory: a curiosity
  KIND (tags.curiosity) wins WHATEVER the current category — important because
  waterfalls/etc. often DEDUP into an OSM viewpoint (SOURCE_PRIORITY osm>wikidata)
  and keep category 'viewpoint' while carrying curiosity='Waterfall'; keying only
  on 'oddity' missed them (Sac: 2/6 waterfalls caught → fixed to 6/6). OSM ruins/
  mine only split out of the oddity catch-all. Roadside attraction, land art,
  natural arch, observation tower, balloon festival, OSM artwork STAY 'oddity'.
  Added CATEGORY_META entries + --cat-* tokens (ghost_town #565049, waterfall
  #16697a, hot_spring #9c4f2c, lighthouse #4a4a86, ruins #7a4a35 — all ≥5.9:1 with
  white letter) + .pin-* rules + the 5 to check-contrast CATS + synthesis openCats
  (so the new landscape cats keep the 'view' signal). Chips + legend auto-render
  from CATEGORY_META. sw CACHE pointer-1.5.13; changelog[0] 1.5.13. VERIFIED
  headless: 5 new chips present; CA Ghost Towns → Ghost town filter 205 rows all
  pin-ghost_town incl. Bodie; Sac → Waterfall filter 6 rows all pin-waterfall
  (incl. the 4 that had deduped into viewpoints/hotspot); ZERO pageerrors. 101
  tests (+4 refineCategory) + contrast green. NOTE the "Waterfall/etc." filters
  only catch what Wikidata tagged as that kind; OSM-native natural=waterfall etc.
  come with SOURCE #2 (still owed, + source #3 GNIS).
- 2026-07-25 PROMOTED 1.5.9→1.5.12 to main (Noah's "Promote"). Production ==
  origin/staging == origin/main == bd74f03. NOTE this promote was a MERGE, not a
  fast-forward: main had 2 tooling-only commits (the curiosities adapter/workflow
  added to main so workflow_dispatch could find it) that staging didn't carry as
  commits, so the branches diverged; merged staging into main (trees identical
  after — verified `git diff` empty), then re-synced staging to the merge commit.
  Ships: 1.5.9 (tri-state layer filters restored, unnamed-oddity drop, ranking
  cache + loading splash), 1.5.10 (neutral-chip line-through fix), 1.5.11
  (Wikidata curiosities source #1 across all 5 original regions), 1.5.12 (new
  California Ghost Towns + Reno regions w/ the balloon-race curated pin). staging
  == main after this. NO GitHub metadata step (description/website/topics
  unchanged; regions/data aren't repo metadata). STILL OWED: source #2 (specific
  OSM feature tags) + source #3 (USGS GNIS) from the "three sources" ask.
- 2026-07-25 1.5.12 "Two new areas: California Ghost Towns & Reno" (a CAPABILITY)
  BUILT on staging (awaiting on-device pass). Noah: "I like the ghost town region
  but they also load in other regions? I need a new region around the balloon
  race." TWO new regions in config/regions.json: (1) `california-ghost-towns` —
  a STATEWIDE theme region (bbox 32.4/-124.6/42.1/-117.0 = all CA + nearby NV),
  GHOST-TOWN-ONLY via a new region field `curiosityClasses:['Q74047']` that the
  curiosities adapter honors (classesFor(region) filters the VALUES list) so a
  statewide query doesn't pull every CA waterfall. county is a placeholder
  {osm_area_name:'California', fips:'06000'} — OSM is NOT run here; only the
  `curiosities` workflow (dispatched via wikidata-curiosities.yml). RESULT: 205
  ghost towns statewide, **Bodie included**, all pass keepSpot (named + wiki).
  (2) `reno` — Reno, NV (Washoe County US-NV-031), bbox 39.35/-119.95/39.68/
  -119.65, center on the balloon-race venue (Rancho San Rafael 39.5528,
  -119.8213, zoom 12). Ran the FULL `all` pipeline via ingest-osm.yml (osm+ebird
  [Frame has no NV → graceful skip]+markers+curiosities+merge): 329 spots (208
  parks, 85 oddities, 19 viewpoints, 12 markers, 5 trailheads; 307 kept). The
  GREAT RENO BALLOON RACE is a CURATED pin — hand-authored data/sources/reno/
  curated.json (source 'curated', license 'own'), category oddity, tags.curiosity
  'Balloon festival', links to Wikipedia; the merge folds it in like any source.
  (GOTCHA: best_light must be from the spot.js LIGHT enum — 'dawn' failed
  validateSpot, used 'sunrise'.) Ghost towns ALSO still load in the normal
  regions as curiosities (1.5.11) — intended (local browse vs the dedicated
  statewide view); minor overlap accepted. sw CACHE pointer-1.5.12 (config/
  regions.json is precached → bump so the 2 new pills reach devices); changelog[0]
  1.5.12. region.test.mjs region list updated to 7. VERIFIED headless: 7 region
  pills; California Ghost Towns → 205 rows incl. Bodie; Reno → balloon race in the
  list, popup "Balloon festival · landscape"; ZERO pageerrors. 96 tests + contrast
  green; both regions validate clean. BRANCH: the 2 regions + curated pin + the
  adapter's classesFor are on staging; the adapter tooling (with correct QIDs +
  classesFor) is also synced to main for workflow_dispatch. STILL OWED from the
  "three sources" ask: SOURCE #2 (specific OSM feature tags) and SOURCE #3 (USGS
  GNIS) — source #1 (Wikidata curiosities) is done across all 7 regions.
- 2026-07-25 1.5.11 "Atlas-Obscura finds (source #1: Wikidata curiosities)"
  (a CAPABILITY) BUILT on staging (awaiting on-device pass). Noah: "run the three
  suggested sources in order" — this is SOURCE #1 of 3. NEW adapter ingest/
  adapters/wikidata-curiosities.mjs (CC0) + `curiosities` command + workflow
  wikidata-curiosities.yml: queries the region bbox (wikibase:box) for P31/P279*
  of curiosity CLASSES → 'oddity' spots tagged {curiosity: kind, wikidata,
  wikipedia}, link out to Wikipedia. Popup leads with the kind ("Ghost town");
  list detailBits shows it. GOTCHA (exactly as LESSONS warns — WDQS unreachable
  from sandbox, QIDs must be verified): FIRST runner pass returned only 8 (6
  waterfall Q34038 + 2 lighthouse Q39715 — those IDs were right); ghost town +3
  others silently returned 0 because MY QIDS WERE WRONG. Verified via WebSearch +
  fixed: ghost town Q5153359→**Q74047**, natural arch Q771035→Q954501, obs tower
  Q1440476→Q1440300, roadside attraction Q2380335→Q14915208, land art
  Q338786→Q326478; dropped unverified "folly". FINAL VERIFIED (8 classes) rolled
  to ALL 5 regions via actions_run_trigger on staging: Sac 26 (17 ghost towns
  incl. Mormon Island/North Bloomfield/Carson Hill/Ophir/Red Dog, 6 waterfalls,
  2 lighthouses, 1 lookout), Yellowstone 253 (200 hot springs, 34 waterfalls, 16
  ghost towns, 2 arches, 5 lookouts), Humboldt 5 (coastal lighthouses), PCB 6,
  Hahira 2. All pass keepSpot (carry wikidata/wikipedia). BRANCH NOTE: the INGEST
  TOOLING (adapter, ingest.mjs `curiosities`, workflow, test) is on BOTH main
  (required for workflow_dispatch discoverability — like every other ingest
  workflow) and staging; the user-facing DISPLAY (popup/list kind) is on staging
  only, rides the promote. Runner commits DATA to staging (ref=staging). sw CACHE
  pointer-1.5.11; changelog[0] 1.5.11. 96 tests (+5 adapter) + contrast green.
  NOTE Bodie is NOT in any current region (Mono County, out of bbox) — comes with
  the statewide ghost-town region. NEXT (still owed): SOURCE #2 (specific OSM
  feature tags: natural=arch/cave_entrance/hot_spring/geyser/rock, man_made=
  lighthouse/obelisk/tower, historic=archaeological_site/wreck — ODbL); SOURCE #3
  (USGS GNIS named natural features, US public domain); the STATEWIDE "California
  Ghost Towns" region (CA + nearby NV, ghost-town-only) for Bodie + whole-state
  coverage; the Great Reno Balloon Race curated pin. Noah leaning to statewide
  region over an Eastern-Sierra local region (recommendation given, not yet
  confirmed).
- 2026-07-25 1.5.9 "Tri-state layers, cleaner oddities, faster opens" (an
  ITERATION: design fix + data quality + perf/UX) BUILT on staging (awaiting
  on-device pass — NEEDS NOAH'S HANDS: the tri-state feel + real return-visit
  speed on the iPad). Noah, three asks across the turn: "the must-have row
  conflicts with my tri-state filter design", "'unnamed oddity' looks like
  roundabouts", and "make it say something while it's loading… every return page
  visit makes it resort and look retarded in how long it takes." FOUR changes:
  (A) TRI-STATE LAYERS RESTORED — 1.5.7 collapsed the layer chips to binary
  "Must have"; that broke Noah's long-standing design (layer chips are tri-state
  require/exclude, ONLY pin-type chips are on/off — see the 1.0.0 note). store
  K_LAYERS bumped v1→v2: activeLayers() is now a Map(key→'require'|'exclude')
  (was a Set). Header "Layers:" row cycles neutral→require(✓)→exclude(✕)→clear
  with a `.req-mark` span; `.layer-chip.require/.exclude` CSS (bold+firm border /
  strike+dashed) + a `.layer-chip[aria-pressed=false]` override so a NEUTRAL chip
  doesn't inherit the category chips' struck-through off-look. passesLayers()
  (require every ✓, exclude every ✕) drives BOTH spotsForList and syncMapFilter.
  (B) UNNAMED-ODDITY DROP (notability.keepOddity): an oddity with NO name now
  must be documented (wikipedia/wikidata or commons≥3) — drops the unnamed
  tourism=artwork / historic=ruins nodes that read as map cruft. Measured drop 88
  across regions (Sac 27, Yellowstone 34, Humboldt 22, PCB 4, Hahira 1); keeps 20
  photographed ones (an unnamed mural w/64 commons, ruins w/15). Sac oddities
  94→67. (C) RANKING CACHE (store loadRankCache/saveRankCache, key pointer.rank.
  <id>) — the score is deterministic per region build, so ranking() persists its
  result keyed by rankSig() = VERSION:builtAt:dataCount:pinCount and reuses it,
  skipping the ~1s re-rank on every load. Quota-safe (drops other regions' caches
  + retries, then fails soft). VERSION in the sig → any app update re-ranks once.
  MEASURED cold boot ~1.3s → cached reload 377ms; cache-hit Best order identical
  (56,54,54,53,52). (D) LOADING SPLASH — a static `.app-loading` overlay in
  index.html (painted before JS runs), removed in boot() after setRegion; covers
  the first-computation wait so it's never a blank stall. sw CACHE pointer-1.5.9;
  changelog[0] 1.5.9. VERIFIED headless (playwright, Sac): splash seen→gone;
  layer chip cycles neutral/require/exclude/neutral; require Dark sky→all rows
  Bortle, exclude→zero Bortle (tri-state on the LIST, the 1.5.7 gap); oddity list
  94→67 with 5 corroborated unnamed kept; rank cache written + reused; ZERO
  pageerrors. 91 tests + check-contrast green. BRANCH NOTE: on `staging` per the
  standing rule. NO GitHub metadata step. DEFERRED still: async first-rank (the
  cache makes it moot for RETURN visits; only the very first visit per build
  still pays the rank, now behind the splash); adding MORE atlas-obscura sources
  (Wikidata curiosity classes / OSM natural tags / USGS GNIS — see prior entry).
- 2026-07-25 PROMOTED 1.5.4→1.5.8 to main (Noah's "merge."). Production ==
  origin/staging == origin/main == 2dfa70f (clean 5-commit fast-forward from
  1.5.3 / bfd6ae9). Ships the whole Top-spots redesign arc + curation + perf:
  1.5.4/5/6 score labeling→recalibration (never shown alone), 1.5.7 (trophy gone,
  one filter bar with "Must have" layers, "Best" sort + distance/bearing in the
  list), 1.5.8 (hide/block places + blocklist manager, oddity junk filter,
  ranking/marker perf fix — hide 1.18s→~155ms). staging == main after this. NO
  GitHub metadata step. OPEN FOLLOW-UPS (Noah asked "what more points to atlas-
  obscura locations?"): candidate license-clean sources to ADD curiosities —
  (1) EXPAND wikidata-markers to curiosity CLASSES (folly Q170980, land art,
  roadside attraction Q2380335, ghost town, lighthouse, observation tower,
  natural arch/waterfall/hot spring, sculpture) CC0 + Wikipedia link-out; (2)
  specific OSM selectors (natural=arch/cave_entrance/hot_spring/geyser/rock,
  man_made=lighthouse/obelisk/tower, historic=archaeological_site/wreck) ODbL;
  (3) USGS GNIS named natural features (waterfalls/arches/caves/hot springs),
  US public domain. Atlas Obscura itself has NO open/redistributable API — can
  only link-search, not ingest. Also DEFERRED: async first-rank for instant map
  interactivity.
- 2026-07-25 1.5.8 "Hide places, fewer junk oddities, snappier" (an ITERATION:
  feature + data-quality + perf) BUILT on staging (awaiting on-device pass —
  NEEDS NOAH'S HANDS: the hide flow + real load/zoom feel on the iPad). Noah:
  "a way to permanently delete, or at least block… certain locations" (Southwind
  Labradors), "a LOT of oddities are just garbage… NOT atlas obscura type
  wonders", "a blocked-list… sorted by most recent, and recovered", and load/
  zoom/reset "take a long time… seems wrong". THREE things: (A) HIDE/BLOCK — a
  per-device blocklist (store.js K_HIDDEN + hiddenSpots/hideSpot/unhideSpot/
  clearHidden, in the export bundle). Hidden ids are dropped at the SOURCE
  (spotsForMap filters them) so they leave map + list + ranking. UI: "Hide this
  place" in the map popup (onHideSpot) and a quiet ✕ per list row (onHide); undo
  toast (main hideAndRefresh); manager in ⤓ Backup → "Hidden places" — MOST-
  RECENT FIRST ([...hidden].reverse()), per-item Unhide + Restore all. (B) ODDITY
  CLEANUP (notability.js keepSpot now also filters `oddity`): OSM `tourism=
  attraction` is self-applied garbage (dog breeder, CSD pool, Fairytale Town
  kiddie rides). keepOddity drops an attraction-sourced oddity UNLESS it's a real
  feature (tags.natural/historic/geological) or corroborated (wikipedia/wikidata,
  commons≥3, or >1 source). Oddity drops measured: Sac 38, Yellowstone 20,
  Humboldt 8, PCB 2, Hahira 0. KEEPS Balancing Rock (natural=stone), cave
  (historic=mine), China Wall (23 commons). Load-time, no re-ingest; ingest
  adapter left as-is (documented). (C) PERF — hiding a spot took ~1.18 s. ROOT
  CAUSE: refresh() → ranking() keyed on the hidden-FILTERED spot count, so every
  hide invalidated the cache and re-ran rankSpots over ~2.3k spots (per-spot
  astronomy + spatial queries). FIX: ranking() now runs over allSpots() (full
  set, hidden included as spatial neighbours) keyed on dataSpots.length —
  hide/unhide never re-ranks; hidden are dropped at display time. ALSO made
  mapview setSpots INCREMENTAL (createMarkerRec extracted; diff by id — add new,
  remove gone, keep the rest) instead of tearing down + rebuilding all ~2.3k
  L.markers each refresh. MEASURED hide 1180 ms → ~155 ms (7–8×). Initial load
  (~1.3 s headless) is one-time module load + a single rank; better on-device
  once the SW caches assets. DEFERRED (offered): making the FIRST rank async so
  the map is instantly interactive — a bigger change, left for a follow-up if it
  still drags on his iPad; also "add MORE Atlas-Obscura-type sources" (this pass
  only REMOVES junk). sw CACHE pointer-1.5.8; changelog[0] 1.5.8. VERIFIED
  headless (playwright, Sac): hide Southwind from list → 132→131, gone, persists
  across reload, manager lists it, undo + Restore all work; oddity list 132→94
  (Southwind & Cinderella's Coach filtered, Balancing Rock kept); 3 hides ~155 ms
  each; ZERO pageerrors. 91 tests + check-contrast green. BRANCH NOTE: on
  `staging` per the standing rule. NO GitHub metadata step.
- 2026-07-25 1.5.7 "One filter bar, and Best in the list" (an ITERATION, a UX
  REDESIGN) BUILT on staging (awaiting on-device pass — NEEDS NOAH'S HANDS: the
  whole filter/sort/list flow on a real device). SUPERSEDES the unpromoted
  1.5.4/1.5.5/1.5.6 Top-spots-clarity arc (see trail at the bottom of this
  entry). Noah, blunt: "the trophy icon needs to leave, entirely… integrate them
  with the other filters in a way that makes sense. They are also NOT applying to
  the list after the pop-up closes, making them a second filter in a second
  place… I want to see miles from me for each in the list, with a cardinal
  direction/degrees… show me a commonly used standard of design." ROOT PROBLEM:
  TWO disjoint filter systems — the header category chips (map+list) AND the
  trophy popup's tri-state layer requires (map only, via setSpotFilter, never the
  list, and lost on close). REDESIGN to the conventional filterable/sortable-list
  pattern (AllTrails/Yelp): (1) TROPHY GONE — deleted the 🏆 button + openTopSpots
  + topSpotsPanel/LAYER_CHIPS/topRow (ui/synthesis.js now only exports
  synthesisBreakdown + LAYER_FILTERS + scorePct/scoreTier). (2) RANKING IS A SORT
  — listview.js gains a 'best' sort (Sort: Best | Distance | Name | Type); each
  row shows the score+strength badge (.list-score reuses .score-num/.score-cap),
  so the list IS the old Top-spots list. (3) ONE FILTER BAR — the 8 data layers
  (LAYER_FILTERS, keys = signal keys) are now a "Must have:" chip row in the
  header (simple on/off, ✓ when on), persisted in store K_LAYERS alongside
  K_FILTERS. A spot passes when its category is on AND it carries EVERY required
  layer. Applied to BOTH views: spotsForList filters by cats+layers; syncMapFilter
  sets setVisible(cats) + setSpotFilter(cats∩layers ids). Layer membership +
  score come from rankMaps() (id→score, id→Set(partKeys)), memoized off the
  ranking. (4) DISTANCE + BEARING — each list row shows "N mi · <compass> <deg>°"
  via new geo.bearingDeg(a,b) + light.compass(); one-time geofix, fails soft
  (geoFailed guard kept). Map "Must have" banner reworded ("N places match your
  Must have filters", Clear → onClearFilter clears the layer chips at source).
  sw CACHE pointer-1.5.7; changelog[0] 1.5.7 (folded the 1.5.4/5/6 entries — none
  promoted). VERIFIED headless (playwright, Sac, geo granted): 0 trophy buttons/
  glyphs; "Must have:" + 8 layer chips; Sort has Best/Distance/Name/Type; first
  row meta "Park · 75 m · SE 146° · Bortle 7" (distance+bearing ✓); Best sort
  desc [56,54,54]; toggling "Dark sky" narrows map to 2321/2368 + all list rows
  carry the layer; filter PERSISTS across Map↔List; ZERO pageerrors. 91 tests +
  check-contrast green. BRANCH NOTE: on `staging` per the standing rule. NO
  GitHub metadata step.
  ---- FOLDED, UNPROMOTED (reasoning trail for the Top-spots arc) ----
  1.5.4 labeled the score "N / 100" → Noah: "looks like a failing grade" (top
  real scores ~mid-50s, score = Σ(value·weight)/Σ(all live weights), never 100).
  1.5.5 dropped the "/100", called it a relative "score", reworded the blurb to
  match a score not a layer count ("match the score"), and made the trophy a
  labeled "🏆 Top spots" button. 1.5.6 RECALIBRATED the strength tiers to the
  measured distribution — STRONG_MIN=48 / GOOD_MIN=30 (was strong≥66/good≥33,
  UNREACHABLE) so every region's #1 reads "strong" — and COMMENTED every magic
  number in the scoring path (tier cut-offs + a WEIGHT SCALE block above SIGNALS
  + per-signal constants). All THREE of those survive in 1.5.7 (the score, the
  strength words at 48/30, and the number-comments) — only their HOME changed
  from the trophy popup to the list. The 🏆 button 1.5.5 added is now removed.
- 2026-07-25 PROMOTED 1.5.3 to main (Noah's "Merge"). Production ==
  origin/staging == origin/main == bfd6ae9 (clean 2-commit fast-forward from
  1.5.2 / 9e5b52e). Ships the List-view fix: the header category buttons now
  filter the list like they filter the map, plus the denied-location distance-
  sort re-render-loop fix. staging == main after this. No GitHub metadata step.
- 2026-07-24 1.5.3 "Filters work in the list too" (an ITERATION, a BUG FIX)
  BUILT on staging (awaiting on-device pass — NEEDS NOAH'S HANDS: the List view
  filtering + sort feel on a real device). BUG (Noah: "Filter buttons do not
  work in list view"): the header category chips (viewpoint/park/marker/…) had
  ZERO effect on the List view — it always showed every place in the region.
  ROOT CAUSE (main.js): both setViewMode('list') and refresh() fed the list
  `spotsForMap()` (the FULL set) filtered only by favourites, never by
  `currentVisible()`; and applyVisible() (the chip-toggle handler) didn't
  re-render the list at all. The list-empty message "…Turn on a pin type at the
  top." already proved the list was DESIGNED to honour the chips — only the
  wiring was missing. FIX: new `spotsForList()` = spotsForMap filtered by
  currentVisible() (user pins carry category 'user_pin', so they follow the
  'My pins' toggle like on the map); new `renderListView()` helper called from
  setViewMode, refresh AND applyVisible so a chip toggle re-renders the list
  live. All-off → empty list with the same guidance the map shows. SECOND BUG
  found+fixed (listview.js): with location DENIED, distance sort spun a tight
  getCurrentPosition→error→re-render LOOP (the error cb reset locating=false and
  re-rendered, immediately re-firing the request) — the sort/filter buttons
  flickered and were hard to tap. FIX: a module `geoFailed` flag stops the
  auto-retry after one failure (falls back to name order, note "Location
  unavailable — sorted by name. Tap Distance to retry."); tapping the Distance
  sort button clears the flag so the fix is retried on demand (making that note
  truthful). sw CACHE pointer-1.5.3; changelog[0] 1.5.3. VERIFIED headless
  (playwright, Sacramento): GRANTED location — List "Show all" 300 rows/"2368
  places — showing the closest 300", Hide all → empty note, viewpoint-only →
  300 rows ALL pin-viewpoint (nonVp 0), +park still 300 (capped); DENIED
  location — controls stable (no loop), marker-only → 83 rows ALL pin-marker,
  toggle off → empty note, correct fallback note; ZERO pageerrors both runs.
  91 tests + check-contrast green (no new fg/bg pairs — logic-only). BRANCH
  NOTE: web-task harness designated a claude/* branch; landed on `staging` per
  the standing staging-only rule (as with 1.4.x/1.5.0). NO GitHub metadata step.
- 2026-07-22 PROMOTED 1.5.2 to main (Noah's "promote all"). Production ==
  origin/staging == 7d3d4b7 (clean 1-commit fast-forward from 1.5.1). "An
  accessibility statement" (an ITERATION) — the ⓘ panel's hub line (openAbout,
  src/ui/install.js) gained a second link ` · Accessibility` →
  https://noahjefferson.pages.dev/accessibility (same inherited --dim colour +
  underline, no new contrast pair). Second half of the cross-app initiative: the
  hub now hosts a shared accessibility statement (honest WCAG 2.2 AA framing +
  mailto:noah.jefferson@icloud.com), and every sibling app links to it. sw CACHE
  pointer-1.5.2; changelog[0] 1.5.2. VERIFIED headless: link present, 6.1:1
  contrast, zero pageerrors; check-contrast.mjs green. Shipped the same day to
  Frame (3.1.2), Clear Horizons (2.16.8) and Studio.
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
