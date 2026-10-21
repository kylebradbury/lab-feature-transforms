import { standardModule, datasetControl, featureParams, lambdaControl, sampleControls, viewToggles, toggle, buttonRow, more, h, card, fmt } from './common.js';
import { LineChart, evalGrid } from '../plot2d.js';
import { makeSplit } from '../datasets.js';
import { prepare, makeTrainer, evaluate, viewFor } from '../fit.js';
import { foldWeights } from '../features.js';
import { marchingSquares } from '../geometry.js';

const poly = (k) => [{ id: 'poly', params: { k } }];
const LAMS = Array.from({ length: 16 }, (_, i) => +(1e-5 * Math.pow(10, (i * 6) / 15)).toPrecision(2));

function fitOn(split, features, lambda, dsId, warm = null) {
  const prep = prepare(split, features, { view: viewFor(dsId) });
  const tr = makeTrainer(prep, lambda, warm);
  tr.run();
  const w = foldWeights(tr.w, prep.std);
  return { prep, w, wStd: tr.w, ...evaluate(prep, w) };
}

export default standardModule({
  id: 'degree',
  title: 'Polynomial degree and overfitting',
  short: 'Degree & overfitting',
  core: true,
  keyIdea: 'All monomials up to degree \\(k\\) give \\((k+1)(k+2)/2 - 1\\) features. More degree = more shapes, but with little data the boundary starts chasing noise: <b>train accuracy rises while test accuracy falls</b>. Regularization \\(\\lambda\\) and more data pull it back.',
  initial: () => ({ dataset: { id: 'moons', params: { noise: 0.35 } }, features: poly(1), split: { nTrain: 40, nTest: 500 }, fit: { mode: 'auto', lambda: 1e-5 }, view: { showTest: false } }),
  initialState: () => ({ tab: 'degree', spaghetti: false }),
  controls(m, el) {
    el.append(
      ...featureParams(m, 0, ['k']),
      h('div', { class: 'hint', html: `Degree ${m.cfg.features[0].params.k} → <b>${m.scene.prep.d}</b> feature columns.` }),
      lambdaControl(m, { essential: true }),
      ...sampleControls(m, { essential: true, nMax: 500 }),
      buttonRow([{ label: '🎲 New training sample', onClick: () => m.set((c) => { c.seed += 1; }, 'data') }]),
      toggle({ label: 'Boundary spaghetti: overlay fits on 5 other samples', value: m.state.spaghetti, onChange: (b) => { m.state.spaghetti = b; m.extras.refresh(); } }).el,
      ...viewToggles(m, ['test', 'mistakes'], { essential: true }),
      more([...datasetControl(m, ['moons', 'circles', 'spirals'], { params: true, resample: false })]),
    );
  },
  describe(m, sc) {
    const gap = sc.metrics.train.acc - sc.metrics.test.acc;
    return gap > 0.06 && sc.prep.d > 9 ? `train − test gap <b>${(100 * gap).toFixed(1)} points</b>: fitting noise` : `train − test gap ${(100 * gap).toFixed(1)} points`;
  },
  beats: [
    {
      title: 'Step up the degree',
      html: 'Only 40 noisy training points. Step <b>degree k</b> from 1 to 2 to 3. A line (k = 1) can’t follow the moons; k = 3 bends enough. Watch the feature count grow.',
      apply: (c, m) => { c.features = poly(1); c.fit.lambda = 1e-5; c.split.nTrain = 40; c.view.showTest = false; m.state.spaghetti = false; },
    },
    {
      title: 'Degree 10 with no regularization',
      html: '65 features and \\(\\lambda \\approx 0\\). The boundary wraps around individual points, makes islands, and training accuracy approaches 100%. Now look at the hollow <b>test</b> points and the test accuracy: the extra wiggles were fitting noise.',
      apply: (c, m) => { c.features = poly(10); c.fit.lambda = 1e-5; c.split.nTrain = 40; c.view.showTest = true; m.state.spaghetti = false; },
    },
    {
      title: 'The train/test gap, as a curve',
      html: 'The chart below refits every degree 1–10 on this same sample. Train accuracy (dashed) keeps rising. Test accuracy (solid) peaks around degree 3–5 and then falls. That gap is overfitting.',
      apply: (c, m) => { c.features = poly(10); c.fit.lambda = 1e-5; c.split.nTrain = 40; c.view.showTest = false; m.state.tab = 'degree'; },
    },
    {
      title: 'High degree = high variance',
      html: 'Spaghetti overlays the boundary fitted on 5 <b>other</b> random samples of 40 points. At degree 10 the boundaries disagree wildly; switch to degree 3 and they nearly coincide. Overfitting means the fit depends on which sample you happened to draw.',
      apply: (c, m) => { c.features = poly(10); c.fit.lambda = 1e-5; c.split.nTrain = 40; c.view.showTest = false; m.state.spaghetti = true; },
    },
    {
      title: 'Regularization tames it',
      html: 'We minimize \\(C(w) = \\text{cross-entropy} + \\lambda\\sum_{j\\ge1} w_j^2\\) (Lecture 9). Raise \\(\\lambda\\): weights shrink (see the Z-space bars), the boundary smooths, and test accuracy recovers, still with 65 features. The chart’s “vs λ” tab shows the trade-off.',
      apply: (c, m) => { c.features = poly(10); c.fit.lambda = 0.01; c.split.nTrain = 40; m.state.spaghetti = true; m.state.tab = 'lambda'; },
    },
    {
      title: 'More data tames it too',
      html: 'Back to \\(\\lambda \\approx 0\\) but with 400 training points. With more data, the same 65-feature model has less room to chase noise.',
      apply: (c, m) => { c.features = poly(10); c.fit.lambda = 1e-5; c.split.nTrain = 400; m.state.spaghetti = false; m.state.tab = 'degree'; },
    },
    {
      title: 'A warning about choosing k',
      html: 'We have been peeking at <b>test</b> accuracy to judge degrees. In practice that is cheating: choose \\(k\\) and \\(\\lambda\\) on a validation set (or cross-validation), and touch the test set once. The Challenge module enforces this.',
      apply: (c, m) => { c.features = poly(3); c.fit.lambda = 1e-3; c.split.nTrain = 40; m.state.spaghetti = false; },
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'How many feature columns (not counting the bias) does a degree-10 polynomial in two variables have?',
      choices: ['10', '20', '65', '100'], answer: 2,
      explain: 'All \\(x_1^i x_2^j\\) with \\(1 \\le i + j \\le 10\\): \\(2 + 3 + \\dots + 11 = 65\\), i.e. \\((k+1)(k+2)/2 - 1\\).',
      reveal: (c) => { c.features = poly(10); },
    },
    {
      id: 'q2', prompt: 'With 40 noisy points and \\(\\lambda \\approx 0\\), how will <b>test</b> accuracy at degree 10 compare with degree 3?',
      choices: ['Higher (more flexible)', 'Lower (overfits)', 'About the same'], answer: 1,
      explain: 'Lower. Degree 10 fits training noise; the gap shows in the chart below.',
      reveal: (c, m) => { c.features = poly(10); c.fit.lambda = 1e-5; c.split.nTrain = 40; c.view.showTest = true; m.state.tab = 'degree'; },
    },
    {
      id: 'q3', prompt: 'Resample the data 5 times. Whose boundary moves around more: degree 3 or degree 10?',
      choices: ['Degree 3', 'Degree 10', 'Neither moves'], answer: 1,
      explain: 'Degree 10: high-variance models change a lot from sample to sample. That is what the spaghetti shows.',
      reveal: (c, m) => { c.features = poly(10); c.fit.lambda = 1e-5; c.split.nTrain = 40; m.state.spaghetti = true; },
    },
  ],
  inPractice: 'Polynomial features are a standard first try (scikit-learn’s <code>PolynomialFeatures</code>), but the column count explodes: with 10 input variables, degree 3 already has 285 columns. That is why regularization and validation come with them.',
  why: 'Each extra degree adds whole families of curves, so the training loss can only go down (the old model is still available with the new weights set to 0). Test loss follows a U-shape: bias falls, variance rises. The L2 penalty shrinks the weights on the standardized features, which smooths the boundary. Fits here use Newton’s method (a second-order relative of Lecture 5’s gradient descent) so every slider move refits instantly.',
  extras(m, el) {
    const c = card('Train vs. test accuracy');
    const tabs = h('div', { class: 'tabs' });
    const box = h('div', { class: 'chart-box' });
    const note = h('div', { class: 'hint' });
    c.body.append(tabs, box, note);
    el.append(c.el);
    const chart = new LineChart(box, { xLabel: 'degree k', yRange: [0.4, 1] });
    let token = 0, spagToken = 0, timer = 0, sig = '', spagSig = '';
    const mkTabs = () => {
      tabs.innerHTML = '';
      for (const [k, lab] of [['degree', 'vs degree k'], ['lambda', 'vs regularization λ']]) {
        const b = h('button', { class: 'btn', type: 'button', 'aria-pressed': String(m.state.tab === k) }, lab);
        b.addEventListener('click', () => { m.state.tab = k; mkTabs(); sig = ''; schedule(); });
        tabs.append(b);
      }
    };
    mkTabs();
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    }
    function run() {
      const cfg = m.cfg, my = ++token, split = m.scene.split, k = cfg.features[0].params.k ?? 2, lam = cfg.fit.lambda;
      const tab = m.state.tab;
      chart.xLog = tab === 'lambda';
      chart.xLabel = tab === 'lambda' ? 'λ (log scale)' : 'degree k';
      chart.xFmt = tab === 'lambda' ? (v) => (v < 1e-4 ? v.toExponential(0) : fmt(v, 4)) : (v) => String(v);
      const xs = tab === 'lambda' ? LAMS : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const tr = xs.map(() => NaN), te = xs.map(() => NaN);
      let i = 0, warm = null;
      const stepFn = () => {
        if (my !== token) return;
        const t0 = performance.now();
        while (i < xs.length && performance.now() - t0 < 25) {
          const r = tab === 'lambda' ? fitOn(split, poly(k), xs[i], cfg.dataset.id, warm) : fitOn(split, poly(xs[i]), lam, cfg.dataset.id);
          if (tab === 'lambda') warm = r.wStd;
          tr[i] = r.train.acc; te[i] = r.test.acc; i++;
        }
        chart.set({ xs, series: [{ name: 'train', ys: tr, dash: true }, { name: 'test', ys: te, strong: true }], marker: tab === 'lambda' ? lam : k });
        if (i < xs.length) setTimeout(stepFn, 0);
        else {
          let best = 0;
          te.forEach((v, j) => { if (v > te[best]) best = j; });
          note.innerHTML = tab === 'lambda'
            ? `Degree ${k}. Best test accuracy at λ ≈ ${chart.xFmt(xs[best])}. (Choosing it this way peeks at the test set; see the last step.)`
            : `λ = ${lam <= 1.01e-5 ? '≈ 0' : fmt(lam, 4)}. Best test accuracy at degree ${xs[best]}; train accuracy keeps climbing.`;
        }
      };
      stepFn();
    }
    function spaghetti() {
      const cfg = m.cfg, sigS = JSON.stringify([m.state.spaghetti, cfg.dataset, cfg.seed, cfg.split.nTrain, cfg.features, cfg.fit.lambda]);
      if (sigS === spagSig) return;
      spagSig = sigS;
      m.scene.ghosts = [];
      if (!m.state.spaghetti) { m.scene.invalidate('paint'); return; }
      const my = ++spagToken;
      let s = 1;
      const view = viewFor(cfg.dataset.id);
      const stepFn = () => {
        if (my !== spagToken || !m.state.spaghetti) return;
        const split = makeSplit(cfg.dataset.id, cfg.dataset.params, { nTrain: cfg.split.nTrain, nTest: 10, seed: cfg.seed + 100 * s });
        const r = fitOn(split, cfg.features, cfg.fit.lambda, cfg.dataset.id);
        const g = evalGrid(r.prep.fmap, r.w, view, 90);
        m.scene.ghosts.push({ segs: marchingSquares(g.V, 90), G: 90, width: 1.3, dash: [], alpha: 0.45 });
        m.scene.invalidate('paint');
        if (++s <= 5) setTimeout(stepFn, 0);
      };
      setTimeout(stepFn, 0);
    }
    return {
      update(sc) {
        if (sc.busy) return;
        const cfg = m.cfg, s2 = JSON.stringify([cfg.dataset, cfg.seed, cfg.split.nTrain, cfg.features, cfg.fit.lambda, m.state.tab]);
        if (s2 !== sig) { sig = s2; spaghetti(); schedule(); }
      },
      onApply() { mkTabs(); },
      refresh() { spagSig = ''; spaghetti(); },
      destroy() { token++; spagToken++; clearTimeout(timer); chart.destroy(); },
    };
  },
});
