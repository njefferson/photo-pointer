// UI for cross-layer synthesis: the per-spot "why" breakdown shown in a popup,
// and the "Top spots" panel that ranks the region by composite score.

import { el, closeOnBackdrop } from './dom.js';
import { CATEGORY_META } from './mapview.js';

// A compact "why this spot" block from a synthesis result {score, parts}.
export function synthesisBreakdown(result) {
  if (!result || !result.parts?.length) return null;
  return el('div', { class: 'synth-box' }, [
    el('div', { class: 'synth-head' }, [
      el('span', { class: 'synth-why' }, 'Why this spot'),
      el('span', { class: 'synth-score', title: 'Cross-layer photographer score' }, scoreBadge(result.score)),
    ]),
    el('ul', { class: 'synth-parts' },
      result.parts.map((p) =>
        el('li', {}, [
          el('span', { class: 'synth-part-label' }, `${p.label}`),
          p.note ? el('span', { class: 'synth-part-note' }, ` — ${p.note}`) : null,
        ])
      )
    ),
  ]);
}

// Score → a plain strength word (survives grayscale, and anchors the bare
// number so it reads as quality, not a grade). Shared by the popup badge and
// the Top-spots rows.
//
// Thresholds are calibrated to the REAL score distribution, NOT a 0–100 grade
// curve. The composite score is relative — a spot's share of EVERY layer the
// app tracks — and no place fires every layer, so it's structurally low-topped.
// Measured across all five regions (2026-07-25): each region's #1 lands 48–60,
// the median spot ~30. So the old 66/33 cut-offs were unreachable (nothing ever
// read "strong"). Grounded cut-offs instead:
const STRONG_MIN = 48; // ≥48 → "strong": the region's very best (every region's #1 clears it)
const GOOD_MIN = 30;   // ≥30 → "good": solidly above the ~30 median; below → "basic"
function scoreTier(pct) {
  return pct >= STRONG_MIN ? 'strong' : pct >= GOOD_MIN ? 'good' : 'basic';
}

function scoreBadge(score) {
  // Text, not color: the number + a strength word (survives grayscale).
  const pct = Math.round(score * 100); // 0..1 composite → a friendlier whole number
  return `${pct} · ${scoreTier(pct)}`;
}

// The Top-spots dialog. `ranked` = [{spot, score, parts}]; onGo(spot) focuses
// the map on a chosen spot. `filters` lets the viewer require cross-layer
// combinations (e.g. dark + view).
export function topSpotsPanel(ranked, onGo, { onFilter } = {}) {
  const dlg = el('dialog', { class: 'data-dialog top-dialog', tabindex: '-1' });

  // Each chip is tri-state: neutral (any) → require (✓) → exclude (✕) → neutral.
  // 'layered' is deliberately NOT a chip — it's the meta-quality the panel ranks
  // by, not a concrete layer you can demand. Spots still show "A layered place".
  const LAYER_CHIPS = [
    ['wildlife', 'Wildlife'],
    ['iNatWildlife', 'Wild subjects'],
    ['view', 'Open view'],
    ['openHorizon', 'Open horizon'],
    ['commonsPhotos', 'Photographed'],
    ['access', 'Easy access'],
    ['darkSky', 'Dark sky'],
    ['publicLand', 'Public land'],
  ];
  const chipState = new Map(); // key -> 'require' | 'exclude' (absent = any)

  const list = el('div', { class: 'top-list' });
  const reqs = el('div', { class: 'top-reqs', role: 'group', 'aria-label': 'Filter Top spots by layer' });

  function apply() {
    const req = [], exc = [];
    for (const [k, v] of chipState) (v === 'require' ? req : exc).push(k);
    const active = req.length || exc.length;
    let rows = ranked;
    if (active) {
      rows = ranked.filter((r) => {
        const has = (k) => r.parts.some((p) => p.key === k);
        return req.every(has) && !exc.some(has);
      });
    }
    list.replaceChildren(
      ...(rows.length
        ? rows.slice(0, 30).map((r, i) => topRow(r, i, () => { dlg.close(); onGo(r.spot); }))
        : [el('p', { class: 'top-empty' }, 'No spots match those filters in this region.')])
    );
    // Mirror the filter onto the map: the same require/exclude set of spots, or
    // null to clear when no chip is active.
    onFilter?.(active ? new Set(rows.map((r) => r.spot.id)) : null);
  }

  function renderChips() {
    reqs.replaceChildren(...LAYER_CHIPS.map(([key, label]) => {
      const state = chipState.get(key);
      const mark = state === 'require' ? '✓ ' : state === 'exclude' ? '✕ ' : '';
      const word = state === 'require' ? 'must have' : state === 'exclude' ? 'excluded' : 'any';
      return el('button', {
        class: `top-req${state ? ' ' + state : ''}`,
        'aria-pressed': state === 'require' ? 'true' : 'false',
        'aria-label': `${label}: ${word}. Tap to change.`,
        onClick: () => {
          const s = chipState.get(key);
          if (!s) chipState.set(key, 'require');
          else if (s === 'require') chipState.set(key, 'exclude');
          else chipState.delete(key);
          renderChips();
          apply();
        },
      }, [el('span', { class: 'req-mark', 'aria-hidden': 'true' }, mark), label]);
    }));
  }

  dlg.replaceChildren(
    el('button', { class: 'dialog-x', 'aria-label': 'Close', onClick: () => dlg.close() }, '×'),
    el('h2', {}, 'Top spots'),
    el('p', { class: 'top-sub' }, 'Ranked by an overall photo score — how well each spot’s data layers line up, the thing one map can do that separate apps can’t.'),
    el('p', { class: 'top-hint' }, 'Optional filters, all off to start. Tap a layer once to require it (✓ must have), again to exclude it (✕), again to clear.'),
    reqs,
    el('p', { class: 'top-legend' }, 'The number on the right ranks each spot by how well its data layers line up — higher is better. It’s a relative score across the region, not a grade out of 100.'),
    list,
    el('button', { class: 'dialog-close', onClick: () => dlg.close() }, 'Close')
  );
  renderChips();
  apply();
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnBackdrop(dlg);
  dlg.showModal();
  // Focus the dialog itself so no chip is left focus-ringed (which read as
  // "already selected"). The user taps a chip to activate it.
  dlg.focus();
}

function topRow(r, i, onClick) {
  const meta = CATEGORY_META[r.spot.category] ?? { label: r.spot.category, letter: '?' };
  const pct = Math.round(r.score * 100); // 0..1 composite → a friendlier whole number
  const tier = scoreTier(pct); // strong / good / basic — anchors the number
  return el('button', { class: 'top-row', onClick }, [
    el('span', { class: `pin pin-${r.spot.category} pin-inline`, 'aria-hidden': 'true' }, meta.letter),
    el('span', { class: 'top-row-main' }, [
      el('span', { class: 'top-row-name' }, r.spot.name ?? `(unnamed ${meta.label.toLowerCase()})`),
      el('span', { class: 'top-row-why' }, r.parts.map((p) => p.label).join(' · ')),
    ]),
    // The number + its strength word. Deliberately NO "/100" denominator: the
    // score is relative (top spots top out ~mid-50s), so "56/100" read like a
    // failing grade. The strength word (.score-cap, capitalized in CSS) tells
    // the user what the number means; the aria-label spells it out.
    el('span', { class: 'top-row-score', 'aria-label': `Photo score ${pct} — ${tier}, higher is better` }, [
      el('span', { class: 'score-num', 'aria-hidden': 'true' }, `${pct}`),
      el('span', { class: 'score-cap', 'aria-hidden': 'true' }, tier),
    ]),
  ]);
}
