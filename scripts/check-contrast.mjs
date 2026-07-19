#!/usr/bin/env node
// WCAG contrast gate — computed, never eyeballed. Exit 1 on any FAIL.
// Parses the real tokens out of src/styles.css (both themes) so it can't
// drift. New fg/bg pairs must be added here in the same commit.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = await readFile(path.join(ROOT, 'src', 'styles.css'), 'utf8');

function tokensOf(block) {
  const m = css.match(block);
  if (!m) throw new Error(`token block not found: ${block}`);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[k] = v;
  return out;
}

const light = tokensOf(/:root\s*{([^}]*)}/);
const dark = { ...light, ...tokensOf(/\[data-theme="dark"\]\s*{([^}]*)}/) };

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [description, fg token, bg token, minimum]
const TEXT = 4.5;
const UI = 3.0;
const CATS = [
  'cat-viewpoint', 'cat-marker', 'cat-oddity', 'cat-park', 'cat-trailhead',
  'cat-campsite', 'cat-wildlife_hotspot', 'cat-dark_sky', 'cat-user_pin',
];

let failed = 0;

for (const [themeName, T] of [['light', light], ['dark', dark]]) {
  const pairs = [
    ['body text', 'ink', 'bg', TEXT],
    ['dim text', 'dim', 'bg', TEXT],
    ['text on card', 'ink', 'card', TEXT],
    ['accent as text on bg', 'accent', 'bg', TEXT],
    ['card edge vs bg', 'line', 'bg', 1.2], // decorative rail, informational only
    ['focus ring vs bg', 'focus', 'bg', UI],
    ['focus ring vs card', 'focus', 'card', UI],
    ['toast text (bg on ink)', 'bg', 'ink', TEXT],
    ...CATS.map((c) => [`pin letter on ${c}`, 'pin-ink', c, TEXT]),
  ];
  for (const [desc, fg, bg, min] of pairs) {
    if (!T[fg] || !T[bg]) {
      console.error(`FAIL [${themeName}] ${desc}: missing token --${T[fg] ? bg : fg}`);
      failed++;
      continue;
    }
    const r = ratio(T[fg], T[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? ' ok ' : 'FAIL'} [${themeName}] ${desc}: ${T[fg]} on ${T[bg]} = ${r.toFixed(2)} (need ${min})`
    );
  }
}

if (failed) {
  console.error(`\n${failed} contrast failure(s).`);
  process.exit(1);
}
console.log('\nAll contrast pairs pass.');
