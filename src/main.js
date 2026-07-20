// photo-pointer — boot. One region, one map, every photo-worthy place on it.

import { el, clear, toast } from './ui/dom.js';
import { applyTheme, currentTheme, themeToggle } from './ui/theme.js';
import { createMapView, CATEGORY_META } from './ui/mapview.js';
import { loadRegions, pickRegion } from './model/region.js';
import { userPins, activeFilters, setActiveFilters, activeRegionId, setActiveRegionId, exportBundle, importBundle } from './model/store.js';
import { rankSpots } from './model/synthesis.js';
import { topSpotsPanel } from './ui/synthesis.js';
import { maybeShowWelcome, maybeShowWhatsNew, openAbout } from './ui/install.js';

applyTheme(currentTheme());

const app = document.getElementById('app');
let mapView = null;
let dataSpots = [];
let regionsDoc = null;
let region = null;

function allCategories() {
  return new Set(Object.keys(CATEGORY_META));
}

// The visible set is exactly what's stored — default empty (all categories off,
// Noah's call). Turning a category on adds it; the master toggle sets all/none.
function currentVisible() {
  return activeFilters();
}

function applyVisible(v) {
  setActiveFilters(v);
  mapView?.setVisible(v);
  renderHeader();
}

function renderHeader() {
  const visible = currentVisible();
  const allOn = visible.size === allCategories().size;
  const allToggle = el('button', {
    class: 'chip chip-all',
    onClick: () => applyVisible(allOn ? new Set() : allCategories()),
  }, allOn ? 'Hide all' : 'Show all');
  const chips = Object.entries(CATEGORY_META).map(([cat, meta]) =>
    el('button', {
      class: `chip chip-${cat}${visible.has(cat) ? ' on' : ''}`,
      'aria-pressed': String(visible.has(cat)),
      onClick: () => {
        const v = new Set(currentVisible());
        if (v.has(cat)) v.delete(cat);
        else v.add(cat);
        applyVisible(v);
      },
    }, [el('span', { class: `pin pin-${cat} pin-inline`, 'aria-hidden': 'true' }, meta.letter), ` ${meta.label}`])
  );
  const regionPills = (regionsDoc?.regions ?? []).map((r) =>
    el('button', {
      class: `region-pill${r.id === region?.id ? ' active' : ''}`,
      'aria-pressed': String(r.id === region?.id),
      onClick: () => { if (r.id !== region?.id) switchRegion(r.id); },
    }, r.name)
  );
  const header = el('header', { class: 'bar' }, [
    el('h1', { class: 'sr-only' }, `photo-pointer — ${region?.name ?? ''}`),
    regionPills.length > 1
      ? el('div', { class: 'regions', role: 'group', 'aria-label': 'Region' }, regionPills)
      : null,
    el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' }, [allToggle, ...chips]),
    visible.size === 0
      ? el('p', { class: 'filter-tip', role: 'status' },
          'Turn on at least one pin type above to see places on the map.')
      : null,
    el('div', { class: 'bar-actions' }, [
      el('button', { class: 'data-btn top-btn', onClick: openTopSpots }, '★ Top spots'),
      el('button', { class: 'data-btn', onClick: openDataDialog }, 'Backup'),
      el('button', {
        class: 'data-btn info-btn',
        'aria-label': 'About photo-pointer, install help and changelog',
        onClick: () => openAbout({ onShowAll: () => applyVisible(allCategories()) }),
      }, 'ⓘ'),
      themeToggle(),
    ]),
  ]);
  const old = app.querySelector('header');
  if (old) old.replaceWith(header);
  else app.prepend(header);
}

function spotsForMap() {
  return [...dataSpots, ...userPins()];
}

let rankingCache = null;
let rankingKey = null;

// Cross-layer ranking over the current spot set. Recomputed only when the set
// changes (data + user pins), since it scans all spots.
function ranking() {
  const spots = spotsForMap();
  const key = `${region?.id}:${spots.length}:${userPins().length}`;
  if (rankingKey !== key) {
    rankingCache = rankSpots(spots);
    rankingKey = key;
  }
  return rankingCache;
}

function openTopSpots() {
  topSpotsPanel(ranking(), (spot) => mapView?.focusSpot(spot));
}

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
  dlg.showModal();
}

function openDataDialog() {
  const dlg = el('dialog', { class: 'data-dialog' }, [
    el('h2', {}, 'Backup & data'),
    el('p', {}, 'Your pins live on this device. Copy this bundle somewhere safe to back them up, or paste one to restore.'),
    el('textarea', { rows: 6, 'aria-label': 'Backup bundle JSON' }),
    el('div', { class: 'dialog-row' }, [
      el('button', {
        onClick: (e) => {
          const ta = e.target.closest('dialog').querySelector('textarea');
          ta.value = JSON.stringify(exportBundle());
          ta.select();
          toast('Bundle ready — copy it somewhere safe');
        },
      }, 'Export my pins'),
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
          toast(res.ok ? `Restored ${res.imported} pin(s)` : `Import failed: ${res.error}`);
          if (res.ok) refresh();
        },
      }, 'Import'),
    ]),
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
  dlg.showModal();
}

function refresh() {
  mapView?.setSpots(spotsForMap());
  mapView?.setVisible(currentVisible());
  const byId = new Map(ranking().map((r) => [r.spot.id, r]));
  mapView?.setSynthesis(byId);
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
      dataSpots = doc.spots ?? [];
      dataBuiltAt = doc.builtAt ?? null;
    } else {
      toast('No spot data for this region yet');
    }
  } catch {
    toast('Region data unavailable offline — showing your pins only');
  }
}

async function switchRegion(id, { center = null } = {}) {
  region = pickRegion(regionsDoc, id);
  setActiveRegionId(region.id);
  renderHeader();
  await loadRegionData(region.id);
  // A manual pill tap fits the region; a GPS fix from another region centers there.
  mapView?.setRegion(region, { locate: false, center });
  refresh();
  if (center) toast(`You're in the ${region.name} area — switched to that map`);
}

async function boot() {
  regionsDoc = await loadRegions();
  region = pickRegion(regionsDoc, activeRegionId() ?? regionsDoc.default);
  setActiveRegionId(region.id);
  renderHeader();

  const mapEl = el('main', { class: 'map-root', 'aria-label': 'Map of photo spots' });
  app.append(mapEl);
  mapView = createMapView(mapEl, {
    region,
    regions: regionsDoc.regions ?? [],
    onSwitchRegion: (id, center) => switchRegion(id, { center }),
    onChange: refresh,
  });

  await loadRegionData(region.id);
  refresh();
  // Opening frame: geolocate on the home region, fit-bounds on the others.
  mapView.setRegion(region, { locate: region.id === regionsDoc.default });

  // First open → welcome (what the app is + install, with a one-tap "Show all").
  // Otherwise, after an update → "What's new"; else, if the map is empty, the
  // small "turn on a pin type" nudge. At most one of these. (The header keeps a
  // quiet standing tip too, for after any is dismissed.)
  const welcomed = maybeShowWelcome({ onShowAll: () => applyVisible(allCategories()) });
  if (!welcomed) {
    const shownNew = maybeShowWhatsNew();
    if (!shownNew && currentVisible().size === 0) showStartTip();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
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
