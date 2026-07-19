// iNaturalist observations — STUB (wildlife_hotspot enrichment).
//
// LICENSE: per-OBSERVATION licensing — users choose CC0/CC-BY/CC-BY-NC/all-
// rights-reserved. The API exposes the license on every record; ingest MUST
// filter to open licenses (CC0/CC-BY/CC-BY-SA) and record the one each
// record actually carries. Aggregate "much wildlife observed here" derived
// facts are fine; verbatim content follows the record's license.
//
// KEY: none needed for the public API (rate limits apply — stay under
// ~1 req/s, set a descriptive User-Agent).
//
// TODO(inaturalist):
//  - GET https://api.inaturalist.org/v1/observations with nelat/nelng/swlat/
//    swlng from region bbox, quality_grade=research, license in
//    (cc0,cc-by,cc-by-sa), per_page=200 + pagination.
//  - Cluster observations (dedup.js grid) into wildlife_hotspot spots at
//    dense locations rather than one spot per observation.
//  - subject_type from iconic_taxon_name (Aves → 'birds', else 'wildlife').

export const meta = {
  source: 'inaturalist',
  name: 'iNaturalist',
  license: 'per-record CC licensing — ingest filters to CC0/CC-BY/CC-BY-SA only',
  attribution: 'Observation data from iNaturalist (per-record licenses)',
  status: 'stub',
};

export async function ingest() {
  throw new Error(
    'inaturalist adapter is a stub — see TODO in ingest/adapters/inaturalist.mjs (filter to open licenses, cluster into hotspots)'
  );
}
