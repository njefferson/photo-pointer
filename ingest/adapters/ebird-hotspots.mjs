// eBird hotspots — STUB (wildlife_hotspot).
//
// LICENSE: eBird API Terms of Use — attribution required ("Data from eBird,
// Cornell Lab of Ornithology"); bulk redistribution of observation data is
// restricted. Hotspot NAMES + COORDINATES via the public API are the safe
// subset; do not mirror observation data here.
//
// KEY: requires an eBird API token in env EBIRD_API_TOKEN (repo secret on
// the runner — never committed, never shipped to the browser).
//
// SHORTCUT WORTH TAKING FIRST: the sibling repo Bird-location-scouting
// already commits full-depth hotspot JSON for exactly this region
// (frame/data/counties/US-CA-067.json, US-CA-017.json, US-CA-061.json:
// locId, name, lat, lng per hotspot) — normalizing from those files needs
// no key and no network. The API path below is for regions Frame doesn't
// cover.
//
// TODO(ebird):
//  - GET https://api.ebird.org/v2/ref/hotspot/{ebird_region}?fmt=json with
//    header 'X-eBirdApiToken: <EBIRD_API_TOKEN>' for each county in
//    config/region.json (field `ebird_region`).
//  - Map to category 'wildlife_hotspot', subject_type ['birds','wildlife'],
//    best_light ['sunrise'] (birds are a dawn subject).
//  - source_id = locId; source_url = https://ebird.org/hotspot/<locId>.

export const meta = {
  source: 'ebird',
  name: 'eBird hotspots (Cornell Lab of Ornithology)',
  license: 'eBird API Terms of Use — attribution required, no bulk redistribution',
  attribution: 'Hotspot data from eBird, Cornell Lab of Ornithology',
  status: 'stub',
};

export async function ingest() {
  throw new Error(
    'ebird adapter is a stub — see TODO in ingest/adapters/ebird-hotspots.mjs (needs EBIRD_API_TOKEN, or normalize from Bird-location-scouting committed county JSON)'
  );
}
