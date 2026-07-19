# LESSONS.md — what the sibling repos teach this one

Derived 2026-07-19 from a full read of the three existing repos:
**Bird-location-scouting** ("Frame", the bird-hotspot PWA), **clear-horizons**
(the astronomy planner PWA), and **Jefferson-Photography-Studio** (the IR/macro
RAW editor). This file is the contract for how photo-pointer is built so it
matches the established stack. Section (a) = conventions to carry forward,
section (b) = mistakes and rough edges to avoid repeating.

---

## (a) Conventions to carry forward

### Stack
- **Vanilla JavaScript, native ES modules, no build step, no framework.**
  Both map-adjacent apps (Frame, Clear Horizons) are served as-is —
  `<script type="module">` and relative imports; run locally with
  `python3 -m http.server`. TypeScript+Vite exists only in the photo *editor*
  (where a typecheck gate over 14k LOC of pixel math earns its keep). A map/POI
  app matches the Frame/Clear-Horizons shape → **no build step here.**
- **Node 22+ for scripts and tests** (`engines.node: ">=22"`, workflows pin
  `node-version: 22`). Tooling deps (`playwright-core`, `axe-core`) are
  installed ad hoc with `npm i --no-save`, never committed.
- **Vendor third-party runtime code, don't npm-install it** (Clear Horizons
  vendors astronomy-engine and Leaflet in `src/vendor/`). photo-pointer
  vendors Leaflet the same way, copied from clear-horizons.
- **Own tiny DOM helper** (`el()` hyperscript + `toast()` in `ui/dom.js`)
  instead of a framework — identical pattern in both PWAs.
- **All colors are `:root` CSS tokens with a `[data-theme="dark"]` override
  block** — restyle by swapping tokens, never hex-in-place. Theme applied
  pre-paint by an inline `<head>` boot script reading localStorage.

### Hosting / deploy
- **Cloudflare Pages** via `cloudflare/wrangler-action@v3`.
  `main` → production, `staging` → preview deployment. Concurrency group
  `deploy-${{ github.ref_name }}` with `cancel-in-progress: true`.
  Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **Branches: only `staging` and `main`, ever** (owner's standing order,
  re-stated for this repo 2026-07-19). Work lands on `staging` → owner's
  on-device pass → merge to `main`. Docs-only changes may skip the gate.
- **Workflows are dispatchable and push-to-trigger** — never ask the owner to
  click "Run workflow". MCP `actions_run_trigger` is the proven channel
  (the git relay drops `head_commit` metadata, so push-trigger guards can
  mis-skip; dispatch works every time).
- Repo **metadata (description, website, topics, social preview) is a manual
  GitHub-UI step** — the session token cannot write it (proven wall, Frame
  2026-07-17). List exact paste values and ask the owner to confirm.

### Data storage (the three-tier pattern, from Frame)
1. **Committed JSON in the repo is the durable, immutable store** for
   ingested data. Ingest runs on GitHub Actions runners, commits results,
   deploys. Data files carry `builtAt`; the ingest is deterministic-sorted so
   diffs are honest. History = free immutable backups.
2. **localStorage for user state**, all keys under one app prefix
   (`frame.*` / `horizon.*` → here `pointer.*`), every access in try/catch
   (private mode). `navigator.storage.persist()` requested the moment real
   user data exists (Clear Horizons: "measured data is precious data in
   evictable storage").
3. **Export/import JSON backup bundle** (Clear Horizons `exportBundle()`):
   versioned `{ app, version, exportedAt, ...state }`, validated on import.
   This is the user's durable backup for device-local data.
- IndexedDB only if large blobs ever need storing — and then **chunked
  ≤30 KB rows** (the Studio's measured iOS discovery: large IDB values live
  in a sidecar file that `durability:"strict"` does NOT cover; a crash after
  a "committed" write loses them).

### Service worker (identical hard-won pattern in both PWAs)
- Precache **per-asset via `Promise.allSettled`, never `cache.addAll`**
  (atomic addAll = one flaky request wipes the whole offline cache).
- `activate` **carries forward runtime-cached entries cache-to-cache** so a
  version bump never re-downloads data.
- Navigations network-first (fall back to cached index.html); everything
  else stale-while-revalidate; cache only `res.ok` (+ opaque Google Fonts);
  `clone()` before `put`.
- **Map tile hosts bypass the SW entirely** — opaque cross-origin tiles
  piped through a SW break on iOS WebKit in production while headless
  Chromium renders fine (Clear Horizons shipped that bug).

### Testing & verification
- **`node --test` unit tests** over pure model modules, zero deps
  (Clear Horizons: 21 test files, one per model module, ~0.7 s). Keep every
  model module DOM-free and node-safe so this stays possible.
- **Computed WCAG contrast gate** (`scripts/check-contrast.mjs`, exit 1 on
  FAIL) parsing the real tokens, run in CI. Contrast is computed, never
  eyeballed.
- **Headless Chromium smoke** via `playwright-core` (browser at
  `/opt/pw-browsers/chromium`), mocking all external hosts, failing on any
  pageerror; **skips cleanly when tooling absent** so CI stays green.
- **axe-core a11y scan** across views × both themes, with a
  justified-exception allowlist file.
- Discipline: make a new test fail once before trusting it; when a result
  looks absurd, suspect the instrument; state what was VERIFIED (headless)
  vs what NEEDS THE OWNER'S HANDS (real iPad/iPhone).

### Accessibility (owner mandate, fail-state not preference)
- **Hue-only encoding is broken the same as a crash.** Every visual encoding
  states its non-hue channel (glyph / shape / luminance step / text) at
  design time. Category map pins here carry a letter glyph, not just color.
- Text ≥ 4.5:1, non-text UI ≥ 3:1, both themes, enforced by the gate.
- Real `<button>`/`<dialog>`, ≥44 px targets, visible `:focus-visible` ring
  (never suppress outlines), `prefers-reduced-motion` honored, zoom never
  locked, keyboard path for everything the map does.

### Region/config architecture (Frame's proven shape)
- A **REGIONS config is the only place geography lives** — the app and the
  ingest scripts share it. Expanding coverage = config + data change, never
  code. (Frame went CA → Yosemite → Yellowstone this way; the multi-area
  `MAP_AREAS` pattern is the template if photo-pointer ever leaves one
  projection's worth of world.)
- Config modules are **node-safe** (no browser globals) so build scripts
  import the same file the app does.

### Data-ingest discipline (Frame's pipeline, battle-tested)
- **One module per source.** Each records its own license and honors it
  structurally (Frame stores Wikimedia-only thumbnails because eBird media
  is non-redistributable — the license decision lives in the adapter).
- **Sandbox egress is policy-filtered** — Overpass, Wikipedia, most APIs are
  unreachable from a session sandbox (verified again 2026-07-19: 403 CONNECT
  to four Overpass hosts). **Ingest therefore runs on Actions runners**,
  committing results. `raw.githubusercontent.com` and `registry.npmjs.org`
  are the known-reachable exceptions.
- **Probe before you build**: a 15-second `probe` command that verifies an
  endpoint answers with DATA (not an HTML login page) before any long run —
  and before handing the owner any manual step.
- Resume/partial-progress: skip already-built outputs unless `--force`;
  most-important items first so a mid-run failure still lands them; politeness
  delay between requests; abort on auth-failure responses rather than writing
  empty files over good ones.
- **Validate as a CI gate** (Frame's `validate` command exits 1 on any
  unresolvable name — typos can't ship).

### Docs & process
- `README.md` = pitch, why-it-exists, features, accessibility, **data &
  licensing table**, development, deploy/branches, maintainer notes.
- `NOTES.md` = source of truth: thesis, roadmap queue, settled decisions,
  measured gotchas. `CLAUDE.md` = standing behavioral rules. Record every
  shipped release in the facts/NOTES the moment it merges (the v18
  near-clobber happened because a finished candidate wasn't recorded).
- Changelogs and commit messages are written for the END USER.
- Never `AskUserQuestion`/choice popups — plain-text questions only
  (owner's absolute rule, 2026-07-17).
- The owner is iPad-first, often driving: one step at a time, no
  desktop-required steps unless every alternative is exhausted, no drafts —
  finished work only.

---

## (b) Mistakes and rough edges to avoid

- **The staging gap** (Clear Horizons' headline review finding): both
  workflows wired `staging`, but it was never created — 18 commits went
  straight to production, and a parallel session's work sat unmerged with a
  duplicated SW version. Create `staging` first, land everything there,
  check for a waiting candidate at the start of every session.
- **Don't leave a finished candidate invisible** — the moment work is
  staged, leave a durable "waiting on owner" signal (draft PR titled
  "awaiting on-device acceptance") so a later session can't rebuild it in
  parallel (Frame's v18 lesson).
- **Monolith drift**: the Studio's `main.ts` grew to 5,800 lines with an
  O(n²) hand-maintained tool-exclusion web. Keep modules small; model/ vs
  ui/ split from day one.
- **Entity/licensing claims must be verified, not assumed**: Clear Horizons
  shipped an overstated "no one else does this" claim and a wrong sensor
  spec that was right only by luck. Compute, don't guess — and for this
  repo especially: **a source's license terms are load-bearing facts**;
  read them before ingesting, encode them in the adapter.
- **Storage schema before the feature that stresses it**: Clear Horizons had
  to redo its fixed-36-bin horizon model right before sensor capture. Here:
  the `Spot` schema and `dedup_key` are settled FIRST, because every later
  source multiplies the cost of changing them.
- **iOS/WebKit landmines** (all measured, all real):
  - SVG fills rasterize by *element extent*, not visible sliver — a giant
    fill at deep zoom freezes the main thread ~8 s (Frame's v42 saga).
  - Opaque cross-origin tiles through a SW break on iOS only.
  - iOS swallows `pointerup` — document-level pointer cleanup or gestures
    wedge forever.
  - SVG pointer capture redirects native clicks — resolve map taps in
    `pointerup` via `elementFromPoint`, never per-pin click handlers.
  - Native `replaceChildren`/`append` stringify `null` into a literal
    "null" text node — `.filter(Boolean)` before spreading.
  - Never write sizing CSS vars per frame; only the viewBox/transform is a
    per-frame write.
  - `<datalist>` is unusable on iOS (popup fights the keyboard) — in-app
    combobox instead.
- **Playwright gotchas**: `waitForFunction` does NOT await Promise
  predicates (a Promise is truthy — the poll "passes" instantly); poll
  synchronous DOM state. Full history (`fetch-depth: 0`) if anything derives
  from commit counts.
- **Cookie/credential automation is a wall, not a hill**: eBird's ToS
  forbids stored-credential login automation (settled, don't re-offer).
  Design ingest so perishable auth is never load-bearing: keyless/public
  sources first (Overpass, iNaturalist), API-key sources behind repo
  secrets, and store *everything* a fetch returns so re-curation never
  needs a re-fetch (Frame's full-taxonomy lesson).
- **Cache-correctness details that bit before**: only cache `res.ok`
  (cache-first replays a cached 500 forever); clone before returning (a fast
  connection loses the clone race); exclude `_headers`/`_redirects` from
  precache manifests.
- **GitHub Actions details**: `workflow_dispatch` needs the workflow file on
  the *default* branch to be dispatchable on another ref; one queued run per
  concurrency group (dispatching a new run cancels a queued one); branch
  names in workflow conditions are case-sensitive.
- **Don't re-implement what a sibling repo already committed**: Frame's repo
  already holds full-depth eBird hotspot JSON for Sacramento, El Dorado, and
  Placer counties (`frame/data/counties/US-CA-067|017|061.json`) — the
  wildlife adapter here can start from that committed data rather than
  re-fetching eBird.
