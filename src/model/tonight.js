// tonight.js — "is tonight good, and when?" for a spot. On-device via the
// vendored astronomy-engine (MIT); no network. Pairs with the Bortle layer:
// a dark spot on a moonless, clear night is the Milky Way jackpot.
//
// Reports: moon phase + illuminated fraction, moonrise/set, the astronomical
// night (Sun below −18°), and the DARK WINDOW — the part of astronomical night
// when the Moon is also down (true Milky-Way time).

import * as A from '../vendor/astronomy.js';

function anchor(lat, lng, date) {
  // Anchor at the spot's local NOON (estimated from longitude) so the COMING
  // night's events fall in order within the next ~18 h: this evening's dusk
  // (sun descending to −18°) then tomorrow's dawn (ascending). A midnight
  // anchor would miss the evening dusk that already happened.
  const solarOffsetMs = (-lng / 15) * 3600 * 1000;
  return A.MakeTime(new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12) + solarOffsetMs
  ));
}

export function moonPhaseName(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return 'new';
  if (a < 67.5) return 'waxing crescent';
  if (a < 112.5) return 'first quarter';
  if (a < 157.5) return 'waxing gibbous';
  if (a < 202.5) return 'full';
  if (a < 247.5) return 'waning gibbous';
  if (a < 292.5) return 'last quarter';
  return 'waning crescent';
}

function moonAltitude(observer, time) {
  const eq = A.Equator(A.Body.Moon, time, observer, true, true);
  return A.Horizon(time, observer, eq.ra, eq.dec, 'normal').altitude;
}

export function moonTonight(lat, lng, date = new Date()) {
  const observer = new A.Observer(lat, lng, 0);
  const t0 = anchor(lat, lng, date);

  const illum = A.Illumination(A.Body.Moon, t0);
  const phaseAngle = A.MoonPhase(t0); // 0=new, 180=full

  const duskT = A.SearchAltitude(A.Body.Sun, observer, -1, t0, 1, -18);
  const dawnT = A.SearchAltitude(A.Body.Sun, observer, +1, t0, 1, -18);
  const moonriseT = A.SearchRiseSet(A.Body.Moon, observer, +1, t0, 1);
  const moonsetT = A.SearchRiseSet(A.Body.Moon, observer, -1, t0, 1);

  const out = {
    illumination: illum.phase_fraction, // 0..1 lit
    phaseName: moonPhaseName(phaseAngle),
    moonrise: moonriseT ? moonriseT.date : null,
    moonset: moonsetT ? moonsetT.date : null,
    astroNight: duskT && dawnT ? { start: duskT.date, end: dawnT.date } : null,
    darkWindow: null,
    polar: !duskT || !dawnT, // sun never gets to −18° (won't happen at this latitude)
  };

  // Darkest window: the longest stretch of astronomical night with the Moon
  // also below the horizon. Sample at 12-min steps — robust, no fragile
  // rise/set intersection.
  if (out.astroNight) {
    const start = out.astroNight.start.getTime();
    const end = out.astroNight.end.getTime();
    const STEP = 12 * 60 * 1000;
    let runStart = null, best = null;
    for (let ms = start; ms <= end; ms += STEP) {
      const down = moonAltitude(observer, A.MakeTime(new Date(ms))) < 0;
      if (down && runStart == null) runStart = ms;
      if ((!down || ms + STEP > end) && runStart != null) {
        const runEnd = down ? ms : ms - STEP;
        if (!best || runEnd - runStart > best.end - best.start) best = { start: runStart, end: runEnd };
        runStart = null;
      }
    }
    if (best && best.end > best.start) {
      out.darkWindow = { start: new Date(best.start), end: new Date(best.end) };
    }
  }
  return out;
}

// ── THE MILKY WAY CORE ──────────────────────────────────────────────────────
//
// The dark window says WHEN it is dark. It does not say whether the thing you
// came to photograph is above the horizon — and for most of the year, in the
// northern hemisphere, it is not. The bright core of the galaxy sits in
// Sagittarius, far enough south that it clears the horizon for only part of the
// year and only part of the night, and never rises high from northern latitudes.
// That is the fact that decides whether the shot exists at all.
//
// Sagittarius A*, the galactic centre, is a FIXED equatorial coordinate, so the
// same horizon maths already used for the Moon works unchanged — no ephemeris,
// no network, correct offline.
export const GALACTIC_CORE = { ra: 17.7611, dec: -29.0078 }; // RA in hours, dec in degrees

// Usable altitude: below this the core is buried in horizon murk and whatever
// light dome is down there, however dark the sky overhead.
export const CORE_MIN_ALTITUDE = 10;

export function coreAltitude(observer, time) {
  return A.Horizon(time, observer, GALACTIC_CORE.ra, GALACTIC_CORE.dec, 'normal').altitude;
}

// Compass bearing of the core at a given moment — where to point the camera.
export function coreAzimuth(observer, time) {
  return A.Horizon(time, observer, GALACTIC_CORE.ra, GALACTIC_CORE.dec, 'normal').azimuth;
}

// When, tonight, is the core BOTH usably high AND in genuinely dark sky?
// Intersects the core's own above-altitude window with the dark window that
// moonTonight already computes, so the answer accounts for the Moon.
//
// Returns null when the core never clears CORE_MIN_ALTITUDE in the dark tonight
// — which is the honest answer for most of autumn and winter, and the whole
// point: it tells you not to drive out.
export function milkyWayTonight(lat, lng, date = new Date()) {
  const observer = new A.Observer(lat, lng, 0);
  const t = moonTonight(lat, lng, date);
  const dark = t.darkWindow ?? t.astroNight;
  if (!dark) return null;

  const start = dark.start.getTime();
  const end = dark.end.getTime();
  const STEP = 10 * 60 * 1000;
  let best = null;           // highest the core gets while it is dark
  let winStart = null, win = null;
  for (let ms = start; ms <= end; ms += STEP) {
    const time = A.MakeTime(new Date(ms));
    const alt = coreAltitude(observer, time);
    if (!best || alt > best.alt) best = { alt, ms };
    if (alt >= CORE_MIN_ALTITUDE) {
      if (winStart === null) winStart = ms;
      win = ms;
    } else if (winStart !== null) {
      break; // the core has set (or not yet risen); one continuous window is enough
    }
  }
  if (winStart === null) {
    return { visible: false, maxAltitude: best ? Math.round(best.alt) : null,
             moonFree: !!t.darkWindow };
  }
  const peak = A.MakeTime(new Date(best.ms));
  return {
    visible: true,
    start: new Date(winStart),
    end: new Date(win),
    maxAltitude: Math.round(best.alt),
    peakAt: best.ms ? new Date(best.ms) : null,
    azimuthAtPeak: Math.round(coreAzimuth(observer, peak)),
    // false = the window is astronomical night but the Moon is up washing it out.
    moonFree: !!t.darkWindow,
  };
}
