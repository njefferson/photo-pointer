// airquality.js — how's the air today? Live from Open-Meteo's Air Quality API
// (free, no key, CORS-friendly), fetched per spot when its popup opens. Fails
// soft (null) so the app never depends on the network.
//
// WHY THIS AND NOT NASA FIRMS: a committed 24-hour fire snapshot is stale the
// moment it lands. Open-Meteo AQI is live at view time (like the weather), and
// PM2.5 is exactly what WILDFIRE SMOKE spikes — so this one number answers both
// "is the air healthy" and "is it smoky" without a key or a stale commit.

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// US AQI category bands.
export function aqiCategory(aqi) {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'unhealthy for sensitive groups';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very unhealthy';
  return 'hazardous';
}

export async function airToday(lat, lng, { fetchFn = fetch } = {}) {
  const url = `${BASE}?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&hourly=us_aqi,pm2_5&forecast_days=1&timezone=auto`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = await res.json();
    const aqi = (j?.hourly?.us_aqi ?? []).filter((v) => typeof v === 'number');
    const pm = (j?.hourly?.pm2_5 ?? []).filter((v) => typeof v === 'number');
    if (!aqi.length) return null;
    // Today's PEAK — robust without needing a reliable cross-timezone "now",
    // and the peak is what you care about for planning a shoot.
    const maxAqi = Math.round(Math.max(...aqi));
    const pm25peak = pm.length ? Math.round(Math.max(...pm)) : null;
    // PM2.5 above ~35 µg/m³ is the unhealthy-for-sensitive line and, out here,
    // usually means wildfire smoke.
    const smoke = pm25peak != null && pm25peak >= 35;
    return { maxAqi, category: aqiCategory(maxAqi), pm25peak, smoke };
  } catch {
    return null;
  }
}
