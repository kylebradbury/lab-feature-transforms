// Overfitting Lab: the engine's guarantees (math), every number the station
// text and question choices state (content), and timing budgets (perf).

import { suite, test, assert, bench } from './harness.js';
import { DATA, REPS, polySpecs, runCase, seeds, mean, disagreement, majorityVote, pool, takeN, fitZ, GUARD } from '../engine.js';
import { Trainer, DualTrainer } from '../model.js';
import { generateSet } from '../datasets.js';
import { buildFeatureMap, designMatrix, standardize } from '../features.js';
import { noiseColumn } from '../hd.js';
import { makeRng } from '../rng.js';
import { STATIONS, byId } from '../stations.js';

const A = (flip) => ({ ...DATA, params: { ...DATA.params, flip } });
const rep = (id, extra = {}) => runCase({ ...A(0.15), specs: REPS[id].specs, N: 100, ...extra });
const b1 = (k, extra = {}) => runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k, ...extra });
const P = (v) => `${(100 * v).toFixed(1)}%`;
const round = (v) => Math.round(100 * v);
const nearest = (v, opts) => opts.reduce((b, o, i) => (Math.abs(o - v) < Math.abs(opts[b] - v) ? i : b), 0);

// ---------- math ----------
suite('math');

function randomDesign(N, d, seed) {
  const rng = makeRng(seed), Z = new Float64Array(N * d), y = new Uint8Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < d; j++) { Z[i * d + j] = rng.normal(); s += Z[i * d + j] * (j % 3 === 0 ? 1 : -0.5); } y[i] = s + rng.normal() > 0 ? 1 : 0; }
  return { Z, y };
}
for (const [N, d] of [[40, 15], [30, 40]]) {
  test(`dual and primal Newton give the same weights (N = ${N}, d = ${d})`, () => {
    const { Z, y } = randomDesign(N, d, 7 + d), lam = 1e-3;
    const p = new Trainer(Z, y, N, d, lam);
    p.biasPen = lam; p.loss = p.objective(p.w); p.run();
    const w = new DualTrainer(Z, y, N, d, lam).run();
    let worst = 0;
    for (let j = 0; j <= d; j++) worst = Math.max(worst, Math.abs(w[j] - p.w[j]) / Math.max(1, Math.abs(p.w[j])));
    assert(worst < 1e-5, `largest relative difference ${worst}`);
    return `max rel diff ${worst.toExponential(1)}`;
  });
}
test('overlapping classes: the exact unpenalized fit (gradient ~0 at λ = 0)', () => {
  const r = rep('designed');
  assert(!r.guarded, 'designed features on noisy circles should not need the guard');
  const fmap = buildFeatureMap(REPS.designed.specs), Z = standardize(designMatrix(fmap, r.tr.X), r.N, r.d, r.std);
  const g = new Float64Array(r.d + 1);
  for (let i = 0; i < r.N; i++) {
    let s = r.wStd[0];
    for (let j = 0; j < r.d; j++) s += r.wStd[j + 1] * Z[i * r.d + j];
    const e = 1 / (1 + Math.exp(-s)) - r.tr.y[i];
    g[0] += e / r.N;
    for (let j = 0; j < r.d; j++) g[j + 1] += (e * Z[i * r.d + j]) / r.N;
  }
  const gmax = Math.max(...Array.from(g, Math.abs));
  assert(gmax < 1e-6, `gradient ${gmax}`);
  return `|gradient| ${gmax.toExponential(1)}`;
});
test('separable training sets keep the guard; no fit stops at the iteration cap', () => {
  const all = [rep('designed'), rep('poly10'), rep('rbf'), b1(0), b1(20), b1(100), b1(500)];
  for (const r of all) assert(r.reason !== 'cap', `${r.specs[0].id} k=${r.k} stopped at the cap`);
  assert(rep('poly10').guarded && rep('rbf').guarded && b1(100).guarded, 'separable fits should be guarded');
});
test('label flips: X unchanged, flipped points nested as the rate rises', () => {
  const a = generateSet('circles', { ...DATA.params, flip: 0.1 }, 400, 99), b = generateSet('circles', { ...DATA.params, flip: 0.2 }, 400, 99), c = generateSet('circles', { ...DATA.params, flip: 0 }, 400, 99);
  for (let i = 0; i < a.X.length; i++) assert(a.X[i] === b.X[i] && a.X[i] === c.X[i], 'X changed with the flip rate');
  let na = 0, nb = 0;
  for (let i = 0; i < 400; i++) { if (a.y[i] !== c.y[i]) { na++; assert(b.y[i] !== c.y[i], `point ${i} flipped at 10 % but not at 20 %`); } if (b.y[i] !== c.y[i]) nb++; }
  return `${na} flipped at 10 %, ${nb} at 20 %`;
});
test('training sets: smaller ones are prefixes of larger ones, and class-balanced', () => {
  const P0 = pool(DATA.ds, { ...DATA.params, flip: 0.15 }), s40 = takeN(P0, 40), s100 = takeN(P0, 100), s400 = takeN(P0, 400);
  assert(s40.idx.every((i) => s100.idx.includes(i)) && s100.idx.every((i) => s400.idx.includes(i)), 'not nested');
  for (const s of [s40, s100, s400]) { const n1 = s.yClean.reduce((a, b) => a + b, 0); assert(n1 === Math.floor(s.N / 2), `${n1} of ${s.N} in class 1`); }
});
test('noise inputs: the first k are the same whatever k is', () => {
  const a = noiseColumn('pool:705', 3, 50), b = noiseColumn('pool:705', 3, 800);
  for (let i = 0; i < 50; i++) assert(a[i] === b[i], 'noise column changed with n');
  const r5 = b1(5), r10 = b1(10);
  for (let j = 0; j < 5; j++) { const u = r5.column(2 + j, 'train'), v = r10.column(2 + j, 'train'); for (let i = 0; i < u.length; i++) assert(u[i] === v[i], `noise input ${j + 1} changed with k`); }
});

// ---------- content: every claim in the station text ----------
suite('content');

test('A1: the designed features learn the circle, the flexible ones the flips', () => {
  const d = rep('designed'), p = rep('poly10'), r = rep('rbf');
  assert(d.test >= d.ceiling - 0.03 && d.memorized <= 0.1 * d.flipped, `designed ${P(d.test)} (best ${P(d.ceiling)}), memorized ${d.memorized}/${d.flipped}`);
  assert(p.train >= 0.93 && p.test <= d.test - 0.08 && p.memorized >= 0.6 * p.flipped, `degree 10 ${P(p.train)}/${P(p.test)}, memorized ${p.memorized}/${p.flipped}`);
  assert(r.train === 1 && r.memorized === r.flipped && r.test <= d.test - 0.08, `RBF ${P(r.train)}/${P(r.test)}`);
  return `designed ${P(d.train)}/${P(d.test)} · degree 10 ${P(p.train)}/${P(p.test)} · RBF ${P(r.train)}/${P(r.test)} · best ${P(d.ceiling)}`;
});
test('A1 question and explanation: 94 % training, about 68 % new, 17 of 22 memorized, designed 84 % and none', () => {
  const p = rep('poly10'), d = rep('designed'), q = byId('a1').question;
  assert(round(p.train) === 94, `train ${P(p.train)}`);
  assert(nearest(p.test, [0.94, 0.85, 0.68, 0.5]) === q.answer && Math.abs(p.test - 0.68) <= 0.02, `test ${P(p.test)}`);
  assert(round(d.ceiling) === 85, `best possible ${P(d.ceiling)}`);
  assert(p.memorized === 17 && p.flipped === 22 && round(d.test) === 84 && d.memorized === 0, `memorized ${p.memorized}/${p.flipped}, designed ${P(d.test)} memorized ${d.memorized}`);
});
test('A1: accuracy with no flips is ≈ 100 % for every representation', () => {
  for (const id of Object.keys(REPS)) { const r = runCase({ ...A(0), specs: REPS[id].specs, N: 100 }); assert(r.test >= 0.97 && r.ceiling === 1, `${id}: ${P(r.test)}`); }
});
test('A2: degree 2 is best on new points; degree 10 ≈ 96 % training, ≈ 71 % new', () => {
  const ks = Array.from({ length: 10 }, (_, i) => i + 1), t = (k, key, N = 100) => mean(seeds(5).map((seed) => runCase({ ...A(0.15), specs: polySpecs(k), N, seed })[key]));
  const tests = ks.map((k) => t(k, 'test')), best = Math.max(...tests), q = byId('a2').question;
  assert(tests[1] >= best - 0.005 && q.answer === 1, `degree 2 ${P(tests[1])}, best ${P(best)}`);
  assert(round(tests[1]) === 82 && round(t(10, 'train')) === 96 && round(tests[9]) === 71, `degree 2 ${P(tests[1])}, degree 10 ${P(t(10, 'train'))}/${P(tests[9])}`);
  const trains = ks.map((k) => t(k, 'train'));
  assert(trains[9] >= trains[1] + 0.08, 'training accuracy should climb with the degree');
  return ks.map((k, i) => `${k}:${P(trains[i])}/${P(tests[i])}`).join(' ');
});
test('A2 and wrap-up: more data shrinks the gap at degree 10', () => {
  const gap = (N) => mean(seeds(5).map((seed) => { const r = runCase({ ...A(0.15), specs: polySpecs(10), N, seed }); return r.train - r.test; }));
  const g40 = gap(40), g400 = gap(400);
  assert(g400 <= g40 - 0.15, `gap ${P(g40)} at N = 40, ${P(g400)} at N = 400`);
  return `gap ${P(g40)} → ${P(g400)}`;
});
test('A3: degree-10 fits disagree ≥ 3× more; the vote ≈ 84 %, ≈ the designed features', () => {
  const fits = (id) => seeds(8).map((seed) => rep(id, { seed }));
  const d = fits('designed'), p = fits('poly10'), dd = disagreement(d), dp = disagreement(p), vote = majorityVote(p), single = mean(p.map((f) => f.test));
  assert(dp >= 3 * dd, `disagreement ${P(dp)} vs ${P(dd)}`);
  assert(vote >= single + 0.07 && round(single) === 70 && round(vote) === 84, `single ${P(single)}, vote ${P(vote)}`);
  assert(Math.abs(vote - mean(d.map((f) => f.test))) <= 0.02, 'the vote should be about as good as the designed features');
  assert(nearest(vote, [0.6, 0.7, 0.84]) === byId('a3').question.answer, 'question answer');
  return `disagreement ${P(dd)} vs ${P(dp)} · single ${P(single)} · vote ${P(vote)}`;
});
test('B1: noise inputs drive training to 100 % and new points toward a coin flip', () => {
  const r0 = b1(0), r100 = b1(100);
  for (const seed of seeds(5)) for (const k of [20, 50, 100, 200, 500]) assert(b1(k, { seed }).train === 1, `k = ${k}, seed ${seed}: training ${P(b1(k, { seed }).train)}`);
  assert(b1(10).train < 1, 'k = 10 should not fit every training point yet');
  assert(r0.test - r100.test >= 0.15 && r100.realShare <= 0.3, `test ${P(r0.test)} → ${P(r100.test)}, share ${r100.realShare.toFixed(2)}`);
  assert(b1(500).test > 0.5, 'falls toward a coin flip, never reaches it');
  const m100 = mean(seeds(5).map((seed) => b1(100, { seed }).test));
  assert(round(r100.test) === 63 && round(m100) === 65 && round(r0.test) === 90, `k = 100: ${P(r100.test)} (mean ${P(m100)}), k = 0: ${P(r0.test)}`);
  assert(nearest(m100, [0.9, 0.8, 0.65, 0.5]) === byId('b1').question.answer, 'question answer');
  return `k = 0: ${P(r0.test)} · k = 100: ${P(r100.test)} (mean ${P(m100)}) · k = 500: ${P(b1(500).test)}`;
});
test('wrap-up: largest weight above 600 for degree 10, about 1 for the designed features', () => {
  assert(rep('poly10').wMax > 600 && rep('designed').wMax < 2, `${rep('poly10').wMax} vs ${rep('designed').wMax}`);
});
test('the guard only understates overfitting (λ = 10⁻¹⁰ vs 10⁻⁸)', () => {
  const cases = [['designed', {}], ['poly10', {}], ['rbf', {}]].map(([id]) => [rep(id), rep(id, { lambda: 1e-10 })]);
  cases.push([b1(20), b1(20, { lambda: 1e-10 })], [b1(100), b1(100, { lambda: 1e-10 })]);
  for (const [a, b] of cases) assert(b.train >= a.train - 0.005 && b.test <= a.test + 0.01, `${a.specs[0].id} k=${a.k}: ${P(a.train)}/${P(a.test)} → ${P(b.train)}/${P(b.test)}`);
  return cases.map(([a, b]) => `${P(a.test)}→${P(b.test)}`).join(' ');
});
test('every station has its text, question and definitions', () => {
  for (const st of STATIONS) {
    assert(st.question && st.question.choices[st.question.answer] && st.question.reveal, `${st.id}: question`);
    assert(st.defs().length >= 4 && typeof st.how === 'function' && typeof st.chosen === 'function', `${st.id}: text`);
  }
});

// ---------- perf ----------
suite('perf');
// Targets: degree-10 fit ≤ 150 ms, dual fit ≤ 30 ms; fails only above twice the target (as in the main lab).
test('timing budgets', () => {
  const t10 = bench(() => fitZ(...design(polySpecs(10), 100), { lambda: GUARD }), 3);
  const Zb = randomDesign(50, 502, 3), tDual = bench(() => new DualTrainer(Zb.Z, Zb.y, 50, 502, GUARD).run(), 3);
  assert(t10 <= 300 && tDual <= 60, `degree-10 fit ${t10.toFixed(0)} ms, dual fit ${tDual.toFixed(0)} ms`);
  return `degree-10 fit at N = 100: ${t10.toFixed(1)} ms · dual fit d = 502, N = 50: ${tDual.toFixed(1)} ms`;
});
function design(specs, N) {
  const P0 = pool(DATA.ds, { ...DATA.params, flip: 0.15 }), tr = takeN(P0, N), fmap = buildFeatureMap(specs);
  return [designMatrix(fmap, tr.X), tr.y, tr.N, fmap.dim];
}
