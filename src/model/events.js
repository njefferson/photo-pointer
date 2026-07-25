// The Events layer — festivals and dated happenings a photographer plans around
// (the Great Reno Balloon Race, meteor-shower peaks). Events are modeled as
// ordinary Spots with category 'event' carrying a schedule in tags.event:
//   { month, day, days?, when, recurs:'annual', skywide? }
// month/day = the (approximate) start of THIS year's occurrence; `days` its length
// (default 1); `when` a human label ("Second weekend of September"); `recurs`
// 'annual' rolls it to the next year once it's past; `skywide` marks a sky event
// that isn't tied to one exact spot (shown at the region centre, labelled so).
//
// Everything here is computed on-device (no external calendar API — none is
// license-clean), so curated festivals + the fixed annual meteor-shower calendar
// stay accurate without a data refresh going stale.

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
const DAY_MS = 86400000;

// The next (or current) occurrence of an annual event, relative to `now`.
// Returns { start, end, daysUntil } or null if the event has no month/day.
export function nextOccurrence(ev, now = new Date()) {
  if (!ev || !ev.month || !ev.day) return null;
  const days = ev.days ?? 1;
  const today = startOfDay(now);
  const mk = (y) => new Date(y, ev.month - 1, ev.day);
  let start = mk(now.getFullYear());
  const endOf = (s) => { const e = new Date(s); e.setDate(e.getDate() + days - 1); return e; };
  // Already finished this year → roll to next year (annual events only; a one-off
  // just reports its past date, and the caller can choose to drop it).
  if (endOf(start) < today && ev.recurs === 'annual') start = mk(now.getFullYear() + 1);
  const end = endOf(start);
  const daysUntil = Math.round((startOfDay(start) - today) / DAY_MS);
  return { start, end, daysUntil };
}

// "Sep 11–13 · in 12 days" — the date range plus a friendly relative phrase.
export function formatEventWhen(occ, now = new Date()) {
  if (!occ) return null;
  const { start, end, daysUntil } = occ;
  const opts = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString(undefined, opts);
  const e = end.toLocaleDateString(undefined, opts);
  const sameDay = startOfDay(start).getTime() === startOfDay(end).getTime();
  const range = sameDay ? s : `${s}–${e}`;
  const yr = start.getFullYear() !== now.getFullYear() ? ` ${start.getFullYear()}` : '';
  let rel;
  if (daysUntil < 0) rel = null;
  else if (daysUntil === 0) rel = 'today';
  else if (daysUntil === 1) rel = 'tomorrow';
  else if (daysUntil <= 60) rel = `in ${daysUntil} days`;
  else rel = null;
  return rel ? `${range}${yr} · ${rel}` : `${range}${yr}`;
}

// A sort key for "Upcoming": days until the next occurrence (events without a
// schedule sort last). Used by the list's Upcoming sort.
export function upcomingKey(spot, now = new Date()) {
  const occ = nextOccurrence(spot.tags?.event, now);
  return occ ? occ.daysUntil : Infinity;
}

// The fixed annual meteor-shower calendar — real, recurring, and accurate enough
// for planning (peaks drift ±1 day year to year; the label says "peak"). Dates
// are the commonly-cited Northern-Hemisphere peak nights.
export const METEOR_SHOWERS = [
  { month: 1, day: 3, when: 'Quadrantid meteor shower peak' },
  { month: 4, day: 22, when: 'Lyrid meteor shower peak' },
  { month: 5, day: 6, when: 'Eta Aquariid meteor shower peak' },
  { month: 8, day: 12, days: 2, when: 'Perseid meteor shower peak' },
  { month: 10, day: 21, when: 'Orionid meteor shower peak' },
  { month: 11, day: 17, when: 'Leonid meteor shower peak' },
  { month: 12, day: 13, days: 2, when: 'Geminid meteor shower peak' },
];

function regionCenter(region) {
  if (region?.center) return { lat: region.center.lat, lng: region.center.lng };
  const b = region.bbox;
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

// Computed sky-event spots for a region — the meteor-shower peaks, placed at the
// region centre and marked skywide (visible region-wide, not a single spot).
export function buildCelestialEvents(region) {
  if (!region) return [];
  const c = regionCenter(region);
  return METEOR_SHOWERS.map((m) => ({
    id: `evt-meteor-${region.id}-${m.month}-${m.day}`,
    name: m.when.replace(' peak', ''),
    lat: c.lat,
    lng: c.lng,
    category: 'event',
    subject_type: ['night_sky'],
    best_light: ['night'],
    best_season: [],
    access_difficulty: 'unknown',
    notes: 'Visible across the whole region on a clear, dark night — best after the Moon sets (see Tonight).',
    tags: { event: { month: m.month, day: m.day, days: m.days ?? 1, when: m.when, recurs: 'annual', skywide: true } },
    sources: [{ source: 'computed', source_id: `meteor-${m.month}-${m.day}`, source_license: 'n/a', source_url: null, first_seen: null, last_seen: null }],
  }));
}
