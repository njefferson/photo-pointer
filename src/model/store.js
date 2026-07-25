// Local-first user state. localStorage under 'pointer.*', every access
// try/caught (private mode). Durable backup = versioned export bundle
// (Clear Horizons pattern); persistence requested the moment real user data
// exists ("measured data is precious data in evictable storage").

import { makeSpot, validateSpot } from './spot.js';
import { dedupKey } from './dedup.js';

const K_PINS = 'pointer.userPins';
// v2: filters now store the EXACT set of visible categories, defaulting to
// none (all off). The v1 key used empty to mean "all on" — bumping avoids that
// stale meaning flipping a returning user's view.
const K_FILTERS = 'pointer.filters.v2';
const K_LAYERS = 'pointer.layers.v2'; // v2: tri-state map (key→require|exclude), was a binary id list
const K_REGION = 'pointer.region';
const K_FAV = 'pointer.favorites';
const K_HIDDEN = 'pointer.hidden';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode / quota — app keeps working, state just won't stick */ }
}

export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch { /* unsupported */ }
}

// ---- ranking cache: the cross-layer score is deterministic for a given region
// build, so we persist it and skip the (~1s) re-rank on every page load. Keyed by
// a `sig` the caller controls (region id + data build stamp + user-pin count). ----
const K_RANK_PREFIX = 'pointer.rank.';

export function loadRankCache(regionId, sig) {
  if (!regionId) return null;
  const c = read(K_RANK_PREFIX + regionId, null);
  return c && c.sig === sig && Array.isArray(c.items) ? c.items : null;
}

export function saveRankCache(regionId, sig, items) {
  if (!regionId) return;
  const key = K_RANK_PREFIX + regionId;
  try {
    localStorage.setItem(key, JSON.stringify({ sig, items }));
  } catch {
    // Quota: drop OTHER regions' rank caches (this one is what we need now) and
    // retry once; if it still won't fit, give up — the app just re-ranks next time.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(K_RANK_PREFIX) && k !== key) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify({ sig, items }));
    } catch { /* still won't fit — skip caching */ }
  }
}

export function userPins() {
  return read(K_PINS, []);
}

export function addUserPin({ lat, lng, name = null, notes = null }) {
  const today = new Date().toISOString().slice(0, 10);
  const pin = makeSpot({
    name,
    lat,
    lng,
    category: 'user_pin',
    notes,
    sources: [{
      source: 'user',
      source_id: `${today}-${Math.round(lat * 1e5)}-${Math.round(lng * 1e5)}`,
      source_license: 'own',
      source_url: null,
      first_seen: today,
      last_seen: today,
    }],
  });
  pin.id = dedupKey(pin);
  const pins = userPins().filter((p) => p.id !== pin.id);
  pins.push(pin);
  write(K_PINS, pins);
  requestPersistence();
  return pin;
}

export function removeUserPin(id) {
  const pins = userPins();
  const removed = pins.find((p) => p.id === id) ?? null;
  write(K_PINS, pins.filter((p) => p.id !== id));
  return removed; // caller can offer Undo (one gesture = one undo step)
}

export function restoreUserPin(pin) {
  const pins = userPins().filter((p) => p.id !== pin.id);
  pins.push(pin);
  write(K_PINS, pins);
}

export function activeRegionId() {
  return read(K_REGION, null);
}

export function setActiveRegionId(id) {
  write(K_REGION, id);
}

export function activeFilters() {
  return new Set(read(K_FILTERS, []));
}

export function setActiveFilters(set) {
  write(K_FILTERS, [...set]);
}

// ---- data-layer filters (the tri-state layer row): a Map of layer key →
// 'require' (spot must have it) | 'exclude' (spot must NOT have it). Absent = any.
// Persisted as [key,state] pairs so map and list stay in lock-step across a reload.
export function activeLayers() {
  return new Map(read(K_LAYERS, []));
}

export function setActiveLayers(map) {
  write(K_LAYERS, [...map]);
}

// ---- favorites: spot ids the user has starred (data spots OR their own pins) ----

export function favorites() {
  return new Set(read(K_FAV, []));
}

export function isFavorite(id) {
  return favorites().has(id);
}

// Toggle and return the new state (true = now a favorite).
export function toggleFavorite(id) {
  const favs = favorites();
  const on = !favs.has(id);
  if (on) favs.add(id); else favs.delete(id);
  write(K_FAV, [...favs]);
  if (on) requestPersistence();
  return on;
}

export function setFavorites(ids) {
  write(K_FAV, [...new Set(ids)]);
}

// ---- hidden spots: ids the user has blocked. A hidden spot is removed from the
// map, the list AND the ranking (it's dropped from the working set at the
// source), everywhere, on this device. Reversible — unhide any, or restore all.
export function hiddenSpots() {
  return new Set(read(K_HIDDEN, []));
}

export function isHidden(id) {
  return hiddenSpots().has(id);
}

export function hideSpot(id) {
  const h = hiddenSpots();
  if (h.has(id)) return;
  h.add(id);
  write(K_HIDDEN, [...h]);
  requestPersistence();
}

export function unhideSpot(id) {
  const h = hiddenSpots();
  if (!h.delete(id)) return;
  write(K_HIDDEN, [...h]);
}

export function clearHidden() {
  write(K_HIDDEN, []);
}

// ---- durable backup bundle ----

export const BUNDLE_APP = 'photo-pointer';
export const BUNDLE_VERSION = 1;

export function exportBundle() {
  return {
    app: BUNDLE_APP,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    userPins: userPins(),
    favorites: [...favorites()],
    hidden: [...hiddenSpots()],
  };
}

// Returns { ok, imported?, error? }. Never throws; never half-applies.
export function importBundle(bundle) {
  if (!bundle || bundle.app !== BUNDLE_APP) {
    return { ok: false, error: 'not a photo-pointer backup bundle' };
  }
  if (!Array.isArray(bundle.userPins)) {
    return { ok: false, error: 'bundle has no userPins list' };
  }
  const clean = [];
  for (const p of bundle.userPins) {
    const spot = makeSpot(p);
    spot.id = p.id ?? dedupKey(spot);
    if (validateSpot(spot).length === 0) clean.push(spot);
  }
  const existing = userPins();
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const p of clean) byId.set(p.id, p);
  write(K_PINS, [...byId.values()]);
  // Favorites are just ids — merge the union (older bundles may not have them).
  let favImported = 0;
  if (Array.isArray(bundle.favorites)) {
    const merged = favorites();
    for (const id of bundle.favorites) if (typeof id === 'string') { merged.add(id); favImported++; }
    write(K_FAV, [...merged]);
  }
  // Hidden spots — same id-union merge (older bundles won't carry them).
  if (Array.isArray(bundle.hidden)) {
    const merged = hiddenSpots();
    for (const id of bundle.hidden) if (typeof id === 'string') merged.add(id);
    write(K_HIDDEN, [...merged]);
  }
  requestPersistence();
  return { ok: true, imported: clean.length, favorites: favImported };
}
