// UI for cross-layer synthesis: the per-spot "why" breakdown shown in a popup,
// and the "Top spots" panel that ranks the region by composite score.

import { el } from './dom.js';
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

function scoreBadge(score) {
  // Text, not color: a 0–100 number + a word tier (survives grayscale).
  const pct = Math.round(score * 100);
  const tier = pct >= 66 ? 'strong' : pct >= 33 ? 'good' : 'basic';
  return `${pct} · ${tier}`;
}

// The Top-spots dialog. `ranked` = [{spot, score, parts}]; onGo(spot) focuses
// the map on a chosen spot. `filters` lets the viewer require cross-layer
// combinations (e.g. dark + view).
export function topSpotsPanel(ranked, onGo) {
  const dlg = el('dialog', { class: 'data-dialog top-dialog' });

  const list = el('div', { class: 'top-list' });
  function paint(rows) {
    list.replaceChildren(
      ...(rows.length
        ? rows.slice(0, 30).map((r, i) => topRow(r, i, () => { dlg.close(); onGo(r.spot); }))
        : [el('p', { class: 'top-empty' }, 'No spots match that combination in this region.')])
    );
  }

  // Cross-layer require chips: tap to demand a layer contribute.
  const requireKeys = new Set();
  // NOTE: 'layered' is deliberately NOT a require chip. It's the meta-signal the
  // whole panel already ranks by (how many layers line up), not a concrete layer
  // you can demand like the rest — offering it as a chip that looks identical but
  // behaves differently is confusing. It still scores spots and shows "A layered
  // place" in each row; it just isn't a filter.
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
  const chips = LAYER_CHIPS.map(([key, label]) =>
    el('button', {
      class: 'top-req',
      'aria-pressed': 'false',
      onClick: (e) => {
        const on = requireKeys.has(key);
        if (on) requireKeys.delete(key); else requireKeys.add(key);
        e.target.setAttribute('aria-pressed', String(!on));
        paint(applyRequire(ranked, requireKeys));
      },
    }, label)
  );

  dlg.replaceChildren(
    el('h2', {}, 'Top spots'),
    el('p', { class: 'top-sub' }, 'Ranked by how many layers line up — the thing one map can do that separate apps can’t. Require a layer:'),
    el('div', { class: 'top-reqs', role: 'group', 'aria-label': 'Require these layers' }, chips),
    list,
    el('button', { class: 'dialog-close', onClick: () => dlg.close() }, 'Close')
  );
  paint(ranked);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

function applyRequire(ranked, requireKeys) {
  if (!requireKeys.size) return ranked;
  return ranked.filter((r) => [...requireKeys].every((k) => r.parts.some((p) => p.key === k)));
}

function topRow(r, i, onClick) {
  const meta = CATEGORY_META[r.spot.category] ?? { label: r.spot.category, letter: '?' };
  return el('button', { class: 'top-row', onClick }, [
    el('span', { class: `pin pin-${r.spot.category} pin-inline`, 'aria-hidden': 'true' }, meta.letter),
    el('span', { class: 'top-row-main' }, [
      el('span', { class: 'top-row-name' }, r.spot.name ?? `(unnamed ${meta.label.toLowerCase()})`),
      el('span', { class: 'top-row-why' }, r.parts.map((p) => p.label).join(' · ')),
    ]),
    el('span', { class: 'top-row-score' }, `${Math.round(r.score * 100)}`),
  ]);
}
