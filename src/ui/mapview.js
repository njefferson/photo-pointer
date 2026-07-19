// The map. Leaflet (vendored, BSD-2-Clause) over raster tiles.
// Category pins carry a LETTER GLYPH — meaning never rides on hue alone.

import * as L from '../vendor/leaflet.js';
import { el, toast } from './dom.js';
import { addUserPin, removeUserPin, restoreUserPin } from '../model/store.js';

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
  L.control.layers(bases, {}, { position: 'topright' }).addTo(map);

  const markersByCategory = new Map(); // category -> L.LayerGroup
  let visible = new Set(Object.keys(CATEGORY_META));

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
      spot.notes ? el('p', {}, spot.notes) : null,
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
    for (const spot of spots) {
      let group = markersByCategory.get(spot.category);
      if (!group) {
        group = L.layerGroup();
        markersByCategory.set(spot.category, group);
        if (visible.has(spot.category)) group.addTo(map);
      }
      L.marker([spot.lat, spot.lng], { icon: pinIcon(spot.category) })
        .bindPopup(() => popupFor(spot))
        .addTo(group);
    }
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

  return { map, setSpots, setVisible };
}
