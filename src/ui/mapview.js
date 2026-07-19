// The map. Leaflet (vendored, BSD-2-Clause) over raster tiles.
// Category pins carry a LETTER GLYPH — meaning never rides on hue alone.

import * as L from '../vendor/leaflet.js';
import { el, toast } from './dom.js';
import { addUserPin, removeUserPin, restoreUserPin } from '../model/store.js';
import { sunTimesFor, compass, clock } from '../model/light.js';
import { moonTonight } from '../model/tonight.js';
import { cloudTonight } from '../model/weather.js';
import { synthesisBreakdown } from './synthesis.js';
import { loadLightLayer } from './lightlayer.js';

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
  Map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
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

export function createMapView(container, { region, onChange }) {
  const map = L.map(container, { zoomControl: true });
  const b = region.bbox;
  map.fitBounds([[b.south, b.west], [b.north, b.east]]);

  const bases = BASE_LAYERS();
  bases.Map.addTo(map);
  const layerControl = L.control.layers(bases, {}, { position: 'topright' }).addTo(map);

  // Dark-sky overlay (async — added when its data loads). Its legend shows
  // only while the overlay is on.
  loadLightLayer().then((lp) => {
    if (!lp) return;
    layerControl.addOverlay(lp.overlay, lp.name);
    map.on('overlayadd', (e) => { if (e.layer === lp.overlay) lp.legend.addTo(map); });
    map.on('overlayremove', (e) => { if (e.layer === lp.overlay) map.removeControl(lp.legend); });
  });

  const markersByCategory = new Map(); // category -> L.LayerGroup
  const markerById = new Map(); // spot.id -> L.Marker (for fly-to)
  let visible = new Set(Object.keys(CATEGORY_META));
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

    return el('div', { class: 'light-box' }, [
      el('h4', {}, 'Light today'),
      el('table', { class: 'light-table' }, [
        el('tbody', {}, rows.filter(Boolean)),
      ]),
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

  function popupFor(spot) {
    const meta = CATEGORY_META[spot.category] ?? { label: spot.category };
    const root = el('div', { class: 'popup' }, [
      el('h3', {}, spot.name ?? `(unnamed ${meta.label.toLowerCase()})`),
      el('p', { class: 'popup-cat' }, [
        `${meta.label}`,
        spot.subject_type?.length ? ` · ${spot.subject_type.join(', ')}` : null,
      ]),
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
      spot.notes ? el('p', {}, spot.notes) : null,
      synthesisBreakdown(synthesisFor(spot.id)),
      lightSection(spot),
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
      el('p', { class: 'popup-src' },
        (spot.sources ?? []).map((s) =>
          s.source_url
            ? el('a', { href: s.source_url, target: '_blank', rel: 'noopener' },
                `${s.source} (${s.source_license})`)
            : el('span', {}, `${s.source}`)
        ).flatMap((n, i) => (i ? [' · ', n] : [n]))
      ),
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
    for (const g of markersByCategory.values()) g.remove();
    markersByCategory.clear();
    markerById.clear();
    for (const spot of spots) {
      let group = markersByCategory.get(spot.category);
      if (!group) {
        group = L.layerGroup();
        markersByCategory.set(spot.category, group);
        if (visible.has(spot.category)) group.addTo(map);
      }
      const marker = L.marker([spot.lat, spot.lng], { icon: pinIcon(spot.category) })
        .bindPopup(() => popupFor(spot))
        .addTo(group);
      markerById.set(spot.id, { marker, category: spot.category });
    }
  }

  function setSynthesis(byId) {
    synthesisFor = (id) => byId.get(id) ?? null;
  }

  // Fly to a spot and open its popup (from the Top-spots panel). Ensures its
  // category is visible first.
  function focusSpot(spot) {
    if (!visible.has(spot.category)) {
      const v = new Set(visible);
      v.add(spot.category);
      setVisible(v);
    }
    map.setView([spot.lat, spot.lng], Math.max(map.getZoom(), 13));
    markerById.get(spot.id)?.marker.openPopup();
  }

  function setVisible(categories) {
    visible = categories;
    for (const [cat, group] of markersByCategory) {
      if (visible.has(cat)) group.addTo(map);
      else group.remove();
    }
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

  return { map, setSpots, setVisible, setSynthesis, focusSpot };
}
