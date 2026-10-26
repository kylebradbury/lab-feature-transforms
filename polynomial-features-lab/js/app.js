// Polynomial Features Lab: set the weights of a logistic regression by hand on
// the raw features x₁, x₂ (and, at any point, on polynomial terms of degree 2,
// or degree 3 in the last challenges),
// then reveal the best fit and compare. One screen: the original space (big),
// a 2-D view of feature space with drag-and-drop axes, a relative-weights
// chart, the controls, and the boundary equation pinned on top.

import { CHALLENGES, TERMS, ALL, STAGES, SPLIT, LAMBDA, wMax, stageDeg, featuresFor, compress, bestFit, scoreWeights, equationText, fitToRange, mapRegions, splitFor, LANDING, PARTS } from './challenges.js';
import { viewFor } from './fit.js';
import { Scene, LIVE_SCENES } from './scene.js';
import { XPlot, evalGrid, refreshTheme, theme, LIVE_PLOTS } from './plot2d.js';
import { marchingSquares, chainSegments, classifyConic } from './geometry.js';
import { h, tex, renderMath, fmt, pct, store, copyText, escapeHtml } from './ui.js';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const NT = TERMS.length;
const EPS = 0.005; // below this a 2-decimal weight shows as 0.00
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round2 = (v) => Math.round(v * 100) / 100;
const mag2 = (v) => (Math.abs(v) < EPS ? '0.00' : Math.abs(v).toFixed(2));
const signed2 = (v) => (Math.abs(v) < EPS ? '0.00' : v.toFixed(2));
const goalPct = (v) => `${+(100 * v).toFixed(1)}%`;
const SHAPES = { none: 'no boundary', empty: 'no boundary', point: 'a single point' };

// ---------- state (per challenge, saved in this browser) ----------

// stage: which terms exist (see STAGES: 'raw' = x₁, x₂; 'poly' = up to degree 2;
// 'cubic' = up to degree 3); include: the user's subset; w: full [w0..w9];
// touched and peeked (per stage: has this attempt seen the best fit?) gate the
// "best by hand" record.
const fresh = (c) => ({ stage: 'raw', include: ALL.slice(), w: c.start.slice(), revealed: false, peeked: { raw: false, poly: false, cubic: false }, touched: false, axes: [0, 1] });
function valid(s) {
  return !!s && STAGES.some((st) => st.id === s.stage) && Array.isArray(s.include) && s.include.length === NT &&
    Array.isArray(s.w) && s.w.length === NT + 1 && s.w.every(Number.isFinite) &&
    Array.isArray(s.axes) && s.axes.length === 2 && s.axes[0] !== s.axes[1] && s.axes.every((k) => k >= 0 && k < NT);
}
const savedStates = store('poly:state') || {};
const states = {};
for (const c of CHALLENGES) {
  const s = savedStates[c.id];
  states[c.id] = opening(valid(s) ? { ...fresh(c), ...s, peeked: { ...fresh(c).peeked, ...(typeof s.peeked === 'object' ? s.peeked : {}) } } : fresh(c));
}
// A challenge always opens on the raw features with the best fit hidden. The
// weights (including those on polynomial terms) are kept for when the student switches.
function opening(s) {
  s.stage = 'raw';
  s.revealed = false;
  if (s.axes.some((k) => TERMS[k].deg > 1)) s.axes = [0, 1];
  return s;
}
// {id: {best, seen: {raw, poly, cubic}}}: best training accuracy by hand before seeing
// the best fit, and which stages' best fit the student has ever revealed.
const progress = store('poly:progress') || {};
const prog = (id = ch().id) => (progress[id] ||= { best: null });
// {id: {stage, mask, w, acc, loss, afterReveal, bestAcc, at}}: the latest submitted answer.
const answers = store('poly:answers') || {};
let studentName = store('poly:name') || '';
const view = { mistakes: true, shade: 'prob', ...(store('poly:view') || {}) };

const indexOf = (id) => CHALLENGES.findIndex((c) => c.id === id);
let idx = indexOf(location.hash.slice(1));
if (idx < 0) idx = Math.max(0, indexOf(store('poly:last')));
const ch = () => CHALLENGES[idx];
let S = states[ch().id];

const stageTerms = () => TERMS.map((t, k) => k).filter((k) => TERMS[k].deg <= stageDeg(S.stage));
const activeMask = () => S.include.map((on, k) => (on && TERMS[k].deg <= stageDeg(S.stage) ? 1 : 0));
const effW = () => { const m = activeMask(); return S.w.map((v, k) => (k === 0 || m[k - 1] ? v : 0)); };

let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { store('poly:state', states); store('poly:progress', progress); store('poly:last', ch().id); }, 250);
}

function modelCfg(c) {
  const mask = activeMask();
  c.features = featuresFor(mask);
  c.fit = { mode: 'manual', lambda: LAMBDA, w: compress(S.w, mask) };
}
function challengeCfg(c) {
  c.dataset = { id: ch().ds, params: structuredClone(ch().params) };
  c.seed = ch().seed;
  c.split = { ...SPLIT };
  modelCfg(c);
}

// ---------- theme ----------

// Colors, point shapes and the class names used in text all come from the
// theme stylesheet (css/themes/); read them once before building the page.
const T0 = refreshTheme();
const NAME = T0.names; // e.g. ['gray', 'green']
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
// Challenge text writes class colors as {c0}/{c1} ({C0}/{C1} capitalized).
const named = (text) => text.replace(/\{([cC])([01])\}/g, (m, c, k) => (c === 'C' ? cap(NAME[+k]) : NAME[+k]));

// ---------- shell: header + equation bar ----------

const root = document.getElementById('app');
const themeBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode' }, '◐', h('span', { class: 'lbl' }, ' Theme'));
const helpBtn = h('button', { class: 'icon-btn', type: 'button', title: 'How this lab works' }, '?', h('span', { class: 'lbl' }, ' Help'));
const prevBtn = h('button', { class: 'btn', type: 'button', title: 'Previous challenge', 'aria-label': 'Previous challenge' }, '‹');
const nextBtn = h('button', { class: 'btn', type: 'button', title: 'Next challenge', 'aria-label': 'Next challenge' }, '›');
const dots = h('div', { class: 'dots' });
const dotBtns = CHALLENGES.map((c, i) => {
  // Extra-challenging ones get a ★ and are set apart by a thin divider.
  if (c.hard && !(i > 0 && CHALLENGES[i - 1].hard)) dots.append(h('span', { class: 'dots-sep', 'aria-hidden': 'true' }));
  const b = h('button', { class: `dot${c.hard ? ' hard' : ''}`, type: 'button' }, String(i + 1));
  b.addEventListener('click', () => switchTo(i));
  dots.append(b);
  return b;
});
prevBtn.addEventListener('click', () => switchTo(idx - 1));
nextBtn.addEventListener('click', () => switchTo(idx + 1));
const answersCount = h('span', { class: 'count' });
const answersBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Your submitted answers, ready to copy or screenshot' }, '📋', h('span', { class: 'lbl' }, ' My answers'), ' ', answersCount);
const resetLabBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Erase all progress in this browser and start the lab over', 'aria-label': 'Reset lab' }, '↺', h('span', { class: 'lbl' }, ' Reset lab'));
const header = h('header', { class: 'app-header' },
  h('a', { class: 'brand', href: '#', title: 'Overview of the exercises' }, 'Polynomial Features Lab', h('small', {}, 'IDS 705 · from x₁, x₂ to polynomial features')),
  h('nav', { class: 'stepper', 'aria-label': 'Challenges' }, prevBtn, dots, nextBtn),
  h('div', { class: 'spacer' }),
  answersBtn, resetLabBtn, themeBtn, helpBtn);

const eqYou = h('div', { class: 'eq-main' });
const shapeEl = h('span', { class: 'shape' });
const accBig = h('div', { class: 'big' }, '–');
const accGoal = h('div', { class: 'goal' });
const eqFit = h('div', { class: 'eq-fit' });
const fitRow = h('div', { class: 'eqrow fit', hidden: true },
  h('div', { class: 'tag' }, 'Best fit', h('small', {}, 'logistic regression')), h('span', { class: 'fit-key', 'aria-hidden': 'true' }), eqFit);
const accFit = h('div', { class: 'accbox fit', hidden: true });
const eqbar = h('section', { class: 'eqbar', 'aria-label': 'Decision boundary equation' },
  h('div', { class: 'eqrow you' }, h('div', { class: 'tag' }, 'Your boundary', h('small', {}, `${NAME[1]} where > 0`)), eqYou, shapeEl),
  h('div', { class: 'accbox' }, h('div', { class: 'tag' }, 'Training accuracy'), accBig, accGoal),
  fitRow, accFit);

// ---------- original-space plot ----------

const xbox = h('div', { class: 'plot-box' });
const ringToggle = h('input', { type: 'checkbox' });
const solidToggle = h('input', { type: 'checkbox' });
ringToggle.checked = view.mistakes;
solidToggle.checked = view.shade === 'class';
const xLegendFit = h('span', { hidden: true }, h('span', { class: 'sw fitline' }), 'best fit');
const xcard = h('section', { class: 'card plot-card xcard' },
  h('div', { class: 'plot-title' }, h('b', {}, 'Original feature space'),
    h('span', { class: 'opts' },
      h('label', { title: 'Circle the training points your boundary gets wrong' }, ringToggle, 'ring mistakes'),
      h('label', { title: 'Shade by predicted class instead of probability' }, solidToggle, 'solid regions'))),
  h('div', { class: 'xwrap' }, xbox),
  h('div', { class: 'legend' },
    h('span', {}, h('span', { class: `sw c0 ${T0.shape0}` }), `class 0 (${NAME[0]})`), h('span', {}, h('span', { class: `sw c1 ${T0.shape1}` }), `class 1 (${NAME[1]})`),
    h('span', {}, h('span', { class: 'sw ring' }), 'misclassified'), h('span', {}, h('span', { class: 'sw line' }), 'your boundary'), xLegendFit));

// ---------- feature-space view ----------

const zchips = h('div', { class: 'zchips', role: 'group', 'aria-label': 'Features: drag one onto an axis, or click it' });
const swapBtn = h('button', { class: 'btn swap', type: 'button', title: 'Swap the axes' }, '⇄ swap');
const zbox = h('div', { class: 'plot-box zbox' });
const zwrap = h('div', { class: 'zwrap' }, zbox);
const dropHint = h('div', { class: 'drop-hint', hidden: true });
const znote = h('div', { class: 'znote' });
const zcard = h('section', { class: 'card plot-card zcard' },
  h('div', { class: 'plot-title' }, h('b', {}, 'Feature space'), swapBtn), zchips, zwrap, znote);

// ---------- relative-weights chart ----------

const wbars = h('div', { class: 'wbars' });
const chartRows = [];
for (let k = 0; k <= NT; k++) {
  const you = h('div', { class: 'bar you' }), best = h('div', { class: 'bar best', hidden: true }), val = h('div', { class: 'val' });
  const row = h('div', { class: 'wbar-row', 'data-k': k },
    h('div', { class: 'lab', html: k === 0 ? '<span class="nb">bias</span>' : tex(TERMS[k - 1].tex) }), h('div', { class: 'track' }, you, best), val);
  row.addEventListener('pointerenter', () => setHover(k));
  row.addEventListener('pointerleave', () => setHover(null));
  wbars.append(row);
  chartRows.push({ row, you, best, val });
}
const wLegendBest = h('span', { hidden: true }, h('span', { class: 'sw best' }), 'best fit');
const wcard = h('section', { class: 'card plot-card wcard' },
  h('div', { class: 'plot-title' }, h('b', {}, 'Relative weights'), h('span', { title: 'Each set of weights is divided by its own largest |w|' }, '÷ largest |w|')),
  wbars, h('div', { class: 'legend' }, h('span', {}, h('span', { class: 'sw you' }), `yours (${NAME[1]} +, ${NAME[0]} −)`), wLegendBest));

// ---------- challenge card ----------

const kicker = h('span', { class: 'kicker' });
const chName = h('h2', { class: 'ch-name' });
const chHard = h('span', { class: 'hard-badge', title: 'Degree 3: up to nine features to balance by hand', hidden: true }, '★ Extra challenging');
const chBrief = h('p', { class: 'ch-brief' });
const chGoal = h('div', { class: 'ch-goal' });
const chHintBody = h('p');
const chHint = h('details', { class: 'ch-hint' }, h('summary', {}, 'Need a hint?'), chHintBody);
const chCard = h('section', { class: 'card ch-card' }, kicker, h('div', { class: 'ch-title' }, chName, chHard), chBrief, chGoal, chHint);

// ---------- model card: features + weights ----------

// One button per feature set; a challenge shows those up to its maxDeg.
const SEG_TITLES = { raw: 'Only the raw inputs', poly: 'Add x₁², x₁x₂ and x₂²', cubic: 'Add x₁³, x₁²x₂, x₁x₂² and x₂³ as well' };
const segBtns = STAGES.map((st) => {
  const b = h('button', { type: 'button', 'data-stage': st.id, title: SEG_TITLES[st.id] });
  b.addEventListener('click', () => setStage(st.id));
  return b;
});
const wrows = h('div', { class: 'wrows' });
const ctl = [];
for (let k = 0; k <= NT; k++) ctl.push(weightRow(k));
const flipBtn = h('button', { class: 'flip', type: 'button', title: 'Flip all signs: same boundary, colors swapped' }, '± flip');
flipBtn.addEventListener('click', () => { S.w = S.w.map((v) => (v === 0 ? 0 : -v)); S.touched = true; stateChanged(); });
const submitBtn = h('button', { class: 'btn primary', type: 'button', title: 'Record these weights in My answers (submitting again replaces the row)' });
const revealBtn = h('button', { class: 'btn fit', type: 'button' });
const resetBtn = h('button', { class: 'btn', type: 'button', title: 'Start this challenge over: raw features, starting weights, best fit hidden' }, '↺ Reset');
const nextChallengeBtn = h('button', { class: 'btn', type: 'button' }, 'Next challenge →');
nextChallengeBtn.addEventListener('click', () => switchTo(idx + 1));
const statusEl = h('div', { class: 'status', hidden: true });
const modelCard = h('section', { class: 'card model-card' },
  h('div', { class: 'seg', role: 'group', 'aria-label': 'Features in the model' }, ...segBtns),
  h('div', { class: 'wrows-head' }, h('span', { title: 'Include this feature in the model' }, 'use'), h('span', {}, 'feature'), h('span', { title: 'Drag, type, or double-click a slider to set it to 0' }, 'weight'), flipBtn),
  wrows,
  h('div', { class: 'btn-row actions' }, submitBtn, revealBtn, resetBtn, nextChallengeBtn), statusEl);

function weightRow(k) {
  const bias = k === 0;
  const name = bias ? 'bias' : TERMS[k - 1].label;
  const inc = bias ? h('span') : h('input', { type: 'checkbox', title: 'Include this feature in the model', 'aria-label': `Include ${name}` });
  const term = h('span', { class: 'wterm' }, h('span', { html: bias ? '<span class="nb">bias</span>' : tex(TERMS[k - 1].tex) }), h('span', { class: 'wname' }, `w${SUB[k]}`));
  const m = wMax(k); // degree-3 sliders span a smaller range for finer control
  const range = h('input', { type: 'range', min: -m, max: m, step: 0.01, title: `Range ±${m}. Double-click to set to 0`, 'aria-label': `Weight w${SUB[k]} on ${name}` });
  const num = h('input', { type: 'number', min: -m, max: m, step: m >= 5 ? 0.05 : 0.01, inputmode: 'decimal', 'aria-label': `Weight w${SUB[k]} on ${name}, exact value` });
  const row = h('div', { class: 'wrow', 'data-k': k }, inc, term, range, num);
  range.addEventListener('input', () => setWeight(k, +range.value, range));
  range.addEventListener('dblclick', () => setWeight(k, 0));
  num.addEventListener('input', () => { const v = parseFloat(num.value); if (Number.isFinite(v)) setWeight(k, v, num); });
  num.addEventListener('change', syncControls);
  if (!bias) inc.addEventListener('change', () => setInclude(k - 1, inc.checked));
  row.addEventListener('pointerenter', () => setHover(k));
  row.addEventListener('pointerleave', () => setHover(null));
  row.addEventListener('focusin', () => setHover(k));
  row.addEventListener('focusout', () => setHover(null));
  wrows.append(row);
  return { row, range, num, inc };
}

// ---------- compare panel (after reveal) ----------

const compareBody = h('div');
const useBtn = h('button', { class: 'btn', type: 'button', title: 'Put the best-fit weights on your sliders, scaled down to fit (same boundary)' }, 'Copy best fit to my sliders');
const insightEl = h('div', { class: 'insight' });
const compare = h('section', { class: 'card compare', hidden: true }, h('h2', {}, 'You vs. the best fit'), compareBody, h('div', { class: 'btn-row' }, useBtn), insightEl);

const midCol = h('div', { class: 'col mid' }, zcard, wcard);
const workspace = h('main', { class: 'workspace' },
  h('div', { class: 'col xcol' }, xcard),
  midCol,
  h('div', { class: 'col side' }, chCard, modelCard, compare));
const landing = h('main', { class: 'landing', hidden: true });
root.append(header, eqbar, workspace, landing,
  h('footer', { class: 'site-foot' },
    '© 2026 ', h('a', { href: 'https://kylebradbury.com/', target: '_blank', rel: 'noopener' }, 'Kyle Bradbury'),
    '. Designed by Kyle Bradbury, built with Claude.'));

// ---------- plots + scene ----------

const fitColor = () => getComputedStyle(document.documentElement).getPropertyValue('--fit').trim() || '#6a3fd0';
let FIT = fitColor();
const xplot = new XPlot(xbox, { outerLabels: true });
const zplot = new XPlot(zbox, { outerLabels: { L: 46, B: 36 } }); // slimmer margins: this plot is small
zbox.append(dropHint);
const scene = new Scene({ plot: xplot, cfg: (() => { const c = { view: { showTest: false, mistakes: view.mistakes, shade: view.shade } }; challengeCfg(c); return c; })(), onFrame });
scene.overlays = [(c, plot) => { const b = currentBest(); if (b) plot.drawSegs(b.segs, b.G, { color: FIT, width: 2.4, dash: [9, 6], halo: true }); }];

// Best fit on the current terms. Only called inside a scene frame (after
// sync), so scene.split always belongs to the current challenge.
let best = null;
const bestKey = () => `${ch().id}|${activeMask().join('')}`;
function currentBest() {
  if (!S.revealed || !scene.split) return null;
  const key = bestKey();
  if (!best || best.key !== key) {
    const r = bestFit(scene.split, activeMask()), G = 170;
    best = { ...r, key, G, segs: marchingSquares(evalGrid(r.prep.fmap, r.wActive, scene.displayView(), G).V, G) };
    scene.invalidate('paint'); // the overlay for this frame may already be drawn
  }
  return best;
}

function onFrame(sc) {
  const b = currentBest();
  updateEquation(b);
  updateAccuracy(sc, b);
  updateBars(b);
  renderZ(sc, b);
  updateCompare(sc, b);
  track(sc);
}

// ---------- equation ----------

let lastEq = '', lastFitEq = '';
function termSpan(v, k, labels) {
  const body = k === 0 ? mag2(v) : `${mag2(v)}\\,${TERMS[k - 1].tex}`;
  return `<span class="term${Math.abs(v) < EPS ? ' zero' : ''}" data-k="${k}">${tex(body)}${labels ? `<span class="wlab">w${SUB[k]}</span>` : ''}</span>`;
}
function eqHtml(w, mask, labels) {
  let s = (w[0] <= -EPS ? '<span class="op">−</span>' : '') + termSpan(w[0], 0, labels);
  mask.forEach((on, i) => { if (on) s += `<span class="op">${w[i + 1] <= -EPS ? '−' : '+'}</span>${termSpan(w[i + 1], i + 1, labels)}`; });
  return `${s}<span class="op">=</span><span class="term">${tex('0')}</span>`;
}
function updateEquation(b) {
  const html = eqHtml(S.w, activeMask(), true), long = activeMask().reduce((s, v) => s + v, 0) > 5;
  if (html !== lastEq) { eqYou.innerHTML = html; lastEq = html; applyHighlight(); }
  eqYou.classList.toggle('long', long);
  eqFit.classList.toggle('long', long);
  const w = effW(), cubic = w.slice(6).some((v) => Math.abs(v) >= EPS);
  const c = cubic ? { name: 'cubic curve', detail: 'A degree-3 boundary: it can bend more than once' } : classifyConic(w.slice(0, 6));
  shapeEl.innerHTML = `shape: <b>${SHAPES[c.name] || c.name}</b>`;
  shapeEl.title = c.detail;
  if (b) {
    const d = activeMask().reduce((s, v) => s + v, 0);
    const f = `${eqHtml(b.w, activeMask(), false)}<span class="fit-d">${d} feature${d === 1 ? '' : 's'}</span>`;
    if (f !== lastFitEq) { eqFit.innerHTML = f; lastFitEq = f; }
  }
}
eqYou.addEventListener('pointerover', (e) => { const t = e.target.closest('.term[data-k]'); setHover(t ? +t.dataset.k : null); });
eqYou.addEventListener('pointerleave', () => setHover(null));

function updateAccuracy(sc, b) {
  const acc = sc.metrics.train.acc, goal = ch().goal, met = acc >= goal - 1e-9;
  accBig.textContent = pct(acc);
  accGoal.className = `goal${met ? ' met' : ''}`;
  accGoal.textContent = met ? `✓ goal ≥ ${goalPct(goal)} reached` : `goal ≥ ${goalPct(goal)}`;
  fitRow.hidden = accFit.hidden = !b;
  if (b) accFit.innerHTML = `<b>${pct(b.acc)}</b>`;
}

// ---------- relative weights ----------

function place(el, f) {
  const w = Math.min(1, Math.abs(f)) * 50;
  el.style.left = f >= 0 ? '50%' : `${50 - w}%`;
  el.style.width = `${w}%`;
}
function updateBars(b) {
  const mask = activeMask(), terms = stageTerms(), w = effW();
  const on = (k) => k === 0 || !!mask[k - 1];
  const mx = Math.max(1e-12, ...w.map(Math.abs));
  const bmx = b ? Math.max(1e-12, ...b.w.map(Math.abs)) : 1;
  chartRows.forEach((r, k) => {
    r.row.hidden = k > 0 && !terms.includes(k - 1);
    r.row.classList.toggle('off', !on(k));
    r.you.className = `bar you ${w[k] >= 0 ? 'pos' : 'neg'}`;
    place(r.you, on(k) ? w[k] / mx : 0);
    r.best.hidden = !b || !on(k);
    if (b && on(k)) place(r.best, b.w[k] / bmx);
    r.val.innerHTML = on(k) ? `<span>${signed2(w[k])}</span>${b ? `<span class="bf">${signed2(b.w[k])}</span>` : ''}` : 'not used';
  });
  wLegendBest.hidden = !b;
  wbars.classList.toggle('many', terms.length > 5); // degree 3: ten rows, packed tighter
}

// ---------- feature-space view ----------

let zc = { key: '' }, zRegions = { src: null, key: '' };
function renderZ(sc, b) {
  const [a, c] = S.axes, tr = sc.split.train, N = tr.y.length;
  const key = `${ch().id}|${a}|${c}`;
  if (zc.key !== key) {
    const X = new Float64Array(2 * N), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (let i = 0; i < N; i++) {
      const x1 = tr.X[2 * i], x2 = tr.X[2 * i + 1], u = TERMS[a].f(x1, x2), v = TERMS[c].f(x1, x2);
      X[2 * i] = u; X[2 * i + 1] = v;
      lo[0] = Math.min(lo[0], u); hi[0] = Math.max(hi[0], u); lo[1] = Math.min(lo[1], v); hi[1] = Math.max(hi[1], v);
    }
    // Axes span exactly what each feature takes over the original plot's box
    // (e.g. x₁² from 0 to 9), so there is no margin beyond the data's space.
    const xv = sc.displayView();
    for (let j = 0; j <= 60; j++) for (let i = 0; i <= 60; i++) {
      const x1 = xv.xmin + (i / 60) * (xv.xmax - xv.xmin), x2 = xv.ymin + (j / 60) * (xv.ymax - xv.ymin);
      const u = TERMS[a].f(x1, x2), v = TERMS[c].f(x1, x2);
      lo[0] = Math.min(lo[0], u); hi[0] = Math.max(hi[0], u); lo[1] = Math.min(lo[1], v); hi[1] = Math.max(hi[1], v);
    }
    zc = { key, X, view: { xmin: lo[0], xmax: hi[0], ymin: lo[1], ymax: hi[1] } };
  }
  const mask = activeMask(), w = effW();
  // The boundary is exactly a line in this plane iff no other active term has weight.
  const others = (ww) => mask.map((on, k) => (on && k !== a && k !== c && Math.abs(ww[k + 1]) > 1e-9 ? k : -1)).filter((k) => k >= 0);
  const plane = (ww) => {
    const G = 72, V = new Float32Array(G * G), v = zc.view, wa = mask[a] ? ww[a + 1] : 0, wc = mask[c] ? ww[c + 1] : 0;
    for (let j = 0; j < G; j++) {
      const z2 = v.ymin + ((j + 0.5) / G) * (v.ymax - v.ymin);
      for (let i = 0; i < G; i++) V[j * G + i] = ww[0] + wa * (v.xmin + ((i + 0.5) / G) * (v.xmax - v.xmin)) + wc * z2;
    }
    return { G, V };
  };
  // Exact: shade the plane and draw the full line. Otherwise carry the regions
  // and the boundary traced in the original space into this plane, point by point.
  const oth = others(w), grid = oth.length ? null : plane(w);
  if (!grid && (zRegions.src !== sc.grid || zRegions.key !== key)) {
    zRegions = { src: sc.grid, key, g: mapRegions(sc.grid, sc.displayView(), a, c, zc.view) };
  }
  const shading = grid || zRegions.g;
  const bGrid = b && !others(b.w).length ? plane(b.w) : null;
  const bSegs = bGrid ? marchingSquares(bGrid.V, bGrid.G) : null;
  const xv = sc.displayView();
  const youLines = grid ? null : mapContour(sc.segs, sc.grid.G, xv, a, c);
  const bLines = b && !bGrid ? mapContour(b.segs, b.G, xv, a, c) : null;
  zplot.setView(zc.view);
  zplot.axisLabels = [TERMS[a].label, TERMS[c].label];
  zplot.onHover = (u, v, near) => `${TERMS[a].label} = ${fmt(u)}<br>${TERMS[c].label} = ${fmt(v)}${near ? `<div class="sep"></div>training point, class <b>${near.label ? NAME[1] : NAME[0]}</b>` : ''}`;
  const ySegs = grid ? marchingSquares(grid.V, grid.G) : null;
  zplot.render({
    grid: shading, shade: view.shade,
    points: [{ X: zc.X, y: tr.y, name: 'training', mistakes: view.mistakes ? sc.mistakes('train') : null }],
    // Boundaries go over the points: in feature space the points often pile up right on them.
    overlays: [
      ySegs && ((ctx, p) => p.drawSegs(ySegs, grid.G, { color: theme().ink, width: 2.5, halo: true })),
      youLines && ((ctx, p) => strokeLines(ctx, p, youLines, { color: theme().ink, width: 2.5 })),
      bSegs && ((ctx, p) => p.drawSegs(bSegs, bGrid.G, { color: FIT, width: 2.2, dash: [8, 5], halo: true })),
      bLines && ((ctx, p) => strokeLines(ctx, p, bLines, { color: FIT, width: 2.2, dash: [8, 5] })),
    ].filter(Boolean),
  });
  zc.drawn = grid ? 'line' : youLines.length; // for the smoke test
  const d = mask.reduce((s, v) => s + v, 0), lab = (k) => TERMS[k].label;
  let note;
  if (S.stage === 'raw' && a + c === 1) note = 'With raw features, feature space is the original space, so your boundary is the same line.';
  else if (!oth.length) note = 'Every other feature has weight 0, so here your boundary is exactly a <b>straight line</b>.';
  else {
    const who = oth.length <= 2 ? `${oth.map(lab).join(' and ')} also ${oth.length === 1 ? 'has' : 'have'}` : `${oth.length} other features also have`;
    note = `Colors and boundary carried over from the original space; they bend because ${who} weight (in all ${d} features the boundary is flat).`;
  }
  const missing = [a, c].filter((k) => !mask[k]);
  if (missing.length) note += ` <i>${missing.map(lab).join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not in your model.</i>`;
  if (znote.innerHTML !== note) { znote.innerHTML = note; znote.title = znote.textContent; }
}

// A boundary contour from an original-space grid over `view` (marchingSquares
// output, grid-index units) as polylines in the (a, c) feature plane.
function mapContour(segs, G, view, a, c) {
  const fa = TERMS[a].f, fc = TERMS[c].f, sx = (view.xmax - view.xmin) / G, sy = (view.ymax - view.ymin) / G;
  return chainSegments(segs).map((line) => {
    const out = new Float64Array(line.length);
    for (let k = 0; k < line.length; k += 2) {
      const x1 = view.xmin + (line[k] + 0.5) * sx, x2 = view.ymin + (line[k + 1] + 0.5) * sy;
      out[k] = fa(x1, x2); out[k + 1] = fc(x1, x2);
    }
    return out;
  });
}
function strokeLines(ctx, p, lines, { color, width, dash = [] }) {
  const path = new Path2D();
  for (const l of lines) {
    path.moveTo(p.sx(l[0]), p.sy(l[1]));
    for (let k = 2; k < l.length; k += 2) path.lineTo(p.sx(l[k]), p.sy(l[k + 1]));
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dash);
  ctx.strokeStyle = theme().surface; ctx.lineWidth = width + 2.5; ctx.globalAlpha = 0.85; ctx.stroke(path);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = 1; ctx.stroke(path);
  ctx.restore();
}

function syncZControls() {
  const terms = stageTerms(), mask = activeMask();
  zchips.innerHTML = '';
  for (const k of terms) {
    const ax = S.axes[0] === k ? '→' : S.axes[1] === k ? '↑' : '';
    const chip = h('button', {
      class: `zchip${mask[k] ? '' : ' off'}`, type: 'button',
      title: mask[k] ? 'Drag onto the plot (or click) to put it on an axis' : 'Not in your model, but you can still plot it',
      html: tex(TERMS[k].tex) + (ax ? `<span class="ax">${ax}</span>` : ''),
    });
    bindChip(chip, k);
    zchips.append(chip);
  }
}
swapBtn.addEventListener('click', () => { S.axes = [S.axes[1], S.axes[0]]; axesChanged(); });

function assignAxis(k, ax) {
  if (S.axes[ax] === k) return;
  if (S.axes[1 - ax] === k) S.axes[1 - ax] = S.axes[ax]; // dropping the other axis's feature swaps them
  S.axes[ax] = k;
  axesChanged();
}
function axesChanged() { syncZControls(); scene.invalidate('paint'); save(); }

// Pointer drag (mouse, pen and touch). Lower-right half of the plot or the →
// menu = horizontal axis; upper-left half or the ↑ menu = vertical axis.
let suppressClick = false;
function bindChip(chip, k) {
  chip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, target = null;
    try { chip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!ghost) {
        closeMenu();
        ghost = h('div', { class: 'zchip ghost', html: `${tex(TERMS[k].tex)}<span class="to"></span>` });
        document.body.append(ghost);
        chip.classList.add('dragging');
      }
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
      target = dropTarget(ev.clientX, ev.clientY);
      showTarget(target, ghost);
    };
    const end = (drop) => {
      chip.removeEventListener('pointermove', move);
      chip.removeEventListener('pointerup', up);
      chip.removeEventListener('pointercancel', cancel);
      if (!ghost) return;
      ghost.remove();
      chip.classList.remove('dragging');
      showTarget(null);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (drop && target !== null) assignAxis(k, target);
    };
    const up = () => end(true), cancel = () => end(false);
    chip.addEventListener('pointermove', move);
    chip.addEventListener('pointerup', up);
    chip.addEventListener('pointercancel', cancel);
  });
  chip.addEventListener('click', () => { if (!suppressClick) openMenu(k, chip); });
}
function dropTarget(x, y) {
  const hit = (el) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? r : null; };
  const r = hit(zbox);
  if (!r) return null;
  return (x - r.left) / r.width + (y - r.top) / r.height > 1 ? 0 : 1;
}
function showTarget(t, ghost = null) {
  dropHint.hidden = t === null;
  if (t !== null) { dropHint.className = `drop-hint ${t === 0 ? 'h' : 'v'}`; dropHint.textContent = t === 0 ? 'horizontal axis' : 'vertical axis'; }
  if (ghost) ghost.querySelector('.to').textContent = t === 0 ? '→ horizontal' : t === 1 ? '↑ vertical' : '';
}

// Click / keyboard alternative to dragging: a two-item menu under the chip.
let menu = null;
function openMenu(k, chip) {
  closeMenu();
  const item = (ax, label) => {
    const b = h('button', { class: 'btn', type: 'button', role: 'menuitem' }, label);
    b.addEventListener('click', () => { closeMenu(); assignAxis(k, ax); });
    return b;
  };
  menu = h('div', { class: 'zmenu', role: 'menu', 'aria-label': `Show ${TERMS[k].label} on` }, item(0, '→ horizontal axis'), item(1, '↑ vertical axis'));
  zcard.append(menu);
  const cr = zcard.getBoundingClientRect(), r = chip.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(r.left - cr.left, cr.width - menu.offsetWidth - 4))}px`;
  menu.style.top = `${r.bottom - cr.top + 4}px`;
  menu.querySelector('button').focus();
  setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true), 0);
}
function outsideMenu(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  document.removeEventListener('pointerdown', outsideMenu, true);
}

// ---------- compare panel ----------

let lastCmp = '';
function updateCompare(sc, b) {
  if (!b) return;
  const you = sc.metrics.train, d = you.acc - b.acc, p = progress[ch().id];
  const terms = activeMask().map((on, k) => (on ? TERMS[k].label : null)).filter(Boolean);
  const pts = (v) => `${(100 * Math.abs(v)).toFixed(1)} percentage points`;
  const verdict = Math.abs(d) < 1e-9 ? '<b>You match the best fit’s training accuracy.</b>'
    : d > 0 ? `<b>You beat the best fit by ${pts(d)}.</b> It minimizes cross-entropy, not the number of mistakes, so this can happen.`
      : `The best fit is <b>${pts(d)}</b> ahead of you.`;
  const html = `<p class="feats">Both models use the same <b>${terms.length} feature${terms.length === 1 ? '' : 's'}</b>${terms.length ? `: ${terms.join(', ')}` : ''}.</p>` +
    `<table class="cmp"><thead><tr><th></th><th>You</th><th class="bf">Best fit</th></tr></thead><tbody>` +
    `<tr><td>Features used</td><td>${terms.length}</td><td class="bf">${terms.length}</td></tr>` +
    `<tr><td>Training accuracy</td><td>${pct(you.acc)}</td><td class="bf">${pct(b.acc)}</td></tr>` +
    `<tr><td title="What logistic regression minimizes. It also rewards confidence: scaling all weights up (same boundary) lowers it when most points are right.">Cross-entropy (lower is better)</td><td>${fmt(you.loss, 3)}</td><td class="bf">${fmt(b.loss, 3)}</td></tr>` +
    `</tbody></table><p class="verdict">${verdict}</p>` +
    (p && p.best != null ? `<p class="hint">Your best by hand before revealing: <b>${pct(p.best)}</b>.</p>` : '');
  if (html !== lastCmp) { compareBody.innerHTML = html; lastCmp = html; }
}
useBtn.addEventListener('click', () => {
  if (!best || best.key !== bestKey()) return;
  const mask = activeMask(), s = fitToRange(best.w);
  S.w = S.w.map((v, k) => (k === 0 || mask[k - 1] ? s[k] : v));
  stateChanged();
});

// Best training accuracy reached by hand: only after the student has changed
// something and before they have looked at this stage's best fit in this attempt.
function track(sc) {
  if (!S.touched || S.peeked[S.stage]) return;
  const acc = sc.metrics.train.acc, p = prog();
  if (p.best != null && acc <= p.best) return;
  p.best = acc;
  syncGoal();
  syncDots();
  save();
}

// ---------- updates ----------

function setWeight(k, v, src = null) {
  v = round2(clamp(v, -wMax(k), wMax(k)));
  S.w[k] = v;
  S.touched = true;
  if (src !== ctl[k].range) ctl[k].range.value = String(v);
  if (src !== ctl[k].num) ctl[k].num.value = v.toFixed(2);
  pulse(k);
  scene.update((c) => { c.fit.w = compress(S.w, activeMask()); }, 'model');
  save();
}
function setInclude(t, on) { S.include[t] = on ? 1 : 0; S.touched = true; featuresChanged(); }
function setStage(stage) {
  if (S.stage === stage) return;
  S.stage = stage;
  S.touched = true;
  if (S.axes.some((k) => TERMS[k].deg > stageDeg(stage))) S.axes = [0, 1];
  featuresChanged();
}
// A shown best fit belonged to the old features; hide it so it does not give
// away the answer for the new ones.
function featuresChanged() {
  if (S.revealed) {
    S.revealed = false;
    flash('Best fit hidden because the features changed. Reveal it again when you are ready.');
  }
  stateChanged();
}
function stateChanged() {
  scene.update((c) => modelCfg(c), 'features');
  syncControls();
  syncZControls();
  syncActions();
  save();
}

function syncControls() {
  const three = ch().maxDeg >= 3;
  segBtns.forEach((b, i) => {
    const st = STAGES[i];
    b.hidden = st.deg > ch().maxDeg;
    b.innerHTML = st.id === 'raw' ? `Raw ${tex('x_1,\\ x_2')}` : three ? `Degree ${st.deg}` : 'Polynomial, degree 2';
    b.setAttribute('aria-pressed', String(S.stage === st.id));
  });
  const terms = stageTerms();
  ctl.forEach((c, k) => {
    const on = k === 0 || !!S.include[k - 1];
    c.row.hidden = k > 0 && !terms.includes(k - 1);
    c.row.classList.toggle('off', !on);
    if (k > 0) c.inc.checked = on;
    c.range.disabled = c.num.disabled = !on;
    c.range.value = String(S.w[k]);
    c.num.value = S.w[k].toFixed(2);
  });
}
function syncActions() {
  const submitted = !!answers[ch().id], last = idx === CHALLENGES.length - 1;
  submitBtn.textContent = submitted ? 'Resubmit answer' : 'Submit answer';
  revealBtn.textContent = S.revealed ? 'Hide best fit' : 'Reveal best fit';
  revealBtn.setAttribute('aria-pressed', String(S.revealed));
  nextChallengeBtn.disabled = last;
  nextChallengeBtn.title = last ? 'This is the last challenge' : `Go to challenge ${idx + 2}: ${CHALLENGES[idx + 1].name}`;
  nextChallengeBtn.classList.toggle('primary', submitted && !last);
  compare.hidden = !S.revealed;
  xLegendFit.hidden = !S.revealed;
  insightEl.innerHTML = named(ch().insight);
}
function syncGoal() {
  const c = ch(), p = progress[c.id], b = p && p.best, met = b != null && b >= c.goal - 1e-9, a = answers[c.id];
  chGoal.innerHTML = `Goal: training accuracy ≥ <b>${goalPct(c.goal)}</b> by hand` +
    (b != null ? ` · your best: <span class="${met ? 'met' : ''}">${pct(b)}${met ? ' ✓' : ''}</span>` : '') +
    (a ? ` · submitted: <b>${pct(a.acc)}</b>` : '');
}
function syncDots() {
  dotBtns.forEach((btn, i) => {
    const c = CHALLENGES[i], p = progress[c.id], met = !!(p && p.best != null && p.best >= c.goal - 1e-9);
    btn.setAttribute('aria-current', String(i === idx));
    btn.classList.toggle('met', met);
    btn.title = `${i + 1}. ${c.name}${c.hard ? ' (extra challenging)' : ''}${met ? ' (goal reached)' : ''}`;
  });
}
function syncChallenge() {
  const c = ch();
  kicker.textContent = `Challenge ${idx + 1} of ${CHALLENGES.length}`;
  chName.textContent = c.name;
  chHard.hidden = !c.hard;
  chBrief.innerHTML = named(c.brief);
  chHintBody.innerHTML = named(c.hint);
  chHint.open = false;
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === CHALLENGES.length - 1;
  syncGoal();
  syncDots();
}

function switchTo(i) {
  showWorkspace();
  i = clamp(i, 0, CHALLENGES.length - 1);
  if (i === idx) return;
  idx = i;
  S = opening(states[ch().id]);
  statusEl.hidden = true;
  clearTimeout(statusT);
  undo = null;
  closeMenu();
  scene.update((c) => challengeCfg(c), 'data');
  if (location.hash.slice(1) !== ch().id) history.replaceState(null, '', `#${ch().id}`);
  syncChallenge();
  syncControls();
  syncZControls();
  syncActions();
  save();
}
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1), i = indexOf(id);
  if (i >= 0) switchTo(i);
  else if (!id) showLanding();
});

// ---------- intro page (no challenge in the address; the header title links here) ----------

let onLanding = false, landingPlots = [];
function showLanding() {
  onLanding = true;
  closeMenu();
  document.body.classList.add('on-landing');
  eqbar.hidden = workspace.hidden = true;
  landing.hidden = false;
  renderLanding();
  window.scrollTo(0, 0);
}
function showWorkspace() {
  if (!onLanding) return;
  onLanding = false;
  document.body.classList.remove('on-landing');
  landing.hidden = true;
  eqbar.hidden = workspace.hidden = false;
  scene.invalidate('grid');
  requestAnimationFrame(fitZ);
}
function renderLanding() {
  landingPlots.forEach((pl) => pl.destroy());
  landingPlots = [];
  landing.replaceChildren(h('section', { class: 'hero' },
    h('h1', {}, LANDING.title),
    h('p', { class: 'lead', html: named(LANDING.lead) }),
    h('ol', { class: 'steps', html: LANDING.steps.map((t) => `<li>${named(t)}</li>`).join('') }),
    h('div', { class: 'hero-actions' }, h('a', { class: 'btn primary play', href: `#${CHALLENGES[0].id}` }, 'Start: challenge 1 →'))));
  const DEG = ['', 'raw features', 'degree 2', 'degree 3'];
  for (const part of PARTS) {
    const grid = h('div', { class: 'tiles' });
    for (const id of part.ids) {
      const i = indexOf(id), c = CHALLENGES[i], p = progress[id], box = h('div', { class: 'plot-box' });
      const met = !!(p && p.best != null && p.best >= c.goal - 1e-9);
      const marks = [met ? '✓ goal reached' : null, answers[id] ? 'submitted' : null].filter(Boolean).join(' · ');
      grid.append(h('a', { class: 'tile', href: `#${id}` }, h('div', { class: 'tile-plot' }, box),
        h('div', { class: 'tile-cap' },
          h('div', { class: 'tile-top' }, h('b', {}, `${i + 1}. ${c.name}`), c.hard ? h('span', { class: 'fam' }, '★ extra challenging') : null),
          h('div', { class: 'tile-lead' }, `Goal ≥ ${goalPct(c.goal)} training accuracy · ${DEG[c.need]}`),
          marks ? h('div', { class: 'tile-done' }, marks) : null)));
      const plot = new XPlot(box, { thumb: true }), tr = splitFor(c).train;
      plot.setView(viewFor(c.ds));
      plot.render({ grid: null, points: [{ X: tr.X, y: tr.y, name: 'training' }] });
      landingPlots.push(plot);
    }
    landing.append(h('section', { class: 'wing' }, h('h2', {}, part.name), h('p', { class: 'blurb' }, part.blurb), grid));
  }
  const fin = h('button', { class: 'finale-link card', type: 'button' },
    h('span', { class: 'kicker' }, 'At the end'), h('b', {}, '📋 My answers'), h('span', {}, 'Every answer you submitted in one table, ready to copy or screenshot →'));
  fin.addEventListener('click', showAnswers);
  landing.append(fin);
  renderMath(landing);
}

revealBtn.addEventListener('click', () => {
  S.revealed = !S.revealed;
  if (S.revealed) {
    S.peeked[S.stage] = true;
    const p = prog();
    p.seen = { ...(p.seen || {}), [S.stage]: true };
  }
  syncActions();
  scene.invalidate('paint');
  save();
});

// One-line message under the buttons, with an optional action link.
let undo = null, statusT = 0;
function flash(text, action = null, onAction = null, ms = 8000) {
  statusEl.innerHTML = '';
  statusEl.append(text);
  if (action) {
    const b = h('button', { type: 'button' }, action);
    b.addEventListener('click', onAction);
    statusEl.append(' ', b);
  }
  statusEl.hidden = false;
  clearTimeout(statusT);
  statusT = setTimeout(() => { statusEl.hidden = true; undo = null; }, ms);
}

resetBtn.addEventListener('click', () => {
  const id = ch().id;
  undo = { id, state: structuredClone(S) };
  states[id] = S = fresh(ch());
  stateChanged();
  flash('Challenge reset to its starting point.', 'Undo', () => {
    if (!undo || undo.id !== ch().id) return;
    states[undo.id] = S = undo.state;
    undo = null;
    statusEl.hidden = true;
    stateChanged();
  }, 10000);
});

// ---------- submitted answers ----------

submitBtn.addEventListener('click', () => {
  scene.sync(); // make sure the split belongs to this challenge
  const c = ch(), mask = activeMask(), m = scoreWeights(scene.split, S.w, mask);
  answers[c.id] = {
    stage: S.stage, mask, w: effW(), acc: m.acc, loss: m.loss,
    afterReveal: !!S.peeked[S.stage], bestAcc: bestFit(scene.split, mask).acc, at: new Date().toISOString(),
  };
  store('poly:answers', answers);
  syncAnswers();
  flash(`Answer submitted: ${pct(m.acc)} training accuracy.`, 'View my answers', showAnswers);
});

function syncAnswers() {
  answersCount.textContent = `${Object.keys(answers).filter((id) => indexOf(id) >= 0).length}/${CHALLENGES.length}`;
  syncGoal();
  syncActions();
}

const COLS = ['#', 'Challenge', 'Features', 'Your boundary', 'Training accuracy', 'Goal', 'Best fit', 'Submitted'];
function answerRows() {
  return CHALLENGES.map((c, i) => {
    const a = answers[c.id], goal = `≥ ${goalPct(c.goal)}`;
    if (!a) return { cells: [i + 1, c.name, '', 'not submitted', '', goal, '', ''], missing: true };
    const terms = a.mask.map((on, k) => (on ? TERMS[k].label : null)).filter(Boolean);
    const seen = a.afterReveal || !!(progress[c.id] && progress[c.id].seen && progress[c.id].seen[a.stage]);
    const met = a.acc >= c.goal - 1e-9;
    return {
      met,
      cells: [i + 1, c.name, `${terms.length}: ${terms.join(', ')}`, equationText(a.w, a.mask), `${pct(a.acc)}${met ? ' ✓' : ''}`, goal,
        seen ? pct(a.bestAcc) : 'not revealed', a.afterReveal ? 'after seeing best fit' : 'by hand'],
    };
  });
}
// inline: simple inline styles so the table survives pasting into a document.
function answersTable(rows, inline = false) {
  const st = inline ? ' style="border:1px solid #999;padding:4px 8px;text-align:left"' : '';
  const head = COLS.map((t) => `<th${st}>${t}</th>`).join('');
  const body = rows.map((r) => `<tr${r.missing ? ' class="missing"' : ''}>${r.cells.map((v, j) =>
    `<td${st}${!inline && j === 3 ? ' class="eq"' : ''}${!inline && j === 4 && r.met ? ' class="met"' : ''}>${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
  return `<table class="answers"${inline ? ' style="border-collapse:collapse"' : ''}><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function showAnswers() {
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  const rows = answerRows(), done = rows.filter((r) => !r.missing).length, met = rows.filter((r) => r.met).length;
  const nameIn = h('input', { type: 'text', placeholder: 'Type your name', value: studentName, 'aria-label': 'Your name' });
  nameIn.addEventListener('input', () => { studentName = nameIn.value; store('poly:name', studentName); });
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const copyBtn = h('button', { class: 'btn primary', type: 'button', title: 'Copies a real table: paste it into a document or a spreadsheet' }, 'Copy table');
  const clearBtn = h('button', { class: 'btn', type: 'button' }, 'Clear all answers');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'My answers' },
    h('div', { class: 'sheet wide' },
      h('header', {}, h('b', {}, 'My answers · Polynomial Features Lab'), close),
      h('div', { class: 'ans-top' }, h('label', {}, 'Name ', nameIn), h('span', { class: 'hint' }, `${done} of ${CHALLENGES.length} submitted · ${met} goal${met === 1 ? '' : 's'} met · ${new Date().toLocaleDateString()}`)),
      h('div', { class: 'ans-wrap', html: answersTable(rows) }),
      h('p', { class: 'hint' }, 'Submitting a challenge again replaces its row. “Best fit” shows once you have revealed it for those features. Copy the table into a document or spreadsheet, or take a screenshot of this window.'),
      h('div', { class: 'btn-row' }, copyBtn, clearBtn)));
  const dismiss = () => { modal.remove(); answersBtn.focus(); };
  close.addEventListener('click', dismiss);
  modal.addEventListener('click', (e) => { if (e.target === modal) dismiss(); });
  copyBtn.addEventListener('click', async () => {
    const r = answerRows(), title = `Polynomial Features Lab · ${studentName || '(no name)'} · ${new Date().toLocaleDateString()}`;
    const text = [title, COLS.join('\t'), ...r.map((x) => x.cells.join('\t'))].join('\n');
    const html = `<p><b>${escapeHtml(title)}</b></p>${answersTable(r, true)}`;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } catch {
      copyText(text);
    }
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => { copyBtn.textContent = 'Copy table'; }, 1400);
  });
  clearBtn.addEventListener('click', () => {
    if (!window.confirm('Delete all submitted answers in this browser?')) return;
    for (const id of Object.keys(answers)) delete answers[id];
    store('poly:answers', answers);
    syncAnswers();
    showAnswers();
  });
  document.body.append(modal);
  close.focus();
}
answersBtn.addEventListener('click', showAnswers);

// ---------- reset the whole lab ----------

// After confirming, forget everything this lab saved (weights, goals reached,
// submitted answers, name, view options) and reload as a first visit. The
// light/dark theme is shared with the main lab and is kept.
resetLabBtn.addEventListener('click', () => {
  const ok = window.confirm('Reset the whole lab?\n\nThis erases everything this lab has saved in this browser: your weights, the goals you reached, and your submitted answers (My answers). You will start again at challenge 1.\n\nThis cannot be undone.');
  if (!ok) return;
  clearTimeout(saveT);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ftlab:poly:')) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing was saved, so the reload starts fresh anyway */ }
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
});

ringToggle.addEventListener('change', () => {
  view.mistakes = ringToggle.checked;
  scene.update((c) => { c.view.mistakes = view.mistakes; }, 'paint');
  store('poly:view', view);
});
solidToggle.addEventListener('change', () => {
  view.shade = solidToggle.checked ? 'class' : 'prob';
  scene.update((c) => { c.view.shade = view.shade; }, 'paint');
  store('poly:view', view);
});

// Highlight one weight everywhere it appears: equation term, slider row, bar.
let hoverK = null, pulseK = null, pulseT = 0;
function setHover(k) { hoverK = k; applyHighlight(); }
function pulse(k) {
  pulseK = k;
  clearTimeout(pulseT);
  pulseT = setTimeout(() => { pulseK = null; applyHighlight(); }, 900);
  applyHighlight();
}
function applyHighlight() {
  const on = (k) => k === hoverK || k === pulseK;
  eqYou.querySelectorAll('.term[data-k]').forEach((el) => el.classList.toggle('hl', on(+el.dataset.k)));
  chartRows.forEach((r, k) => r.row.classList.toggle('hl', on(k)));
  ctl.forEach((c, k) => c.row.classList.toggle('hl', on(k)));
}

// ---------- theme, help, keyboard ----------

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : mq.matches; };
function redrawAll() {
  refreshTheme();
  FIT = fitColor();
  LIVE_PLOTS.forEach((p) => p.draw());
  LIVE_SCENES.forEach((s) => s.invalidate('paint'));
}
themeBtn.addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store('theme', next);
  redrawAll();
});
// With no saved choice, follow the system setting as it changes.
mq.addEventListener('change', () => {
  if (!store('theme')) document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
  redrawAll();
});

const HELP = `
<p>The model is <b>logistic regression</b>: \\(P(\\text{${NAME[1]}}\\mid x) = \\sigma(w_0 + w_1z_1 + \\dots + w_dz_d)\\). The features \\(z\\) are the raw inputs \\(x_1, x_2\\) or, once you switch, the degree-2 terms \\(x_1, x_2, x_1^2, x_1x_2, x_2^2\\). The boundary is where \\(w_0 + w^\\top z = 0\\); the bar at the top always shows yours.</p>
<ol>
  <li><b>Set the weights by hand.</b> Drag the sliders or type values to get the highest <b>training accuracy</b> you can. Ringed points are the ones your boundary gets wrong.</li>
  <li><b>Add polynomial features</b> at any time with <i>Polynomial, degree 2</i> (challenges 8 and 9, marked ★, are extra challenging: they also offer <i>Degree 3</i>, \\(x_1^3, x_1^2x_2, x_1x_2^2, x_2^3\\), whose sliders have a finer ±1 range because cubes grow fast). Untick terms to use only some of them. Each challenge opens on the raw features with the best fit hidden; your polynomial weights are kept for when you switch back.</li>
  <li><b>Submit your answer.</b> It goes into <b>📋 My answers</b> (top right): a table you can copy into a document or screenshot. Submitting again replaces it.</li>
  <li><b>Reveal the best fit</b> when you have done what you can: the weights with the lowest cross-entropy on the training points. Its boundary appears as a dashed violet line, with its equation, accuracy and weights next to yours. Changing the features hides it again, so it never gives away the answer for features you have not tried yet.</li>
  <li><b>Next challenge</b> moves on; <b>Reset</b> starts this one over (and can be undone for a few seconds). <b>Reset lab</b> (top right) erases all your progress and submitted answers in this browser and starts the whole lab over, after asking you to confirm.</li>
</ol>
<p><b>Feature space</b> plots the training points against any two features. Drag a feature chip onto the plot (lower-right half: horizontal axis; upper-left half: vertical axis), or click a chip and choose an axis; <i>⇄ swap</i> exchanges them. Your boundary is always drawn, carried over from the original space; it is a straight line exactly when every other feature has weight 0. The shading shows the class your model predicts for the original points that land at each spot: blank where none land, pale where points of both predicted classes land together.</p>
<p><b>Relative weights</b> divides each set of weights by its largest one. Only the ratios between weights place the boundary: multiplying them all by the same positive number keeps the boundary and only makes the probabilities sharper.</p>
<p class="hint">Hover a slider to highlight its term in the equation. Double-click a slider to set it to 0. Progress is saved in this browser.</p>`;
function showHelp() {
  if (document.querySelector('.modal')) return;
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How this lab works' },
    h('div', { class: 'sheet' }, h('header', {}, h('b', {}, 'How this lab works'), close), h('div', { html: HELP })));
  renderMath(modal);
  const done = () => { modal.remove(); helpBtn.focus(); };
  close.addEventListener('click', done);
  modal.addEventListener('click', (e) => { if (e.target === modal) done(); });
  document.body.append(modal);
  close.focus();
}
helpBtn.addEventListener('click', showHelp);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeMenu();
  document.querySelectorAll('.modal').forEach((m) => m.remove());
});

// Keep the sticky controls column below the equation bar on scrolling layouts.
new ResizeObserver(() => document.documentElement.style.setProperty('--eqbar-h', `${eqbar.offsetHeight}px`)).observe(eqbar);

// One-screen layout: give the feature-space plot whatever height its column
// has left (up to square), but never less than Z_MIN so it stays readable;
// below that the column scrolls rather than squeezing or overlapping.
const Z_MIN = 220;
const oneScreen = window.matchMedia('(min-width: 1100px) and (min-height: 600px)');
function fitZ() {
  if (!oneScreen.matches) { zwrap.style.height = ''; return; }
  const rest = zcard.offsetHeight - zwrap.offsetHeight; // title, chips, note, padding
  const gap = parseFloat(getComputedStyle(midCol).rowGap) || 0;
  const room = Math.floor(midCol.clientHeight - wcard.offsetHeight - gap - rest);
  // The widest square the column allows, measured including any scrollbar so
  // that a scrollbar appearing or disappearing cannot change the answer.
  const maxW = midCol.offsetWidth - (zcard.offsetWidth - zwrap.clientWidth);
  const size = Math.max(Z_MIN, Math.min(maxW, room));
  if (Math.abs(zwrap.offsetHeight - size) > 1) zwrap.style.height = `${size}px`;
}
// Resize on the next frame, outside the observer callback (no resize loops).
let zFitFrame = 0;
const zFitter = new ResizeObserver(() => { cancelAnimationFrame(zFitFrame); zFitFrame = requestAnimationFrame(fitZ); });
[midCol, wcard, zchips, znote].forEach((el) => zFitter.observe(el));
oneScreen.addEventListener('change', fitZ);

// ---------- boot ----------

syncChallenge();
syncControls();
syncZControls();
syncActions();
syncAnswers();
// A challenge in the address opens it; otherwise start on the intro page.
if (indexOf(location.hash.slice(1)) < 0) showLanding();

// for the console and tests
window.polylab = {
  scene, zplot, challenges: CHALLENGES, answers, get state() { return S; }, get zDrawn() { return zc.drawn; },
  switchTo, setWeight, setStage, setInclude, assignAxis, showAnswers, fitZ, get onLanding() { return onLanding; },
};
