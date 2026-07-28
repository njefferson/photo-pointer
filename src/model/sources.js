// Attribution, stated in full — without shipping it thousands of times.
//
// THE PROBLEM this solves. Every spot carries a `sources` list, and each entry
// carried a licence string and a link. MEASURED on the Sacramento region: 3,038
// source entries holding EIGHT distinct licence strings (131 KB), and 172 KB of
// links, 96% of which simply spelled out `source` + `source_id` in that source's
// usual URL shape. Together with the pretty-printing that is about half the file
// the reader downloads and parses on a phone.
//
// WHAT IS NOT NEGOTIABLE: licensing is load-bearing here (every adapter honours
// its source's terms, and a card states them). So nothing is dropped. The
// licence is stated ONCE per region and attached back to every source at load;
// a link is rebuilt from the id when the shape is known and shipped verbatim
// when it is not. A reader cannot tell the difference; the network can.
//
// THE ONE RULE for the table below: a pattern lives here ONLY if it reproduces
// the stored URL EXACTLY for every record we have. Verified across all seven
// regions — 9,292 of 9,938 links rebuild byte-identically. The 646 that do not
// are kept as they are, and the test pins that fact so a source quietly changing
// its URL shape fails the build instead of shipping broken links.

// source id → canonical URL. `null` means "this source has no derivable shape,
// always ship the link" — Wikidata is the honest example: its link is a
// Wikipedia ARTICLE TITLE, which a QID cannot produce.
export const URL_PATTERNS = {
  osm: (id) => `https://www.openstreetmap.org/${id}`,
  ebird: (id) => `https://ebird.org/hotspot/${id}`,
  // Only an 8-digit reference number has an NPGallery record page. MEASURED:
  // 674 ids of 8 digits deep-link; 37 of NINE digits (newer listings) have no
  // page and deliberately cite the dataset instead. Deriving blindly would have
  // invented 37 links to nothing — the adapter's "cite the dataset rather than
  // guess a URL" rule has to live here too, or this module quietly undoes it.
  nrhp: (id) => (/^\d{8}$/.test(String(id)) ? `https://npgallery.nps.gov/AssetDetail/NRIS/${id}` : null),
  ridb: (id) => `https://www.recreation.gov/camping/campgrounds/${id}`,
  gnis: (id) => `https://edits.nationalmap.gov/apps/gaz-domestic/public/summary/${id}`,
  usanpn: () => 'https://www.usanpn.org/data',
  wikimedia_commons: (id) => 'https://commons.wikimedia.org/wiki/Special:Search?search=nearcoord:1km,'
    + String(id).replace(/^cluster:/, ''),
  wikidata: null,
  curated: null,
};

export function deriveUrl(source, sourceId) {
  const fn = URL_PATTERNS[source];
  if (!fn || sourceId == null || sourceId === '') return null;
  return fn(sourceId);
}

// Put back what the file no longer repeats. Safe to run on data that still
// carries everything — a stored value always wins, so a lean file and a full
// one both come out of here identical. That is what lets the app ship BEFORE
// the ingest starts writing the leaner shape.
export function expandSource(entry, licenses = {}) {
  if (!entry) return entry;
  const out = { ...entry };
  if (out.source_license == null) out.source_license = licenses[out.source] ?? null;
  if (out.source_url == null) out.source_url = deriveUrl(out.source, out.source_id);
  return out;
}

export function expandSources(spots, licenses = {}) {
  if (!Array.isArray(spots)) return [];
  return spots.map((s) => (
    Array.isArray(s.sources) && s.sources.length
      ? { ...s, sources: s.sources.map((e) => expandSource(e, licenses)) }
      : s
  ));
}
