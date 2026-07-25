// =============================================================================
// NOTABILITY — is a place a genuinely notable landmark, or just a community-
// tagged OSM point (a baseball diamond mistagged historic=monument)?
// =============================================================================
// A marker is "verified" when something corroborates it: a Wikidata/Wikipedia
// entry, a real Historical Marker Database id, a California Historical Landmark,
// a heritage listing, or an actual plaque inscription. Verified markers earn the
// historical-marker pin; unverified ones are dropped from the map — UNLESS the
// spot carries other worthwhile data (people photograph it, or wildlife is there)
// that makes it a real location for another reason.
// =============================================================================

export function notableReasons(spot) {
  const t = spot.tags ?? {};
  const reasons = [];
  if (t.california_landmark) reasons.push('California Historical Landmark');
  if (t.hmdb) reasons.push('in the Historical Marker Database');
  if (t.heritage) reasons.push('heritage-listed');
  if (t.wikipedia || t.wikidata) reasons.push('has a Wikipedia article');
  else if ((spot.sources ?? []).some((s) => s.source === 'wikidata')) reasons.push('verified in Wikidata');
  if (!reasons.length && t.inscription) reasons.push('has a plaque inscription');
  return reasons;
}

export function isVerified(spot) {
  return notableReasons(spot).length > 0;
}

// Other worthwhile data that justifies keeping an unverified marker: it's a real
// photo location (people photograph it) or a wildlife spot.
export function markerHasWorthwhileData(spot) {
  const t = spot.tags ?? {};
  return !!(t.commons?.photos || t.inaturalist?.observations || t.ebird_species);
}

// The `oddity` pin is meant for Atlas-Obscura-type curiosities (public art,
// ruins, mines, odd natural features). But OSM's `tourism=attraction` tag is
// self-applied and sweeps in businesses, community pools and theme-park rides
// (a dog breeder, "Cinderella's Coach"). Keep an attraction-sourced oddity only
// when it's actually a curiosity: a real natural/historic/geological feature, or
// something corroborates it (a Wikipedia/Wikidata entry, freely-licensed photos
// of it, or a second independent source). The other oddity sources — artwork,
// ruins, mines — are trusted and kept as-is.
export function keepOddity(spot) {
  const t = spot.tags ?? {};
  const documented = !!(t.wikipedia || t.wikidata || (t.commons?.photos >= 3));
  // An oddity with NO name gives the user nothing to identify — it reads as map
  // cruft (an unnamed art node looks like a roundabout). Keep an unnamed one only
  // if it's genuinely documented: a Wikipedia/Wikidata entry or freely-licensed
  // photos taken of it.
  if (!spot.name) return documented;
  // Named: the self-applied `tourism=attraction` tag is junk unless the place is
  // a real natural/historic feature or is corroborated.
  if (t.tourism !== 'attraction') return true;
  if (t.natural || t.historic || t.geological) return true;
  return documented || (spot.sources ?? []).length > 1;
}

// Whether to keep a spot on the map at all. Filters the two categories where OSM
// junk collects — markers (mistagged historic points) and oddities (self-applied
// tourism=attraction) — and keeps everything else as-is.
export function keepSpot(spot) {
  if (spot.category === 'marker') return isVerified(spot) || markerHasWorthwhileData(spot);
  if (spot.category === 'oddity') return keepOddity(spot);
  return true;
}

// Split the broad `oddity` bucket into finer pin types so each gets its own
// filter button (ghost towns, waterfalls, hot springs, lighthouses, ruins). Uses
// the curiosity KIND the Wikidata adapter tagged, or the OSM historic tag. The
// remaining kinds (roadside attractions, land art, arches, lookouts, the balloon
// race, OSM artwork) stay 'oddity' — the quirky catch-all. Run AFTER keepSpot
// (which keys on the original 'oddity' category). Returns a copy when it changes.
const CURIOSITY_CATEGORY = {
  'Ghost town': 'ghost_town',
  'Waterfall': 'waterfall',
  'Hot spring': 'hot_spring',
  'Lighthouse': 'lighthouse',
  'Cave': 'cave',
  'Natural arch': 'arch',
  'Observation tower': 'lookout_tower',
  'Shipwreck': 'shipwreck',
  'Archaeological site': 'archaeological',
  'Land art': 'public_art',
  // 'Roadside attraction' deliberately stays `oddity` — that IS the quirky bucket.
};
// OSM-native tags → the same finer pin types. This is both a backstop for
// features that carry the raw tag but no `curiosity` kind (a geyser also tagged
// tourism=attraction matched the generic oddity rule at ingest), and the way the
// big over-collapsed buckets get split: a named PEAK is a summit, not a generic
// "viewpoint"; a nature reserve is not a city park; a mural is not an "oddity".
const FEATURE_TAG_CATEGORY = {
  'natural=hot_spring': 'hot_spring',
  'natural=geyser': 'hot_spring',
  'natural=waterfall': 'waterfall',
  'natural=peak': 'summit',
  'natural=cave_entrance': 'cave',
  'natural=arch': 'arch',
  'natural=tree': 'notable_tree',
  'man_made=lighthouse': 'lighthouse',
  'historic=archaeological_site': 'archaeological',
  'historic=wreck': 'shipwreck',
  'historic=mine': 'mine',
  'historic=ruins': 'ruins',
  'tourism=artwork': 'public_art',
  'leisure=nature_reserve': 'nature_reserve',
};
// Categories that are never reclassified: an event and a user's own pin mean
// what they say regardless of any tags that rode along through a merge.
const PROTECTED = new Set(['event', 'user_pin']);
// The BROAD buckets a raw OSM tag is allowed to refine. Anything else is already
// a specific claim, so a stray tag picked up in a dedup merge must not hijack it
// (a historical marker that merged with a ruins node stays a marker).
const REFINABLE = new Set(['oddity', 'viewpoint', 'park']);

export function refineCategory(spot) {
  const t = spot.tags ?? {};
  if (PROTECTED.has(spot.category)) return spot;
  // A curiosity KIND is our own adapters' explicit claim about what this place
  // is, so it wins from ANY category — a waterfall that deduped into an OSM
  // viewpoint still filters as a Waterfall.
  let next = CURIOSITY_CATEGORY[t.curiosity];
  // Raw OSM tags only refine the broad buckets, most specific tag first.
  if (!next && REFINABLE.has(spot.category)) {
    next = FEATURE_TAG_CATEGORY[`historic=${t.historic}`]
      ?? FEATURE_TAG_CATEGORY[`natural=${t.natural}`]
      ?? FEATURE_TAG_CATEGORY[`man_made=${t.man_made}`]
      ?? FEATURE_TAG_CATEGORY[`tourism=${t.tourism}`]
      ?? FEATURE_TAG_CATEGORY[`leisure=${t.leisure}`];
  }
  if (next) return next === spot.category ? spot : { ...spot, category: next };
  return spot;
}
