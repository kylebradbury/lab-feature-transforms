// Still a Linear Model: one logistic regression, with its score s = w₀ + wᵀz
// drawn as a height. Over the feature floor (z₁, z₂) the score is a flat
// plane; over the original floor (x₁, x₂) the same heights bend. In every
// view, the boundary is where the score crosses the plane s = 0.
//   #<id>   one case: line, circle, hyperbola, ring, wave, spiral

import { CASES, byId } from './cases.js';
import { fitCase, boundary, accuracy, SPLIT } from './build.js';
import { ScorePlot3D, CAMERAS, edgeCamera } from './plot3d.js';
import { XPlot, refreshTheme, theme } from './plot2d.js';
import { h, tex, renderMath, fmt, pct, slider, store } from './ui.js';

const T0 = refreshTheme();
const NAME = T0.names; // class names used in text, from the theme (e.g. ['blue', 'orange'])
const view = { cam: 'oblique', zeroPlane: true, ...(store('stilllinear:view') || {}) };
if (view.cam && !(view.cam in CAMERAS) && view.cam !== 'edge') view.cam = 'oblique';
const nudged = {}; // case id → weights moved on this visit
const CAMS = [
  ['oblique', 'Oblique', 'From above and to the side'],
  ['top', 'Top', 'Straight down: the score over the original space becomes the 2-D panel'],
  ['side', 'Side', 'Level, along the x₂ (or z₂) axis'],
  ['edge', 'Edge-on', 'Level, along the straight zero line in feature space: the plane is seen edge-on, as a line'],
];

// ---------- shell ----------

const root = document.getElementById('app');
const themeBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode' }, '◐', h('span', { class: 'lbl' }, ' Theme'));

const caseLinks = CASES.map((c) => h('a', { class: 'case', href: `#${c.id}`, 'data-id': c.id, title: '← → change the dataset' }, c.name, h('span', { class: 'phi', html: tex(c.phi.replace('\\Phi(x) = ', '').replace(/,\\quad.*$/, '')) })));

// the three panels: original space | score over the original space | score over feature space
const box2d = h('div', { class: 'plot-box' });
const boxX = h('div', { class: 'plot3d', role: 'img', 'aria-label': 'The score in 3-D over the original space: a curved surface, cut by the plane s = 0 along the boundary' });
const boxZ = h('div', { class: 'plot3d', role: 'img', 'aria-label': 'The score in 3-D over feature space: a flat plane, cut by the plane s = 0 along a straight line' });
const badge = h('div', { class: 'space-badge' });
const zTitle = h('b');
const zSub = h('span', { class: 'sub' });
const play = h('button', { class: 'btn primary play', type: 'button', title: 'Space' });
const range = h('input', { type: 'range', class: 'morph', min: 0, max: 1000, step: 1, value: 1000, 'aria-label': 'Floor of this view, from the original space (0) to feature space (1000)' });
const title = (name, sub) => h('div', { class: 'plot-title' }, h('span', {}, h('b', {}, name), ' ', h('span', { class: 'sub', html: sub })));
const legend = (...items) => h('div', { class: 'legend' }, ...items.map(([cls, text]) => h('span', {}, h('span', { class: `sw ${cls}` }), text)));

const panels = h('section', { class: 'panels' },
  h('div', { class: 'card panel' },
    title('Original space', tex('x = (x_1, x_2)')),
    h('div', { class: 'pwrap square' }, box2d),
    h('div', { class: 'cap' }, legend([`c0 ${T0.shape0}`, `class 0 (${NAME[0]})`], [`c1 ${T0.shape1}`, `class 1 (${NAME[1]})`], ['line', 'boundary, s = 0']))),
  h('div', { class: 'card panel' },
    title('Score over the original space', tex('s = w_0 + w^\\top \\Phi(x)')),
    h('div', { class: 'pwrap' }, boxX),
    h('div', { class: 'cap' }, legend(['r1', `s > 0: predict ${NAME[1]}`], ['r0', `s < 0: predict ${NAME[0]}`], ['zp', 'the plane s = 0']))),
  h('div', { class: 'card panel' },
    h('div', { class: 'plot-title' }, h('span', {}, zTitle, ' ', zSub)),
    h('div', { class: 'pwrap' }, boxZ, badge),
    h('div', { class: 'morph-ctl' }, play, h('span', { class: 'end' }, 'x'), range, h('span', { class: 'end' }, 'z = Φ(x)'))));

const camBtns = CAMS.map(([k, label, hint]) => {
  const b = h('button', { class: 'btn', type: 'button', 'data-cam': k, title: hint }, label);
  b.addEventListener('click', () => setCamera(k));
  return b;
});
const zeroBox = h('input', { type: 'checkbox' });
zeroBox.checked = view.zeroPlane;
const readout = h('div', { class: 'readout', 'aria-live': 'polite' });
const ctlbar = h('section', { class: 'ctlbar' },
  h('div', { class: 'seg', role: 'group', 'aria-label': '3-D camera' }, h('span', { class: 'lab' }, '3-D camera'), ...camBtns),
  h('label', { class: 'opt', title: 'Show the plane s = 0 in both 3-D views' }, zeroBox, h('span', { html: `the plane ${tex('s = 0')}` })),
  readout);

const wCard = h('section', { class: 'card weights' });
const eqEl = h('div', { class: 'eqs' });
const leadEl = h('p', { class: 'lead' });
const chosenEl = h('div', { class: 'chosen' });
const defsEl = h('div', { class: 'defs' });
const lower = h('section', { class: 'lower' },
  wCard,
  h('section', { class: 'card' }, h('h2', {}, 'The same linear model'), eqEl),
  h('section', { class: 'card about' }, h('h2', {}, 'About this case'), leadEl, chosenEl, defsEl));

const page = h('main', { class: 'still' },
  h('section', { class: 'intro' }, h('p', { class: 'lead', html:
    `Logistic regression computes a score \\(s = w_0 + w^\\top z\\) from the features \\(z = \\Phi(x)\\), and predicts ${NAME[1]} where \\(s > 0\\). Here the score is drawn as a height. <b>Over the feature axes \\((z_1, z_2)\\) it is always a flat plane.</b> Over the original axes \\((x_1, x_2)\\) the same heights bend. In every view, the boundary is where the score crosses the plane \\(s = 0\\).` })),
  h('nav', { class: 'cases', 'aria-label': 'Datasets' }, h('span', { class: 'lab' }, 'Data and Φ'), ...caseLinks),
  panels, ctlbar, lower,
  h('section', { class: 'card takeaways' }, h('h2', {}, 'What to take away'), h('ol', { html: [
    '<b>The model is still linear.</b> Over the feature floor, the score \\(s = w_0 + w_1z_1 + w_2z_2\\) is a flat plane, and the boundary \\(s = 0\\) is a straight line. Logistic regression only ever fits a plane.',
    '<b>Φ moves the floor, not the heights.</b> Apply Φ and back: every point slides sideways, from \\(x\\) to \\(z = \\Phi(x)\\), and keeps its score.',
    '<b>The curved boundary is that straight line, seen through Φ.</b> It is the set of points \\(x\\) whose features \\(\\Phi(x)\\) land on the line.',
  ].map((s) => `<li>${s}</li>`).join('') })));

root.append(
  h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#' }, 'Still a Linear Model', h('small', {}, 'IDS 705 · flat in z, curved in x')),
    h('div', { class: 'spacer' }), themeBtn),
  page,
  h('footer', { class: 'site-foot' },
    '© 2026 ', h('a', { href: 'https://kylebradbury.com/', target: '_blank', rel: 'noopener' }, 'Kyle Bradbury'),
    '. Designed by Kyle Bradbury, built with Claude.'));
renderMath(page);

// ---------- plots ----------

let c = null, fc = null, w = null, hoverI = -1, sliders = [], accEl = null, digits = 2;

const flat = new XPlot(box2d, { outerLabels: { L: 44, B: 36 } });
flat.onHover = (x, y, near) => { setHover(near ? near.i : -1); return null; };
box2d.addEventListener('pointerleave', () => setHover(-1));
const ring = (ctx, p) => {
  if (hoverI < 0 || !fc) return;
  const px = p.sx(fc.PX[2 * hoverI]), py = p.sy(fc.PX[2 * hoverI + 1]);
  ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI);
  ctx.lineWidth = 3; ctx.strokeStyle = theme().ink; ctx.stroke();
};

// The two 3-D views share one camera: dragging either one turns both.
let camReq = 0, camNext = null;
const follow = (other) => (cam) => {
  camNext = [other, cam];
  if (!camReq) camReq = requestAnimationFrame(() => { camReq = 0; camNext[0].followCamera(camNext[1]); });
  if (view.cam) { view.cam = null; store('stilllinear:view', view); syncCamButtons(); }
};
const plotX = new ScorePlot3D(boxX, { space: 'x', onHover: setHover });
const plotZ = new ScorePlot3D(boxZ, { space: 'z', onHover: setHover });
plotX.onCamera = follow(plotZ);
plotZ.onCamera = follow(plotX);
[plotX, plotZ].forEach((p) => p.setOpts({ zeroPlane: view.zeroPlane }));

// ---------- one case ----------

function show(target) {
  c = target;
  fc = fitCase(c);
  w = (nudged[c.id] || fc.w0).slice();
  hoverI = -1;
  caseLinks.forEach((a) => a.setAttribute('aria-current', String(a.dataset.id === c.id)));
  flat.setView(fc.view);
  plotX.set(fc, w);
  plotZ.set(fc, w);
  plotZ.stop();
  plotZ.setT(1);
  onT(1);
  buildWeights();
  leadEl.innerHTML = c.lead;
  chosenEl.hidden = !c.chosen;
  chosenEl.innerHTML = c.chosen ? `<b>Chosen by hand, not fit:</b> ${c.chosen}` : '';
  defsEl.innerHTML = `<div class="defs-title">Definitions</div><ul>${c.defs.map((d) => `<li>${d}</li>`).join('')}</ul>`;
  renderMath(lower);
  if (view.cam) setCamera(view.cam); // a preset (Edge-on depends on the case); a dragged camera stays
  else syncCamButtons();
  update();
  document.title = `${c.name} · Still a Linear Model`;
}

// Slider ranges: wide enough to flip the fitted weight's sign, and to move the
// score across its whole height range over the data.
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const niceCeil = (v) => { const m = 10 ** Math.floor(Math.log10(v)); return m * NICE.find((f) => f * m >= v - 1e-12); };
function weightRange(j) {
  const span = fc.sRange[1] - fc.sRange[0];
  let spread = span;
  if (j > 0) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < fc.N; i++) { const v = fc.PZ[2 * i + j - 1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    spread = span / Math.max(1e-9, hi - lo);
  }
  return niceCeil(Math.max(1.5 * Math.abs(fc.w0[j]), spread));
}

function buildWeights() {
  const M = [0, 1, 2].map(weightRange);
  digits = Math.min(...M) < 1 ? 3 : 2;
  const labels = ['\\(w_0\\) (bias)', '\\(w_1\\) (on \\(z_1\\))', '\\(w_2\\) (on \\(z_2\\))'];
  sliders = [0, 1, 2].map((j) => slider({ label: labels[j], min: -M[j], max: M[j], step: M[j] / 200, value: w[j], fmt: (v) => (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits), onInput: (v) => setWeight(j, v) }));
  const reset = h('button', { class: 'btn small', type: 'button', title: 'The weights logistic regression found' }, 'Reset to the fit');
  reset.addEventListener('click', resetWeights);
  accEl = h('p', { class: 'acc-line' });
  wCard.innerHTML = '';
  wCard.append(h('div', { class: 'card-head' }, h('h2', {}, 'The weights'), reset), ...sliders.map((s) => s.el), accEl,
    h('p', { class: 'hint', html: `The sliders start at the weights logistic regression fit to the ${SPLIT.nTrain} points shown. \\(w_0\\) moves every height up or down by the same amount; \\(w_1\\) and \\(w_2\\) tilt the plane in feature space.` }));
  renderMath(wCard);
}

let wFrame = 0;
function setWeight(j, v) {
  w[j] = v;
  nudged[c.id] = w.slice();
  cancelAnimationFrame(wFrame);
  wFrame = requestAnimationFrame(update);
}
function resetWeights() {
  w = fc.w0.slice();
  delete nudged[c.id];
  sliders.forEach((s, j) => s.set(w[j]));
  update();
}

// Everything that depends on the weights.
function update() {
  const b = boundary(fc, w);
  flat.render({ grid: b.grid, segs: b.segs, shade: 'class', points: [{ X: fc.PX, y: fc.split.train.y }], overlays: [ring] });
  plotX.setW(w);
  plotZ.setW(w);
  eqEl.innerHTML = equations();
  const a = accuracy(fc, w);
  accEl.innerHTML = `Accuracy with these weights: training <b>${pct(a.train)}</b> · new data <b>${pct(a.test)}</b><br>A straight line (raw features ${tex('x_1, x_2')}): ${pct(fc.raw.test.acc)} on new data`;
  readout.innerHTML = readoutHtml(hoverI);
}

// ---- the score, written out ----

const num = (v) => (Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : Math.abs(v).toFixed(digits));
const sumTex = (terms) => `${w[0] <= -0.5 * 10 ** -digits ? '-' : ''}${num(w[0])} ${terms.map((t, j) => `${w[j + 1] <= -0.5 * 10 ** -digits ? '-' : '+'} ${num(w[j + 1])}\\,${t}`).join(' ')}`;
function equations() {
  const row = (lab, math, note = '') => `<div class="eq-row"><div class="lab">${lab}</div><div class="math">${math}</div>${note ? `<div class="note">${note}</div>` : ''}</div>`;
  const identity = c.id === 'line';
  let out = row('The representation', tex(c.phi, true));
  out += row('In feature space', tex(`s = ${sumTex(['z_1', 'z_2'])}`, true), 'Linear in \\(z\\): a flat plane over the floor \\((z_1, z_2)\\).');
  out += row('where', tex(c.where.join(',\\quad ')));
  out += row('In the original space', tex(`s = ${sumTex(c.xTerms)}`, true), identity
    ? 'Φ does nothing here, so this is the same flat plane.'
    : 'The same heights over the floor \\((x_1, x_2)\\). This is not a weighted sum of \\(x_1\\) and \\(x_2\\), so over this floor the surface bends.');
  out += row('The boundary', tex('s = 0'), identity
    ? 'A straight line, in both spaces.'
    : `A straight line in feature space. In the original space, the curve where the surface crosses 0: ${c.boundary} at the fitted weights.`);
  out += '<p class="hint">The fitted weights were divided by the largest \\(\\lvert w_j\\rvert\\), so the heights are in those units. Multiplying every weight by the same positive number changes the heights but not where \\(s = 0\\), so it changes no prediction.</p>';
  const el = h('div', { html: out });
  renderMath(el);
  return el.innerHTML;
}

// ---- hover: one point, followed through all three panels ----

function setHover(i) {
  if (i === hoverI || !fc) return;
  hoverI = i;
  plotX.highlight(i);
  plotZ.highlight(i);
  flat.draw();
  readout.innerHTML = readoutHtml(i);
}
function readoutHtml(i) {
  if (i < 0 || !fc) return `<span class="idle">Hover over a point in any panel to follow it through all three. It sits at the same height ${tex('s')} in both 3-D views.</span>`;
  const x1 = fc.PX[2 * i], x2 = fc.PX[2 * i + 1], z1 = fc.PZ[2 * i], z2 = fc.PZ[2 * i + 1], s = w[0] + w[1] * z1 + w[2] * z2;
  const y = fc.split.train.y[i], pred = s > 0 ? 1 : 0, sep = '<span class="sep">·</span>';
  return `<span><b>Point ${i + 1}</b>${sep}<span class="k">x =</span> (${fmt(x1)}, ${fmt(x2)}) <span class="k">→ z = Φ(x) =</span> (${fmt(z1)}, ${fmt(z2)})${sep}` +
    `<span class="k">height</span> s = ${fmt(s)} in both 3-D views${sep}class ${NAME[y]}, predicted ${NAME[pred]} ${pred === y ? '✓' : '✗'}</span>`;
}

// ---- the feature-space view's floor: x → z and back ----

function onT(t) {
  range.value = String(Math.round(1000 * t));
  const fs = t >= 0.5;
  zTitle.textContent = fs ? 'Score over feature space' : 'Score over the original space';
  zSub.innerHTML = fs ? tex('s = w_0 + w^\\top z') : tex('s = w_0 + w^\\top \\Phi(x)');
  play.textContent = fs ? '◀ Back to x' : '▶ Apply Φ';
  const mid = t > 0.001 && t < 0.999, fwd = plotZ.dir > 0;
  badge.dataset.space = mid ? 'mid' : fs ? 'z' : 'x';
  badge.dataset.dir = fwd ? 'forward' : 'back';
  badge.textContent = mid ? (fwd ? 'Applying Φ: x → z = Φ(x)' : 'Undoing Φ: z = Φ(x) → x') : fs ? 'Floor: feature space, z = Φ(x)' : 'Floor: original space, x';
}
function togglePlay() {
  plotZ.animate(plotZ.t >= 0.5 ? 0 : 1, { ms: 1600, onStep: onT });
}
play.addEventListener('click', togglePlay);
range.addEventListener('input', () => { plotZ.stop(); plotZ.setT(+range.value / 1000); onT(plotZ.t); });

// ---- camera and options ----

function setCamera(k) {
  const cam = k === 'edge' ? edgeCamera(fc, w) : CAMERAS[k];
  plotX.setCamera(cam);
  plotZ.setCamera(cam);
  view.cam = k;
  store('stilllinear:view', view);
  syncCamButtons();
}
function syncCamButtons() {
  camBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === view.cam)));
}
zeroBox.addEventListener('change', () => {
  view.zeroPlane = zeroBox.checked;
  store('stilllinear:view', view);
  [plotX, plotZ].forEach((p) => p.setOpts({ zeroPlane: view.zeroPlane }));
});

// ---------- routing and keys ----------

function route() {
  show(byId(location.hash.slice(1)) || CASES[0]);
}
window.addEventListener('hashchange', route);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const i = CASES.indexOf(c), N = CASES.length;
  if (e.key === 'ArrowRight') location.hash = CASES[(i + 1) % N].id;
  else if (e.key === 'ArrowLeft') location.hash = CASES[(i + N - 1) % N].id;
  else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); togglePlay(); }
});

// ---------- theme ----------

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : mq.matches; };
function redrawAll() {
  refreshTheme();
  flat.draw();
  plotX.draw();
  plotZ.draw();
}
themeBtn.addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store('theme', next);
  redrawAll();
});
mq.addEventListener('change', () => {
  if (!store('theme')) document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
  redrawAll();
});

route();

// for the console and tests
window.still = {
  cases: CASES, view, get case() { return c; }, get fit() { return fc; }, get w() { return w; }, get hover() { return hoverI; },
  plots: { flat, x: plotX, z: plotZ }, setWeight: (j, v) => { sliders[j].set(v); setWeight(j, v); }, resetWeights, setHover, setCamera, togglePlay,
  setT: (t) => { plotZ.stop(); plotZ.setT(t); onT(plotZ.t); }, theme,
};
