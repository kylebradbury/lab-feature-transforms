import { standardModule, datasetControl, weightControls, lambdaControl, sampleControls, viewToggles, more, h, group, TRANSFORMS, DATASETS } from './common.js';
import { featurePalette } from '../ui.js';
import { buildFeatureMap } from '../features.js';
import { viewFor } from '../fit.js';

export const MAX_D = 300;

// Palette helpers shared with the Challenge.
export function paletteFor(m, { budget = null, sandbox = false } = {}) {
  const count = (specs) => {
    try { return buildFeatureMap(specs, { Xtrain: m.scene.split.train.X, view: viewFor(m.cfg.dataset.id), featureSeed: m.cfg.featureSeed }).dim; } catch { return NaN; }
  };
  const allowed = (id) => {
    if (TRANSFORMS[id].domain === 'positive' && DATASETS[m.cfg.dataset.id].domain !== 'positive') return 'Needs positive inputs (log / ratio): only for the loans dataset';
    return true;
  };
  let last = JSON.stringify(m.cfg.features);
  const pal = featurePalette(m.cfg.features, () => {
    if (count(m.cfg.features) > MAX_D) {
      m.cfg.features.splice(0, m.cfg.features.length, ...JSON.parse(last));
      pal.refresh();
      window.alert(`That would give more than ${MAX_D} feature columns; remove something first.`);
      return;
    }
    last = JSON.stringify(m.cfg.features);
    m.set(() => {}, 'features');
    if (m.cfg.fit.mode === 'manual') m.rebuild();
  }, { count, allowed, budget, sandbox });
  return pal.el;
}

export default standardModule({
  id: 'sandbox',
  title: 'Sandbox: any data, any features',
  short: 'Sandbox',
  keyIdea: 'Combine any transforms on any dataset. Every combination is still a linear classifier on \\(z = \\Phi(x)\\). Use <b>🔗 Link</b> in the header to share exactly what you built.',
  initial: () => ({ dataset: { id: 'spirals', params: {} }, features: [{ id: 'raw', params: {} }], fit: { mode: 'auto', lambda: 1e-3 } }),
  controls(m, el) {
    el.append(
      ...datasetControl(m, Object.keys(DATASETS).filter((k) => k !== 'none'), { params: true }),
      group('Features', [paletteFor(m, { sandbox: true })]),
      lambdaControl(m, { essential: true }),
      ...weightControls(m, { range: 5, biasRange: 8 }),
      more([...sampleControls(m), ...viewToggles(m, ['test', 'mistakes', 'shade']), h('div', { class: 'ctl' }, h('button', { class: 'btn', type: 'button', onClick: () => m.set((c) => { c.featureSeed += 1; }, 'features') }, '🎲 New random features (RFF / ReLU / random landmarks)'))]),
    );
  },
  shareQuery: (m) => {
    const c = m.cfg;
    return { dataset: c.dataset, seed: c.seed, split: c.split, features: c.features, featureSeed: c.featureSeed, fit: { mode: c.fit.mode, lambda: c.fit.lambda, w: c.fit.mode === 'manual' ? c.fit.w : null }, view: { showTest: c.view.showTest, log: c.view.log } };
  },
  inPractice: 'Ideas to try:<ul style="margin:4px 0;padding-left:18px"><li>The fewest features that solve the spirals (≥ 97% test).</li><li>θ = atan2 on the wedge: see the seam on the negative x₁-axis, then switch to [sin θ, cos θ].</li><li>A ring with RBF bumps vs. [r, r²]: compare the feature count.</li><li>Checkerboard with an offset: one product vs. all four.</li></ul>',
  why: 'Whatever you pick, training solves the same convex problem: minimize cross-entropy + \\(\\lambda\\lVert w\\rVert^2\\) over \\(w\\). The <i>shape</i> of the boundary is decided entirely by \\(\\Phi\\); the data only chooses the weights.',
});
