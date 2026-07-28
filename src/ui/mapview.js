// The map. Leaflet (vendored, BSD-2-Clause) over raster tiles.
// Category pins carry a LETTER GLYPH — meaning never rides on hue alone.

import * as L from '../vendor/leaflet.js';
import { el, toast } from './dom.js';
import { addUserPin, removeUserPin, restoreUserPin, isFavorite, toggleFavorite, noteFor, setNote } from '../model/store.js';
import { sunTimesFor, compass, clock } from '../model/light.js';
import { moonTonight, milkyWayTonight } from '../model/tonight.js';
import { cloudTonight } from '../model/weather.js';
import { airToday } from '../model/airquality.js';
import { tidesToday, formatTides } from '../model/tides.js';
import { flowNow, formatFlow } from '../model/streamflow.js';
import { nextOccurrence, formatEventWhen } from '../model/events.js';
import { synthesisBreakdown } from './synthesis.js';
import { loadLightLayer } from './lightlayer.js';
import { inBBox, bboxCenter } from '../model/geo.js';
import { notableReasons } from '../model/notability.js';

// If a GPS fix lands outside the covered region, drop the user in the middle of
// the map's world instead — Cameron Park, in El Dorado County (Noah's call).
export const FALLBACK_CENTER = { lat: 38.6785, lng: -120.9872, name: 'Cameron Park, CA' };

// Every pin type, its label, its letter/glyph (the NON-HUE channel — with this
// many types the colours can't stay perceptually distinct, so the glyph carries
// the meaning and colour only reinforces), and the filter group it lives under.
export const CATEGORY_META = {
  // — Landscape & water —
  viewpoint: { label: 'Viewpoint', letter: 'V', group: 'Landscape & water' },
  summit: { label: 'Peak / summit', letter: '▲', group: 'Landscape & water' },
  waterfall: { label: 'Waterfall', letter: 'F', group: 'Landscape & water' },
  hot_spring: { label: 'Hot spring', letter: 'S', group: 'Landscape & water' },
  cave: { label: 'Cave', letter: 'K', group: 'Landscape & water' },
  arch: { label: 'Natural arch', letter: '∩', group: 'Landscape & water' },
  notable_tree: { label: 'Notable tree', letter: 'Y', group: 'Landscape & water' },
  // — Historic —
  historic_site: { label: 'Historic site', letter: 'H', group: 'Historic' },
  marker: { label: 'Historical marker', letter: 'M', group: 'Historic' },
  archaeological: { label: 'Archaeological site', letter: '◆', group: 'Historic' },
  ghost_town: { label: 'Ghost town', letter: 'G', group: 'Historic' },
  ruins: { label: 'Ruins', letter: 'R', group: 'Historic' },
  mine: { label: 'Mine', letter: 'X', group: 'Historic' },
  shipwreck: { label: 'Shipwreck', letter: '≈', group: 'Historic' },
  lighthouse: { label: 'Lighthouse', letter: 'L', group: 'Historic' },
  lookout_tower: { label: 'Lookout tower', letter: 'I', group: 'Historic' },
  // — Parks & access —
  park: { label: 'Park', letter: 'P', group: 'Parks & access' },
  nature_reserve: { label: 'Nature reserve', letter: 'N', group: 'Parks & access' },
  trailhead: { label: 'Trailhead', letter: 'T', group: 'Parks & access' },
  campsite: { label: 'Campsite', letter: 'C', group: 'Parks & access' },
  // — Wildlife, art & events —
  wildlife_hotspot: { label: 'Wildlife hotspot', letter: 'W', group: 'Wildlife, art & events' },
  // Found by photo density rather than by any catalogue — see ingest
  // commons-clusters. The glyph is a lens, which is literally what it means.
  photo_cluster: { label: 'Photographed place', letter: '◎', group: 'Wildlife, art & events' },
  public_art: { label: 'Art & murals', letter: 'A', group: 'Wildlife, art & events' },
  oddity: { label: 'Attraction', letter: 'O', group: 'Wildlife, art & events' },
  event: { label: 'Event', letter: 'E', group: 'Wildlife, art & events' },
  user_pin: { label: 'My pins', letter: '★', group: 'Wildlife, art & events' },
};

// The filter groups, in display order.
export const CATEGORY_GROUPS = ['Landscape & water', 'Historic', 'Parks & access', 'Wildlife, art & events'];

// A display name for a spot. Unnamed spots survive the notability filter only
// when people photograph them (Commons photos nearby), so say THAT plainly
// instead of "(unnamed oddity)" — they're a cluster of photos, not a named
// curiosity. Falls back to a plain "Unnamed <type>" otherwise.
export function spotDisplayName(spot) {
  if (spot.name) return spot.name;
  if (spot.tags?.commons?.photos) return 'A photographed spot';
  const meta = CATEGORY_META[spot.category];
  return meta ? `Unnamed ${meta.label.toLowerCase()}` : 'Unnamed spot';
}

// Tile hosts MUST also be listed in sw.js TILE_HOSTS (SW bypasses them —
// opaque cross-origin tiles through a SW break on iOS WebKit).
const BASE_LAYERS = () => ({
  // The OSM base carries a class so dark mode can darken it with a CSS filter —
  // reliable and offline-friendly (works on already-cached tiles), unlike an
  // external dark-tile provider that can be blocked or unreachable.
  Map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'basemap-osm',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  Satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Imagery &copy; Esri' }
  ),
});

function pinIcon(category, hasPhotos) {
  const meta = CATEGORY_META[category] ?? { letter: '?' };
  const cls = `pin pin-${category}${hasPhotos ? ' has-photos' : ''}`;
  const label = `${meta.label ?? category}${hasPhotos ? ', photos available' : ''}`;
  return L.divIcon({
    className: '',
    html: `<span class="${cls}" role="img" aria-label="${label}">${meta.letter}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

export function createMapView(container, { region, regions = [], onSwitchRegion, onChange, onClearFilter, onHideSpot }) {
  const map = L.map(container, { zoomControl: true });
  let activeRegion = region;

  // The center to fall back to when GPS is outside the active region. Cameron
  // Park for the home region (Noah's call); the region's middle otherwise.
  function fallbackCenter() {
    if (activeRegion.id === 'sac-eldorado-placer') return { lat: FALLBACK_CENTER.lat, lng: FALLBACK_CENTER.lng, name: FALLBACK_CENTER.name };
    const c = bboxCenter(activeRegion.bbox);
    return { lat: c.lat, lng: c.lng, name: activeRegion.name };
  }

  // Open a region. If it declares a preferred `center` (e.g. Humboldt opens on
  // Arcata), start there; otherwise fit the whole region's bounds in view.
  function frameRegion() {
    const c = activeRegion.center;
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
      map.setView([c.lat, c.lng], c.zoom ?? 12);
      return;
    }
    const b = activeRegion.bbox;
    map.fitBounds([[b.south, b.west], [b.north, b.east]]);
  }

  // Which covered region (other than the active one) contains these coords?
  // Lets a GPS fix land in Humboldt or Yellowstone instead of failing home.
  function regionContaining(coords) {
    if (!coords) return null;
    for (const r of regions) {
      if (r.id !== activeRegion.id && inBBox(coords.lat, coords.lng, r.bbox)) return r;
    }
    return null;
  }

  // Ask the browser for a fix and act on it. In order: center here if the fix is
  // in the active region; else if it falls in ANOTHER covered region, switch to
  // that region and center there; else drop on the fallback. Fails soft — a
  // denied/blocked/timed-out fix just leaves the fallback view. `onDone` reports
  // the outcome so the caller can toast only when the fix is outside every region.
  function centerOnLocation(onDone) {
    const fb = fallbackCenter();
    const act = (coords) => {
      if (coords && inBBox(coords.lat, coords.lng, activeRegion.bbox)) {
        map.setView([coords.lat, coords.lng], 14);
        onDone?.({ lat: coords.lat, lng: coords.lng, inArea: true, name: activeRegion.name });
        return;
      }
      const other = regionContaining(coords);
      if (other) {
        // Hand off to main.js: load that region's data, then center on the fix.
        onSwitchRegion?.(other.id, { lat: coords.lat, lng: coords.lng });
        onDone?.({ lat: coords.lat, lng: coords.lng, inArea: true, switched: other.name, name: other.name });
        return;
      }
      map.setView([fb.lat, fb.lng], 12);
      onDone?.({ ...fb, inArea: false });
    };
    if (!navigator.geolocation) { act(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => act({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => act(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  // Switch the active region: re-frame the map. `locate` (home-region boot) also
  // tries geolocation; a manual switch just fits the new region's bounds; a
  // `center` (from a cross-region GPS fix) drops straight onto that point.
  function setRegion(newRegion, { locate = false, center = null } = {}) {
    activeRegion = newRegion;
    // Ids belong to the old region — drop any focus/filter so they can't leak.
    forcedId = null;
    if (spotFilter) setSpotFilter(null);
    loadDarkSkyFor(newRegion.id);
    if (center) map.setView([center.lat, center.lng], 14);
    else if (locate) centerOnLocation((c) => { if (!c.inArea) toast(`You're outside the covered area — centered on ${c.name}`); });
    else frameRegion();
  }

  // Opening view: start on the fallback center, refined by geolocation below.
  { const fb = fallbackCenter(); map.setView([fb.lat, fb.lng], 12); }

  // A crosshair "center on me" button, next to the zoom control.
  const CenterControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'map-center-btn');
      btn.type = 'button';
      btn.textContent = '◎';
      btn.title = 'Center on my location';
      btn.setAttribute('aria-label', 'Center on my location');
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.stop(e);
        centerOnLocation((c) => {
          if (!c.inArea) toast(`You're outside the covered area — centered on ${c.name}`);
        });
      });
      return btn;
    },
  });
  new CenterControl().addTo(map);

  // A collapsible legend: what every pin means. Collapsed to a "Legend" button
  // by default (keeps the map clean); expands to the category letters+colours,
  // the gold ring (photos nearby) and the neutral number circle (a cluster).
  const LegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'map-legend');
      const panel = el('div', { class: 'legend-panel', id: 'legend-panel', hidden: true });
      const btn = el('button', {
        type: 'button', class: 'legend-toggle',
        'aria-expanded': 'false', 'aria-controls': 'legend-panel',
        onClick: () => {
          const open = panel.hidden;
          panel.hidden = !open;
          btn.setAttribute('aria-expanded', String(open));
          btn.textContent = open ? 'Legend ▾' : 'Legend ▸';
        },
      }, 'Legend ▸');
      const row = (swatch, label) => el('div', { class: 'legend-row' }, [swatch, el('span', { class: 'legend-label' }, label)]);
      for (const [cat, meta] of Object.entries(CATEGORY_META)) {
        panel.append(row(
          el('span', { class: `pin pin-${cat} pin-inline`, 'aria-hidden': 'true' }, meta.letter),
          meta.label
        ));
      }
      panel.append(el('div', { class: 'legend-sep', role: 'separator' }));
      panel.append(row(
        el('span', { class: 'pin pin-viewpoint legend-swatch has-photos', 'aria-hidden': 'true' }, 'V'),
        'Gold ring: freely-licensed photos nearby'
      ));
      panel.append(row(
        el('span', { class: 'pin is-cluster legend-swatch', 'aria-hidden': 'true' }, '3'),
        'Number: several places here — tap to zoom in'
      ));
      panel.append(el('p', { class: 'legend-hint' }, 'Tip: press and hold the map (right-click on a computer) to drop your own pin.'));
      wrap.append(btn, panel);
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      return wrap;
    },
  });
  new LegendControl().addTo(map);

  // Standing banner shown while a Top-spots layer filter narrows the map — the
  // mode announces itself and carries an obvious one-tap exit. Lives inside the
  // Leaflet container so it overlays the map; clicks don't fall through to a pan.
  const filterBanner = el('div', { class: 'map-filter-banner', role: 'status', hidden: true });
  L.DomEvent.disableClickPropagation(filterBanner);
  container.append(filterBanner);
  function updateFilterBanner() {
    if (!spotFilter) { filterBanner.hidden = true; filterBanner.replaceChildren(); return; }
    const n = spotFilter.size;
    filterBanner.hidden = false;
    filterBanner.replaceChildren(
      el('span', { class: 'mfb-text' }, n === 0
        ? 'No places match your filters'
        : `${n} place${n === 1 ? '' : 's'} match your filters`),
      el('button', {
        class: 'map-filter-clear',
        // Clear the layer filters at the source (the header chips) so the map and
        // the filter bar stay in sync; fall back to just dropping the map filter.
        onClick: () => { if (onClearFilter) onClearFilter(); else { setSpotFilter(null); onChange?.(); } },
      }, 'Clear')
    );
  }

  // The opening frame (geolocate on the home region, fit-bounds elsewhere) is
  // driven by main.js via setRegion once data is ready.

  const bases = BASE_LAYERS();
  bases.Map.addTo(map);
  const layerControl = L.control.layers(bases, {}, { position: 'topright' }).addTo(map);
  // Dark mode is handled by a CSS filter on the OSM tiles (see .basemap-osm),
  // so no JS basemap swap and no external tile provider is needed.
  function syncThemeBasemap() { /* CSS-driven now; kept for the caller */ }

  // Dark-sky overlay — per region, so it swaps when you switch regions. Loaded
  // async; a region without the layer simply gets none. Its legend shows only
  // while the overlay is on.
  let darkLayer = null;
  function loadDarkSkyFor(regionId) {
    if (darkLayer) {
      layerControl.removeLayer(darkLayer.overlay);
      map.removeLayer(darkLayer.overlay);
      map.removeControl(darkLayer.legend);
      darkLayer = null;
    }
    loadLightLayer(regionId).then((lp) => {
      if (!lp || activeRegion.id !== regionId) return;
      darkLayer = lp;
      layerControl.addOverlay(lp.overlay, lp.name);
      map.on('overlayadd', (e) => { if (e.layer === lp.overlay) lp.legend.addTo(map); });
      map.on('overlayremove', (e) => { if (e.layer === lp.overlay) map.removeControl(lp.legend); });
    });
  }
  loadDarkSkyFor(activeRegion.id);

  // id -> { marker, category, lat, lng, mounted }. Markers are CREATED once but
  // only mounted on the map while in a visible category AND within the padded
  // view — "map trimming", so a dense region keeps only the on-screen pins in
  // the DOM (mirrors Frame's virtualization).
  const markerById = new Map();
  let visible = new Set(Object.keys(CATEGORY_META));
  // A spot deliberately focused from the Top-spots panel: always mounted and
  // never collapsed into a cluster, so it's visible the moment you fly to it.
  let forcedId = null;
  // A Top-spots layer filter, when active, restricts the map to these spot ids
  // (overriding the category toggles). null = no filter, category toggles rule.
  let spotFilter = null;

  const padded = () => map.getBounds().pad(0.35);
  const CELL_PX = 40; // declutter grid: at most one pin per ~40px cell in view
  function cull() {
    const b = padded();
    // 1) Gather the in-view candidates; unmount everything else. A candidate is
    //    in a shown category (or, when a Top-spots filter is active, in that
    //    filter set), plus the deliberately-focused spot is always a candidate.
    const cands = [];
    for (const rec of markerById.values()) {
      const catOk = rec.id === forcedId ||
        (spotFilter ? (spotFilter.has(rec.id) || rec.category === 'user_pin') : visible.has(rec.category));
      const inView = catOk && b.contains([rec.lat, rec.lng]);
      if (inView) cands.push(rec);
      else if (rec.mounted) { rec.marker?.remove(); rec.mounted = false; }
    }
    // 2) Declutter: keep the best pin per screen-grid cell. The grid is in PIXELS,
    //    so zoomed out a cell covers lots of ground (few pins) and zoomed in each
    //    pin gets its own cell (all show). Fewer mounted nodes than before → no
    //    lag. User pins always survive; otherwise the higher-scoring pin wins.
    cands.sort((a, c) => scoreOf(c) - scoreOf(a));
    // How many candidates fall in each cell — the kept pin shows "+N" for the
    // rest, so a decluttered map clearly signals there's more to zoom into.
    const keyOf = new Map();
    const cellCount = new Map();
    const cellMembers = new Map(); // key → the recs in that cell, so a tap can frame them
    for (const rec of cands) {
      if (rec.category === 'user_pin' || rec.id === forcedId) continue;
      const pt = map.latLngToContainerPoint([rec.lat, rec.lng]);
      const key = `${Math.floor(pt.x / CELL_PX)}:${Math.floor(pt.y / CELL_PX)}`;
      keyOf.set(rec, key);
      cellCount.set(key, (cellCount.get(key) || 0) + 1);
      (cellMembers.get(key) ?? cellMembers.set(key, []).get(key)).push(rec);
    }
    const taken = new Set();
    for (const rec of cands) {
      const key = keyOf.get(rec);
      const keep = rec.category === 'user_pin' || rec.id === forcedId || !taken.has(key);
      if (keep && key) taken.add(key);
      if (keep && !rec.mounted) { ensureMarker(rec).addTo(map); rec.mounted = true; }
      else if (!keep && rec.mounted) { rec.marker?.remove(); rec.mounted = false; }
      if (keep) {
        const cnt = key ? cellCount.get(key) : 1;
        setClusterState(rec, cnt);
        // Remember what this pin stands for, so tapping it can zoom to reveal them.
        rec.clusterCount = cnt;
        rec.clusterMembers = cnt > 1 ? cellMembers.get(key) : null;
      }
    }
  }
  // When a pin stands in for several under it, turn it into a COMPLETELY NEUTRAL
  // circle showing the count; otherwise restore the category pin. The number
  // carries the meaning (not colour), and the marker announces the count.
  function setClusterState(rec, total) {
    const pin = rec.marker?._icon?.querySelector?.('.pin');
    if (!pin) return;
    if (total > 1) {
      pin.classList.add('is-cluster');
      const txt = total > 99 ? '99+' : String(total);
      if (pin.textContent !== txt) pin.textContent = txt;
      pin.setAttribute('aria-label', `${total} places here — activate to zoom in`);
    } else if (pin.classList.contains('is-cluster')) {
      pin.classList.remove('is-cluster');
      pin.textContent = rec.letter;
      pin.setAttribute('aria-label', rec.label);
    }
  }
  // Tap a summary (cluster) pin → zoom the map in until the places under it
  // spread apart. Frames the cluster's members; the resulting moveend re-runs
  // cull(), which drops them into their own grid cells so they separate. If
  // they're too close to split even at the tightest fit, fall back to opening the
  // top place's card so the tap still does something.
  function zoomToCluster(rec) {
    const members = rec.clusterMembers || [];
    if (members.length < 2) { rememberViewForPopup(); const m = ensureMarker(rec); sizePopup(m); m.openPopup(); return; }
    const bounds = L.latLngBounds(members.map((m) => [m.lat, m.lng]));
    if (map.getBoundsZoom(bounds, false, L.point(50, 50)) <= map.getZoom()) {
      rememberViewForPopup();
      const m = ensureMarker(rec);
      sizePopup(m);
      m.openPopup();
      return;
    }
    map.fitBounds(bounds, { padding: [50, 50], animate: true });
  }
  function scoreOf(rec) { return synthesisFor(rec.id)?.score ?? 0; }
  let cullPending = false;
  function scheduleCull() {
    if (cullPending) return;
    cullPending = true;
    requestAnimationFrame(() => { cullPending = false; cull(); });
  }
  map.on('moveend zoomend', scheduleCull);

  // Opening a popup autoPans the map to fit the card, but Leaflet never pans
  // back — leaving the user shifted after they close it. Remember the view just
  // before a popup opens and restore it when the LAST popup closes, unless the
  // user deliberately dragged while it was open.
  let popupSavedCenter = null;
  // When a spot is deliberately focused (Top-spots panel), we WANT to stay on it
  // after its popup closes — so instead of restoring the old view, recenter here.
  let focusCenter = null;
  let openPopups = 0;
  // A manual marker tap is a fresh intent: save the view to restore, and cancel
  // any pending "recenter on the focused spot" (this isn't that spot).
  function rememberViewForPopup() {
    if (openPopups === 0) popupSavedCenter = map.getCenter();
    focusCenter = null;
    forcedId = null;
  }
  map.on('popupopen', (e) => {
    openPopups += 1;
    // HOLD THE OPEN CARD'S PIN. Leaflet auto-pans to fit a popup, that fires
    // moveend → cull(), and the 40px declutter grid shifts underneath — if this
    // pin then loses its cell to a higher-scoring neighbour it gets unmounted
    // and its open popup goes with it. That read as a card that "opens and
    // immediately collapses", and only on pins that happened to lose the cell.
    // forcedId already protects a spot reached from the LIST; a tap on the map
    // is just as deliberate, so it earns the same protection.
    const id = e.popup._source?.__spotId;
    if (id != null) forcedId = id;
    // Open scrolled to the TOP (name/why first), not wherever a tall card landed.
    const c = e.popup.getElement()?.querySelector('.leaflet-popup-content');
    if (c) c.scrollTop = 0;
  });
  map.on('dragstart', () => { popupSavedCenter = null; focusCenter = null; });
  map.on('popupclose', () => {
    openPopups = Math.max(0, openPopups - 1);
    // Defer so a popup-to-popup switch (close then open) doesn't restore between.
    setTimeout(() => {
      if (openPopups !== 0) return;
      // The card is gone, so stop holding its pin out of the declutter grid.
      if (forcedId != null) { forcedId = null; cull(); }
      if (focusCenter) {
        // Deliberate focus: keep the map on the spot the user chose.
        map.panTo(focusCenter, { animate: true });
        focusCenter = null;
        popupSavedCenter = null;
      } else if (popupSavedCenter) {
        map.panTo(popupSavedCenter, { animate: true });
        popupSavedCenter = null;
      }
    }, 0);
  });
  let synthesisFor = () => null; // set by setSynthesis; id -> {score, parts|keys}
  let breakdownFor = null;       // set by setSynthesis; spot -> {score, parts}

  // "Light today" — the question the app is named for, computed on-device for
  // this spot and this date. A row per window; each carries a text label (not
  // color) and the sun's compass direction where it helps frame the shot.
  function lightSection(spot) {
    let t;
    try {
      t = sunTimesFor(spot.lat, spot.lng);
    } catch {
      return null;
    }
    const rows = [];
    const row = (label, w, extra) =>
      w ? el('tr', {}, [
        el('th', { scope: 'row' }, label),
        el('td', {}, `${clock(w.start)} – ${clock(w.end)}`),
        el('td', { class: 'light-dir' }, extra ?? ''),
      ]) : null;

    if (t.polar) {
      return el('div', { class: 'light-box' }, [
        el('h3', {}, 'Light today'),
        el('p', { class: 'light-polar' }, 'The sun stays up (or down) all day at this latitude today.'),
      ]);
    }
    const sunriseDir = compass(t.sunriseAzimuth);
    const sunsetDir = compass(t.sunsetAzimuth);
    rows.push(row('Blue hour', t.blueMorning));
    rows.push(row('Golden hour', t.goldenMorning, sunriseDir ? `sun rises ${sunriseDir}` : ''));
    rows.push(
      t.sunrise
        ? el('tr', { class: 'light-mark' }, [
            el('th', { scope: 'row' }, 'Sunrise'),
            el('td', {}, clock(t.sunrise)),
            el('td', { class: 'light-dir' }, sunriseDir ?? ''),
          ])
        : null
    );
    rows.push(
      t.sunset
        ? el('tr', { class: 'light-mark' }, [
            el('th', { scope: 'row' }, 'Sunset'),
            el('td', {}, clock(t.sunset)),
            el('td', { class: 'light-dir' }, sunsetDir ?? ''),
          ])
        : null
    );
    rows.push(row('Golden hour', t.goldenEvening, sunsetDir ? `sun sets ${sunsetDir}` : ''));
    rows.push(row('Blue hour', t.blueEvening));

    const h = spot.tags?.horizon;
    const horizonNote = h && h.open != null
      ? el('p', { class: 'light-horizon' },
          `Land horizon: sun clears ${h.e ?? '?'}° in the east, ${h.w ?? '?'}° in the west` +
          ' (from terrain — trees not counted)')
      : null;

    return el('div', { class: 'light-box' }, [
      el('h3', {}, 'Light today'),
      el('table', { class: 'light-table' }, [
        el('tbody', {}, rows.filter(Boolean)),
      ]),
      horizonNote,
    ]);
  }

  // "Tonight" — moon + the Milky-Way dark window (on-device), plus a live
  // clear-sky check (Open-Meteo). The payoff of the Bortle layer: a dark spot
  // on a moonless, clear night is when you go.
  function tonightSection(spot) {
    let t;
    try {
      t = moonTonight(spot.lat, spot.lng);
    } catch {
      return null;
    }
    const pct = Math.round((t.illumination ?? 0) * 100);
    const rows = [
      el('tr', {}, [el('th', { scope: 'row' }, 'Moon'), el('td', {}, `${t.phaseName}, ${pct}% lit`)]),
    ];
    if (t.darkWindow) {
      rows.push(el('tr', { class: 'light-mark' }, [
        el('th', { scope: 'row' }, 'Dark window'),
        el('td', {}, `${clock(t.darkWindow.start)} – ${clock(t.darkWindow.end)}`),
      ]));
    } else if (t.astroNight) {
      rows.push(el('tr', {}, [el('th', { scope: 'row' }, 'Moon up'), el('td', {}, 'all night — bright')]));
    }
    // THE MILKY WAY CORE. The dark window says when it is dark; this says whether
    // the thing you came for is actually above the horizon, how high it gets, and
    // which way to point. For most of autumn and winter the honest answer is
    // "not tonight", which is worth as much as a yes — it saves the drive.
    const mw = milkyWayTonight(spot.lat, spot.lng);
    if (mw) {
      rows.push(el('tr', { class: mw.visible ? 'light-mark' : '' }, [
        el('th', { scope: 'row' }, 'Milky Way'),
        el('td', {}, mw.visible
          ? `${compass(mw.azimuthAtPeak)} ${mw.maxAltitude}° up · ${clock(mw.start)} – ${clock(mw.end)}`
            + (mw.moonFree ? '' : ' (moonlit)')
          : 'core below the horizon tonight'),
      ]));
    }
    const sky = el('td', {}, 'checking…');
    rows.push(el('tr', {}, [el('th', { scope: 'row' }, 'Sky tonight'), sky]));

    // Live clear-sky fetch; fills in when it returns, fails soft.
    cloudTonight(spot.lat, spot.lng).then((c) => {
      sky.textContent = c ? `${c.verdict} (${c.avgCloud}% cloud)` : 'forecast unavailable';
    }).catch(() => { sky.textContent = 'forecast unavailable'; });

    return el('div', { class: 'light-box tonight-box' }, [
      el('h3', {}, 'Tonight'),
      el('table', { class: 'light-table' }, [el('tbody', {}, rows)]),
    ]);
  }

  // Live air-quality line (Open-Meteo). Fills in async, fails soft.
  function airLine(spot) {
    const p = el('p', { class: 'popup-air' }, 'Air today: checking…');
    airToday(spot.lat, spot.lng).then((a) => {
      if (!a) { p.textContent = 'Air today: unavailable'; return; }
      p.textContent =
        `Air today: up to AQI ${a.maxAqi} (${a.category})` +
        (a.smoke ? ' — likely wildfire smoke' : '');
    }).catch(() => { p.textContent = 'Air today: unavailable'; });
    return p;
  }

  // Today's high/low tides (NOAA, US public domain). Coastal spots only: when the
  // nearest tide station is too far to describe this water, the line REMOVES
  // itself so inland spots stay uncluttered. Fails soft.
  function tideLine(spot) {
    const p = el('p', { class: 'popup-tides' }, 'Tides today: checking…');
    tidesToday(spot.lat, spot.lng).then((t) => {
      if (!t) { p.remove(); return; } // inland, or unavailable — say nothing
      p.replaceChildren(
        el('strong', {}, 'Tides today: '),
        formatTides(t),
        el('span', { class: 'dim' }, ` — ${t.station}`)
      );
    }).catch(() => { p.remove(); });
    return p;
  }

  // Live river flow near a WATER spot (USGS, US public domain) — "is the fall
  // actually running, and is that high or low for the date?". Non-water spots and
  // spots with no gauge nearby REMOVE the line rather than show a meaningless
  // number. Fails soft.
  function flowLine(spot) {
    const p = el('p', { class: 'popup-flow' }, 'Water now: checking…');
    flowNow(spot, activeRegion).then((f) => {
      const text = formatFlow(f);
      if (!text) { p.remove(); return; }
      p.replaceChildren(
        el('strong', {}, 'Water now: '),
        text.replace(/^Water now: /, ''),
        el('a', {
          class: 'popup-srclink', href: `https://waterdata.usgs.gov/monitoring-location/${f.siteId}/`,
          target: '_blank', rel: 'noopener',
        }, ' USGS gauge →')
      );
    }).catch(() => { p.remove(); });
    return p;
  }

  // The clearest reference page for a marker: an HMdb page (from a Wikidata
  // HMdb id, or a URL in the OSM `note`/`website`), else any URL we have.
  function markerRef(spot) {
    const t = spot.tags ?? {};
    const urlIn = (v) => (typeof v === 'string' ? (v.match(/https?:\/\/[^\s)]+/)?.[0] ?? null) : null);
    const clean = (u) => (u ? u.replace(/[.,;)]+$/, '') : null);
    if (t.hmdb) return { url: `https://www.hmdb.org/m.asp?m=${t.hmdb}`, label: 'Read the full marker on HMdb' };
    const note = clean(urlIn(t.note));
    if (note) return { url: note, label: /hmdb\.org/.test(note) ? 'Read the full marker on HMdb' : 'Reference page' };
    const site = clean(urlIn(t.website));
    if (site) return { url: site, label: 'Reference page' };
    return null;
  }

  // Historic-marker detail on the card: what it is, the plaque inscription
  // (OSM, ODbL), and a clear link to the reference page.
  function markerSection(spot) {
    const t = spot.tags ?? {};
    const insc = typeof t.inscription === 'string' && t.inscription.trim() ? t.inscription.trim() : null;
    const ref = markerRef(spot);
    const kind = t.california_landmark ? 'California Historical Landmark' : null;
    if (!insc && !ref && !kind) return null;
    return el('div', { class: 'marker-box' }, [
      kind ? el('p', { class: 'marker-kind' }, kind) : null,
      insc ? el('p', { class: 'marker-inscription' }, `“${insc}”`) : null,
      ref ? el('p', { class: 'marker-ref' }, [
        el('a', { href: ref.url, target: '_blank', rel: 'noopener' }, `${ref.label} →`),
      ]) : null,
    ]);
  }

  // A link out to this place's Wikipedia article, from tags OSM already gives
  // us — no fetch, link-only (article text is CC BY-SA, so we never copy it).
  // Prefer the `wikipedia` tag ("lang:Title"); fall back to a `wikidata` QID
  // via Wikidata's keyless redirect to the English article.
  function wikiUrl(spot) {
    const t = spot.tags ?? {};
    const raw = typeof t.wikipedia === 'string' ? t.wikipedia.trim() : '';
    if (raw) {
      if (/^https?:\/\//.test(raw)) return raw;
      const m = raw.match(/^([a-z-]{2,12}):(.+)$/);
      const lang = m ? m[1] : 'en';
      const title = (m ? m[2] : raw).trim();
      if (title) return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    }
    if (typeof t.wikidata === 'string' && /^Q\d+$/.test(t.wikidata.trim())) {
      return `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${t.wikidata.trim()}`;
    }
    return null;
  }

  function wikiLine(spot) {
    const url = wikiUrl(spot);
    if (!url) return null;
    return el('p', { class: 'popup-wiki' }, [
      el('a', { href: url, target: '_blank', rel: 'noopener' }, 'Read about this place on Wikipedia →'),
    ]);
  }

  // Star toggle to save/unsave a spot as a favorite. Text label carries the
  // state (Saved / Save) so it's not hue-only; the star reinforces it.
  // YOUR OWN NOTE on a place. No open dataset can tell you where to park, which
  // gate is locked, or that the light only works in October — but you know. Stored
  // on this device, carried in the backup bundle, never sent anywhere. This is the
  // honest answer to a card that's bare because its source is bare.
  // Is this card THIN — nothing but a name and a type? A place can be bare
  // because its SOURCE is bare (OSM node/5618093482 carries two tags), and an
  // empty card is a dead end. For those, lead with what we can actually compute
  // or already hold, instead of leaving the space empty.
  function isThinCard(spot) {
    const t = spot.tags ?? {};
    return !spot.notes
      && !t.wikipedia && !t.wikidata && !t.hmdb && !t.inscription && !t.nrhp
      && !t.commons?.photos && !t.inaturalist?.observations && !t.ebird_species
      && !t.publicLand && !t.event
      && !(spot.best_light ?? []).length;
  }

  // What we CAN tell you about a place with no write-up: the sky, the horizon
  // and where the sun goes. All computed on-device or already measured — no
  // network, no guessing, nothing asserted that we don't hold.
  function glanceSection(spot) {
    const t = spot.tags ?? {};
    const bits = [];
    if (t.bortle != null) bits.push(`Bortle ${t.bortle} sky`);
    const h = t.horizon;
    if (h && h.open != null) {
      const word = h.open >= 0.75 ? 'wide-open horizon' : h.open >= 0.45 ? 'fairly open horizon' : 'ridged horizon';
      // Name the LOWEST compass direction — that's where low sun can reach you.
      const dirs = [['N', h.n], ['E', h.e], ['S', h.s], ['W', h.w]].filter(([, v]) => typeof v === 'number');
      const lowest = dirs.length ? dirs.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
      bits.push(lowest ? `${word} (lowest ${lowest[0]} ${lowest[1]}°)` : word);
      if (h.site_m != null) bits.push(`${Math.round(h.site_m)} m up`);
    }
    try {
      const st = sunTimesFor(spot.lat, spot.lng);
      if (!st.polar && st.sunset) {
        const dir = compass(st.sunsetAzimuth);
        bits.push(`sun sets ${dir ? dir + ' ' : ''}${clock(st.sunset)}`);
      }
    } catch { /* astronomy unavailable — just omit */ }
    if (!bits.length) return null;
    return el('div', { class: 'popup-glance' }, [
      el('p', { class: 'popup-glance-label' }, 'What we can tell you'),
      el('p', { class: 'popup-glance-text' }, bits.join(' · ')),
    ]);
  }

  // Fix it at the SOURCE. When a spot came from OpenStreetMap, offer a one-tap
  // deep link into the OSM editor for that exact element — a thin card improves
  // for every OSM user, not just this app, and flows back on the next ingest.
  function osmEditLink(spot) {
    const src = (spot.sources ?? []).find((x) => x.source === 'osm' && /^(node|way|relation)\/\d+$/.test(x.source_id ?? ''));
    if (!src) return null;
    const [type, id] = src.source_id.split('/');
    return el('p', { class: 'popup-improve' }, [
      el('a', {
        class: 'popup-srclink', target: '_blank', rel: 'noopener',
        href: `https://www.openstreetmap.org/edit?editor=id&${type}=${id}`,
      }, 'Improve this in OpenStreetMap →'),
    ]);
  }

  function noteSection(spot) {
    const box = el('div', { class: 'popup-note' });
    const render = () => {
      const existing = noteFor(spot.id);
      box.replaceChildren();
      if (existing) {
        box.append(
          el('p', { class: 'popup-note-label' }, 'Your note'),
          el('p', { class: 'popup-note-text' }, existing),
          el('button', { class: 'popup-note-btn', onClick: () => edit(existing) }, 'Edit note')
        );
      } else {
        box.append(el('button', { class: 'popup-note-btn', onClick: () => edit('') }, '✎ Add your own note'));
      }
    };
    const edit = (start) => {
      const field = el('textarea', {
        class: 'popup-note-input', rows: '3', value: start,
        'aria-label': `Your note about ${spot.name ?? 'this place'}`,
        placeholder: 'Where to park, the gate, when the light works…',
      });
      const save = el('button', { class: 'popup-note-btn save', onClick: () => {
        setNote(spot.id, field.value);
        render();
        toast(field.value.trim() ? 'Note saved' : 'Note cleared');
        onChange?.();
      } }, 'Save');
      const cancel = el('button', { class: 'popup-note-btn', onClick: render }, 'Cancel');
      box.replaceChildren(
        el('p', { class: 'popup-note-label' }, 'Your note'),
        field,
        el('div', { class: 'popup-note-actions' }, [save, cancel])
      );
      field.focus();
    };
    render();
    return box;
  }

  function favButton(spot) {
    const btn = el('button', { class: 'popup-fav', 'aria-pressed': String(isFavorite(spot.id)) });
    const paint = () => {
      const on = isFavorite(spot.id);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '★ Saved' : '☆ Save';
    };
    btn.addEventListener('click', () => {
      const on = toggleFavorite(spot.id);
      paint();
      toast(on ? 'Saved to favorites' : 'Removed from favorites');
      onChange?.();
    });
    paint();
    return btn;
  }

  // Friendly names for the raw source ids, so links read plainly.
  const SOURCE_LABELS = { osm: 'OpenStreetMap', ebird: 'eBird', wikidata: 'Wikidata' };

  // A clear "is there anything worthwhile here?" line: a badge when notable, an
  // honest caveat for the junk-prone marker category when nothing corroborates it.
  function notabilitySection(spot) {
    const reasons = notableReasons(spot);
    if (reasons.length) {
      return el('p', { class: 'popup-notable' }, `★ Notable — ${reasons.join(' · ')}`);
    }
    if (spot.category === 'marker') {
      return el('p', { class: 'popup-minor' }, 'Community-tagged in OpenStreetMap — may be a minor or unverified marker.');
    }
    return null;
  }

  // On a place that only exists BECAUSE of the photographs, the honest sentence
  // is the one that says so — and says what actually earned it, which is the
  // number of separate places a camera was set down, not the file count. A
  // hundred files from one upload is one person; twenty vantage points is a
  // subject. Everywhere else, the file count is the answer to "is there much
  // of this place already", so it stays as it was.
  function photoLine(spot) {
    const c = spot.tags.commons;
    const cap = c.capped ? '+' : '';
    if (spot.tags?.discovered !== 'photo-density') {
      return `${c.photos}${cap} freely-licensed photos taken near here.`;
    }
    const n = c.spots ?? c.photos;
    const subj = spot.tags?.subject;
    // What people TITLED their own photographs, where enough of them agree. Said
    // as the observation it is — the phrase is evidence, not a name we are
    // claiming for the place, because a recurring phrase can be a photographer's
    // habit as easily as a landmark.
    const of = subj
      ? ` Most are titled something like “${subj.subject}” (${subj.files} of ${subj.of}).`
      : '';
    return `Nothing we know of is listed here, but cameras have been set down in `
      + `${n} different places within a few hundred metres — ${c.photos}${cap} photographs in all.${of}`;
  }

  // BEHIND A TAP, NEVER AUTOMATIC. Nobody should spend bandwidth on a card they
  // only glanced at — and, more importantly, Commons is not curated for this
  // app. A geosearch near a pin returns whatever anyone geotagged there and we
  // cannot preview it, so nothing arrives unbidden.
  function thumbsSection(spot) {
    const wrap = el('div', { class: 'popup-thumbs' });
    const btn = el('button', {
      class: 'popup-linkbtn',
      onClick: async () => {
        btn.disabled = true;
        btn.textContent = 'Loading photographs…';
        const { thumbsNear } = await import('../model/commons-thumbs.js');
        const shots = await thumbsNear(spot.lat, spot.lng).catch(() => []);
        btn.remove();
        if (!shots.length) {
          wrap.append(el('p', { class: 'popup-linktext' },
            'Could not load the photographs — you may be offline. The link below still works.'));
          return;
        }
        wrap.append(el('div', { class: 'thumb-grid' }, shots.map(thumbTile)));
      },
    }, 'Show the photographs');
    wrap.append(btn);
    return wrap;
  }

  // EVERY TILE CARRIES ITS ATTRIBUTION. Most of Commons is CC-BY or CC-BY-SA,
  // which require the author and licence to be shown WITH the image — so this is
  // the condition of using it at all, not a caption. The author string arrives
  // as HTML written by an uploader and is reduced to plain text upstream; it is
  // set here as TEXT, never as markup.
  function thumbTile(shot) {
    return el('a', {
      class: 'thumb-tile',
      href: shot.page,
      target: '_blank',
      rel: 'noopener',
      // The whole tile links to the file's own page, which carries the full
      // licence and author — where an attribution link is supposed to point.
      'aria-label': `${shot.title} — by ${shot.author}, ${shot.licence}. Opens on Wikimedia Commons.`,
    }, [
      el('img', {
        class: 'thumb-img',
        src: shot.thumb,
        alt: shot.title,
        loading: 'lazy',
        decoding: 'async',
        width: shot.width ?? undefined,
        height: shot.height ?? undefined,
      }),
      el('span', { class: 'thumb-credit' }, `${shot.author} · ${shot.licence}`),
    ]);
  }

  function commonsNearUrl(spot) {
    return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(`nearcoord:1km,${spot.lat},${spot.lng}`)}&title=Special:MediaSearch&type=image`;
  }
  function inatNearUrl(spot) {
    return `https://www.inaturalist.org/observations?lat=${spot.lat}&lng=${spot.lng}&radius=1&subview=grid&verifiable=true`;
  }

  // Clear, labeled links to each source ("View on OpenStreetMap →"), with the
  // license attribution kept as quiet secondary text beneath.
  function sourceLinks(spot) {
    const srcs = spot.sources ?? [];
    const linked = srcs.filter((s) => s.source_url);
    const row = [];
    linked.forEach((s, i) => {
      if (i) row.push(' · ');
      const label = SOURCE_LABELS[s.source] ?? s.source;
      row.push(el('a', { class: 'popup-srclink', href: s.source_url, target: '_blank', rel: 'noopener' }, `View on ${label} →`));
    });
    if (!row.length) row.push(el('span', {}, srcs.map((s) => s.source).join(' · ')));
    const lic = srcs.map((s) => `${SOURCE_LABELS[s.source] ?? s.source}: ${s.source_license}`).join(' · ');
    return el('div', { class: 'popup-src' }, [
      el('p', { class: 'popup-srcrow' }, row),
      el('p', { class: 'popup-lic' }, lic),
    ]);
  }

  function popupFor(spot) {
    const meta = CATEGORY_META[spot.category] ?? { label: spot.category };
    const root = el('div', { class: 'popup' }, [
      el('div', { class: 'popup-head' }, [
        el('h2', {}, spotDisplayName(spot)),
        favButton(spot),
      ]),
      el('p', { class: 'popup-cat' }, [
        // For a Wikidata curiosity, lead with its kind ("Ghost town") — it's more
        // telling than the generic "Oddity" category.
        spot.tags?.curiosity ? spot.tags.curiosity : `${meta.label}`,
        spot.subject_type?.length ? ` · ${spot.subject_type.join(', ')}` : null,
      ]),
      spot.tags?.nrhp
        ? el('p', { class: 'popup-marker' }, [
            spot.tags.nrhp_listed
              ? `On the National Register of Historic Places — listed ${spot.tags.nrhp_listed}`
              : 'On the National Register of Historic Places',
          ])
        : null,
      spot.tags?.event
        ? el('p', { class: 'popup-event' }, [
            el('strong', {}, formatEventWhen(nextOccurrence(spot.tags.event)) ?? 'Upcoming'),
            spot.tags.event.skywide ? ' — visible region-wide' : null,
          ])
        : null,
      isThinCard(spot) ? glanceSection(spot) : null,
      notabilitySection(spot),
      markerSection(spot),
      spot.best_light?.length
        ? el('p', {}, `Best light: ${spot.best_light.join(', ')}`)
        : null,
      spot.access_difficulty && spot.access_difficulty !== 'unknown'
        ? el('p', {}, `Access: ${spot.access_difficulty}`)
        : null,
      spot.tags?.padus
        ? el('p', { class: 'popup-land' }, [
            // PAD-US: who runs it, what it is, and whether you may enter. The
            // access word is quoted from the dataset, not our interpretation.
            [spot.tags.padus.manager, spot.tags.padus.designation].filter(Boolean).join(' · ') || 'Protected area',
            spot.tags.padus.access ? ` — public access: ${spot.tags.padus.access.toLowerCase()}` : '',
          ])
        : null,
      spot.tags?.publicLand
        ? el('p', { class: 'popup-land' },
            `On public land: ${spot.tags.publicLand.name || spot.tags.publicLand.class}` +
            (spot.tags.publicLand.operator ? ` (${spot.tags.publicLand.operator})` : '') +
            ' — check access hours')
        : null,
      spot.tags?.inaturalist?.observations
        ? el('div', { class: 'popup-linkrow' }, [
            el('p', { class: 'popup-linktext' }, `Wildlife photographed nearby: ${spot.tags.inaturalist.species} non-bird species.`),
            el('a', { class: 'popup-linkbtn', href: inatNearUrl(spot), target: '_blank', rel: 'noopener' }, 'See the wildlife on iNaturalist →'),
          ])
        : null,
      spot.tags?.commons?.photos
        ? el('div', { class: 'popup-linkrow' }, [
            el('p', { class: 'popup-linktext' }, photoLine(spot)),
            // Only a DISCOVERED place gets thumbnails in the card: there the
            // photographs are the reason it is on the map, and we have no name
            // to offer instead. Everywhere else a photo is incidental and the
            // link out is the honest weight.
            spot.tags?.discovered === 'photo-density' ? thumbsSection(spot) : null,
            el('a', { class: 'popup-linkbtn', href: commonsNearUrl(spot), target: '_blank', rel: 'noopener' }, 'View the photos on Commons →'),
          ])
        : null,
      spot.tags?.curatedLink
        ? el('p', { class: 'popup-improve' }, [
            el('a', { class: 'popup-srclink', href: spot.tags.curatedLink, target: '_blank', rel: 'noopener' },
              `${spot.tags.curatedLinkLabel} →`),
          ])
        : null,
      wikiLine(spot),
      spot.notes ? el('p', {}, spot.notes) : null,
      noteSection(spot),
      osmEditLink(spot),
      synthesisBreakdown((() => {
        const r = synthesisFor(spot.id);
        if (!r) return null;
        return r.parts ? r : { ...r, ...(breakdownFor?.(spot) ?? { parts: [] }) };
      })()),
      // The astro/weather readout is long — collapse it so the card is short and
      // opens at the top (no manual scroll-up). Tap to expand when planning.
      el('details', { class: 'popup-more' }, [
        el('summary', {}, 'Tides, sun, moon & Milky Way ▾'),
        lightSection(spot),
        tideLine(spot),
        flowLine(spot),
        airLine(spot),
        tonightSection(spot),
      ]),
      el('p', { class: 'popup-nav' }, [
        el('a', {
          href: `https://maps.apple.com/?ll=${spot.lat},${spot.lng}&q=${encodeURIComponent(spot.name ?? 'Spot')}`,
        }, 'Apple Maps'),
        ' · ',
        el('a', {
          href: `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`,
        }, 'Google Maps'),
      ]),
      sourceLinks(spot),
      spot.category === 'user_pin'
        ? el('button', {
            class: 'popup-del',
            onClick: () => {
              const removed = removeUserPin(spot.id);
              map.closePopup();
              onChange?.();
              if (removed) {
                toast('Pin removed — tap to undo');
                const t = document.querySelector('.toast');
                t.onclick = () => { restoreUserPin(removed); onChange?.(); t.classList.remove('show'); };
              }
            },
          }, 'Remove pin')
        : el('button', {
            // Block a place you don't want to see — it leaves the map, the list
            // and the ranking on this device. main.js handles the undo toast.
            class: 'popup-hide',
            onClick: () => { map.closePopup(); onHideSpot?.(spot); },
          }, 'Hide this place'),
    ]);
    return root;
  }

  // Size the card to the space that ACTUALLY EXISTS, at the moment it opens.
  //
  // The old values were fixed (320 wide, and a hard `Math.max(240, ...)` floor)
  // and were computed ONCE when the marker was created, from window.innerHeight.
  // So they never responded to the map's real size, to rotation, or to a reader
  // raising their text size — measured at 200% text on a small phone, the map is
  // 43px tall and the card was still demanding 240. Fixed sizing that ignores the
  // viewport is an accessibility failure, not a cosmetic one.
  function sizePopup(marker) {
    const popup = marker.getPopup?.();
    if (!popup) return;
    const size = map.getSize();
    // Leave room for the popup tip and a little breathing space; never go below
    // a floor SMALLER than the space we have, so the card always fits and
    // scrolls internally rather than overflowing with an unreachable close.
    // Budget for the wrapper chrome AND the tip below it, or the card sits a few
    // pixels past the bottom edge.
    const maxHeight = Math.max(60, size.y - 90);
    // maxWidth is the CONTENT width; Leaflet's wrapper adds ~40px of padding,
    // border and shadow around it. Budgeting only 24px let the card render wider
    // than the map itself (267 in a 260px map), which pushed the × close off the
    // screen entirely — the card could be read but not dismissed.
    // NO FLOOR ABOVE WHAT WE HAVE. A 160px minimum in a 160px-wide map renders a
    // card wider than the map and pushes the × off the screen — the floor itself
    // becomes the fixed size that fails. Narrow, wrapped text is readable; an
    // undismissable card is not.
    const maxWidth = Math.max(110, Math.min(320, size.x - 56));
    popup.options.maxHeight = maxHeight;
    popup.options.maxWidth = maxWidth;
    // autoPan can only fit the card if the padding it must respect actually fits
    // in the map. A fixed 76px top+bottom is 152px of a 322px map, so Leaflet
    // gave up panning and left the card hanging below the screen. Scale it.
    const padY = Math.max(8, Math.min(76, Math.round(size.y * 0.08)));
    const padX = Math.max(6, Math.min(12, Math.round(size.x * 0.03)));
    popup.options.autoPanPadding = [padX, padY];
  }

  // Build one marker record (heavy: an L.marker + bound popup). Kept out of
  // setSpots so we only pay it for spots that are actually new.
  // A record is CHEAP; its Leaflet marker is not. Yellowstone has 3,930 spots
  // and the viewport ever shows a couple of hundred, so building every marker up
  // front cost roughly 900 ms of frozen UI on a region switch — most of the 1.3 s
  // Noah feels, and it gets worse every time a region grows. The marker is now
  // built the first time the pin is actually mounted, and never for a spot the
  // reader does not look at.
  function ensureMarker(rec) {
    if (rec.marker) return rec.marker;
    rec.marker = buildMarker(rec.spot);
    return rec.marker;
  }

  function buildMarker(spot) {
    const marker = L.marker([spot.lat, spot.lng], { icon: pinIcon(spot.category, !!spot.tags?.commons?.photos) })
      .bindPopup(() => popupFor(spot), {
        // Real values are set per-open by sizePopup() — these are only a sane
        // starting point. They must NOT be a fixed floor: a card that insists on
        // 240px in a 43px map is unusable, and that is exactly what happens when
        // someone raises their phone's text size.
        maxWidth: 320,
        maxHeight: 240,
        autoPanPadding: [12, 76],
      });
    // Take over click / keyboard-Enter from Leaflet's default popup opener (it
    // captured the handler refs at bindPopup time, so we detach those exact ones
    // and add our own): when this pin is currently a summary (cluster) pin, zoom
    // in to reveal the places under it instead of opening a card; otherwise save
    // the view (so it restores when the popup closes) and open the card.
    marker.off({ click: marker._openPopup, keypress: marker._onKeyPress });
    const activate = () => {
      const rec = markerById.get(spot.id);
      if (rec && rec.clusterCount > 1) { zoomToCluster(rec); return; }
      rememberViewForPopup();
      sizePopup(marker);
      marker.openPopup();
    };
    marker.__spotId = spot.id; // lets popupopen protect this exact pin (see below)
    marker.on('click', activate);
    marker.on('keypress', (e) => { if (e.originalEvent?.keyCode === 13) activate(); });
    return marker;
  }

  function createMarkerRec(spot) {
    const cm = CATEGORY_META[spot.category] ?? { label: spot.category, letter: '?' };
    // id is needed for the score-based declutter (scoreOf reads it) and to
    // hold a deliberately-focused spot unclustered. `marker` stays null until
    // this pin is first mounted.
    return { id: spot.id, spot, marker: null, category: spot.category, lat: spot.lat, lng: spot.lng, mounted: false, letter: cm.letter, label: cm.label };
  }

  // INCREMENTAL: keep the markers for spots that are still present, drop the ones
  // that left, and only build markers for genuinely new spots. Before, every call
  // tore down and rebuilt all ~2.4k markers — so hiding one spot (or any refresh)
  // stalled ~1s. Now a one-spot change touches one marker.
  function setSpots(spots) {
    const next = new Set(spots.map((s) => s.id));
    for (const [id, rec] of markerById) {
      if (!next.has(id)) { if (rec.mounted) rec.marker?.remove(); markerById.delete(id); }
    }
    for (const spot of spots) {
      if (!markerById.has(spot.id)) markerById.set(spot.id, createMarkerRec(spot));
    }
    cull();
  }

  // The map container is display:none while the List view is up, and Leaflet
  // caches its container size — so the cache drops to ZERO HEIGHT, cull() sees an
  // empty viewport and unmounts every pin. Coming back to the map then showed
  // nothing at all. Re-measure and redo the viewport pass whenever the map is
  // revealed or resized.
  function resized() {
    map.invalidateSize({ animate: false, pan: false });
    cull();
  }

  // Watch the container itself rather than guessing WHEN it gets its height back.
  // Calling resized() on the view switch is too early — the header re-renders in
  // the same tick and the flex column hasn't been laid out yet, so Leaflet
  // re-measures zero height and the map stays blank. The observer fires once the
  // height is really there, and it covers device rotation and window resize too.
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = -1, lastH = -1;
    new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (w === lastW && h === lastH) return;
      // Record the ZERO too. Remembering only non-zero sizes made the round trip
      // 667 → 0 → 667 look like "no change", so the map was never re-measured.
      lastW = w; lastH = h;
      if (!w || !h) return; // hidden: nothing meaningful to measure yet
      resized();
    }).observe(container);
  }

  // `byId` gives the score and which signals contributed — enough for the
  // declutter and the filters. `breakdown` fills in the labels and notes for the
  // one spot whose card is open, because a restored cache does not carry them
  // (storing them for every spot was a 1.37 MB write on every region switch).
  function setSynthesis(byId, breakdown) {
    synthesisFor = (id) => byId.get(id) ?? null;
    breakdownFor = breakdown ?? null;
  }

  // Fly to a spot and open its popup (from the Top-spots panel). Force-mounts it
  // unclustered (so it's there on the FIRST tap, even inside a decluttered patch)
  // and recenters on it when the popup closes (see focusCenter) instead of
  // snapping back to the old view.
  function focusSpot(spot) {
    const rec = markerById.get(spot.id);
    if (!rec) return;
    forcedId = spot.id;
    focusCenter = { lat: spot.lat, lng: spot.lng };
    popupSavedCenter = null; // deliberate navigation — no restore-to-old-view
    if (!visible.has(spot.category)) visible = new Set(visible).add(spot.category);
    const targetZoom = Math.max(map.getZoom(), 15);
    const reveal = () => {
      cull(); // forcedId keeps this pin mounted and its category-letter (unclustered)
      const r = markerById.get(spot.id);
      if (r) {
        const m = ensureMarker(r);
        if (!r.mounted) { m.addTo(map); r.mounted = true; }
        sizePopup(m);
        m.openPopup();
      }
    };
    // setView fires moveend when the view actually changes; reveal there. If the
    // view is already on the spot (no move), moveend won't fire — reveal now too.
    map.once('moveend', reveal);
    map.setView([spot.lat, spot.lng], targetZoom, { animate: true });
    reveal();
  }

  function setVisible(categories) {
    visible = categories;
    cull();
  }

  // Restrict the map to a set of spot ids (the Top-spots layer filter) — or null
  // to clear it and return to the category toggles. Announces itself via a
  // standing banner so the mode is never silent, and offers an obvious exit.
  function setSpotFilter(ids) {
    // An EMPTY set means "a filter is on and nothing matched" — keep it. Treating
    // it as null (no filter) made the map fall back to the category toggles and
    // show EVERY pin, which is the opposite of what the user asked for.
    spotFilter = ids ?? null;
    updateFilterBanner();
    cull();
    // A filter whose matches are all off-screen reads as a filter that doesn't
    // work: the list says "286 places match" and the map sits empty. If none of
    // the matches is on screen, go to them — the standard filtered-map gesture.
    if (spotFilter?.size) frameFilteredIfOffscreen();
  }

  // Frame the filtered set, but ONLY when none of it is currently visible: if the
  // user can already see matches, their chosen view is left alone.
  function frameFilteredIfOffscreen() {
    const pts = [];
    for (const rec of markerById.values()) {
      if (!spotFilter.has(rec.id)) continue;
      if (rec.mounted) return; // something matching is already in view — don't move
      pts.push([rec.lat, rec.lng]);
    }
    if (!pts.length) return;
    // fitBounds fires moveend, which re-runs cull() and mounts the pins.
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 });
  }

  // Long-press / tap-and-hold empty map → add a user pin (direct manipulation).
  map.on('contextmenu', (e) => {
    const { lat, lng } = e.latlng;
    const form = el('div', { class: 'popup' }, [
      el('h2', {}, 'Add a pin here?'),
      el('input', { type: 'text', placeholder: 'Name (optional)', 'aria-label': 'Pin name' }),
      el('button', {
        class: 'popup-add',
        onClick: () => {
          const name = form.querySelector('input').value.trim() || null;
          addUserPin({ lat, lng, name });
          map.closePopup();
          onChange?.();
          toast('Pin saved on this device');
        },
      }, 'Add pin'),
    ]);
    rememberViewForPopup();
    L.popup().setLatLng(e.latlng).setContent(form).openOn(map);
  });

  return { map, setSpots, setVisible, setSpotFilter, setSynthesis, focusSpot, setRegion, syncThemeBasemap, resized };
}
