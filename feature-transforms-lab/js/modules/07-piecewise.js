import { standardModule, datasetControl, presetButtons, featureParams, lambdaControl, viewToggles, buttonRow, toggle, more, h, resolveParams, dlist } from './common.js';
import { theme } from '../plot2d.js';

const F = {
  bins: [{ id: 'bins', params: { B: 5 } }],
  bins2d: [{ id: 'bins2d', params: { B: 6 } }],
  hinge: [{ id: 'raw', params: {} }, { id: 'hinge', params: { knots: [0] } }],
  corner: [{ id: 'cornerind', params: { t: 0.8, s: 0.6 } }],
  relu: [{ id: 'relu', params: { m: 20 } }],
};
const PRESETS = [
  { label: 'bins per axis', features: F.bins },
  { label: '2-D grid cells', features: F.bins2d },
  { label: '\\([x_1, x_2]\\) + hinges', features: F.hinge },
  { label: 'corner indicator', features: F.corner },
  { label: 'random ReLU units', features: F.relu },
];
const set = (c, ds, feats, extra = {}) => {
  c.dataset = { id: ds, params: extra.params || {} }; c.features = structuredClone(feats);
  c.fit.mode = 'auto'; c.fit.lambda = extra.lambda ?? 1e-3; c.view.showTest = !!extra.showTest; c.split.nTrain = extra.nTrain ?? 200;
};

// Faint lines where each random ReLU unit switches on: uᵢᵀ(x − pᵢ) = 0.
function reluOverlay(sc) {
  const idx = sc.cfg.features.findIndex((f) => f.id === 'relu');
  if (idx < 0 || !sc.prep || sc.cfg.view.kinks === false) return [];
  const units = sc.prep.fmap.parts[idx].inst.units;
  return [(ctx, plot) => {
    const T = theme();
    ctx.save();
    ctx.strokeStyle = T.ink2; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    units.U.forEach((u, i) => {
      const p = units.P[i], dx = -u[1], dy = u[0];
      ctx.moveTo(plot.sx(p[0] - 10 * dx), plot.sy(p[1] - 10 * dy));
      ctx.lineTo(plot.sx(p[0] + 10 * dx), plot.sy(p[1] + 10 * dy));
    });
    ctx.stroke();
    ctx.restore();
  }];
}

export default standardModule({
  id: 'piecewise',
  title: 'Piecewise features: bins, hinges and ReLUs',
  short: 'Piecewise & ReLU',
  keyIdea: 'Indicator and hinge features make boundaries out of straight pieces. <b>Bins</b> give staircases (like a decision tree), <b>hinges</b> \\(\\max(0, x_1 - t)\\) give bends at knots, and <b>random ReLU units</b> are a neural network whose first layer is frozen.',
  initial: () => ({ dataset: { id: 'circles', params: {} }, features: F.bins, fit: { mode: 'auto', lambda: 1e-3 } }),
  controls(m, el) {
    el.append(presetButtons(m, PRESETS), ...datasetControl(m, ['circles', 'sine', 'corner', 'moons', 'spirals'], { params: true }));
    m.cfg.features.forEach((f, i) => {
      if (f.id === 'bins' || f.id === 'bins2d') el.append(...featureParams(m, i, ['B']));
      if (f.id === 'relu') {
        el.append(...featureParams(m, i, ['m']));
        el.append(buttonRow([{ label: '🎲 New random units', onClick: () => m.set((c) => { c.featureSeed += 1; }, 'features') }]));
        el.append(toggle({ label: 'Show each unit’s kink line', value: m.cfg.view.kinks !== false, onChange: (b) => m.set((c) => { c.view.kinks = b; }, 'paint') }).el);
      }
      if (f.id === 'hinge') {
        const p = resolveParams(f);
        el.append(h('div', { class: 'hint', html: `Knots at ${p.knots.map((t) => t.toFixed(2)).join(', ') || 'none'}. <b>Drag the dashed lines</b> to move them.` }));
        el.append(buttonRow([
          { label: '+ Add knot', disabled: p.knots.length >= 8, onClick: () => m.apply((c) => { const q = resolveParams(c.features[i]); q.knots = [...q.knots, +(Math.random() * 4 - 2).toFixed(2)]; c.features[i].params = q; }) },
          { label: '− Remove last', disabled: !p.knots.length, onClick: () => m.apply((c) => { const q = resolveParams(c.features[i]); q.knots = q.knots.slice(0, -1); c.features[i].params = q; }) },
        ]));
      }
      if (f.id === 'cornerind') el.append(...featureParams(m, i), h('div', { class: 'hint' }, 'Or drag the corner on the plot.'));
    });
    el.append(lambdaControl(m), more([...viewToggles(m, ['test', 'mistakes', 'shade'])]));
  },
  onFrame(m, sc) { sc.overlays = reluOverlay(sc); },
  beats: [
    {
      title: 'Bins: a staircase',
      html: 'Each axis is cut into \\(B\\) bins and each bin gets a 0/1 indicator feature. The score is a sum of “a value for \\(x_1\\)’s bin” plus “a value for \\(x_2\\)’s bin”, so the boundary is made of horizontal and vertical steps, like a <b>decision tree</b> (Lecture 11). Raise \\(B\\).',
      apply: (c) => set(c, 'circles', F.bins),
    },
    {
      title: 'A lookup table',
      html: '<b>2-D grid cells</b>: one indicator per cell, \\(B^2 - 1\\) features. Now each cell can have its own class. Flexible, but with many cells and little data in each, it overfits; try \\(B = 12\\) with test points shown.',
      apply: (c) => set(c, 'circles', F.bins2d, { showTest: true }),
    },
    {
      title: 'Hinges: bend only at the knots',
      html: 'Features \\([x_1, x_2, \\max(0, x_1 - t_1), \\dots]\\) give a boundary \\(x_2 = f(x_1)\\) that is a straight line between knots and bends <b>only</b> at the knots (a linear spline). Drag the dashed knot and add more to follow the wave.',
      apply: (c) => set(c, 'sine', F.hinge),
    },
    {
      title: 'Corners from an AND',
      html: '\\(\\mathbb 1[x_1 > t]\\cdot\\mathbb 1[x_2 > s]\\) is 1 only in the upper-right quadrant from \\((t, s)\\): an AND of two thresholds. Drag the corner onto the data’s corner.',
      apply: (c) => set(c, 'corner', F.corner),
    },
    {
      title: 'Random ReLUs: a frozen neural net',
      html: 'Each unit is \\(h_i(x) = \\max(0, u_i^\\top (x - p_i))\\) with a random direction \\(u_i\\) and point \\(p_i\\) (dashed line = where it switches on). The boundary is a polygon whose corners can only sit on those lines. A neural network (Lecture 12) also <b>learns</b> \\(u_i\\) and \\(p_i\\), moving the lines to where they are needed: it learns \\(\\Phi\\).',
      apply: (c) => set(c, 'moons', F.relu),
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'With hinge features on \\(x_1\\), can the boundary \\(x_2 = f(x_1)\\) bend anywhere other than at a knot?',
      choices: ['Yes, anywhere', 'No: only at knots'], answer: 1,
      explain: 'Between knots every hinge is either 0 or linear in \\(x_1\\), so \\(f\\) is linear there.',
      reveal: (c) => set(c, 'sine', [{ id: 'raw' }, { id: 'hinge', params: { knots: [-1.5, 0.5] } }]),
    },
    {
      id: 'q2', prompt: 'With \\(m\\) random ReLU units, where can the boundary have corners?',
      choices: ['Anywhere', 'Only on the \\(m\\) dashed kink lines', 'Only at the data points'], answer: 1,
      explain: 'Inside each region between kink lines every unit is linear, so the score is linear and the boundary is straight. It can only turn where some unit switches on.',
      reveal: (c) => set(c, 'moons', [{ id: 'relu', params: { m: 8 } }]),
    },
    {
      id: 'q3', prompt: 'What would training a neural network change compared with these random units?',
      choices: ['Nothing', 'It would also learn \\(u_i, p_i\\): move the kink lines to useful places', 'It would use bins instead'], answer: 1,
      explain: 'A one-hidden-layer ReLU network is exactly this model with \\(u_i, p_i\\) (and the output weights) trained by backpropagation. It learns the feature map.',
    },
  ],
  inPractice: dlist(['age bands, income brackets (binning) in credit scoring', 'piecewise-linear price or dose effects (hinges / splines, as in MARS)', 'ReLU features are the hidden layers of neural nets']),
  why: 'One-hot bins per axis make the score additive: \\(g_1(x_1) + g_2(x_2)\\) with step functions \\(g\\), so the boundary is a staircase. Hinges make \\(g\\) piecewise linear. ReLU units split the plane into regions by their kink lines; inside each region the score is linear, so the boundary is a polygonal path.',
});
