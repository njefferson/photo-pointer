// photo-pointer — boot. One region, one map, every photo-worthy place on it.

import { el, clear, toast } from './ui/dom.js';
import { applyTheme, currentTheme, themeToggle } from './ui/theme.js';
import { createMapView, CATEGORY_META } from './ui/mapview.js';
import { loadRegion } from './model/region.js';
import { userPins, activeFilters, setActiveFilters, exportBundle, importBundle } from './model/store.js';
import { rankSpots } from './model/synthesis.js';
import { topSpotsPanel } from './ui/synthesis.js';

applyTheme(currentTheme());

const app = document.getElementById('app');
let mapView = null;
let dataSpots = [];
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
  const header = el('header', { class: 'bar' }, [
    el('h1', {}, region?.name ?? 'photo-pointer'),
    el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' }, [allToggle, ...chips]),
    el('div', { class: 'bar-actions' }, [
      el('button', { class: 'data-btn top-btn', onClick: openTopSpots }, '★ Top spots'),
      el('button', { class: 'data-btn', onClick: openDataDialog }, 'Backup'),
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
  const key = spots.length + ':' + userPins().length;
  if (rankingKey !== key) {
    rankingCache = rankSpots(spots);
    rankingKey = key;
  }
  return rankingCache;
}

function openTopSpots() {
  topSpotsPanel(ranking(), (spot) => mapView?.focusSpot(spot));
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

async function boot() {
  region = await loadRegion();
  renderHeader();

  const mapEl = el('main', { class: 'map-root', 'aria-label': 'Map of photo spots' });
  app.append(mapEl);
  mapView = createMapView(mapEl, { region, onChange: refresh });

  try {
    const res = await fetch('./data/spots.json', { cache: 'no-cache' });
    if (res.ok) {
      const doc = await res.json();
      dataSpots = doc.spots ?? [];
      dataBuiltAt = doc.builtAt ?? null;
    } else {
      toast('No spot data yet — run the ingest workflow');
    }
  } catch {
    toast('Spot data unavailable offline — showing your pins only');
  }
  refresh();

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
