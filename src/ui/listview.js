// =============================================================================
// LIST VIEW — every point in the active region as a sortable list, the text
// counterpart to the map. Sort by Best (photo score), distance from you, name,
// or type; filter to favorites; tap a row to jump to it on the map. Distance +
// a compass bearing use a one-time geolocation fix (fails soft — falls back to
// name order). It honours the SAME category + "must have" filters as the map.
// =============================================================================
import { el, clear } from './dom.js';
import { CATEGORY_META, spotDisplayName } from './mapview.js';
import { favorites, isFavorite, toggleFavorite } from '../model/store.js';
import { distanceM, bearingDeg } from '../model/geo.js';
import { compass } from '../model/light.js';
import { nextOccurrence, formatEventWhen, upcomingKey } from '../model/events.js';
import { scorePct, scoreTier } from './synthesis.js';

// Module-level so the chosen sort / filter survive re-renders within a session.
let sortMode = null; // 'best' | 'distance' | 'name' | 'category'
let favOnly = false;

const CAP = 300; // guard against rendering thousands of rows at once

function cmpName(a, b) {
  const an = (a.name ?? '').toLowerCase();
  const bn = (b.name ?? '').toLowerCase();
  return an < bn ? -1 : an > bn ? 1 : 0;
}

function fmtDist(m) {
  if (m == null) return null;
  const mi = m / 1609.344; // metres → miles
  if (mi < 0.1) return `${Math.round(m)} m`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

// "3.2 mi · NE 43°" — distance plus the compass heading from you to the spot.
function fmtDistBearing(spot) {
  const d = fmtDist(spot._dist);
  if (d == null) return null;
  if (spot._brg == null) return d;
  const deg = Math.round(spot._brg);
  return `${d} · ${compass(spot._brg)} ${deg}°`;
}

// A short line of a spot's notable facts, for the row under its name.
function detailBits(spot) {
  const t = spot.tags ?? {};
  const bits = [];
  if (t.event) { const w = formatEventWhen(nextOccurrence(t.event)); if (w) bits.push(w); } // "Sep 11–13 · in 12 days"
  if (t.curiosity) bits.push(t.curiosity); // "Ghost town", "Waterfall", "Balloon festival"…
  if (spot.subject_type?.length) bits.push(spot.subject_type.join(', '));
  if (t.bortle != null) bits.push(`Bortle ${t.bortle}`);
  if (t.publicLand) bits.push('public land');
  if (t.commons?.photos) bits.push(`${t.commons.photos}${t.commons.capped ? '+' : ''} photos`);
  if (t.inaturalist?.species) bits.push(`${t.inaturalist.species} wild spp`);
  if (t.ebird_species) bits.push(`${t.ebird_species} birds`);
  return bits.join(' · ');
}

// The photo-score badge on the right of a row (the ranking that used to hide in
// the trophy panel). Number + strength word; shows even off the Best sort so a
// place's rating is always visible.
function scoreCell(score) {
  if (score == null) return null;
  const pct = scorePct(score);
  const tier = scoreTier(pct);
  return el('span', { class: 'list-score', 'aria-label': `Photo score ${pct} — ${tier}, higher is better` }, [
    el('span', { class: 'score-num', 'aria-hidden': 'true' }, `${pct}`),
    el('span', { class: 'score-cap', 'aria-hidden': 'true' }, tier),
  ]);
}

function listRow(spot, score, onFocusSpot, onChange, onHide, rerender) {
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
  // Hide/block: drops the place from the map, the list and the ranking (undo via
  // the toast main.js shows). A quiet ✕ so it doesn't compete with the star.
  const hide = el('button', {
    class: 'list-hide',
    'aria-label': `Hide ${spot.name ?? 'this place'}`,
    title: 'Hide this place',
  }, '✕');
  hide.addEventListener('click', (e) => { e.stopPropagation(); onHide?.(spot); });
  const metaLine = [meta.label, fmtDistBearing(spot), detailBits(spot)].filter(Boolean).join(' · ');
  return el('div', { class: 'list-row' }, [
    el('span', { class: `pin pin-${spot.category} pin-inline`, 'aria-hidden': 'true' }, meta.letter),
    el('div', { class: 'list-row-main' }, [
      el('button', { class: 'list-name', onClick: () => onFocusSpot(spot) },
        spotDisplayName(spot)),
      metaLine ? el('div', { class: 'list-meta' }, metaLine) : null,
    ]),
    scoreCell(score),
    star,
    hide,
  ]);
}

// Render the list into `container`. `spots` = the already-filtered spots for the
// active region; `scoreById` maps spot id → composite score (0..1) for the Best
// sort + the per-row badge; `onFocusSpot(spot)` switches to the map + focuses it.
export function renderListInto(container, opts) {
  const { spots, scoreById, onFocusSpot, onChange, onHide,
    userLoc = null, geoStatus = 'idle', onRequestLocation, searchQuery = '' } = opts;
  if (sortMode == null) sortMode = 'distance';
  const rerender = () => renderListInto(container, opts);
  const scoreOf = (s) => scoreById?.get(s.id) ?? null;

  // Distance/bearing use the ONE shared location fix owned by main.js (so the list
  // sort and the header distance filter never prompt twice). Request it once when
  // the Distance sort is active and we don't have a fix yet (only from 'idle', so
  // a denied fix doesn't re-prompt on every render).
  if (sortMode === 'distance' && !userLoc && geoStatus === 'idle') onRequestLocation?.();

  let rows = spots.slice();
  if (favOnly) { const f = favorites(); rows = rows.filter((s) => f.has(s.id)); }
  for (const s of rows) {
    s._dist = userLoc ? distanceM(userLoc, { lat: s.lat, lng: s.lng }) : null;
    s._brg = userLoc ? bearingDeg(userLoc, { lat: s.lat, lng: s.lng }) : null;
  }

  const byDistance = sortMode === 'distance' && userLoc;
  if (sortMode === 'best') rows.sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0) || cmpName(a, b));
  else if (sortMode === 'upcoming') rows.sort((a, b) => upcomingKey(a) - upcomingKey(b) || cmpName(a, b));
  else if (byDistance) rows.sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity));
  else if (sortMode === 'category') rows.sort((a, b) => (a.category > b.category ? 1 : a.category < b.category ? -1 : 0) || cmpName(a, b));
  else rows.sort(cmpName);

  const total = rows.length;
  const shown = rows.slice(0, CAP);

  const sortBtn = (mode, label) => el('button', {
    class: `list-sort${sortMode === mode ? ' on' : ''}`,
    'aria-pressed': String(sortMode === mode),
    // Tapping Distance (re)requests the shared location fix on demand.
    onClick: () => { sortMode = mode; if (mode === 'distance' && !userLoc) onRequestLocation?.(); rerender(); },
  }, label);
  const favBtn = el('button', {
    class: `list-favonly${favOnly ? ' on' : ''}`,
    'aria-pressed': String(favOnly),
    onClick: () => { favOnly = !favOnly; rerender(); },
  }, favOnly ? '★ Favorites only' : '☆ Favorites only');

  const controls = el('div', { class: 'list-controls', role: 'group', 'aria-label': 'Sort and filter the list' }, [
    el('span', { class: 'list-sortlabel' }, 'Sort:'),
    sortBtn('best', 'Best'),
    sortBtn('upcoming', 'Upcoming'),
    sortBtn('distance', 'Distance'),
    sortBtn('name', 'Name'),
    sortBtn('category', 'Type'),
    favBtn,
  ]);

  let noteText;
  if (searchQuery) {
    noteText = `${total} result${total === 1 ? '' : 's'} for “${searchQuery}”${total > CAP ? ` — showing the first ${CAP}` : ''}`;
  } else if (sortMode === 'distance' && !userLoc) {
    noteText = geoStatus === 'locating' ? 'Finding your location for distance…'
      : 'Location unavailable — sorted by name. Tap Distance to retry.';
  } else {
    const order = sortMode === 'best' ? 'highest-scoring' : byDistance ? 'closest' : 'first';
    noteText = `${total} place${total === 1 ? '' : 's'}${total > CAP ? ` — showing the ${order} ${CAP}` : ''}`;
  }

  // The Events view is honest about what it is: a hand-picked curated list plus
  // computed sky events — NOT a complete festival feed (no open, license-clean
  // database of every event exists), and annual dates are approximate.
  const eventsNote = sortMode === 'upcoming'
    ? el('p', { class: 'list-eventsnote', role: 'note' },
        'Events are hand-picked — the festivals we’ve added, plus computed meteor-shower peaks. This isn’t a complete listing (there’s no open database of every event), and dates for annual events are approximate — confirm with the official source before you go.')
    : null;

  const list = el('div', { class: 'list-rows' }, shown.length
    ? shown.map((s) => listRow(s, scoreOf(s), onFocusSpot, onChange, onHide, rerender))
    : [el('p', { class: 'list-empty' }, searchQuery
        ? `No places match “${searchQuery}”.`
        : favOnly
          ? 'No favorites yet — open a place and tap “☆ Save”.'
          : 'No places to list. Turn on a pin type at the top.')]);

  clear(container);
  container.append(controls);
  if (eventsNote) container.append(eventsNote);
  container.append(el('p', { class: 'list-note' }, noteText), list);
}
