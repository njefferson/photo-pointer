// The dark-sky overlay: the Falchi light-pollution raster as a toggleable
// Leaflet image layer with an opacity control and a TEXT-labeled legend
// (Bortle 1–9), so meaning never rides on color alone. Data:
// Falchi et al. 2016 (CC BY-NC 4.0), doi:10.5880/GFZ.1.4.2016.001.

import * as L from '../vendor/leaflet.js';
import { el } from './dom.js';

export async function loadLightLayer() {
  let meta;
  try {
    const res = await fetch('./data/layers/light-pollution.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    meta = await res.json();
  } catch {
    return null;
  }
  const b = meta.bounds;
  const overlay = L.imageOverlay(
    './data/layers/light-pollution.png',
    [[b.south, b.west], [b.north, b.east]],
    { opacity: 0.6, interactive: false, alt: 'Dark-sky (light pollution) overlay' }
  );

  // Legend + opacity, shown only while the overlay is on.
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = el('div', { class: 'lp-legend' }, [
      el('div', { class: 'lp-legend-title' }, 'Dark sky · Bortle'),
      el('label', { class: 'lp-op' }, [
        'Overlay',
        el('input', {
          type: 'range', min: '0', max: '100', value: '60',
          'aria-label': 'Dark-sky overlay opacity',
          onInput: (e) => overlay.setOpacity(Number(e.target.value) / 100),
        }),
      ]),
      ...meta.legend.map((row) =>
        el('div', { class: 'lp-row', title: row.label }, [
          el('span', { class: 'lp-swatch', style: `background:${row.color}`, 'aria-hidden': 'true' }),
          el('span', { class: 'lp-row-label' }, row.label),
        ])
      ),
      el('div', { class: 'lp-credit' }, 'Falchi et al. 2016 · CC BY-NC 4.0'),
    ]);
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };

  return { overlay, legend, name: 'Dark sky (Bortle)' };
}
