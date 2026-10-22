// Feature Transform Gallery: one linear model, many boundaries.
//   #          the hall: every exhibit as a live tile (hover to apply Φ)
//   #<id>      one exhibit: the x → Φ(x) morph, Φ, the model, accuracy
//   #match     the finale: every representation on every dataset

import { EXHIBITS, WINGS, MATCH, byId, val } from './exhibits.js';
import { fitCase, exhibitCase, geometry, shownWeights, SPLIT } from './build.js';
import { MorphPlot } from './morph.js';
import { refreshTheme, theme, LIVE_PLOTS } from './plot2d.js';
import { h, tex, renderMath, fmt, pct, slider, store } from './ui.js';

const T0 = refreshTheme();
const NAME = T0.names; // class names used in text, from the theme (e.g. ['blue', 'orange'])
const pct0 = (v) => `${Math.round(100 * v)}%`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const knobs = {}; // exhibit id → knob value (this visit only)
const view = { mesh: true, rawLine: false, ...(store('gallery:view') || {}) };

// ---------- shell ----------

const root = document.getElementById('app');
const themeBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode' }, '◐', h('span', { class: 'lbl' }, ' Theme'));
const navHall = h('a', { class: 'icon-btn nav-hall', href: '#' }, 'All exhibits');
const navMatch = h('a', { class: 'icon-btn', href: '#match' }, 'Finale');
root.append(
  h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#' }, 'Feature Transform Gallery', h('small', {}, 'IDS 705 · one linear model, many boundaries')),
    h('div', { class: 'spacer' }), navHall, navMatch, themeBtn),
  h('div', { id: 'view' }));
const viewEl = document.getElementById('view');

// Plots and queued work belong to the page on screen; leaving it drops them.
let live = [], token = 0;
function clearView() {
  live.forEach((p) => p.destroy());
  live = [];
  token++;
  viewEl.innerHTML = '';
}
// Run fits one per tick so the page appears at once and fills in.
function queue(jobs) {
  const my = token;
  const next = () => {
    if (my !== token || !jobs.length) return;
    jobs.shift()();
    setTimeout(next, 0);
  };
  setTimeout(next, 0);
}

function legend({ raw = false } = {}) {
  return h('div', { class: 'legend' },
    h('span', {}, h('span', { class: `sw c0 ${T0.shape0}` }), `class 0 (${NAME[0]})`),
    h('span', {}, h('span', { class: `sw c1 ${T0.shape1}` }), `class 1 (${NAME[1]})`),
    h('span', {}, h('span', { class: 'sw line' }), 'boundary'),
    raw ? h('span', { class: 'raw-key', hidden: !view.rawLine }, h('span', { class: 'sw dash' }), 'best straight line (raw features)') : null);
}

function accLine(fc) {
  const d = fc.model.d;
  return `<span class="raw" title="Raw features x₁, x₂: a straight line">${pct0(fc.raw.test.acc)}</span><span class="arr" aria-hidden="true">→</span>` +
    `<b title="With Φ">${pct0(fc.model.test.acc)}</b><span class="d">${plural(d, 'feature')}</span>`;
}

// ---------- hall ----------

function renderHall() {
  const hero = h('section', { class: 'hero' },
    h('h1', {}, 'One linear model. Many boundaries.'),
    h('p', { class: 'lead', html: `Every boundary in this gallery was drawn by the <b>same model</b>, logistic regression: \\(P(\\text{${NAME[1]}} \\mid x) = \\sigma(w_0 + w^\\top z)\\). Its boundary \\(w_0 + w^\\top z = 0\\) is always flat. Only the input changes: instead of the raw point \\(x = (x_1, x_2)\\), the model sees a new representation \\(z = \\Phi(x)\\). Choose \\(\\Phi\\) well, and that flat boundary becomes a circle, a spiral or a staircase in the original space.` }),
    h('p', { class: 'howto' }, 'Hover over an exhibit to apply its transform, or apply them all at once. Click an exhibit to step inside. Under each one: accuracy on new data with the raw features → with Φ.'),
    h('div', { class: 'hero-actions' }, applyAll(), legend()));
  const page = h('main', { class: 'hall' }, hero);
  const jobs = [];
  for (const wing of WINGS) {
    const tiles = h('div', { class: 'tiles' });
    for (const ex of EXHIBITS.filter((e) => e.wing === wing.id)) {
      const t = tile(ex);
      tiles.append(t.el);
      jobs.push(t.load);
    }
    page.append(h('section', { class: 'wing', 'aria-label': wing.name }, h('h2', {}, wing.name), h('p', { class: 'blurb' }, wing.blurb), tiles));
  }
  page.append(h('a', { class: 'finale-link card', href: '#match' },
    h('span', { class: 'kicker' }, 'Finale'),
    h('b', {}, 'Which representation fits which data?'),
    h('span', {}, 'Every representation on every dataset, side by side →')));
  renderMath(page);
  viewEl.append(page);
  queue(jobs);
}

function tile(ex) {
  const box = h('div', { class: 'plot-box' });
  const acc = h('div', { class: 'tile-acc' }, '…');
  const el = h('a', { class: 'tile', href: `#${ex.id}`, 'data-id': ex.id },
    h('div', { class: 'tile-plot' }, box),
    h('div', { class: 'tile-cap' },
      h('div', { class: 'tile-top' }, h('b', {}, ex.name), h('span', { class: 'fam' }, ex.family)),
      h('div', { class: 'tile-phi', html: tex(val(ex.phi, ex.k0)) }),
      acc));
  const plot = new MorphPlot(box, { thumb: true });
  live.push(plot);
  hoverMorph(el, plot);
  return {
    el,
    load() {
      const fc = fitCase(exhibitCase(ex));
      plot.set(geometry(fc, 'thumb'));
      acc.innerHTML = accLine(fc);
      el.setAttribute('aria-label', `${ex.name}: raw features ${pct0(fc.raw.test.acc)}, with Φ ${pct0(fc.model.test.acc)}`);
    },
  };
}
// One button morphs every plot on the page; hovering a plot then shows the other side.
let allT = 0;
function applyAll() {
  const b = h('button', { class: 'btn primary play', type: 'button' }, '▶ Apply every Φ');
  b.addEventListener('click', () => {
    allT = allT ? 0 : 1;
    live.forEach((p) => p.animate(allT, { ms: 1600 }));
    b.textContent = allT ? '◀ Back to x' : '▶ Apply every Φ';
  });
  return b;
}
function hoverMorph(el, plot) {
  const go = () => plot.animate(1 - allT, { ms: 900 }), back = () => plot.animate(allT, { ms: 700 });
  el.addEventListener('pointerenter', go);
  el.addEventListener('pointerleave', back);
  el.addEventListener('focus', go);
  el.addEventListener('blur', back);
}

// ---------- one exhibit ----------

let ex = null, fc = null, plot = null, ui = null;

function renderExhibit(target) {
  ex = target;
  const i = EXHIBITS.indexOf(ex), N = EXHIBITS.length, wing = WINGS.find((w) => w.id === ex.wing);
  const prev = EXHIBITS[(i + N - 1) % N], next = EXHIBITS[(i + 1) % N];
  const nav = h('nav', { class: 'ex-nav', 'aria-label': 'Exhibits' },
    h('a', { class: 'btn', href: '#' }, '← All exhibits'),
    h('span', { class: 'where' }, `${wing.name} · ${i + 1} of ${N}`),
    h('span', { class: 'spacer' }),
    h('a', { class: 'btn', href: `#${prev.id}`, title: `Previous: ${prev.name} (←)` }, `‹ ${prev.name}`),
    h('a', { class: 'btn', href: `#${next.id}`, title: `Next: ${next.name} (→)` }, `${next.name} ›`));

  // stage: the morph plot and its controls
  const spaceName = h('b', {}, 'Original space');
  const spaceSub = h('span', { class: 'sub' });
  const box = h('div', { class: 'plot-box' });
  const play = h('button', { class: 'btn primary play', type: 'button', title: 'Space' });
  const range = h('input', { type: 'range', class: 'morph', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'From the original space (0) to feature space (1000)' });
  const meshBox = h('input', { type: 'checkbox' });
  const rawBox = h('input', { type: 'checkbox' });
  meshBox.checked = view.mesh;
  rawBox.checked = view.rawLine;
  const stage = h('section', { class: 'card stage' },
    h('div', { class: 'plot-title' }, h('span', {}, spaceName, ' ', spaceSub), h('span', { class: 'hint' }, 'Hover a point to see where Φ sends it')),
    h('div', { class: 'stage-wrap' }, box),
    h('div', { class: 'morph-ctl' },
      play,
      h('span', { class: 'end' }, 'original space'),
      range,
      h('span', { class: 'end' }, 'feature space')),
    h('div', { class: 'stage-opts' },
      h('span', { class: 'opts' },
        h('label', { title: 'Grid lines of the original space, carried along by Φ (G)' }, meshBox, 'grid lines'),
        h('label', { title: 'Logistic regression on the raw x₁, x₂, for comparison (R)' }, rawBox, 'best straight line')),
      legend({ raw: true })));

  // side: what Φ is, what the model is, how well it does, where it is used
  const phiEl = h('div', { class: 'phi-big' });
  const howEl = h('p', { class: 'how' });
  const eqEl = h('div', { class: 'eqs' });
  const accEl = h('div', { class: 'accbars' });
  const side = h('aside', { class: 'ex-side' },
    h('header', { class: 'ex-title' }, h('span', { class: 'fam' }, ex.family), h('h1', {}, ex.name), h('p', { class: 'lead' }, ex.lead)),
    h('section', { class: 'card' }, h('h2', {}, 'The representation'), phiEl, howEl),
    h('section', { class: 'card' }, h('h2', {}, 'The same linear model'), eqEl),
    h('section', { class: 'card' }, h('h2', {}, `Accuracy on ${SPLIT.nTest} new points`), accEl));
  let knob = null;
  if (ex.knob) {
    const kn = ex.knob, k = knobs[ex.id] ?? ex.k0;
    const reset = h('button', { class: 'btn', type: 'button' }, `Reset to ${kn.default}`);
    knob = slider({ label: kn.label, min: kn.min, max: kn.max, step: kn.step, log: kn.log, int: kn.int, value: k, fmt: (v) => fmt(v, 2), onInput: (v) => setKnob(v) });
    reset.addEventListener('click', () => { knob.set(kn.default); setKnob(kn.default); });
    side.append(h('section', { class: 'card knob' }, h('h2', {}, 'Try another setting'), knob.el, h('div', { class: 'knob-foot' }, kn.hint ? h('span', { class: 'hint' }, kn.hint) : h('span'), reset)));
  }
  side.append(h('section', { class: 'card' }, h('h2', {}, 'Where this shows up'), h('p', {}, ex.practice)));

  const page = h('main', { class: 'exhibit' }, nav, h('div', { class: 'ex-grid' }, stage, side));
  viewEl.append(page);

  plot = new MorphPlot(box, { onHover: pointTip });
  plot.setOpts({ mesh: view.mesh, rawLine: view.rawLine });
  live.push(plot);
  ui = { spaceName, spaceSub, play, range, phiEl, howEl, eqEl, accEl, rawKey: stage.querySelector('.raw-key'), meshBox, rawBox, knob };

  const onT = (t) => {
    ui.range.value = String(Math.round(1000 * t));
    const fs = t >= 0.5;
    ui.spaceName.textContent = fs ? 'Feature space' : 'Original space';
    ui.spaceSub.innerHTML = fs ? tex('z = \\Phi(x)') : tex('x = (x_1, x_2)');
    ui.play.textContent = t >= 0.5 ? '◀ Back to x' : '▶ Apply Φ';
  };
  ui.onT = onT;
  play.addEventListener('click', togglePlay);
  range.addEventListener('input', () => { plot.stop(); plot.setT(+range.value / 1000); onT(plot.t); });
  meshBox.addEventListener('change', () => setView({ mesh: meshBox.checked }));
  rawBox.addEventListener('change', () => setView({ rawLine: rawBox.checked }));
  onT(0);
  refresh();
}

function togglePlay() {
  if (!plot) return;
  plot.animate(plot.t >= 0.5 ? 0 : 1, { ms: 1600, onStep: ui.onT });
}
function setView(o) {
  Object.assign(view, o);
  store('gallery:view', view);
  if (!plot) return;
  ui.meshBox.checked = view.mesh;
  ui.rawBox.checked = view.rawLine;
  ui.rawKey.hidden = !view.rawLine;
  plot.setOpts({ mesh: view.mesh, rawLine: view.rawLine });
}

let knobFrame = 0;
function setKnob(v) {
  knobs[ex.id] = v;
  cancelAnimationFrame(knobFrame);
  knobFrame = requestAnimationFrame(refresh);
}

// Fit (cached) for the current knob value and update every panel.
function refresh() {
  const k = knobs[ex.id] ?? ex.k0;
  fc = fitCase(exhibitCase(ex, k));
  const g = geometry(fc, 'full');
  plot.set(g);
  ui.phiEl.innerHTML = tex(val(ex.phi, k), true);
  ui.howEl.innerHTML = val(ex.how, k);
  ui.eqEl.innerHTML = equations(fc, val(ex.shape, k));
  ui.accEl.innerHTML = accBars(fc);
}

const zTex = (fc, j) => (fc.zTex && fc.model.d === fc.zTex.length ? fc.zTex[j] : fc.model.prep.fmap.columns[j].tex);
const num = (v) => (Math.abs(v) < 0.005 ? '0.00' : Math.abs(v).toFixed(2));
function eqTex(w, terms) {
  let s = `${w[0] <= -0.005 ? '-' : ''}${num(w[0])}`;
  terms.forEach((t, j) => { s += ` ${w[j + 1] <= -0.005 ? '-' : '+'} ${num(w[j + 1])}\\,${t}`; });
  return `${s} = 0`;
}
function equations(fc, shape) {
  const { model, display } = fc, d = model.d, cols = model.prep.fmap.columns, w = shownWeights(model.wRaw);
  const row = (lab, math, note) => `<div class="eq-row"><div class="lab">${lab}</div><div class="math">${math}</div><div class="note">${note}</div></div>`;
  let out;
  if (display.mode === 'edge') {
    out = row('In feature space', tex(`w_0 + w_1 z_1 + w_2 z_2 + \\dots + w_{${d}} z_{${d}} = 0`), `A flat hyperplane in ${d} dimensions, seen edge-on as the vertical line above.`);
  } else {
    const zs = d === 1 ? ['z_1'] : ['z_1', 'z_2'];
    const where = cols.map((c, j) => `${zs[j]} = ${zTex(fc, j)}`).join(',\\quad ');
    out = row('In feature space', tex(eqTex(w, zs)), d === 1 ? `A single cut point on the \\(z_1\\) axis, where ${tex(where)}.` : `A straight line, where ${tex(where)}.`);
  }
  const xs = d <= 10 ? tex(eqTex(w, cols.map((c, j) => zTex(fc, j)))) : `<span class="hint">${d} terms: too many to write out.</span>`;
  out += row('In the original space', xs, `The same equation in \\(x\\): ${shape}.`);
  out += `<p class="hint">Weights divided by the largest one: only their ratios place the boundary.</p>`;
  const el = h('div', { html: out });
  renderMath(el);
  return el.innerHTML;
}

function accBars(fc) {
  const d = fc.model.d;
  const bar = (cls, label, v) => `<div class="accrow ${cls}"><div class="lab">${label}</div><div class="track"><div class="fill" style="width:${(100 * v).toFixed(1)}%"></div><div class="chance" title="50%: a coin flip"></div></div><div class="val">${pct(v)}</div></div>`;
  return bar('raw', `Raw features ${tex('x_1, x_2')} (a straight line)`, fc.raw.test.acc) +
    bar('phi', `${tex('\\Phi(x)')}, ${plural(d, 'feature')}`, fc.model.test.acc) +
    `<p class="hint">Both models were fit to the ${SPLIT.nTrain} points shown and tested on ${SPLIT.nTest} new ones. The dashed mark is 50%, a coin flip.</p>`;
}

function pointTip(i) {
  if (!fc) return null;
  const tr = fc.split.train, g = plot.g, mode = g.mode, u = g.points.raw[2 * i], v = g.points.raw[2 * i + 1];
  const [c0, cu, cv] = fc.display.coef, s = c0 + cu * u + cv * v, y = tr.y[i], pred = s > 0 ? 1 : 0;
  const [xa, xb] = g.titles.x, [za, zb] = g.titles.z;
  const z = mode === 'edge' ? `<span class="k">score w₀ + wᵀz</span> = ${fmt(s)}` :
    mode === 'line' ? `<span class="k">z₁ = ${za}</span> = ${fmt(u)}` :
      `<span class="k">z₁ = ${za}</span> = ${fmt(u)}<br><span class="k">z₂ = ${zb}</span> = ${fmt(v)}`;
  return `<span class="k">${xa}</span> = ${fmt(tr.X[2 * i])}, <span class="k">${xb}</span> = ${fmt(tr.X[2 * i + 1])}<div class="sep"></div>${z}<div class="sep"></div>` +
    `class <b>${NAME[y]}</b>, predicted <b>${NAME[pred]}</b> ${pred === y ? '✓' : '✗'}`;
}

// ---------- finale ----------

function renderMatch() {
  const page = h('main', { class: 'match' },
    h('section', { class: 'hero' },
      h('span', { class: 'kicker' }, 'Finale'),
      h('h1', {}, 'Which representation fits which data?'),
      h('p', { class: 'lead', html: `Each row is one representation \\(\\Phi\\), each column one dataset. Every cell is the same logistic regression, fit to ${SPLIT.nTrain} points; the number is its accuracy on ${SPLIT.nTest} new ones. The best designed representation in each column is outlined. Hover a cell to see it in feature space.` }),
      h('div', { class: 'hero-actions' }, applyAll())));
  const grid = h('div', { class: 'mgrid', role: 'table', 'aria-label': 'Accuracy of each representation on each dataset' });
  grid.append(h('div', { class: 'mcorner', role: 'columnheader' }, h('span', { class: 'hint' }, 'Φ ↓   data →')));
  for (const D of MATCH.datasets) grid.append(h('div', { class: 'mhead', role: 'columnheader' }, D.name));
  const cells = [], jobs = [];
  MATCH.reps.forEach((rep, r) => {
    const exh = byId(rep.exhibit);
    grid.append(h('div', { class: `mrow-head${rep.generic ? ' generic' : ''}`, role: 'rowheader' },
      h('div', { html: tex(`\\Phi = ${rep.tex}`) }), h('a', { href: `#${exh.id}` }, `${exh.name} exhibit →`)));
    MATCH.datasets.forEach((D, c) => {
      const box = h('div', { class: 'plot-box' }), acc = h('div', { class: 'acc' }, '…');
      const cell = h('div', { class: `mcell${rep.generic ? ' generic' : ''}`, role: 'cell', tabindex: 0 }, box, acc);
      const p = new MorphPlot(box, { thumb: true });
      live.push(p);
      hoverMorph(cell, p);
      grid.append(cell);
      const rec = { r, c, cell, acc: null, generic: !!rep.generic };
      cells.push(rec);
      jobs.push(() => {
        const f = fitCase({ key: `match|${rep.exhibit}|${D.ds}`, ds: D.ds, params: D.params, features: rep.features });
        p.set(geometry(f, 'thumb'));
        rec.acc = f.model.test.acc;
        acc.innerHTML = `${pct0(rec.acc)}<span class="d"> · ${plural(f.model.d, 'feature')}</span>`;
        cell.classList.toggle('good', rec.acc >= 0.95);
        cell.setAttribute('aria-label', `${exh.name} representation on ${D.name}: ${pct0(rec.acc)}`);
      });
    });
  });
  jobs.push(() => {
    // outline the best designed representation in each column
    MATCH.datasets.forEach((_, c) => {
      const col = cells.filter((x) => x.c === c && !x.generic), top = Math.max(...col.map((x) => x.acc));
      col.forEach((x) => x.cell.classList.toggle('best', x.acc >= top - 1e-9));
    });
    page.dataset.ready = '1';
  });
  page.append(h('div', { class: 'mscroll' }, grid),
    h('section', { class: 'card takeaways' },
      h('h2', {}, 'What to take away'),
      h('ol', { html: [
        '<b>The model never changed.</b> Every boundary in this gallery is \\(w_0 + w^\\top z = 0\\): a straight line, or a flat plane, in feature space.',
        '<b>The representation did the work.</b> The right \\(\\Phi\\) turns a hard problem into an easy one, often with one or two features. The wrong \\(\\Phi\\) does not help, however good the model.',
        '<b>Good representations come from three places:</b> knowledge of the problem (distances, cycles, logs, interactions); generic families (polynomials, bumps, hinges), which need many features; or learning \\(\\Phi\\) from the data, which is what neural networks do.',
      ].map((s) => `<li>${s}</li>`).join('') })));
  renderMath(page);
  viewEl.append(page);
  queue(jobs);
}

// ---------- routing ----------

function route() {
  const id = location.hash.slice(1);
  clearView();
  plot = null; ex = null; fc = null; allT = 0;
  const target = byId(id);
  navHall.setAttribute('aria-current', String(!target && id !== 'match'));
  navMatch.setAttribute('aria-current', String(id === 'match'));
  if (target) { renderExhibit(target); document.title = `${target.name} · Feature Transform Gallery`; }
  else if (id === 'match') { renderMatch(); document.title = 'Finale · Feature Transform Gallery'; }
  else { renderHall(); document.title = 'Feature Transform Gallery'; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (!ex) return;
  const i = EXHIBITS.indexOf(ex), N = EXHIBITS.length;
  if (e.key === 'ArrowRight') location.hash = EXHIBITS[(i + 1) % N].id;
  else if (e.key === 'ArrowLeft') location.hash = EXHIBITS[(i + N - 1) % N].id;
  else if (e.key === 'Escape') location.hash = '';
  else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'r' || e.key === 'R') setView({ rawLine: !view.rawLine });
  else if (e.key === 'g' || e.key === 'G') setView({ mesh: !view.mesh });
});

// ---------- theme ----------

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : mq.matches; };
function redrawAll() {
  refreshTheme();
  LIVE_PLOTS.forEach((p) => p.draw());
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
window.gallery = {
  exhibits: EXHIBITS, get plot() { return plot; }, get fit() { return fc; }, get live() { return live; },
  togglePlay, setView, setKnob: (v) => { if (ui && ui.knob) ui.knob.set(v); setKnob(v); }, theme,
};
