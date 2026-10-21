import { standardModule, datasetControl, weightControls, featureParams, lambdaControl, sampleControls, viewToggles, group, more, toggle, h, card, dlist } from './common.js';
import { XPlot } from '../plot2d.js';
import { Scene } from '../scene.js';
import { spiralOmega } from '../datasets.js';

const RAW = [{ id: 'raw', params: {} }];

export const GALLERY = [
  { name: 'Line', cap: 'raw [x₁, x₂]', to: 'intro', ds: 'blobs', f: RAW },
  { name: 'Circle', cap: 'one feature: r', to: 'polar', ds: 'circles', f: [{ id: 'r' }] },
  { name: 'Hyperbola', cap: 'one feature: x₁x₂', to: 'conics', ds: 'xor', f: [{ id: 'x1x2' }] },
  { name: 'Ring', cap: '[r, r²]', to: 'polar', ds: 'ring', f: [{ id: 'r' }, { id: 'r2' }] },
  { name: 'Flower', cap: '[r, sin 5θ, cos 5θ]', to: 'polar', ds: 'flower', f: [{ id: 'r' }, { id: 'petal', params: { k: 5 } }] },
  { name: 'Spiral', cap: '[sin(ωr−θ), cos(ωr−θ)]', to: 'polar', ds: 'spirals', f: [{ id: 'spiral', params: { omega: spiralOmega(2) } }] },
  { name: 'Checkerboard', cap: 'sin ωx₁ · sin ωx₂', to: 'fourier', ds: 'checker', f: [{ id: 'checker', params: { w: Math.PI / 1.5 } }] },
  { name: 'Staircase', cap: 'bins (one-hot)', to: 'piecewise', ds: 'circles', f: [{ id: 'bins', params: { B: 6 } }] },
];

// Small live thumbnails, each a real fit by the same engine.
export function gallery(items, el, { title, note } = {}) {
  const c = card(title || 'All of these are linear classifiers');
  const grid = h('div', { class: 'gallery' });
  const live = [];
  for (const it of items) {
    const box = h('div', { class: 'plot-box' });
    const a = h('a', { href: `#${it.to}`, title: `Open the module that explains this shape` }, box, h('div', { class: 'cap' }, h('b', {}, it.name), it.cap));
    grid.append(a);
    const plot = new XPlot(box, { thumb: true });
    const sc = new Scene({ plot, thumb: true, cfg: { dataset: { id: it.ds, params: it.params || {} }, features: it.f, split: { nTrain: 160, nTest: 40 }, fit: { mode: 'auto', lambda: it.lambda || 1e-4 } } });
    live.push({ plot, sc });
  }
  c.body.append(grid);
  if (note) c.body.append(h('p', { class: 'hint', html: note }));
  el.append(c.el);
  return { destroy: () => live.forEach(({ plot, sc }) => { sc.destroy(); plot.destroy(); }) };
}

export default standardModule({
  id: 'intro',
  title: 'Lines are all you get',
  short: 'Intro: raw features',
  core: true,
  keyIdea: 'A logistic classifier on the raw inputs, \\(\\sigma(w_0 + w_1x_1 + w_2x_2)\\), can only draw a straight line. Real models feed the same classifier <b>transformed features</b> \\(z = \\Phi(x)\\), and then its boundary can bend.',
  initial: () => ({ dataset: { id: 'blobs', params: {} }, features: RAW, fit: { mode: 'auto', lambda: 1e-3 } }),
  controls(m, el) {
    const mix = m.cfg.features[0].id === 'linmix';
    el.append(
      ...datasetControl(m, ['blobs', 'circles', 'xor', 'moons', 'spirals']),
      ...weightControls(m),
      group('Remix the features linearly', [
        toggle({
          label: 'Use \\(z = \\) rotate + scale of \\(x\\) instead of raw \\(x\\)', value: mix,
          onChange: (b) => m.apply((c) => { c.features = b ? [{ id: 'linmix', params: { alpha: 45, s1: 2, s2: 0.5 } }] : RAW; c.fit.mode = 'auto'; }),
        }).el,
        ...(mix ? featureParams(m, 0) : []),
        h('div', { class: 'hint', html: 'Features are always standardized before fitting; see “Why it works”.' }),
      ], { essential: false }),
      more([lambdaControl(m), ...sampleControls(m), ...viewToggles(m, ['test', 'mistakes', 'shade'])]),
    );
  },
  beats: [
    {
      title: 'One model, one boundary',
      html: 'The model is \\(P(y{=}1\\mid x) = \\sigma(w_0 + w_1x_1 + w_2x_2)\\). Shading shows that probability (orange = class 1). The dark line is where \\(w_0 + w_1x_1 + w_2x_2 = 0\\), i.e. \\(P = 0.5\\). <b>Hover anywhere</b> on the plot to see the score at that point.',
      apply: (c) => { c.dataset = { id: 'blobs', params: {} }; c.features = RAW; c.fit.mode = 'auto'; },
    },
    {
      title: 'Draw the line yourself',
      html: 'You are now choosing \\(w_0, w_1, w_2\\) by hand. Move the sliders and watch the line turn and slide, and the train accuracy and cross-entropy change. Then click <b>Snap to best fit</b>: logistic regression picks the weights that minimize cross-entropy.',
      apply: (c) => { c.dataset = { id: 'blobs', params: {} }; c.features = RAW; c.fit.mode = 'manual'; c.fit.w = [0.5, 1, -1.5]; },
    },
    {
      title: 'A dataset no line can split',
      html: 'Concentric circles. The best possible line is barely better than a coin flip: whatever \\(w\\) you choose, one side of a line always contains both inner and outer points.',
      apply: (c) => { c.dataset = { id: 'circles', params: {} }; c.features = RAW; c.fit.mode = 'auto'; },
    },
    {
      title: 'Linear remixes do not help',
      html: 'Now \\(z\\) is a rotated and stretched copy of \\(x\\). The Z-space panel looks different, but in X-space the boundary is <b>still a line</b>: \\(w^\\top (Ax) = (A^\\top w)^\\top x\\) is linear in \\(x\\). Try the rotation and scale sliders.',
      apply: (c) => { c.dataset = { id: 'circles', params: {} }; c.features = [{ id: 'linmix', params: { alpha: 45, s1: 2, s2: 0.5 } }]; c.fit.mode = 'auto'; },
    },
    {
      title: 'One nonlinear feature changes everything',
      html: 'Replace \\(x\\) by a single feature, the radius \\(r = \\lVert x\\rVert\\). The <b>same</b> linear classifier now draws a circle, and accuracy jumps to about 100%. In Z-space it is just a threshold on \\(r\\). The gallery below shows other shapes a linear classifier can draw once you pick \\(\\Phi\\).',
      apply: (c) => { c.dataset = { id: 'circles', params: {} }; c.features = [{ id: 'r', params: {} }]; c.fit.mode = 'auto'; },
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'On the concentric circles, what test accuracy will the <b>best straight line</b> reach?',
      choices: ['About 50–60%', 'About 75%', 'About 90%', '100%'], answer: 0,
      explain: 'About 50–60%. Any line leaves inner and outer points on the same side, so the best it can do is a little better than guessing.',
      reveal: (c) => { c.dataset = { id: 'circles', params: {} }; c.features = RAW; c.fit.mode = 'auto'; },
    },
    {
      id: 'q2', prompt: 'You switch from \\(z = [x_1, x_2]\\) to \\(z = [x_1 + x_2,\\ x_1 - x_2]\\). Which new boundary shapes become possible?',
      choices: ['None: still straight lines', 'Only diagonal lines', 'Circles', 'Any curve'], answer: 0,
      explain: 'None. \\(w_1(x_1+x_2) + w_2(x_1-x_2) = (w_1+w_2)x_1 + (w_1-w_2)x_2\\) is again linear in \\(x\\). An invertible linear remix gives the same set of lines.',
      reveal: (c) => { c.dataset = { id: 'circles', params: {} }; c.features = [{ id: 'linmix', params: { alpha: 45, s1: 1.41, s2: 1.41 } }]; c.fit.mode = 'auto'; },
    },
    {
      id: 'q3', prompt: 'Setting weights by hand on the blobs, can you get a <b>lower training cross-entropy</b> than “best fit”?',
      choices: ['Yes, with enough patience', 'No: best fit minimizes it, so you can at most tie', 'Only by making the weights huge'], answer: 1,
      explain: 'No. Logistic regression minimizes training cross-entropy (plus a tiny penalty), so it is the floor. You can often match its accuracy, though.',
      reveal: (c) => { c.dataset = { id: 'blobs', params: {} }; c.features = RAW; c.fit.mode = 'auto'; },
    },
  ],
  inPractice: 'Almost every real model uses transformed features:' + dlist([
    'BMI = weight / height² (a ratio and a square)',
    'log(income) instead of income',
    'hour of day as \\((\\sin, \\cos)\\) so 23:59 sits next to 00:00',
    'distance to the nearest store instead of raw latitude and longitude',
  ]),
  why: 'The decision boundary is the set where \\(w_0 + w^\\top z = 0\\). With \\(z = x\\) that is a line. With \\(z = Ax\\) for any matrix \\(A\\), \\(w^\\top Ax = (A^\\top w)^\\top x\\), still a line. Standardizing features (subtracting the mean, dividing by the standard deviation) is also linear, so it never changes which boundaries are <i>possible</i>. With regularization \\(\\lambda > 0\\) it does change which one is <i>chosen</i>, because the penalty depends on the scale of the features.',
  extras: (m, el) => gallery(GALLERY, el, { note: 'Each tile is a live fit of the same logistic regression on a different \\(\\Phi\\). Click a tile to open the module that explains it.' }),
});
