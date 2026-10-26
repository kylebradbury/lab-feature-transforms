// ?suite=calibrate: prints the numbers behind every station default, so that
// parameters and text are chosen from what this engine actually computes.

import { suite, test } from './harness.js';
import { DATA, REPS, polySpecs, runCase, seeds, mean, disagreement, majorityVote } from '../engine.js';

suite('calibrate');
const P = (v) => (100 * v).toFixed(1);
const A = (flip) => ({ ...DATA, params: { ...DATA.params, flip } });

test('A1: representations at flip 0.15, N = 100', () => Object.entries(REPS).map(([id, r]) => {
  const c = runCase({ ...A(0.15), specs: r.specs, N: 100 });
  return `${id} d=${c.d} train ${P(c.train)} test ${P(c.test)} ceil ${P(c.ceiling)} mem ${c.memorized}/${c.flipped} wMax ${c.wMax.toFixed(1)} guarded ${c.guarded} ${c.reason} it ${c.iters}`;
}).join(' | '));

test('A1: vs flip rate', () => ['designed', 'poly10', 'rbf'].map((id) => `${id}: ` + [0, 0.05, 0.1, 0.15, 0.2, 0.25].map((f) => {
  const c = runCase({ ...A(f), specs: REPS[id].specs, N: 100 });
  return `${f}:${P(c.train)}/${P(c.test)}/${P(c.ceiling)}`;
}).join(' ')).join(' || '));

test('A2: mean of 5 sets vs degree, N = 40, 100, 400', () => [40, 100, 400].map((N) => `N=${N}: ` + Array.from({ length: 10 }, (_, i) => i + 1).map((k) => {
  const cs = seeds(5).map((seed) => runCase({ ...A(0.15), specs: polySpecs(k), N, seed }));
  return `${k}:${P(mean(cs.map((c) => c.train)))}/${P(mean(cs.map((c) => c.test)))}`;
}).join(' ')).join(' || '));

test('A3: 8 training sets', () => ['designed', 'poly10'].map((id) => {
  const cs = seeds(8).map((seed) => runCase({ ...A(0.15), specs: REPS[id].specs, N: 100, seed }));
  return `${id}: tests ${cs.map((c) => P(c.test)).join(',')} mean ${P(mean(cs.map((c) => c.test)))} vote ${P(majorityVote(cs))} disagree ${disagreement(cs).toFixed(3)}`;
}).join(' || '));

test('B1: noise inputs, flip 0.10, N = 50', () => [0, 2, 5, 10, 20, 30, 50, 100, 200, 500].map((k) => {
  const c = runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k });
  return `${k}:${P(c.train)}/${P(c.test)} share ${c.realShare.toFixed(2)} g${c.guarded ? 1 : 0}`;
}).join(' | ') + ' ceil ' + P(runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50 }).ceiling));

test('B1: mean of 5 sets', () => [0, 10, 20, 50, 100, 200, 500].map((k) => {
  const cs = seeds(5).map((seed) => runCase({ ...A(0.10), specs: REPS.designed.specs, N: 50, k, seed }));
  return `${k}:${P(mean(cs.map((c) => c.train)))}/${P(mean(cs.map((c) => c.test)))}`;
}).join(' '));

test('guard direction at 1e-10', () => [['designed', 0], ['poly10', 0], ['rbf', 0]].map(([id]) => {
  const a = runCase({ ...A(0.15), specs: REPS[id].specs, N: 100 }), b = runCase({ ...A(0.15), specs: REPS[id].specs, N: 100, lambda: 1e-10 });
  return `${id}: 1e-8 ${P(a.train)}/${P(a.test)} → 1e-10 ${P(b.train)}/${P(b.test)}`;
}).join(' | '));
