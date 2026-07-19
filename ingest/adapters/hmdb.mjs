// Historical Marker Database (HMdb.org) — STUB.
//
// LICENSE / LEGAL: marker inscriptions, photos, and commentary on HMdb are
// COPYRIGHTED by their contributors. We may store marker NAME, COORDINATES,
// and a LINK (facts + reference), but must NEVER republish inscription text
// or photos. The adapter enforces this shape: no `notes` from HMdb, ever.
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
