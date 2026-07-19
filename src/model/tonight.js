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
