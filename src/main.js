// photo-pointer — boot. One region, one map, every photo-worthy place on it.

import { el, clear, toast, closeOnBackdrop } from './ui/dom.js';
import { applyTheme, currentTheme, themeToggle } from './ui/theme.js';
import { createMapView, CATEGORY_META, CATEGORY_GROUPS, spotDisplayName } from './ui/mapview.js';
import { distanceM } from './model/geo.js';
import { loadRegions, pickRegion } from './model/region.js';
import { userPins, activeFilters, setActiveFilters, activeLayers, setActiveLayers, activeRegionId, setActiveRegionId, exportBundle, importBundle, hiddenSpots, hideSpot, unhideSpot, clearHidden, loadRankCache, saveRankCache } from './model/store.js';
import { rankSpots, buildContext, scoreSpot } from './model/synthesis.js';
import { LAYER_FILTERS } from './ui/synthesis.js';
import { maybeShowWelcome, maybeShowWhatsNew, openAbout } from './ui/install.js';
import { renderListInto } from './ui/listview.js';
import { keepSpot, refineCategory } from './model/notability.js';
import { buildCelestialEvents } from './model/events.js';
import { loadEnrichment, enrichSpots } from './model/enrichment.js';
import { VERSION } from './data/changelog.js';

applyTheme(currentTheme());

const app = document.getElementById('app');
let mapView = null;
let dataSpots = [];
let regionsDoc = null;
let region = null;
let viewMode = 'map';
let listEl = null;
let filtersOpen = false; // the filter chips are collapsed by default (mobile room)
let searchQuery = '';    // global name search — overrides the category/layer filters
let distanceMi = 0;      // 0 = any distance; else "within N miles of me"
let userLoc = null;      // ONE shared geolocation fix (distance filter + list sort)
let geoStatus = 'idle';  // 'idle' | 'locating' | 'ok' | 'denied'

// One geolocation fix, shared so the user is prompted at most once. Fails soft.
function ensureLocation(then) {
  if (userLoc) { then?.(); return; }
  if (geoStatus === 'locating') return;
  if (!navigator.geolocation) { geoStatus = 'denied'; then?.(); return; }
  geoStatus = 'locating';
  navigator.geolocation.getCurrentPosition(
    (pos) => { userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }; geoStatus = 'ok'; then?.(); },
    () => { geoStatus = 'denied'; then?.(); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
  );
}

function matchesSearch(spot) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  const name = (spot.name || spotDisplayName(spot) || '').toLowerCase();
  return name.includes(q);
}

// Within the chosen radius of the user. If no location yet, this is inert (shows
// everything) — the distance chips trigger a fix and re-apply; a denied fix keeps
// it inert with a note rather than hiding the whole map.
function withinDistance(spot) {
  if (!distanceMi || !userLoc) return true;
  return distanceM(userLoc, { lat: spot.lat, lng: spot.lng }) <= distanceMi * 1609.344;
}

function onFocusSpot(spot) {
  setViewMode('map');
  mapView?.focusSpot(spot);
}

// Switch between the map and the list (two views of the same region's spots).
function setViewMode(mode) {
  viewMode = mode;
  const mapRoot = app.querySelector('.map-root');
  if (mapRoot) mapRoot.style.display = mode === 'map' ? '' : 'none';
  if (listEl) listEl.style.display = mode === 'list' ? '' : 'none';
  if (mode === 'list') renderListView();
  renderHeader();
  // Leaflet caches its container size, and while the map is display:none that
  // cache goes to ZERO HEIGHT — so the viewport pass finds nothing in view and
  // the map comes back EMPTY (it looked exactly like a filter that only worked
  // in the list). Re-measure AFTER renderHeader, since the header shares the
  // flex column and therefore decides the map's height, and after a frame so the
  // browser has laid it out; then redo the viewport pass.
  if (mode === 'map') requestAnimationFrame(() => mapView?.resized());
}

function allCategories() {
  return new Set(Object.keys(CATEGORY_META));
}

// TWO filter dimensions, both persisted and both applied to the map AND the list
// (one filter, one place — not a separate popup):
//   currentVisible() = the pin-type toggles (viewpoint/park/…); default empty.
//   currentLayers()  = the "Must have" data-layer toggles (dark sky, public
//                      land, …); a spot must carry ALL of them to pass.
function currentVisible() {
  return activeFilters();
}
function currentLayers() {
  return activeLayers();
}

// Category toggle → persist + re-apply everywhere.
function applyVisible(v) {
  setActiveFilters(v);
  applyFilters();
}

// "Must have" layer toggle → persist + re-apply everywhere.
function applyLayers(v) {
  setActiveLayers(v);
  applyFilters();
}

// Push the current category + layer filters to both views. The map keeps its
// category toggles (setVisible) and, when layers are required, is further
// narrowed to the spots that pass BOTH (setSpotFilter); the list re-renders from
// the same filtered set. Called on every filter change and after data loads.
// Does a spot carry every "must have" layer the user turned on? (layers = a Set
// of required layer keys; lm = id → Set of the layers a spot actually has.)
function passesLayers(spot, layers, lm) {
  for (const k of layers) {
    if (!lm.get(spot.id)?.has(k)) return false;
  }
  return true;
}

function syncMapFilter() {
  // Search overrides the pin-type/layer/distance filters — a name match shows on
  // the map whatever its category (setSpotFilter overrides the category toggles).
  if (searchQuery.trim()) {
    const ids = new Set(spotsForMap().filter(matchesSearch).map((s) => s.id));
    mapView?.setSpotFilter(ids);
    return;
  }
  const cats = currentVisible();
  const layers = currentLayers();
  mapView?.setVisible(cats);
  if (layers.size || distanceMi) {
    const lm = layers.size ? layersById() : null;
    const ids = new Set(spotsForMap()
      .filter((s) => cats.has(s.category) && (!lm || passesLayers(s, layers, lm)) && withinDistance(s))
      .map((s) => s.id));
    mapView?.setSpotFilter(ids);
  } else {
    mapView?.setSpotFilter(null);
  }
}

function applyFilters() {
  syncMapFilter();
  renderListView();
  renderHeader();
}

// Update the two views WITHOUT re-rendering the header — so the search box keeps
// focus + caret while the user types. Header (counts, chips) refreshes on the
// next real filter change.
function refreshViews() {
  syncMapFilter();
  renderListView();
}

function renderHeader() {
  const visible = currentVisible();
  const layers = currentLayers();
  const allOn = visible.size === allCategories().size;
  const allToggle = el('button', {
    class: 'chip chip-all',
    onClick: () => applyVisible(allOn ? new Set() : allCategories()),
  }, allOn ? 'Hide all' : 'Show all');
  const chipFor = (cat, meta) =>
    el('button', {
      class: `chip chip-${cat}${visible.has(cat) ? ' on' : ''}`,
      'aria-pressed': String(visible.has(cat)),
      onClick: () => {
        const v = new Set(currentVisible());
        if (v.has(cat)) v.delete(cat);
        else v.add(cat);
        applyVisible(v);
      },
    }, [
      el('span', { class: `pin pin-${cat} pin-inline`, 'aria-hidden': 'true' }, meta.letter),
      ` ${meta.label}`,
      visible.has(cat) ? el('span', { class: 'chip-check', 'aria-hidden': 'true' }, '✓') : null,
    ]);
  // There are many pin types now, so they're sub-grouped (Landscape & water /
  // Historic / Parks & access / …) instead of one undifferentiated wall of chips.
  const entries = Object.entries(CATEGORY_META);
  const chipGroups = CATEGORY_GROUPS.map((g) => {
    const inGroup = entries.filter(([, m]) => m.group === g);
    if (!inGroup.length) return null;
    return el('div', { class: 'chip-subgroup' }, [
      el('span', { class: 'chip-subgroup-label' }, g),
      el('div', { class: 'chips', role: 'group', 'aria-label': g }, inGroup.map(([c, m]) => chipFor(c, m))),
    ]);
  }).filter(Boolean);
  // Data-layer filters — simple on/off "must have", the same behavior as the
  // pin-type chips (tap on, tap off). A spot passes only if it carries EVERY one
  // turned on. Kept in their own labeled row so it's clear they narrow the
  // pin types, not replace them.
  const counts = dataSpots.length ? layerCounts() : null;
  const layerChips = LAYER_FILTERS.map(([key, label]) => {
    const on = layers.has(key);
    // Coverage is per REGION: the ghost-town region has no Commons photo data at
    // all, so "Photographed" there can only ever return nothing. Say that on the
    // chip, in words, rather than letting it silently empty the map.
    const none = counts ? counts.get(key) === 0 : false;
    return el('button', {
      class: `chip layer-chip${on ? ' on' : ''}`,
      'aria-pressed': String(on),
      'aria-label': none
        ? `${label} — this region has no ${label} data yet`
        : `Only show places that also have ${label}`,
      onClick: () => {
        const s = new Set(currentLayers());
        if (s.has(key)) s.delete(key); else s.add(key);
        applyLayers(s);
      },
    }, [
      none ? `${label} · none here` : label,
      on ? el('span', { class: 'chip-check', 'aria-hidden': 'true' }, '✓') : null,
    ]);
  });
  // An active layer with no coverage here is THE reason the view is empty. Name
  // it, and give a one-tap way out — otherwise switching region silently wipes
  // everything and the app looks broken.
  const deadLayers = counts ? [...layers].filter((k) => counts.get(k) === 0) : [];
  const deadNote = deadLayers.length
    ? el('span', { class: 'layer-hint', role: 'status' }, [
        `This region has no ${deadLayers.map((k) => (LAYER_FILTERS.find(([x]) => x === k) ?? [, k])[1]).join(' or ')} data yet — nothing can match while that's on. `,
        el('button', {
          class: 'link-btn',
          onClick: () => applyLayers(new Set([...layers].filter((k) => !deadLayers.includes(k)))),
        }, 'Turn it off'),
      ])
    : null;
  const regionPills = (regionsDoc?.regions ?? []).map((r) =>
    el('button', {
      class: `region-pill${r.id === region?.id ? ' active' : ''}`,
      'aria-pressed': String(r.id === region?.id),
      onClick: () => { if (r.id !== region?.id) switchRegion(r.id); },
    }, r.name)
  );
  // Global name search — filters map + list by name, overriding the pin-type /
  // layer / distance filters (so you find a place even with its category off).
  // Typing does NOT re-render the header (refreshViews only), so focus is kept.
  const searchInput = el('input', {
    type: 'search', class: 'search-input', placeholder: 'Search places by name…',
    'aria-label': 'Search places by name', value: searchQuery, enterkeyhint: 'search',
  });
  const searchClear = el('button', {
    class: 'search-clear', type: 'button', 'aria-label': 'Clear search', hidden: !searchQuery,
  }, '×');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.hidden = !searchQuery;
    refreshViews();
  });
  searchClear.addEventListener('click', () => { searchQuery = ''; searchInput.value = ''; applyFilters(); });
  const searchRow = el('div', { class: 'search-row' }, [
    el('span', { class: 'search-icon', 'aria-hidden': 'true' }, '🔍'),
    searchInput,
    searchClear,
  ]);

  // "Within N miles of me" — narrows both views by distance, using the ONE shared
  // location fix. Tapping a radius triggers the fix and re-applies.
  const DISTANCES = [[0, 'Any distance'], [5, '5 mi'], [10, '10 mi'], [25, '25 mi'], [50, '50 mi']];
  const distChips = DISTANCES.map(([mi, label]) => el('button', {
    class: `chip dist-chip${distanceMi === mi ? ' on' : ''}`,
    'aria-pressed': String(distanceMi === mi),
    onClick: () => { distanceMi = mi; if (mi) ensureLocation(() => applyFilters()); applyFilters(); },
  }, [label, distanceMi === mi ? el('span', { class: 'chip-check', 'aria-hidden': 'true' }, '✓') : null]));
  const distHint = distanceMi && geoStatus === 'denied'
    ? el('span', { class: 'layer-hint', role: 'status' }, 'Location is off — turn it on to filter by distance.')
    : distanceMi && geoStatus === 'locating'
      ? el('span', { class: 'layer-hint', role: 'status' }, 'Finding your location…')
      : null;

  // The filter chips (categories + layers) are MANY, so they'd eat half a phone
  // screen. Keep them behind a labeled "Filters" toggle, collapsed by default, so
  // the map/list gets the room; a count shows how many filters are active.
  const activeCount = visible.size + layers.size + (distanceMi ? 1 : 0);
  const filtersToggle = el('button', {
    class: `data-btn filters-toggle${filtersOpen ? ' on' : ''}`,
    'aria-expanded': String(filtersOpen),
    'aria-controls': 'filters-panel',
    onClick: () => { filtersOpen = !filtersOpen; renderHeader(); },
  }, `Filters${activeCount ? ` (${activeCount})` : ''} ${filtersOpen ? '▲' : '▾'}`);

  // A layer only ever narrows the pin types that are showing, so if a layer is on
  // while every pin type is off, nothing can match — call that out instead of
  // leaving an empty map that looks broken.
  const layerButNoType = layers.size > 0 && visible.size === 0;
  const filtersPanel = filtersOpen
    ? el('div', { class: 'filters-panel', id: 'filters-panel' }, [
        el('div', { class: 'filter-group' }, [
          el('span', { class: 'filter-group-label' }, 'Show these place types'),
          el('div', { class: 'chips' }, [allToggle]),
          ...chipGroups,
        ]),
        el('div', { class: 'filter-group' }, [
          el('span', { class: 'filter-group-label' }, 'Only show places that also have…'),
          el('div', { class: 'layer-row', role: 'group', 'aria-label': 'Only show places that also have these data layers' }, layerChips),
          layerButNoType
            ? el('span', { class: 'layer-hint', role: 'status' }, 'Turn on a place type above too — a layer only narrows what’s already showing.')
            : deadNote,
        ]),
        el('div', { class: 'filter-group' }, [
          el('span', { class: 'filter-group-label' }, 'Within distance of me'),
          el('div', { class: 'layer-row', role: 'group', 'aria-label': 'Show only places within this distance of you' }, distChips),
          distHint,
        ]),
      ])
    : null;

  const header = el('header', { class: 'bar' }, [
    el('h1', { class: 'sr-only' }, `photo-pointer — ${region?.name ?? ''}`),
    regionPills.length > 1
      ? el('div', { class: 'regions', role: 'group', 'aria-label': 'Region' }, regionPills)
      : null,
    searchRow,
    el('div', { class: 'bar-actions' }, [
      filtersToggle,
      el('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Map or list view' }, [
        el('button', { class: `vt-btn${viewMode === 'map' ? ' on' : ''}`, 'aria-pressed': String(viewMode === 'map'), onClick: () => setViewMode('map') }, 'Map'),
        el('button', { class: `vt-btn${viewMode === 'list' ? ' on' : ''}`, 'aria-pressed': String(viewMode === 'list'), onClick: () => setViewMode('list') }, 'List'),
      ]),
      el('button', { class: 'data-btn icon-btn', 'aria-label': 'Backup & data', title: 'Backup', onClick: openDataDialog }, '⤓'),
      el('button', {
        class: 'data-btn icon-btn info-btn',
        'aria-label': 'About photo-pointer, install help and changelog',
        title: 'About & help',
        onClick: () => openAbout({ onShowAll: () => applyVisible(allCategories()) }),
      }, 'ⓘ'),
      themeToggle((theme) => mapView?.syncThemeBasemap(theme)),
      // BUILD STAMP, for screenshot troubleshooting. It carries the two things a
      // screenshot can't otherwise tell me: which app build is actually running
      // (a stale service worker will report the OLD version here, which is the
      // point), and how fresh the region's data is — a data-only ingest changes
      // what's on the map without moving the app version. The region itself is
      // already legible from the highlighted pill, so it isn't repeated.
      el('span', { class: 'ver-tag', title: 'App build · region data build' },
        `v${VERSION} · data ${dataBuiltAt ?? '—'}`),
    ]),
    filtersPanel,
    visible.size === 0 && !searchQuery.trim()
      ? el('p', { class: 'filter-tip', role: 'status' },
          filtersOpen
            ? 'Turn on at least one pin type above to see places. Sort the list by “Best” to see the top-scoring spots.'
            : 'Nothing is showing — tap Filters to choose what to see, or search by name above.')
      : null,
  ]);
  const old = app.querySelector('header');
  if (old) old.replaceWith(header);
  else app.prepend(header);
}

// Everything loaded for the region (data + user pins), hidden or not. The
// RANKING runs over this full set so hiding a spot never triggers a re-rank
// (an expensive full-region scan) — the score of other places doesn't change.
function allSpots() {
  return [...dataSpots, ...userPins()];
}

// The working set for the map + list: the loaded spots minus the user's hidden/
// blocked ones, so they're gone from every view.
function spotsForMap() {
  const hidden = hiddenSpots();
  return allSpots().filter((s) => !hidden.has(s.id));
}

// Block a place: it leaves every view. Undo via the toast, within its window.
function hideAndRefresh(spot) {
  hideSpot(spot.id);
  refresh();
  toast(`Hidden “${spot.name ?? 'this place'}” — tap to undo`);
  const t = document.querySelector('.toast');
  if (t) t.onclick = () => { unhideSpot(spot.id); t.onclick = null; t.classList.remove('show'); refresh(); };
}

// The spots the LIST should show: the same set the map shows — narrowed by BOTH
// the category toggles and the "Must have" layer toggles (user pins carry
// category 'user_pin', so they follow the 'My pins' toggle just like on the
// map). With every category off, this is empty and the list shows its "turn on a
// pin type" note, matching the map.
function spotsForList() {
  const all = spotsForMap();
  if (searchQuery.trim()) return all.filter(matchesSearch); // global by name
  const cats = currentVisible();
  const layers = currentLayers();
  const lm = layers.size ? layersById() : null;
  return all.filter((s) =>
    cats.has(s.category) && (!lm || passesLayers(s, layers, lm)) && withinDistance(s));
}

// Re-render the list (only when it's the visible view) from the current filters.
// scoreById feeds both the "Best" sort and each row's score badge.
function renderListView() {
  if (viewMode === 'list' && listEl) {
    renderListInto(listEl, {
      spots: spotsForList(), scoreById: scoreById(), onFocusSpot, onChange: refresh, onHide: hideAndRefresh,
      // Share the ONE geolocation fix so the list's Distance sort and the header's
      // distance filter never prompt twice.
      userLoc, geoStatus,
      onRequestLocation: () => ensureLocation(() => { renderListView(); renderHeader(); }),
      searchQuery: searchQuery.trim(),
    });
  }
}

let rankingCache = null;
let rankingKey = null;

// Cross-layer ranking over the current spot set. Recomputed only when the set
// changes (data + user pins), since it scans all spots.
// A signature that changes whenever the ranking would: the data build stamp, the
// spot counts, and the app version (so scoring-logic changes re-rank once).
function rankSig() {
  return `${VERSION}:${dataBuiltAt ?? ''}:${dataSpots.length}:${userPins().length}`;
}

function ranking() {
  const spots = allSpots(); // rank the FULL set — hiding a spot must not re-rank
  // Keyed on the loaded data, not the hidden-filtered set, so a hide/unhide
  // leaves the cache valid (hidden spots are dropped at display time instead).
  const key = `${region?.id}:${dataSpots.length}:${userPins().length}`;
  if (rankingKey === key) return rankingCache;
  const sig = rankSig();
  // The score is deterministic for a region build — reuse the persisted result so
  // a return visit doesn't re-rank (and re-sort) from scratch every time.
  const cached = loadRankCache(region?.id, sig);
  if (cached) {
    const byId = new Map(spots.map((s) => [s.id, s]));
    // `keys` is all the cache carries; the full breakdown (labels, notes) is
    // recomputed for the ONE spot whose card is open — see synthesisFor below.
    rankingCache = cached.map((c) => ({ spot: byId.get(c.id), score: c.score, parts: null, keys: c.keys ?? [] }))
      .filter((r) => r.spot);
    rankingKey = key;
    return rankingCache;
  }
  rankingCache = rankSpots(spots);
  rankingKey = key;
  // CACHE THE KEYS, NOT THE BREAKDOWN. Storing every spot's full parts — label
  // and note strings and all — made this a 1.37 MB synchronous localStorage
  // write on every region switch, out of a ~5 MB per-origin quota that has to
  // hold seven regions. Everything that reads the cache in bulk wants only the
  // score and which signals contributed; the human-readable breakdown is needed
  // for exactly one spot at a time, and costs nothing to recompute for one.
  saveRankCache(region?.id, sig, rankingCache.map((r) => ({
    id: r.spot.id, score: r.score, keys: r.parts.map((p) => p.key),
  })));
  return rankingCache;
}

// The human-readable breakdown for ONE spot. When the ranking came back from
// the cache it carries scores and signal keys but no labels or notes, so this
// recomputes them — for a single spot, which is all a card ever needs.
let breakdownCtx = null, breakdownCtxKey = null;
function breakdownFor(spot) {
  if (!spot) return null;
  const spots = allSpots();
  const key = `${region?.id}:${spots.length}`;
  if (breakdownCtxKey !== key) { breakdownCtx = buildContext(spots); breakdownCtxKey = key; }
  return scoreSpot(spot, breakdownCtx);
}

// Derived from the ranking, memoized alongside it: id → score (for the Best sort
// + row badge) and id → Set of layer keys the spot has (for the "Must have"
// filter). One scan, reused by the map filter and the list.
let rankMapsCache = null, rankMapsKey = null;
function rankMaps() {
  const ranked = ranking();
  if (rankMapsKey !== rankingKey) {
    const score = new Map(), layers = new Map();
    for (const r of ranked) {
      score.set(r.spot.id, r.score);
      layers.set(r.spot.id, new Set(r.keys ?? r.parts.map((p) => p.key)));
    }
    rankMapsCache = { score, layers };
    rankMapsKey = rankingKey;
  }
  return rankMapsCache;
}
// How many spots in THIS region actually carry each data layer. A layer with
// zero coverage here is not a filter that finds nothing — it is a filter that
// CANNOT find anything, and the two must not look the same to the user.
function layerCounts() {
  const lm = rankMaps().layers;
  const counts = new Map(LAYER_FILTERS.map(([k]) => [k, 0]));
  for (const set of lm.values()) {
    for (const k of set) if (counts.has(k)) counts.set(k, counts.get(k) + 1);
  }
  return counts;
}

function scoreById() { return rankMaps().score; }
function layersById() { return rankMaps().layers; }

// The pop-up shown on open when nothing is selected: says why the map is empty
// and offers a one-tap "Show all" so a new arrival is never staring at a blank.
function showStartTip() {
  const dlg = el('dialog', { class: 'tip-dialog' }, [
    el('h2', {}, 'Turn on a pin type to begin'),
    el('p', {}, 'The map opens with every category switched off, so it starts empty. Turn on at least one pin type — viewpoints, markers, parks, wildlife spots and more — to see places near you.'),
    el('div', { class: 'dialog-row' }, [
      el('button', {
        class: 'tip-primary',
        onClick: (e) => { applyVisible(allCategories()); e.target.closest('dialog').close(); },
      }, 'Show all pins'),
      el('button', {
        class: 'dialog-close',
        onClick: (e) => e.target.closest('dialog').close(),
      }, 'I’ll choose'),
    ]),
  ]);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnBackdrop(dlg);
  dlg.showModal();
}

function openDataDialog() {
  // "Hidden places" manager: list the blocked spots (names resolved from the
  // current region where possible), unhide one, or restore them all.
  const hiddenBox = el('div', { class: 'hidden-box' });
  const nameById = new Map(dataSpots.map((s) => [s.id, s.name]));
  function renderHidden() {
    // Most-recently hidden first (the block set preserves insertion order, so a
    // reverse gives newest → oldest), each recoverable with Unhide.
    const ids = [...hiddenSpots()].reverse();
    if (!ids.length) {
      hiddenBox.replaceChildren(el('p', { class: 'dim' },
        'Nothing hidden. Use “Hide this place” on any spot — on the map or in the list — to block it on this device.'));
      return;
    }
    hiddenBox.replaceChildren(
      el('p', {}, `${ids.length} place${ids.length === 1 ? '' : 's'} hidden on this device.`),
      el('ul', { class: 'hidden-list' }, ids.map((id) =>
        el('li', {}, [
          el('span', { class: 'hidden-name' }, nameById.get(id) ?? id),
          el('button', { class: 'hidden-unhide', onClick: () => { unhideSpot(id); refresh(); renderHidden(); } }, 'Unhide'),
        ])
      )),
      el('button', { class: 'dialog-close', onClick: () => { clearHidden(); refresh(); renderHidden(); toast('All hidden places restored'); } }, 'Restore all'),
    );
  }
  renderHidden();

  const dlg = el('dialog', { class: 'data-dialog' }, [
    el('button', { class: 'dialog-x', 'aria-label': 'Close', onClick: () => dlg.close() }, '×'),
    el('h2', {}, 'Backup & data'),
    el('p', {}, 'Your dropped pins and saved favorites live only on this device. Copy this bundle somewhere safe to back them up, or paste one to restore them on another device.'),
    el('textarea', { rows: 6, 'aria-label': 'Backup bundle JSON' }),
    el('div', { class: 'dialog-row' }, [
      el('button', {
        onClick: (e) => {
          const ta = e.target.closest('dialog').querySelector('textarea');
          ta.value = JSON.stringify(exportBundle());
          ta.select();
          toast('Backup ready — copy it somewhere safe');
        },
      }, 'Export pins & favorites'),
      el('button', {
        onClick: (e) => {
          const ta = e.target.closest('dialog').querySelector('textarea');
          let bundle = null;
          try {
            bundle = JSON.parse(ta.value);
          } catch {
            toast('That is not valid JSON');
            return;
          }
          const res = importBundle(bundle);
          toast(res.ok ? `Restored ${res.imported} pin(s) and ${res.favorites ?? 0} favorite(s)` : `Import failed: ${res.error}`);
          if (res.ok) refresh();
        },
      }, 'Import'),
    ]),
    el('h2', {}, 'Hidden places'),
    hiddenBox,
    el('h2', {}, 'Data sources'),
    el('ul', { class: 'src-list' }, [
      el('li', {}, 'Places: © OpenStreetMap contributors (ODbL)'),
      el('li', {}, 'Map tiles: © OpenStreetMap contributors · Imagery © Esri'),
      el('li', {}, `Region data built ${dataBuiltAt ?? '—'}`),
    ]),
    el('h2', {}, 'This app'),
    el('button', {
      onClick: (e) => { e.target.closest('dialog').close(); openAbout({ onShowAll: () => applyVisible(allCategories()) }); },
    }, 'About, install & changelog'),
    el('button', { class: 'dialog-close', onClick: (e) => e.target.closest('dialog').close() }, 'Close'),
  ]);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnBackdrop(dlg);
  dlg.showModal();
}

// The stamp's data date only becomes known after the region JSON lands, and the
// header is rendered BEFORE that — so patch the text in place rather than
// re-rendering the header, which would steal focus from the search box.
function updateVerTag() {
  const tag = app.querySelector('.ver-tag');
  if (tag) tag.textContent = `v${VERSION} · data ${dataBuiltAt ?? '—'}`;
}

function refresh() {
  updateVerTag();
  mapView?.setSpots(spotsForMap());
  const byId = new Map(ranking().map((r) => [r.spot.id, r]));
  mapView?.setSynthesis(byId, breakdownFor);
  syncMapFilter(); // setVisible + any "Must have" narrowing, from fresh ranking maps
  renderListView();
}

let dataBuiltAt = null;

// Load one region's committed spots. Fails soft (offline / not-yet-ingested).
async function loadRegionData(id) {
  dataSpots = [];
  dataBuiltAt = null;
  rankingKey = null; // force a re-rank for the new spot set
  try {
    const res = await fetch(`./data/regions/${id}.json`, { cache: 'no-cache' });
    if (res.ok) {
      const doc = await res.json();
      // Drop unverified OSM "historical marker" junk (see model/notability.js):
      // keep verified landmarks and any marker that carries other worthwhile data.
      // Keep the worthwhile spots, then split the broad 'oddity' bucket into
      // finer categories (ghost town / waterfall / hot spring / …) for filtering.
      dataSpots = enrichSpots((doc.spots ?? []).filter(keepSpot).map(refineCategory), await loadEnrichment());
      dataBuiltAt = doc.builtAt ?? null;
    } else {
      toast('No spot data for this region yet');
    }
  } catch {
    toast('Region data unavailable offline — showing your pins only');
  }
  // Computed sky events (meteor-shower peaks) — on-device, always current, no data
  // refresh needed. Added regardless of the fetch so they work offline too.
  if (region) dataSpots = dataSpots.concat(buildCelestialEvents(region));
}

async function switchRegion(id, { center = null } = {}) {
  region = pickRegion(regionsDoc, id);
  setActiveRegionId(region.id);
  renderHeader();
  await loadRegionData(region.id);
  // A manual pill tap fits the region; a GPS fix from another region centers there.
  mapView?.setRegion(region, { locate: false, center });
  refresh();
  // The chips were built BEFORE this region's spots arrived, so their per-layer
  // coverage was the previous region's. Rebuild them now that the data is here,
  // or "Dark sky · none here" never appears on a region that has no dark-sky
  // data — which is exactly the silent-empty-map case this is meant to catch.
  renderHeader();
  if (center) toast(`You're in the ${region.name} area — switched to that map`);
}

async function boot() {
  regionsDoc = await loadRegions();
  region = pickRegion(regionsDoc, activeRegionId() ?? regionsDoc.default);
  setActiveRegionId(region.id);
  renderHeader();

  // One persistent <main> landmark holds both views (map + list), so whichever
  // is shown, all content sits inside exactly one main landmark (a11y).
  const viewMain = el('main', { class: 'view-root', 'aria-label': 'Photo spots' });
  const mapEl = el('div', { class: 'map-root', 'aria-label': 'Map of photo spots' });
  listEl = el('div', { class: 'list-root', 'aria-label': 'List of photo spots in this region' });
  listEl.style.display = 'none';
  viewMain.append(mapEl, listEl);
  app.append(viewMain);
  mapView = createMapView(mapEl, {
    region,
    regions: regionsDoc.regions ?? [],
    onSwitchRegion: (id, center) => switchRegion(id, { center }),
    onChange: refresh,
    // The map's "Clear" on the layer-filter banner clears the layer chips at source.
    onClearFilter: () => applyLayers(new Set()),
    // "Hide this place" in a popup → block it everywhere, with an undo toast.
    onHideSpot: hideAndRefresh,
  });

  await loadRegionData(region.id);
  refresh();
  renderHeader(); // same reason as in switchRegion: coverage needs the data
  // Opening frame: geolocate on the home region, fit-bounds on the others.
  mapView.setRegion(region, { locate: region.id === regionsDoc.default });
  // Map + data are ready — drop the loading splash (geolocation refines after).
  app.querySelector('.app-loading')?.remove();

  // First open → welcome (what the app is + install, with a one-tap "Show all").
  // Otherwise, after an update → "What's new"; else, if the map is empty, the
  // small "turn on a pin type" nudge. At most one of these. (The header keeps a
  // quiet standing tip too, for after any is dismissed.)
  const welcomed = maybeShowWelcome({ onShowAll: () => applyVisible(allCategories()) });
  if (!welcomed) {
    const shownNew = maybeShowWhatsNew();
    if (!shownNew && currentVisible().size === 0) showStartTip();
  }

  setupServiceWorker();
}

// Service worker + SEAMLESS UPDATES. Before, a new version took TWO force-closes
// to appear: a relaunch got fresh index.html but the cached code modules updated
// only in the background, so it took a SECOND relaunch to actually run them.
// Now: the SW skips waiting + claims (sw.js), and when the new worker takes
// control we reload the page ONCE — so a single relaunch (or the "Check for
// updates" button) lands the new version. No more double-close.
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Was this page already controlled? If not, this is a first install — don't
  // reload on that initial claim (there's no "new version" to jump to).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js')
    .then((reg) => { reg.update().catch(() => {}); }) // check for a new SW on every open
    .catch(() => {});
}

boot().catch((e) => {
  clear(app);
  app.append(
    el('div', { class: 'boot-error' }, [
      el('h1', {}, 'photo-pointer could not start'),
      el('p', {}, String(e?.message ?? e)),
      el('p', {}, 'Reload to try again. If this keeps happening, the region config or data file is broken.'),
    ])
  );
});
