// Flickr geo-search — STUB (where do photographers actually shoot?).
//
// LICENSE: per-PHOTO licensing. Ingest ONLY photos whose license is
// CC/public-domain: Flickr license ids 1–6 (CC variants), 7 (no known
// copyright restrictions), 9 (CC0), 10 (US Government/PD mark). Record the
// exact license id per photo. NC/ND variants (ids 1,2,3 include NC/ND —
// check the license table at flickr.com/services/api/flickr.photos.licenses.getInfo.html
// at implementation time and keep only what our use satisfies). All-rights-
// reserved photos (id 0) are NEVER ingested. We store photo METADATA
// (location, title, page link) to derive spot density — hotlinking or
// copying image bytes follows the per-photo license strictly.
//
// NO INSTAGRAM, NO SOCIAL-PLATFORM SCRAPING — Flickr's licensed public API
// with explicit CC filtering is the only photo-sharing source permitted in
// this project. Do not add others.
//
// KEY: requires FLICKR_API_KEY (free, non-commercial key — repo secret).
//
// TODO(flickr):
//  - flickr.photos.search with bbox from region config, license=<open ids>,
//    has_geo=1, extras=geo,license,owner_name,date_taken, per_page=250.
//  - Cluster geotags (dedup.js grid) into candidate spots; a dense cluster
//    of CC photos at one point = strong "photo-worthy" signal → boost or
//    create a spot (category from nearest OSM feature, else 'viewpoint').
//  - source_id = photo id; source_url = the photo's Flickr page.

export const meta = {
  source: 'flickr',
  name: 'Flickr (CC/public-domain geo-search)',
  license: 'per-photo — only CC/PD-licensed photos are ever ingested',
  attribution: 'Photo location data from Flickr (CC/PD-licensed photos only)',
  status: 'stub',
};

export async function ingest() {
  throw new Error(
    'flickr adapter is a stub — see TODO in ingest/adapters/flickr.mjs (needs FLICKR_API_KEY; CC/PD licenses only)'
  );
}
