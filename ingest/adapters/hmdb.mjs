// Historical Marker Database (HMdb.org) — SUPERSEDED by wikidata-markers.mjs.
//
// The clean path shipped there (0.9.0): HMdb has no official public API and its
// inscriptions/photos/commentary are COPYRIGHTED, so we take marker FACTS (name
// + coordinates) from Wikidata (CC0, property P7883 = HMdb Marker ID, P5651 =
// California Historical Landmark) and LINK OUT to the HMdb page. No HMdb content
// is ever copied. This stub is kept as the record of WHY direct HMdb ingest was
// ruled out; do not revive it into a scraper.
//
// LICENSE / LEGAL: marker inscriptions, photos, and commentary on HMdb are
// COPYRIGHTED by their contributors. We may store marker NAME, COORDINATES,
// and a LINK (facts + reference), but must NEVER republish inscription text
// or photos.
//
// TODO(hmdb):
//  - HMdb has no official public API. Options, in preference order:
//    1. GeoJSON/KML county exports HMdb offers per-county pages — check
//       current terms before automating any fetch (be a polite citizen:
//       identify via User-Agent, cache, never hammer).
//    2. Manual per-county export committed to data/sources/ and normalized
//       here (safest; markers change rarely).
//  - Map to category 'marker', subject_type ['historic'].
//  - source_id = HMdb marker number; source_url = the marker's HMdb page.

export const meta = {
  source: 'hmdb',
  name: 'Historical Marker Database',
  license: 'proprietary — facts/links only, NO content republication',
  attribution: 'Marker data via HMdb.org',
  status: 'stub',
};

export async function ingest() {
  throw new Error(
    'hmdb adapter is a stub — see TODO in ingest/adapters/hmdb.mjs (facts/links only; never republish inscription text or photos)'
  );
}
