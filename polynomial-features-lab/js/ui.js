// UI kit: DOM helper, KaTeX helpers, controls, beats, predict-then-reveal cards,
// and the feature palette. Controls default to "essential" (visible in
// presentation mode); pass essential:false to hide them when presenting.

import { TRANSFORMS, FAMILIES, resolveParams } from './features.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const texCache = new Map();
export function tex(s, display = false) {
  const key = (display ? 'D' : 'I') + s;
  if (texCache.has(key)) return texCache.get(key);
  let out;
  try {
    out = window.katex ? window.katex.renderToString(s, { displayMode: display, throwOnError: false, strict: false }) : escapeHtml(s);
  } catch {
    out = escapeHtml(s);
  }
  if (texCache.size > 4000) texCache.clear();
  texCache.set(key, out);
  return out;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Render \( \) and $$ $$ math inside an element (single $ is NOT a delimiter,
// so dollar amounts stay literal).
export function renderMath(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }],
      throwOnError: false,
    });
  }
  return el;
}

export const isPresent = () => document.body.classList.contains('present');

export function fmt(v, digits = 2) {
  if (!Number.isFinite(v)) return '–';
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) return v.toExponential(1);
  return (+v.toFixed(digits)).toString();
}
export const pct = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}%` : '–');

function ess(el, essential) {
  if (essential === false) el.classList.add('non-essential');
  return el;
}

/**
 * Range slider. opts: {label, min, max, step, value, log, int, fmt, onInput, essential, hint}
 * label may contain \( \) math.
 */
export function slider(opts) {
  const { label, min, max, step = 0.01, log = false, int = false, onInput, essential, hint } = opts;
  const format = opts.fmt || ((v) => (int ? String(Math.round(v)) : fmt(v, 3)));
  const toPos = (v) => (log ? (Math.log(v / min) / Math.log(max / min)) * 1000 : v);
  const fromPos = (p) => {
    let v = log ? min * Math.pow(max / min, p / 1000) : p;
    if (int) v = Math.round(v);
    if (log) v = +v.toPrecision(3);
    return v;
  };
  const input = h('input', { type: 'range', min: log ? 0 : min, max: log ? 1000 : max, step: log ? 1 : step, 'aria-label': stripMath(label) });
  const val = h('span', { class: 'v' });
  let value = opts.value;
  const set = (v) => { value = v; input.value = toPos(v); val.textContent = format(v); };
  set(value);
  input.addEventListener('input', () => {
    value = fromPos(+input.value);
    val.textContent = format(value);
    onInput && onInput(value);
  });
  const el = ess(h('div', { class: 'ctl' }, h('label', {}, h('span', { html: label }), val), input, hint ? h('div', { class: 'hint', html: hint }) : null), essential);
  renderMath(el);
  return { el, set, get: () => value, input };
}

function stripMath(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/\\\(|\\\)/g, '');
}

export function select(opts) {
  const { label, options, value, onChange, essential, inline } = opts;
  const sel = h('select', { 'aria-label': stripMath(label || '') });
  for (const o of options) sel.append(h('option', { value: String(o.value) }, o.label));
  sel.value = String(value);
  sel.addEventListener('change', () => {
    const o = options.find((x) => String(x.value) === sel.value);
    onChange && onChange(o ? o.value : sel.value);
  });
  const el = ess(h('div', { class: inline ? 'ctl inline' : 'ctl' }, label ? h('span', { class: 'lab', html: label }) : null, sel), essential);
  renderMath(el);
  return { el, sel, set: (v) => { sel.value = String(v); } };
}

export function toggle(opts) {
  const { label, value, onChange, essential } = opts;
  const input = h('input', { type: 'checkbox' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange && onChange(input.checked));
  const el = ess(h('label', { class: 'toggle' }, input, h('span', { html: label })), essential);
  renderMath(el);
  return { el, input, set: (v) => { input.checked = !!v; } };
}

// buttons: [{label, onClick, pressed, primary, title, disabled}]
export function buttonRow(buttons, { essential, label } = {}) {
  const row = h('div', { class: 'btn-row' });
  for (const b of buttons) {
    const el = h('button', { class: 'btn' + (b.primary ? ' primary' : ''), type: 'button', title: b.title, 'aria-pressed': b.pressed === undefined ? null : String(!!b.pressed), html: b.label, disabled: b.disabled });
    el.addEventListener('click', b.onClick);
    row.append(el);
  }
  const wrap = label ? h('div', { class: 'ctl' }, h('span', { class: 'lab', html: label }), row) : row;
  renderMath(wrap);
  return ess(wrap, essential);
}

export function group(title, children, { essential } = {}) {
  return ess(h('div', { class: 'ctl-group' }, title ? h('div', { class: 'gtitle', html: title }) : null, ...children), essential);
}

export function more(children, title = 'More controls') {
  return h('details', { class: 'more-ctl non-essential' }, h('summary', {}, title), ...children);
}

export function card(title, { cls = '', details = false, open = false } = {}) {
  if (details) {
    const el = h('details', { class: `card ${cls}`, open: open || null }, h('summary', { html: title }));
    return { el, body: el };
  }
  const body = h('div');
  const el = h('section', { class: `card ${cls}` }, title ? h('h2', { html: title }) : null, body);
  return { el, body };
}

// ---- beats: short narrative steps, each may apply a preset --------------

export function beatsCard(beats, { onApply, onEnd, onBegin, start = 0 }) {
  const { el, body } = card('Walkthrough', { cls: 'beats' });
  let i = Math.min(start, beats.length - 1);
  const content = h('div', { class: 'beat' });
  const dots = h('div', { class: 'beat-dots', 'aria-hidden': 'true' });
  const count = h('span', { class: 'count' });
  const prev = h('button', { class: 'btn', type: 'button', title: 'Previous step (←)' }, '← Back');
  const next = h('button', { class: 'btn primary', type: 'button', title: 'Next step (→)' }, 'Next →');
  const reset = h('button', { class: 'btn', type: 'button', title: 'Re-apply this step’s settings' }, '↺');
  prev.addEventListener('click', () => api.prev());
  next.addEventListener('click', () => api.next());
  reset.addEventListener('click', () => api.go(i, true));
  body.append(content, h('div', { class: 'beat-nav' }, h('div', { style: { display: 'flex', gap: '6px' } }, prev, reset), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, dots, count), next));

  function render() {
    const b = beats[i];
    content.innerHTML = '';
    content.append(h('h3', { html: b.title }), h('div', { class: 'body', html: b.html }));
    renderMath(content);
    dots.innerHTML = '';
    beats.forEach((_, k) => dots.append(h('span', { class: k === i ? 'on' : '' })));
    count.textContent = `${i + 1} / ${beats.length}`;
    next.textContent = i === beats.length - 1 ? 'Next module →' : 'Next →';
  }
  const api = {
    el,
    get index() { return i; },
    go(k, apply = true) {
      i = Math.max(0, Math.min(beats.length - 1, k));
      render();
      if (apply && beats[i].apply) onApply(beats[i], i);
    },
    next() { if (i < beats.length - 1) api.go(i + 1); else onEnd && onEnd(); },
    prev() { if (i > 0) api.go(i - 1); else onBegin && onBegin(); },
  };
  render();
  return api;
}

// ---- predict-then-reveal -------------------------------------------------

export function questionCard(q, { onReveal, saved = {}, onSave }) {
  const letters = 'ABCDEF';
  let chosen = saved.chosen ?? null, locked = !!saved.locked, revealed = !!saved.revealed;
  const el = h('div', { class: 'q' });
  const prompt = h('div', { class: 'prompt', html: `<b>Predict.</b> ${q.prompt}` });
  const choices = h('div', { class: 'choices' });
  const explain = h('div', { class: 'explain', hidden: true, html: q.explain });
  const lockBtn = h('button', { class: 'btn', type: 'button' }, 'Lock in');
  const revealBtn = h('button', { class: 'btn primary', type: 'button', title: 'Reveal (R)' }, 'Reveal');
  const btns = q.choices.map((c, k) => {
    const b = h('button', { class: 'choice', type: 'button' }, h('span', { class: 'letter' }, letters[k]), h('span', { html: c }));
    b.addEventListener('click', () => { if (locked && !isPresent()) return; chosen = k; update(); save(); });
    choices.append(b);
    return b;
  });
  lockBtn.addEventListener('click', () => { if (chosen !== null) { locked = true; update(); save(); } });
  revealBtn.addEventListener('click', () => api.reveal());
  el.append(prompt, choices, h('div', { class: 'actions' }, lockBtn, revealBtn), explain);
  function save() { onSave && onSave({ chosen, locked, revealed }); }
  function update() {
    btns.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(chosen === k));
      b.classList.toggle('correct', revealed && k === q.answer);
      b.classList.toggle('wrong', revealed && chosen === k && k !== q.answer);
    });
    lockBtn.disabled = locked || chosen === null;
    lockBtn.textContent = locked ? 'Locked' : 'Lock in';
    revealBtn.disabled = revealed || (!locked && !isPresent());
    revealBtn.title = !locked && !isPresent() ? 'Lock in a prediction first' : 'Reveal (R)';
    explain.hidden = !revealed;
  }
  const api = {
    el,
    get revealed() { return revealed; },
    reveal() {
      if (revealed) return;
      if (!locked && !isPresent()) return;
      revealed = true;
      update();
      save();
      onReveal && onReveal(q);
    },
  };
  update();
  renderMath(el);
  return api;
}

// ---- stats strip ----------------------------------------------------------

export function stats(defs) {
  const el = h('div', { class: 'readouts', 'aria-live': 'polite' });
  const vals = {};
  for (const d of defs) {
    const v = h('div', { class: 'val' + (d.small ? ' small' : '') }, '–');
    vals[d.key] = v;
    el.append(ess(h('div', { class: 'stat' + (d.wide ? ' wide' : ''), title: d.title || '' }, h('div', { class: 'lab', html: d.label }), v), d.essential));
  }
  renderMath(el);
  return {
    el,
    set(key, html) { if (vals[key] && vals[key].innerHTML !== html) vals[key].innerHTML = html; },
    node: (key) => vals[key],
  };
}

// ---- transform parameter sliders ----------------------------------------

/**
 * Sliders/selects for a feature spec's params. keys: optional subset.
 * onChange(newParams, {dragging}) is called with a fresh params object.
 */
export function paramControls(spec, onChange, { keys = null, essential, labels = {} } = {}) {
  const T = TRANSFORMS[spec.id];
  const p = resolveParams(spec);
  const out = [];
  for (const [k, s] of Object.entries(T.params)) {
    if (s.hidden || (keys && !keys.includes(k))) continue;
    const label = labels[k] || s.label || k;
    if (s.options) {
      out.push(select({ label, options: s.options, value: p[k], essential, onChange: (v) => { spec.params = { ...(spec.params || {}), [k]: v }; onChange(spec.params); } }).el);
    } else {
      out.push(slider({
        label, min: s.min, max: s.max, step: s.step, log: s.log, int: s.int, value: p[k], essential,
        onInput: (v) => { spec.params = { ...(spec.params || {}), [k]: v }; onChange(spec.params); },
      }).el);
    }
  }
  return out;
}

// ---- feature palette -----------------------------------------------------

/**
 * specs: array (mutated in place); onChange(): called after any change.
 * opts: {count(specs)->d, allowed(id)->true|string(reason), budget}
 */
export function featurePalette(specs, onChange, opts = {}) {
  const el = h('div', { class: 'palette' });
  const selected = h('div', { class: 'sel-feats' });
  const counter = h('div', { class: 'hint' });
  const fams = h('div');
  el.append(h('div', { class: 'gtitle', style: { fontSize: '0.78em', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' } }, 'Your features Φ(x)'), selected, counter, h('div', { class: 'gtitle', style: { fontSize: '0.78em', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginTop: '10px' } }, 'Add a transform'), fams);

  function renderSelected() {
    selected.innerHTML = '';
    if (!specs.length) selected.append(h('div', { class: 'hint' }, 'No features yet: the model is just a bias (one class everywhere). Add a transform below.'));
    specs.forEach((spec, idx) => {
      const T = TRANSFORMS[spec.id];
      const x = h('button', { class: 'x', type: 'button', title: 'Remove', 'aria-label': `Remove ${T.label}` }, '×');
      x.addEventListener('click', () => { specs.splice(idx, 1); renderAll(); onChange(); });
      const box = h('div', { class: 'sel-feat' }, h('div', { class: 'top' }, h('span', { class: 'name', html: tex(T.tex) }), h('span', { class: 'cols' }, T.label), x));
      box.append(...paramControls(spec, () => { onChange(); updateCount(); }));
      if (spec.id === 'rbf' && resolveParams(spec).place === 'manual') box.append(h('div', { class: 'hint' }, 'Click the plot to add landmarks; drag to move; Alt-click to remove.'));
      selected.append(box);
    });
    updateCount();
  }
  function updateCount() {
    if (!opts.count) return;
    const d = opts.count(specs);
    const over = opts.budget && d > opts.budget;
    counter.innerHTML = `Feature columns <b>d = ${d}</b>${opts.budget ? ` / budget ${opts.budget}` : ''}${over ? ' — <span class="warn">over budget</span>' : ''}${d > 150 ? ' <span class="warn">(large: fitting slows down)</span>' : ''}`;
  }
  function renderFams() {
    fams.innerHTML = '';
    for (const [fid, fname] of FAMILIES) {
      const chips = h('div', { class: 'chips' });
      for (const [id, T] of Object.entries(TRANSFORMS)) {
        if (T.family !== fid) continue;
        if (T.sandboxOnly && !opts.sandbox) continue;
        if (opts.exclude && opts.exclude.includes(id)) continue;
        const ok = opts.allowed ? opts.allowed(id) : true;
        const chip = h('button', { class: 'chip', type: 'button', title: ok === true ? `Add ${T.label}` : ok, disabled: ok !== true, html: tex(T.tex) });
        chip.addEventListener('click', () => { specs.push({ id, params: {} }); renderAll(); onChange(); });
        chips.append(chip);
      }
      fams.append(h('details', { class: 'fam', open: opts.openFamilies ? true : null }, h('summary', {}, fname), chips));
    }
  }
  function renderAll() { renderSelected(); }
  renderFams();
  renderSelected();
  return { el, refresh: () => { renderFams(); renderSelected(); }, updateCount };
}

export function copyText(text) {
  try { navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function store(key, value) {
  try {
    if (value === undefined) { const v = localStorage.getItem('ftlab:' + key); return v ? JSON.parse(v) : null; }
    localStorage.setItem('ftlab:' + key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
  return null;
}
