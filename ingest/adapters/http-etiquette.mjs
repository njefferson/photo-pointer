// How we behave toward the services we depend on.
//
// Every source here is either volunteer-run (Overpass), donation-funded
// (Wikimedia, Wikidata, iNaturalist) or tax-funded (USGS, NPS, NOAA,
// Recreation.gov). None of them owes a free personal map anything. So:
//
//   1. IDENTIFY OURSELVES. Every request carries a real User-Agent naming the
//      project and where to find it, so an operator seeing our traffic can tell
//      what it is and contact us.
//   2. A 429 IS AN INSTRUCTION, NOT AN OBSTACLE. When a service says it is
//      being asked too much, the answer is to wait longer — not to retry
//      harder, spread across more connections, or route around to a mirror.
//   3. IF IT TELLS US HOW LONG, WAIT THAT LONG. `Retry-After` is the service
//      stating its own terms; guessing a shorter backoff ignores them.
//   4. NEVER ASK TWICE FOR WHAT WE ALREADY HAVE. Committed data is the cache.
//      Re-running an ingest for convenience spends someone else's bandwidth to
//      tell us something we already know.

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
