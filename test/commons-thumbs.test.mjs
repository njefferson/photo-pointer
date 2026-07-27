import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUrl, plainText, normalizePage, thumbsNear, THUMB_WIDTH, MAX_THUMBS, SEARCH_RADIUS_M,
} from '../src/model/commons-thumbs.js';

const page = (o = {}) => ({
  title: 'File:Folsom Dam spillway.jpg',
  imageinfo: [{
    thumburl: 'https://upload.wikimedia.org/…/320px-Folsom.jpg',
    thumbwidth: 320, thumbheight: 240,
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Folsom_Dam_spillway.jpg',
    extmetadata: {
      Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Someone">Someone</a>' },
      LicenseShortName: { value: 'CC BY-SA 4.0' },
    },
    ...o,
  }],
});

test('one request asks geosearch to choose the files and imageinfo to describe them', () => {
  const q = new URL(buildUrl(38.7032, -121.1485)).searchParams;
  assert.equal(q.get('generator'), 'geosearch', 'the same call that finds them describes them');
  assert.equal(q.get('ggscoord'), '38.7032|-121.1485');
  assert.equal(q.get('ggsnamespace'), '6', 'files only');
  assert.equal(q.get('ggsradius'), String(SEARCH_RADIUS_M));
  assert.equal(q.get('ggslimit'), String(MAX_THUMBS));
  assert.equal(q.get('iiurlwidth'), String(THUMB_WIDTH), 'Wikimedia scales it, we do not ship a full image');
  assert.match(q.get('iiprop'), /extmetadata/, 'attribution comes back in the same request');
  assert.equal(q.get('origin'), '*', 'anonymous cross-origin read');
  // This is an INTERACTIVE request — one, because a person asked. maxlag exists
  // so BATCH jobs step aside; on a tap it would only make the tap fail.
  assert.equal(q.get('maxlag'), null);
});

// extmetadata is HTML written by whoever uploaded the file. It must never reach
// the DOM as markup.
test('uploader-supplied attribution is reduced to plain text', () => {
  assert.equal(plainText('<a href="/wiki/User:X">Jane Doe</a>'), 'Jane Doe');
  assert.equal(plainText('<img src=x onerror="alert(1)">Bob'), 'Bob');
  assert.equal(plainText('A &amp; B &quot;C&quot;'), 'A & B "C"');
  assert.equal(plainText(undefined), '');
  assert.equal(plainText('x'.repeat(200), { max: 10 }).length, 10, 'and bounded');
  assert.ok(plainText('x'.repeat(200), { max: 10 }).endsWith('…'));
});

test('a thumbnail carries its photographer and licence, and links to the original', () => {
  const t = normalizePage(page());
  assert.equal(t.author, 'Someone');
  assert.equal(t.licence, 'CC BY-SA 4.0');
  assert.match(t.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  assert.match(t.thumb, /^https:\/\/upload\.wikimedia\.org\//);
});

// NO LICENCE, NO THUMBNAIL. Most of Commons is CC-BY or CC-BY-SA, which require
// the licence to be shown with the image — so if we cannot state the terms we
// are using it under, we do not use it.
test('a file whose licence we cannot state is not shown at all', () => {
  assert.equal(normalizePage(page({ extmetadata: { Artist: { value: 'Someone' } } })), null);
  assert.equal(normalizePage(page({ extmetadata: {} })), null);
  assert.equal(normalizePage({ title: 'File:x.jpg' }), null, 'no imageinfo at all');
  assert.equal(normalizePage(page({ thumburl: undefined })), null);
});

test('an unnamed photographer is said plainly, not left blank', () => {
  const t = normalizePage(page({ extmetadata: { LicenseShortName: { value: 'CC0' } } }));
  assert.equal(t.author, 'Unknown author');
  assert.equal(t.licence, 'CC0');
});

test('Credit stands in when there is no Artist', () => {
  const t = normalizePage(page({ extmetadata: {
    Credit: { value: '<span>National Park Service</span>' },
    LicenseShortName: { value: 'Public domain' },
  } }));
  assert.equal(t.author, 'National Park Service');
});

test('thumbsNear returns only the files it can credit', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({
    query: { pages: [page(), page({ extmetadata: {} })] },
  }) });
  const out = await thumbsNear(38.7, -121.1, { fetchFn });
  assert.equal(out.length, 1, 'the uncreditable one is dropped, not shown bare');
});

// Offline is the normal case for this app, so it must not throw or half-render.
test('offline, blocked or throttled all fail soft', async () => {
  assert.deepEqual(await thumbsNear(1, 2, { fetchFn: async () => { throw new Error('offline'); } }), []);
  assert.deepEqual(await thumbsNear(1, 2, { fetchFn: async () => ({ ok: false, status: 429 }) }), []);
  assert.deepEqual(await thumbsNear(1, 2, { fetchFn: async () => ({ ok: true, json: async () => ({}) }) }), []);
});
