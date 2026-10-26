import { suite, test, assert, assertClose } from './harness.js';
import { makeRng, mulberry32 } from '../rng.js';
import { makeSplit, DATASETS, spiralOmega } from '../datasets.js';
import { TRANSFORMS, buildFeatureMap, designMatrix, fitStandardizer, standardize, foldWeights } from '../features.js';
import { Trainer, solveSPD, logits } from '../model.js';
import { marchingSquares, chainSegments, classifyConic, iou, contourLength } from '../geometry.js';
import { quickFit } from '../fit.js';

suite('math');

// ---- RNG ----
test('rng: same seed, same sequence', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert(a() === b());
});
test('rng: gaussian moments', () => {
  const r = makeRng(7);
  let m = 0, v = 0;
  const n = 100000;
  const xs = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = r.normal(); m += xs[i]; }
  m /= n;
  for (let i = 0; i < n; i++) v += (xs[i] - m) ** 2;
  v /= n;
  assertClose(m, 0, 0.01, 'mean');
  assertClose(v, 1, 0.02, 'var');
});

// ---- datasets ----
test('datasets: sizes, balance, determinism for every generator', () => {
  for (const id of Object.keys(DATASETS)) {
    if (id === 'none') continue;
    const s = makeSplit(id, {}, { nTrain: 101, nVal: 40, nTest: 60, seed: 3 });
    assert(s.train.y.length === 101, `${id} train n=${s.train.y.length}`);
    assert(s.val.y.length === 40, `${id} val n`);
    assert(s.test.y.length === 60, `${id} test n=${s.test.y.length}`);
    const ones = s.test.y.reduce((a, b) => a + b, 0);
    assert(ones === 30, `${id} test balance ${ones}`);
    const s2 = makeSplit(id, {}, { nTrain: 101, nVal: 40, nTest: 60, seed: 3 });
    for (let i = 0; i < s.train.X.length; i++) assert(s.train.X[i] === s2.train.X[i], `${id} deterministic`);
    for (let i = 0; i < s.train.X.length; i++) assert(Number.isFinite(s.train.X[i]), `${id} finite`);
  }
});
test('datasets: test set independent of nTrain', () => {
  const a = makeSplit('moons', {}, { nTrain: 50, nTest: 40 }), b = makeSplit('moons', {}, { nTrain: 300, nTest: 40 });
  for (let i = 0; i < 80; i++) assert(a.test.X[i] === b.test.X[i]);
});
test('datasets: spirals obey their rule at noise 0', () => {
  const s = makeSplit('spirals', { noise: 0 }, { nTrain: 200, nTest: 10 });
  const w = spiralOmega(2);
  for (let i = 0; i < 200; i++) {
    const x = s.train.X[2 * i], y = s.train.X[2 * i + 1], r = Math.hypot(x, y), t = Math.atan2(y, x);
    const c = Math.cos(w * r - t);
    assertClose(c, s.train.y[i] ? 1 : -1, 1e-9, 'spiral rule');
  }
});
test('datasets: loans positive', () => {
  const s = makeSplit('loans', {}, { nTrain: 300, nTest: 300 });
  for (const v of s.train.X) assert(v > 0, 'positive');
});
test('datasets: loans trainBelow filter', () => {
  const s = makeSplit('loans', { trainBelow: 150 }, { nTrain: 200, nTest: 300 });
  for (let i = 0; i < 200; i++) assert(s.train.X[2 * i] < 150);
  let above = 0;
  for (let i = 0; i < 300; i++) if (s.test.X[2 * i] >= 150) above++;
  assert(above > 5, 'test reaches above $150k');
});

// ---- transforms ----
test('transforms: quad2 values', () => {
  const f = buildFeatureMap([{ id: 'quad2' }]);
  const out = f.evalRow(1, 2, new Float64Array(5));
  [1, 2, 1, 2, 4].forEach((v, k) => assertClose(out[k], v, 1e-12));
});
test('transforms: poly column counts', () => {
  for (let k = 1; k <= 10; k++) assert(buildFeatureMap([{ id: 'poly', params: { k } }]).dim === ((k + 1) * (k + 2)) / 2 - 1, `k=${k}`);
});
test('transforms: dedupe raw + quad2 = 5 columns', () => {
  assert(buildFeatureMap([{ id: 'raw' }, { id: 'quad2' }]).dim === 5);
  const f = buildFeatureMap([{ id: 'raw' }, { id: 'x1sq' }, { id: 'poly', params: { k: 2 } }]);
  assert(f.dim === 5, `got ${f.dim}`);
  const a = f.evalRow(0.5, -2, new Float64Array(5));
  // raw first, then x1², then remaining poly terms x1x2, x2²
  [0.5, -2, 0.25, -1, 4].forEach((v, k) => assertClose(a[k], v, 1e-12));
});
test('transforms: polar features continuous across the negative x-axis', () => {
  for (const id of ['angle', 'petal', 'spiral']) {
    const f = buildFeatureMap([{ id }]);
    const a = f.evalRow(-1, 1e-9, new Float64Array(2)), b = f.evalRow(-1, -1e-9, new Float64Array(2));
    assert(Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6, id);
  }
});
test('transforms: spiral and petal match atan2 formulas', () => {
  const sp = buildFeatureMap([{ id: 'spiral', params: { omega: 2.3 } }]), pe = buildFeatureMap([{ id: 'petal', params: { k: 3 } }]);
  const r = makeRng(1);
  for (let n = 0; n < 50; n++) {
    const x = r.range(-3, 3), y = r.range(-3, 3), rad = Math.hypot(x, y), t = Math.atan2(y, x);
    const a = sp.evalRow(x, y, new Float64Array(2)), b = pe.evalRow(x, y, new Float64Array(2));
    assertClose(a[0], Math.sin(2.3 * rad - t), 1e-9);
    assertClose(a[1], Math.cos(2.3 * rad - t), 1e-9);
    assertClose(b[0], Math.sin(3 * t), 1e-9);
    assertClose(b[1], Math.cos(3 * t), 1e-9);
  }
});
test('transforms: every transform evaluates finitely, incl. non-positive inputs', () => {
  const s = makeSplit('moons', {}, { nTrain: 30, nTest: 4 });
  for (const id of Object.keys(TRANSFORMS)) {
    const f = buildFeatureMap([{ id }], { Xtrain: s.train.X, featureSeed: 3 });
    for (const [x, y] of [[0, 0], [-2, 1.5], [2.9, -2.9], [1e-12, -1]]) {
      const out = f.evalRow(x, y, new Float64Array(f.dim));
      for (let k = 0; k < f.dim; k++) assert(Number.isFinite(out[k]), `${id} at (${x},${y})`);
    }
  }
});
test('transforms: random features are seeded', () => {
  const a = buildFeatureMap([{ id: 'rff' }], { featureSeed: 5 }).evalRow(0.3, 0.7, new Float64Array(50));
  const b = buildFeatureMap([{ id: 'rff' }], { featureSeed: 5 }).evalRow(0.3, 0.7, new Float64Array(50));
  const c = buildFeatureMap([{ id: 'rff' }], { featureSeed: 6 }).evalRow(0.3, 0.7, new Float64Array(50));
  assert(a.every((v, i) => v === b[i]), 'same seed');
  assert(a.some((v, i) => v !== c[i]), 'different seed');
});

// ---- standardizer ----
test('standardize + fold gives identical logits', () => {
  const s = makeSplit('circles', {}, { nTrain: 80, nTest: 4 });
  const f = buildFeatureMap([{ id: 'poly', params: { k: 3 } }]);
  const N = 80, d = f.dim, Z = designMatrix(f, s.train.X), std = fitStandardizer(Z, N, d), Zs = standardize(Z, N, d, std);
  for (let j = 0; j < d; j++) {
    let m = 0, v = 0;
    for (let i = 0; i < N; i++) m += Zs[i * d + j];
    m /= N;
    for (let i = 0; i < N; i++) v += (Zs[i * d + j] - m) ** 2;
    assertClose(m, 0, 1e-9, 'mean');
    assertClose(Math.sqrt(v / N), 1, 1e-9, 'sd');
  }
  const r = makeRng(2), w = new Float64Array(d + 1).map(() => r.normal());
  const a = logits(w, Zs, N, d), b = logits(foldWeights(w, std), Z, N, d);
  for (let i = 0; i < N; i++) assertClose(a[i], b[i], 1e-9);
});

// ---- model ----
function smallProblem(lambda) {
  const s = makeSplit('moons', {}, { nTrain: 60, nTest: 4, seed: 9 });
  const f = buildFeatureMap([{ id: 'poly', params: { k: 3 } }]);
  const N = 60, d = f.dim, Z = designMatrix(f, s.train.X), std = fitStandardizer(Z, N, d);
  return new Trainer(standardize(Z, N, d, std), s.train.y, N, d, lambda);
}
test('model: gradient matches finite differences', () => {
  for (const lam of [1e-5, 1e-2]) {
    const T = smallProblem(lam), r = makeRng(4);
    for (let rep = 0; rep < 3; rep++) {
      const w = new Float64Array(T.D).map(() => 0.5 * r.normal());
      T.w.set(w); T.loss = T.objective(w); T.converged = false;
      // gradient computed inside iterate(); reproduce it here
      const g = numericGrad(T, w);
      const ga = analyticGrad(T, w);
      for (let a = 0; a < T.D; a++) assert(Math.abs(g[a] - ga[a]) <= 1e-6 * Math.max(1, Math.abs(g[a])), `grad ${a}: ${g[a]} vs ${ga[a]}`);
    }
  }
});
function numericGrad(T, w) {
  const h = 1e-6, g = new Float64Array(T.D), wp = Float64Array.from(w);
  for (let a = 0; a < T.D; a++) {
    wp[a] = w[a] + h; const fp = T.objective(wp);
    wp[a] = w[a] - h; const fm = T.objective(wp);
    wp[a] = w[a];
    g[a] = (fp - fm) / (2 * h);
  }
  return g;
}
function analyticGrad(T, w) {
  T.w.set(w); T.converged = false; T.loss = T.objective(w);
  const saved = Float64Array.from(w);
  T.iterate(); // fills T.g at the pre-step weights
  T.w.set(saved);
  return Float64Array.from(T.g);
}
test('model: loss decreases monotonically and converges', () => {
  const T = smallProblem(1e-3);
  let prev = T.loss;
  for (let k = 0; k < 60 && !T.converged; k++) {
    T.iterate();
    assert(T.loss <= prev + 1e-15, 'monotone');
    prev = T.loss;
  }
  assert(T.converged && T.iters < 30, `iters ${T.iters}`);
});
test('model: Newton matches long gradient descent', () => {
  const T = smallProblem(1e-2);
  T.run();
  const G = smallProblem(1e-2), w = new Float64Array(G.D);
  w[0] = G.w[0];
  for (let it = 0; it < 20000; it++) {
    const g = numericGradFast(G, w);
    for (let a = 0; a < G.D; a++) w[a] -= 0.5 * g[a];
  }
  assertClose(G.objective(w), T.loss, 1e-6, 'objective');
  for (let a = 0; a < G.D; a++) assertClose(w[a], T.w[a], 1e-3, `w${a}`);
});
function numericGradFast(T, w) {
  // analytic gradient (cheap) for the GD reference
  const s = T.scores(w, new Float64Array(T.N)), g = new Float64Array(T.D);
  for (let i = 0; i < T.N; i++) {
    const r = 1 / (1 + Math.exp(-s[i])) - T.y[i];
    g[0] += r;
    for (let j = 0; j < T.d; j++) g[j + 1] += r * T.Z[i * T.d + j];
  }
  for (let a = 0; a < T.D; a++) g[a] = g[a] / T.N + 2 * (a === 0 ? 1e-8 : T.lambda) * w[a];
  return g;
}
test('model: solveSPD', () => {
  const H = Float64Array.from([4, 1, 0, 1, 3, 1, 0, 1, 2]), g = Float64Array.from([1, 2, 3]), x = new Float64Array(3);
  assert(solveSPD(H, g, 3, x));
  for (let i = 0; i < 3; i++) { let s = 0; for (let j = 0; j < 3; j++) s += H[i * 3 + j] * x[j]; assertClose(s, g[i], 1e-12); }
});
test('model: degree 10 at λ floor and d≈200 stay finite', () => {
  const a = quickFit('circles', [{ id: 'poly', params: { k: 10 } }], { params: { noise: 0 }, nTrain: 150, lambda: 1e-5 });
  assert(a.wRaw.every(Number.isFinite) && a.trainer.iters <= 60, 'poly10');
  assert(a.train.acc > 0.99, `poly10 train ${a.train.acc}`);
  const b = quickFit('spirals', [{ id: 'rbf', params: { place: 'data', gamma: 3 } }], { nTrain: 200, lambda: 1e-4 });
  assert(b.d === 200 && b.wRaw.every(Number.isFinite), 'rbf data');
});

// ---- separability and negative controls ----
const SEP = [
  ['blobs', {}, [{ id: 'raw' }], 0.98],
  ['circles', { noise: 0 }, [{ id: 'r' }], 0.99],
  ['xor', { noise: 0 }, [{ id: 'x1x2' }], 0.99],
  ['spirals', { noise: 0 }, [{ id: 'spiral', params: { omega: spiralOmega(2) } }], 0.99],
  ['checker', { noise: 0 }, [{ id: 'checker', params: { w: Math.PI / 1.5 } }], 0.99],
  ['ring', { noise: 0 }, [{ id: 'r' }, { id: 'r2' }], 0.99],
  ['normball', { noise: 0, p: 1 }, [{ id: 'l1' }], 0.99],
  ['normball', { noise: 0, p: 3 }, [{ id: 'linf' }], 0.99],
  ['loans', { noise: 0 }, [{ id: 'log1' }, { id: 'log2' }], 0.99],
  ['loans', { noise: 0, rule: 'ratio' }, [{ id: 'ratio' }], 0.99],
  ['loans', { noise: 0, rule: 'log' }, [{ id: 'log1' }, { id: 'x2' }], 0.99],
  ['stripes', { noise: 0 }, [{ id: 'fourier1', params: { w: 1.5 } }], 0.99],
  ['sine', { noise: 0 }, [{ id: 'fourier1', params: { w: 1.5 } }, { id: 'x2' }], 0.99],
  ['flower', { noise: 0 }, [{ id: 'r' }, { id: 'petal', params: { k: 5 } }], 0.97],
  ['wedge', { noise: 0 }, [{ id: 'angle' }], 0.99],
  ['band', { noise: 0 }, [{ id: 'abs1', params: { cx: 0.3 } }], 0.99],
  ['offcircle', { noise: 0 }, [{ id: 'quad2' }], 0.99],
  ['offcircle', { noise: 0 }, [{ id: 'r', params: { cx: 1.1, cy: -0.8 } }], 0.99],
  ['corner', { noise: 0 }, [{ id: 'cornerind', params: { t: -0.5, s: -0.3 } }], 0.99],
];
for (const [id, params, feats, min] of SEP) {
  test(`separable: ${id} + ${feats.map((f) => f.id).join(',')} ≥ ${min}`, () => {
    const r = quickFit(id, feats, { params, nTrain: 200, nTest: 200, lambda: 1e-5 });
    assert(r.train.acc >= min, `train acc ${r.train.acc.toFixed(3)}`);
  });
}
const NEG = [
  ['circles', [{ id: 'raw' }], 0.7],
  ['xor', [{ id: 'raw' }], 0.7],
  ['spirals', [{ id: 'raw' }], 0.7],
  ['ring', [{ id: 'r' }], 0.75],
];
for (const [id, feats, max] of NEG) {
  test(`negative control: ${id} + ${feats.map((f) => f.id).join(',')} ≤ ${max}`, () => {
    const r = quickFit(id, feats, { nTrain: 200, nTest: 300 });
    assert(r.test.acc <= max, `test acc ${r.test.acc.toFixed(3)}`);
  });
}
test('stripes need sin AND cos (phase)', () => {
  const a = quickFit('stripes', [{ id: 'sinx1', params: { w: 1.5 } }], { nTest: 300 });
  const b = quickFit('stripes', [{ id: 'fourier1', params: { w: 1.5 } }], { nTest: 300 });
  assert(b.test.acc - a.test.acc >= 0.15, `sin ${a.test.acc} vs sin+cos ${b.test.acc}`);
});

// ---- geometry ----
test('geometry: unit circle contour', () => {
  const G = 101, V = new Float64Array(G * G), lo = -2, step = 4 / (G - 1);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = lo + i * step, y = lo + j * step; V[j * G + i] = x * x + y * y - 1; }
  const segs = marchingSquares(V, G);
  for (let k = 0; k < segs.length; k += 2) {
    const x = lo + segs[k] * step, y = lo + segs[k + 1] * step;
    assert(Math.abs(Math.hypot(x, y) - 1) < 0.01, 'on circle');
  }
  assertClose(contourLength(segs, step, step), 2 * Math.PI, 0.01 * 2 * Math.PI, 'length');
});
test('geometry: chainSegments joins a circle into one closed polyline, a hyperbola into two', () => {
  const G = 101, lo = -2, step = 4 / (G - 1), V = new Float64Array(G * G), H = new Float64Array(G * G);
  // radii chosen so the curves miss grid vertices (as cell-centered grids do)
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = lo + i * step, y = lo + j * step; V[j * G + i] = x * x + y * y - 1.0123; H[j * G + i] = x * y - 0.5123; }
  const segs = marchingSquares(V, G), loop = chainSegments(segs);
  assert(loop.length === 1, `circle in ${loop.length} pieces`);
  const L = loop[0], n = L.length;
  assert(n / 2 === segs.length / 4 + 1, 'every segment used once');
  assertClose(L[0], L[n - 2], 1e-9); assertClose(L[1], L[n - 1], 1e-9);
  const branches = chainSegments(marchingSquares(H, G));
  assert(branches.length === 2, `hyperbola in ${branches.length} pieces`);
});
test('geometry: conic classification', () => {
  const cases = [
    [[-1, 0, 0, 1, 0, 1], 'circle'], [[-1, 0, 0, 1, 0, 3], 'ellipse'], [[-1, 0, 0, 1, 1, 1], 'ellipse'],
    [[-1, 0, 0, 1, 2, 1], 'parallel lines'], [[-1, 0, 0, 1, 3, 1], 'hyperbola'], [[0, 0, -1, 1, 0, 0], 'parabola'],
    [[0, 0, 0, 0, 1, 0], 'crossing lines'], [[1, 0, 0, 1, 0, 1], 'empty'], [[0, 0, 0, 1, 0, 1], 'point'],
    [[1, 1, 0, 0, 0, 0], 'line'], [[1, 0, 0, 0, 0, 0], 'none'], [[0, 0, 0, 1, 2, 1], 'line'],
  ];
  for (const [w, name] of cases) assert(classifyConic(w).name === name, `${JSON.stringify(w)} → ${classifyConic(w).name}, expected ${name}`);
});
test('geometry: IoU identities', () => {
  const A = [1, 1, 0, 0], B = [0, 0, 1, 1];
  assert(iou(A, A) === 1 && iou(A, B) === 0);
});
test('geometry: lift intersection center is (a/2, b/2)', () => {
  // bowl x²+y² = a x + b y + c  ⇔  (x − a/2)² + (y − b/2)² = c + (a²+b²)/4
  const a = 1.2, b = -0.6, c = 1, G = 201, lo = -3, st = 6 / (G - 1), V = new Float64Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = lo + i * st, y = lo + j * st; V[j * G + i] = x * x + y * y - a * x - b * y - c; }
  const segs = marchingSquares(V, G);
  let mx = 0, my = 0;
  for (let k = 0; k < segs.length; k += 2) { mx += lo + segs[k] * st; my += lo + segs[k + 1] * st; }
  mx /= segs.length / 2; my /= segs.length / 2;
  assertClose(mx, a / 2, 0.01); assertClose(my, b / 2, 0.01);
});
