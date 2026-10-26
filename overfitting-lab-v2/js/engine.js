// Headless computation behind every station, shared by the pages and the tests.
//
// Data: per dataset, one training set of N_TRAIN points (more for the
// resampling station) and one held-out set of N_HELD points, each generated
// once as clean points plus a fixed noise draw (data.js), so the data at any
// noise level are exactly X(η) = Xc + η·ε.
//
// Models:
//   logistic regression on polynomial features of degree 1–10, fit with no
//   penalty: when the training classes overlap, the exact unpenalized fit;
//   when some training points can be separated perfectly (no best fit exists),
//   the numerical guard GUARD (model.js) decides where the fit stops;
//   k-nearest neighbors (KNN) for every k in KS at once (knn.js).

import { base, atNoise, BOX } from './data.js';
import { buildFeatureMap, designMatrix, fitStandardizer, standardize, foldWeights } from './features.js';
import { Trainer, DualTrainer, GUARD, logits } from './model.js';
import { deriveSeed } from './rng.js';
import { evalGrid } from './plot2d.js';
import { RULES } from './truth.js';
import { knnCounts, knnPredict } from './knn.js';

export { GUARD };
export const SEED = 705;
export const N_TRAIN = 200;
export const N_HELD = 1000;
export const VIEW = BOX;
export const ETAS = Array.from({ length: 13 }, (_, i) => i / 20); // noise levels 0, 0.05, …, 0.6
export const DEGREES = Array.from({ length: 10 }, (_, i) => i + 1);
export const KS = [199, 149, 99, 65, 45, 31, 21, 15, 11, 9, 7, 5, 3, 1]; // most neighbors first: flexibility grows to the right
export const SETTINGS = { lr: DEGREES, knn: KS };
export const MAX_RESAMPLES = 30;

// The six challenges. goalSi: index of the goal noise level in ETAS; T: the
// held-out goal as a count of correct points out of N_HELD (set from the
// calibration suite; the content tests check every property claimed for it).
export const CHALLENGES = [
  { id: 'lr-circles', part: 1, ds: 'circles', model: 'lr', goalSi: 10, T: 875 },
  { id: 'lr-moons', part: 1, ds: 'moons', model: 'lr', goalSi: 10, T: 890 },
  { id: 'lr-sine', part: 1, ds: 'sine', model: 'lr', goalSi: 6, T: 820 },
  { id: 'knn-circles', part: 2, ds: 'circles', model: 'knn', goalSi: 10, T: 885 },
  { id: 'knn-moons', part: 2, ds: 'moons', model: 'knn', goalSi: 10, T: 890 },
  { id: 'knn-sine', part: 2, ds: 'sine', model: 'knn', goalSi: 6, T: 840 },
];
// The margin below the best held-out accuracy at the goal noise used to set T (in points of accuracy).
// (Sine with logistic regression and moons with KNN use smaller margins, so that the setting with
// the highest training accuracy still misses T by at least 1 point.)
export const MARGIN = { 'lr-circles': 1.5, 'lr-moons': 1.5, 'lr-sine': 1.5, 'knn-circles': 1, 'knn-moons': 0.5, 'knn-sine': 1 };

const memo = (map, k, make) => { if (!map.has(k)) map.set(k, make()); return map.get(k); };
const bases = new Map(), points = new Map(), lrs = new Map(), knns = new Map(), heldDesigns = new Map();

// ---------- data ----------

const trainTag = (ds, r) => (r === 0 ? `${ds}:train` : `${ds}:resample:${r}`);
export const trainBase = (ds, r = 0) => memo(bases, `t|${ds}|${r}`, () => base(ds, N_TRAIN, deriveSeed(SEED, trainTag(ds, r))));
export const heldBase = (ds) => memo(bases, `h|${ds}`, () => base(ds, N_HELD, deriveSeed(SEED, `${ds}:held`)));
export const trainAt = (ds, si, r = 0) => memo(points, `t|${ds}|${si}|${r}`, () => atNoise(trainBase(ds, r), ETAS[si]));
export const heldAt = (ds, si) => memo(points, `h|${ds}|${si}`, () => atNoise(heldBase(ds), ETAS[si]));

// ---------- logistic regression ----------

function accuracyCount(s, y) {
  let ok = 0;
  for (let i = 0; i < y.length; i++) if ((s[i] > 0 ? 1 : 0) === y[i]) ok++;
  return ok;
}
const maxAbs = (w) => { let m = 0; for (let j = 1; j < w.length; j++) m = Math.max(m, Math.abs(w[j])); return m; };

/**
 * Logistic regression on the N×d design Z (standardized inside), with no
 * penalty. A short fit with the numerical guard GUARD gives a safe starting
 * point; then plain Newton steps with no penalty at all run until they no
 * longer improve the fit. That is the fit used, always.
 * If the training classes overlap everywhere, it is the exact best fit. If
 * some training points can be separated perfectly, no best fit exists (the
 * weights would grow forever): 10 more full Newton steps then keep making the
 * weights grow, and `guarded` is set so the page can say so. The boundary has
 * stopped changing by then, so the accuracies do not depend on where it stops.
 */
export function fitZ(Z, y, N, d, { lambda = GUARD } = {}) {
  const std = fitStandardizer(Z, N, d), Zs = standardize(Z, N, d, std);
  if (d + 1 > N) return { std, wStd: new DualTrainer(Zs, y, N, d, lambda).run(), get wRaw() { return foldWeights(this.wStd, std); }, guarded: true };
  const t = new Trainer(Zs, y, N, d, lambda);
  t.biasPen = lambda; t.loss = t.objective(t.w);
  t.run();
  Object.assign(t, { lambda: 0, biasPen: 0, converged: false, reason: null, iters: 0 });
  t.loss = t.objective(t.w);
  t.run();
  const wStd = Float64Array.from(t.w), before = maxAbs(wStd);
  t.force = true; // full Newton steps even where the gradient is already tiny
  for (let i = 0; i < 10; i++) { t.converged = false; t.iterate(); }
  const guarded = !(maxAbs(t.w) <= 1.01 * before + 1e-6);
  return { std, wStd, wRaw: foldWeights(wStd, std), guarded };
}

export const polySpecs = (degree) => [{ id: 'poly', params: { k: degree } }];

// One logistic-regression fit: dataset ds, noise index si, degree, training set r.
export function lrCase({ ds, si, degree, r = 0 }) {
  return memo(lrs, `${ds}|${si}|${degree}|${r}`, () => {
    const tb = trainBase(ds, r), X = trainAt(ds, si, r), fmap = buildFeatureMap(polySpecs(degree), { view: VIEW }), d = fmap.dim;
    const Z = designMatrix(fmap, X), fit = fitZ(Z, tb.y, N_TRAIN, d);
    const Zh = memo(heldDesigns, `${ds}|${si}|${degree}`, () => designMatrix(fmap, heldAt(ds, si)));
    const sTr = logits(fit.wRaw, Z, N_TRAIN, d), sHe = logits(fit.wRaw, Zh, N_HELD, d), hy = heldBase(ds).y;
    const predHeld = Uint8Array.from(sHe, (s) => (s > 0 ? 1 : 0));
    const trainCorrect = accuracyCount(sTr, tb.y), heldCorrect = accuracyCount(sHe, hy);
    return { model: 'lr', ds, si, setting: degree, r, d, fmap, ...fit, trainCorrect, heldCorrect, train: trainCorrect / N_TRAIN, held: heldCorrect / N_HELD, predHeld };
  });
}

// ---------- KNN ----------

// Every k at once for one dataset, noise index and training set.
export function knnCase({ ds, si, r = 0 }) {
  return memo(knns, `${ds}|${si}|${r}`, () => {
    const tb = trainBase(ds, r), X = trainAt(ds, si, r), hb = heldBase(ds), Xh = heldAt(ds, si);
    const ct = knnCounts(X, tb.y, X, N_TRAIN, KS), ch = knnCounts(X, tb.y, Xh, N_HELD, KS);
    const pt = knnPredict(ct, N_TRAIN, KS), ph = knnPredict(ch, N_HELD, KS);
    const count = (p, y) => { let ok = 0; for (let i = 0; i < y.length; i++) if (p[i] === y[i]) ok++; return ok; };
    return { ds, si, r, X, y: tb.y, trainCorrect: pt.map((p) => count(p, tb.y)), heldCorrect: ph.map((p) => count(p, hb.y)), predHeld: ph };
  });
}
export function knnSetting({ ds, si, k, r = 0 }) {
  const c = knnCase({ ds, si, r }), j = KS.indexOf(k);
  return { model: 'knn', ds, si, setting: k, r, k, trainCorrect: c.trainCorrect[j], heldCorrect: c.heldCorrect[j], train: c.trainCorrect[j] / N_TRAIN, held: c.heldCorrect[j] / N_HELD, predHeld: c.predHeld[j], guarded: false };
}

// The KNN vote on a G×G grid, as a logit of the share of class-1 neighbors (for shading;
// the boundary is where it crosses 0). Counts for all k are kept for the last few grids.
const gridCounts = new Map();
export function knnGrid({ ds, si, k, r = 0, G = 120 }) {
  const key = `${ds}|${si}|${r}|${G}`;
  let counts = gridCounts.get(key);
  if (!counts) {
    const Q = new Float64Array(2 * G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      Q[2 * (j * G + i)] = VIEW.xmin + ((i + 0.5) / G) * (VIEW.xmax - VIEW.xmin);
      Q[2 * (j * G + i) + 1] = VIEW.ymin + ((j + 0.5) / G) * (VIEW.ymax - VIEW.ymin);
    }
    counts = knnCounts(trainAt(ds, si, r), trainBase(ds, r).y, Q, G * G, KS);
    gridCounts.set(key, counts);
    if (gridCounts.size > 40) gridCounts.delete(gridCounts.keys().next().value);
  }
  const K = KS.length, j = KS.indexOf(k), V = new Float32Array(G * G);
  for (let q = 0; q < G * G; q++) { const p = Math.min(0.98, Math.max(0.02, counts[q * K + j] / k)); V[q] = Math.log(p / (1 - p)); }
  return { G, V };
}

// ---------- one setting, either model ----------

export function result(model, ds, si, setting, r = 0) {
  return model === 'lr' ? lrCase({ ds, si, degree: setting, r }) : knnSetting({ ds, si, k: setting, r });
}
export function gridOf(res, G = 120) {
  if (res.model === 'lr') { res.grids ||= {}; return res.grids[G] || (res.grids[G] = evalGrid(res.fmap, res.wRaw, VIEW, G)); }
  return knnGrid({ ds: res.ds, si: res.si, k: res.setting, r: res.r, G });
}
// A setting's result if it has been computed already, else null (the maps read this while a sweep fills them in).
export function peek(model, ds, si, setting, r = 0) {
  if (model === 'lr') return lrs.get(`${ds}|${si}|${setting}|${r}`) || null;
  return knns.has(`${ds}|${si}|${r}`) ? knnSetting({ ds, si, k: setting, r }) : null;
}
export const goalMet = (ch, si, setting) => si === ch.goalSi && result(ch.model, ch.ds, si, setting).heldCorrect >= ch.T;

// Suggested goal T (count out of N_HELD): the best held-out count at the goal noise, minus the margin, rounded down to 0.5 %.
export function suggestT(ch) {
  const best = Math.max(...SETTINGS[ch.model].map((s) => result(ch.model, ch.ds, ch.goalSi, s).heldCorrect));
  return Math.floor((best - 10 * MARGIN[ch.id]) / 5) * 5;
}

// ---------- resampling: several training sets, one held-out set ----------

/**
 * Measurements across the fits to training sets 0 … R−1 (nothing is combined into a model):
 *   acc: held-out accuracy of each fit;
 *   disagree: the share of held-out points on which two different training sets' fits disagree, averaged over all pairs;
 *   miss: the share of held-out points where at least 90 % of the fits disagree with the rule that generated the data.
 */
export function resampleStats({ ds, si, model, setting, R }) {
  const fits = Array.from({ length: R }, (_, r) => result(model, ds, si, setting, r)), Xh = heldAt(ds, si), rule = RULES[ds];
  const acc = fits.map((f) => f.held);
  let disagree = 0, miss = 0;
  for (let q = 0; q < N_HELD; q++) {
    let c = 0;
    for (const f of fits) c += f.predHeld[q];
    const p = c / R;
    if (R > 1) disagree += (2 * p * (1 - p) * R) / (R - 1);
    const truth = rule(Xh[2 * q], Xh[2 * q + 1]) > 0 ? 1 : 0, wrong = truth ? 1 - p : p;
    if (wrong >= 0.9) miss++;
  }
  return { fits, acc, disagree: disagree / N_HELD, miss: miss / N_HELD };
}
