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

// Whether to keep a spot on the map at all. Only the marker category is filtered
// (that's where the OSM junk lives); everything else is kept as-is.
export function keepSpot(spot) {
  if (spot.category !== 'marker') return true;
  return isVerified(spot) || markerHasWorthwhileData(spot);
}
