import { standardModule, datasetControl, presetButtons, featureParams, lambdaControl, viewToggles, buttonRow, more, scanChart, dlist } from './common.js';

const W = 1.5, WC = +(Math.PI / 1.5).toFixed(3);
const F = {
  sin: [{ id: 'sinx1', params: { w: W } }],
  sincos: [{ id: 'fourier1', params: { w: W } }],
  wave: [{ id: 'fourier1', params: { w: 1 } }, { id: 'x2', params: {} }],
  checker: [{ id: 'checker', params: { w: WC } }],
  checker4: [{ id: 'checker4', params: { w: WC } }],
  rff: [{ id: 'rff', params: { D: 100, ell: 0.6 } }],
};
const PRESETS = [
  { label: '\\([\\sin\\omega x_1]\\)', features: F.sin },
  { label: '\\([\\sin\\omega x_1,\\ \\cos\\omega x_1]\\)', features: F.sincos },
  { label: '\\([\\sin,\\ \\cos,\\ x_2]\\)', features: F.wave },
  { label: '\\(\\sin\\omega x_1\\sin\\omega x_2\\)', features: F.checker },
  { label: 'all 4 products', features: F.checker4 },
  { label: 'random Fourier features', features: F.rff },
];
const set = (c, ds, feats, params = {}) => { c.dataset = { id: ds, params }; c.features = structuredClone(feats); c.fit.mode = 'auto'; c.fit.lambda = 1e-3; c.view.showTest = false; };

export default standardModule({
  id: 'fourier',
  title: 'Periodic (Fourier) features',
  short: 'Periodic / Fourier',
  keyIdea: 'Sines and cosines make <b>stripes, waves and checkerboards</b>. Two lessons: you need both \\(\\sin\\) and \\(\\cos\\) to place a wave anywhere (phase), and many <b>random</b> cosines can approximate almost any smooth boundary, which leads to kernels.',
  initial: () => ({ dataset: { id: 'stripes', params: {} }, features: F.sin, fit: { mode: 'auto', lambda: 1e-3 } }),
  controls(m, el) {
    el.append(presetButtons(m, PRESETS), ...datasetControl(m, ['stripes', 'sine', 'checker', 'moons', 'spirals'], { params: true }));
    m.cfg.features.forEach((f, i) => {
      if (['sinx1', 'fourier1', 'checker', 'checker4'].includes(f.id)) el.append(...featureParams(m, i, ['w'], { labels: { w: 'Frequency \\(\\omega\\)' } }));
      if (f.id === 'rff') {
        el.append(...featureParams(m, i, ['D', 'ell']));
        el.append(buttonRow([{ label: '🎲 New random features', onClick: () => m.set((c) => { c.featureSeed += 1; }, 'features') }]));
      }
    });
    el.append(more([lambdaControl(m), ...viewToggles(m, ['test', 'mistakes', 'shade'])]));
  },
  beats: [
    {
      title: 'Stripes, and a missing phase',
      html: 'The stripes are \\(\\sin(1.5x_1 + 1) > 0\\): shifted by a phase of 1. With only \\(\\sin 1.5x_1\\) the classifier can scale and threshold the wave, but <b>not shift it</b>, so the stripes are misplaced.',
      apply: (c) => set(c, 'stripes', F.sin),
    },
    {
      title: 'Add cosine: any phase',
      html: 'Since \\(a\\sin u + b\\cos u = R\\sin(u + \\varphi)\\), the pair \\([\\sin\\omega x_1, \\cos\\omega x_1]\\) can place the wave at any phase. That is the same lesson as Module 1: lower-order polynomial terms let a circle move; cosine lets a wave move.',
      apply: (c) => set(c, 'stripes', F.sincos),
    },
    {
      title: 'A sine-wave boundary',
      html: 'With \\([\\sin\\omega x_1, \\cos\\omega x_1, x_2]\\) the boundary is \\(x_2 = A\\sin(\\omega x_1 + \\varphi) + c\\). The weights set \\(A, \\varphi, c\\), but <b>not</b> \\(\\omega\\). Find the right frequency with the slider. The chart below shows accuracy for every \\(\\omega\\): the landscape over \\(\\omega\\) is bumpy, while fitting \\(w\\) is a single convex problem.',
      apply: (c) => set(c, 'sine', F.wave),
    },
    {
      title: 'A checkerboard from one product',
      html: '\\(\\sin\\omega x_1 \\cdot \\sin\\omega x_2\\) changes sign on a grid. For 4 × 4 cells on \\([-3, 3]\\) each cell is 1.5 wide, so \\(\\omega = \\pi/1.5 \\approx 2.09\\). One feature, about 100%. Now open <b>Dataset settings</b> and change the <b>offset</b>: the single product breaks; <b>all 4 products</b> fixes it (phase again).',
      apply: (c) => set(c, 'checker', F.checker),
    },
    {
      title: 'Random Fourier features',
      html: 'Instead of choosing frequencies, draw \\(D\\) random ones: \\(z_i = \\sqrt{2/D}\\cos(\\omega_i^\\top x + b_i)\\). With enough of them, the linear classifier approximates an RBF-kernel SVM. Small length scale \\(\\ell\\) gives wiggly boundaries; large \\(\\ell\\), nearly linear ones. Try the spirals.',
      apply: (c) => set(c, 'moons', F.rff),
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'Stripes at an unknown phase, using only \\(\\sin\\omega x_1\\) (correct \\(\\omega\\)). Can you always fit them?',
      choices: ['Yes', 'No: you also need \\(\\cos\\omega x_1\\)'], answer: 1,
      explain: 'No. \\(w_0 + w_1\\sin\\omega x_1\\) can only threshold an unshifted wave. Adding cosine gives any phase.',
      reveal: (c) => set(c, 'stripes', F.sincos),
    },
    {
      id: 'q2', prompt: 'A 4 × 4 checkerboard on \\([-3, 3]^2\\). Which \\(\\omega\\) makes \\(\\sin\\omega x_1\\sin\\omega x_2\\) change sign at the cell edges?',
      choices: ['\\(\\omega = 1\\)', '\\(\\omega = \\pi/1.5 \\approx 2.09\\)', '\\(\\omega = 4\\)', '\\(\\omega = \\pi\\)'], answer: 1,
      explain: 'Cells are 1.5 wide; \\(\\sin\\omega x\\) changes sign every \\(\\pi/\\omega\\), so \\(\\omega = \\pi/1.5\\).',
      reveal: (c) => set(c, 'checker', F.checker),
    },
    {
      id: 'q3', prompt: 'Random Fourier features with a small length scale \\(\\ell\\). As \\(D\\) goes from 10 to 300 with \\(\\lambda \\approx 0\\), what happens?',
      choices: ['Train and test both keep improving', 'Train → ~100%, test peaks and then drops', 'Nothing changes'], answer: 1,
      explain: 'More random features = more flexibility. With little regularization the model eventually fits noise. Raise \\(\\lambda\\) to recover.',
      reveal: (c) => { set(c, 'moons', [{ id: 'rff', params: { D: 300, ell: 0.25 } }]); c.fit.lambda = 1e-5; c.dataset.params = { noise: 0.3 }; c.split.nTrain = 100; c.view.showTest = true; },
    },
  ],
  inPractice: 'Periodic features are how you encode anything cyclic:' + dlist(['hour of day, day of week, month: \\((\\sin 2\\pi t/T, \\cos 2\\pi t/T)\\) so the end wraps to the start', 'wind or compass direction', 'seasonality terms in forecasting models (Fourier terms in Prophet)']),
  why: 'A linear combination of \\(\\sin\\) and \\(\\cos\\) at frequency \\(\\omega\\) is a single shifted wave. Products of waves in \\(x_1\\) and \\(x_2\\) give 2-D patterns. Random Fourier features use Bochner’s theorem: \\(\\mathbb{E}[\\cos(\\omega^\\top x + b)\\cos(\\omega^\\top x\' + b)] \\propto e^{-\\lVert x-x\'\\rVert^2/2\\ell^2}\\) when \\(\\omega \\sim \\mathcal N(0, \\ell^{-2}I)\\), so \\(z^\\top z\'\\) approximates the RBF kernel.',
  extras: (m, el) => scanChart(m, el, {
    title: 'Accuracy vs. frequency <span class="nc">ω</span> (refit for each <span class="nc">ω</span>)', xLabel: 'ω (frequency)', key: 'w',
    values: Array.from({ length: 50 }, (_, i) => +(0.3 + (i * 3.7) / 49).toFixed(3)),
    specIndex: (cfg) => cfg.features.findIndex((f) => ['sinx1', 'fourier1', 'checker', 'checker4'].includes(f.id)),
  }),
});
