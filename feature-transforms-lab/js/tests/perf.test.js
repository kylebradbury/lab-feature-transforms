// Performance budgets (soft: assert at 2× the target, report the median).

import { suite, test, assert, bench } from './harness.js';
import { makeSplit } from '../datasets.js';
import { prepare, makeTrainer } from '../fit.js';
import { foldWeights } from '../features.js';
import { evalGrid } from '../plot2d.js';
import { marchingSquares } from '../geometry.js';

suite('perf');

const VIEW = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
const setup = (ds, feats, n) => prepare(makeSplit(ds, {}, { nTrain: n, nTest: 100 }), feats, { view: VIEW });

function budget(name, targetMs, fn, reps = 5) {
  test(`perf: ${name} ≤ ${targetMs} ms`, () => {
    const ms = bench(fn, reps);
    assert(ms <= 2 * targetMs, `${ms.toFixed(1)} ms`);
    return `median ${ms.toFixed(1)} ms`;
  });
}

const p27 = setup('moons', [{ id: 'poly', params: { k: 6 } }], 200);
const T27 = makeTrainer(p27, 1e-3); T27.run();
budget('warm Newton step, d = 27, N = 200', 3, () => { T27.converged = false; T27.iterate(); });

const p65 = setup('moons', [{ id: 'poly', params: { k: 10 } }], 300);
budget('cold fit to convergence, d = 65, N = 300', 40, () => makeTrainer(p65, 1e-3).run(), 3);

const w27 = foldWeights(T27.w, p27.std);
budget('grid 100², d = 27', 5, () => evalGrid(p27.fmap, w27, VIEW, 100));
const T65 = makeTrainer(p65, 1e-3); T65.run();
const w65 = foldWeights(T65.w, p65.std);
budget('grid 170², d = 65', 25, () => evalGrid(p65.fmap, w65, VIEW, 170), 3);

const g200 = evalGrid(p27.fmap, w27, VIEW, 200);
budget('marching squares 200²', 3, () => marchingSquares(g200.V, 200));

budget('drag frame (warm step + 90² grid + contour), d = 27', 33, () => {
  T27.converged = false; T27.iterate();
  const g = evalGrid(p27.fmap, foldWeights(T27.w, p27.std), VIEW, 90);
  marchingSquares(g.V, 90);
});

const p200 = setup('spirals', [{ id: 'rbf', params: { place: 'data', gamma: 4 } }], 200);
budget('cold fit, RBF at data (d = 200, N = 200)', 600, () => makeTrainer(p200, 1e-4).run(), 2);
