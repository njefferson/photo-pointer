// How we behave toward the services we depend on.
//
// WE GOT THIS WRONG FIRST. The rules below were originally inferred from the
// error codes we happened to receive, rather than read from what each service
// publishes. That is backwards, and it led to running 4 concurrent requests at
// a 120 ms gap against Wikimedia — outside their stated terms — until they
// throttled us, at which point the instinct was to retry harder. The throttle
// was not an obstacle. It was the service asking us to stop, and we should
// never have been there to be asked.
//
// THE PUBLISHED POLICIES, which are the authority here — read them before
// changing any pacing, and cite them in the code:
//
//   Wikimedia (Commons, Wikidata/WDQS)
//     https://www.mediawiki.org/wiki/API:Etiquette
//     https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
//     - Serial requests: total concurrency of at most 1.
//     - At least 1 second between requests.
//     - Send `maxlag` on non-interactive jobs so reads defer when their
//       databases are lagging.
//     - User-Agent must identify the tool and give contact information
//       (a full URL or an email).
//     - Respect Retry-After on 429.
//
//   OpenStreetMap / Overpass
//     https://operations.osmfoundation.org/policies/api/
//     https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
//     - Roughly 10,000 requests and under 1 GB of download per day. We are far
//       below both: a handful of large queries per region, run rarely.
//     - Heavy users are load-shed first, so keep the footprint small.
//     - Run your own instance if you need more. If our usage ever grows toward
//       those numbers, that is the answer — not more mirrors.
//
//   OSM tile usage policy applies to the BROWSER, not this ingest, and is why
//   _headers sets a Referrer-Policy that still sends an origin (see 1.4.2).
//
// THE STANDING RULES:
//   1. IDENTIFY OURSELVES on every request, with contact information.
//   2. A 429 IS AN INSTRUCTION, NOT AN OBSTACLE. Never retry harder, widen
//      concurrency, or route around to another mirror to evade one.
//   3. IF THE SERVICE STATES Retry-After, WAIT THAT LONG. Our guess does not
//      override their terms.
//   4. NEVER ASK TWICE FOR WHAT WE ALREADY HAVE. Committed data is the cache;
//      per-spot sweeps record what they probed and skip it for 30 days.
//   5. NO BULK SWEEP WHERE A TARGETED QUERY EXISTS.
//
// One canonical User-Agent for every adapter, in the format Wikimedia's policy
// specifies: tool name, version, and a contactable full URL.
export const USER_AGENT =
  'photo-pointer/1.15 (https://github.com/njefferson/photo-pointer)';

// `Retry-After` is either a number of seconds or an HTTP date. Returns ms to
// wait, or null when the header is absent or unparseable.
//
// CAP: a service asking for an implausibly long wait is telling us to come back
// another day, not to hold a runner open for an hour — the caller should give
// up instead, so anything past the cap reads as "stop".
export const RETRY_AFTER_CAP_MS = 120000;

export function retryAfterMs(res, { cap = RETRY_AFTER_CAP_MS } = {}) {
  const raw = res?.headers?.get?.('retry-after');
  if (!raw) return null;
  const secs = Number(String(raw).trim());
  if (Number.isFinite(secs)) {
    if (secs < 0) return null;
    return Math.min(secs * 1000, cap);
  }
  const when = Date.parse(String(raw));
  if (!Number.isFinite(when)) return null;
  const ms = when - Date.now();
  return ms <= 0 ? 0 : Math.min(ms, cap);
}

// The wait for a throttled request: what the service asked for if it said, else
// our own escalating backoff. `attempt` is 0-based.
export function backoffMs(res, attempt, { base = 5000, cap = RETRY_AFTER_CAP_MS } = {}) {
  const asked = retryAfterMs(res, { cap });
  if (asked !== null) return asked;
  return Math.min(base * (attempt + 1), cap);
}
