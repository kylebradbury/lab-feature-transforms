// Overfitting Lab: what flexible features do with noise.
//   #          the landing page: the stations, in two parts
//   #a1 … #b1  one station: plot + chart (left, sticky), prediction, controls,
//              readouts, the model, how it works (right)
//   #wrap      what we saw, four open questions, the exit ticket
// Results for new points (the test set) stay hidden on each station until the
// student locks in a prediction.

import { STATIONS, PARTS, INTUITIONS, EXIT, GUARD_NOTE, byId, val } from './stations.js';
import { DATA, REPS, polySpecs, runCase, peekCase, seeds, mean, disagreement, majorityVote, VIEW, N_TEST } from './engine.js';
import { truthRule, ruleSegs } from './truth.js';
import { XPlot, evalGrid, refreshTheme, theme, LIVE_PLOTS, niceTicks } from './plot2d.js';
import { marchingSquares } from './geometry.js';
import { CurveChart, ScoreHistogram } from './charts.js';
import { sweep } from './sweep.js';
import { h, tex, renderMath, fmt, pct, slider, store, questionCard, copyText, escapeHtml } from './ui.js';

const T0 = refreshTheme();
const NAME = T0.names; // class names used in text (from the theme)
const FLIPS = [0, 0.05, 0.1, 0.15, 0.2, 0.25];
const KS = [0, 2, 5, 10, 20, 30, 50, 100, 200, 500];
const NS = [40, 100, 400];
const STEPS = ['a1', 'a2', 'a3', 'b1', 'wrap'];
const SHOWN = Array.from({ length: 300 }, (_, j) => Math.floor((j * N_TEST) / 300)); // the new points drawn on the plots
const A = (flip) => ({ ...DATA, params: { ...DATA.params, flip } });
const pc = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)} %` : '–');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((c) => SUB[+c]).join('');

// ---------- saved state ----------

const answers = store('overfit:answers') || {}; // {stationId: {chosen, locked, revealed}}
const exitAns = store('overfit:exit') || {};
let studentName = store('overfit:name') || '';
const locked = (id) => !!(answers[id] && (answers[id].locked || answers[id].revealed));
const DEFAULTS = {
  a1: { rep: 'poly10', flip: 0.15, flips: false, mistakes: false, test: false },
  a2: { k: 10, N: 100, test: false },
  a3: { rep: 'poly10', vote: false },
  b1: { k: 20, view: 'x', axes: ['f0', 'f1'], test: false },
};
const S = structuredClone(DEFAULTS); // this visit's settings

// ---------- shell ----------

const root = document.getElementById('app');
const themeBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode' }, '◐', h('span', { class: 'lbl' }, ' Theme'));
const helpBtn = h('button', { class: 'icon-btn', type: 'button', title: 'How this lab works' }, '?', h('span', { class: 'lbl' }, ' Help'));
const answersCount = h('span', { class: 'count' });
const answersBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Your predictions and exit-ticket answers, ready to copy' }, '📋', h('span', { class: 'lbl' }, ' My answers'), ' ', answersCount);
const resetLabBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Erase all progress in this browser and start the lab over', 'aria-label': 'Reset lab' }, '↺', h('span', { class: 'lbl' }, ' Reset lab'));
const prevBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Previous station' }, '‹');
const nextBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Next station' }, '›');
const dots = h('div', { class: 'dots' });
const dotBtns = STEPS.map((id, i) => {
  const b = h('button', { class: 'dot', type: 'button' }, String(i + 1));
  b.addEventListener('click', () => { location.hash = id; });
  dots.append(b);
  return b;
});
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));
root.append(
  h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#' }, 'Overfitting Lab', h('small', {}, 'IDS 705 · when flexible features fit the noise')),
    h('nav', { class: 'stepper', 'aria-label': 'Stations' }, prevBtn, dots, nextBtn),
    h('div', { class: 'spacer' }), answersBtn, resetLabBtn, themeBtn, helpBtn),
  h('div', { id: 'view' }),
  h('footer', { class: 'site-foot' },
    '© 2026 ', h('a', { href: 'https://kylebradbury.com/', target: '_blank', rel: 'noopener' }, 'Kyle Bradbury'),
    '. Designed by Kyle Bradbury, built with Claude.'));
const viewEl = document.getElementById('view');

const stationName = (id) => (id === 'wrap' ? 'Wrap-up' : byId(id).name);
function syncStepper() {
  const id = location.hash.slice(1), i = STEPS.indexOf(id);
  dotBtns.forEach((b, k) => {
    const sid = STEPS[k], done = sid === 'wrap' ? Object.values(exitAns).some((v) => v && v.trim()) : !!(answers[sid] && answers[sid].revealed);
    b.setAttribute('aria-current', String(k === i));
    b.classList.toggle('met', done);
    b.title = `${k + 1}. ${stationName(sid)}${done ? ' (done)' : ''}`;
  });
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i === STEPS.length - 1;
  answersCount.textContent = `${STATIONS.filter((s) => answers[s.id] && answers[s.id].locked).length}/${STATIONS.length}`;
}
function step(d) {
  const i = STEPS.indexOf(location.hash.slice(1));
  const j = i < 0 ? (d > 0 ? 0 : -1) : i + d;
  if (j >= 0 && j < STEPS.length) location.hash = STEPS[j];
}

// Plots, charts and queued work belong to the page on screen.
let live = [], token = 0, cur = null;
function clearView() {
  if (cur && cur.sweep) cur.sweep.cancel();
  live.forEach((p) => p.destroy());
  live = [];
  token++;
  cur = null;
  viewEl.innerHTML = '';
}
function queue(jobs) {
  const my = token;
  const next = () => { if (my !== token || !jobs.length) return; jobs.shift()(); setTimeout(next, 0); };
  setTimeout(next, 0);
}

// ---------- shared pieces ----------

const truth = (() => { let c = null; return () => c || (c = ruleSegs(truthRule(DATA.ds, DATA.params), VIEW, 120)); })();
const shownTest = (r) => r.shownTest || (r.shownTest = {
  X: Float64Array.from(SHOWN.flatMap((i) => [r.te.X[2 * i], r.te.X[2 * i + 1]])),
  y: Uint8Array.from(SHOWN.map((i) => r.te.y[i])),
  wrong: Uint8Array.from(SHOWN.map((i) => ((r.sTe[i] > 0 ? 1 : 0) !== r.te.y[i] ? 1 : 0))),
});
const flipMask = (r) => Uint8Array.from(r.tr.y, (v, i) => (v !== r.tr.yClean[i] ? 1 : 0));
const wrongMask = (r) => Uint8Array.from(r.tr.y, (v, i) => ((r.sTr[i] > 0 ? 1 : 0) !== v ? 1 : 0));
const gridOf = (r, G = 150) => { r.grids ||= {}; return r.grids[G] || (r.grids[G] = evalGrid(r.fmap, r.wRaw, VIEW, G)); };
const truthGhost = () => ({ segs: truth().segs, G: truth().G, dash: [8, 5], width: 1.8, alpha: 0.95 });

function legend(items) {
  const sw = {
    c0: () => h('span', {}, h('span', { class: `sw c0 ${T0.shape0}` }), `class 0 (${NAME[0]})`),
    c1: () => h('span', {}, h('span', { class: `sw c1 ${T0.shape1}` }), `class 1 (${NAME[1]})`),
    test: () => h('span', {}, h('span', { class: 'sw hollow' }), 'new points'),
    fit: () => h('span', {}, h('span', { class: 'sw line' }), 'model boundary'),
    fits: () => h('span', {}, h('span', { class: 'sw line thin' }), 'one boundary per training set'),
    vote: () => h('span', {}, h('span', { class: 'sw line' }), 'majority vote'),
    truth: () => h('span', {}, h('span', { class: 'sw dashline' }), 'rule that generated the data'),
    flip: () => h('span', {}, h('span', { class: 'sw ring dashed' }), 'flipped label'),
    wrong: () => h('span', {}, h('span', { class: 'sw ring' }), 'on the wrong side'),
  };
  return h('div', { class: 'legend' }, ...items.map((k) => sw[k]()));
}
function chartLegend(kinds) {
  const lab = { train: 'training points', test: 'new points', best: 'best possible' };
  return h('div', { class: 'legend chart-legend' }, ...kinds.map((k) => h('span', {}, h('span', { class: `sw curve ${k}` }), lab[k])));
}
function toggle(label, title, on, set) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!on;
  input.addEventListener('change', () => set(input.checked));
  return { el: h('label', { title }, input, label), input };
}
function seg(options, value, set, label) {
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), html: o.label, title: o.title || null });
    b.addEventListener('click', () => { btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); set(o.value); });
    return b;
  });
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': label }, ...btns);
  renderMath(el);
  return el;
}
function tiles(items) {
  return items.map((t) => `<div class="stat${t.wide ? ' wide' : ''}${t.hidden ? ' hidden-val' : ''}" title="${escapeHtml(t.title || '')}"><div class="lab">${t.lab}</div><div class="val${t.small ? ' small' : ''}">${t.val}</div>${t.note ? `<div class="note">${t.note}</div>` : ''}</div>`).join('');
}
const LOCK = '🔒';
const lockTitle = 'Lock in a prediction (above) to see how the model does on new points';
function definitions(items) {
  const el = h('div', {}, h('div', { class: 'defs-title' }, 'Definitions'), h('ul', { html: items.map((d) => `<li>${d}</li>`).join('') }));
  renderMath(el);
  return el.innerHTML;
}

// ---------- one station ----------

function renderStation(st) {
  const i = STEPS.indexOf(st.id), part = PARTS.find((p) => p.id === st.part);
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  const nav = h('nav', { class: 'ex-nav', 'aria-label': 'Stations' },
    h('a', { class: 'btn', href: '#' }, '← All stations'),
    h('span', { class: 'where' }, `${part.name} · station ${i + 1} of ${STEPS.length}`),
    h('span', { class: 'spacer' }),
    prev ? h('a', { class: 'btn', href: `#${prev}`, title: '(←)' }, `‹ ${stationName(prev)}`) : null,
    next ? h('a', { class: 'btn', href: `#${next}`, title: '(→)' }, `${stationName(next)} ›`) : null);

  // stage: plot, its options and legend, then the chart
  const titleEl = h('span', { class: 'ptitle' }), chip = h('span', { class: 'acc-chip' });
  const box = h('div', { class: 'plot-box' });
  const optsEl = h('span', { class: 'opts' }), legendEl = h('div');
  const chartTitle = h('b', {}), chartNote = h('span', { class: 'hint' }), chartLegendEl = h('div');
  const chartBox = h('div', { class: 'chart-box curve-box' });
  const stage = h('section', { class: 'card stage' },
    h('div', { class: 'plot-title' }, titleEl, chip),
    h('div', { class: 'stage-wrap' }, box),
    h('div', { class: 'stage-opts' }, optsEl, legendEl),
    h('div', { class: 'chart-head' }, h('span', {}, chartTitle, ' ', chartNote), chartLegendEl),
    chartBox);

  // side: prediction, controls, readouts, the model, how it works
  const qWrap = h('section', { class: 'card predict' }, h('h2', {}, 'Predict first'));
  const knobCard = h('section', { class: 'card knob' }, h('div', { class: 'knob-head' }, h('h2', {}, 'Settings')));
  const readEl = h('div', { class: 'readouts' });
  const eqEl = h('div', { class: 'eqs' });
  const extraEl = h('div', { class: 'extras' });
  const howEl = h('p', { class: 'how' }), chosenEl = h('div', { class: 'chosen' }), defsEl = h('div', { class: 'defs' });
  const side = h('aside', { class: 'ex-side' },
    h('header', { class: 'ex-title' }, h('span', { class: 'fam' }, part.name), h('h1', {}, st.name), h('p', { class: 'lead' }, st.lead)),
    qWrap, knobCard,
    h('section', { class: 'card' }, h('h2', {}, 'Results'), readEl),
    h('section', { class: 'card model' }, h('h2', {}, 'The model'), eqEl),
    extraEl,
    h('section', { class: 'card about' }, h('h2', {}, 'How it works'), howEl, chosenEl, defsEl));
  const page = h('main', { class: 'exhibit station', 'data-station': st.id }, nav, h('div', { class: 'ex-grid' }, stage, side));
  viewEl.append(page);

  const plot = new XPlot(box, { outerLabels: true });
  const chart = new CurveChart(chartBox);
  live.push(plot, chart);
  const ctl = { st, page, plot, chart, titleEl, chip, optsEl, legendEl, chartTitle, chartNote, chartLegendEl, readEl, eqEl, extraEl, howEl, chosenEl, defsEl, knobCard, sweep: null, sweepKey: '' };
  cur = ctl;

  const q = questionCard(st.question, {
    saved: answers[st.id] || {},
    onSave: (s) => {
      const wasLocked = locked(st.id);
      answers[st.id] = s;
      store('overfit:answers', answers);
      syncStepper();
      if (!wasLocked && locked(st.id)) update(true);
    },
    onReveal: () => { applyPreset(st.id, st.question.reveal); },
  });
  ctl.q = q;
  qWrap.append(h('p', { class: 'hint q-hint' }, 'Results on new points appear once you lock in a prediction.'), q.el);

  CONTROLLERS[st.id].setup(ctl);
  update(true);
}

function update(chartToo = false) {
  if (!cur) return;
  const c = cur, ctrl = CONTROLLERS[c.st.id];
  const r = ctrl.draw(c);
  c.r = r;
  c.howEl.innerHTML = val(c.st.how, r);
  c.chosenEl.innerHTML = `<b>Chosen by hand, not fit:</b> ${val(c.st.chosen, r)}${r && r.guarded ? `<br><br><b>Numerical guard:</b> ${GUARD_NOTE}` : ''}`;
  c.defsEl.innerHTML = definitions(val(c.st.defs, r));
  renderMath(c.howEl);
  renderMath(c.chosenEl);
  ctrl.chart(c, chartToo);
}

// Apply a question's preset (on Reveal) and redraw.
function applyPreset(id, preset) {
  Object.assign(S[id], preset);
  if (cur && cur.st.id === id) { CONTROLLERS[id].sync(cur); update(true); }
}

// Run a chart's fits in slices; `make()` builds the data from cached fits.
function runChart(c, key, jobs, make) {
  if (c.sweepKey === key && c.sweep) { c.chart.set(make()); return; }
  if (c.sweep) c.sweep.cancel();
  c.sweepKey = key;
  delete c.page.dataset.ready;
  c.chart.set(make());
  c.sweep = sweep(jobs, { onProgress: () => c.chart.set(make()), onDone: () => { c.chart.set(make()); c.page.dataset.ready = '1'; } });
}

// ---------- Part A: shared readouts ----------

function readoutsA(c, r, extra = []) {
  const L = locked(c.st.id);
  c.readEl.innerHTML = tiles([
    { lab: 'Training points right', val: pc(r.train) },
    { lab: 'New points right', val: L ? pc(r.test) : LOCK, hidden: !L, title: L ? '' : lockTitle },
    { lab: 'Best possible', val: L ? pc(r.ceiling) : LOCK, hidden: !L, title: L ? 'The accuracy of the rule that generated the data on these new points' : lockTitle },
    { lab: 'Gap (training − new)', val: L ? `${(100 * (r.train - r.test)).toFixed(1)} pts` : LOCK, hidden: !L, title: L ? '' : lockTitle },
    { lab: 'Features d · points N', val: `${r.d} · ${r.N}`, small: true, note: `d/N = ${fmt(r.d / r.N, 2)}` },
    ...extra,
  ]);
  c.chip.innerHTML = `training <b>${pc(r.train)}</b> · new points ${L ? `<b>${pc(r.test)}</b>` : LOCK}`;
}
function modelEq(c, phiTex, d, N, note = '', guarded = false) {
  c.eqEl.innerHTML = '';
  const el = h('div', { html:
    `<div class="eq-row"><div class="lab">The features</div><div class="math">${tex(`z = \\Phi(x) = ${phiTex}`)}</div><div class="note">${plural(d, 'feature')}${note}</div></div>` +
    `<div class="eq-row"><div class="lab">The model, in every station</div><div class="math">${tex('P(\\text{class 1} \\mid x) = \\sigma(w_0 + w_1 z_1 + \\dots + w_d z_d)')}</div><div class="note">Fit to the \\(N = ${N}\\) training points by making the average log-loss as small as possible${guarded ? ' (plus the tiny numerical guard explained under How it works)' : ', with no penalty'}: \\(${d + 1}\\) weights from \\(${N}\\) points.</div></div>` });
  renderMath(el);
  c.eqEl.append(el);
}
function plotHoverA(c, r) {
  c.plot.onHover = (x1, x2, near) => {
    const row = new Float64Array(r.d);
    r.fmap.evalRow(x1, x2, row);
    let s = r.wRaw[0];
    for (let j = 0; j < r.d; j++) s += r.wRaw[j + 1] * row[j];
    const p = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, s))));
    let pt = '';
    if (near && near.name === 'training') {
      const i = near.i, flipped = r.tr.y[i] !== r.tr.yClean[i];
      pt = `<div class="sep"></div>training point, label <b>${NAME[r.tr.y[i]]}</b>${flipped ? ` <i>(flipped: generated as ${NAME[r.tr.yClean[i]]})</i>` : ''}`;
    } else if (near && near.name === 'new') pt = `<div class="sep"></div>new point, label <b>${NAME[near.label]}</b>`;
    return `x = (${fmt(x1)}, ${fmt(x2)})<br><span class="k">P(${NAME[1]})</span> = ${pct(p)} → <b>${NAME[p >= 0.5 ? 1 : 0]}</b>${pt}`;
  };
}

// ---------- the stations ----------

const repSeg = (c, id, reps) => seg(reps.map((k) => ({ value: k, label: `${REPS[k].name} <span class="nb">(${k === 'designed' ? '2' : k === 'poly10' ? '65' : '100'})</span>`, title: REPS[k].name })), S[id].rep, (v) => { S[id].rep = v; update(true); }, 'Representation');

const CONTROLLERS = {
  a1: {
    setup(c) {
      const s = S.a1;
      c.repEl = h('div');
      c.flip = slider({ label: 'Share of labels flipped', min: 0, max: FLIPS.length - 1, step: 1, int: true, value: FLIPS.indexOf(s.flip), fmt: (i) => `${Math.round(100 * FLIPS[i])} %`, onInput: (i) => { s.flip = FLIPS[i]; update(false); } });
      c.knobCard.append(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Representation Φ'), c.repEl), c.flip.el);
      c.tFlip = toggle('mark flipped labels', 'A dashed ring around every training point whose label was flipped', s.flips, (v) => { s.flips = v; update(); });
      c.tWrong = toggle('ring mistakes', 'A solid ring around training points on the wrong side of the boundary', s.mistakes, (v) => { s.mistakes = v; update(); });
      c.tTest = toggle('new points', 'Show 300 of the 2000 new points (hollow)', s.test, (v) => { s.test = v; update(); });
      c.optsEl.append(c.tFlip.el, c.tWrong.el, c.tTest.el);
      this.sync(c);
    },
    sync(c) {
      const s = S.a1;
      c.repEl.replaceChildren(repSeg(c, 'a1', ['designed', 'poly10', 'rbf']));
      c.flip.set(FLIPS.indexOf(s.flip));
      c.tFlip.input.checked = s.flips; c.tWrong.input.checked = s.mistakes; c.tTest.input.checked = s.test;
    },
    draw(c) {
      const s = S.a1, L = locked('a1'), rep = REPS[s.rep];
      const r = runCase({ ...A(s.flip), specs: rep.specs, N: 100 });
      c.titleEl.innerHTML = `<b>Original space</b> ${tex('x = (x_1, x_2)')}`;
      c.tTest.input.disabled = !L; c.tTest.el.title = L ? 'Show 300 of the 2000 new points (hollow)' : lockTitle;
      const grid = gridOf(r), pts = [];
      if (s.test && L) pts.push({ ...shownTest(r), hollow: true, name: 'new' });
      pts.push({ X: r.tr.X, y: r.tr.y, name: 'training', flips: s.flips ? flipMask(r) : null, mistakes: s.mistakes ? wrongMask(r) : null });
      c.plot.setView(VIEW);
      c.plot.render({ grid, segs: marchingSquares(grid.V, grid.G), shade: 'prob', points: pts, ghosts: [truthGhost()] });
      plotHoverA(c, r);
      c.legendEl.replaceChildren(legend(['c0', 'c1', ...(s.test && L ? ['test'] : []), 'fit', 'truth', ...(s.flips ? ['flip'] : []), ...(s.mistakes ? ['wrong'] : [])]));
      readoutsA(c, r, [
        { lab: 'Flipped training labels memorized', val: `${r.memorized} of ${r.flipped}`, small: true, title: 'Flipped training points that ended up on their (wrong) label’s side of the boundary' },
        { lab: 'Largest weight |wⱼ|', val: fmt(r.wMax, 1), small: true, note: r.guarded ? 'would grow without limit' : '', title: 'On standardized features' },
      ]);
      modelEq(c, rep.tex, r.d, r.N, '', r.guarded);
      return r;
    },
    chart(c) {
      const s = S.a1, L = locked('a1'), rep = REPS[s.rep];
      c.chartTitle.textContent = 'Accuracy vs. share of labels flipped';
      c.chartNote.textContent = `(${rep.name}, the training set shown)`;
      c.chartLegendEl.replaceChildren(chartLegend(L ? ['train', 'test', 'best'] : ['train']));
      c.chart.xLabel = 'share of labels flipped'; c.chart.xFmt = (v) => `${Math.round(100 * v)}%`;
      const one = (f) => ({ ...A(f), specs: rep.specs, N: 100 });
      runChart(c, `a1|${s.rep}|${L}`, FLIPS.map((f) => () => runCase(one(f))), () => {
        const rs = FLIPS.map((f) => peekCase(one(f)));
        const ys = (key) => rs.map((r) => (r ? r[key] : NaN));
        return { xs: FLIPS, marker: s.flip, series: [{ kind: 'train', ys: ys('train') }, ...(L ? [{ kind: 'test', ys: ys('test') }, { kind: 'best', ys: ys('ceiling') }] : [])] };
      });
    },
  },

  a2: {
    setup(c) {
      const s = S.a2;
      c.kSlider = slider({ label: 'Polynomial degree k', min: 1, max: 10, step: 1, int: true, value: s.k, onInput: (v) => { s.k = v; update(true); } });
      c.nEl = h('div');
      c.knobCard.append(c.kSlider.el, h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Training points N'), c.nEl));
      c.tTest = toggle('new points', 'Show 300 of the 2000 new points (hollow)', s.test, (v) => { s.test = v; update(); });
      c.optsEl.append(c.tTest.el);
      this.sync(c);
    },
    sync(c) {
      const s = S.a2;
      c.kSlider.set(s.k);
      c.nEl.replaceChildren(seg(NS.map((n) => ({ value: n, label: String(n) })), s.N, (v) => { s.N = v; update(true); }, 'Training points'));
      c.tTest.input.checked = s.test;
    },
    draw(c) {
      const s = S.a2, L = locked('a2');
      const r = runCase({ ...A(0.15), specs: polySpecs(s.k), N: s.N });
      c.titleEl.innerHTML = `<b>Original space</b> ${tex('x = (x_1, x_2)')}`;
      c.tTest.input.disabled = !L;
      const grid = gridOf(r), pts = [];
      if (s.test && L) pts.push({ ...shownTest(r), hollow: true, name: 'new' });
      pts.push({ X: r.tr.X, y: r.tr.y, name: 'training' });
      c.plot.setView(VIEW);
      c.plot.render({ grid, segs: marchingSquares(grid.V, grid.G), shade: 'prob', points: pts, ghosts: [truthGhost()] });
      plotHoverA(c, r);
      c.legendEl.replaceChildren(legend(['c0', 'c1', ...(s.test && L ? ['test'] : []), 'fit', 'truth']));
      readoutsA(c, r);
      modelEq(c, s.k === 1 ? '[\\,x_1,\\ x_2\\,]' : `[\\,x_1^i x_2^j : 1 \\le i + j \\le ${s.k}\\,]`, r.d, r.N, '', r.guarded);
      return r;
    },
    chart(c) {
      const s = S.a2, L = locked('a2'), ks = Array.from({ length: 10 }, (_, i) => i + 1), sd = seeds(5);
      c.chartTitle.textContent = 'Accuracy vs. polynomial degree';
      c.chartNote.textContent = `(average of 5 training sets of N = ${s.N})`;
      c.chartLegendEl.replaceChildren(chartLegend(L ? ['train', 'test', 'best'] : ['train']));
      c.chart.xLabel = 'degree k'; c.chart.xFmt = (v) => String(v);
      const one = (k, seed) => ({ ...A(0.15), specs: polySpecs(k), N: s.N, seed }), jobs = [];
      for (const seed of sd) for (const k of ks) jobs.push(() => runCase(one(k, seed)));
      runChart(c, `a2|${s.N}|${L}`, jobs, () => {
        const avg = (k, key) => { const rs = sd.map((seed) => peekCase(one(k, seed))); return rs.every(Boolean) ? mean(rs.map((r) => r[key])) : NaN; };
        return { xs: ks, marker: s.k, series: [{ kind: 'train', ys: ks.map((k) => avg(k, 'train')) }, ...(L ? [{ kind: 'test', ys: ks.map((k) => avg(k, 'test')) }, { kind: 'best', ys: ks.map((k) => avg(k, 'ceiling')) }] : [])] };
      });
      // a sentence for "How it works", once the curves for degrees 2 and 10 are known
      const gap = (k) => mean(sd.map((seed) => { const r = runCase({ ...A(0.15), specs: polySpecs(k), N: s.N, seed }); return r.train - r.test; }));
      if (L) {
        const g2 = gap(2), g10 = gap(10);
        c.r.gapText = `With N = ${s.N}, on average over the 5 training sets, ${Math.abs(g2) < 0.01 ? 'degree 2 does about as well on new points as on its training points' : `training accuracy is ${(100 * g2).toFixed(1)} points higher than on new points at degree 2`}, and ${(100 * g10).toFixed(1)} points higher at degree 10.`;
      }
      c.howEl.innerHTML = val(c.st.how, c.r);
    },
  },

  a3: {
    setup(c) {
      const s = S.a3;
      c.repEl = h('div');
      c.tVote = toggle('majority vote of the 8', 'Shade and draw the boundary of the majority vote', s.vote, (v) => { s.vote = v; update(); });
      c.knobCard.append(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Representation Φ'), c.repEl), h('div', { class: 'ctl' }, c.tVote.el));
      this.sync(c);
    },
    sync(c) {
      c.repEl.replaceChildren(repSeg(c, 'a3', ['designed', 'poly10']));
      c.tVote.input.checked = S.a3.vote;
    },
    draw(c) {
      const s = S.a3, L = locked('a3'), rep = REPS[s.rep];
      const fits = seeds(8).map((seed) => runCase({ ...A(0.15), specs: rep.specs, N: 100, seed }));
      const G = 100, grids = fits.map((f) => gridOf(f, G));
      const ghosts = grids.map((g) => ({ segs: marchingSquares(g.V, G), G, dash: [], width: 1.3, alpha: s.vote ? 0.35 : 0.75 }));
      let grid = null, segs = null;
      if (s.vote) {
        // the vote is a step function, so trace it on a finer grid; each fit's ±1 is softened
        // across its own boundary (score clipped to ±1)
        const Gv = 180, fine = fits.map((f) => gridOf(f, Gv)), V = new Float32Array(Gv * Gv);
        for (let q = 0; q < Gv * Gv; q++) { let v = 0; for (const g of fine) v += Math.max(-1, Math.min(1, g.V[q])); V[q] = (3 * v) / fine.length; }
        grid = { G: Gv, V }; segs = marchingSquares(V, Gv);
      }
      c.titleEl.innerHTML = `<b>Original space</b> ${tex('x = (x_1, x_2)')} <span class="sub">· 8 training sets, training set 1 shown</span>`;
      c.plot.setView(VIEW);
      c.plot.render({ grid, segs, shade: 'prob', points: [{ X: fits[0].tr.X, y: fits[0].tr.y, name: 'training', alpha: 0.55 }], ghosts: [...ghosts, truthGhost()] });
      c.plot.onHover = (x1, x2, near) => `x = (${fmt(x1)}, ${fmt(x2)})<br>${grids.filter((g) => {
        const i = Math.min(G - 1, Math.max(0, Math.floor(((x1 - VIEW.xmin) / (VIEW.xmax - VIEW.xmin)) * G))), j = Math.min(G - 1, Math.max(0, Math.floor(((x2 - VIEW.ymin) / (VIEW.ymax - VIEW.ymin)) * G)));
        return g.V[j * G + i] > 0;
      }).length} of 8 fits predict <b>${NAME[1]}</b>${near ? `<div class="sep"></div>training point (set 1), label <b>${NAME[near.label]}</b>` : ''}`;
      c.legendEl.replaceChildren(legend(['c0', 'c1', 'fits', ...(s.vote ? ['vote'] : []), 'truth']));
      const dis = disagreement(fits), vote = majorityVote(fits), tests = fits.map((f) => f.test);
      c.readEl.innerHTML = tiles([
        { lab: 'Training points right (average)', val: pc(mean(fits.map((f) => f.train))) },
        { lab: 'New points right, one fit (average)', val: L ? pc(mean(tests)) : LOCK, hidden: !L, title: L ? `Range over the 8 fits: ${pc(Math.min(...tests))} to ${pc(Math.max(...tests))}` : lockTitle },
        { lab: 'New points right, majority vote', val: L ? pc(vote) : LOCK, hidden: !L, title: L ? '' : lockTitle },
        { lab: 'Best possible', val: L ? pc(fits[0].ceiling) : LOCK, hidden: !L, title: L ? '' : lockTitle },
        { lab: 'Disagreement between fits', val: pc(dis), small: true, title: 'Share of the area r ≤ 2.7 where two fits predict different classes, averaged over all 28 pairs' },
        { lab: 'Features d · points N', val: `${fits[0].d} · 100`, small: true },
      ]);
      c.chip.innerHTML = `disagreement <b>${pc(dis)}</b> · vote on new points ${L ? `<b>${pc(vote)}</b>` : LOCK}`;
      modelEq(c, rep.tex, fits[0].d, 100, ', fit separately to each of the 8 training sets', fits.some((f) => f.guarded));
      const r = { ...fits[0], rep: s.rep, disagree: dis, vote, guarded: fits.some((f) => f.guarded) };
      return r;
    },
    chart(c) {
      const s = S.a3, L = locked('a3'), rep = REPS[s.rep], sd = seeds(8), xs = sd.map((_, i) => i + 1);
      c.chartTitle.textContent = 'Accuracy of each training set’s fit';
      c.chartNote.textContent = `(${rep.name})`;
      c.chartLegendEl.replaceChildren(chartLegend(L ? ['train', 'test', 'best'] : ['train']));
      c.chart.xLabel = 'training set'; c.chart.xFmt = (v) => String(v);
      const fits = sd.map((seed) => runCase({ ...A(0.15), specs: rep.specs, N: 100, seed }));
      runChart(c, `a3|${s.rep}|${L}`, [], () => ({ xs, series: [{ kind: 'train', ys: fits.map((f) => f.train) }, ...(L ? [{ kind: 'test', ys: fits.map((f) => f.test) }, { kind: 'best', ys: fits.map((f) => f.ceiling) }] : [])] }));
    },
  },

  b1: {
    setup(c) {
      const s = S.b1;
      c.kSlider = slider({ label: 'Noise inputs k', min: 0, max: KS.length - 1, step: 1, int: true, value: KS.indexOf(s.k), fmt: (i) => String(KS[i]), onInput: (i) => { s.k = KS[i]; update(false); } });
      c.viewEl = h('div');
      c.knobCard.append(c.kSlider.el, h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Plot'), c.viewEl));
      c.tTest = toggle('new points', 'Show 300 of the 2000 new points (hollow)', s.test, (v) => { s.test = v; update(); });
      c.optsEl.append(c.tTest.el);
      // chips for "Any two features" go above the plot
      c.chips = h('div', { class: 'zchips', role: 'group', 'aria-label': 'Features: drag one onto an axis, or click it' });
      c.dropHint = h('div', { class: 'drop-hint', hidden: true });
      c.plot.box.parentElement.before(c.chips);
      c.plot.box.append(c.dropHint);
      // extra cards: weights, scores, intuitions
      c.wbars = h('div', { class: 'wbars' });
      c.wnote = h('p', { class: 'hint' });
      c.histBox = h('div', { class: 'chart-box hist-box' });
      c.intuit = h('ol', { class: 'intuitions' });
      c.extraEl.append(
        h('section', { class: 'card' }, h('h2', {}, 'Weights'), c.wbars, c.wnote),
        h('section', { class: 'card scores' }, h('h2', {}, 'Scores of training and new points'), c.histBox, h('p', { class: 'hint hist-hint' })),
        h('section', { class: 'card' }, h('h2', {}, '2-D intuitions that fail here'), c.intuit));
      c.hist = new ScoreHistogram(c.histBox);
      live.push(c.hist);
      this.sync(c);
    },
    sync(c) {
      const s = S.b1;
      c.kSlider.set(KS.indexOf(s.k));
      c.viewEl.replaceChildren(seg([{ value: 'x', label: 'Original space' }, { value: 'z', label: 'Any two features' }], s.view, (v) => { s.view = v; update(); }, 'Plot'));
      c.tTest.input.checked = s.test;
    },
    draw(c) {
      const s = S.b1, L = locked('b1');
      const r = runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k: s.k });
      c.tTest.input.disabled = !L;
      const wrongTr = wrongMask(r), te = shownTest(r), showTest = s.test && L;
      const pts = [];
      if (s.view === 'x') {
        c.chips.hidden = true;
        c.titleEl.innerHTML = `<b>Original space</b> ${tex('x = (x_1, x_2)')} <span class="sub">· no boundary: each prediction also depends on that point’s ${s.k} noise inputs</span>`;
        if (showTest) pts.push({ ...te, hollow: true, name: 'new', mistakes: te.wrong });
        pts.push({ X: r.tr.X, y: r.tr.y, name: 'training', mistakes: wrongTr });
        c.plot.setView(VIEW);
        c.plot.axisLabels = ['x_1', 'x_2'];
        c.plot.render({ grid: null, points: pts });
        c.plot.onHover = (x1, x2, near) => (near ? `${near.name === 'new' ? 'new point' : 'training point'}, label <b>${NAME[near.label]}</b>` : null);
      } else {
        c.chips.hidden = false;
        c.titleEl.innerHTML = '<b>Any two features</b> <span class="sub">· drag a feature onto an axis</span>';
        drawFeaturePlane(c, r, wrongTr, te, showTest);
      }
      c.legendEl.replaceChildren(legend(['c0', 'c1', ...(showTest ? ['test'] : []), 'wrong']));
      readoutsA(c, r, [{ lab: 'Weight on x₁², x₂²', val: pc(r.realShare), small: true, title: 'Share of the sum of squared (standardized) weights on the two real features' }]);
      modelEq(c, s.k === 0 ? '[\\,x_1^2,\\ x_2^2\\,]' : s.k === 2 ? '[\\,x_1^2,\\ x_2^2,\\ \\varepsilon_1,\\ \\varepsilon_2\\,]' : `[\\,x_1^2,\\ x_2^2,\\ \\varepsilon_1,\\ \\dots,\\ \\varepsilon_{${s.k}}\\,]`, r.d, r.N, '', r.guarded);
      weightBars(c, r);
      c.hist.set({ train: { s: r.sTr, y: r.tr.y }, test: L ? { s: r.sTe, y: r.te.y } : { s: [], y: [] } });
      c.histBox.nextElementSibling.textContent = L ? 'Training points above the axis, new points below; the line at 0 is the boundary. Bars are stacked by true class.' : 'Training points only; new points appear below the axis once you lock in a prediction.';
      c.intuit.innerHTML = INTUITIONS.map((it) => `<li><b>${it.claim}</b> ${it.fact(r)}</li>`).join('');
      return r;
    },
    chart(c) {
      const L = locked('b1'), sd = seeds(5);
      c.chartTitle.textContent = 'Accuracy vs. number of noise inputs';
      c.chartNote.textContent = '(average of 5 training sets of N = 50)';
      c.chartLegendEl.replaceChildren(chartLegend(L ? ['train', 'test', 'best'] : ['train']));
      c.chart.xLabel = 'noise inputs k'; c.chart.xFmt = (v) => String(v);
      const one = (k, seed) => ({ ...A(0.10), specs: REPS.designed.specs, N: 50, k, seed }), jobs = [];
      for (const seed of sd) for (const k of KS) jobs.push(() => runCase(one(k, seed)));
      runChart(c, `b1|${L}`, jobs, () => {
        const avg = (k, key) => { const rs = sd.map((seed) => peekCase(one(k, seed))); return rs.every(Boolean) ? mean(rs.map((r) => r[key])) : NaN; };
        return { xs: KS, marker: S.b1.k, series: [{ kind: 'train', ys: KS.map((k) => avg(k, 'train')) }, ...(L ? [{ kind: 'test', ys: KS.map((k) => avg(k, 'test')) }, { kind: 'best', ys: KS.map((k) => avg(k, 'ceiling')) }] : [])] };
      });
    },
  },
};

// ---------- B1: weights, and any two features ----------

// The features offered as chips: the two real ones, the score, and the noise inputs with the largest weights.
function featureChips(r) {
  const noise = Array.from({ length: r.k }, (_, j) => j).sort((a, b) => Math.abs(r.wStd[r.d0 + b + 1]) - Math.abs(r.wStd[r.d0 + a + 1])).slice(0, 6);
  return [
    { id: 'f0', label: 'x₁²', tex: 'x_1^2' }, { id: 'f1', label: 'x₂²', tex: 'x_2^2' },
    { id: 'score', label: 'score s', tex: 's = w_0 + w^\\top z' },
    ...noise.map((j) => ({ id: `n${j}`, label: `ε${sub(j + 1)}`, tex: `\\varepsilon_{${j + 1}}` })),
  ];
}
function featureValues(r, id, set) {
  if (id === 'score') { const sc = set === 'test' ? r.sTe : r.sTr; return set === 'test' ? Float64Array.from(SHOWN, (i) => sc[i]) : sc; }
  const j = id === 'f0' ? 0 : id === 'f1' ? 1 : r.d0 + +id.slice(1), col = r.column(j, set);
  return set === 'test' ? Float64Array.from(SHOWN, (i) => col[i]) : col;
}
function drawFeaturePlane(c, r, wrongTr, te, showTest) {
  const s = S.b1, chips = featureChips(r), ids = chips.map((x) => x.id);
  s.axes = s.axes.map((a, i) => (ids.includes(a) ? a : ['f0', 'f1'][i]));
  if (s.axes[0] === s.axes[1]) s.axes = ['f0', 'f1'];
  const [a, b] = s.axes, lab = (id) => chips.find((x) => x.id === id).label;
  const u = featureValues(r, a, 'train'), v = featureValues(r, b, 'train');
  const ut = showTest ? featureValues(r, a, 'test') : [], vt = showTest ? featureValues(r, b, 'test') : [];
  const lim = (xs) => { const q = [...xs].sort((p, q2) => p - q2), lo = q[Math.floor(0.01 * (q.length - 1))], hi = q[Math.ceil(0.99 * (q.length - 1))], pad = 0.08 * (hi - lo || 1); return [lo - pad, hi + pad]; };
  const [x0, x1] = lim([...u, ...ut]), [y0, y1] = lim([...v, ...vt]);
  const pack = (p, q) => { const X = new Float64Array(2 * p.length); for (let i = 0; i < p.length; i++) { X[2 * i] = p[i]; X[2 * i + 1] = q[i]; } return X; };
  const pts = [];
  if (showTest) pts.push({ X: pack(ut, vt), y: te.y, hollow: true, name: 'new', mistakes: te.wrong });
  pts.push({ X: pack(u, v), y: r.tr.y, name: 'training', mistakes: wrongTr });
  c.plot.setView({ xmin: x0, xmax: x1, ymin: y0, ymax: y1 });
  c.plot.axisLabels = [lab(a), lab(b)];
  const zero = (ctx, p) => {
    ctx.save(); ctx.strokeStyle = theme().ink; ctx.lineWidth = 2;
    if (a === 'score') { ctx.beginPath(); ctx.moveTo(p.sx(0), 0); ctx.lineTo(p.sx(0), p.cssH); ctx.stroke(); }
    if (b === 'score') { ctx.beginPath(); ctx.moveTo(0, p.sy(0)); ctx.lineTo(p.cssW, p.sy(0)); ctx.stroke(); }
    ctx.restore();
  };
  c.plot.render({ grid: null, points: pts, overlays: [zero] });
  c.plot.onHover = (p, q, near) => `${lab(a)} = ${fmt(p)}<br>${lab(b)} = ${fmt(q)}${near ? `<div class="sep"></div>${near.name === 'new' ? 'new point' : 'training point'}, label <b>${NAME[near.label]}</b>` : ''}`;
  c.chips.replaceChildren(...chips.map((ch) => {
    const ax = a === ch.id ? '→' : b === ch.id ? '↑' : '';
    const el = h('button', { class: 'zchip', type: 'button', title: 'Drag onto the plot (or click) to put it on an axis', html: `${tex(ch.tex)}${ax ? `<span class="ax">${ax}</span>` : ''}` });
    bindChip(c, el, ch);
    return el;
  }));
}
function assignAxis(id, ax) {
  const s = S.b1;
  if (s.axes[ax] === id) return;
  if (s.axes[1 - ax] === id) s.axes[1 - ax] = s.axes[ax];
  s.axes[ax] = id;
  update();
}
// Drag a chip onto the plot (lower-right half: horizontal axis; upper-left: vertical), or click for a menu.
let suppressClick = false, menu = null;
function bindChip(c, chip, ch) {
  chip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, target = null;
    try { chip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!ghost) { closeMenu(); ghost = h('div', { class: 'zchip ghost', html: `${tex(ch.tex)}<span class="to"></span>` }); document.body.append(ghost); chip.classList.add('dragging'); }
      ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
      const r = c.plot.box.getBoundingClientRect();
      target = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom ? ((ev.clientX - r.left) / r.width + (ev.clientY - r.top) / r.height > 1 ? 0 : 1) : null;
      c.dropHint.hidden = target === null;
      if (target !== null) { c.dropHint.className = `drop-hint ${target === 0 ? 'h' : 'v'}`; c.dropHint.textContent = target === 0 ? 'horizontal axis' : 'vertical axis'; }
      ghost.querySelector('.to').textContent = target === 0 ? '→ horizontal' : target === 1 ? '↑ vertical' : '';
    };
    const end = (drop) => {
      chip.removeEventListener('pointermove', move); chip.removeEventListener('pointerup', up); chip.removeEventListener('pointercancel', cancel);
      if (!ghost) return;
      ghost.remove(); chip.classList.remove('dragging'); c.dropHint.hidden = true;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
      if (drop && target !== null) assignAxis(ch.id, target);
    };
    const up = () => end(true), cancel = () => end(false);
    chip.addEventListener('pointermove', move); chip.addEventListener('pointerup', up); chip.addEventListener('pointercancel', cancel);
  });
  chip.addEventListener('click', () => { if (!suppressClick) openMenu(c, chip, ch); });
}
function openMenu(c, chip, ch) {
  closeMenu();
  const item = (ax, label) => { const b = h('button', { class: 'btn', type: 'button', role: 'menuitem' }, label); b.addEventListener('click', () => { closeMenu(); assignAxis(ch.id, ax); }); return b; };
  menu = h('div', { class: 'zmenu', role: 'menu', 'aria-label': `Show ${ch.label} on` }, item(0, '→ horizontal axis'), item(1, '↑ vertical axis'));
  const stage = c.page.querySelector('.stage');
  stage.append(menu);
  const sr = stage.getBoundingClientRect(), r = chip.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(r.left - sr.left, sr.width - menu.offsetWidth - 4))}px`;
  menu.style.top = `${r.bottom - sr.top + 4}px`;
  menu.querySelector('button').focus();
  setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true), 0);
}
function outsideMenu(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
function closeMenu() { if (!menu) return; menu.remove(); menu = null; document.removeEventListener('pointerdown', outsideMenu, true); }

// Relative weights (the polynomial lab's bars): x₁², x₂², and the six largest noise inputs.
function weightBars(c, r) {
  const w = r.wStd, d0 = r.d0, noise = Array.from({ length: r.k }, (_, j) => j).sort((a, b) => Math.abs(w[d0 + b + 1]) - Math.abs(w[d0 + a + 1]));
  const rows = [{ lab: tex('x_1^2'), v: w[1] }, { lab: tex('x_2^2'), v: w[2] }, ...noise.slice(0, 6).map((j) => ({ lab: tex(`\\varepsilon_{${j + 1}}`), v: w[d0 + j + 1] }))];
  const mx = Math.max(1e-12, ...Array.from(w).slice(1).map(Math.abs));
  c.wbars.innerHTML = rows.map(({ lab, v }) => {
    const f = Math.min(1, Math.abs(v) / mx) * 50;
    return `<div class="wbar-row"><div class="lab">${lab}</div><div class="track"><div class="bar you ${v >= 0 ? 'pos' : 'neg'}" style="left:${v >= 0 ? 50 : 50 - f}%;width:${f}%"></div></div><div class="val">${fmt(v, 2)}</div></div>`;
  }).join('');
  c.wbars.classList.toggle('many', rows.length > 5);
  const rest = r.k - Math.min(6, r.k);
  c.wnote.textContent = r.k === 0 ? 'Weights on standardized features. No noise inputs yet.'
    : `Weights on standardized features, each bar divided by the largest |wⱼ|. ${rest > 0 ? `${rest} more noise input${rest === 1 ? '' : 's'} not shown. ` : ''}All noise inputs together carry ${pc(1 - r.realShare)} of the squared weights.`;
}

// ---------- landing ----------

function renderLanding() {
  const page = h('main', { class: 'hall landing' },
    h('section', { class: 'hero' },
      h('h1', {}, 'When flexible features fit the noise'),
      h('p', { class: 'lead', html: 'In the Feature Transform Gallery, the right representation \\(z = \\Phi(x)\\) let one linear model draw almost any boundary. Real data are noisy: some labels are simply wrong. This lab shows what flexible representations do with that noise, and why it gets worse, not better, when you add inputs. The model never changes: logistic regression, fit with <b>no regularization</b> (only a vanishingly small numerical guard, explained wherever it is needed).' }),
      h('p', { class: 'howto' }, `About 35 minutes. At every station, predict first: results on new points appear once you lock in a prediction. Your predictions and the exit ticket collect in 📋 My answers (top right).`),
      h('div', { class: 'hero-actions' }, h('a', { class: 'btn primary play', href: '#a1' }, 'Start: station 1 →'))));
  const jobs = [];
  for (const part of PARTS) {
    const tiles = h('div', { class: 'tiles' });
    STATIONS.filter((s) => s.part === part.id).forEach((st) => {
      const box = h('div', { class: 'plot-box' }), i = STEPS.indexOf(st.id);
      const done = answers[st.id] && answers[st.id].revealed;
      tiles.append(h('a', { class: 'tile', href: `#${st.id}` },
        h('div', { class: 'tile-plot' }, box),
        h('div', { class: 'tile-cap' }, h('div', { class: 'tile-top' }, h('b', {}, `${i + 1}. ${st.name}`), h('span', { class: 'fam' }, `${st.minutes} min${done ? ' · ✓' : ''}`)), h('div', { class: 'tile-lead' }, st.lead.split('. ')[0] + '.'))));
      const plot = new XPlot(box, { thumb: true });
      live.push(plot);
      jobs.push(() => thumb(st.id, plot));
    });
    page.append(h('section', { class: 'wing' }, h('h2', {}, part.name), h('p', { class: 'blurb' }, part.blurb), tiles));
  }
  page.append(h('a', { class: 'finale-link card', href: '#wrap' }, h('span', { class: 'kicker' }, `Station ${STEPS.length}`), h('b', {}, 'Wrap-up and exit ticket'), h('span', {}, 'What we saw, four questions for what comes next →')));
  renderMath(page);
  viewEl.append(page);
  queue(jobs);
}
function thumb(id, plot) {
  plot.setView(VIEW);
  if (id === 'b1') {
    const r = runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k: 100 });
    plot.render({ grid: null, points: [{ X: r.tr.X, y: r.tr.y }] });
    return;
  }
  if (id === 'a3') {
    const fits = seeds(8).map((seed) => runCase({ ...A(0.15), specs: REPS.poly10.specs, N: 100, seed }));
    plot.render({ grid: null, points: [{ X: fits[0].tr.X, y: fits[0].tr.y, alpha: 0.5 }], ghosts: fits.map((f) => { const g = gridOf(f, 60); return { segs: marchingSquares(g.V, 60), G: 60, dash: [], width: 1, alpha: 0.7 }; }) });
    return;
  }
  const r = id === 'a1' ? runCase({ ...A(0.15), specs: REPS.poly10.specs, N: 100 }) : runCase({ ...A(0.15), specs: polySpecs(2), N: 100 });
  const g = gridOf(r, 72);
  plot.render({ grid: g, segs: marchingSquares(g.V, 72), shade: 'prob', points: [{ X: r.tr.X, y: r.tr.y, flips: id === 'a1' ? flipMask(r) : null }] });
}

// ---------- wrap-up ----------

function renderWrap() {
  const a1 = { d: runCase({ ...A(0.15), specs: REPS.designed.specs, N: 100 }), p: runCase({ ...A(0.15), specs: REPS.poly10.specs, N: 100 }) };
  const fits = seeds(8).map((seed) => runCase({ ...A(0.15), specs: REPS.poly10.specs, N: 100, seed }));
  const b = (k) => runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k });
  const L = (id) => locked(id);
  const hide = (id, text) => (L(id) ? text : `<span class="hint">${LOCK} (lock in a prediction at station ${STEPS.indexOf(id) + 1})</span>`);
  const saw = [
    `<b>Flexible features memorize the noise.</b> With 15 % of labels flipped, degree 10 got ${pc(a1.p.train)} of the training points right (${a1.p.memorized} of ${a1.p.flipped} flipped labels memorized) but ${hide('a1', pc(a1.p.test))} of new points; the designed [x₁², x₂²] got ${hide('a1', pc(a1.d.test))}, with ${hide('a1', pc(a1.d.ceiling))} the best possible.`,
    `<b>Too much flexibility costs accuracy on new points, and more data helps.</b> Training accuracy keeps climbing with the degree; accuracy on new points peaks at degree 2.`,
    `<b>A boundary that changes with every sample is fitting the sample.</b> 8 degree-10 fits disagreed on ${pc(disagreement(fits))} of the data region; their majority vote got ${hide('a3', pc(majorityVote(fits)))} of new points.`,
    `<b>In higher dimensions, useless inputs hurt, and no picture shows it.</b> With N = 50, adding 100 noise inputs took new-point accuracy from ${hide('b1', pc(b(0).test))} to ${hide('b1', pc(b(100).test))}, while every training point was classified correctly by a flat boundary.`,
  ];
  const ta = EXIT.map((qText, i) => {
    const t = h('textarea', { 'aria-label': qText, rows: 3 });
    t.value = exitAns[i] || '';
    t.addEventListener('input', () => { exitAns[i] = t.value; store('overfit:exit', exitAns); syncStepper(); });
    return h('div', { class: 'exit-q' }, h('label', {}, h('b', {}, `${i + 1}. `), qText), t);
  });
  const openAnswers = h('button', { class: 'btn primary', type: 'button' }, '📋 Open My answers to copy everything');
  openAnswers.addEventListener('click', showAnswers);
  const page = h('main', { class: 'hall wrap', 'data-station': 'wrap' },
    h('nav', { class: 'ex-nav' }, h('a', { class: 'btn', href: '#' }, '← All stations'), h('span', { class: 'where' }, `Station ${STEPS.length} of ${STEPS.length}`), h('span', { class: 'spacer' }), h('a', { class: 'btn', href: '#b1' }, '‹ Irrelevant inputs')),
    h('section', { class: 'hero' }, h('span', { class: 'kicker' }, 'Wrap-up'), h('h1', {}, 'What we saw, and what comes next')),
    h('section', { class: 'card' }, h('h2', {}, 'What we saw'), h('ol', { class: 'saw', html: saw.map((t) => `<li>${t}</li>`).join('') })),
    h('section', { class: 'card' }, h('h2', {}, 'Four ways out (open questions for the next labs)'), h('ol', { class: 'levers', html: [
      '<b>More data.</b> At station 2, the same degree overfit much less with N = 400 than with N = 40. When is more data not an option?',
      '<b>Fewer, better features.</b> Two designed features beat 65 polynomial features and 100 RBFs. But designing them needed knowing the answer (a circle centered at the origin).',
      '<b>Make large weights cost something.</b> The memorizing fits had enormous weights (degree 10: the largest above 600, against about 1 for the designed features). What if the fitting objective also charged for the size of the weights?',
      '<b>Learn the features.</b> Generic features wasted most of their flexibility on noise. What if the model could learn a few good features from the data instead of being handed 100 fixed ones?',
    ].map((t) => `<li>${t}</li>`).join('') }), h('p', { class: 'hint', html: '<b>One more thing:</b> to draw the curves, we looked at accuracy on the new points to compare settings. If you used those numbers to <i>choose</i> the degree, they would no longer be new points. How would you choose it honestly?' })),
    h('section', { class: 'card exit' }, h('h2', {}, 'Exit ticket'), ...ta, h('div', { class: 'btn-row' }, openAnswers)));
  renderMath(page);
  viewEl.append(page);
  page.dataset.ready = '1';
}

// ---------- My answers ----------

const COLS = ['#', 'Station', 'Your prediction', 'Correct', 'Result'];
function resultText(id) {
  if (id === 'a1') { const r = runCase({ ...A(0.15), specs: REPS.poly10.specs, N: 100 }); return `degree 10: ${pc(r.train)} training, ${pc(r.test)} new points`; }
  if (id === 'a2') { const t = (k) => mean(seeds(5).map((seed) => runCase({ ...A(0.15), specs: polySpecs(k), N: 100, seed }).test)); return `new points: degree 2 ${pc(t(2))}, degree 10 ${pc(t(10))}`; }
  if (id === 'a3') { const fits = seeds(8).map((seed) => runCase({ ...A(0.15), specs: REPS.poly10.specs, N: 100, seed })); return `one fit ${pc(mean(fits.map((f) => f.test)))}, vote ${pc(majorityVote(fits))}`; }
  const r = runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k: 100 });
  return `k = 100: ${pc(r.train)} training, ${pc(r.test)} new points`;
}
function answerRows() {
  const rows = STATIONS.map((st, i) => {
    const a = answers[st.id];
    if (!a || !a.locked) return { cells: [i + 1, st.name, 'not locked in', '', ''], missing: true };
    const ok = a.chosen === st.question.answer;
    return { ok, cells: [i + 1, st.name, st.question.choices[a.chosen], ok ? '✓' : `✗ (${st.question.choices[st.question.answer]})`, resultText(st.id)] };
  });
  EXIT.forEach((q, i) => rows.push({ cells: [`E${i + 1}`, `Exit ticket: ${q}`, exitAns[i] || '', '', ''], missing: !(exitAns[i] && exitAns[i].trim()), exit: true }));
  return rows;
}
function answersTable(rows, inline = false) {
  const st = inline ? ' style="border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top"' : '';
  return `<table class="answers"${inline ? ' style="border-collapse:collapse"' : ''}><thead><tr>${COLS.map((t) => `<th${st}>${t}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${r.missing ? ' class="missing"' : ''}>${r.exit
    ? `<td${st}>${escapeHtml(r.cells[0])}</td><td${st}>${escapeHtml(r.cells[1])}</td><td${st} colspan="3">${escapeHtml(r.cells[2] || 'not answered')}</td>`
    : r.cells.map((v, j) => `<td${st}${!inline && j === 3 && r.ok ? ' class="met"' : ''}>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function showAnswers() {
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  const rows = answerRows(), done = rows.filter((r) => !r.missing && !r.exit).length, right = rows.filter((r) => r.ok).length;
  const nameIn = h('input', { type: 'text', placeholder: 'Type your name', value: studentName, 'aria-label': 'Your name' });
  nameIn.addEventListener('input', () => { studentName = nameIn.value; store('overfit:name', studentName); });
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const copyBtn = h('button', { class: 'btn primary', type: 'button', title: 'Copies a real table: paste it into a document or a spreadsheet' }, 'Copy table');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'My answers' },
    h('div', { class: 'sheet wide' },
      h('header', {}, h('b', {}, 'My answers · Overfitting Lab'), close),
      h('div', { class: 'ans-top' }, h('label', {}, 'Name ', nameIn), h('span', { class: 'hint' }, `${done} of ${STATIONS.length} predictions locked in · ${right} correct · ${new Date().toLocaleDateString()}`)),
      h('div', { class: 'ans-wrap', html: answersTable(rows) }),
      h('p', { class: 'hint' }, 'Copy the table into a document or spreadsheet, or take a screenshot of this window. The exit-ticket answers are typed on the Wrap-up page.'),
      h('div', { class: 'btn-row' }, copyBtn)));
  const dismiss = () => { modal.remove(); answersBtn.focus(); };
  close.addEventListener('click', dismiss);
  modal.addEventListener('click', (e) => { if (e.target === modal) dismiss(); });
  copyBtn.addEventListener('click', async () => {
    const r = answerRows(), title = `Overfitting Lab · ${studentName || '(no name)'} · ${new Date().toLocaleDateString()}`;
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
  document.body.append(modal);
  close.focus();
}
answersBtn.addEventListener('click', showAnswers);

// ---------- help, reset, theme, keys ----------

const HELP = `
<p>Every station uses the <b>same model</b>: logistic regression, \\(P(\\text{${NAME[1]}} \\mid x) = \\sigma(w_0 + w^\\top z)\\) with \\(z = \\Phi(x)\\), fit to the training points with <b>no regularization</b> (a vanishingly small numerical guard is used only when the training points can be separated perfectly; each station says when). What changes is the representation \\(\\Phi\\), the noise, and the number of training points.</p>
<ol>
  <li><b>Predict first.</b> Each station asks one question. Choose an answer and <b>Lock in</b>: results on <i>new points</i> (2000 points never used for fitting) then appear in the readouts, the plot and the chart. <b>Reveal</b> shows the answer and sets the controls to match.</li>
  <li><b>Explore.</b> The plot and the chart stay in view while you move the controls. Hover the plot or the chart for values.</li>
  <li><b>Submit.</b> 📋 <b>My answers</b> (top right) collects your predictions and the exit ticket (last station) in a table you can copy into a document or screenshot.</li>
</ol>
<p class="hint">Keys: ← → move between stations, Esc returns to the start. ↺ Reset lab erases everything this lab saved in this browser.</p>`;
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

resetLabBtn.addEventListener('click', () => {
  const ok = window.confirm('Reset the whole lab?\n\nThis erases everything this lab has saved in this browser: your predictions, your exit-ticket answers and your name. You will start again at the beginning.\n\nThis cannot be undone.');
  if (!ok) return;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ftlab:overfit:')) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing was saved */ }
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
});

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : mq.matches; };
function redrawAll() { refreshTheme(); LIVE_PLOTS.forEach((p) => p.draw()); }
themeBtn.addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store('theme', next);
  redrawAll();
});
mq.addEventListener('change', () => { if (!store('theme')) document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light'; redrawAll(); });

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (e.key === 'Escape') {
    closeMenu();
    if (document.querySelector('.modal')) { document.querySelectorAll('.modal').forEach((m) => m.remove()); return; }
    location.hash = '';
    return;
  }
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.querySelector('.modal')) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
});

// ---------- routing ----------

function route() {
  const id = location.hash.slice(1);
  clearView();
  closeMenu();
  const st = byId(id);
  if (st) { renderStation(st); document.title = `${st.name} · Overfitting Lab`; }
  else if (id === 'wrap') { renderWrap(); document.title = 'Wrap-up · Overfitting Lab'; }
  else { renderLanding(); document.title = 'Overfitting Lab'; }
  syncStepper();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
if (!store('overfit:helpSeen')) { store('overfit:helpSeen', true); showHelp(); }

// for the console and tests
window.overfit = {
  stations: STATIONS, state: S, answers, exitAns, get cur() { return cur; }, get live() { return live; },
  set(id, patch) { Object.assign(S[id], patch); if (cur && cur.st.id === id) { CONTROLLERS[id].sync(cur); update(true); } },
  showAnswers, assignAxis, theme, niceTicks,
};
