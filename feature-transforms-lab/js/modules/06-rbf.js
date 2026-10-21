import { standardModule, datasetControl, featureParams, lambdaControl, sampleControls, viewToggles, toggle, buttonRow, more, h, scanChart, resolveParams, dlist } from './common.js';

const rbf = (params) => [{ id: 'rbf', params }];
const set = (c, ds, feats, extra = {}) => {
  c.dataset = { id: ds, params: extra.params || {} };
  c.features = structuredClone(feats);
  c.fit.mode = 'auto'; c.fit.lambda = extra.lambda ?? 1e-3;
  c.split.nTrain = extra.nTrain ?? 200;
  c.view.showTest = !!extra.showTest; c.view.rings = extra.rings ?? true;
};

export default standardModule({
  id: 'rbf',
  title: 'RBF bumps: features from landmarks',
  short: 'RBF bumps',
  core: true,
  keyIdea: 'Each feature \\(\\phi_j(x) = e^{-\\gamma\\lVert x - c_j\\rVert^2}\\) is a bump centered on a <b>landmark</b> \\(c_j\\): close to 1 near it, 0 far away. A weighted sum of bumps can draw almost any region. \\(\\gamma\\) sets how local each bump is, and that controls overfitting.',
  initial: () => ({ dataset: { id: 'offcircle', params: {} }, features: rbf({ place: 'manual', pts: [[-1.5, 1.5]], gamma: 0.6 }), fit: { mode: 'auto', lambda: 1e-3 } }),
  controls(m, el) {
    const p = resolveParams(m.cfg.features[0]);
    el.append(...datasetControl(m, ['offcircle', 'moons', 'circles', 'spirals', 'checker'], { params: true }));
    el.append(...featureParams(m, 0, ['place']));
    if (p.place === 'grid' || p.place === 'random') el.append(...featureParams(m, 0, ['m'], { labels: { m: p.place === 'grid' ? 'Grid size m (m × m landmarks)' : 'Number of landmarks m' } }));
    el.append(...featureParams(m, 0, ['gamma'], { labels: { gamma: 'Bump sharpness \\(\\gamma\\)' } }));
    if (p.place === 'manual') {
      el.append(h('div', { class: 'hint', html: '<b>Click</b> the plot to add a landmark (up to 30), <b>drag</b> to move, <b>Alt/Shift-click</b> to remove. Diamond size and color show each landmark’s weight (orange pushes toward orange).' }));
      el.append(buttonRow([{ label: 'Clear landmarks', onClick: () => m.apply((c) => { c.features[0].params = { ...resolveParams(c.features[0]), pts: [] }; }) }]));
    }
    if (p.place === 'random') el.append(buttonRow([{ label: '🎲 New random landmarks', onClick: () => m.set((c) => { c.featureSeed += 1; }, 'features') }]));
    el.append(toggle({ label: 'Show half-height rings \\(\\sqrt{\\ln 2/\\gamma}\\)', value: m.cfg.view.rings !== false, onChange: (b) => m.set((c) => { c.view.rings = b; }, 'paint') }).el);
    el.append(lambdaControl(m), more([...sampleControls(m), ...viewToggles(m, ['test', 'mistakes', 'shade'])]));
  },
  beats: [
    {
      title: 'One bump, one landmark',
      html: 'A single feature \\(\\phi(x) = e^{-\\gamma\\lVert x - c\\rVert^2}\\) with the landmark (◆) in the wrong place. <b>Drag the landmark</b> onto the orange disk. Since the bump only depends on distance to \\(c\\), this is the same as the shifted radius feature from Module 4: one landmark, one circle.',
      apply: (c) => set(c, 'offcircle', rbf({ place: 'manual', pts: [[-1.5, 1.5]], gamma: 0.6 })),
    },
    {
      title: 'A grid of bumps',
      html: 'Now 16 landmarks on a 4 × 4 grid. The classifier weights each bump (◆ color = sign of its weight). Sweep \\(\\gamma\\): large \\(\\gamma\\) gives narrow bumps and a lumpy boundary, small \\(\\gamma\\) gives broad bumps and a smooth one.',
      apply: (c) => set(c, 'moons', rbf({ place: 'grid', m: 4, gamma: 1 })),
    },
    {
      title: 'Place your own',
      html: 'Clear the landmarks and build a classifier for the moons by <b>clicking to place</b> landmarks. How few can you get away with while keeping test accuracy above 90%? Landmarks inside the orange moon get positive weights.',
      apply: (c) => set(c, 'moons', rbf({ place: 'manual', pts: [[-0.8, 0.6], [0.8, -0.6]], gamma: 0.8 })),
    },
    {
      title: 'A landmark on every training point',
      html: 'With a landmark at each of 200 training points we have \\(d = 200\\) features. Large \\(\\gamma\\): islands around individual points (memorizing). Small \\(\\gamma\\): smooth spirals. This is essentially a <b>kernel method</b> (RBF-kernel SVM / kernel logistic regression). The chart shows train vs. test across \\(\\gamma\\).',
      apply: (c) => set(c, 'spirals', rbf({ place: 'data', gamma: 30 }), { lambda: 1e-4, showTest: true, rings: false }),
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'Landmarks at every training point, \\(\\gamma = 100\\). Predict train and test accuracy.',
      choices: ['Both near 100%', 'Train near 100%, test much lower', 'Both near 50%'], answer: 1,
      explain: 'Each point gets its own tiny bump, so the model memorizes the training set (islands) and generalizes poorly.',
      reveal: (c) => set(c, 'moons', rbf({ place: 'data', gamma: 100 }), { params: { noise: 0.3 }, lambda: 1e-5, showTest: true, rings: false }),
    },
    {
      id: 'q2', prompt: 'Very small \\(\\gamma = 0.01\\): what shapes can the boundary take?',
      choices: ['Islands around each point', 'Roughly a circle or a line', 'A checkerboard'], answer: 1,
      explain: 'For small \\(\\gamma\\), \\(e^{-\\gamma\\lVert x-c\\rVert^2} \\approx 1 - \\gamma\\lVert x-c\\rVert^2\\), so any weighted sum is a quadratic with equal \\(x_1^2\\) and \\(x_2^2\\) coefficients: a circle (or a line).',
      reveal: (c) => set(c, 'moons', rbf({ place: 'grid', m: 4, gamma: 0.01 })),
    },
    {
      id: 'q3', prompt: 'Mini-challenge: solve the two spirals with <b>manual</b> landmarks. Roughly how many do you need for ≥ 95% test accuracy?',
      choices: ['1–2', 'about 6–10', 'about 20–30'], answer: 2,
      explain: 'Each arm needs several bumps along its length (two arms × 2 turns). Compare this to the 2 hand-built spiral features in Module 4: generic features need many more columns.',
      reveal: (c) => set(c, 'spirals', rbf({ place: 'manual', pts: [], gamma: 3 })),
    },
  ],
  inPractice: 'Landmark/similarity features are everywhere:' + dlist(['“distance to each of our 20 stores” or to each hospital', 'similarity to a few prototype customers', 'kernel methods (SVMs, Gaussian processes) use a bump at every training point implicitly']),
  why: 'With landmarks \\(c_1, \\dots, c_m\\) the score is \\(w_0 + \\sum_j w_j e^{-\\gamma\\lVert x - c_j\\rVert^2}\\), a sum of Gaussian bumps. Bumps at all \\(N\\) training points give the same function class as kernel methods with the RBF kernel \\(K(x, x\') = e^{-\\gamma\\lVert x - x\'\\rVert^2}\\). The kernel trick computes such models without ever writing out \\(\\Phi\\).',
  extras: (m, el) => scanChart(m, el, {
    title: 'Train vs. test accuracy across <span class="nc">γ</span>', xLabel: 'γ (log scale)', key: 'gamma', log: true,
    values: Array.from({ length: 21 }, (_, i) => +(0.01 * Math.pow(10, (i * 4) / 20)).toPrecision(3)),
    xFmt: (v) => (v < 0.1 ? v.toFixed(2) : String(+v.toPrecision(2))),
    specIndex: (cfg) => cfg.features.findIndex((f) => f.id === 'rbf'),
  }),
});
