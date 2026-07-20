// The map. Leaflet (vendored, BSD-2-Clause) over raster tiles.
// Category pins carry a LETTER GLYPH — meaning never rides on hue alone.

import * as L from '../vendor/leaflet.js';
import { el, toast } from './dom.js';
import { addUserPin, removeUserPin, restoreUserPin, isFavorite, toggleFavorite } from '../model/store.js';
import { sunTimesFor, compass, clock } from '../model/light.js';
import { moonTonight } from '../model/tonight.js';
import { cloudTonight } from '../model/weather.js';
import { airToday } from '../model/airquality.js';
import { synthesisBreakdown } from './synthesis.js';
import { loadLightLayer } from './lightlayer.js';
import { inBBox, bboxCenter } from '../model/geo.js';
import { notableReasons } from '../model/notability.js';

// If a GPS fix lands outside the covered region, drop the user in the middle of
// the map's world instead — Cameron Park, in El Dorado County (Noah's call).
export const FALLBACK_CENTER = { lat: 38.6785, lng: -120.9872, name: 'Cameron Park, CA' };

export const CATEGORY_META = {
  viewpoint: { label: 'Viewpoint', letter: 'V' },
  marker: { label: 'Historical marker', letter: 'M' },
  oddity: { label: 'Oddity', letter: 'O' },
  park: { label: 'Park', letter: 'P' },
  trailhead: { label: 'Trailhead', letter: 'T' },
  campsite: { label: 'Campsite', letter: 'C' },
  wildlife_hotspot: { label: 'Wildlife hotspot', letter: 'W' },
  dark_sky: { label: 'Dark sky', letter: 'D' },
  user_pin: { label: 'My pin', letter: '★' },
};

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

function pinIcon(category) {
  const meta = CATEGORY_META[category] ?? { letter: '?' };
  return L.divIcon({
    className: '',
    html: `<span class="pin pin-${category}" role="img" aria-label="${meta.label ?? category}">${meta.letter}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

export function createMapView(container, { region, regions = [], onSwitchRegion, onChange }) {
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

  const padded = () => map.getBounds().pad(0.35);
  const CELL_PX = 40; // declutter grid: at most one pin per ~40px cell in view
  function cull() {
    const b = padded();
    // 1) Gather the in-view, visible-category candidates; unmount everything else.
    const cands = [];
    for (const rec of markerById.values()) {
      const inView = visible.has(rec.category) && b.contains([rec.lat, rec.lng]);
      if (inView) cands.push(rec);
      else if (rec.mounted) { rec.marker.remove(); rec.mounted = false; }
    }
    // 2) Declutter: keep the best pin per screen-grid cell. The grid is in PIXELS,
    //    so zoomed out a cell covers lots of ground (few pins) and zoomed in each
    //    pin gets its own cell (all show). Fewer mounted nodes than before → no
    //    lag. User pins always survive; otherwise the higher-scoring pin wins.
    cands.sort((a, c) => scoreOf(c) - scoreOf(a));
    const taken = new Set();
    for (const rec of cands) {
      let keep;
      if (rec.category === 'user_pin') {
        keep = true;
      } else {
        const pt = map.latLngToContainerPoint([rec.lat, rec.lng]);
        const key = `${Math.floor(pt.x / CELL_PX)}:${Math.floor(pt.y / CELL_PX)}`;
        keep = !taken.has(key);
        if (keep) taken.add(key);
      }
      if (keep && !rec.mounted) { rec.marker.addTo(map); rec.mounted = true; }
      else if (!keep && rec.mounted) { rec.marker.remove(); rec.mounted = false; }
    }
  }
  function scoreOf(rec) { return synthesisFor(rec.id)?.score ?? 0; }
  let cullPending = false;
  function scheduleCull() {
    if (cullPending) return;
    cullPending = true;
    requestAnimationFrame(() => { cullPending = false; cull(); });
  }
  map.on('moveend zoomend', scheduleCull);
  let synthesisFor = () => null; // set by setSynthesis; id -> {score, parts}

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
        el('h4', {}, 'Light today'),
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
      el('h4', {}, 'Light today'),
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
    const sky = el('td', {}, 'checking…');
    rows.push(el('tr', {}, [el('th', { scope: 'row' }, 'Sky tonight'), sky]));

    // Live clear-sky fetch; fills in when it returns, fails soft.
    cloudTonight(spot.lat, spot.lng).then((c) => {
      sky.textContent = c ? `${c.verdict} (${c.avgCloud}% cloud)` : 'forecast unavailable';
    }).catch(() => { sky.textContent = 'forecast unavailable'; });

    return el('div', { class: 'light-box tonight-box' }, [
      el('h4', {}, 'Tonight'),
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
        el('h3', {}, spot.name ?? `(unnamed ${meta.label.toLowerCase()})`),
        favButton(spot),
      ]),
      el('p', { class: 'popup-cat' }, [
        `${meta.label}`,
        spot.subject_type?.length ? ` · ${spot.subject_type.join(', ')}` : null,
      ]),
      notabilitySection(spot),
      markerSection(spot),
      spot.best_light?.length
        ? el('p', {}, `Best light: ${spot.best_light.join(', ')}`)
        : null,
      spot.access_difficulty && spot.access_difficulty !== 'unknown'
        ? el('p', {}, `Access: ${spot.access_difficulty}`)
        : null,
      spot.tags?.publicLand
        ? el('p', { class: 'popup-land' },
            `On public land: ${spot.tags.publicLand.name || spot.tags.publicLand.class}` +
            (spot.tags.publicLand.operator ? ` (${spot.tags.publicLand.operator})` : '') +
            ' — check access hours')
        : null,
      spot.tags?.inaturalist?.observations
        ? el('p', { class: 'popup-wild' }, [
            `Wildlife photographed nearby: ${spot.tags.inaturalist.species} non-bird species — `,
            el('a', { href: inatNearUrl(spot), target: '_blank', rel: 'noopener' }, 'see them on iNaturalist →'),
          ])
        : null,
      spot.tags?.commons?.photos
        ? el('p', { class: 'popup-photos' }, [
            `${spot.tags.commons.photos}${spot.tags.commons.capped ? '+' : ''} freely-licensed photos taken near here — `,
            el('a', { href: commonsNearUrl(spot), target: '_blank', rel: 'noopener' }, 'see them on Commons →'),
          ])
        : null,
      wikiLine(spot),
      spot.notes ? el('p', {}, spot.notes) : null,
      synthesisBreakdown(synthesisFor(spot.id)),
      lightSection(spot),
      airLine(spot),
      tonightSection(spot),
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
        : null,
    ]);
    return root;
  }

  function setSpots(spots) {
    for (const rec of markerById.values()) rec.marker.remove();
    markerById.clear();
    for (const spot of spots) {
      const marker = L.marker([spot.lat, spot.lng], { icon: pinIcon(spot.category) })
        .bindPopup(() => popupFor(spot), {
          maxWidth: 320,
          // Cap the popup to the viewport so a long card scrolls INSIDE the popup
          // (Leaflet makes a scroll container) and the × close stays reachable —
          // instead of overflowing off a phone screen with no way to dismiss it.
          maxHeight: Math.max(240, Math.round((typeof window !== 'undefined' ? window.innerHeight : 700) * 0.6)),
          autoPanPadding: [12, 76],
        });
      markerById.set(spot.id, { marker, category: spot.category, lat: spot.lat, lng: spot.lng, mounted: false });
    }
    cull();
  }

  function setSynthesis(byId) {
    synthesisFor = (id) => byId.get(id) ?? null;
  }

  // Fly to a spot and open its popup (from the Top-spots panel). Ensures its
  // category is visible first.
  function focusSpot(spot) {
    if (!visible.has(spot.category)) { visible = new Set(visible).add(spot.category); }
    map.setView([spot.lat, spot.lng], Math.max(map.getZoom(), 13));
    const rec = markerById.get(spot.id);
    if (rec) {
      if (!rec.mounted) { rec.marker.addTo(map); rec.mounted = true; }
      rec.marker.openPopup();
    }
    scheduleCull();
  }

  function setVisible(categories) {
    visible = categories;
    cull();
  }

  // Long-press / tap-and-hold empty map → add a user pin (direct manipulation).
  map.on('contextmenu', (e) => {
    const { lat, lng } = e.latlng;
    const form = el('div', { class: 'popup' }, [
      el('h3', {}, 'Add a pin here?'),
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
    L.popup().setLatLng(e.latlng).setContent(form).openOn(map);
  });

  return { map, setSpots, setVisible, setSynthesis, focusSpot, setRegion, syncThemeBasemap };
}
