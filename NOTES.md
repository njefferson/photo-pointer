# NOTES.md — source of truth

## Product thesis

Photo scouting is scattered across a dozen apps and none of them talk to
each other: viewpoints in one, historical markers in another, campsites,
trailheads, bird hotspots, dark-sky maps all separate. photo-pointer unifies
them onto ONE region-scoped map, built only on free, license-clean open
data, with the photographer's questions first: what's the subject, when is
the light, how hard is the access. Personal tool — free, on-device,
offline-first, no account. No Instagram, no social scraping, ever.

## Settled decisions

- **Spot schema and dedup_key settled before any second source** — entity
  resolution is where this lives or dies (see src/model/dedup.js header for
  the matching rules; changing them re-keys spots, so change deliberately).
- **Ingest on runners, committed JSON is the durable store** (sandbox can't
  reach Overpass — measured 2026-07-19, 403 CONNECT on four hosts).
- **Light pollution is a raster LAYER, not thousands of points**; `dark_sky`
  spots are reserved for curated/derived notable sites.
- **HMdb content is copyrighted** — name/coords/link only, never inscription
  text or photos.
- **Leaflet + raster tiles for v0** (vendored, the Clear Horizons pattern).
  Tiles require network; the offline story for the map background was an OPEN
  QUESTION (see below).
- Branches: `staging` + `main` only (settled 2026-07-19).

## Open questions (blocking-ish, in order)

1. **Deploy setup**: RESOLVED — the Pages project auto-creates on first
   publish; the Cloudflare secrets are inherited from the account that owns the
   project. Staging is live.
2. **Offline map background**: RESOLVED 2026-07-19 — online basemap is fine
   (option a). Raster tiles online, pins/data offline. Not revisiting.
3. **Next live source**: RESOLVED 2026-07-19 — eBird, done (see below).
   Remaining candidates, unscheduled: HMdb markers (facts-only),
   Flickr CC photo-density, light-pollution layer, public-lands layer.
   RESOLVED 2026-07-19: eBird next. Shipped — imported from Frame's committed
   county hotspot data (no key/network). 2,362 spots now.
4. License: RESOLVED 2026-07-19 — PolyForm Noncommercial License 1.0.0
   (LICENSE.md), the same as Clear Horizons. Header scope lists this repo's
   third-party material (Leaflet BSD-2, OSM ODbL, eBird API terms).

## The privacy scrub, 2026-08-20

**This repo had never been scanned, and it was not clean.** Both halves of the
rule were applied: nothing personal about the owner, and never quote the owner
or attribute anything to the owner — which binds source comments, tests,
tooling, docs
and workflow files, not just markdown.

WHAT THE GATES SAW, run from the hub with an explicit `--repo .`:

- `privacy-check.mjs` — **17 attribution sites** across 8 files, including four
  `scripts/smoke-*.mjs` headers, `src/main.js`, `src/model/synthesis.js`,
  `src/ui/mapview.js`, `test/osm-adapter.test.mjs`, and a workflow comment.
- `quote-check.mjs` — 0. There is not one `> *"…` blockquote in this repo, so
  the shape that gate covers simply never occurred here. **Green on that gate
  meant nothing about this repo's actual state.**

WHAT THE GATES COULD NOT SEE, and this is the number that matters: a wider
sweep over every tracked `.md`, `.ts`, `.mjs`, `.js`, `.html` and `.yml`
returned **30 quotation candidates**, and after removing the false positives the
real total came to roughly **60 sites in 21 files** — because `CLAUDE.md` alone
carried **114 mentions of the owner by name**, most of them wrapping across
lines in ordinary prose where no single-line pattern reaches. The gate found 17
of them.

WHAT WAS REWRITTEN, never deleted. Every fix states the decision as a decision
or the defect as a measurement:

- Reported speech became the requirement it carried. A quoted instruction about
  the scheduled OSM sweep became the standing condition in
  `ingest-osm-scheduled.yml` and `scripts/osm-schedule.mjs`: run inside THEIR
  low-traffic hours, and stop when the region is complete.
- Three quoted rulings on what counts as a photo destination became the three
  rulings, stated, in the `NOT_A_DESTINATION` comment in `commons-photos.mjs`
  and in `test/commons-photos.test.mjs` — a retailer is out, cultivation rather
  than botany is the line, and an archive is out unless its subject is still
  standing.
- Defects found on a device became the defect, measured: the fixed-size popup
  that would not open at 200% text, the blue-on-blue link button at 1.3:1, the
  filter panel that took the whole screen.
- Facts about a person went entirely rather than being reworded. One entry
  carried both a quotation and a personal fact in the same
  sentence; the fact is gone and the requirement — that an update needing a
  force-close twice never reaches an ordinary reader — is what remains.
- A named person's tablet or phone became simply `a tablet` or `a phone`. The
  device is engineering context; whose device it is, is not. This entry tripped
  the gate on its own first draft for exactly that reason, which is the rule
  working.

**A third party is the same harm.** A quoted description of somebody's premises
was replaced by what it was: an example of a place that should be blockable.

THEN THE LITERAL SENTENCES were grepped across every file type, because a
sentence fixed in one file often has a copy in another. That found the 1.14.2
entry duplicated verbatim in `CLAUDE.md`, and four report fragments still in
quotation marks after their surrounding paragraph had been rewritten.

**Left in place on purpose, and each was read:** the app's own patch notes and
UI strings (`src/data/changelog.js`, `index.html` meta, "Within distance of me",
"What we can tell you"), the ⓘ panel's link to the owner's own site under that
byline, the reader's voice quoted in design prose ("can I actually go shoot
here"), a session's own voice, and the licence notice.

VERIFICATION, read from the run rather than remembered: `node --test` **263
passing, 0 failing**; `check-contrast.mjs`, `check-etiquette.mjs` and
`ingest.mjs validate` all exit 0; both hub gates exit 0.

**The gates are now wired in CI, each watched failing first.** `ci.yml` checks
the hub out SHA-pinned and runs `privacy-check.mjs`, `quote-check.mjs` and
`branch-guard.mjs --repo . --artefact`. `--artefact` is the only spelling that
can hold on a runner: the plain check also asserts `.git/hooks/pre-commit` is
current, and `actions/checkout` leaves `.git/hooks` empty by definition. Each
gate was verified by planting a SYNTHETIC violation — a fabricated sentence,
never a real one, because planting a real quotation to prove the gate catches
quotations puts it back in a tracked file permanently. All three exited 1 on the
plant and 0 with it removed.

**The branch guard is installed.** `.branch-guard` declares `work=staging`,
`promote=main`, `escape=POINTER_PROMOTE`.

**Git history is out of scope and the question is settled.** A history scan
coming back red is not new information and is not a reason to reopen it.

## Roadmap (v0 → )

- [x] Scaffold: schema, dedup, OSM adapter, map app, workflows (2026-07-19)
- [x] First live ingest run committed (2026-07-19): 1,711 spots for the seed
      region in data/spots.json (991 park, 353 viewpoint, 132 oddity, 127
      campsite, 75 marker, 33 trailhead; 1,592 named; 56 merged across the
      OSM element types; 2 collision-suffixed ids). data/sources/osm.json is
      the raw per-source layer. Verified headless: app plots all 1,711,
      category filter hides parks (1711→720), popups show name + Apple/Google
      links + ODbL source link, zero pageerrors.
- [x] Cloudflare Pages deploy live (2026-07-19): the Pages project is
      auto-created on first publish; staging deploys succeed
      (staging.photo-pointer.pages.dev preview).
- [x] 0.1.0 PROMOTED to main / production (2026-07-19), on the explicit go
      that the staging gate waits for.
- [x] eBird wildlife hotspots (0.1.0) — 2,362 spots.
- [x] 0.2.0 "Golden Hour" on staging (2026-07-19) — per-spot on-device
      sunrise/sunset/golden/blue-hour times + sun compass direction, via
      vendored astronomy-engine (MIT). Awaiting the on-device pass.
- [x] 0.3.0 "Cross-layer synthesis" on staging (2026-07-19) — the app's
      DIFFERENTIATOR (settled after a competitive-research pass showed every
      single layer is already served better by a dedicated app: PhotoPills/TPE
      for light, Locationscout for spots, Atlas Obscura for oddities,
      ExploreHere for markers, Gaia/onX for trails, eBird for birds, Organic
      Maps for offline OSM, lightpollutionmap for dark sky). The ONLY thing no
      single app does is score/surface spots where MULTIPLE layers line up.
      model/synthesis.js: a SIGNAL REGISTRY — new data source = append one
      signal, scorer never changes. Score = Σ(value·weight) / (sum of weights
      of signals LIVE in the dataset), so breadth wins and a dormant source
      doesn't suppress scores. ui: ★ Top spots panel (rank + require-layer
      chips + fly-to) and a "Why this spot" popup breakdown. darkSky signal
      ships DORMANT — activates the moment a source writes tags.bortle, no code
      change (proven by test). Awaiting the on-device pass.
- [ ] Dark-sky/light-pollution overlay, built to the best available source
      rather than waiting for a perfect one:
      DECISION MADE after real research — use Falchi 2016 via GFZ Data Services
      (DOI 10.5880/GFZ.1.4.2016.001), the real modeled sky-brightness map,
      licensed CC BY-NC 4.0 (fits PolyForm). 2.9 GB global GeoTIFF → VERIFY a
      runner can fetch + crop to region before building. It will also write
      tags.bortle per spot, auto-activating the darkSky synthesis signal.
      (Rejected: djlorenz = permission-required; lightpollutionmap = not
      redistributable; NASA VIIRS = CC0 but radiance, not sky-brightness.)
- [ ] UNDO / REDO across filter changes — on the roadmap since 2026-07-27.
      SHIPPED IN 1.19.0 IS ONE
      STEP ONLY: the toolbar Show all / Hide all button turns into "Restore"
      immediately after a bulk change and puts back the set it replaced, and the
      offer retires the moment any other filter changes so a stale set can never
      come back. That covers the case that actually stings — realising Hide all
      threw away a set you had built up. THE GENERAL THING is a small history
      stack over the whole filter state (pin types, layers, distance, search,
      hidden places) with undo and redo, which is a different shape: it needs a
      single funnel every filter change passes through (applyVisible /
      applyLayers / distance / search are separate today), a bounded stack, and
      a decision about whether hiding a PLACE belongs on the same stack as
      hiding a TYPE. Worth doing properly rather than bolting more one-step
      memories onto individual buttons.

- [ ] ACCESSIBILITY: convert type sizing from px to rem so the app honours the
      reader's DEFAULT FONT SIZE, not just page zoom. Settled 2026-07-26,
      after 1.15.1 fixed the place cards. MEASURED: styles.css carries 90
      `font-size: <n>px` declarations and ZERO rem/em. Page zoom scales px, so
      1.15.1 covers that path — but a reader who raises only their default font
      size (iOS Settings, or a desktop browser's minimum font size) gets NO
      change at all. WCAG 2.2 AA 1.4.4 is arguably met via zoom; the preference
      path is not, and that is the one a low-vision reader is most likely to
      have set.
      SHAPE OF THE WORK: set a root size, convert the 90 declarations to rem,
      and re-check every surface — the header, the filter chips, the list rows,
      the place cards and the dialogs — because the layouts were tuned against
      fixed sizes. scripts/smoke-cardfits.mjs already gates the cards across
      five viewports and would catch the worst regressions; the chips and list
      rows have no such gate yet and would need eyes.
      WHY IT IS NOT DONE YET: it touches every component at once, so it wants to
      be its own release with a full visual pass, not a change smuggled into a
      bug fix.
- [ ] Further candidates: public-lands (CPAD), HMdb markers, Flickr CC,
      "near me" geolocation.

## Architecture note — the synthesis signal contract (do not break)
model/synthesis.js SIGNALS is the extension point. To integrate a new data
source: (1) the ingest adapter writes its fact onto the spot (a tag, or a new
category, or proximity another signal can read); (2) append ONE signal
{key,label,weight,evaluate(spot,ctx)->{value,note}|null} that reads it. Never
edit scoreSpot for a new source. A signal returns null when it has no data for
a spot (absent, not zero). ctx gives you nearest(spot,category,m) and
lightFor(spot). The score denominator counts only LIVE signals, so shipping a
signal before its data exists is safe and encouraged.

## Measured gotchas (this repo)

- Session sandbox egress: Overpass 403s (all mirrors); run ingest on Actions
  runners. `node ingest/ingest.mjs probe` settles reachability in seconds.
- Overpass area queries key on `["admin_level"="6"]["name"="X County"]` —
  belt-and-braces bounded by the region bbox in the same query so a
  same-named county elsewhere can't leak in.
