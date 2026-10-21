import { standardModule, datasetControl, slider, buttonRow, toggle, more, h, card, viewToggles, fmt } from './common.js';
import { loadPlotly, renderLift, CAMERAS } from '../plot3d.js';

const W_EGG = Math.PI / 1.5;
const SURF = {
  bowl: { label: 'Bowl \\(x_1^2 + x_2^2\\)', ztitle: 'x₁² + x₂²', feat: () => ({ id: 'r2', params: {} }), h: (x, y) => x * x + y * y, z: [-2, 18], c: [-2, 10], ab: 4 },
  saddle: { label: 'Saddle \\(x_1x_2\\)', ztitle: 'x₁x₂', feat: () => ({ id: 'x1x2', params: {} }), h: (x, y) => x * y, z: [-9, 9], c: [-4, 4], ab: 2 },
  egg: { label: 'Egg crate \\(\\sin\\omega x_1 \\sin\\omega x_2\\)', ztitle: 'sin ωx₁ · sin ωx₂', feat: () => ({ id: 'checker', params: { w: W_EGG } }), h: (x, y) => Math.sin(W_EGG * x) * Math.sin(W_EGG * y), z: [-1.6, 1.6], c: [-1, 1], ab: 0.5 },
  cone: { label: 'Cone \\(r = \\lVert x\\rVert\\)', ztitle: 'r', feat: () => ({ id: 'r', params: {} }), h: (x, y) => Math.hypot(x, y), z: [-0.5, 4.5], c: [-1, 4], ab: 1 },
};

// Push the plane in m.state into the 2-D scene: features [x1, x2, h], hand-set weights.
function syncCfg(c, s) {
  c.features = [{ id: 'raw', params: {} }, SURF[s.surface].feat()];
  c.fit.mode = 'manual';
  c.fit.w = [s.side * s.c, s.side * s.a, s.side * s.b, -s.side];
  c.view.handles = false;
}
const preset = (m, c, patch, dataset) => {
  Object.assign(m.state, patch);
  if (dataset) c.dataset = { id: dataset, params: {} };
  syncCfg(c, m.state);
};

function animateLift(m) {
  cancelAnimationFrame(m.state.anim);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { m.state.t = 1; m.state.dirty3d = true; return; }
  const t0 = performance.now();
  const step = () => {
    m.state.t = Math.min(1, (performance.now() - t0) / 1600);
    m.state.dirty3d = true;
    m.scene.invalidate('paint');
    if (m.state.t < 1) m.state.anim = requestAnimationFrame(step);
  };
  m.state.t = 0;
  m.state.anim = requestAnimationFrame(step);
}

export default standardModule({
  id: 'lift',
  title: 'A flat cut through a curved surface',
  short: '3-D lift',
  core: true,
  zpanel: false,
  keyIdea: 'Add a third feature \\(h(x)\\), say \\(x_1^2 + x_2^2\\), and every point is lifted onto a bowl. A <b>flat plane</b> \\(h = a x_1 + b x_2 + c\\) slices the bowl, and seen from above, the slice is a circle. That is how a linear classifier in Z-space draws a curve in X-space.',
  initial: () => ({ dataset: { id: 'circles', params: {} }, features: [{ id: 'raw' }, { id: 'r2' }], fit: { mode: 'manual', lambda: 1e-3, w: [1.9, 0, 0, -1] }, view: { handles: false } }),
  initialState: () => ({ surface: 'bowl', a: 0, b: 0, c: 1.9, side: 1, t: 1, cam: 'oblique', showSurface: true, dirty3d: true }),
  controls(m, el) {
    const s = m.state, S = SURF[s.surface];
    const setPlane = (k) => (v) => { s[k] = v; s.dirty3d = true; m.set((c) => syncCfg(c, s)); };
    el.append(
      ...datasetControl(m, ['circles', 'offcircle', 'xor', 'checker'], { params: false }),
      buttonRow(Object.entries(SURF).map(([k, v]) => ({
        label: v.label, pressed: s.surface === k,
        onClick: () => m.apply((c) => { s.surface = k; s.a = 0; s.b = 0; s.c = k === 'bowl' ? 1.9 : k === 'cone' ? 1.35 : 0; s.side = k === 'bowl' || k === 'cone' ? 1 : -1; s.dirty3d = true; syncCfg(c, s); }),
      })), { label: 'Lift surface \\(h(x)\\)' }),
      buttonRow([
        { label: '⤒ Lift!', primary: true, onClick: () => animateLift(m) },
        { label: 'Fit plane (logistic regression)', onClick: () => fitPlane(m) },
      ]),
      slider({ label: 'Plane height \\(c\\)', min: S.c[0], max: S.c[1], step: 0.01, value: s.c, onInput: setPlane('c') }).el,
      slider({ label: 'Tilt along \\(x_1\\): \\(a\\)', min: -S.ab, max: S.ab, step: 0.01, value: s.a, onInput: setPlane('a') }).el,
      slider({ label: 'Tilt along \\(x_2\\): \\(b\\)', min: -S.ab, max: S.ab, step: 0.01, value: s.b, onInput: setPlane('b') }).el,
      toggle({ label: 'Orange <b>below</b> the plane (uncheck: above)', value: s.side > 0, onChange: (v) => { s.side = v ? 1 : -1; s.dirty3d = true; m.set((c) => syncCfg(c, s)); } }).el,
      buttonRow(Object.keys(CAMERAS).map((k) => ({ label: k[0].toUpperCase() + k.slice(1) + ' view', pressed: s.cam === k, onClick: () => { s.cam = k; s.forceCam = true; s.dirty3d = true; m.rebuild(); m.scene.invalidate('paint'); } })), { label: '3-D camera' }),
      more([
        toggle({ label: 'Show the lifted surface', value: s.showSurface, onChange: (v) => { s.showSurface = v; s.dirty3d = true; m.scene.invalidate('paint'); } }).el,
        ...viewToggles(m, ['test']),
      ]),
    );
  },
  describe(m) {
    const s = m.state;
    if (s.surface !== 'bowl') return '';
    const rr = s.c + (s.a * s.a + s.b * s.b) / 4;
    return rr > 0 ? `circle, center (${fmt(s.a / 2)}, ${fmt(s.b / 2)}), radius ${fmt(Math.sqrt(rr))}` : 'no intersection: one class everywhere';
  },
  beats: [
    {
      title: 'Lift the points',
      html: 'Watch the 3-D panel: each point \\((x_1, x_2)\\) rises to height \\(h = x_1^2 + x_2^2\\). Inner (orange) points stay low; outer (blue) points rise high. Click <b>⤒ Lift!</b> to replay.',
      apply: (c, m) => { preset(m, c, { surface: 'bowl', a: 0, b: 0, c: 1.9, side: 1, cam: 'oblique', forceCam: true }, 'circles'); setTimeout(() => animateLift(m), 300); },
    },
    {
      title: 'Slide the plane up and down',
      html: 'A horizontal plane \\(h = c\\) cuts the bowl where \\(x_1^2 + x_2^2 = c\\): a circle of radius \\(\\sqrt{c}\\). The 2-D plot shows exactly that circle. Move the <b>plane height</b> slider.',
      apply: (c, m) => preset(m, c, { surface: 'bowl', a: 0, b: 0, c: 1.9, side: 1, t: 1 }, 'circles'),
    },
    {
      title: 'Tilt the plane: the circle moves',
      html: 'Tilting gives \\(x_1^2 + x_2^2 = a x_1 + b x_2 + c\\), i.e. \\((x_1 - \\tfrac a2)^2 + (x_2 - \\tfrac b2)^2 = c + \\tfrac{a^2+b^2}{4}\\). The center moves to \\((a/2, b/2)\\). That is Module 1’s “linear terms shift the center”, seen as geometry. Try the off-center circle data and click <b>Fit plane</b>.',
      apply: (c, m) => preset(m, c, { surface: 'bowl', a: 1.2, b: -0.6, c: 1.5, side: 1, t: 1 }, 'offcircle'),
    },
    {
      title: 'Below the bowl',
      html: 'If the plane sits entirely under the bowl (\\(c < -(a^2+b^2)/4\\)), they never meet: no boundary, every point gets the same class.',
      apply: (c, m) => preset(m, c, { surface: 'bowl', a: 0, b: 0, c: -1, side: 1, t: 1 }, 'circles'),
    },
    {
      title: 'A saddle solves XOR',
      html: 'Lift with \\(h = x_1x_2\\) instead: quadrants I and III go up, II and IV go down. The flat plane \\(h = 0\\) separates them perfectly. Same trick, different surface.',
      apply: (c, m) => preset(m, c, { surface: 'saddle', a: 0, b: 0, c: 0, side: -1, t: 1, cam: 'oblique', forceCam: true }, 'xor'),
    },
    {
      title: 'The view from above',
      html: 'Switch to the <b>Top view</b>: the 3-D picture becomes the 2-D plot. The curved boundary you see in X-space is the shadow of a flat cut in Z-space. Try the egg-crate surface on the checkerboard too.',
      apply: (c, m) => preset(m, c, { surface: 'bowl', a: 0, b: 0, c: 1.9, side: 1, t: 1, cam: 'top', forceCam: true }, 'circles'),
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'A horizontal plane slices the bowl \\(h = x_1^2 + x_2^2\\). Seen from above, the slice is a…',
      choices: ['line', 'circle', 'parabola', 'square'], answer: 1,
      explain: 'A circle: \\(x_1^2 + x_2^2 = c\\).',
      reveal: (c, m) => preset(m, c, { surface: 'bowl', a: 0, b: 0, c: 1.9, side: 1, t: 1, cam: 'top', forceCam: true }, 'circles'),
    },
    {
      id: 'q2', prompt: 'You tilt the plane by increasing \\(a\\). The circle in the 2-D plot…',
      choices: ['becomes an ellipse', 'moves sideways (and changes size)', 'shrinks to a point', 'disappears'], answer: 1,
      explain: 'Completing the square: center \\((a/2, b/2)\\), radius² \\(= c + (a^2+b^2)/4\\). The cut of a paraboloid by any plane, seen from above, is always a circle.',
      reveal: (c, m) => preset(m, c, { surface: 'bowl', a: 2, b: 0, c: 1, side: 1, t: 1, cam: 'oblique', forceCam: true }, 'circles'),
    },
    {
      id: 'q3', prompt: 'Which lift surface makes XOR separable by a flat plane?',
      choices: ['Bowl \\(x_1^2 + x_2^2\\)', 'Saddle \\(x_1x_2\\)', 'Cone \\(r\\)'], answer: 1,
      explain: 'The saddle: \\(x_1x_2\\) is positive in quadrants I/III and negative in II/IV, so the plane \\(h = 0\\) splits them.',
      reveal: (c, m) => preset(m, c, { surface: 'saddle', a: 0, b: 0, c: 0, side: -1, t: 1 }, 'xor'),
    },
  ],
  inPractice: 'This “lift, then cut flat” picture is the geometric idea behind kernel methods and SVMs: map the data into a space where a hyperplane works. Lecture 5’s phrase “classify in Z-space, transform back to X-space” is exactly this.',
  why: 'With \\(z = [x_1, x_2, h(x)]\\), the classifier \\(w_0 + w_1 x_1 + w_2 x_2 + w_3 h(x)\\) is a plane in 3-D. Its zero set is \\(h(x) = a x_1 + b x_2 + c\\) with \\(a = -w_1/w_3\\), \\(b = -w_2/w_3\\), \\(c = -w_0/w_3\\). <b>Fit plane</b> runs logistic regression on these three features and converts the weights to \\((a, b, c)\\).',
  extras(m) {
    const box = h('div', { class: 'plotly-box' }, 'Loading 3-D view…');
    const c3 = h('section', { class: 'card plot-card' }, h('div', { class: 'plot-title' }, h('b', {}, 'Z-space in 3-D'), h('span', {}, 'z = (x₁, x₂, h(x))')), box,
      h('div', { class: 'legend' }, h('span', {}, h('span', { class: 'sw line' }), 'where the plane cuts the surface (solid) and its shadow (dashed)')));
    m.vizRow.classList.remove('single');
    m.vizRow.style.gridTemplateColumns = 'minmax(0, 1.15fr) minmax(0, 1fr)';
    m.vizRow.prepend(c3);
    let ready = false, raf = 0;
    loadPlotly().then(() => { ready = true; box.textContent = ''; m.state.dirty3d = true; draw(); }).catch((e) => { box.textContent = e.message; });
    const draw = () => {
      raf = 0;
      if (!ready || !m.scene.split) return;
      const s = m.state, S = SURF[s.surface];
      renderLift(box, {
        X: m.scene.split.train.X, y: m.scene.split.train.y, hfun: S.h, t: s.t, plane: { a: s.a, b: s.b, c: s.c },
        showSurface: s.showSurface, zRange: S.z, zTitle: S.ztitle, camera: CAMERAS[s.cam], forceCamera: s.forceCam,
      });
      s.forceCam = false;
      s.dirty3d = false;
    };
    let lastSplit = null;
    return {
      update(sc) {
        if (sc.split !== lastSplit) { lastSplit = sc.split; m.state.dirty3d = true; }
        if (m.state.dirty3d && !raf) raf = requestAnimationFrame(draw);
      },
      onApply() { m.state.dirty3d = true; },
      destroy() { cancelAnimationFrame(m.state.anim); cancelAnimationFrame(raf); if (window.Plotly) window.Plotly.purge(box); },
    };
  },
});

function fitPlane(m) {
  const w = m.scene.fitNow();
  if (!(Math.abs(w[3]) > 1e-9)) return;
  const s = m.state, lim = SURF[s.surface];
  s.a = clamp(-w[1] / w[3], -lim.ab, lim.ab); s.b = clamp(-w[2] / w[3], -lim.ab, lim.ab); s.c = clamp(-w[0] / w[3], lim.c[0], lim.c[1]);
  s.side = -w[3] > 0 ? 1 : -1;
  s.dirty3d = true;
  m.apply((c) => syncCfg(c, s));
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, +v.toFixed(3)));
