// Shared module runtime: page layout (X-space plot, Z-space panel, readouts,
// walkthrough, controls, questions) plus reusable control builders.

import { h, tex, renderMath, slider, select, toggle, buttonRow, group, more, card, beatsCard, questionCard, stats, paramControls, fmt, pct, store } from '../ui.js';
import { XPlot, ZPanel, LineChart } from '../plot2d.js';
import { prepare, makeTrainer, evaluate, viewFor } from '../fit.js';
import { foldWeights } from '../features.js';
import { Scene, mergeCfg, defaultCfg } from '../scene.js';
import { DATASETS, datasetDefaults } from '../datasets.js';
import { TRANSFORMS, resolveParams } from '../features.js';

export function standardModule(def) {
  return { ...def, mount: (root, app) => mountStandard(def, root, app) };
}

function mountStandard(def, root, app) {
  const saved = app.moduleState(def.id);
  const answers = store(`answers:${def.id}`) || {};
  let cfg = saved && saved.cfg ? saved.cfg : mergeCfg(defaultCfg(), def.initial ? def.initial() : {});
  const fromLink = app.query && app.query.get('s') && def.shareQuery ? decodeState(app.query.get('s')) : null;
  if (fromLink) cfg = mergeCfg(defaultCfg(), fromLink);

  // ---- layout
  const main = h('div', { class: 'mod-main' });
  const side = h('div', { class: 'mod-side' });
  root.append(h('div', { class: 'mod' }, main, side));

  const box = h('div', { class: 'plot-box' });
  const xTitle = h('div', { class: 'plot-title' }, h('b', {}, 'X-space'), h('span', { class: 'xsub' }, 'original inputs x = (x₁, x₂)'));
  const legend = h('div', { class: 'legend' },
    h('span', {}, h('span', { class: 'sw c0' }), 'class 0 (blue)'), h('span', {}, h('span', { class: 'sw c1' }), 'class 1 (orange)'),
    h('span', {}, h('span', { class: 'sw hollow' }), 'test / validation point'), h('span', {}, h('span', { class: 'sw line' }), 'boundary P = 0.5'));
  const xCard = h('section', { class: 'card plot-card' }, xTitle, box, legend);
  const zCard = h('section', { class: 'card plot-card' });
  const vizRow = h('div', { class: 'viz-row' + (def.zpanel === false ? ' single' : '') }, xCard, def.zpanel === false ? null : zCard);
  const readouts = stats([
    { key: 'train', label: 'Train accuracy' },
    { key: 'test', label: def.valInsteadOfTest ? 'Validation accuracy' : 'Test accuracy' },
    { key: 'd', label: 'Features d' },
    { key: 'loss', label: 'Train cross-entropy', essential: false },
    { key: 'status', label: 'Boundary', wide: true, small: true },
  ]);
  const extrasEl = h('div', { class: 'extras', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  main.append(vizRow, readouts.el, extrasEl);

  const controlsCard = card('Controls');
  const plot = new XPlot(box, { axisLabels: (DATASETS[cfg.dataset.id].axisLabels) || ['x_1', 'x_2'] });
  const zp = def.zpanel === false ? null : new ZPanel(zCard, { onOpen3D: () => open3D(m) });

  const m = {
    def, app, plot, zp, extrasEl, readouts, vizRow, xCard, controlsEl: controlsCard.body, state: (saved && saved.extra) || (def.initialState ? def.initialState() : {}),
    get cfg() { return scene.cfg; },
    set(fn, level = 'model') { scene.update((c) => fn(c, m), level); },
    apply(fn) {
      if (fn) fn(scene.cfg, m);
      scene.lastInput = 0;
      scene.invalidate('data');
      plot.axisLabels = DATASETS[scene.cfg.dataset.id].axisLabels || ['x_1', 'x_2'];
      m.rebuild();
      if (m.extras && m.extras.onApply) m.extras.onApply();
    },
    rebuild() {
      const el = controlsCard.body;
      const open = [...el.querySelectorAll('details')].map((d) => d.open);
      el.innerHTML = '';
      scene.sync();
      def.controls && def.controls(m, el);
      [...el.querySelectorAll('details')].forEach((d, k) => { if (open[k]) d.open = true; });
      renderMath(el);
    },
  };

  const scene = new Scene({
    plot, zpanel: zp, cfg,
    onFrame: (sc) => {
      updateReadouts(m, sc);
      if (def.onFrame) def.onFrame(m, sc);
      if (m.extras && m.extras.update) m.extras.update(sc);
    },
  });
  m.scene = scene;
  scene.onHandleEnd = () => m.rebuild();

  // ---- side panel
  let beats = null;
  if (def.beats && def.beats.length) {
    beats = beatsCard(def.beats, {
      onApply: (b) => m.apply((c) => b.apply(c, m)),
      onEnd: () => app.nextModule(),
      onBegin: () => app.prevModule(),
      start: saved ? saved.beat || 0 : 0,
    });
    side.append(beats.el);
  }
  side.append(controlsCard.el);
  const qs = [];
  if (def.questions && def.questions.length) {
    const qc = card('Predict, then reveal');
    for (const q of def.questions) {
      qs.push(questionCard(q, {
        saved: answers[q.id],
        onSave: (s) => { answers[q.id] = s; store(`answers:${def.id}`, answers); },
        onReveal: () => { if (q.reveal) m.apply((c) => q.reveal(c, m)); },
      }));
      qc.body.append(qs[qs.length - 1].el);
    }
    side.append(qc.el);
  }
  if (def.inPractice) {
    const c = card('In practice', { details: true, cls: 'practice', open: true });
    c.body.append(h('div', { html: def.inPractice }));
    side.append(c.el);
  }
  if (def.why) {
    const c = card('Why it works', { details: true, cls: 'why' });
    c.body.append(h('div', { html: def.why }));
    side.append(c.el);
  }
  renderMath(side);

  if (def.extras) m.extras = def.extras(m, extrasEl) || null;

  if (beats && !saved && !fromLink) beats.go(0, true);
  else m.rebuild();

  return {
    keys: {
      next: () => beats && beats.next(),
      prev: () => beats && beats.prev(),
      reveal: () => { const q = qs.find((x) => !x.revealed); if (q) q.reveal(); },
      toggleTest: () => { if (def.hideTest) return; m.set((c) => { c.view.showTest = !c.view.showTest; }, 'paint'); m.rebuild(); },
    },
    shareQuery: def.shareQuery ? () => `s=${encodeState(def.shareQuery(m))}` : null,
    unmount() {
      app.saveModuleState(def.id, { cfg: structuredClone(scene.cfg), beat: beats ? beats.index : 0, extra: m.state });
      if (m.extras && m.extras.destroy) m.extras.destroy();
      scene.destroy();
      plot.destroy();
    },
  };
}

function updateReadouts(m, sc) {
  const r = m.readouts, M = sc.metrics;
  r.set('train', pct(M.train.acc));
  r.set('test', m.def.valInsteadOfTest ? pct(M.val.acc) : pct(M.test.acc));
  r.set('d', String(sc.prep.d));
  r.set('loss', fmt(M.train.loss, 3));
  const status = sc.busy ? '<span class="pill busy">fitting…</span>' : sc.cfg.fit.mode === 'manual' ? '<span class="pill">your weights</span>' : '<span class="pill">best fit</span>';
  const desc = m.def.describe ? m.def.describe(m, sc) : '';
  r.set('status', `${status} ${desc}`);
}

export function encodeState(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeState(str) {
  try { return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
}

async function open3D(m) {
  const { openZ3D } = await import('../plot3d.js');
  openZ3D(m.scene);
}

// ======================================================================
// Reusable control builders. Each takes the module runtime `m` and returns
// DOM nodes; they read the current cfg and write through m.set / m.apply.
// ======================================================================

export function datasetControl(m, ids, { label = 'Dataset', params = true, keys = null, essential, resample = true } = {}) {
  const cfg = m.cfg, out = [];
  out.push(select({
    label, essential,
    options: ids.map((id) => ({ value: id, label: DATASETS[id].label })),
    value: cfg.dataset.id,
    onChange: (id) => m.apply((c) => { c.dataset = { id, params: {} }; c.view.log = false; if (m.def.onDataset) m.def.onDataset(c, id, m); }),
  }).el);
  if (params) {
    const P = DATASETS[cfg.dataset.id].params, cur = { ...datasetDefaults(cfg.dataset.id), ...cfg.dataset.params };
    const sliders = [];
    for (const [k, s] of Object.entries(P)) {
      if (keys && !keys.includes(k)) continue;
      if (s.options) sliders.push(select({ label: s.label, options: s.options, value: cur[k], onChange: (v) => m.apply((c) => { c.dataset.params = { ...c.dataset.params, [k]: v }; }) }).el);
      else sliders.push(slider({ label: s.label, min: s.min, max: s.max, step: s.step, value: cur[k], onInput: (v) => m.set((c) => { c.dataset.params = { ...c.dataset.params, [k]: v }; }, 'data') }).el);
    }
    if (sliders.length) out.push(more(sliders, 'Dataset settings'));
  }
  if (resample) out.push(buttonRow([{ label: '🎲 New sample', title: 'Draw a new random sample (same rule)', onClick: () => m.set((c) => { c.seed += 1; }, 'data') }], { essential: false }));
  return out;
}

// presets: [{label, features, extra(cfg)}]
export function presetButtons(m, presets, { label = 'Feature map Φ', essential } = {}) {
  const cur = JSON.stringify(m.cfg.features.map((f) => f.id));
  return buttonRow(presets.map((p) => ({
    label: p.label,
    pressed: JSON.stringify(p.features.map((f) => f.id)) === cur,
    onClick: () => m.apply((c) => { c.features = structuredClone(p.features); if (p.extra) p.extra(c); }),
  })), { label, essential });
}

// Sliders for the params of feature #idx.
export function featureParams(m, idx, keys = null, { essential, labels } = {}) {
  const spec = m.cfg.features[idx];
  if (!spec) return [];
  return paramControls(spec, () => m.set(() => {}, 'features'), { keys, essential, labels });
}

export function lambdaControl(m, { essential = false } = {}) {
  return slider({
    label: 'Regularization \\(\\lambda\\)', min: 1e-5, max: 10, log: true, value: m.cfg.fit.lambda, essential,
    fmt: (v) => (v <= 1.01e-5 ? '≈ 0' : fmt(v, 4)),
    onInput: (v) => m.set((c) => { c.fit.lambda = v; }, 'model'),
  }).el;
}

export function sampleControls(m, { n = true, noise = true, essential = false, nMax = 500 } = {}) {
  const out = [];
  if (n) out.push(slider({ label: 'Training points n', min: 20, max: nMax, step: 10, int: true, value: m.cfg.split.nTrain, essential, onInput: (v) => m.set((c) => { c.split.nTrain = v; }, 'data') }).el);
  if (noise && DATASETS[m.cfg.dataset.id].params.noise) {
    const P = DATASETS[m.cfg.dataset.id].params.noise, cur = m.cfg.dataset.params.noise ?? P.default;
    out.push(slider({ label: P.label === 'noise' ? 'Noise' : P.label, min: P.min, max: P.max, step: P.step, value: cur, essential, onInput: (v) => m.set((c) => { c.dataset.params = { ...c.dataset.params, noise: v }; }, 'data') }).el);
  }
  return out;
}

export function viewToggles(m, which = ['test', 'mistakes'], { essential = false } = {}) {
  const v = m.cfg.view, out = [];
  if (which.includes('test')) out.push(toggle({ label: 'Show test points (hollow)', value: v.showTest, essential, onChange: (b) => m.set((c) => { c.view.showTest = b; }, 'paint') }).el);
  if (which.includes('mistakes')) out.push(toggle({ label: 'Ring misclassified points', value: v.mistakes, essential, onChange: (b) => m.set((c) => { c.view.mistakes = b; }, 'paint') }).el);
  if (which.includes('shade')) out.push(toggle({ label: 'Shade by class only (no probability)', value: v.shade === 'class', essential, onChange: (b) => m.set((c) => { c.view.shade = b ? 'class' : 'prob'; }, 'paint') }).el);
  return out;
}

/**
 * Fit-mode toggle (best fit vs. your own weights) + weight sliders + live equation.
 * opts: {range, biasRange, step}
 */
export function weightControls(m, { range = 3, biasRange = 6, step = 0.05, essential, showToggle = true } = {}) {
  const sc = m.scene, cfg = m.cfg, out = [];
  const d = sc.prep.d;
  if (showToggle) {
    out.push(buttonRow([
      { label: 'Best fit (logistic regression)', pressed: cfg.fit.mode === 'auto', onClick: () => m.apply((c) => { c.fit.mode = 'auto'; }) },
      { label: 'Set weights by hand', pressed: cfg.fit.mode === 'manual', onClick: () => m.apply((c) => { c.fit.mode = 'manual'; c.fit.w = snapWeights(sc, range, biasRange); }) },
    ], { essential, label: 'Who chooses w?' }));
  }
  if (cfg.fit.mode !== 'manual') return out;
  if (!cfg.fit.w || cfg.fit.w.length !== d + 1) cfg.fit.w = Array.from(sc.manualWeights());
  const cols = sc.prep.fmap.columns;
  const sl = [];
  for (let k = 0; k <= d && k <= 12; k++) {
    const lab = k === 0 ? '\\(w_0\\) (bias)' : `\\(w_{${k}}\\) on \\(${cols[k - 1].tex}\\)`;
    const r = k === 0 ? biasRange : range;
    sl.push(slider({ label: lab, min: -r, max: r, step, value: cfg.fit.w[k], essential, onInput: (v) => m.set((c) => { c.fit.w[k] = v; }, 'model') }).el);
  }
  out.push(...sl);
  out.push(buttonRow([
    { label: 'Snap to best fit', title: 'Fit, then rescale the weights so they fit the sliders (same boundary)', onClick: () => m.apply((c) => { c.fit.w = snapWeights(sc, range, biasRange); }) },
    { label: 'Flip all signs', title: 'Same boundary, classes swapped', onClick: () => m.apply((c) => { c.fit.w = c.fit.w.map((v) => -v); }) },
    { label: 'Sharper ×2', title: 'Multiply every weight by 2: same boundary, more confident probabilities', onClick: () => m.apply((c) => { c.fit.w = c.fit.w.map((v) => clampAbs(2 * v, Math.max(range, biasRange))); }) },
  ], { essential: false }));
  return out;
}
const clampAbs = (v, r) => Math.max(-r, Math.min(r, v));

// Best-fit weights rescaled by a positive constant so they fit slider ranges.
export function snapWeights(sc, range = 3, biasRange = 6) {
  const w = sc.fitNow();
  let s = 1;
  for (let k = 0; k < w.length; k++) {
    const r = k === 0 ? biasRange : range;
    if (Math.abs(w[k]) * s > r) s = r / Math.abs(w[k]);
  }
  return Array.from(w, (v) => Math.round(v * s * 100) / 100);
}

// Live equation of the boundary in raw features.
export function equationHtml(sc, maxTerms = 8) {
  const w = sc.wRaw, cols = sc.prep.fmap.columns, d = sc.prep.d;
  let s = `${fmt(w[0], 2)}`;
  for (let k = 1; k <= Math.min(d, maxTerms); k++) {
    const v = w[k], sign = v < 0 ? '-' : '+';
    s += ` ${sign} ${fmt(Math.abs(v), 2)}\\,${cols[k - 1].tex}`;
  }
  if (d > maxTerms) s += ` + \\cdots`;
  return tex(`${s} = 0`);
}

// Sliders for the shared center of all radial-type features.
export function centerControls(m, { essential = false } = {}) {
  const idx = m.cfg.features.findIndex((f) => TRANSFORMS[f.id].params.cx && TRANSFORMS[f.id].params.cy);
  if (idx < 0) return [];
  const p = resolveParams(m.cfg.features[idx]);
  const setAll = (k) => (v) => m.set((c) => {
    c.features.forEach((f) => { if (TRANSFORMS[f.id].params[k]) f.params = { ...resolveParams(f), [k]: v }; });
  }, 'features');
  return [
    slider({ label: 'Center \\(c_1\\)', min: -3, max: 3, step: 0.05, value: p.cx, essential, onInput: setAll('cx') }).el,
    slider({ label: 'Center \\(c_2\\)', min: -3, max: 3, step: 0.05, value: p.cy, essential, onInput: setAll('cy') }).el,
    h('div', { class: 'hint' }, 'Or drag the ⊕ handle on the plot.'),
  ];
}

/**
 * Accuracy vs. one feature parameter, refit on the current training sample.
 * opts: {title, xLabel, values, log, specIndex(cfg)->idx|-1, key, note}
 */
export function scanChart(m, el, opts) {
  const c = card(opts.title);
  const box = h('div', { class: 'chart-box' });
  const note = h('div', { class: 'hint' });
  c.body.append(box, note);
  el.append(c.el);
  const chart = new LineChart(box, { xLabel: opts.xLabel, xLog: !!opts.log, yRange: [0.4, 1], xFmt: opts.xFmt || ((v) => fmt(v, 2)) });
  let token = 0, timer = 0, sig = '';
  function run() {
    const cfg = m.cfg, idx = opts.specIndex(cfg), my = ++token;
    if (idx < 0) { c.el.hidden = true; return; }
    c.el.hidden = false;
    const split = m.scene.split, xs = opts.values, tr = xs.map(() => NaN), te = xs.map(() => NaN);
    const cur = resolveParams(cfg.features[idx])[opts.key];
    let i = 0;
    const stepFn = () => {
      if (my !== token) return;
      const t0 = performance.now();
      while (i < xs.length && performance.now() - t0 < 25) {
        const feats = structuredClone(cfg.features);
        feats[idx].params = { ...resolveParams(feats[idx]), [opts.key]: xs[i] };
        const prep = prepare(split, feats, { view: viewFor(cfg.dataset.id), featureSeed: cfg.featureSeed });
        const T = makeTrainer(prep, cfg.fit.lambda);
        T.run();
        const r = evaluate(prep, foldWeights(T.w, prep.std));
        tr[i] = r.train.acc; te[i] = r.test.acc; i++;
      }
      chart.set({ xs, series: [{ name: 'train', ys: tr, dash: true }, { name: 'test', ys: te, strong: true }], marker: cur });
      if (i < xs.length) setTimeout(stepFn, 0);
      else {
        let best = 0;
        te.forEach((v, j) => { if (v > te[best]) best = j; });
        note.innerHTML = (opts.note ? opts.note + ' ' : '') + `Best test accuracy at ${opts.xLabel.split(' ')[0]} ≈ ${chart.xFmt(xs[best])}.`;
      }
    };
    stepFn();
  }
  return {
    update(sc) {
      if (sc.busy) return;
      const cfg = m.cfg, idx = opts.specIndex(cfg);
      const feats = idx >= 0 ? cfg.features.map((f, k) => (k === idx ? { ...f, params: { ...resolveParams(f), [opts.key]: null } } : f)) : null;
      const cur = idx >= 0 ? resolveParams(cfg.features[idx])[opts.key] : null;
      const s2 = JSON.stringify([cfg.dataset, cfg.seed, cfg.split, feats, cfg.fit.lambda, cfg.featureSeed]);
      if (s2 !== sig) { sig = s2; clearTimeout(timer); timer = setTimeout(run, 300); }
      else if (chart.data && chart.data.marker !== cur) { chart.data.marker = cur; chart.draw(); }
    },
    destroy() { token++; clearTimeout(timer); chart.destroy(); },
  };
}

export function dlist(items) {
  return `<ul style="margin:4px 0;padding-left:18px">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

export { h, tex, renderMath, slider, select, toggle, buttonRow, group, more, card, fmt, pct, store, resolveParams, TRANSFORMS, DATASETS, viewFor };
