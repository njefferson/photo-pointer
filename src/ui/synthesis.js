// UI for cross-layer synthesis: the per-spot "why" breakdown shown in a popup,
// plus the shared score→word helper and the list of filterable data layers.
// (The old standalone "Top spots" trophy dialog is gone — ranking is now the
// list's "Best" sort and the layers below are filters in the main filter bar.)

import { el } from './dom.js';

// The data-layer filters shown in the "Must have" row of the filter bar. Each
// key matches a synthesis signal key (model/synthesis.js) — a spot "has" the
// layer when that signal produced a part for it. 'layered' is intentionally not
// here: it's the meta-quality the Best sort ranks by, not a concrete layer.
export const LAYER_FILTERS = [
  ['wildlife', 'Wildlife'],
  ['iNatWildlife', 'Wild subjects'],
  ['view', 'Open view'],
  ['openHorizon', 'Open horizon'],
  ['commonsPhotos', 'Photographed'],
  ['access', 'Easy access'],
  ['darkSky', 'Dark sky'],
  ['publicLand', 'Public land'],
];

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

// Score (0..1) → 0–100 whole number. One place so the list and popup agree.
export function scorePct(score) {
  return Math.round(score * 100); // 0..1 composite → a friendlier whole number
}

// Score → a plain strength word (survives grayscale, and anchors the bare
// number so it reads as quality, not a grade). Shared by the popup badge and
// the list rows.
//
// Thresholds are calibrated to the REAL score distribution, NOT a 0–100 grade
// curve. The composite score is relative — a spot's share of EVERY layer the
// app tracks — and no place fires every layer, so it's structurally low-topped.
// Measured across all five regions (2026-07-25): each region's #1 lands 48–60,
// the median spot ~30. So the old 66/33 cut-offs were unreachable (nothing ever
// read "strong"). Grounded cut-offs instead:
const STRONG_MIN = 48; // ≥48 → "strong": the region's very best (every region's #1 clears it)
const GOOD_MIN = 30;   // ≥30 → "good": solidly above the ~30 median; below → "basic"
export function scoreTier(pct) {
  return pct >= STRONG_MIN ? 'strong' : pct >= GOOD_MIN ? 'good' : 'basic';
}

function scoreBadge(score) {
  // Text, not color: the number + a strength word (survives grayscale).
  return `${scorePct(score)} · ${scoreTier(scorePct(score))}`;
}
