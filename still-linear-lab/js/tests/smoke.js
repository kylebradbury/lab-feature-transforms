// Drives Still a Linear Model in an iframe: every case (both 3-D views drawn,
// the same heights in both, a flat plane over the feature floor, the
// equations, the weight sliders and their reset, Apply Φ and back, the scrub
// slider and the space badge, hovering a point, the zero-plane toggle, the
// camera presets and the linked cameras), the keyboard, a phone-sized layout,
// the theme toggle and the theme's contrast rules. Records any error and
// restores saved preferences. Needs WebGL: run Chrome with --enable-unsafe-swiftshader.
// ?shot=<case id> ends on that case for a screenshot: &t=0..1 sets the
// feature view's floor, &cam=oblique|top|side|edge, &w0=,&w1=,&w2= set weights,
// &hover=<i> follows training point i, &zero=0 hides the plane s = 0,
// &mode=dark|light, &sim=deutan|protan|gray, &scroll=<px>, and &w=<px> lays the
// page out at that width (desktop windows have a minimum width).
const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const errors = [], warnings = [], log = [];
let current = 'boot';

const KEYS = ['ftlab:stilllinear:view', 'ftlab:theme'];
const backup = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
const restore = () => KEYS.forEach((k) => (backup[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, backup[k])));
localStorage.removeItem('ftlab:stilllinear:view'); // start from the default camera

const themeParam = params.get('theme');
if (params.get('w')) frame.style.width = `${+params.get('w')}px`;
frame.src = `index.html${themeParam ? `?theme=${encodeURIComponent(themeParam)}` : ''}`;

// WCAG contrast checks on the active theme's colors (css/themes/), reported as
// warnings: they are the theme's design choices (classic.css lists its known shortfalls).
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
    ['--on-primary', '--primary', 4.5]];
  for (const bg of ['--region0', '--region1']) rules.push(['--class0', bg, 3], ['--class1', bg, 3], ['--ink', bg, 3]);
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
  // (timers still run), so drive frames with timers, and restart any frame
  // that was requested before the switch.
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(w.performance.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  const app = w.still, { flat, x: px, z: pz } = app.plots;
  for (const p of [px, pz]) { p.req = 0; p.schedule(); }
  const check = (cond, msg) => { if (!cond) errors.push(`${current}: ${msg}`); };
  const go = async (hash, ms = 250) => { w.location.hash = hash; await sleep(ms); };
  const btn = (re, root = doc) => [...root.querySelectorAll('button, a')].find((b) => re.test(b.textContent));
  const key = (k) => doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const waitFor = async (cond, ms = 15000) => { for (let t = 0; t < ms && !cond(); t += 50) await sleep(50); return cond(); };
  const trace = (p, name) => p.box.data && p.box.data.find((d) => d.name === name);
  const drawnFor = (p) => p.drawn && trace(p, 'sheet') && p.box.layout.scene.zaxis.range[0] === app.fit.sRange[0];
  const settled = async () => { await sleep(80); await waitFor(() => drawnFor(px) && drawnFor(pz) && !px.req && !pz.req); };
  const sliderInput = (j) => doc.querySelectorAll('.weights input[type=range]')[j];
  const slide = async (input, value) => { input.value = String(value); input.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(60); await settled(); };
  const pe = (type, x, y) => new w.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse' });
  const pointAt = (i) => { const r = flat.canvas.getBoundingClientRect(); return [r.left + flat.sx(app.fit.PX[2 * i]), r.top + flat.sy(app.fit.PX[2 * i + 1])]; };
  const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
  const pointZ = (p) => [...trace(p, 'points0').z, ...trace(p, 'points1').z];

  async function finish() {
    restore();
    out.textContent = `${errors.length ? 'FAIL' : 'PASS'} still-linear smoke (${errors.length} errors, ${warnings.length} contrast warnings)\n\n${log.join('\n')}\n\n${errors.join('\n')}` +
      (warnings.length ? `\n\ncontrast warnings (theme colors):\n${warnings.join('\n')}` : '');
    document.title = errors.length ? 'FAIL' : 'PASS';
  }

  check(await waitFor(() => w.Plotly && px.ready && pz.ready), 'the 3-D library did not load');

  // ---- screenshot mode ----
  const shot = params.get('shot');
  if (shot) {
    current = 'shot';
    if (params.get('mode') && params.get('mode') !== doc.documentElement.dataset.theme) btn(/Theme/).click();
    await go(shot, 300);
    await settled();
    for (const j of [0, 1, 2]) if (params.has(`w${j}`)) app.setWeight(j, +params.get(`w${j}`));
    if (params.get('zero') === '0') doc.querySelector('.ctlbar .opt input').click();
    if (params.has('cam')) app.setCamera(params.get('cam'));
    if (params.has('t')) app.setT(+params.get('t'));
    if (params.has('hover')) app.setHover(+params.get('hover'));
    if (params.has('scroll')) { w.scrollTo(0, +params.get('scroll')); await sleep(100); }
    await settled();
    await sleep(400);
    w.requestAnimationFrame = () => 0; // freeze: a resize during capture must not redraw mid-state
    restore();
    out.hidden = true;
    document.body.classList.add('shot');
    const sim = params.get('sim');
    if (sim) frame.style.filter = sim === 'gray' ? 'grayscale(1)' : `url(#${sim})`;
    document.title = errors.length ? 'FAIL' : 'PASS';
    return;
  }

  const foot = doc.querySelector('footer.site-foot');
  check(foot && foot.querySelector('a[href="https://kylebradbury.com/"]') && /Designed by Kyle Bradbury, built with Claude/.test(foot.textContent) && /©/.test(foot.textContent), 'no copyright footer');
  check(doc.querySelector('.intro .katex') && doc.querySelectorAll('.takeaways li').length === 3, 'intro or takeaways missing');

  // ---- every case ----
  for (const c of app.cases) {
    current = c.id;
    await go(c.id);
    await settled();
    const fc = app.fit;
    check(fc && fc.id === c.id && doc.querySelector('.case[aria-current="true"]').dataset.id === c.id, 'case not selected');
    check(drawnFor(px) && drawnFor(pz), 'a 3-D view was not drawn');
    const names = px.box.data.map((d) => d.name).join(',');
    check(names === 'sheet,plane,zero,grid,cut,zeroline,points0,points1,hi,drop', `traces: ${names}`);
    // every height is the score, and the same in both 3-D views
    const zX = pointZ(px), zZ = pointZ(pz), wt = app.w;
    check(zX.length === fc.N && zX.every((v, k) => v === zZ[k]), 'point heights differ between the two 3-D views');
    const i0 = trace(px, 'points0').customdata[0];
    check(close(trace(px, 'points0').z[0], wt[0] + wt[1] * fc.PZ[2 * i0] + wt[2] * fc.PZ[2 * i0 + 1]), 'a height is not the score');
    // feature view at t = 1: points at ẑ, the plane shown, the sheet faded; original view at x̂
    check(pz.t === 1 && close(trace(pz, 'points0').x[0], fc.PZn[2 * i0]) && close(trace(px, 'points0').x[0], fc.PXn[2 * i0]), 'points not on their floors');
    check(trace(pz, 'plane').visible && !trace(pz, 'sheet').visible && trace(px, 'sheet').visible && !trace(px, 'plane').visible, 'plane and sheet visibility');
    check(/^z₁ = /.test(pz.box.layout.scene.xaxis.title.text) && px.box.layout.scene.xaxis.title.text === 'x₁', 'floor axis titles');
    check(doc.querySelector('.space-badge').dataset.space === 'z' && /feature space/.test(doc.querySelector('.space-badge').textContent), 'badge at t = 1');
    // text
    check(doc.querySelectorAll('.eqs .katex').length >= 5 && doc.querySelectorAll('.defs li').length >= 1 && doc.querySelector('.about .lead').textContent.length > 40, 'equations, definitions or lead missing');
    check(!/\\\(|\\\)/.test(doc.querySelector('.lower').textContent), 'raw TeX delimiters left in the text');
    check(!!doc.querySelector('.chosen').hidden === !c.chosen, 'chosen-by-hand note');
    const accs = [...doc.querySelectorAll('.acc-line b')].map((e) => parseFloat(e.textContent));
    check(accs.length === 2 && accs[1] >= 95, `accuracy ${accs}`);
    // on arrival: the three plots, the camera, the sliders and the first equation are all on screen
    const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= w.innerHeight + 0.5 && r.height > 0; };
    const must = [...doc.querySelectorAll('.pwrap'), ...doc.querySelectorAll('.seg .btn'), ...doc.querySelectorAll('.weights input[type=range]'), doc.querySelector('.eqs .eq-row:nth-child(2)')];
    check(must.every(onScreen), `not all on screen at ${w.innerWidth}×${w.innerHeight}: ${must.filter((el) => !onScreen(el)).map((el) => el.className || el.tagName).join(', ')}`);

    // a weight slider: the equations, the 2-D boundary and both 3-D views follow
    const eq0 = doc.querySelector('.eqs').textContent, segs0 = flat.data.segs, h0 = pointZ(px);
    const inp = sliderInput(0), d = (+inp.max - +inp.min) / 10;
    await slide(inp, +inp.value + d);
    const dw = app.w[0] - fc.w0[0];
    check(Math.abs(dw) > 0 && doc.querySelector('.eqs').textContent !== eq0 && flat.data.segs !== segs0, 'w₀ slider did not update the equations and the 2-D boundary');
    check(pointZ(px).every((v, k) => close(v - h0[k], dw, 1e-9)) && pointZ(pz).every((v, k) => close(v - h0[k], dw, 1e-9)), 'w₀ did not lift every height by the same amount');
    await slide(sliderInput(2), +sliderInput(2).value * 0.5);
    check(app.w[2] !== fc.w0[2] && !close(planeTilt(pz), planeTilt0(fc)), 'w₂ did not tilt the plane');
    btn(/Reset to the fit/).click();
    await settled();
    check(app.w.every((v, k) => v === fc.w0[k]) && doc.querySelector('.eqs').textContent === eq0, 'reset did not restore the fitted weights');

    // the feature view's floor: back to x, then Apply Φ with Space; the scrub slider
    btn(/Back to x/).click();
    await sleep(1900); await settled();
    check(pz.t === 0 && /Apply Φ/.test(doc.querySelector('.play').textContent) && /original space/.test(doc.querySelector('.panel:last-child .plot-title').textContent), `Back to x ended at t = ${pz.t}`);
    check(doc.querySelector('.space-badge').dataset.space === 'x' && close(trace(pz, 'points0').x[0], fc.PXn[2 * i0]) && pz.box.layout.scene.xaxis.title.text === 'x₁', 'at t = 0 the feature view is not on the original floor');
    check(trace(pz, 'sheet').visible && !trace(pz, 'plane').visible, 'at t = 0 the sheet should show, not the plane');
    check(pointZ(pz).every((v, k) => v === zX[k]), 'the morph changed a height');
    key(' ');
    await sleep(1900); await settled();
    check(pz.t === 1 && /Back to x/.test(doc.querySelector('.play').textContent), `Space ended at t = ${pz.t}`);
    const r = doc.querySelector('input.morph');
    r.value = '500'; r.dispatchEvent(new w.Event('input', { bubbles: true })); await settled();
    const bd = doc.querySelector('.space-badge');
    check(pz.t === 0.5 && bd.dataset.space === 'mid' && bd.dataset.dir === 'back' && /z = Φ\(x\) → x/.test(bd.textContent), `at t = 0.5 going back: badge "${bd.textContent}"`);
    check(pz.box.layout.scene.xaxis.tickvals.length === 0, 'tick labels should be hidden mid-morph');
    r.value = '700'; r.dispatchEvent(new w.Event('input', { bubbles: true })); await settled();
    check(bd.dataset.dir === 'forward' && /x → z/.test(bd.textContent), `going forward: badge "${bd.textContent}"`);
    app.setT(1); await settled();

    // hover a point on the 2-D panel: followed in both 3-D views, readout, no layout shift
    const lowerTop = doc.querySelector('.lower').getBoundingClientRect().top;
    const hi = interiorPoint(fc), [hx, hy] = pointAt(hi);
    flat.canvas.dispatchEvent(pe('pointermove', hx, hy));
    await settled();
    const hiX = trace(px, 'hi'), hiZ = trace(pz, 'hi');
    check(app.hover === hi && new RegExp(`Point ${hi + 1}\\b`).test(doc.querySelector('.readout').textContent) && /predicted/.test(doc.querySelector('.readout').textContent), `hover: point ${app.hover} (wanted ${hi}), readout "${doc.querySelector('.readout').textContent.slice(0, 60)}"`);
    check(hiX.visible && hiZ.visible && hiX.z[0] === hiZ.z[0] && close(hiZ.x[0], fc.PZn[2 * hi]) && close(hiX.x[0], fc.PXn[2 * hi]), 'hovered point not highlighted at the same height in both 3-D views');
    check(doc.querySelector('.lower').getBoundingClientRect().top === lowerTop, 'the readout moved the cards below it');
    box2dLeave();
    await settled();
    check(app.hover === -1 && !trace(px, 'hi').visible && /Hover over a point/.test(doc.querySelector('.readout').textContent), 'hover did not clear');
    log.push(`${c.id}: raw ${(100 * fc.raw.test.acc).toFixed(1)}% → Φ ${(100 * fc.model.test.acc).toFixed(1)}%; w = [${fc.w0.map((v) => v.toFixed(2)).join(', ')}]; heights ${fc.sRange.map((v) => v.toFixed(2)).join(' to ')}`);
  }
  // a training point well inside the plot, with no other point within 10 px
  function interiorPoint(fc) {
    const X = fc.PX, n = fc.N, v = fc.view, px2 = (i) => [flat.sx(X[2 * i]), flat.sy(X[2 * i + 1])];
    for (let i = 0; i < n; i++) {
      if (Math.abs(X[2 * i]) > 0.85 * v.xmax || Math.abs(X[2 * i + 1]) > 0.85 * v.ymax) continue;
      const [a, b] = px2(i);
      let alone = true;
      for (let j = 0; j < n && alone; j++) if (j !== i) { const [c2, d2] = px2(j); if (Math.hypot(a - c2, b - d2) < 10) alone = false; }
      if (alone) return i;
    }
    return 0;
  }
  function box2dLeave() { flat.canvas.parentElement.dispatchEvent(new w.PointerEvent('pointerleave')); }
  // the plane's rise along the feature floor's second axis (z₂), as drawn and as fitted
  function planeTilt(p) { const S = trace(p, 'plane').z; return S[1][0] - S[0][0]; }
  function planeTilt0(fc) { const b = fc.zbox, dv = (b.v1 - b.v0) / 20; return fc.w0[2] * dv; }

  // ---- options and cameras ----
  current = 'controls';
  await go('circle'); await settled();
  const zero = doc.querySelector('.ctlbar .opt input'), panelsBox = doc.querySelector('.panels').getBoundingClientRect();
  zero.click(); await settled();
  check(!trace(px, 'zero').visible && !trace(pz, 'zero').visible, 'the plane s = 0 did not hide');
  const panelsBox2 = doc.querySelector('.panels').getBoundingClientRect();
  check(panelsBox.height === panelsBox2.height && panelsBox.width === panelsBox2.width, 'the zero-plane toggle resized the panels');
  zero.click(); await settled();
  check(trace(px, 'zero').visible, 'the plane s = 0 did not come back');
  for (const b of [...doc.querySelectorAll('.seg .btn')]) {
    b.click(); await settled();
    const cam = px.box.layout.scene.camera, k = b.dataset.cam;
    check(b.getAttribute('aria-pressed') === 'true' && JSON.stringify(cam) === JSON.stringify(pz.box.layout.scene.camera), `camera ${k}: not pressed, or the views differ`);
    if (k === 'top') check(cam.eye.z > 1 && Math.hypot(cam.eye.x, cam.eye.y) < 0.01 && cam.projection.type === 'orthographic', 'top camera');
    if (k === 'edge') {
      // looking along the zero line: the plane's height is the same along the line of sight
      const S = trace(pz, 'plane').z, b2 = app.fit.zbox, ww = app.w, e = cam.eye, n = Math.hypot(e.x, e.y);
      const at = (u, v) => ww[0] + ww[1] * (b2.u0 + u * (b2.u1 - b2.u0)) + ww[2] * (b2.v0 + v * (b2.v1 - b2.v0));
      check(close(e.z, 0) && close(at(0.5 + 0.3 * e.x / n, 0.5 + 0.3 * e.y / n), at(0.5, 0.5), 1e-9) && S.length > 0, 'edge-on camera does not look along the zero line');
    }
  }
  // dragging one view turns the other (a relayout as Plotly reports a drag)
  const dragged = { eye: { x: -1.4, y: -1.2, z: 0.7 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 }, projection: { type: 'perspective' } };
  await w.Plotly.relayout(px.box, { 'scene.camera': dragged });
  await sleep(150);
  check(close(pz.box.layout.scene.camera.eye.x, -1.4) && close(pz.camera.eye.y, -1.2), 'the other 3-D view did not follow the camera');
  check(![...doc.querySelectorAll('.seg .btn')].some((b) => b.getAttribute('aria-pressed') === 'true'), 'a camera preset still looks pressed after a drag');
  app.setCamera('oblique'); await settled();
  log.push('controls: zero plane toggles without resizing; 4 camera presets; linked cameras');

  // ---- keyboard ----
  current = 'keys';
  key('ArrowRight'); await sleep(250);
  check(w.location.hash === '#hyperbola', `→ went to ${w.location.hash}`);
  key('ArrowLeft'); await sleep(250);
  check(w.location.hash === '#circle', `← went to ${w.location.hash}`);

  // ---- phone-sized layout ----
  current = 'phone';
  frame.style.width = '390px'; frame.style.height = '844px';
  await sleep(300); await settled();
  check(doc.documentElement.scrollWidth <= w.innerWidth + 1, `phone: page is ${doc.documentElement.scrollWidth}px wide`);
  const boxes = [...doc.querySelectorAll('.pwrap')].map((el) => el.getBoundingClientRect());
  check(boxes.every((b) => b.width > 250 && b.height > 250), `phone: plot sizes ${boxes.map((b) => `${Math.round(b.width)}×${Math.round(b.height)}`).join(', ')}`);
  log.push(`phone: plots ${boxes.map((b) => `${Math.round(b.width)}×${Math.round(b.height)}`).join(', ')}`);
  frame.style.width = ''; frame.style.height = '';
  await sleep(300);

  // ---- theme and contrast ----
  current = 'theme';
  const mode = () => doc.documentElement.dataset.theme;
  const warn = (cond, msg) => { if (!cond) warnings.push(msg); };
  let nChecks = contrastChecks(w, mode(), warn);
  btn(/Theme/).click(); await settled();
  nChecks += contrastChecks(w, mode(), warn);
  check(px.box.layout.paper_bgcolor === app.theme().surface && pz.box.layout.paper_bgcolor === app.theme().surface, '3-D views not redrawn for the new theme');
  btn(/Theme/).click(); await settled();
  log.push(`contrast: ${nChecks} checks on the ${themeParam || 'default'} theme, light and dark; ${warnings.length} below target`);
  await go('', 100);
  await finish();
});
