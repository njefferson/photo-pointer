// light.js — "when is the light here?" for a spot. The question photo-pointer
// is named for. Pure + node-safe; wraps the vendored astronomy-engine (MIT).
//
// All times are real JS Date instants (UTC under the hood; formatted in the
// viewer's local zone by the UI). Azimuth is a compass bearing clockwise from
// true north (0=N, 90=E, 180=S, 270=W), matching astronomy-engine's Horizon().
//
// Photographic definitions used here:
//   sunrise / sunset  — sun's upper limb at the horizon (−0.833°, engine default)
//   golden hour       — sun between −4° and +6° (warm, soft, directional light)
//   blue hour         — sun between −6° and −4° (cool twilight glow)

import * as Astronomy from '../vendor/astronomy.js';

const GOLDEN_LOW = -4;
const GOLDEN_HIGH = 6;
const BLUE_LOW = -6;

// Time (Date) when the Sun crosses `altitude` in `direction` (+1 rising,
// −1 setting) within `limitDays` of `start`. null if it never does (polar).
function sunCross(observer, altitude, direction, start, limitDays = 1) {
  const t = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, direction, start, limitDays, altitude);
  return t ? t.date : null;
}

// Sun compass azimuth (degrees from true north) at a given instant.
export function sunAzimuth(lat, lng, date) {
  const observer = new Astronomy.Observer(lat, lng, 0);
  const t = Astronomy.MakeTime(date);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, t, observer, true, true);
  return Astronomy.Horizon(t, observer, eq.ra, eq.dec, 'normal').azimuth;
}

// The day's light windows for a spot. `date` picks the day (defaults now);
// searches start at local-ish midnight UTC of that date so both morning and
// evening events fall in range.
export function sunTimesFor(lat, lng, date = new Date()) {
  const observer = new Astronomy.Observer(lat, lng, 0);
  // Anchor the 1-day search at the spot's LOCAL midnight, estimated from
  // longitude (solar time = UTC + lng/15h; no timezone database needed). This
  // keeps a single local day's events — morning then evening — in order.
  // Starting at UTC midnight would, for a US site, land in the previous
  // evening and return yesterday's sunset.
  const solarOffsetMs = (-lng / 15) * 3600 * 1000;
  const dayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + solarOffsetMs
  );
  const start = Astronomy.MakeTime(dayStart);

  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, start, 1);
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, start, 1);

  const out = {
    date: dayStart,
    sunrise: sunrise ? sunrise.date : null,
    sunset: sunset ? sunset.date : null,
    sunriseAzimuth: sunrise ? sunAzimuth(lat, lng, sunrise.date) : null,
    sunsetAzimuth: sunset ? sunAzimuth(lat, lng, sunset.date) : null,
    goldenMorning: window(
      sunCross(observer, GOLDEN_LOW, +1, start),
      sunCross(observer, GOLDEN_HIGH, +1, start)
    ),
    goldenEvening: window(
      sunCross(observer, GOLDEN_HIGH, -1, start),
      sunCross(observer, GOLDEN_LOW, -1, start)
    ),
    blueMorning: window(
      sunCross(observer, BLUE_LOW, +1, start),
      sunCross(observer, GOLDEN_LOW, +1, start)
    ),
    blueEvening: window(
      sunCross(observer, GOLDEN_LOW, -1, start),
      sunCross(observer, BLUE_LOW, -1, start)
    ),
    // true when the sun never rises or never sets this day (high latitudes)
    polar: !sunrise || !sunset,
  };
  return out;
}

function window(startDate, endDate) {
  if (!startDate || !endDate) return null;
  return { start: startDate, end: endDate };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Azimuth degrees → 8-point compass label (the non-numeric channel photographers
// actually think in: "shoot toward the SE").
export function compass(azimuth) {
  if (azimuth == null || !isFinite(azimuth)) return null;
  return COMPASS[Math.round(((azimuth % 360) + 360) % 360 / 45) % 8];
}

// Local clock time "h:mm AM/PM" for display. Uses the viewer's zone.
export function clock(date) {
  if (!date) return null;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
