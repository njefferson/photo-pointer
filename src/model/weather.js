// weather.js — will it be clear tonight? Live from Open-Meteo (free, no key,
// CORS-friendly). Fetched per spot when its popup opens, not for the whole
// dataset. Fails soft (returns null) so the app never depends on the network.

const BASE = 'https://api.open-meteo.com/v1/forecast';

export async function cloudTonight(lat, lng, { fetchFn = fetch } = {}) {
  const url = `${BASE}?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&hourly=cloud_cover&forecast_days=2&timezone=auto`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = await res.json();
    const times = j?.hourly?.time ?? [];
    const clouds = j?.hourly?.cloud_cover ?? [];
    // Tonight's dark hours (21:00–04:00 local) from the first ~30 hours.
    const night = [];
    for (let i = 0; i < Math.min(times.length, 30); i++) {
      const h = Number(String(times[i]).slice(11, 13));
      if ((h >= 21 || h <= 4) && typeof clouds[i] === 'number') night.push(clouds[i]);
    }
    if (!night.length) return null;
    const avg = Math.round(night.reduce((a, b) => a + b, 0) / night.length);
    return { avgCloud: avg, verdict: avg < 20 ? 'clear' : avg < 50 ? 'partly cloudy' : 'cloudy' };
  } catch {
    return null;
  }
}
