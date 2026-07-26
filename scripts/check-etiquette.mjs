// SERVICE ETIQUETTE GATE — the operational twin of check-contrast.mjs.
//
// WHY THIS EXISTS. Accessibility holds in this project because it is a gate, not
// an intention: check-contrast fails the build and no one has to remember. The
// way we treat the services we depend on had no such gate, and it eroded exactly
// as you would expect — we ended up running four concurrent requests at 120 ms
// against Wikimedia, whose published etiquette asks for one request per second,
// because the rules lived in prose and prose loses to whoever is in a hurry.
//
// So: an ingest adapter that talks to the network must DECLARE the published
// policy it operates under, and declare the pacing it uses. This script fails if
// the declared pacing is looser than the declared policy, if no policy is cited,
// if requests go out unidentified, or if a 429 is not honoured. A new source
// cannot be added without someone having read the terms — the same way a new
// colour cannot be added without passing contrast.
//
// It cannot verify that a cited policy still says what we claim; only a person
// re-reading it can. What it CAN do is make the claim explicit, attributable and
// impossible to skip.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ADAPTERS = new URL('../ingest/adapters/', import.meta.url);
const files = (await readdir(ADAPTERS)).filter((f) => f.endsWith('.mjs'));

let failed = 0;
const fail = (adapter, msg) => { console.error(`FAIL ${adapter}: ${msg}`); failed++; };
const ok = (adapter, msg) => console.log(` ok  ${adapter}: ${msg}`);

for (const file of files.sort()) {
  const name = file.replace(/\.mjs$/, '');
  const src = await readFile(path.join(ADAPTERS.pathname, file), 'utf8');

  // Only adapters that actually make requests are in scope. A pure parser or a
  // documented dead stub has no one to be rude to.
  const makesRequests = /fetchFn\(|await fetch\(/.test(src);
  if (!makesRequests) continue;

  const mod = await import(new URL(file, ADAPTERS));
  const meta = mod.meta ?? {};
  const policy = meta.policy;
  const pacing = meta.pacing;

  if (!policy || typeof policy.url !== 'string' || !/^https?:\/\//.test(policy.url)) {
    fail(name, 'no meta.policy.url — cite the published usage policy this adapter operates under');
    continue;
  }
  if (!pacing || typeof pacing.concurrency !== 'number' || typeof pacing.gapMs !== 'number') {
    fail(name, 'no meta.pacing {concurrency, gapMs} — declare what we actually do');
    continue;
  }

  // The core check: we may not be looser than the terms we cite.
  if (typeof policy.maxConcurrency === 'number' && pacing.concurrency > policy.maxConcurrency) {
    fail(name, `concurrency ${pacing.concurrency} exceeds the ${policy.maxConcurrency} its policy allows (${policy.url})`);
    continue;
  }
  if (typeof policy.minGapMs === 'number' && pacing.gapMs < policy.minGapMs) {
    fail(name, `${pacing.gapMs} ms between requests is under the ${policy.minGapMs} ms its policy asks for (${policy.url})`);
    continue;
  }

  // Identify ourselves, every time.
  if (!/['"]User-Agent['"]\s*:/.test(src)) {
    fail(name, 'sends no User-Agent header — every request must say what it is and who to contact');
    continue;
  }

  // A 429 must be honoured, and honoured on the SERVICE's terms (Retry-After),
  // not on a backoff we invented.
  const handles429 = /\b429\b/.test(src);
  const honoursRetryAfter = /backoffMs\(|retryAfterMs\(/.test(src);
  if (!handles429) {
    fail(name, 'does not handle HTTP 429 — a throttle is an instruction, not an error to swallow');
    continue;
  }
  if (!honoursRetryAfter) {
    fail(name, 'handles 429 but ignores Retry-After — use backoffMs() from http-etiquette.mjs');
    continue;
  }

  const limits = typeof policy.maxConcurrency === 'number'
    ? `${pacing.concurrency} concurrent, ${pacing.gapMs} ms apart (policy: ${policy.maxConcurrency}, ${policy.minGapMs ?? 0} ms)`
    : `${pacing.concurrency} concurrent, ${pacing.gapMs} ms apart (no stated rate limit)`;
  ok(name, limits);
}

if (failed) {
  console.error(`\n${failed} adapter(s) outside the terms they cite.`);
  process.exit(1);
}
console.log('\nEvery networked adapter cites a policy and stays inside it.');
