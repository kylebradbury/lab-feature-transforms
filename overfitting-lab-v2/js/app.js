// Overfitting Lab v2: training accuracy vs. held-out accuracy.
//   #               landing: how a challenge works, the stations
//   #lr-circles …   six challenges (logistic regression, then KNN, on circles, moons, sine):
//                   reach a held-out goal at a marked noise level; the held-out
//                   points, the rule and the full map unlock once it is met
//   #resample       new training sets, same held-out set: bias and variance
//   #report         reflections and the report to copy

import { CHALLENGES, ETAS, SETTINGS, N_TRAIN, N_HELD, VIEW, MAX_RESAMPLES, result, peek, gridOf, trainAt, trainBase, heldAt, heldBase, resampleStats } from './engine.js';
import { DATA } from './data.js';
import { ruleSegs } from './truth.js';
import { XPlot, refreshTheme, theme, LIVE_PLOTS } from './plot2d.js';
import { marchingSquares } from './geometry.js';
import { CurveChart, ExploreMap, AccStrip } from './charts.js';
import { sweep } from './sweep.js';
import { h, tex, renderMath, fmt, pct, store, copyText, escapeHtml } from './ui.js';
import * as TXT from './stations.js';

const T0 = refreshTheme();
const NAME = T0.names; // class names used in text (from the theme)
const KEY = 'overfitv2:';
const STEPS = [...CHALLENGES.map((c) => c.id), 'resample', 'report'];
const byId = (id) => CHALLENGES.find((c) => c.id === id);
const SHOWN = Array.from({ length: 300 }, (_, j) => Math.floor((j * N_HELD) / 300)); // held-out points drawn on the plot
const pc = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)} %` : '–');
const etaFmt = (v) => v.toFixed(2);
const settingLabel = (model, v) => (model === 'lr' ? `degree ${v}` : `k = ${v}`);

// ---------- saved state ----------

const saved = store(`${KEY}state`) || {};
const S = {};
for (const ch of CHALLENGES) S[ch.id] = { si: 0, j: 0, visited: [], goalMet: false, sub: null, show: { held: false, rule: false, full: false }, ...(saved[ch.id] || {}) };
S.resample = { ds: 'moons', model: 'lr', si: { moons: 10, sine: 6 }, j: { lr: 2, knn: 7 }, R: 1, ...(saved.resample || {}) };
const reflect = store(`${KEY}reflect`) || {};
let studentName = store(`${KEY}name`) || '';
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => store(`${KEY}state`, S), 150); }

// ---------- shell ----------

const root = document.getElementById('app');
const themeBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode' }, '◐', h('span', { class: 'lbl' }, ' Theme'));
const helpBtn = h('button', { class: 'icon-btn', type: 'button', title: 'How this lab works' }, '?', h('span', { class: 'lbl' }, ' Help'));
const reportCount = h('span', { class: 'count' });
const reportBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Your submitted results and reflections, ready to copy' }, '📋', h('span', { class: 'lbl' }, ' My report'), ' ', reportCount);
const resetLabBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Erase all progress in this browser and start the lab over', 'aria-label': 'Reset lab' }, '↺', h('span', { class: 'lbl' }, ' Reset lab'));
const prevBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Previous station' }, '‹');
const nextBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Next station' }, '›');
const dots = h('div', { class: 'dots' });
const dotBtns = STEPS.map((id, i) => {
  if (i === 3 || i === 6) dots.append(h('span', { class: 'dots-sep', 'aria-hidden': 'true' }));
  const b = h('button', { class: 'dot', type: 'button' }, stepLabel(id, i));
  b.addEventListener('click', () => { location.hash = id; });
  dots.append(b);
  return b;
});
function stepLabel(id) { const ch = byId(id); return ch ? TXT.challengeNumber(ch) : id === 'resample' ? '3' : '✎'; }
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));
root.append(
  h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#' }, 'Overfitting Lab', h('small', {}, 'IDS 705 · training vs. held-out')),
    h('nav', { class: 'stepper', 'aria-label': 'Stations' }, prevBtn, dots, nextBtn),
    h('div', { class: 'spacer' }), reportBtn, resetLabBtn, themeBtn, helpBtn),
  h('div', { id: 'view' }),
  h('footer', { class: 'site-foot' },
    '© 2026 ', h('a', { href: 'https://kylebradbury.com/', target: '_blank', rel: 'noopener' }, 'Kyle Bradbury'),
    '. Designed by Kyle Bradbury, built with Claude.'));
const viewEl = document.getElementById('view');

const stepName = (id) => (byId(id) ? `${TXT.challengeNumber(byId(id))}. ${TXT.challengeName(byId(id))}` : id === 'resample' ? '3. Resampling' : 'Report');
function stepDone(id) {
  if (byId(id)) return S[id].goalMet;
  if (id === 'resample') return S.resample.R >= 10;
  return TXT.REFLECT.every((_, i) => reflect[i] && reflect[i].trim());
}
function syncStepper() {
  const i = STEPS.indexOf(location.hash.slice(1));
  dotBtns.forEach((b, k) => {
    const id = STEPS[k], done = stepDone(id);
    b.setAttribute('aria-current', String(k === i));
    b.classList.toggle('met', done);
    b.title = `${stepName(id)}${done ? ' (done)' : ''}`;
  });
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i === STEPS.length - 1;
  reportCount.textContent = `${CHALLENGES.filter((c) => S[c.id].sub).length}/${CHALLENGES.length}`;
}
function step(d) {
  const i = STEPS.indexOf(location.hash.slice(1)), j = i < 0 ? (d > 0 ? 0 : -1) : i + d;
  if (j >= 0 && j < STEPS.length) location.hash = STEPS[j];
}

let live = [], token = 0, cur = null;
function clearView() {
  if (cur && cur.sweep) cur.sweep.cancel();
  if (cur && cur.tween) cancelAnimationFrame(cur.tween);
  live.forEach((p) => p.destroy());
  live = []; token++; cur = null;
  viewEl.innerHTML = '';
}
function queue(jobs) {
  const my = token, next = () => { if (my !== token || !jobs.length) return; jobs.shift()(); setTimeout(next, 0); };
  setTimeout(next, 0);
}

// ---------- shared controls ----------

// A slider over a list of values, with tick marks and an optional highlighted goal tick.
function tickSlider({ label, values, fmt: f, value, goal = null, onInput, endLabels = null }) {
  const n = values.length;
  const input = h('input', { type: 'range', min: 0, max: n - 1, step: 1, 'aria-label': label });
  const valEl = h('span', { class: 'v' });
  const ticks = h('div', { class: 'ticks', 'aria-hidden': 'true' }, ...values.map((_, i) => h('span', { class: `tick${i === goal ? ' goal' : ''}`, style: { left: `${(100 * i) / (n - 1)}%` } })));
  const set = (i) => { input.value = String(i); valEl.textContent = f(values[i]); };
  input.addEventListener('input', () => { set(+input.value); onInput(+input.value); });
  set(value);
  const el = h('div', { class: 'ctl tick-slider' }, h('label', {}, h('span', { html: label }), valEl), h('div', { class: 'track-wrap' }, input, ticks),
    endLabels ? h('div', { class: 'ends' }, h('span', {}, endLabels[0]), goal !== null ? h('span', { class: 'goal-lab', style: { left: `${(100 * goal) / (n - 1)}%` } }, `▲ goal ${f(values[goal])}`) : null, h('span', {}, endLabels[1])) : null);
  return { el, input, set };
}
function toggle(label, title, on, set) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!on;
  input.addEventListener('change', () => set(input.checked));
  const lock = h('span', { class: 'lock', hidden: true }, '🔒');
  const el = h('label', { title }, input, lock, label);
  return { el, input, lock, title };
}
function seg(options, value, set, label) {
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), html: o.label });
    b.addEventListener('click', () => { btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); set(o.value); });
    return b;
  });
  return h('div', { class: 'seg', role: 'group', 'aria-label': label }, ...btns);
}
function tiles(items) {
  return items.map((t) => `<div class="stat${t.cls ? ` ${t.cls}` : ''}" title="${escapeHtml(t.title || '')}"><div class="lab">${t.lab}</div><div class="val${t.small ? ' small' : ''}">${t.val}</div>${t.note ? `<div class="note">${t.note}</div>` : ''}</div>`).join('');
}
function legend(items) {
  const sw = {
    c0: () => h('span', {}, h('span', { class: `sw c0 ${T0.shape0}` }), `class 0 (${NAME[0]})`),
    c1: () => h('span', {}, h('span', { class: `sw c1 ${T0.shape1}` }), `class 1 (${NAME[1]})`),
    held: () => h('span', {}, h('span', { class: 'sw hollow' }), 'held-out points'),
    fit: () => h('span', {}, h('span', { class: 'sw line' }), 'boundary'),
    fits: () => h('span', {}, h('span', { class: 'sw line thin' }), 'boundary of an earlier training set'),
    newest: () => h('span', {}, h('span', { class: 'sw line' }), 'newest training set'),
    rule: () => h('span', {}, h('span', { class: 'sw dashline' }), 'rule that generated the data'),
  };
  return h('div', { class: 'legend' }, ...items.map((k) => sw[k]()));
}
function definitions(items) {
  const el = h('div', {}, h('div', { class: 'defs-title' }, 'Definitions'), h('ul', { html: items.map((d) => `<li>${d}</li>`).join('') }));
  renderMath(el);
  return el.innerHTML;
}
const ruleGhost = (ds) => { const r = ruleSegs(ds, VIEW); return { segs: r.segs, G: r.G, dash: [8, 5], width: 1.8, alpha: 0.95 }; };
const heldShown = (ds, si) => ({ X: Float64Array.from(SHOWN.flatMap((i) => [heldAt(ds, si)[2 * i], heldAt(ds, si)[2 * i + 1]])), y: Uint8Array.from(SHOWN.map((i) => heldBase(ds).y[i])) });

// Draw a fit: shading and boundary, the training points (sliding from their previous
// positions when the noise changed), and the optional held-out points and rule.
function drawFit(c, res, X, y, { held = null, rule = false } = {}) {
  const grid = gridOf(res, 120), segs = marchingSquares(grid.V, grid.G), ghosts = rule ? [ruleGhost(res.ds)] : [];
  const render = (Xt) => c.plot.render({ grid, segs, shade: 'prob', ghosts, points: [...(held ? [{ ...held, hollow: true, name: 'held' }] : []), { X: Xt, y, name: 'training' }] });
  if (c.tween) cancelAnimationFrame(c.tween);
  const from = c.lastX && c.lastX.length === X.length && c.lastDs === res.ds ? c.lastX : null;
  c.lastX = X; c.lastDs = res.ds;
  if (!from || from === X || matchMedia('(prefers-reduced-motion: reduce)').matches) { render(X); return; }
  const t0 = performance.now(), Xt = new Float64Array(X.length);
  const stepT = () => {
    const f = Math.min(1, (performance.now() - t0) / 200), e = f * (2 - f);
    for (let i = 0; i < X.length; i++) Xt[i] = from[i] + (X[i] - from[i]) * e;
    render(f < 1 ? Xt : X);
    if (f < 1) c.tween = requestAnimationFrame(stepT); else c.tween = 0;
  };
  c.tween = requestAnimationFrame(stepT);
}

// ---------- a challenge ----------

function renderChallenge(ch) {
  const s = S[ch.id], settings = SETTINGS[ch.model], i = STEPS.indexOf(ch.id), part = TXT.PARTS.find((p) => p.id === ch.part);
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  const nav = h('nav', { class: 'ex-nav', 'aria-label': 'Stations' },
    h('a', { class: 'btn', href: '#' }, '← All stations'),
    h('span', { class: 'where' }, `${part.name} · challenge ${TXT.challengeNumber(ch)}`),
    h('span', { class: 'spacer' }),
    prev ? h('a', { class: 'btn', href: `#${prev}`, title: '(←)' }, `‹ ${stepName(prev)}`) : null,
    next ? h('a', { class: 'btn', href: `#${next}`, title: '(→)' }, `${stepName(next)} ›`) : null);

  // stage: the plot, its toggles, the accuracy-vs-setting chart
  const chip = h('span', { class: 'acc-chip' }), box = h('div', { class: 'plot-box' }), optsEl = h('span', { class: 'opts' }), legendEl = h('div');
  const chartNote = h('span', { class: 'hint' }), chartBox = h('div', { class: 'chart-box curve-box' });
  const stage = h('section', { class: 'card stage' },
    h('div', { class: 'plot-title' }, h('span', { class: 'ptitle', html: `<b>${DATA[ch.ds].name}</b> · ${TXT.MODEL_NAME[ch.model]}` }), chip),
    h('div', { class: 'stage-wrap' }, box),
    h('div', { class: 'stage-opts' }, optsEl, legendEl),
    h('div', { class: 'chart-head' }, h('span', {}, h('b', {}, `Accuracy vs. ${TXT.SETTING_NAME[ch.model]}`), ' ', chartNote), h('div', { class: 'legend chart-legend' }, h('span', {}, h('span', { class: 'sw curve train' }), 'training'), h('span', {}, h('span', { class: 'sw curve test' }), 'held-out'))),
    chartBox);

  // side: goal and settings (sticky), the maps, what this dataset shows, the model, how it works
  const goalStatus = h('div', { class: 'goal-status', 'aria-live': 'polite' });
  const noise = tickSlider({ label: 'Noise η', values: ETAS, fmt: etaFmt, value: s.si, goal: ch.goalSi, endLabels: ['clean', 'noisy'], onInput: (k) => { s.si = k; update(); } });
  const flex = tickSlider({
    label: ch.model === 'lr' ? 'Polynomial degree' : 'Neighbors k', values: settings, fmt: (v) => (ch.model === 'lr' ? String(v) : `k = ${v}`), value: s.j,
    endLabels: ch.model === 'lr' ? ['degree 1 (simplest)', 'degree 10 (most flexible)'] : ['k = 199 (simplest)', 'k = 1 (most flexible)'], onInput: (k) => { s.j = k; update(); },
  });
  const readEl = h('div', { class: 'readouts' });
  const submitBtn = h('button', { class: 'btn primary', type: 'button' });
  const subStatus = h('div', { class: 'status', hidden: true });
  const settingsCard = h('section', { class: 'card knob goal-card' },
    h('div', { class: 'goal' }, h('span', { class: 'kicker' }, 'Goal'), h('p', { class: 'goal-text' }, TXT.goalText(ch)), goalStatus),
    noise.el, flex.el, readEl, h('div', { class: 'btn-row' }, submitBtn), subStatus);
  const trainMapBox = h('div', { class: 'chart-box map-box' }), heldMapBox = h('div', { class: 'chart-box map-box' });
  const mapsCard = h('section', { class: 'card maps' },
    h('h2', {}, 'Every setting you have tried'),
    h('p', { class: 'hint' }, `Rows: noise η (clean at the top; the goal row is outlined). Columns: ${ch.model === 'lr' ? 'degree' : 'k, most flexible on the right'}. Each cell shows the accuracy in % once you have tried it; click a cell to go there.`),
    h('div', { class: 'map-pair' }, h('div', {}, h('div', { class: 'map-title' }, 'Training accuracy'), trainMapBox), h('div', {}, h('div', { class: 'map-title' }, 'Held-out accuracy'), heldMapBox)),
    h('div', { class: 'map-scale', 'aria-hidden': 'true' }, h('span', {}, '50 %'), h('span', { class: 'ramp' }), h('span', {}, '100 %')));
  const lessonEl = h('p', {}), lessonCard = h('section', { class: 'card lesson' }, h('h2', {}, { circles: 'What the circles show', moons: 'What the moons show', sine: 'What the sine wave shows' }[ch.ds]), lessonEl);
  const eqEl = h('div', { class: 'eqs' }), chosenEl = h('div', { class: 'chosen' }), defsEl = h('div', { class: 'defs' });
  const side = h('aside', { class: 'ex-side' },
    h('header', { class: 'ex-title' }, h('span', { class: 'fam' }, part.name), h('h1', {}, `${TXT.challengeNumber(ch)}. ${TXT.challengeName(ch)}`), h('p', { class: 'lead' }, TXT.lead(ch))),
    settingsCard, mapsCard, lessonCard,
    h('section', { class: 'card model' }, h('h2', {}, 'The model'), eqEl),
    h('section', { class: 'card about' }, h('h2', {}, 'How it works'), h('p', { class: 'how' }, TXT.HOW[ch.model]), chosenEl, defsEl));
  const page = h('main', { class: 'exhibit station', 'data-station': ch.id }, nav, h('div', { class: 'ex-grid' }, stage, side));
  viewEl.append(page);

  const plot = new XPlot(box, { outerLabels: true }), chart = new CurveChart(chartBox, { xLabel: ch.model === 'lr' ? 'degree' : 'k (fewer neighbors = more flexible →)' });
  const cellTip = (i2, j2) => {
    const r = peek(ch.model, ch.ds, i2, settings[j2]), seen = s.visited.includes(`${i2},${j2}`) || s.show.full;
    return `noise ${etaFmt(ETAS[i2])} · ${settingLabel(ch.model, settings[j2])}<br>${r && seen ? `training <b>${pc(r.train)}</b> · held-out <b>${pc(r.held)}</b>` : 'not tried yet'}`;
  };
  const pick = (i2, j2) => { s.si = i2; s.j = j2; noise.set(i2); flex.set(j2); update(); };
  const trainMap = new ExploreMap(trainMapBox, { rowFmt: etaFmt, colFmt: String, onPick: pick, tipFmt: cellTip });
  const heldMap = new ExploreMap(heldMapBox, { rowFmt: etaFmt, colFmt: String, onPick: pick, tipFmt: cellTip });
  live.push(plot, chart, trainMap, heldMap);
  const tHeld = toggle('held-out points', 'Show 300 of the 1000 held-out points (hollow)', s.show.held, (v) => { s.show.held = v; update(); });
  const tRule = toggle('rule that generated the data', 'The line halfway across the empty gap in the clean data (dashed)', s.show.rule, (v) => { s.show.rule = v; update(); });
  const tFull = toggle('fill in every setting', 'Compute and show every cell of both maps and both curves', s.show.full, (v) => { s.show.full = v; update(); startSweep(); });
  optsEl.append(tHeld.el, tRule.el, tFull.el);
  submitBtn.addEventListener('click', () => {
    const res = result(ch.model, ch.ds, s.si, settings[s.j]);
    s.sub = { si: s.si, setting: settings[s.j], train: res.train, held: res.held, met: s.si === ch.goalSi && res.heldCorrect >= ch.T, at: new Date().toISOString() };
    save(); syncStepper(); update();
    subStatus.innerHTML = '';
    const link = h('a', { href: '#report' }, 'View the report');
    subStatus.append(`Submitted: noise ${etaFmt(ETAS[s.si])}, ${settingLabel(ch.model, settings[s.j])}, held-out ${pc(res.held)}${s.sub.met ? ' (goal met)' : ''}. `, link);
    subStatus.hidden = false;
  });

  const c = { ch, s, settings, page, plot, chart, trainMap, heldMap, noise, flex, goalStatus, readEl, submitBtn, chip, legendEl, chartNote, lessonEl, lessonCard, eqEl, chosenEl, defsEl, toggles: [tHeld, tRule, tFull], sweep: null };
  cur = c;

  // Fill in the cells tried before (they are not computed after a reload), and every cell when asked.
  function startSweep() {
    if (c.sweep) c.sweep.cancel();
    delete page.dataset.ready;
    const cells = [];
    for (const key of s.visited) { const [a, b] = key.split(',').map(Number); cells.push([a, b]); }
    if (s.show.full && s.goalMet) for (let a = 0; a < ETAS.length; a++) for (let b = 0; b < settings.length; b++) cells.push([a, b]);
    const jobs = cells.filter(([a, b]) => !peek(ch.model, ch.ds, a, settings[b])).map(([a, b]) => () => result(ch.model, ch.ds, a, settings[b]));
    c.sweep = sweep(jobs, { onProgress: () => drawCharts(c), onDone: () => { drawCharts(c); page.dataset.ready = '1'; } });
  }
  c.startSweep = startSweep;
  update();
  startSweep();
}

function update() {
  const c = cur;
  if (!c || !c.ch) return;
  const { ch, s, settings } = c, setting = settings[s.j], res = result(ch.model, ch.ds, s.si, setting);
  const key = `${s.si},${s.j}`;
  if (!s.visited.includes(key)) s.visited.push(key);
  if (!s.goalMet && s.si === ch.goalSi && res.heldCorrect >= ch.T) s.goalMet = true;
  const met = s.goalMet;
  // plot
  drawFit(c, res, trainAt(ch.ds, s.si), trainBase(ch.ds).y, { held: met && s.show.held ? heldShown(ch.ds, s.si) : null, rule: met && s.show.rule });
  c.plot.onHover = (x1, x2, near) => (near ? `${near.name === 'held' ? 'held-out point' : 'training point'}, class <b>${NAME[near.label]}</b>` : `x = (${fmt(x1)}, ${fmt(x2)})`);
  c.legendEl.replaceChildren(legend(['c0', 'c1', 'fit', ...(met && s.show.held ? ['held'] : []), ...(met && s.show.rule ? ['rule'] : [])]));
  for (const t of c.toggles) {
    t.input.disabled = !met; t.lock.hidden = met;
    t.el.title = met ? t.title : 'Reach the held-out goal to unlock this';
  }
  // goal status, readouts, submit
  const atGoal = s.si === ch.goalSi;
  c.goalStatus.className = `goal-status${met ? ' met' : ''}`;
  c.goalStatus.innerHTML = met ? '✓ Goal met. The held-out points, the rule and the full maps are unlocked (under the plot).'
    : atGoal ? `At the goal noise: held-out ${pc(res.held)}, the goal is ${(ch.T / 10).toFixed(1)} %. ${res.heldCorrect >= ch.T ? '' : 'Not yet.'}`
      : `The noise is ${etaFmt(ETAS[s.si])}; the goal is at ${etaFmt(ETAS[ch.goalSi])} (▲). Explore freely, then set the noise to the goal level.`;
  c.readEl.innerHTML = tiles([
    { lab: 'Training accuracy', val: pc(res.train) },
    { lab: 'Held-out accuracy', val: pc(res.held), cls: atGoal && res.heldCorrect >= ch.T ? 'ok' : '' },
    { lab: 'Gap (training − held-out)', val: `${(100 * (res.train - res.held)).toFixed(1)} pts`, small: true },
    ch.model === 'lr' ? { lab: 'Weights · training points', val: `${res.d + 1} · ${N_TRAIN}`, small: true } : { lab: 'Neighbors k · training points', val: `${setting} · ${N_TRAIN}`, small: true },
  ]);
  c.chip.innerHTML = `noise ${etaFmt(ETAS[s.si])} · ${settingLabel(ch.model, setting)} · training <b>${pc(res.train)}</b> · held-out <b>${pc(res.held)}</b>`;
  c.submitBtn.textContent = s.sub ? 'Resubmit to the report' : 'Submit to the report';
  c.submitBtn.title = 'Record the current noise, setting and accuracies in your report (submitting again replaces the row)';
  // after the goal
  c.lessonCard.hidden = !met;
  if (met) c.lessonEl.textContent = TXT.lesson(ch);
  // the model and how it works
  c.eqEl.innerHTML = '';
  const eq = ch.model === 'lr'
    ? `<div class="eq-row"><div class="lab">The features, degree ${setting}</div><div class="math">${tex(setting === 1 ? 'z = (x_1,\\ x_2)' : `z = \\big(x_1^i x_2^j : 1 \\le i + j \\le ${setting}\\big)`)}</div><div class="note">${res.d} features, so ${res.d + 1} weights fit to ${N_TRAIN} training points.</div></div><div class="eq-row"><div class="lab">The model</div><div class="math">${tex('P(\\text{class 1} \\mid x) = \\sigma(w_0 + w_1 z_1 + \\dots + w_d z_d)')}</div><div class="note">The boundary is where \\(w_0 + w^\\top z = 0\\).</div></div>`
    : `<div class="eq-row"><div class="lab">The model, k = ${setting}</div><div class="math">${tex(`\\hat y(x) = \\text{the class held by most of the } ${setting} \\text{ training points nearest to } x`)}</div><div class="note">The shading shows the share of the ${setting} neighbors in class 1; the boundary is where it crosses one half.</div></div>`;
  const eqDiv = h('div', { html: eq });
  renderMath(eqDiv);
  c.eqEl.append(eqDiv);
  c.chosenEl.innerHTML = `<b>Chosen by hand, not fit:</b> ${TXT.chosen(ch)}${res.guarded ? `<br><br><b>Numerical guard:</b> ${TXT.GUARD_NOTE}` : ''}`;
  c.defsEl.innerHTML = definitions(TXT.defs(ch.model));
  drawCharts(c);
  save(); syncStepper();
}

// The curve at the current noise and both maps, from computed cells only.
function drawCharts(c) {
  const { ch, s, settings } = c, seen = new Set(s.visited), full = s.goalMet && s.show.full;
  const get = (i, j) => ((seen.has(`${i},${j}`) || full) ? peek(ch.model, ch.ds, i, settings[j]) : null);
  const rows = ETAS.map((_, i) => settings.map((_, j) => get(i, j)));
  const vis = ETAS.map((_, i) => settings.map((_, j) => seen.has(`${i},${j}`)));
  const vals = (key) => rows.map((row) => row.map((r) => (r ? r[key] : NaN)));
  c.trainMap.set({ rows: ETAS, cols: settings, values: vals('train'), visited: vis, current: [s.si, s.j], goalRow: ch.goalSi });
  c.heldMap.set({ rows: ETAS, cols: settings, values: vals('held'), visited: vis, current: [s.si, s.j], goalRow: ch.goalSi });
  const row = rows[s.si];
  c.chart.set({
    xs: settings, marker: s.j, goal: s.si === ch.goalSi ? ch.T / N_HELD : null,
    series: [{ kind: 'train', ys: row.map((r) => (r ? r.train : NaN)), visited: vis[s.si] }, { kind: 'held', ys: row.map((r) => (r ? r.held : NaN)), visited: vis[s.si] }],
  });
  c.chartNote.textContent = `(noise ${etaFmt(ETAS[s.si])}; ${full ? 'every setting, the ones you tried in bold' : 'the settings you have tried'})`;
}

// ---------- resampling ----------

function renderResample() {
  const s = S.resample, i = STEPS.indexOf('resample');
  const nav = h('nav', { class: 'ex-nav', 'aria-label': 'Stations' },
    h('a', { class: 'btn', href: '#' }, '← All stations'), h('span', { class: 'where' }, TXT.PARTS[2].name), h('span', { class: 'spacer' }),
    h('a', { class: 'btn', href: `#${STEPS[i - 1]}` }, `‹ ${stepName(STEPS[i - 1])}`), h('a', { class: 'btn', href: '#report' }, 'Report ›'));
  const chip = h('span', { class: 'acc-chip' }), box = h('div', { class: 'plot-box' }), legendEl = h('div'), stripBox = h('div', { class: 'chart-box strip-box' });
  const stage = h('section', { class: 'card stage' },
    h('div', { class: 'plot-title' }, h('span', { class: 'ptitle', html: '<b>New training sets, same held-out set</b>' }), chip),
    h('div', { class: 'stage-wrap' }, box),
    h('div', { class: 'stage-opts' }, h('span'), legendEl),
    h('div', { class: 'chart-head' }, h('span', {}, h('b', {}, 'Held-out accuracy of each training set’s fit'), ' ', h('span', { class: 'hint' }, '(one dot per training set; the newest is larger)'))),
    stripBox);
  const dsEl = h('div'), modelEl = h('div'), noiseEl = h('div'), flexEl = h('div'), countEl = h('span', { class: 'hint' });
  const draw1 = h('button', { class: 'btn primary', type: 'button' }, 'Draw a new training set');
  const draw10 = h('button', { class: 'btn', type: 'button' }, 'Draw 10 more');
  const restart = h('button', { class: 'btn', type: 'button' }, 'Start over');
  const readEl = h('div', { class: 'readouts' });
  const side = h('aside', { class: 'ex-side' },
    h('header', { class: 'ex-title' }, h('span', { class: 'fam' }, TXT.PARTS[2].name), h('h1', {}, 'Resampling the training set'), h('p', { class: 'lead' }, TXT.RESAMPLE.lead)),
    h('section', { class: 'card knob' },
      h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Dataset'), dsEl), h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Model'), modelEl), noiseEl, flexEl,
      h('div', { class: 'btn-row' }, draw1, draw10, restart), countEl),
    h('section', { class: 'card' }, h('h2', {}, 'Across the training sets'), readEl),
    h('section', { class: 'card about' }, h('h2', {}, 'How it works'), h('p', { class: 'how' }, TXT.RESAMPLE.how), h('div', { class: 'defs', html: definitions(TXT.RESAMPLE.defs) })));
  const page = h('main', { class: 'exhibit station resample', 'data-station': 'resample' }, nav, h('div', { class: 'ex-grid' }, stage, side));
  viewEl.append(page);
  const plot = new XPlot(box, { outerLabels: true }), strip = new AccStrip(stripBox);
  live.push(plot, strip);
  const c = { resample: true, page, plot, strip, chip, legendEl, readEl, countEl, sweep: null };
  cur = c;

  const controls = () => {
    dsEl.replaceChildren(seg([{ value: 'moons', label: 'Two moons' }, { value: 'sine', label: 'Sine wave' }], s.ds, (v) => { s.ds = v; controls(); refit(); }, 'Dataset'));
    modelEl.replaceChildren(seg([{ value: 'lr', label: 'Logistic regression' }, { value: 'knn', label: 'KNN' }], s.model, (v) => { s.model = v; controls(); refit(); }, 'Model'));
    noiseEl.replaceChildren(tickSlider({ label: 'Noise η', values: ETAS, fmt: etaFmt, value: s.si[s.ds], endLabels: ['clean', 'noisy'], onInput: (k) => { s.si[s.ds] = k; refit(); } }).el);
    const settings = SETTINGS[s.model];
    flexEl.replaceChildren(tickSlider({
      label: s.model === 'lr' ? 'Polynomial degree' : 'Neighbors k', values: settings, fmt: (v) => (s.model === 'lr' ? String(v) : `k = ${v}`), value: s.j[s.model],
      endLabels: s.model === 'lr' ? ['degree 1', 'degree 10'] : ['k = 199', 'k = 1'], onInput: (k) => { s.j[s.model] = k; refit(); },
    }).el);
  };
  draw1.addEventListener('click', () => { s.R = Math.min(MAX_RESAMPLES, s.R + 1); refit(); });
  draw10.addEventListener('click', () => { s.R = Math.min(MAX_RESAMPLES, s.R + 10); refit(); });
  restart.addEventListener('click', () => { s.R = 1; refit(); });
  c.refit = refit;
  controls();
  refit();

  // Fit every training set (in slices), then draw all boundaries and the readouts.
  function refit() {
    if (c.sweep) c.sweep.cancel();
    delete page.dataset.ready;
    const si = s.si[s.ds], setting = SETTINGS[s.model][s.j[s.model]], R = s.R;
    draw1.disabled = draw10.disabled = R >= MAX_RESAMPLES;
    countEl.textContent = `${R} training set${R === 1 ? '' : 's'} of ${MAX_RESAMPLES} drawn.`;
    const jobs = Array.from({ length: R }, (_, r) => () => gridOf(result(s.model, s.ds, si, setting, r), 90));
    const paint = () => {
      const fits = [];
      for (let r = 0; r < R; r++) { const f = peek(s.model, s.ds, si, setting, r); if (f && (f.model === 'knn' || f.grids)) fits.push(f); else break; }
      if (!fits.length) return;
      const ghosts = fits.slice(0, -1).map((f) => { const g = gridOf(f, 90); return { segs: marchingSquares(g.V, 90), G: 90, dash: [], width: 1.2, alpha: 0.45 }; });
      const newest = fits[fits.length - 1], gN = gridOf(newest, 90);
      ghosts.push(ruleGhost(s.ds), { segs: marchingSquares(gN.V, 90), G: 90, dash: [], width: 2.6, alpha: 1 });
      plot.render({ grid: null, points: [{ X: trainAt(s.ds, si, fits.length - 1), y: trainBase(s.ds, fits.length - 1).y, name: 'training', alpha: 0.75 }], ghosts });
      plot.onHover = (x1, x2, near) => (near ? `training point (set ${fits.length}), class <b>${NAME[near.label]}</b>` : `x = (${fmt(x1)}, ${fmt(x2)})`);
      legendEl.replaceChildren(legend(['c0', 'c1', ...(fits.length > 1 ? ['fits'] : []), 'newest', 'rule']));
      const acc = fits.map((f) => f.held);
      strip.set({ acc, newest: fits.length - 1 });
      const mean = acc.reduce((a, b) => a + b, 0) / acc.length, sd = Math.sqrt(acc.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, acc.length - 1));
      const st = fits.length === R && R >= 5 ? resampleStats({ ds: s.ds, si, model: s.model, setting, R }) : null;
      readEl.innerHTML = tiles([
        { lab: 'Held-out accuracy, average', val: pc(mean) },
        { lab: 'Lowest – highest', val: `${pc(Math.min(...acc))} – ${pc(Math.max(...acc))}`, small: true, note: acc.length > 1 ? `standard deviation ${(100 * sd).toFixed(1)} pts` : 'draw more training sets' },
        { lab: 'Boundary movement (variance)', val: st ? pc(st.disagree) : '–', small: true, note: st ? 'share of held-out points two fits disagree on' : 'needs 5 training sets' },
        { lab: 'Consistent miss (bias)', val: st ? pc(st.miss) : '–', small: true, note: st ? 'held-out points ≥ 90 % of fits get wrong vs. the rule' : 'needs 5 training sets' },
      ]);
      chip.innerHTML = `${DATA[s.ds].name} · noise ${etaFmt(ETAS[si])} · ${settingLabel(s.model, setting)} · ${fits.length} training set${fits.length === 1 ? '' : 's'}`;
    };
    paint();
    c.sweep = sweep(jobs, { onProgress: paint, onDone: () => { paint(); page.dataset.ready = '1'; } });
    save(); syncStepper();
  }
}

// ---------- landing ----------

function renderLanding() {
  const page = h('main', { class: 'hall landing' },
    h('section', { class: 'hero' },
      h('h1', {}, TXT.LANDING.title),
      h('p', { class: 'lead', html: TXT.LANDING.lead }),
      h('ol', { class: 'steps', html: TXT.LANDING.steps.map((t) => `<li>${t}</li>`).join('') }),
      h('div', { class: 'hero-actions' }, h('a', { class: 'btn primary play', href: `#${STEPS[0]}` }, 'Start: challenge 1a →'))));
  const jobs = [];
  for (const part of TXT.PARTS) {
    const grid = h('div', { class: 'tiles' });
    const items = part.id === 3 ? [{ id: 'resample', name: 'Resampling the training set', ds: 'moons', si: 10, sub: 'Logistic regression or KNN, up to 30 training sets' }]
      : CHALLENGES.filter((c) => c.part === part.id).map((c) => ({ id: c.id, name: `${TXT.challengeNumber(c)}. ${TXT.challengeName(c)}`, ds: c.ds, si: c.goalSi, sub: TXT.goalText(c) }));
    for (const it of items) {
      const box = h('div', { class: 'plot-box' }), done = stepDone(it.id);
      grid.append(h('a', { class: 'tile', href: `#${it.id}` }, h('div', { class: 'tile-plot' }, box),
        h('div', { class: 'tile-cap' }, h('div', { class: 'tile-top' }, h('b', {}, it.name), done ? h('span', { class: 'fam' }, '✓ done') : null), h('div', { class: 'tile-lead' }, it.sub))));
      const plot = new XPlot(box, { thumb: true });
      live.push(plot);
      jobs.push(() => { plot.setView(VIEW); plot.render({ grid: null, points: [{ X: trainAt(it.ds, it.si), y: trainBase(it.ds).y }] }); });
    }
    page.append(h('section', { class: 'wing' }, h('h2', {}, part.name), h('p', { class: 'blurb' }, part.blurb), grid));
  }
  page.append(h('a', { class: 'finale-link card', href: '#report' }, h('span', { class: 'kicker' }, 'At the end'), h('b', {}, 'Your report'), h('span', {}, 'Three short reflections, then copy your report to submit it →')));
  renderMath(page);
  viewEl.append(page);
  queue(jobs);
}

// ---------- report ----------

const COLS = ['#', 'Challenge', 'Noise η', 'Setting', 'Training', 'Held-out', 'Goal', 'Goal met'];
function reportRows() {
  const rows = CHALLENGES.map((ch) => {
    const sub = S[ch.id].sub, goal = `≥ ${(ch.T / 10).toFixed(1)} % at η = ${etaFmt(ETAS[ch.goalSi])}`;
    if (!sub) return { cells: [TXT.challengeNumber(ch), TXT.challengeName(ch), '', 'not submitted', '', '', goal, ''], missing: true };
    return { met: sub.met, cells: [TXT.challengeNumber(ch), TXT.challengeName(ch), etaFmt(ETAS[sub.si]), settingLabel(ch.model, sub.setting), pc(sub.train), pc(sub.held), goal, sub.met ? '✓' : '✗'] };
  });
  TXT.REFLECT.forEach((q, i) => rows.push({ cells: [`R${i + 1}`, q, reflect[i] || ''], reflect: true, missing: !(reflect[i] && reflect[i].trim()) }));
  return rows;
}
function reportTable(rows, inline = false) {
  const st = inline ? ' style="border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top"' : '';
  return `<table class="answers"${inline ? ' style="border-collapse:collapse"' : ''}><thead><tr>${COLS.map((t) => `<th${st}>${t}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${r.missing ? ' class="missing"' : ''}>${r.reflect
    ? `<td${st}>${escapeHtml(r.cells[0])}</td><td${st} colspan="2">${escapeHtml(r.cells[1])}</td><td${st} colspan="5">${escapeHtml(r.cells[2] || 'not answered')}</td>`
    : r.cells.map((v, j) => `<td${st}${!inline && j === 7 && r.met ? ' class="met"' : ''}>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
async function copyReport(btn) {
  const r = reportRows(), title = `Overfitting Lab · ${studentName || '(no name)'} · ${new Date().toLocaleDateString()}`;
  const text = [title, COLS.join('\t'), ...r.map((x) => x.cells.join('\t'))].join('\n');
  const html = `<p><b>${escapeHtml(title)}</b></p>${reportTable(r, true)}`;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
  } catch {
    copyText(text);
  }
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = 'Copy report'; }, 1400);
}
function nameField() {
  const nameIn = h('input', { type: 'text', placeholder: 'Type your name', value: studentName, 'aria-label': 'Your name' });
  nameIn.addEventListener('input', () => { studentName = nameIn.value; store(`${KEY}name`, studentName); });
  return h('label', {}, 'Name ', nameIn);
}
function renderReport() {
  const tableEl = h('div', { class: 'ans-wrap' });
  const refresh = () => { tableEl.innerHTML = reportTable(reportRows()); };
  const ta = TXT.REFLECT.map((q, i) => {
    const t = h('textarea', { 'aria-label': q, rows: 4 });
    t.value = reflect[i] || '';
    t.addEventListener('input', () => { reflect[i] = t.value; store(`${KEY}reflect`, reflect); refresh(); syncStepper(); });
    return h('div', { class: 'exit-q' }, h('label', {}, h('b', {}, `${i + 1}. `), q), t);
  });
  const copyBtn = h('button', { class: 'btn primary', type: 'button' }, 'Copy report');
  copyBtn.addEventListener('click', () => copyReport(copyBtn));
  const page = h('main', { class: 'hall wrap report', 'data-station': 'report' },
    h('nav', { class: 'ex-nav' }, h('a', { class: 'btn', href: '#' }, '← All stations'), h('span', { class: 'spacer' }), h('a', { class: 'btn', href: '#resample' }, '‹ Resampling')),
    h('section', { class: 'hero' }, h('span', { class: 'kicker' }, 'Report'), h('h1', {}, 'Your report'), h('p', { class: 'lead' }, 'Each challenge you submitted, and three short reflections. When you are done, copy the report and paste it where your instructor asks (a document, the LMS, or a spreadsheet).')),
    h('section', { class: 'card exit' }, h('h2', {}, 'Reflections'), ...ta),
    h('section', { class: 'card' }, h('h2', {}, 'The report'), h('div', { class: 'ans-top' }, nameField(), h('span', { class: 'hint' }, `${CHALLENGES.filter((c) => S[c.id].sub).length} of ${CHALLENGES.length} challenges submitted · ${new Date().toLocaleDateString()}`)), tableEl, h('div', { class: 'btn-row' }, copyBtn)));
  refresh();
  viewEl.append(page);
  page.dataset.ready = '1';
}
function showReport() {
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const copyBtn = h('button', { class: 'btn primary', type: 'button' }, 'Copy report');
  copyBtn.addEventListener('click', () => copyReport(copyBtn));
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'My report' },
    h('div', { class: 'sheet wide' },
      h('header', {}, h('b', {}, 'My report · Overfitting Lab'), close),
      h('div', { class: 'ans-top' }, nameField(), h('span', { class: 'hint' }, `${CHALLENGES.filter((c) => S[c.id].sub).length} of ${CHALLENGES.length} submitted`)),
      h('div', { class: 'ans-wrap', html: reportTable(reportRows()) }),
      h('p', { class: 'hint' }, 'Submit each challenge from its page; the reflections are written on the Report page (last station).'),
      h('div', { class: 'btn-row' }, copyBtn, h('a', { class: 'btn', href: '#report' }, 'Go to the Report page'))));
  const dismiss = () => { modal.remove(); reportBtn.focus(); };
  close.addEventListener('click', dismiss);
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('a')) dismiss(); });
  document.body.append(modal);
  close.focus();
}
reportBtn.addEventListener('click', showReport);

// ---------- help, reset, theme, keys, routing ----------

const HELP = `
<p>Each challenge has one goal: a <b>held-out accuracy</b> to reach at a marked noise level. The held-out set is 1000 points from the same source as the 200 training points, never used for fitting.</p>
<ol>
  <li><b>Explore.</b> Start with clean data, then move the noise and the degree (or k) sliders. Every setting you try fills one cell in the two maps: training accuracy and held-out accuracy.</li>
  <li><b>Reach the goal</b> at the marked noise level (▲ on the noise slider). The held-out points on the plot, the rule that generated the data, and the full maps unlock once you do.</li>
  <li><b>Submit</b> your setting to the report. 📋 <b>My report</b> (top right) shows it; the last station adds three reflections and copies everything.</li>
</ol>
<p class="hint">Keys: ← → move between stations, Esc returns to the start. ↺ Reset lab erases everything this lab saved in this browser.</p>`;
function showHelp() {
  if (document.querySelector('.modal')) return;
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How this lab works' }, h('div', { class: 'sheet' }, h('header', {}, h('b', {}, 'How this lab works'), close), h('div', { html: HELP })));
  const done = () => { modal.remove(); helpBtn.focus(); };
  close.addEventListener('click', done);
  modal.addEventListener('click', (e) => { if (e.target === modal) done(); });
  document.body.append(modal);
  close.focus();
}
helpBtn.addEventListener('click', showHelp);

resetLabBtn.addEventListener('click', () => {
  const ok = window.confirm('Reset the whole lab?\n\nThis erases everything this lab has saved in this browser: the settings you tried, the goals you reached, your submitted results, your reflections and your name.\n\nThis cannot be undone.');
  if (!ok) return;
  clearTimeout(saveT);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(`ftlab:${KEY}`)) localStorage.removeItem(k); } catch { /* storage unavailable */ }
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
    if (document.querySelector('.modal')) { document.querySelectorAll('.modal').forEach((m) => m.remove()); return; }
    location.hash = '';
    return;
  }
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.querySelector('.modal')) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
});

function route() {
  const id = location.hash.slice(1);
  clearView();
  const ch = byId(id);
  if (ch) { renderChallenge(ch); document.title = `${TXT.challengeNumber(ch)}. ${TXT.challengeName(ch)} · Overfitting Lab`; }
  else if (id === 'resample') { renderResample(); document.title = 'Resampling · Overfitting Lab'; }
  else if (id === 'report') { renderReport(); document.title = 'Report · Overfitting Lab'; }
  else { renderLanding(); document.title = 'Overfitting Lab'; }
  syncStepper();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
if (!store(`${KEY}helpSeen`)) { store(`${KEY}helpSeen`, true); showHelp(); }

// for the console and tests
window.overfit2 = {
  challenges: CHALLENGES, state: S, reflect, get cur() { return cur; }, get live() { return live; },
  set(id, patch) {
    if (id === 'resample') { Object.assign(S.resample, patch); if (cur && cur.resample) { route(); } return; }
    Object.assign(S[id], patch); save();
    if (cur && cur.ch && cur.ch.id === id) { cur.noise.set(S[id].si); cur.flex.set(S[id].j); update(); cur.startSweep(); }
  },
  showReport, theme,
};
