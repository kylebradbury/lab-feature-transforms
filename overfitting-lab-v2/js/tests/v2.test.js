// Overfitting Lab v2: the engine's guarantees (math), every claim in the
// station text and every goal's properties (content), and timing (perf).

import { suite, test, assert, bench } from './harness.js';
import { CHALLENGES, SETTINGS, ETAS, KS, N_TRAIN, N_HELD, MARGIN, result, suggestT, resampleStats, fitZ, trainBase, heldBase, trainAt, knnGrid, VIEW } from '../engine.js';
import { base, atNoise, SINE } from '../data.js';
import { knnCounts, knnCountBrute } from '../knn.js';
import { makeRng } from '../rng.js';
import * as TXT from '../stations.js';

const P = (v) => `${(100 * v).toFixed(1)}%`;
const at = (ch, si, s) => result(ch.model, ch.ds, si, s);
const byId = (id) => CHALLENGES.find((c) => c.id === id);

// ---------- math ----------
suite('math');

test('data: noise moves the same points the same way at every level; labels never change', () => {
  for (const ds of ['circles', 'moons', 'sine']) {
    const b = base(ds, 200, 11), x0 = atNoise(b, 0), x1 = atNoise(b, 0.1);
    for (const eta of [0.05, 0.3, 0.6]) {
      const x = atNoise(b, eta);
      for (let i = 0; i < x.length; i++) assert(Math.abs((x[i] - x0[i]) / eta - (x1[i] - x0[i]) / 0.1) < 1e-9, `${ds}: direction changed at η = ${eta}`);
    }
    assert(b.y.reduce((a, v) => a + v, 0) === 100, `${ds}: not 100 points per class`);
  }
  assert(trainBase('moons').y.length === N_TRAIN && heldBase('moons').y.length === N_HELD, 'set sizes');
});
test('data: the sine band keeps an empty strip around the curve in the clean data', () => {
  const b = base('sine', 1000, 5);
  for (let i = 0; i < 1000; i++) {
    const d = b.Xc[2 * i + 1] - SINE.A * Math.sin(SINE.w * b.Xc[2 * i] + SINE.ph);
    assert(Math.abs(d) >= SINE.gap - 1e-12 && (d > 0) === (b.y[i] === 1), `point ${i} at distance ${d}`);
  }
});
test('knn: counts for every k equal brute force (training and new points)', () => {
  const rng = makeRng(3), n = 60, X = new Float64Array(2 * n), y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { X[2 * i] = rng.normal(); X[2 * i + 1] = rng.normal(); y[i] = i % 2; }
  const Q = new Float64Array(2 * 25);
  for (let i = 0; i < 25; i++) { Q[2 * i] = rng.normal(); Q[2 * i + 1] = rng.normal(); }
  const ks = [59, 31, 11, 5, 3, 1], c1 = knnCounts(X, y, Q, 25, ks), c2 = knnCounts(X, y, X, n, ks);
  for (let q = 0; q < 25; q++) ks.forEach((k, j) => assert(c1[q * ks.length + j] === knnCountBrute(X, y, Q[2 * q], Q[2 * q + 1], k), `query ${q}, k = ${k}`));
  for (let q = 0; q < n; q++) ks.forEach((k, j) => assert(c2[q * ks.length + j] === knnCountBrute(X, y, X[2 * q], X[2 * q + 1], k), `training point ${q}, k = ${k}`));
});
test('knn: with k = 1 every training point is classified correctly; grid votes match brute force', () => {
  for (const ch of CHALLENGES.filter((c) => c.model === 'knn')) assert(at(ch, ch.goalSi, 1).trainCorrect === N_TRAIN, `${ch.id}: k = 1 training accuracy`);
  const G = 30, g = knnGrid({ ds: 'moons', si: 10, k: 15, G }), X = trainAt('moons', 10), y = trainBase('moons').y;
  for (const [i, j] of [[0, 0], [7, 22], [15, 15], [29, 3]]) {
    const c = knnCountBrute(X, y, VIEW.xmin + ((i + 0.5) / G) * 6, VIEW.ymin + ((j + 0.5) / G) * 6, 15);
    assert((g.V[j * G + i] > 0) === (2 * c > 15), `grid cell ${i},${j}`);
  }
});
test('logistic regression: overlapping classes give the exact unpenalized fit, even with large scores', () => {
  const r = at(byId('lr-circles'), 10, 2), r10 = at(byId('lr-moons'), 10, 3);
  assert(!r.guarded && !r10.guarded, 'noisy, overlapping fits should not need the guard');
});
test('logistic regression: training points that separate perfectly keep the guard', () => {
  assert(at(byId('lr-circles'), 0, 4).guarded, 'clean circles at degree 4 separate perfectly');
  // quasi-separated: z ≥ 0 for class 1 and z ≤ 0 for class 0, with one point of each class at 0.
  // Not every point can be right, yet the weight on z grows without limit: no best fit exists.
  const Z = Float64Array.from([-2, -1.5, -1, 0, 0, 1, 1.5, 2]), y = Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 1]);
  assert(fitZ(Z, y, 8, 1).guarded === true, 'quasi-separated data should keep the guard');
  // and two overlapping classes have a finite best fit
  const Z2 = Float64Array.from([-2, -1, 0.5, 1, -0.5, 0, 1, 2]), y2 = Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 1]);
  assert(fitZ(Z2, y2, 8, 1).guarded === false, 'overlapping classes should give the exact fit');
});

// ---------- content: goals and every claim in the text ----------
suite('content');

for (const ch of CHALLENGES) {
  test(`${ch.id}: the goal is reachable, and the setting with the best training accuracy misses it`, () => {
    const S = SETTINGS[ch.model], rs = S.map((s) => at(ch, ch.goalSi, s)), T = ch.T;
    assert(T === suggestT(ch), `T = ${T}, the calibration rule gives ${suggestT(ch)}`);
    const best = Math.max(...rs.map((r) => r.heldCorrect)), reach = S.filter((_, i) => rs[i].heldCorrect >= T);
    assert(reach.length >= 2, `only ${reach.length} setting(s) reach the goal`);
    assert(T <= best - 10 * MARGIN[ch.id] + 1e-9, `goal ${T} too close to the best ${best}`);
    const topTrain = Math.max(...rs.map((r) => r.trainCorrect));
    for (let i = 0; i < S.length; i++) if (rs[i].trainCorrect === topTrain) assert(rs[i].heldCorrect <= T - 10, `${S[i]} has the top training accuracy but reaches ${rs[i].heldCorrect}`);
    return `goal ${T / 10}% · reached by ${reach.join(', ')} · best ${best / 10}%`;
  });
  test(`${ch.id}: with clean data, the most flexible setting is within 2 points of the best`, () => {
    const S = SETTINGS[ch.model], rs = S.map((s) => at(ch, 0, s)), best = Math.max(...rs.map((r) => r.held));
    assert(rs[S.length - 1].held >= best - 0.02, `${P(rs[S.length - 1].held)} vs best ${P(best)}`);
  });
}
test('text claims after the goal (circles, moons, sine)', () => {
  const c = byId('lr-circles'), g = c.goalSi;
  assert(at(c, g, 1).held < 0.6 && at(c, g, 2).held >= c.T / 1000 && at(c, g, 10).train === 1 && at(c, g, 10).held < at(c, g, 2).held - 0.05 && at(c, 0, 10).held > 0.99, 'circles, logistic regression');
  const m = byId('lr-moons');
  assert(Math.abs(at(m, 10, 10).held - at(m, 10, 1).held) <= 0.015 && at(m, 10, 10).train === 1, 'moons: degree 10 about as low as a straight line');
  assert([3, 4].every((d) => at(m, 10, d).held >= m.T / 1000), 'moons: degrees 3–4 reach the goal');
  const s = byId('lr-sine'), sg = s.goalSi;
  assert([1, 2].every((d) => at(s, sg, d).held < 0.75) && [5, 6].every((d) => at(s, sg, d).held >= s.T / 1000), 'sine: degrees 1–2 fail, 5–6 reach the goal');
  assert([7, 8, 9, 10].every((d) => at(s, sg, d).held < at(s, sg, 6).held) && at(s, sg, 10).train > at(s, sg, 6).train, 'sine: from degree 7 on lower while training climbs');
  const kc = byId('knn-circles');
  assert(at(kc, 10, 1).held < kc.T / 1000 && [99, 149, 199].every((k) => Math.abs(at(kc, 10, k).held - 0.5) < 0.02), 'knn circles: k = 1 misses, k ≥ 99 is a coin flip');
  const ks = byId('knn-sine');
  assert([65, 99, 149, 199].every((k) => at(ks, 6, k).held < 0.72), 'knn sine: k ≥ 65 cannot follow the wave');
  return `${TXT.goalRange(byId('knn-moons'))} · ${TXT.goalRange(ks)}`;
});
test('resampling (moons, noise 0.50, 30 training sets): flexible settings move most, rigid ones miss most', () => {
  const st = (model, setting) => resampleStats({ ds: 'moons', si: 10, model, setting, R: 30 });
  const d1 = st('lr', 1), d3 = st('lr', 3), d10 = st('lr', 10), k1 = st('knn', 1), k15 = st('knn', 15), k149 = st('knn', 149);
  assert(d10.disagree > 3 * d3.disagree && d10.disagree > d1.disagree && k1.disagree > 2 * k15.disagree, 'variance ordering');
  assert(d1.miss > 3 * d3.miss && d10.miss < 0.01 && k149.miss > 3 * k15.miss && k1.miss < 0.01, 'bias ordering');
  return `degree 1/3/10 moves ${P(d1.disagree)}/${P(d3.disagree)}/${P(d10.disagree)}, misses ${P(d1.miss)}/${P(d3.miss)}/${P(d10.miss)} · k 149/15/1 moves ${P(k149.disagree)}/${P(k15.disagree)}/${P(k1.disagree)}, misses ${P(k149.miss)}/${P(k15.miss)}/${P(k1.miss)}`;
});
test('every challenge has its text', () => {
  for (const ch of CHALLENGES) assert(TXT.lead(ch) && TXT.lesson(ch).length > 80 && TXT.goalText(ch).includes(`${(ch.T / 10).toFixed(1)} %`), ch.id);
  assert(ETAS.length === 13 && KS.length === 14, 'grids');
});

// ---------- perf ----------
suite('perf');
test('timing: a degree-10 fit, a KNN case and a KNN grid', () => {
  let n = 0;
  const lr = bench(() => result('lr', 'sine', 7 + (n++ % 5), 10), 3); // fresh noise levels: not cached
  const t0 = performance.now(); result('knn', 'sine', 12, 1, 7); const knn = performance.now() - t0;
  const t1 = performance.now(); knnGrid({ ds: 'sine', si: 12, k: 1, r: 7 }); const grid = performance.now() - t1;
  assert(lr < 300 && knn < 200 && grid < 400, `degree 10 ${lr.toFixed(0)} ms, KNN ${knn.toFixed(0)} ms, grid ${grid.toFixed(0)} ms`);
  return `degree-10 fit ${lr.toFixed(0)} ms · KNN case (all k) ${knn.toFixed(0)} ms · KNN grid 120² ${grid.toFixed(0)} ms`;
});
