import { standardModule, datasetControl, weightControls, lambdaControl, viewToggles, buttonRow, more, h, card, toggle, equationHtml, renderMath, store } from './common.js';
import { classifyConic, iou, marchingSquares } from '../geometry.js';

const KEYS = ['m1,0', 'm0,1', 'm2,0', 'm1,1', 'm0,2'];
const MASKS = [
  { label: 'all five', mask: [1, 1, 1, 1, 1], reach: 'Every conic: ellipse, circle, parabola, hyperbola, pairs of lines, at any center and tilt.' },
  { label: '\\([x_1^2,\\ x_2^2]\\)', mask: [0, 0, 1, 0, 1], reach: 'Axis-aligned ellipses and hyperbolas <b>centered at the origin</b> (a circle when the two weights are equal).' },
  { label: '\\([x_1x_2]\\)', mask: [0, 0, 0, 1, 0], reach: 'Hyperbolas \\(x_1x_2 = c\\) with the axes as asymptotes (two crossing lines when \\(c = 0\\)).' },
  { label: '\\([x_1,\\ x_1^2,\\ x_2]\\)', mask: [1, 1, 1, 0, 0], reach: 'Vertical parabolas \\(x_2 = a x_1^2 + b x_1 + c\\) and lines.' },
];

const R2 = Math.SQRT1_2;
const TARGETS = [
  { name: 'Circle, radius 2', g: (x, y) => 4 - x * x - y * y },
  { name: 'Circle at (1, −0.5), radius 1.5', g: (x, y) => 2.25 - (x - 1) ** 2 - (y + 0.5) ** 2 },
  { name: 'Parabola opening up (orange above)', g: (x, y) => y - (0.5 * x * x - 1) },
  { name: 'Hyperbola x₁x₂ = 0.5 (orange in quadrants I & III)', g: (x, y) => x * y - 0.5 },
  { name: 'Band |x₁| < 1', g: (x) => 1 - x * x },
  { name: 'Ellipse tilted 45°', g: (x, y) => { const u = R2 * (x + y), v = R2 * (x - y); return 1 - u * u / 4 - v * v; } },
];

const quad = (mask) => [{ id: 'quad2', params: { mask } }];
const circle = (r) => [r * r, 0, 0, -1, 0, -1];

// Full 6-vector [w0, x1, x2, x1², x1x2, x2²] from the scene's raw weights.
function fullW(sc) {
  const w = [sc.wRaw[0], 0, 0, 0, 0, 0];
  sc.prep.fmap.columns.forEach((c, k) => { const i = KEYS.indexOf(c.key); if (i >= 0) w[i + 1] = sc.wRaw[k + 1]; });
  return w;
}
// Weights for a mask, taken from a full 6-vector.
function maskW(full, mask) {
  const out = [full[0]];
  mask.forEach((on, i) => { if (on) out.push(full[i + 1]); });
  return out;
}

function animateW(m, k, from, to, ms) {
  cancelAnimationFrame(m.state.anim);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { m.set((c) => { c.fit.w[k] = to; }); m.rebuild(); return; }
  const t0 = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / ms);
    m.set((c) => { c.fit.w[k] = +(from + (to - from) * t).toFixed(3); });
    if (t < 1) m.state.anim = requestAnimationFrame(step);
    else m.rebuild();
  };
  m.state.anim = requestAnimationFrame(step);
}

export default standardModule({
  id: 'conics',
  title: 'Sculpt every conic',
  short: 'Polynomial: conics',
  core: true,
  keyIdea: 'With five quadratic features \\(z = [x_1,\\ x_2,\\ x_1^2,\\ x_1x_2,\\ x_2^2]\\), the flat boundary \\(w_0 + w^\\top z = 0\\) becomes \\(w_0 + w_1x_1 + w_2x_2 + w_3x_1^2 + w_4x_1x_2 + w_5x_2^2 = 0\\): a <b>conic section</b>. Six numbers sculpt circles, ellipses, parabolas and hyperbolas.',
  initial: () => ({ dataset: { id: 'none', params: {} }, features: quad([1, 1, 1, 1, 1]), fit: { mode: 'manual', lambda: 1e-3, w: circle(1) } }),
  initialState: () => ({ target: -1, solved: store('conics:solved') || {} }),
  controls(m, el) {
    const mask = m.cfg.features[0].params.mask;
    const cur = MASKS.find((x) => x.mask.join() === mask.join());
    el.append(
      ...datasetControl(m, ['none', 'offcircle', 'xor', 'circles'], { params: true }),
      buttonRow(MASKS.map((x) => ({
        label: x.label, pressed: x.mask.join() === mask.join(),
        onClick: () => {
          const full = m.cfg.fit.mode === 'manual' ? fullW(m.scene) : [1, 0, 0, -1, 0, -1];
          m.apply((c) => { c.features = quad(x.mask); c.fit.w = maskW(full, x.mask); });
        },
      })), { label: 'Which quadratic features?' }),
      h('div', { class: 'hint', html: `<b>Reachable shapes:</b> ${cur ? cur.reach : 'a subset of the conics.'}` }),
      more([h('div', { class: 'ctl' }, ...KEYS.map((k, i) => toggle({
        label: ['\\(x_1\\)', '\\(x_2\\)', '\\(x_1^2\\)', '\\(x_1x_2\\)', '\\(x_2^2\\)'][i], value: !!mask[i],
        onChange: (b) => {
          const full = m.cfg.fit.mode === 'manual' ? fullW(m.scene) : [1, 0, 0, -1, 0, -1];
          const nm = mask.slice(); nm[i] = b ? 1 : 0;
          m.apply((c) => { c.features = quad(nm); c.fit.w = maskW(full, nm); });
        },
      }).el))], 'Pick individual terms'),
      ...weightControls(m, { range: 3, biasRange: 6 }),
      h('div', { class: 'eq', id: 'conic-eq' }),
      more([lambdaControl(m), ...viewToggles(m, ['test', 'mistakes', 'shade'])]),
    );
  },
  describe(m, sc) {
    const c = classifyConic(fullW(sc));
    return `<span class="badge">${c.name}</span> <span class="hint">${c.detail}</span>`;
  },
  onFrame(m, sc) {
    const eq = m.controlsEl.querySelector('#conic-eq');
    const now = performance.now();
    if (eq && now - (m.state.eqT || 0) > 90) { m.state.eqT = now; eq.innerHTML = equationHtml(sc); }
  },
  beats: [
    {
      title: 'Six weights, one equation',
      html: 'Each slider is one coefficient of \\(w_0 + w_1x_1 + w_2x_2 + w_3x_1^2 + w_4x_1x_2 + w_5x_2^2 = 0\\). Right now \\(w_0 = 1,\\ w_3 = w_5 = -1\\): that is \\(x_1^2 + x_2^2 = 1\\), a circle (see the <b>Boundary</b> badge). Inside, the score is positive, so it is orange.',
      apply: (c) => { c.dataset = { id: 'none', params: {} }; c.features = quad([1, 1, 1, 1, 1]); c.fit.mode = 'manual'; c.fit.w = circle(1); },
    },
    {
      title: 'Your turn: radius 2',
      html: 'The dashed target is a circle of radius 2. Change <b>one</b> slider to match it. (Hint: \\(x_1^2 + x_2^2 = r^2\\).) The Shape Match panel below says when you have it.',
      apply: (c, m) => { c.dataset = { id: 'none', params: {} }; c.features = quad([1, 1, 1, 1, 1]); c.fit.mode = 'manual'; c.fit.w = circle(1); m.state.target = 0; },
    },
    {
      title: 'Sweep the cross term',
      html: 'Slowly drag \\(w_4\\) (on \\(x_1x_2\\)) from 0 up to 3 and watch the badge. The circle stretches into an ellipse, becomes <b>two parallel lines</b> exactly at \\(w_4 = 2\\) (because \\(x_1^2 + 2x_1x_2 + x_2^2 = (x_1+x_2)^2\\)), and then a hyperbola. The sign of \\(B^2 - 4AC\\) decides.',
      apply: (c, m) => { c.dataset = { id: 'none', params: {} }; c.features = quad([1, 1, 1, 1, 1]); c.fit.mode = 'manual'; c.fit.w = circle(1.5); m.state.target = -1; },
    },
    {
      title: 'Moving the center needs the linear terms',
      html: 'This circle is centered at \\((1, -0.5)\\). Expanding \\((x_1 - a)^2 = x_1^2 - 2a x_1 + a^2\\) shows that shifting the center <b>creates</b> \\(x_1\\) and \\(x_2\\) terms. Set \\(w_1\\) and \\(w_2\\) to 0 and the circle jumps back to the origin.',
      apply: (c, m) => { c.dataset = { id: 'none', params: {} }; c.features = quad([1, 1, 1, 1, 1]); c.fit.mode = 'manual'; c.fit.w = [1, 2, -1, -1, 0, -1]; m.state.target = 1; },
    },
    {
      title: 'Fewer features, fewer shapes',
      html: 'Use the feature buttons to drop terms. With only \\([x_1^2, x_2^2]\\) you can make circles and axis-aligned ellipses, but only <b>centered at the origin</b>. With only \\([x_1x_2]\\) you get the XOR hyperbola. Every feature you leave out removes a whole family of boundaries.',
      apply: (c, m) => { c.dataset = { id: 'none', params: {} }; c.features = quad([0, 0, 1, 0, 1]); c.fit.mode = 'manual'; c.fit.w = [1, -1, -0.5]; m.state.target = -1; },
    },
    {
      title: 'Let the data choose the conic',
      html: 'Now logistic regression picks all six weights from data. On the off-center circle it finds the center by itself. Switch the dataset to <b>XOR</b> and see which conic it picks. Click <b>Set weights by hand</b> to see (rescaled) fitted weights on the sliders.',
      apply: (c, m) => { c.dataset = { id: 'offcircle', params: {} }; c.features = quad([1, 1, 1, 1, 1]); c.fit.mode = 'auto'; m.state.target = -1; },
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'Start from the circle \\(x_1^2 + x_2^2 = 1\\) and raise the \\(x_1x_2\\) weight \\(w_4\\) from 0 to 3. What happens?',
      choices: ['It stays a circle, just bigger', 'Ellipse → two parallel lines (at \\(w_4 = 2\\)) → hyperbola', 'It rotates but stays a circle', 'It becomes a parabola'], answer: 1,
      explain: 'With \\(A = C = 1\\), \\(B^2 - 4AC = w_4^2 - 4\\): negative (ellipse) for \\(w_4 < 2\\), zero at 2 (here two parallel lines \\(x_1 + x_2 = \\pm 1\\)), positive (hyperbola) after. Watch the reveal animate it.',
      reveal: (c, m) => {
        c.dataset = { id: 'none', params: {} }; c.features = quad([1, 1, 1, 1, 1]); c.fit.mode = 'manual'; c.fit.w = circle(1);
        setTimeout(() => animateW(m, 4, 0, 3, 4000), 50);
      },
    },
    {
      id: 'q2', prompt: 'Which <b>single</b> feature makes the centered XOR data separable?',
      choices: ['\\(x_1^2\\)', '\\(x_1 x_2\\)', '\\(x_1 + x_2\\)', '\\(x_2^2\\)'], answer: 1,
      explain: '\\(x_1x_2 > 0\\) exactly in quadrants I and III. One feature, one threshold.',
      reveal: (c) => { c.dataset = { id: 'xor', params: {} }; c.features = quad([0, 0, 0, 1, 0]); c.fit.mode = 'auto'; },
    },
    {
      id: 'q3', prompt: 'A circle centered at \\((1, 1)\\). Can the features \\([x_1^2, x_2^2]\\) alone fit it?',
      choices: ['Yes', 'No: you also need \\(x_1\\) and \\(x_2\\) (or a radius measured from \\((1,1)\\))'], answer: 1,
      explain: 'No. Without linear terms every boundary is symmetric about the origin. \\((x_1-1)^2\\) needs the \\(-2x_1\\) term. (Module 4 shows the other fix: a radius feature centered at the right place.)',
      reveal: (c) => { c.dataset = { id: 'offcircle', params: { a: 1, b: 1, R: 1.2 } }; c.features = quad([0, 0, 1, 0, 1]); c.fit.mode = 'auto'; },
    },
  ],
  inPractice: 'Squared and interaction terms are everywhere in applied regression: price × quantity, age², dose × weight. An interaction \\(x_1x_2\\) says “the effect of \\(x_1\\) depends on \\(x_2\\)”, exactly the XOR situation.',
  why: 'The boundary is still flat in Z-space: \\(w_0 + w^\\top z = 0\\) is a hyperplane in 5-D. Mapping it back through \\(z = \\Phi(x)\\) gives a degree-2 curve in \\(x\\). The badge uses the discriminant \\(B^2 - 4AC\\) (with \\(A = w_3, B = w_4, C = w_5\\)) and the determinant of the 3×3 conic matrix to tell ellipses, parabolas, hyperbolas and the degenerate line cases apart.',
  extras(m, el) {
    const c = card('Shape Match');
    const row = h('div', { class: 'btn-row' });
    const status = h('div', { class: 'hint' });
    c.body.append(h('p', { class: 'hint', html: 'Pick a target, then use the weight sliders (hand mode) to make the <b>orange region</b> match the dashed outline. You win at 95% overlap (IoU).' }), row, status);
    el.append(c.el);
    const btns = TARGETS.map((t, i) => {
      const b = h('button', { class: 'btn', type: 'button' }, t.name);
      b.addEventListener('click', () => {
        m.state.target = m.state.target === i ? -1 : i;
        if (m.state.target >= 0) m.apply((cf) => { cf.dataset = { id: 'none', params: {} }; if (cf.fit.mode !== 'manual') { cf.fit.mode = 'manual'; cf.fit.w = maskW([1, 0, 0, -1, 0, -1], cf.features[0].params.mask); } });
        sync();
      });
      row.append(b);
      return b;
    });
    let ghostFor = -2;
    function sync() {
      btns.forEach((b, i) => {
        b.setAttribute('aria-pressed', String(m.state.target === i));
        b.textContent = (m.state.solved[i] ? '✓ ' : '') + TARGETS[i].name;
      });
      if (ghostFor !== m.state.target) {
        ghostFor = m.state.target;
        const t = TARGETS[m.state.target];
        if (t) {
          const G = 160, V = new Float32Array(G * G);
          for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) V[j * G + i] = t.g(-3 + (6 * (i + 0.5)) / G, -3 + (6 * (j + 0.5)) / G);
          m.scene.ghosts = [{ segs: marchingSquares(V, G), G, width: 2.5, dash: [7, 5] }];
        } else m.scene.ghosts = [];
        m.scene.invalidate('paint');
        if (!t) status.textContent = '';
      }
    }
    sync();
    return {
      onApply: sync,
      update(sc) {
        sync();
        const t = TARGETS[m.state.target];
        if (!t || !sc.grid) return;
        const { G, V } = sc.grid, A = new Uint8Array(G * G), B = new Uint8Array(G * G), notA = new Uint8Array(G * G);
        for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
          const k = j * G + i;
          A[k] = V[k] > 0 ? 1 : 0; notA[k] = 1 - A[k];
          B[k] = t.g(-3 + (6 * (i + 0.5)) / G, -3 + (6 * (j + 0.5)) / G) > 0 ? 1 : 0;
        }
        const s = iou(A, B), flipped = iou(notA, B);
        if (s >= 0.95) {
          if (!m.state.solved[m.state.target]) { m.state.solved[m.state.target] = true; store('conics:solved', m.state.solved); }
          status.innerHTML = `<b style="color:var(--good)">✓ Match! IoU ${(100 * s).toFixed(0)}%.</b> Try another target.`;
        } else if (flipped >= 0.95) status.innerHTML = `Right shape, wrong side (IoU of the blue region ${(100 * flipped).toFixed(0)}%). Click <b>Flip all signs</b>.`;
        else status.innerHTML = `Overlap (IoU) with target: <b>${(100 * s).toFixed(0)}%</b>`;
      },
      destroy() { cancelAnimationFrame(m.state.anim); },
    };
  },
});
