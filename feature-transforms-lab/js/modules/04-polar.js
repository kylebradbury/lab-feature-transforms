import { standardModule, datasetControl, presetButtons, featureParams, centerControls, lambdaControl, viewToggles, more, scanChart, dlist } from './common.js';
import { spiralOmega } from '../datasets.js';

const W_STAR = +spiralOmega(2).toFixed(2);
const F = {
  raw: [{ id: 'raw', params: {} }],
  r: [{ id: 'r', params: {} }],
  quad: [{ id: 'quad2', params: { mask: [1, 1, 1, 1, 1] } }],
  rr2: [{ id: 'r', params: {} }, { id: 'r2', params: {} }],
  absr: [{ id: 'absr', params: { rho: 1.6 } }],
  petal: [{ id: 'r', params: {} }, { id: 'petal', params: { k: 3 } }],
  spiral: [{ id: 'spiral', params: { omega: W_STAR } }],
  poly10: [{ id: 'poly', params: { k: 10 } }],
  angle: [{ id: 'angle', params: {} }],
};
const PRESETS = [
  { label: 'raw', features: F.raw },
  { label: '\\(r\\)', features: F.r },
  { label: '\\([r,\\ r^2]\\)', features: F.rr2 },
  { label: '\\(\\lvert r-\\rho\\rvert\\)', features: F.absr },
  { label: '\\([r,\\ \\sin k\\theta,\\ \\cos k\\theta]\\)', features: F.petal },
  { label: 'spiral', features: F.spiral },
  { label: '\\([\\sin\\theta,\\ \\cos\\theta]\\)', features: F.angle },
  { label: 'quadratic (5)', features: F.quad },
  { label: 'poly degree 10 (65)', features: F.poly10 },
];
const set = (c, ds, feats, params = {}) => { c.dataset = { id: ds, params }; c.features = structuredClone(feats); c.fit.mode = 'auto'; c.view.showTest = false; };

export default standardModule({
  id: 'polar',
  title: 'Radial and polar features',
  short: 'Radial & polar',
  core: true,
  keyIdea: 'Distance \\(r = \\lVert x - c\\rVert\\) and angle \\(\\theta\\) about a center \\(c\\) give rings, flowers and spirals. <b>One well-chosen feature can beat dozens of generic ones</b>, but it bakes in an assumption (for example, where the center is).',
  initial: () => ({ dataset: { id: 'circles', params: {} }, features: F.r, fit: { mode: 'auto', lambda: 1e-3 } }),
  controls(m, el) {
    const ids = m.cfg.features.map((f) => f.id);
    el.append(
      presetButtons(m, PRESETS),
      ...datasetControl(m, ['circles', 'ring', 'offcircle', 'flower', 'spirals', 'wedge'], { params: true }),
      ...centerControls(m),
    );
    m.cfg.features.forEach((f, i) => {
      if (f.id === 'petal') el.append(...featureParams(m, i, ['k']));
      if (f.id === 'spiral') el.append(...featureParams(m, i, ['omega', 'chir']));
      if (f.id === 'absr') el.append(...featureParams(m, i, ['rho']));
      if (f.id === 'poly') el.append(...featureParams(m, i, ['k']));
    });
    if (ids.includes('spiral')) el.append(Object.assign(document.createElement('div'), { className: 'hint', textContent: `This dataset’s true pitch is ω ≈ ${W_STAR} (for 2 turns).` }));
    el.append(more([lambdaControl(m), ...viewToggles(m, ['test', 'mistakes', 'shade'])]));
  },
  beats: [
    {
      title: 'One feature: the radius',
      html: 'Concentric circles with the single feature \\(r = \\lVert x\\rVert\\). Accuracy is about 100%. The Z-space panel is a number line: the classifier is just a threshold \\(r < r_0\\). Compare the <b>quadratic (5)</b> preset: same circle, five features.',
      apply: (c) => set(c, 'circles', F.r),
    },
    {
      title: 'A ring needs two thresholds',
      html: 'Orange points form a ring. With only \\(r\\) a linear classifier gives <b>one</b> threshold, so it can’t keep both the center and the outside blue. Add \\(r^2\\): in Z-space the points lie on the parabola \\(z_2 = z_1^2\\), and a straight line cuts a parabola <b>twice</b>, giving two radii. (\\(\\lvert r - \\rho\\rvert\\) does it with one feature if you know \\(\\rho\\).)',
      apply: (c) => set(c, 'ring', F.rr2),
    },
    {
      title: 'Where is the center?',
      html: 'The radius feature is measured from a center \\(c\\). Here the true circle is off-center. <b>Drag the ⊕ handle</b> (or the center sliders) and watch accuracy rise as \\(c\\) approaches the true center. The feature encodes an assumption. The quadratic preset instead <i>learns</i> the center through its linear terms.',
      apply: (c) => set(c, 'offcircle', F.r),
    },
    {
      title: 'Flowers: radius plus angle',
      html: 'Features \\([r,\\ \\sin k\\theta,\\ \\cos k\\theta]\\) give boundaries \\(r = a + b\\sin(k\\theta + \\varphi)\\): a wavy circle with \\(k\\) petals. Count the petals in the data and set \\(k\\) to match. (Angles are computed from \\(x/r\\) and \\(y/r\\), so there is no jump at \\(\\theta = \\pm\\pi\\).)',
      apply: (c) => set(c, 'flower', F.petal),
    },
    {
      title: 'Two spirals',
      html: 'The hardest classic dataset. Try <b>raw</b> (≈ 50%) and <b>poly degree 10</b> (65 features, wiggly). Then <b>spiral</b>: \\([\\sin(\\omega r - \\theta),\\ \\cos(\\omega r - \\theta)]\\), only two features. In Z-space each class collapses to a single cluster. Nudge \\(\\omega\\) and watch the chart below: the pitch has to match.',
      apply: (c) => set(c, 'spirals', F.spiral),
    },
    {
      title: 'Wedges from angle features',
      html: '\\([\\sin\\theta,\\ \\cos\\theta]\\) about the center makes boundaries that are rays from \\(c\\): a pie slice. Drag the center to see the rays pivot.',
      apply: (c) => set(c, 'wedge', F.angle),
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'Ring data, with the single feature \\(r\\). Can a linear classifier separate it?',
      choices: ['Yes', 'No: one threshold on \\(r\\) gives one circle, but the ring needs two'], answer: 1,
      explain: 'No. \\(w_0 + w_1 r = 0\\) is one circle. A ring is \\(r_1 < r < r_2\\), which needs \\(r^2\\) as well (or \\(\\lvert r - \\rho\\rvert\\)).',
      reveal: (c) => set(c, 'ring', F.r),
    },
    {
      id: 'q2', prompt: 'On the two spirals, compare degree-10 polynomial features (65 columns) with the 2 spiral features. Test accuracy?',
      choices: ['Polynomial wins easily', 'Roughly equal', 'Spiral features win by a lot'], answer: 2,
      explain: 'The 2 matched features reach about 99%; 65 generic polynomial columns cannot follow the arms well. Well-chosen features carry knowledge about the problem.',
      reveal: (c) => set(c, 'spirals', F.poly10),
    },
    {
      id: 'q3', prompt: 'Set the spiral feature’s \\(\\omega\\) 40% too small. What goes wrong?',
      choices: ['Nothing: the weights compensate', 'The pitch is wrong, so only a band of radii lines up; the innermost and outermost parts are misclassified', 'Every point is misclassified equally'], answer: 1,
      explain: 'The weights can only shift the phase \\(\\varphi\\), not the pitch. The fit lines the boundary up with the middle radii; the phase error \\(\\Delta\\omega\\, r - \\varphi\\) grows toward both ends. Feature parameters like \\(\\omega\\) are not learned by logistic regression; they have to be chosen or searched (see the chart).',
      reveal: (c) => { set(c, 'spirals', [{ id: 'spiral', params: { omega: +(0.6 * W_STAR).toFixed(2) } }]); c.view.mistakes = true; },
    },
  ],
  inPractice: 'Radial features are common whenever “how far from something” matters:' + dlist(['distance to a city center, hospital or store', 'distance from a sensor or a cell tower', 'angle/direction features (wind direction) encoded as \\((\\sin, \\cos)\\)']),
  why: 'A linear classifier on \\([r]\\) has boundary \\(r = -w_0/w_1\\): a circle. On \\([r, r^2]\\), \\(w_0 + w_1 r + w_2 r^2 = 0\\) is a quadratic in \\(r\\) with up to two roots, so two circles. On \\([\\sin(\\omega r - \\theta), \\cos(\\omega r - \\theta)]\\), the score is \\(A\\cos(\\omega r - \\theta - \\varphi) + w_0\\), constant along each spiral \\(\\theta = \\omega r - \\text{const}\\).',
  extras: (m, el) => scanChart(m, el, {
    title: 'Accuracy vs. the spiral pitch <span class="nc">ω</span>', xLabel: 'ω (spiral pitch)', key: 'omega',
    values: Array.from({ length: 41 }, (_, i) => +(1 + (i * 5) / 40).toFixed(3)),
    specIndex: (cfg) => cfg.features.findIndex((f) => f.id === 'spiral'),
    note: 'Logistic regression learns the weights, not ω.',
  }),
});
