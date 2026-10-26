// App shell: header, module navigation, hash routing, keyboard shortcuts,
// theme and presentation mode.

import { MODULES } from './modules/index.js';
import { h, store, copyText, renderMath } from './ui.js';
import { refreshTheme, LIVE_PLOTS } from './plot2d.js';
import { LIVE_SCENES } from './scene.js';

const app = {
  states: {},
  instance: null,
  current: null,
  query: new URLSearchParams(),
  moduleState(id) { return this.states[id] || null; },
  saveModuleState(id, s) { this.states[id] = s; },
  go(id, query = '') { location.hash = `#${id}${query ? '?' + query : ''}`; },
  nextModule() { const i = MODULES.findIndex((m) => m.id === this.current); if (i < MODULES.length - 1) this.go(MODULES[i + 1].id); },
  prevModule() { const i = MODULES.findIndex((m) => m.id === this.current); if (i > 0) this.go(MODULES[i - 1].id); },
};
app.modules = MODULES;
window.ftlab = app; // handy for debugging in the console (and used by tests/smoke)

// ---------- shell ----------
const modSelect = h('select', { class: 'mod-select', 'aria-label': 'Module' });
MODULES.forEach((m, i) => modSelect.append(h('option', { value: m.id }, `${i}. ${m.short}`)));
modSelect.addEventListener('change', () => app.go(modSelect.value));

const presentBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Presentation mode (P)', 'aria-pressed': 'false', 'aria-label': 'Presentation mode' }, '▣', h('span', { class: 'lbl' }, ' Present'));
const themeBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Toggle dark mode (D)', 'aria-label': 'Toggle dark mode' }, '◐', h('span', { class: 'lbl' }, ' Theme'));
const linkBtn = h('button', { class: 'icon-btn hide-sm', type: 'button', title: 'Copy a link to this page' }, '🔗 Link');
const helpBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Keyboard shortcuts (?)' }, '?');

const header = h('header', { class: 'app-header' },
  h('div', { class: 'brand' }, 'Feature Transforms Lab', h('small', {}, 'IDS 705 · linear models on Φ(x)')),
  modSelect, h('div', { class: 'spacer' }), presentBtn, themeBtn, linkBtn, helpBtn);

const navList = h('ol');
const navLinks = {};
MODULES.forEach((m, i) => {
  const a = h('a', { href: `#${m.id}`, title: m.title },
    h('span', { class: 'num' }, String(i)), h('span', {}, m.short), m.core ? h('span', { class: 'core-dot', title: 'Core path for a 75-minute class' }, '●') : null);
  navLinks[m.id] = a;
  navList.append(h('li', {}, a));
});
const nav = h('nav', { class: 'nav', 'aria-label': 'Modules' }, navList,
  h('div', { class: 'nav-foot', html: '● = core path for one class session.<br>Keys: <kbd>←</kbd><kbd>→</kbd> steps, <kbd>?</kbd> help.' }));
const stage = h('main', { class: 'stage', id: 'stage' });
document.getElementById('app').append(header, h('div', { class: 'layout' }, nav, stage),
  h('footer', { class: 'site-foot' },
    '© 2026 ', h('a', { href: 'https://kylebradbury.com/', target: '_blank', rel: 'noopener' }, 'Kyle Bradbury'),
    '. Designed by Kyle Bradbury, built with Claude.'));

// ---------- routing ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [id, q = ''] = raw.split('?');
  return { id: MODULES.some((m) => m.id === id) ? id : MODULES[0].id, query: new URLSearchParams(q) };
}

function mount() {
  const { id, query } = parseHash();
  app.query = query;
  if (query.get('present') === '1') setPresent(true);
  if (app.instance && app.current === id && !query.toString()) return;
  if (app.instance) { app.instance.unmount(); app.instance = null; }
  const mod = MODULES.find((m) => m.id === id);
  app.current = id;
  stage.innerHTML = '';
  const idx = MODULES.indexOf(mod);
  const head = h('div', { class: 'mod-head' },
    h('h1', {}, `${idx}. ${mod.title}`),
    mod.keyIdea ? h('p', { class: 'key-idea', html: mod.keyIdea }) : null);
  renderMath(head);
  const body = h('div');
  stage.append(head, body);
  try {
    app.instance = mod.mount(body, app);
  } catch (e) {
    console.error(e);
    body.append(h('p', { class: 'warn' }, `This module failed to load: ${e.message}`));
  }
  for (const [mid, a] of Object.entries(navLinks)) a.setAttribute('aria-current', mid === id ? 'page' : 'false');
  modSelect.value = id;
  document.title = `${mod.short} · Feature Transforms Lab`;
  const visited = store('visited') || {};
  visited[id] = 1;
  store('visited', visited);
  markVisited();
  window.scrollTo(0, 0);
}
function markVisited() {
  const visited = store('visited') || {};
  for (const [mid, a] of Object.entries(navLinks)) a.classList.toggle('done', !!visited[mid]);
}
window.addEventListener('hashchange', mount);

// ---------- theme ----------
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function effectiveDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : mq.matches;
}
function redrawAll() {
  refreshTheme();
  LIVE_PLOTS.forEach((p) => p.draw());
  LIVE_SCENES.forEach((s) => s.invalidate('paint'));
}
themeBtn.addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store('theme', next);
  redrawAll();
});
mq.addEventListener('change', redrawAll);

// ---------- presentation mode ----------
function setPresent(on) {
  document.body.classList.toggle('present', on);
  presentBtn.setAttribute('aria-pressed', String(on));
  store('present', on);
  requestAnimationFrame(redrawAll);
}
presentBtn.addEventListener('click', () => setPresent(!document.body.classList.contains('present')));

// ---------- link ----------
linkBtn.addEventListener('click', () => {
  let url = location.href.split('#')[0] + `#${app.current}`;
  if (app.instance && app.instance.shareQuery) url += '?' + app.instance.shareQuery();
  copyText(url);
  linkBtn.textContent = '✓ Copied';
  setTimeout(() => { linkBtn.textContent = '🔗 Link'; }, 1400);
});

// ---------- help ----------
function showHelp() {
  if (document.querySelector('.modal')) return;
  const keys = [
    ['→ / ←', 'Next / previous walkthrough step'], ['Shift + → / ←', 'Next / previous module'], ['R', 'Reveal the next prediction question'],
    ['T', 'Show / hide test points'], ['P', 'Presentation mode (large type, essential controls only)'], ['D', 'Dark / light theme'],
    ['F', 'Full screen'], ['?', 'This help'], ['Esc', 'Close dialogs'],
  ];
  const grid = h('div', { class: 'help-grid' });
  for (const [k, v] of keys) grid.append(h('kbd', {}, k), h('span', {}, v));
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Help' },
    h('div', { class: 'sheet' },
      h('header', {}, h('b', {}, 'How to use this lab'), close),
      h('p', { html: 'Every module shows a <b>linear classifier</b> \\(\\sigma(w_0 + w^\\top z)\\) trained on transformed features \\(z = \\Phi(x)\\). The left plot is the original <b>X-space</b>: shading is \\(P(y=1\\mid x)\\) (orange = class 1, blue = class 0), the dark line is the decision boundary \\(P = 0.5\\). Filled points are training data, hollow points are test data. The right panel is <b>Z-space</b>, where the same boundary is always flat.' }),
      h('p', {}, 'Hover anywhere on a plot to see the features and the model’s score at that point. Drag the round handles (centers, knots, landmarks) directly on the plot.'),
      grid));
  renderMath(modal);
  const done = () => modal.remove();
  close.addEventListener('click', done);
  modal.addEventListener('click', (e) => { if (e.target === modal) done(); });
  document.body.append(modal);
  close.focus();
}
helpBtn.addEventListener('click', showHelp);

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Escape') { document.querySelectorAll('.modal').forEach((m) => m.remove()); return; }
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = app.instance && app.instance.keys ? app.instance.keys : {};
  if (e.key === 'ArrowRight' && e.shiftKey) { app.nextModule(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' && e.shiftKey) { app.prevModule(); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { k.next && k.next(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { k.prev && k.prev(); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') k.reveal && k.reveal();
  else if (e.key === 't' || e.key === 'T') k.toggleTest && k.toggleTest();
  else if (e.key === 'p' || e.key === 'P') presentBtn.click();
  else if (e.key === 'd' || e.key === 'D') themeBtn.click();
  else if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  else if (e.key === '?') showHelp();
});

// ---------- boot ----------
if (store('present')) setPresent(true);
refreshTheme();
mount();
