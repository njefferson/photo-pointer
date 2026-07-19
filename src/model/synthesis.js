// synthesis.js — the thing no single app does: combine EVERY layer we know
// about a place into one photographer-intent score, with a transparent
// breakdown of why. Node-safe + pure so it's unit-tested and runs headless.
//
// THE EXTENSIBILITY CONTRACT (Noah, 2026-07-19): new data sources plug in as
// new SIGNALS. A signal reads whatever a source left on the spot (a tag, a
// category, a nearby-layer relationship) and returns a 0..1 contribution plus
// a human note. The scorer (scoreSpot) never changes when a source is added —
// you append one entry to SIGNALS. A signal that has no data yet returns null
// and simply doesn't count, so it can ship BEFORE its data source lands and
// light up automatically when the ingest starts writing its tag. (darkSky
// below is exactly that: dormant until the dark-sky layer writes tags.bortle.)

import { distanceM } from './geo.js';
import { sunTimesFor, compass } from './light.js';

// A signal: { key, label, weight, evaluate(spot, ctx) -> {value, note} | null }
//   value: 0..1 contribution   note: short human explanation
//   return null when the signal doesn't apply to this spot (excluded from the
//   score's denominator — absence never penalizes).
export const SIGNALS = [
  {
    key: 'layered',
    label: 'A layered place',
    weight: 1.0,
    // The heart of the idea: places described by MORE than one source/subject
    // (a park that's also a birding hotspot) are what unification surfaces.
    evaluate(spot) {
      const sources = new Set((spot.sources ?? []).map((s) => s.source)).size;
      const subjects = new Set(spot.subject_type ?? []).size;
      const value = clamp((sources - 1) * 0.4 + Math.max(0, subjects - 1) * 0.2, 0, 1);
      if (value <= 0) return null;
      const bits = [];
      if (sources > 1) bits.push(`${sources} sources`);
      if (subjects > 1) bits.push(spot.subject_type.join(', '));
      return { value, note: bits.join(' · ') };
    },
  },
  {
    key: 'wildlife',
    label: 'Wildlife',
    weight: 1.0,
    evaluate(spot, ctx) {
      if (spot.category === 'wildlife_hotspot') {
        const n = spot.tags?.ebird_species ?? null;
        return { value: n ? clamp(n / 300, 0.3, 1) : 0.5, note: n ? `${n} species reported` : 'birding hotspot' };
      }
      const near = ctx.nearest(spot, 'wildlife_hotspot', 3000);
      if (!near) return null;
      const km = near.distM / 1000;
      return { value: clamp(1 - km / 3, 0, 1) * 0.8, note: `hotspot ${km.toFixed(1)} km away` };
    },
  },
  {
    key: 'view',
    label: 'Open view for golden hour',
    weight: 0.8,
    evaluate(spot, ctx) {
      const openCats = new Set(['viewpoint', 'park', 'oddity', 'dark_sky']);
      const landscapey = (spot.subject_type ?? []).some((s) => ['landscape', 'water', 'night_sky'].includes(s));
      if (!openCats.has(spot.category) && !landscapey) return null;
      let value = spot.category === 'viewpoint' ? 0.7 : 0.5;
      if (spot.tags?.direction != null) value += 0.3; // OSM knows which way it faces
      value = clamp(value, 0, 1);
      const light = ctx.lightFor(spot);
      const dir = light && compass(light.sunsetAzimuth);
      return { value, note: dir ? `evening light from the ${dir}` : 'good for landscapes' };
    },
  },
  {
    key: 'openHorizon',
    label: 'Open horizon',
    weight: 0.8,
    // DORMANT until the terrain-horizon ingest writes tags.horizon. MEASURED
    // from a 30 m elevation model (not the category guess the `view` signal
    // makes): how low the land sits all around, so the rising/setting sun and
    // the Milky Way can actually clear it. Land only — DEMs carry no trees.
    evaluate(spot) {
      const h = spot.tags?.horizon;
      if (h == null || h.open == null) return null;
      const parts = [];
      if (h.e != null) parts.push(`E ${h.e}°`);
      if (h.w != null) parts.push(`W ${h.w}°`);
      const desc = h.open >= 0.75 ? 'wide open' : h.open >= 0.45 ? 'fairly open' : 'ridged';
      return { value: clamp(h.open, 0, 1), note: parts.length ? `${desc} (${parts.join(', ')})` : desc };
    },
  },
  {
    key: 'access',
    label: 'Easy to reach',
    weight: 0.5,
    evaluate(spot) {
      const map = { roadside: 1, short_walk: 0.8, hike: 0.5, strenuous: 0.2 };
      const v = map[spot.access_difficulty];
      if (v == null) return null; // 'unknown' doesn't penalize
      return { value: v, note: spot.access_difficulty.replace('_', ' ') };
    },
  },
  {
    key: 'publicLand',
    label: 'Public land',
    weight: 0.6,
    // DORMANT until the public-lands ingest writes tags.publicLand. Being on a
    // park/forest/reserve makes a spot more likely to be somewhere you can
    // legally shoot (hours still vary — the UI says "check access").
    evaluate(spot) {
      const pl = spot.tags?.publicLand;
      if (!pl) return null;
      const openish = /national_park|nature_reserve|park|forest|1[abc]?|2|3|4|5/.test(String(pl.class ?? ''));
      return { value: openish ? 0.9 : 0.6, note: pl.name || pl.class || 'public land' };
    },
  },
  {
    key: 'darkSky',
    label: 'Dark sky',
    weight: 1.2,
    // DORMANT until the dark-sky ingest writes tags.bortle (1 = darkest,
    // 9 = inner city). Ships now, activates automatically then — the plug-in
    // contract in action.
    evaluate(spot) {
      const b = spot.tags?.bortle;
      if (b == null) return null;
      return { value: clamp((9 - b) / 8, 0, 1), note: `Bortle ${b}` };
    },
  },
];

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Build a reusable context (spatial index + memoized light + the score
// denominator) for a spot set. One index, queried by every signal; scoring
// runs once on load, not per frame.
export function buildContext(spots, signals = SIGNALS) {
  const CELL = 0.02; // ~2 km latitude cells
  const grid = new Map();
  const key = (lat, lng) => `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}`;
  for (const s of spots) {
    const k = key(s.lat, s.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(s);
  }
  const lightCache = new Map();
  const ctx = {
    spots,
    signals,
    // Nearest spot of a category within maxM metres, or null.
    nearest(spot, category, maxM) {
      const clat = Math.round(spot.lat / CELL);
      const clng = Math.round(spot.lng / CELL);
      const reach = Math.ceil(maxM / 1000 / 2) + 1;
      let best = null;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          for (const other of grid.get(`${clat + dy}:${clng + dx}`) ?? []) {
            if (other === spot || other.category !== category) continue;
            const d = distanceM(spot, other);
            if (d <= maxM && (!best || d < best.distM)) best = { spot: other, distM: d };
          }
        }
      }
      return best;
    },
    lightFor(spot) {
      const k = `${spot.lat.toFixed(2)},${spot.lng.toFixed(2)}`;
      if (!lightCache.has(k)) {
        try {
          lightCache.set(k, sunTimesFor(spot.lat, spot.lng));
        } catch {
          lightCache.set(k, null);
        }
      }
      return lightCache.get(k);
    },
  };

  // The score denominator is the sum of weights of signals that are LIVE in
  // this dataset — a signal produces a value for at least one spot. This is
  // what makes breadth win (a spot missing a live layer scores 0 for it, out
  // of the full denominator) WITHOUT a dormant source suppressing every score
  // (darkSky isn't in the denominator until its data lands, then it enters
  // both numerator and denominator automatically).
  const live = new Set();
  for (const sig of signals) {
    for (const s of spots) {
      let r = null;
      try { r = sig.evaluate(s, ctx); } catch { r = null; }
      if (r) { live.add(sig.key); break; }
    }
  }
  ctx.liveKeys = live;
  ctx.norm = signals.filter((s) => live.has(s.key)).reduce((a, s) => a + s.weight, 0) || 1;
  return ctx;
}

// Composite 0..1 score for a spot + the parts that produced it. Numerator is
// the weighted sum of contributing signals; denominator is ctx.norm (the live
// signals), so MORE contributing layers → higher score. Breadth is the point.
export function scoreSpot(spot, ctx, signals = ctx.signals ?? SIGNALS) {
  const parts = [];
  let acc = 0;
  for (const sig of signals) {
    let r = null;
    try {
      r = sig.evaluate(spot, ctx);
    } catch {
      r = null;
    }
    if (!r) continue;
    parts.push({ key: sig.key, label: sig.label, value: r.value, note: r.note });
    acc += r.value * sig.weight;
  }
  const norm = ctx.norm ?? (signals.reduce((a, s) => a + s.weight, 0) || 1);
  return { score: Math.min(1, acc / norm), parts };
}

// Rank spots by composite score. opts.categories limits the pool; opts.require
// is a list of signal keys that MUST contribute (the cross-layer query, e.g.
// require ['darkSky','view'] = "dark spots that are also open viewpoints").
export function rankSpots(spots, opts = {}) {
  const ctx = buildContext(spots, opts.signals ?? SIGNALS);
  const pool = opts.categories
    ? spots.filter((s) => opts.categories.includes(s.category))
    : spots;
  const scored = pool.map((s) => ({ spot: s, ...scoreSpot(s, ctx) }));
  const filtered = opts.require?.length
    ? scored.filter((r) => opts.require.every((k) => r.parts.some((p) => p.key === k)))
    : scored;
  filtered.sort((a, b) => b.score - a.score || (a.spot.name ?? '').localeCompare(b.spot.name ?? ''));
  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}
