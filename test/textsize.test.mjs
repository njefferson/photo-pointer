import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A reader who raises only their DEFAULT TEXT SIZE — not page zoom — changes the
// root font size and nothing else. A stylesheet written in `px` ignores that
// completely. MEASURED before this was fixed: 23 of 49 visible text elements did
// not move at all when the root went 16px -> 24px.
//
// WHY A STATIC CHECK AND NOT A BROWSER ONE: the browser measurement exists
// (scripts/smoke-textsize.mjs) and is useful, but it can only prove things about
// surfaces it managed to open, and it silently proves nothing about the ones it
// missed — which is exactly what happened when it was first written. This check
// is deterministic, covers every rule including ones no test ever navigates to,
// and fails the moment somebody adds a fixed size.
const CSS = readFileSync('src/styles.css', 'utf8');

test('no font-size in our stylesheet is fixed in px', () => {
  const offenders = [];
  CSS.split('\n').forEach((line, i) => {
    const m = line.match(/font-size:\s*[0-9.]+px/);
    if (m) offenders.push(`  styles.css:${i + 1}  ${m[0]}`);
  });
  assert.equal(offenders.length, 0,
    `${offenders.length} fixed font-size(s) — a reader who enlarges their default text `
    + `will not see these change:\n${offenders.join('\n')}`);
});

test('the sizes really are rem, not something that only looks relative', () => {
  const sizes = [...CSS.matchAll(/font-size:\s*([^;!]+)/g)].map((m) => m[1].trim());
  assert.ok(sizes.length > 80, `expected the whole stylesheet, found ${sizes.length} font-size rules`);
  const bad = sizes.filter((v) => !/rem$/.test(v) && v !== 'inherit');
  assert.deepEqual(bad, [], `these are neither rem nor inherit: ${bad.join(', ')}`);
});

test('the map controls override Leaflet, which sizes itself in px', () => {
  // The vendored stylesheet puts the +/- controls at a fixed 22px in a fixed
  // 30px box. They were the last text on screen that ignored the reader. The
  // box has to scale with the glyph or a bigger + overflows its button.
  const rule = CSS.slice(CSS.indexOf('.leaflet-control-zoom-in'));
  assert.match(rule, /font-size:\s*[0-9.]+rem/, 'the glyph must scale');
  assert.match(rule, /height:\s*[0-9.]+rem/, 'and its box with it, or the glyph overflows');
});
