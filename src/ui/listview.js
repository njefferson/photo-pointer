// =============================================================================
// LIST VIEW — every point in the active region as a sortable list, the text
// counterpart to the map. Sort by distance from you, name, or type; filter to
// favorites; tap a row to jump to it on the map. Distance uses a one-time
// geolocation fix (fails soft — falls back to name order).
// =============================================================================
import { el, clear } from './dom.js';
import { CATEGORY_META } from './mapview.js';
import { favorites, isFavorite, toggleFavorite } from '../model/store.js';
import { distanceM } from '../model/geo.js';

// Module-level so the chosen sort / filter survive re-renders within a session.
let sortMode = null; // 'distance' | 'name' | 'category'
let favOnly = false;
let userLoc = null;
let locating = false;

const CAP = 300; // guard against rendering thousands of rows at once

function cmpName(a, b) {
  const an = (a.name ?? '').toLowerCase();
  const bn = (b.name ?? '').toLowerCase();
  return an < bn ? -1 : an > bn ? 1 : 0;
}

function fmtDist(m) {
  if (m == null) return null;
  const mi = m / 1609.344;
  if (mi < 0.1) return `${Math.round(m)} m`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

// A short line of a spot's notable facts, for the row under its name.
function detailBits(spot) {
  const t = spot.tags ?? {};
  const bits = [];
  if (spot.subject_type?.length) bits.push(spot.subject_type.join(', '));
  if (t.bortle != null) bits.push(`Bortle ${t.bortle}`);
  if (t.publicLand) bits.push('public land');
  if (t.commons?.photos) bits.push(`${t.commons.photos}${t.commons.capped ? '+' : ''} photos`);
  if (t.inaturalist?.species) bits.push(`${t.inaturalist.species} wild spp`);
  if (t.ebird_species) bits.push(`${t.ebird_species} birds`);
  return bits.join(' · ');
}

function listRow(spot, onFocusSpot, onChange, rerender) {
  const meta = CATEGORY_META[spot.category] ?? { label: spot.category, letter: '?' };
  const on = isFavorite(spot.id);
  const star = el('button', {
    class: `list-star${on ? ' on' : ''}`,
    'aria-label': on ? 'Remove from favorites' : 'Save to favorites',
    'aria-pressed': String(on),
  }, on ? '★' : '☆');
  star.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = toggleFavorite(spot.id);
    star.textContent = now ? '★' : '☆';
    star.classList.toggle('on', now);
    star.setAttribute('aria-pressed', String(now));
    onChange?.();
    if (favOnly && !now) rerender();
  });
  const dist = fmtDist(spot._dist);
  const metaLine = [meta.label, dist, detailBits(spot)].filter(Boolean).join(' · ');
  return el('div', { class: 'list-row' }, [
    el('span', { class: `pin pin-${spot.category} pin-inline`, 'aria-hidden': 'true' }, meta.letter),
    el('div', { class: 'list-row-main' }, [
      el('button', { class: 'list-name', onClick: () => onFocusSpot(spot) },
        spot.name ?? `(unnamed ${meta.label.toLowerCase()})`),
      metaLine ? el('div', { class: 'list-meta' }, metaLine) : null,
    ]),
    star,
  ]);
}

// Render the list into `container`. `spots` = all spots for the active region;
// `onFocusSpot(spot)` should switch to the map and focus it.
export function renderListInto(container, { spots, onFocusSpot, onChange }) {
  if (sortMode == null) sortMode = 'distance';
  const rerender = () => renderListInto(container, { spots, onFocusSpot, onChange });

  // Distance needs a fix; request it once, re-render when it lands (fail soft).
  if (sortMode === 'distance' && !userLoc && !locating && navigator.geolocation) {
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => { userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }; locating = false; rerender(); },
      () => { locating = false; rerender(); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  let rows = spots.slice();
  if (favOnly) { const f = favorites(); rows = rows.filter((s) => f.has(s.id)); }
  for (const s of rows) s._dist = userLoc ? distanceM(userLoc, { lat: s.lat, lng: s.lng }) : null;

  const byDistance = sortMode === 'distance' && userLoc;
  if (byDistance) rows.sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity));
  else if (sortMode === 'category') rows.sort((a, b) => (a.category > b.category ? 1 : a.category < b.category ? -1 : 0) || cmpName(a, b));
  else rows.sort(cmpName);

  const total = rows.length;
  const shown = rows.slice(0, CAP);

  const sortBtn = (mode, label) => el('button', {
    class: `list-sort${sortMode === mode ? ' on' : ''}`,
    'aria-pressed': String(sortMode === mode),
    onClick: () => { sortMode = mode; rerender(); },
  }, label);
  const favBtn = el('button', {
    class: `list-favonly${favOnly ? ' on' : ''}`,
    'aria-pressed': String(favOnly),
    onClick: () => { favOnly = !favOnly; rerender(); },
  }, favOnly ? '★ Favorites only' : '☆ Favorites only');

  const controls = el('div', { class: 'list-controls', role: 'group', 'aria-label': 'Sort and filter the list' }, [
    el('span', { class: 'list-sortlabel' }, 'Sort:'),
    sortBtn('distance', 'Distance'),
    sortBtn('name', 'Name'),
    sortBtn('category', 'Type'),
    favBtn,
  ]);

  let noteText;
  if (sortMode === 'distance' && !userLoc) {
    noteText = locating ? 'Finding your location for distance…'
      : 'Location unavailable — sorted by name. Tap Distance to retry.';
  } else {
    noteText = `${total} place${total === 1 ? '' : 's'}${total > CAP ? ` — showing the ${byDistance ? 'closest' : 'first'} ${CAP}` : ''}`;
  }

  const list = el('div', { class: 'list-rows' }, shown.length
    ? shown.map((s) => listRow(s, onFocusSpot, onChange, rerender))
    : [el('p', { class: 'list-empty' }, favOnly
        ? 'No favorites yet — open a place and tap “☆ Save”.'
        : 'No places to list. Turn on a pin type at the top.')]);

  clear(container);
  container.append(controls, el('p', { class: 'list-note' }, noteText), list);
}
