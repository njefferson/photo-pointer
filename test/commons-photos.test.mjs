import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryAfterMs, backoffMs, RETRY_AFTER_CAP_MS } from '../ingest/adapters/http-etiquette.mjs';
import { geosearchTile, tileCenters, harvestBBox, RADIUS_M, meta, harvestAroundSpots, WIKIMEDIA_CONCURRENCY, WIKIMEDIA_MIN_GAP_MS, MAXLAG_SECONDS, clusterPoints, CLUSTER_MIN_PHOTOS, CLUSTER_MIN_DISTANCE_M, CLUSTER_CELL_DEG, isPlaceholderCoord, unexplainedBy, describeCluster, titleWords, isSingleRig, singleRigShare, photoDestination } from '../ingest/adapters/commons-photos.mjs';

test('geosearchTile returns {pageid,lat,lng} from the geosearch result', async () => {
  let url = null;
  const fetchFn = async (u) => {
    url = u;
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [
      { pageid: 1, lat: 38.6, lon: -121.3 }, { pageid: 2, lat: 38.61, lon: -121.31 },
    ] } }) };
  };
  const hits = await geosearchTile(38.6, -121.3, { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], { pageid: 1, lat: 38.6, lng: -121.3, title: undefined });
  assert.match(url, /gsradius=10000/);
  assert.match(url, /gsnamespace=6/);
});

test('tileCenters covers the bbox with overlapping tiles', () => {
  const centers = tileCenters({ south: 38.0, west: -121.95, north: 39.4, east: -119.85 });
  assert.ok(centers.length > 50 && centers.length < 400, `got ${centers.length} tiles`);
  // every center is inside the bbox
  for (const c of centers) {
    assert.ok(c.lat >= 38.0 && c.lat <= 39.4 && c.lng >= -121.95 && c.lng <= -119.85);
  }
});

test('harvestBBox dedups photos across overlapping tiles by pageid', async () => {
  // Every tile returns the same two photos → dedup to 2 regardless of tile count.
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ query: { geosearch: [
    { pageid: 100, lat: 38.5, lon: -121.4 }, { pageid: 200, lat: 38.9, lon: -120.9 },
  ] } }) });
  const imgs = await harvestBBox({ south: 38.0, west: -121.95, north: 39.4, east: -119.85 },
    { fetchFn, sleep: () => Promise.resolve() });
  assert.equal(imgs.length, 2);
  assert.deepEqual(imgs[0], { lat: 38.5, lng: -121.4, title: undefined });
});

test('geosearchTile retries then throws on persistent failure', async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: false, status: 500 }; };
  await assert.rejects(() => geosearchTile(38, -121, { fetchFn, sleep: () => Promise.resolve() }), /commons geosearch/);
  assert.equal(calls, 4);
});

test('meta declares a keyless, count-only Commons source', () => {
  assert.equal(meta.source, 'wikimedia_commons');
  assert.equal(meta.status, 'working');
  assert.equal(RADIUS_M, 800);
});

// A sparse statewide region has far fewer spots than bbox tiles — probing the
// spots is then the cheap sweep, and tiling would blow the workflow timeout
// (California Ghost Towns: 205 spots vs 4,264 tiles, roughly three hours).
test('harvestAroundSpots probes each spot at the counting radius and dedups', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    // The same photo is in range of both spots — it must be counted once.
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [
      { pageid: 7, lat: 37.9, lon: -118.2 },
    ] } }) };
  };
  const spots = [{ lat: 37.9, lng: -118.2 }, { lat: 37.901, lng: -118.201 }];
  const out = await harvestAroundSpots(spots, { fetchFn, sleep: async () => {} });
  assert.equal(out.images.length, 1, 'the shared photo is deduped by pageid');
  assert.deepEqual(out.failed, []);
  assert.equal(urls.length, 2, 'one geosearch per spot');
  assert.ok(urls.every((u) => u.includes(`gsradius=${RADIUS_M}`)),
    'uses the 800 m counting radius, not the 10 km tile radius');
});

test('a failing spot probe is REPORTED, not silently treated as "no photos"', async () => {
  // geosearchTile retries, so the failing spot has to fail every attempt —
  // which is what a throttled runner IP actually looks like.
  const fetchFn = async (url) => {
    if (url.includes('gscoord=1%7C2')) throw new Error('network');
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [{ pageid: 1, lat: 3, lon: 4 }] } }) };
  };
  const out = await harvestAroundSpots([{ lat: 1, lng: 2, name: 'Bodie' }, { lat: 3, lng: 4 }], { fetchFn, sleep: async () => {} });
  assert.equal(out.images.length, 1);
  // The whole point: a place whose probe failed must be named, not quietly
  // reported as having no photos near it.
  assert.deepEqual(out.failed, ['Bodie']);
});

// Wikimedia throttles runner IPs in bursts, so a failed probe is usually a
// timing artefact rather than "this place has no photos". A real run lost 84 of
// 205 in one contiguous block.
test('a throttled spot is retried and recovered rather than left as a hole', async () => {
  let calls = 0;
  const fetchFn = async (url) => {
    // Fail every attempt of the first probe (all 4 retries inside geosearchTile),
    // then let the retry pass through.
    if (url.includes('gscoord=1%7C2') && ++calls <= 4) throw new Error('429 burst');
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [{ pageid: calls, lat: 1, lon: 2 }] } }) };
  };
  const out = await harvestAroundSpots([{ lat: 1, lng: 2, name: 'Bodie' }], { fetchFn, sleep: async () => {} });
  assert.deepEqual(out.failed, [], 'the retry pass recovered it');
  assert.ok(out.images.length >= 1);
});

test('a spot that fails even the retries is still reported by name', async () => {
  const fetchFn = async (url) => {
    if (url.includes('gscoord=1%7C2')) throw new Error('down');
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [] } }) };
  };
  const out = await harvestAroundSpots([{ lat: 1, lng: 2, name: 'Bodie' }], { fetchFn, sleep: async () => {} });
  assert.deepEqual(out.failed, ['Bodie']);
});

// Retry-After is the service stating its own terms. Guessing a shorter backoff
// ignores them, which is the whole point of the header.
test('a stated Retry-After is honoured over our own guess', () => {
  const res = (v) => ({ headers: { get: (k) => (k === 'retry-after' ? v : null) } });
  assert.equal(retryAfterMs(res('30')), 30000);
  assert.equal(retryAfterMs(res(null)), null, 'absent header → we fall back to our own backoff');
  assert.equal(retryAfterMs(res('nonsense')), null);
  // A service asking for an implausibly long wait means "come back another day",
  // not "hold a runner open" — cap it so the caller gives up instead.
  assert.equal(retryAfterMs(res('99999')), RETRY_AFTER_CAP_MS);
  // Our own escalating backoff only applies when nothing was stated.
  assert.equal(backoffMs(res(null), 0, { base: 5000 }), 5000);
  assert.equal(backoffMs(res(null), 2, { base: 5000 }), 15000);
  assert.equal(backoffMs(res('7'), 2, { base: 5000 }), 7000, 'the service wins');
});

// These are Wikimedia's published numbers (API:Etiquette), not our preference,
// so they are pinned: serial, one request per second, maxlag on non-interactive
// jobs. Running 4-wide at 120 ms is what got us throttled in the first place.
test('the Wikimedia clients default to the published limits', () => {
  assert.equal(WIKIMEDIA_CONCURRENCY, 1, 'API:Etiquette asks for a total concurrency of at most 1');
  assert.equal(WIKIMEDIA_MIN_GAP_MS, 1000, 'and a delay of at least 1 second between requests');
});

test('every geosearch sends maxlag so we step aside when their databases lag', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ query: { geosearch: [] } }) };
  };
  await geosearchTile(1, 2, { fetchFn, sleep: async () => {} });
  assert.ok(urls[0].includes(`maxlag=${MAXLAG_SECONDS}`), urls[0]);
});

// Discovery: a dense knot of photos with no spot near it is a place our
// catalogues missed. Sparse scatter is not — it is someone's holiday snap.
test('clusterPoints keeps dense knots and drops scatter', () => {
  const pts = [];
  for (let i = 1; i <= 20; i++) pts.push({ lat: 38.9 + i * 0.00002, lng: -120.9 + i * 0.00002 });
  for (let i = 0; i < 4; i++) pts.push({ lat: 39.503, lng: -121.507 }); // below the threshold
  pts.push({ lat: 40.001, lng: -122.003 });                             // a lone stray
  const out = clusterPoints(pts);
  assert.equal(out.length, 1, 'only the dense knot survives');
  assert.equal(out[0].photos, 20);
  assert.equal(out[0].spots, 20);
  // The pin lands on the CENTROID of the photos, not the corner of a grid cell.
  assert.ok(Math.abs(out[0].lat - 38.9002) < 0.001 && Math.abs(out[0].lng + 120.8998) < 0.001);
});

test('clusterPoints returns the densest first and ignores unusable points', () => {
  const pts = [];
  for (let i = 1; i <= 15; i++) pts.push({ lat: 38.9 + i * 1e-5, lng: -120.9 });
  for (let i = 1; i <= 30; i++) pts.push({ lat: 38.5 + i * 1e-5, lng: -121.4 });
  pts.push({ lat: null, lng: 'x' });
  const out = clusterPoints(pts);
  assert.deepEqual(out.map((c) => c.spots), [30, 15]);
});

// MEASURED on the real harvest: 1,785 of 18,185 photo coordinates sat on an
// exact 0.1° grid — a 11 km cell someone typed rather than a place they stood.
// Clustered, they become a confident pin in the middle of a field.
test('coordinates typed onto a round grid are not places', () => {
  assert.equal(isPlaceholderCoord(38.1, -121.0), true);
  assert.equal(isPlaceholderCoord(38.2, -119.8), true);
  assert.equal(isPlaceholderCoord(38.10001, -121.0), false, 'a real fix, one metre off the grid');
  assert.equal(isPlaceholderCoord(38.6785, -120.9872), false);
  const pts = Array.from({ length: 40 }, () => ({ lat: 38.1, lng: -121.0 }));
  assert.deepEqual(clusterPoints(pts), [], 'forty of them are still not a place');
});

// MEASURED on the real harvest: the densest cell held 187 photos, 160 of them at
// ONE identical coordinate — a single upload batch geotagged once. That is one
// person having been somewhere, not somewhere people go.
test('one batch upload at one coordinate is one camera, not a crowd', () => {
  const batch = Array.from({ length: 200 }, () => ({ lat: 38.6785, lng: -120.9872 }));
  assert.deepEqual(clusterPoints(batch), [], 'two hundred files, one place someone stood');
  const crowd = Array.from({ length: 14 }, (_, i) => ({ lat: 38.6785 + i * 1e-5, lng: -120.9872 }));
  const out = clusterPoints(crowd);
  assert.equal(out.length, 1, 'fourteen different vantage points is a subject');
  assert.equal(out[0].spots, 14);
});

// A grid is arbitrary and a big subject straddles it: four cells in a row along
// the Sacramento delta were four pins on one stretch of the same river.
test('cells that split one subject are folded back together', () => {
  const pts = [];
  for (let i = 1; i <= 20; i++) pts.push({ lat: 38.0332 + i * 1e-5, lng: -121.8833 });
  for (let i = 1; i <= 20; i++) pts.push({ lat: 38.0354 + i * 1e-5, lng: -121.8832 });
  const out = clusterPoints(pts);
  assert.equal(out.length, 1, '250 m apart is not two discoveries');
  assert.equal(out[0].spots, 40);
  const far = clusterPoints([
    ...pts,
    ...Array.from({ length: 20 }, (_, i) => ({ lat: 38.0800 + i * 1e-5, lng: -121.8833 })),
  ]);
  assert.equal(far.length, 2, 'but 5 km apart genuinely is');
});

test('the density threshold is a deliberate value, not an accident', () => {
  assert.equal(CLUSTER_MIN_PHOTOS, 12);
  assert.equal(CLUSTER_MIN_DISTANCE_M, 400);
  // One viewpoint, not one town.
  assert.ok(CLUSTER_CELL_DEG > 0.002 && CLUSTER_CELL_DEG < 0.006);
});

// A discovery pass must be able to run twice. The second real run found its 43
// discoveries, decided each was "already explained" by the pin it had created
// for it on the first run, and committed an empty layer that deleted all 128.
test('the pass does not count its own previous pins as prior knowledge', () => {
  const cluster = { lat: 38.9, lng: -120.9, photos: 40, spots: 40 };
  const ownPin = { lat: 38.9, lng: -120.9, category: 'photo_cluster' };
  const realSpot = { lat: 38.9, lng: -120.9, category: 'viewpoint' };
  assert.equal(unexplainedBy([cluster], [ownPin]).length, 1,
    'our own pin from last time is not a reason to forget the place');
  assert.equal(unexplainedBy([cluster], [realSpot]).length, 0,
    'but a place some other source already lists genuinely is');
  assert.equal(unexplainedBy([cluster], [{ lat: 39.9, lng: -120.9, category: 'viewpoint' }]).length, 1,
    'and a catalogued place 100 km away explains nothing');
});

// A discovered place has no name by construction — but the people who went
// there named their own files, and those titles arrive free in the geosearch
// response we already make. Where a phrase recurs, that is what they came for.
test('a discovered place is described by what photographers titled their files', () => {
  const titles = [
    'File:Calaveras Big Trees State Park - North Grove 2019.jpg',
    'File:Calaveras Big Trees State Park, giant sequoia.jpg',
    'File:North Grove, Calaveras Big Trees State Park.jpg',
    'File:Calaveras Big Trees State Park trail.jpg',
    'File:DSC_0041 Calaveras Big Trees.jpg',
    'File:An unrelated barn.jpg',
  ];
  const d = describeCluster(titles);
  assert.equal(d.subject, 'Calaveras Big Trees State Park');
  assert.equal(d.files, 4);
  assert.equal(d.of, 6);
});

test('no agreement between photographers means no claim', () => {
  assert.equal(describeCluster(['File:a.jpg', 'File:b.jpg', 'File:c.jpg', 'File:d.jpg']), null);
  assert.equal(describeCluster(['File:Only one.jpg']), null, 'one file is not agreement');
  // Place words alone must not be the answer, and a repeated word inside ONE
  // title must not outvote agreement between separate photographers.
  assert.equal(describeCluster([
    'File:Lake lake lake lake sunset.jpg', 'File:Barn.jpg', 'File:Fence.jpg', 'File:Road.jpg', 'File:Sky.jpg',
  ]), null);
});

test('filenames are stripped to words that could name a place', () => {
  assert.deepEqual(titleWords('File:Donner_Lake_from_the_summit,_CA_2019.jpg'),
    ['donner', 'lake', 'summit']);
  assert.deepEqual(titleWords('File:IMG 20190412 California.JPG'), []);
});

// THE ONE THE COORDINATE COUNT COULD NOT CATCH. Counting distinct coordinates
// defeats a batch upload geotagged once. It does not defeat a 360 rig capturing
// continuously from a moving vehicle — every frame gets its own coordinate, so
// a stretch of road scored 376 "vantage points" off one person on one afternoon.
// The filenames give it away where the geometry could not.
test('one camera rig moving is not a place people go', () => {
  const rig = Array.from({ length: 20 }, (_, i) =>
    `File:Zymrn8njiod0x3te6v7kc${i} with Labpano Pilot One.jpg`);
  assert.equal(isSingleRig(rig), true);
  assert.equal(singleRigShare(rig), 1);

  const motorbike = Array.from({ length: 12 }, (_, i) =>
    `File:Gsb4uqoc7z6iatcwxu1yp${i}_with_Suzuki_Dl1000.jpg`);
  assert.equal(isSingleRig(motorbike), true, 'a rig on a motorcycle is still one rig');

  // A place a lot of separate people photographed reads nothing like that.
  const real = [
    'File:Folsom Dam spillway.jpg',
    'File:Folsom Dam from the north shore.jpg',
    'File:Folsom Dam at sunset by J Smith.jpg',
    'File:Lake Natoma below Folsom Dam.jpg',
    'File:Folsom Dam road crossing.jpg',
  ];
  assert.equal(isSingleRig(real), false);
  assert.equal(singleRigShare(real), 0);

  // Too few files to judge — say nothing rather than guess.
  assert.equal(singleRigShare(['File:a with GoPro.jpg']), 0);
});

// The three destination rulings settled 2026-07-27 against the first real
// output, which had mapped a retailer, a herbarium sheet and an agency's staff
// photographs. See the NOT_A_DESTINATION comment in commons-photos.mjs.
test('a pin has to be somewhere you could go and photograph the thing', () => {
  // A retailer is not a destination.
  assert.equal(photoDestination('Ikea').ok, false);
  // A Latin binomial is not disqualifying: the line is CULTIVATION, not botany.
  assert.equal(photoDestination('Cirsium Occidentale Candidissimum Snowy Thistle').ok, true,
    'a native thistle growing on a hillside is exactly what this app is for');
  assert.equal(photoDestination('Placervillenursery Eldorador5').ok, false,
    'nursery stock is not a wildflower, even run together into one word');
  assert.equal(photoDestination('Potted succulent collection').ok, false);
  // An archive is out by default — a photograph of something that happened is
  // not somewhere to stand — except where its subject is still standing.
  assert.equal(photoDestination('Nrcs Lsc').ok, false);
  assert.equal(photoDestination('Pacific Southwest Region Research Station Honor').ok, false);
  assert.equal(
    photoDestination('Forest Service Archive', ['File:Archive - the giant sequoia at Big Trees.jpg']).ok,
    true, 'an archive of something still standing is still worth the drive');
  assert.equal(
    photoDestination('Forest Service Archive', ['File:Archive - 1954 staff picnic.jpg']).ok,
    false);
  // Real places are untouched.
  for (const p of ['Folsom Dam', 'Bridgeport Covered Bridge', 'Sand Harbor Lake Tahoe State Park',
    'Autumn Foliage Along Brockway Road Truckee']) {
    assert.equal(photoDestination(p).ok, true, p);
  }
});

test('a rejection always says why, so the list can be audited', () => {
  const v = photoDestination('Ikea');
  assert.equal(v.ok, false);
  assert.match(v.why, /shop/);
});
