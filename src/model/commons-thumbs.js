// Thumbnails of the photographs a discovered place is made of.
//
// WHY ONLY DISCOVERED PLACES. Everywhere else on this map, a photograph is
// incidental — the place is listed by OpenStreetMap or the National Register and
// the photos merely exist near it, so a link out is the honest weight. A
// `photo_cluster` pin is different: the photographs ARE the reason it is on the
// map at all, and we have no name for it. A thumbnail answers "what is this
// place" better than any sentence we could write.
//
// BEHIND A TAP, NEVER AUTOMATIC. Two reasons, and the second is the important
// one. (1) Bandwidth: nobody should spend it on a card they only glanced at.
// (2) Commons is not curated for this app. A geosearch near a pin returns
// whatever anyone geotagged there, and we cannot preview it. Asking first means
// nothing arrives unbidden.
//
// LICENSING (Doctrine §8, and load-bearing here). Everything on Commons is
// freely licensed, but most of it is CC-BY or CC-BY-SA, which REQUIRE the author
// and licence to be shown with the image. So attribution is not decoration on
// this feature — it is the condition of using it at all, and a thumbnail without
// it does not get rendered.
//
// SERVICE ETIQUETTE. This is an INTERACTIVE request — one, made because a person
// asked for it, from their own browser and their own address. That is the case
// Wikimedia's API:Etiquette explicitly separates from the bulk/automated rules
// our ingest adapters follow: no maxlag (it exists so batch jobs step aside, and
// would only make a person's tap fail during lag) and no artificial pacing.
// https://www.mediawiki.org/wiki/API:Etiquette

export const API = 'https://commons.wikimedia.org/w/api.php';

// How wide a thumbnail Wikimedia should render for us. 320 is about twice the
// tile's CSS width, so it stays sharp on a retina phone without paying for a
// full-size image. Their scaler caps at 50 scaled images per request; we ask for
// far fewer than that.
export const THUMB_WIDTH = 320;
export const MAX_THUMBS = 6;
export const SEARCH_RADIUS_M = 350;

export function buildUrl(lat, lng, { limit = MAX_THUMBS, radius = SEARCH_RADIUS_M, width = THUMB_WIDTH } = {}) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    // ONE request: geosearch chooses the files and imageinfo describes them.
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: String(radius),
    ggsnamespace: '6',
    ggslimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(width),
    // Only the fields attribution actually needs — asking for all of
    // extmetadata returns a great deal we would throw away.
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|Credit',
    // Anonymous cross-origin read.
    origin: '*',
  });
  return `${API}?${p.toString()}`;
}

// extmetadata values arrive as HTML fragments — an Artist is typically an
// anchor. NEVER put that in the DOM as markup: it is text supplied by whoever
// uploaded the file. Reduced to plain text here, and the link to the source is
// one we construct ourselves from the file's own description page.
export function plainText(html, { max = 120 } = {}) {
  const text = String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function normalizePage(page) {
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl || !info?.descriptionurl) return null;
  const meta = info.extmetadata ?? {};
  const licence = plainText(meta.LicenseShortName?.value, { max: 40 });
  // NO LICENCE, NO THUMBNAIL. We cannot state the terms we are using it under,
  // so we do not use it. This should be vanishingly rare on Commons; when it
  // happens, the file is simply left out rather than shown bare.
  if (!licence) return null;
  const author = plainText(meta.Artist?.value ?? meta.Credit?.value, { max: 80 });
  return {
    title: plainText(page.title, { max: 90 }),
    thumb: info.thumburl,
    width: info.thumbwidth ?? null,
    height: info.thumbheight ?? null,
    // The file's own page carries the full licence text and author — the link
    // every attribution should point at.
    page: info.descriptionurl,
    author: author || 'Unknown author',
    licence,
  };
}

// Fetch thumbnails for one place. Fails soft: offline, blocked or throttled all
// return an empty list, and the caller says so rather than showing a broken grid.
export async function thumbsNear(lat, lng, { fetchFn = fetch, signal, ...opts } = {}) {
  let json;
  try {
    const res = await fetchFn(buildUrl(lat, lng, opts), {
      signal: signal ?? AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }
  const pages = json?.query?.pages ?? [];
  return (Array.isArray(pages) ? pages : Object.values(pages))
    .map(normalizePage)
    .filter(Boolean);
}
