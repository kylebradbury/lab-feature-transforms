// Drives the Feature Transform Gallery in an iframe: the hall (every tile
// fills in and morphs on hover), every exhibit (Apply Φ and back, Space, the
// slider, the space badge, grid lines and the best straight line, point hover,
// the knobs and their reset, every control usable with the plot in view, the
// written-out equations), keyboard navigation, the finale matrix, a phone-sized
// layout, the theme toggle and the theme's contrast rules. Records any error
// and restores saved preferences.
// ?shot=<page> (hall, match or an exhibit id) ends on that page for a
// screenshot: &t=0..1 sets the morph (tiles too, on the hall and finale),
// &k=<key>:<value>,… the knobs, &raw=1 shows the best straight line, &hover=<i>
// hovers training point i, &mode=dark|light, &sim=deutan|protan|gray, and
// &w=<px> lays the page out at that width (desktop windows have a minimum width).
const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const errors = [], warnings = [], log = [];
let current = 'boot';

const KEYS = ['ftlab:gallery:view', 'ftlab:theme'];
const backup = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
const restore = () => KEYS.forEach((k) => (backup[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, backup[k])));

// ?theme=<name> runs everything (including the contrast checks) on another color theme.
const themeParam = params.get('theme');
if (params.get('w')) frame.style.width = `${+params.get('w')}px`;
frame.src = `index.html${themeParam ? `?theme=${encodeURIComponent(themeParam)}` : ''}`;

// WCAG contrast checks on the active theme's colors (css/themes/): text, then
// points and lines against both shaded regions and the neutral shade. These
// are the theme's design choices (classic.css lists its known shortfalls), so
// they are reported as warnings, not failures.
function contrastChecks(win, mode, check) {
  const cs = win.getComputedStyle(win.document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
  const rgb = (c) => (c.startsWith('#') ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/[\d.]+/g).slice(0, 3).map(Number));
  const lum = (c) => {
    const [r, g, b] = rgb(c).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(v(a)), lum(v(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const lstar = (c) => { const Y = lum(v(c)); return 116 * (Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116) - 16; };
  const rules = [['--ink', '--surface', 7], ['--ink', '--page', 7], ['--ink-2', '--surface', 7], ['--muted', '--surface', 4.5], ['--muted', '--page', 4.5],
    ['--good', '--surface', 4.5], ['--on-primary', '--primary', 4.5], ['--fit', '--surface', 4.5]];
  for (const bg of ['--region0', '--region1', '--heat-mid']) rules.push(['--class0', bg, 3], ['--ink', bg, 3], ['--fit', bg, 3]);
  for (const [a, b, min] of rules) {
    const q = ratio(a, b);
    check(q >= min, `${mode}: ${a} on ${b} is ${q.toFixed(2)}:1, needs ${min}:1`);
  }
  const dl = Math.abs(lstar('--region0') - lstar('--region1'));
  check(dl >= 10, `${mode}: the two region shades differ by ${dl.toFixed(1)} lightness units, need 10`);
  return rules.length + 1;
}

frame.addEventListener('load', async () => {
  const w = frame.contentWindow, doc = w.document;
  w.addEventListener('error', (e) => errors.push(`${current}: ${e.message}`));
  w.addEventListener('unhandledrejection', (e) => errors.push(`${current}: ${e.reason}`));
  const origErr = w.console.error.bind(w.console);
  w.console.error = (...a) => { errors.push(`${current}: ${a.map(String).join(' ')}`); origErr(...a); };
  // Headless Chrome under --virtual-time-budget never fires requestAnimationFrame
  // (timers still run), so drive frames with timers.
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(w.performance.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  const app = w.gallery;
  const check = (cond, msg) => { if (!cond) errors.push(`${current}: ${msg}`); };
  const go = async (hash, ms = 200) => { w.location.hash = hash; await sleep(ms); };
  const btn = (re, root = doc) => [...root.querySelectorAll('button, a')].find((b) => re.test(b.textContent));
  const key = (k) => doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const waitFor = async (cond, ms = 8000) => { for (let t = 0; t < ms && !cond(); t += 50) await sleep(50); return cond(); };
  const pe = (type, x, y) => new w.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse' });
  // client coordinates of training point i at the plot's current t
  const pointAt = (p, i) => {
    const r = p.canvas.getBoundingClientRect(), { L, T, W, H } = p.rect, e = p.t < 0.5 ? 4 * p.t ** 3 : 1 - (-2 * p.t + 2) ** 3 / 2, { X, Z } = p.g.points;
    return [r.left + L + W * ((1 - e) * X[2 * i] + e * Z[2 * i]), r.top + T + H * (1 - ((1 - e) * X[2 * i + 1] + e * Z[2 * i + 1]))];
  };
  const tilesReady = () => doc.querySelectorAll('.tile').length > 0 && [...doc.querySelectorAll('.tile-acc')].every((el) => el.textContent !== '…');
  const setT = async (t) => { const r = doc.querySelector('input.morph'); r.value = String(Math.round(1000 * t)); r.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(30); };

  async function finish() {
    restore();
    out.textContent = `${errors.length ? 'FAIL' : 'PASS'} gallery smoke (${errors.length} errors, ${warnings.length} contrast warnings)\n\n${log.join('\n')}\n\n${errors.join('\n')}` +
      (warnings.length ? `\n\ncontrast warnings (theme colors):\n${warnings.join('\n')}` : '');
    document.title = errors.length ? 'FAIL' : 'PASS';
  }

  // ---- screenshot mode ----
  const shot = params.get('shot');
  if (shot) {
    current = 'shot';
    if (params.get('mode') && params.get('mode') !== doc.documentElement.dataset.theme) btn(/Theme/).click();
    await go(shot === 'hall' ? '' : shot, 300);
    if (shot === 'hall') await waitFor(tilesReady);
    if (shot === 'match') await waitFor(() => doc.querySelector('.match[data-ready]'));
    const t = params.has('t') ? +params.get('t') : null;
    if (app.plot) {
      if (params.has('k')) { params.get('k').split(',').forEach((kv) => { const [key, v] = kv.split(':'); app.setKnob(key, +v); }); await sleep(300); }
      if (params.has('scroll')) { w.scrollTo(0, +params.get('scroll')); await sleep(100); }
      if (params.get('raw') === '1') app.setView({ rawLine: true });
      if (t !== null) await setT(t);
      if (params.has('hover')) { const [x, y] = pointAt(app.plot, +params.get('hover')); app.plot.canvas.dispatchEvent(pe('pointermove', x, y)); }
    } else if (t !== null) app.live.forEach((p) => p.setT(t));
    await sleep(200);
    w.requestAnimationFrame = () => 0; // freeze: a resize during capture must not redraw mid-state
    restore();
    out.hidden = true;
    document.body.classList.add('shot');
    const sim = params.get('sim');
    if (sim) frame.style.filter = sim === 'gray' ? 'grayscale(1)' : `url(#${sim})`;
    document.title = errors.length ? 'FAIL' : 'PASS';
    return;
  }

  // ---- hall ----
  current = 'hall';
  check(await waitFor(tilesReady), 'tiles did not fill in');
  const tiles = [...doc.querySelectorAll('.tile')];
  check(tiles.length === app.exhibits.length, `${tiles.length} tiles for ${app.exhibits.length} exhibits`);
  check(app.live.every((p) => p.g), 'a tile has no plot');
  check(doc.querySelectorAll('.tile-phi .katex').length === tiles.length, 'Φ not typeset on every tile');
  const badge = (p) => p.badge.dataset.space;
  check(app.live.every((p) => badge(p) === 'x' && /original/.test(p.badge.textContent)), 'tiles do not all say they show the original space');
  tiles[1].dispatchEvent(new w.PointerEvent('pointerenter'));
  await sleep(1100);
  check(app.live[1].t === 1, `tile hover ended at t = ${app.live[1].t}`);
  check(badge(app.live[1]) === 'z' && /Φ\(x\)/.test(app.live[1].badge.textContent), `hovered tile badge "${app.live[1].badge.textContent}"`);
  tiles[1].dispatchEvent(new w.PointerEvent('pointerleave'));
  await sleep(900);
  check(app.live[1].t === 0, `tile leave ended at t = ${app.live[1].t}`);
  btn(/Apply every Φ/).click();
  await sleep(1900);
  check(app.live.every((p) => p.t === 1), 'Apply every Φ left some tiles unmorphed');
  tiles[2].dispatchEvent(new w.PointerEvent('pointerenter'));
  await sleep(1100);
  check(app.live[2].t === 0, 'hovering a tile after Apply every Φ should show its original space');
  tiles[2].dispatchEvent(new w.PointerEvent('pointerleave'));
  btn(/Back to x/).click();
  await sleep(1900);
  check(app.live.every((p) => p.t === 0), 'Back to x left some tiles morphed');
  log.push(`hall: ${tiles.length} tiles · ${tiles.map((t) => `${t.dataset.id} ${t.querySelector('.tile-acc').textContent.replace(/\s+/g, ' ')}`).join(' | ')}`);

  // ---- every exhibit ----
  for (const ex of app.exhibits) {
    current = ex.id;
    await go(ex.id, 150);
    const p = app.plot;
    check(p && p.g, 'no plot');
    if (!p || !p.g) continue;
    check(doc.querySelector('.ex-title h1').textContent === ex.name, 'title');
    check(doc.querySelector('.phi-big .katex') && doc.querySelectorAll('.eqs .katex').length >= 2, 'math not typeset');
    check(!/\\\(|\\\)/.test(doc.querySelector('.ex-side').textContent), 'raw TeX delimiters left in the text');
    const vals = [...doc.querySelectorAll('.accrow .val')].map((e) => parseFloat(e.textContent));
    check(vals.length === 2 && vals[1] >= vals[0] && vals[1] >= 90, `accuracies ${vals}`);
    check(/raw/.test(doc.querySelector('.acc-chip').textContent), 'no accuracy next to the plot');
    check(doc.querySelectorAll('.defs li').length >= 1 && doc.querySelector('.defs .katex'), 'no definitions');
    check(p.badge.dataset.space === 'x' && /Original space/.test(p.badge.textContent), `badge at t = 0: "${p.badge.textContent}"`);
    // Apply Φ, then back with Space
    btn(/Apply Φ/).click();
    await sleep(1900);
    check(p.t === 1, `Apply Φ ended at t = ${p.t}`);
    check(/Feature space/.test(doc.querySelector('.stage .plot-title').textContent) && /Back to x/.test(doc.querySelector('.play').textContent), 'labels not switched to feature space');
    check(p.badge.dataset.space === 'z' && /Feature space: z = Φ\(x\)/.test(p.badge.textContent), `badge at t = 1: "${p.badge.textContent}"`);
    key(' ');
    await sleep(1900);
    check(p.t === 0 && /Apply Φ/.test(doc.querySelector('.play').textContent), `Space ended at t = ${p.t}`);
    // the slider, mid-morph
    await setT(0.5);
    check(Math.abs(p.t - 0.5) < 1e-9 && p.badge.dataset.space === 'mid', `slider gave t = ${p.t}, badge ${p.badge.dataset.space}`);
    // options: best straight line (checkbox, then R), grid lines (checkbox, then G)
    const [meshBox, rawBox] = [...doc.querySelectorAll('.stage-opts input')], stageEl = doc.querySelector('.stage');
    const size0 = stageEl.getBoundingClientRect();
    rawBox.click();
    const size1 = stageEl.getBoundingClientRect();
    check(p.opts.rawLine && !doc.querySelector('.raw-key').classList.contains('off'), 'best straight line did not turn on');
    check(size0.width === size1.width && size0.height === size1.height, `the best-straight-line toggle resized the card: ${size0.width}×${size0.height} → ${size1.width}×${size1.height}`);
    key('r');
    check(!p.opts.rawLine && !rawBox.checked, 'R did not turn the straight line off');
    meshBox.click(); key('g');
    check(p.opts.mesh && meshBox.checked, 'grid lines did not toggle back on');
    // hover a training point: tooltip with its features and prediction, then leave
    const [hx, hy] = pointAt(p, 3);
    p.canvas.dispatchEvent(pe('pointermove', hx, hy));
    check(p.hoverI === 3 && !p.tip.hidden && /predicted/.test(p.tip.textContent), `hover: point ${p.hoverI}, tooltip "${p.tip.textContent.slice(0, 60)}"`);
    p.canvas.dispatchEvent(pe('pointerleave', hx, hy));
    check(p.hoverI === -1 && p.tip.hidden, 'tooltip stayed after leaving');
    // every control can be used with the whole plot in view (the stage is sticky)
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= w.innerHeight + 0.5; };
    const plotBox = doc.querySelector('.stage .plot-box');
    for (const ctl of [...doc.querySelectorAll('.stage button, .stage input, .knob input, .knob button')]) {
      ctl.scrollIntoView({ block: 'nearest' });
      await sleep(20);
      check(inView(ctl) && inView(plotBox), `with ${ctl.getAttribute('aria-label') || ctl.textContent || ctl.type} in view, the plot is not (plot ${Math.round(plotBox.getBoundingClientRect().top)}–${Math.round(plotBox.getBoundingClientRect().bottom)} of ${w.innerHeight})`);
    }
    w.scrollTo(0, doc.documentElement.scrollHeight);
    await sleep(40);
    check(inView(plotBox) && inView(doc.querySelector('.play')), 'scrolled to the bottom, the plot or its controls left the screen');
    w.scrollTo(0, 0);
    // the knobs: another value refits, Reset brings back the original
    if (ex.knobs) {
      const before = p.g.key, acc0 = doc.querySelector('.accrow.phi .val').textContent, at = [];
      for (const kn of ex.knobs) {
        app.setKnob(kn.key, kn.max);
        await sleep(150);
        check(p.g.key !== before, `knob ${kn.key} did not refit`);
        at.push(`${kn.key} = ${kn.max}: ${doc.querySelector('.accrow.phi .val').textContent}`);
        btn(/^Reset/).click();
        await sleep(150);
        check(p.g.key === before && doc.querySelector('.accrow.phi .val').textContent === acc0, `reset did not restore knob ${kn.key}`);
      }
      log.push(`${ex.id}: raw ${vals[0]}% → Φ ${vals[1]}% (${p.g.mode}); ${at.join(', ')}`);
    } else log.push(`${ex.id}: raw ${vals[0]}% → Φ ${vals[1]}% (${p.g.mode})`);
  }

  // ---- written-out equations: bumps, hinges and bins with their numbers ----
  current = 'equations';
  const eqText = () => doc.querySelector('.eqs').textContent;
  await go('bumps');
  app.setKnob('m', 3); await sleep(150);
  check(app.plot.g.landmarks.length === 9 && !/too many/.test(eqText()) && doc.querySelectorAll('.eqs .katex').length >= 3, 'a 3 × 3 grid of bumps is not written out');
  check(/9 bumps/.test(doc.querySelector('.ex-title .lead').textContent) && doc.querySelector('.phi-big').textContent.includes('1,…,9'), 'lead or Φ not updated for 9 bumps');
  app.setKnob('m', 7); await sleep(150);
  check(/too many/.test(eqText()), '49 bumps should not be written out in full');
  await go('relu');
  app.setKnob('m', 4); await sleep(150);
  check(app.plot.g.folds.length === 4 && [1, 2, 3, 4].every((j) => new RegExp(`h\\s*${j}`).test(eqText())) && /hidden units/.test(eqText()), 'four hinges not written out, named, and explained');
  app.setKnob('m', 60); await sleep(150);
  check(app.plot.g.folds.length === 0 && /h\s*60/.test(eqText()), '60 hinges: the list should end at h₆₀ and no fold lines be drawn');
  await go('bins');
  check(!/too many/.test(eqText()) && /indicator/.test(doc.querySelector('.defs').textContent) && /Bin 1 has no feature/.test(doc.querySelector('.defs').textContent), 'bins: equation or indicator definition missing');
  log.push('equations: 9 bumps, 4 and 60 hinges, 6 bins per axis written out');

  // ---- keyboard ----
  current = 'keys';
  await go('circle');
  key('ArrowRight'); await sleep(150);
  check(w.location.hash === '#parabola', `→ went to ${w.location.hash}`);
  key('ArrowLeft'); await sleep(150);
  check(w.location.hash === '#circle', `← went to ${w.location.hash}`);
  key('Escape'); await sleep(200);
  check(doc.querySelector('.hall') && !app.plot, 'Esc did not return to the hall');

  // ---- finale ----
  current = 'finale';
  await go('match', 100);
  check(await waitFor(() => doc.querySelector('.match[data-ready]')), 'finale did not fill in');
  const cells = [...doc.querySelectorAll('.mcell')];
  check(cells.length === 42 && cells.every((c) => /%/.test(c.textContent)), `${cells.length} cells`);
  check(doc.querySelectorAll('.mcell.best').length >= 6, 'not every column has a best representation');
  check(doc.querySelectorAll('.mrow-head .katex').length === 7, 'row labels not typeset');
  cells[8].dispatchEvent(new w.PointerEvent('pointerenter'));
  await sleep(1100);
  check(app.live[8].t === 1, 'finale cell hover did not morph');
  log.push(`finale: ${cells.length} cells, ${doc.querySelectorAll('.mcell.best').length} outlined`);

  // ---- phone-sized layout: the plot stays on screen while the settings scroll ----
  current = 'phone';
  frame.style.width = '390px'; frame.style.height = '844px';
  await sleep(150);
  await go('bumps', 250);
  const stageR = () => doc.querySelector('.stage').getBoundingClientRect();
  for (const input of [...doc.querySelectorAll('.knob input')]) {
    input.scrollIntoView({ block: 'end' });
    await sleep(40);
    const r = input.getBoundingClientRect(), pb = doc.querySelector('.stage .plot-box').getBoundingClientRect();
    check(r.top >= stageR().bottom - 0.5 && r.bottom <= w.innerHeight + 0.5 && pb.top >= 0 && pb.bottom <= w.innerHeight, `phone: slider at ${Math.round(r.top)}–${Math.round(r.bottom)}, plot at ${Math.round(pb.top)}–${Math.round(pb.bottom)}, stage ends ${Math.round(stageR().bottom)}`);
  }
  check(doc.documentElement.scrollWidth <= w.innerWidth + 1, `phone: page is ${doc.documentElement.scrollWidth}px wide`);
  log.push(`phone: plot ${Math.round(doc.querySelector('.stage .plot-box').getBoundingClientRect().height)}px, stage ${Math.round(stageR().height)}px of ${w.innerHeight}`);
  frame.style.width = ''; frame.style.height = '';
  await sleep(150);

  // ---- theme and contrast ----
  current = 'theme';
  const mode = () => doc.documentElement.dataset.theme;
  const warn = (cond, msg) => { if (!cond) warnings.push(msg); };
  let nChecks = contrastChecks(w, mode(), warn);
  btn(/Theme/).click(); await sleep(150);
  nChecks += contrastChecks(w, mode(), warn);
  await go('spiral', 150);
  btn(/Theme/).click(); await sleep(150);
  check(app.plot.g && app.plot.images && app.plot.images.theme === app.theme(), 'plot not redrawn for the new theme');
  log.push(`contrast: ${nChecks} checks on the ${themeParam || 'default'} theme, light and dark; ${warnings.length} below target`);
  await go('', 100);
  await finish();
});
