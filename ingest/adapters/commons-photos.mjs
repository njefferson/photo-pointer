// Wikimedia Commons photo density — WORKING (enrichment).
//
// The replacement for Flickr (whose API keys are now PRO-only, 2026-07-19).
// EVERYTHING on Wikimedia Commons is already freely licensed (CC0/CC-BY/
// CC-BY-SA/public-domain) — that is the entry requirement for the site — so
// unlike Flickr there is NO per-photo license to filter: a geolocated file on
// Commons is, by definition, a reusable photo of that place. We count how many
// exist near each spot as a "how photographed / how photogenic is this place"
// signal. We store only the COUNT (a fact), never the images.
//
// LICENSE: the derived count is ours; the media it counts is CC/PD on Commons.
// Attribution to Commons is courteous.
//
// KEY: none. MediaWiki API (geosearch) is keyless but wants a descriptive
// User-Agent. Per-spot radius query — runs on a runner (sandbox blocked).

export const meta = {
  source: 'wikimedia_commons',
  name: 'Wikimedia Commons geotagged photo density',
  license: 'CC/public-domain media (Commons); derived counts only',
  attribution: 'Photo locations from Wikimedia Commons',
  status: 'working',
};

export const API = 'https://commons.wikimedia.org/w/api.php';
export const USER_AGENT =
  'photo-pointer/0.10 (personal open-data map; github.com/njefferson/photo-pointer)';
export const RADIUS_M = 800;   // "near this spot"
export const GS_LIMIT = 100;   // count tiers; 100 reads as "100+"

// Count freely-licensed geolocated Commons files within RADIUS_M of a point.
// Returns { photos, capped } or throws after retries.
export async function countPhotosNear(lat, lng, { fetchFn = fetch, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url =
    `${API}?action=query&format=json&list=geosearch&gsnamespace=6` +
    `&gscoord=${lat}%7C${lng}&gsradius=${RADIUS_M}&gslimit=${GS_LIMIT}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429) { await wait(4000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const hits = json?.query?.geosearch ?? [];
      return { photos: hits.length, capped: hits.length >= GS_LIMIT };
    } catch (e) {
      if (attempt === 2) throw new Error(`commons geosearch: ${e.message}`);
      await wait(1200 * (attempt + 1));
    }
  }
}
