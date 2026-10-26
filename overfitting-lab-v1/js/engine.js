// Headless computation behind every station, shared by the pages and the tests.
//
// Data: one pool of N_POOL training points per seed. A training set of size N
// is a class-balanced prefix of the pool, so smaller sets are part of larger
// ones. The test set (N_TEST new points) is the same for every seed. Each
// point also keeps its clean label (before the label flips), so the page can
// mark the flipped training points and count how many the model memorized.
//
// Fit: logistic regression with no penalty. When the training classes overlap,
// the exact unpenalized fit exists and fitZ returns it (guarded: false). When
// the training points can be separated perfectly, no best fit exists, and the
// numerical guard GUARD (model.js) decides where the fit stops (guarded: true).

import { generateSet, BOX } from './datasets.js';
import { buildFeatureMap, designMatrix, fitStandardizer, standardize, foldWeights } from './features.js';
import { Trainer, DualTrainer, GUARD, logits } from './model.js';
import { deriveSeed } from './rng.js';
import { evalGrid } from './plot2d.js';
import { truthRule, ruleAccuracy } from './truth.js';
import { noiseColumn, withNoise } from './hd.js';

export { GUARD };
export const SEED = 705;
export const N_POOL = 800;
export const N_TEST = 2000;
export const VIEW = BOX;
export const DATA = { ds: 'circles', params: { noise: 0.12, gap: 0.7 } };

// Representations used in Part A.
export const REPS = {
  designed: { name: 'Designed', tex: '[\\,x_1^2,\\ x_2^2\\,]', specs: [{ id: 'x1sq' }, { id: 'x2sq' }] },
  poly10: { name: 'Polynomial, degree 10', tex: '[\\,x_1^i x_2^j : 1 \\le i + j \\le 10\\,]', specs: [{ id: 'poly', params: { k: 10 } }] },
  rbf: { name: 'RBF grid, 10 × 10', tex: '[\\,e^{-4\\lVert x - c_j\\rVert^2} : j = 1, \\dots, 100\\,]', specs: [{ id: 'rbf', params: { place: 'grid', m: 10, gamma: 4 } }] },
};
export const polySpecs = (k) => [{ id: 'poly', params: { k } }];

const key = (o) => JSON.stringify(o);
const memo = (map, k, make) => { if (!map.has(k)) map.set(k, make()); return map.get(k); };

// ---------- data ----------

const pools = new Map(), tests = new Map(), designs = new Map(), cases = new Map();

function labeled(ds, params, n, seed) {
  const noisy = generateSet(ds, params, n, seed), clean = generateSet(ds, { ...params, flip: 0 }, n, seed);
  return { X: noisy.X, y: noisy.y, yClean: clean.y };
}
export function pool(ds, params, seed = SEED) {
  return memo(pools, key({ ds, params, seed }), () => labeled(ds, params, N_POOL, deriveSeed(seed, `${ds}:pool`)));
}
export function testSet(ds, params) {
  return memo(tests, key({ ds, params }), () => {
    const t = labeled(ds, params, N_TEST, deriveSeed(SEED, `${ds}:test`));
    return { ...t, idx: Array.from({ length: N_TEST }, (_, i) => i) };
  });
}
// The first ⌊N/2⌋ points of (clean) class 1 and the first ⌈N/2⌉ of class 0, in pool order.
export function takeN(P, N) {
  const n1 = Math.floor(N / 2), idx = [];
  let c1 = 0, c0 = 0;
  for (let i = 0; i < P.y.length && idx.length < N; i++) {
    if (P.yClean[i] === 1 ? c1 < n1 : c0 < N - n1) { idx.push(i); if (P.yClean[i] === 1) c1++; else c0++; }
  }
  const X = new Float64Array(2 * idx.length), y = new Uint8Array(idx.length), yClean = new Uint8Array(idx.length);
  idx.forEach((i, k) => { X[2 * k] = P.X[2 * i]; X[2 * k + 1] = P.X[2 * i + 1]; y[k] = P.y[i]; yClean[k] = P.yClean[i]; });
  return { X, y, yClean, idx, N: idx.length };
}

function design(set, specs, tag) {
  return memo(designs, key({ tag, specs }), () => {
    const fmap = buildFeatureMap(specs, { view: VIEW });
    return { fmap, d: fmap.dim, Z: designMatrix(fmap, set.X) };
  });
}
function rows(Z, d, idx) {
  const out = new Float64Array(idx.length * d);
  idx.forEach((i, k) => out.set(Z.subarray(i * d, i * d + d), k * d));
  return out;
}

// ---------- fitting ----------

function accuracy(s, y) {
  let ok = 0;
  for (let i = 0; i < y.length; i++) if ((s[i] > 0 ? 1 : 0) === y[i]) ok++;
  return y.length ? ok / y.length : NaN;
}

/**
 * Logistic regression on the N×d design Z (standardized inside), without a
 * penalty: the guarded fit first; then, if it leaves training points on the
 * wrong side (the classes may overlap), plain Newton steps with no penalty at
 * all, kept only if they reach a true optimum. Otherwise the training points
 * can be separated perfectly, no best fit exists, and the guarded fit stands.
 * lambda: the guard's value (tests use a smaller one to check its direction).
 */
export function fitZ(Z, y, N, d, { lambda = GUARD } = {}) {
  const std = fitStandardizer(Z, N, d), Zs = standardize(Z, N, d, std);
  let wStd, guarded = true, reason, iters;
  if (d + 1 > N) {
    const t = new DualTrainer(Zs, y, N, d, lambda);
    wStd = t.run(); reason = t.reason; iters = t.iters;
  } else {
    const t = new Trainer(Zs, y, N, d, lambda);
    t.biasPen = lambda; t.loss = t.objective(t.w);
    t.run();
    wStd = Float64Array.from(t.w); reason = t.reason; iters = t.iters;
    if (accuracy(t.scores(t.w, t.s), y) < 1) {
      Object.assign(t, { lambda: 0, biasPen: 0, converged: false, reason: null, iters: 0 });
      t.loss = t.objective(t.w);
      t.run();
      // A true optimum: gradient ~0 with points still on the wrong side and no
      // score running off to ±∞ (which would mean some points separate perfectly).
      const s = t.scores(t.w, t.s);
      let sMax = 0;
      for (let i = 0; i < N; i++) sMax = Math.max(sMax, Math.abs(s[i]));
      if (t.reason !== 'cap' && t.gradMax() < 1e-6 && accuracy(s, y) < 1 && sMax < 25) { wStd = Float64Array.from(t.w); guarded = false; reason = t.reason; iters += t.iters; }
    }
  }
  return { std, wStd, wRaw: foldWeights(wStd, std), guarded, reason, iters };
}

/**
 * One training set and its fit.
 * c: {ds, params (incl. flip), specs, N, seed?, k? (noise inputs), lambda?}
 * Returns accuracies, the best possible test accuracy, flipped/memorized
 * counts, weights, scores, and (k = 0 only) fmap for drawing the boundary.
 */
export function runCase(c) {
  const { ds, params, specs, N, seed = SEED, k = 0, lambda = GUARD } = c;
  return memo(cases, key({ ds, params, specs, N, seed, k, lambda }), () => {
    const P = pool(ds, params, seed), tr = takeN(P, N), te = testSet(ds, params);
    const DP = design(P, specs, key({ ds, params, seed, set: 'pool' })), DT = design(te, specs, key({ ds, params, set: 'test' }));
    const d0 = DP.d, d = d0 + k, Nte = te.y.length;
    let Ztr = rows(DP.Z, d0, tr.idx), Zte = DT.Z;
    if (k > 0) {
      Ztr = withNoise(Ztr, tr.N, d0, k, `pool:${seed}`, tr.idx);
      Zte = withNoise(Zte, Nte, d0, k, 'test', te.idx);
    }
    const fit = fitZ(Ztr, tr.y, tr.N, d, { lambda });
    const sTr = logits(fit.wRaw, Ztr, tr.N, d), sTe = logits(fit.wRaw, Zte, Nte, d);
    let flipped = 0, memorized = 0;
    for (let i = 0; i < tr.N; i++) if (tr.y[i] !== tr.yClean[i]) { flipped++; if ((sTr[i] > 0 ? 1 : 0) === tr.y[i]) memorized++; }
    let w2 = 0, w2real = 0, wMax = 0;
    for (let j = 1; j <= d; j++) { const v = fit.wStd[j] ** 2; w2 += v; if (j <= d0) w2real += v; wMax = Math.max(wMax, Math.abs(fit.wStd[j])); }
    // feature j's values (raw, not standardized) on the training or test points
    const column = (j, set) => {
      const S = set === 'test' ? te : tr, D = set === 'test' ? DT : DP, idx = S.idx, out = new Float64Array(idx.length);
      if (j < d0) idx.forEach((i, r) => { out[r] = D.Z[i * d0 + j]; });
      else { const col = noiseColumn(set === 'test' ? 'test' : `pool:${seed}`, j - d0, Math.max(...idx) + 1); idx.forEach((i, r) => { out[r] = col[i]; }); }
      return out;
    };
    return {
      ds, params, specs, N: tr.N, seed, k, d, d0, fmap: k === 0 ? DP.fmap : null,
      tr, te, sTr, sTe, ...fit,
      train: accuracy(sTr, tr.y), test: accuracy(sTe, te.y), ceiling: ruleAccuracy(truthRule(ds, params), te.X, te.y),
      flipped, memorized, wMax, realShare: w2 ? w2real / w2 : 1, column,
    };
  });
}

// A case's result if it has been computed already, else null (charts read this while their fits are filled in).
export function peekCase(c) {
  const { ds, params, specs, N, seed = SEED, k = 0, lambda = GUARD } = c;
  return cases.get(key({ ds, params, specs, N, seed, k, lambda })) || null;
}

// ---------- several training sets ----------

// The displayed training set uses SEED; the others are derived from it.
export const seeds = (n) => Array.from({ length: n }, (_, s) => (s === 0 ? SEED : deriveSeed(SEED, `resample:${s}`)));

export function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

// Average share of the data region (r ≤ 2.7, where points can appear) on which two fits disagree.
export function disagreement(fits, G = 60) {
  const preds = fits.map((f) => evalGrid(f.fmap, f.wRaw, VIEW, G).V), inside = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x1 = VIEW.xmin + ((i + 0.5) / G) * (VIEW.xmax - VIEW.xmin), x2 = VIEW.ymin + ((j + 0.5) / G) * (VIEW.ymax - VIEW.ymin);
    if (Math.hypot(x1, x2) <= 2.7) inside.push(j * G + i);
  }
  let sum = 0, pairs = 0;
  for (let a = 0; a < preds.length; a++) for (let b = a + 1; b < preds.length; b++) {
    let diff = 0;
    for (const q of inside) if ((preds[a][q] > 0) !== (preds[b][q] > 0)) diff++;
    sum += diff / inside.length; pairs++;
  }
  return pairs ? sum / pairs : 0;
}

// Accuracy on the test set of the majority vote of several fits (ties go to the larger total score).
export function majorityVote(fits) {
  const te = fits[0].te, n = te.y.length;
  let ok = 0;
  for (let i = 0; i < n; i++) {
    let votes = 0, total = 0;
    for (const f of fits) { votes += f.sTe[i] > 0 ? 1 : -1; total += Math.tanh(f.sTe[i]); }
    if (((votes > 0 || (votes === 0 && total > 0)) ? 1 : 0) === te.y[i]) ok++;
  }
  return ok / n;
}
