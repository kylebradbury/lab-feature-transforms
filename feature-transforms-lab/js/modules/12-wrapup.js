import { h, card, renderMath, store, copyText, pct } from '../ui.js';
import { XPlot } from '../plot2d.js';
import { Scene } from '../scene.js';
import { spiralOmega } from '../datasets.js';

const TILES = [
  { name: 'Hand-built', kind: 'Spiral features', f: [{ id: 'spiral', params: { omega: +spiralOmega(2).toFixed(2) } }], lambda: 1e-3 },
  { name: 'Generic: bumps', kind: 'RBF at every training point', f: [{ id: 'rbf', params: { place: 'data', gamma: 4 } }], lambda: 1e-4 },
  { name: 'Generic: random cosines', kind: 'Random Fourier features, D = 200', f: [{ id: 'rff', params: { D: 200, ell: 0.35 } }], lambda: 1e-4 },
  { name: 'Generic: random ReLUs', kind: 'Frozen 1-hidden-layer net, m = 200', f: [{ id: 'relu', params: { m: 200 } }], lambda: 1e-4 },
];

const CHEAT = [
  ['Raw [x₁, x₂]', 'straight line', 'baseline; linear remixes add nothing'],
  ['Quadratic [x₁, x₂, x₁², x₁x₂, x₂²]', 'any conic', 'circles, ellipses, parabolas, hyperbolas; linear terms move the center'],
  ['Polynomial degree k', 'degree-k curves', '(k+1)(k+2)/2 − 1 columns; overfits without λ'],
  ['Radius r, [r, r²], |r − ρ|', 'circle, ring', 'assumes a center'],
  ['[sin kθ, cos kθ], spiral phase', 'flowers, wedges, spirals', 'compute angles from x/r, y/r'],
  ['sin / cos of ωx', 'stripes, waves, checkerboards', 'need sin and cos for phase; ω is not learned'],
  ['RBF bumps', 'blobs, anything', 'γ sets smoothness; at every point ≈ kernel method'],
  ['Bins, hinges', 'staircases, piecewise-linear curves', 'like trees and splines'],
  ['Random ReLUs', 'polygons', 'a neural net with a frozen first layer'],
  ['|x|, L1, L∞, min, max', 'bands, diamonds, squares, corners', 'level sets of the feature'],
  ['log, ratio', 'power laws, lines through the origin', 'positive data; better extrapolation'],
];

const TICKET = [
  'Name one transform you would use for a cyclic variable such as hour of day, and why.',
  'Why might 2 hand-built features beat 200 generic ones on new data?',
  'What does a linear classifier’s decision boundary look like in Z-space, and why can it look curved in X-space?',
];

export default {
  id: 'wrapup',
  title: 'Wrap-up: who chooses Φ?',
  short: 'Wrap-up',
  core: true,
  keyIdea: 'Every boundary in this lab came from the <b>same</b> linear classifier \\(\\sigma(w_0 + w^\\top\\Phi(x))\\). What changed was \\(\\Phi\\). There are three ways to get a good \\(\\Phi\\): build it by hand, use a large generic family, or <b>learn it</b>.',
  mount(root) {
    const main = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '1100px' } });
    root.append(main);

    const cmp = card('Same spirals (only 60 training points), four feature maps');
    const grid = h('div', { class: 'gallery' });
    const live = [];
    for (const t of TILES) {
      const box = h('div', { class: 'plot-box' });
      const cap = h('div', { class: 'cap' }, h('b', {}, t.name), t.kind, h('div', { class: 'stat-line' }, 'fitting…'));
      grid.append(h('div', { class: 'card', style: { padding: '6px' } }, box, cap));
      const plot = new XPlot(box, { thumb: true });
      const sc = new Scene({
        plot, thumb: true,
        cfg: { dataset: { id: 'spirals', params: {} }, features: t.f, split: { nTrain: 60, nTest: 400 }, fit: { mode: 'auto', lambda: t.lambda } },
        onFrame: (s) => { if (!s.busy) cap.querySelector('.stat-line').innerHTML = `d = <strong>${s.prep.d}</strong> · test <strong>${pct(s.metrics.test.acc)}</strong>`; },
      });
      live.push({ plot, sc });
    }
    cmp.body.append(grid, h('p', { class: 'hint', html: 'With only 60 training points, two well-chosen columns beat hundreds of generic ones, and they continue the arms correctly where there is no data. Generic maps need no insight into the data, but they pay with many columns, more data, and boundaries that are hard to interpret (look at the corners).' }));
    main.append(cmp.el);

    const three = card('Three ways to choose Φ');
    three.body.append(h('div', { class: 'grid2', html: `
      <div><p><b>1. Hand-built</b> (Modules 1–9). Few features, interpretable, but they encode assumptions such as the center, the frequency or the log scale. When the assumption is right, they are unbeatable.</p>
      <p><b>2. Generic families</b> (RBF, random Fourier, random ReLU, high-degree polynomials). Flexible enough for almost anything; need regularization and data, and the weights are hard to read.</p></div>
      <div><p><b>3. Implicit: kernels.</b> Bumps at every training point are the RBF kernel \\(K(x, x') = \\Phi(x)^\\top\\Phi(x')\\). The <i>kernel trick</i> fits these models without ever writing \\(\\Phi\\) down, even when it is infinite-dimensional (SVMs).</p>
      <p><b>4. Learned: neural networks.</b> Module 7 froze the ReLU lines at random positions. Backpropagation (Lecture 12) moves them: a neural net learns \\(\\Phi\\) and the linear classifier on top at the same time.</p></div>` }));
    main.append(three.el);

    const cheat = card('Cheat sheet: features → boundary shapes');
    cheat.body.append(h('table', { class: 'cheat', html: `<thead><tr><th>Feature map Φ</th><th>Boundary shapes</th><th>Remember</th></tr></thead><tbody>${CHEAT.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>` }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: () => window.print() }, '🖨 Print this page')));
    main.append(cheat.el);

    const ticket = card('Exit ticket');
    const saved = store('exit') || {};
    const areas = TICKET.map((q, i) => {
      const ta = h('textarea', { 'aria-label': q });
      ta.value = saved[i] || '';
      ta.addEventListener('input', () => { saved[i] = ta.value; store('exit', saved); });
      ticket.body.append(h('p', { html: `<b>${i + 1}.</b> ${q}` }), ta);
      return ta;
    });
    const copy = h('button', { class: 'btn primary', type: 'button' }, 'Copy my answers');
    copy.addEventListener('click', () => {
      copyText(TICKET.map((q, i) => `${i + 1}. ${q}\n${areas[i].value}`).join('\n\n'));
      copy.textContent = '✓ Copied';
      setTimeout(() => { copy.textContent = 'Copy my answers'; }, 1400);
    });
    ticket.body.append(h('div', { class: 'btn-row' }, copy), h('p', { class: 'hint' }, 'Answers stay in this browser until you copy them somewhere.'));
    main.append(ticket.el);

    renderMath(root);
    return { unmount: () => live.forEach(({ plot, sc }) => { sc.destroy(); plot.destroy(); }) };
  },
};
