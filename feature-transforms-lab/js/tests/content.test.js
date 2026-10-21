// Content tests: every quantitative claim the narrative makes, and every
// challenge reference solution, checked against the real engine (headless).

import { suite, test, assert } from './harness.js';
import { quickFit } from '../fit.js';
import { spiralOmega } from '../datasets.js';
import { HOLES, SPLIT, BUDGET, holeSeed, points } from '../challenge.js';

suite('content');

const pc = (v) => (100 * v).toFixed(1) + '%';
const fit = (ds, feats, o = {}) => quickFit(ds, feats, { nTrain: 200, nTest: 400, ...o });

// ---- challenge holes ----
HOLES.forEach((H, i) => {
  test(`challenge hole ${i + 1} (${H.name}): reference ≥ target + 1.5 pts, within budget`, () => {
    const r = quickFit(H.ds, H.ref, { params: H.params, ...SPLIT, seed: holeSeed(i) });
    assert(r.d <= BUDGET, `d=${r.d}`);
    assert(r.test.acc >= H.target + 0.015, `test ${pc(r.test.acc)} vs target ${pc(H.target)}`);
    return `test ${pc(r.test.acc)}, d=${r.d}, par ${points(r.test.acc, r.d)}`;
  });
});
test('challenge: raw features fail the non-linear holes', () => {
  const out = [];
  HOLES.forEach((H, i) => {
    if (H.id === 'warmup') return;
    const r = quickFit(H.ds, [{ id: 'raw' }], { params: H.params, ...SPLIT, seed: holeSeed(i) });
    assert(r.test.acc < H.target, `${H.name}: raw already reaches ${pc(r.test.acc)}`);
    out.push(`${H.id} ${pc(r.test.acc)}`);
  });
  return out.join(', ');
});

// ---- module claims ----
test('intro: best line on circles ≈ 50–60%; r ≈ 100%', () => {
  const a = fit('circles', [{ id: 'raw' }]), b = fit('circles', [{ id: 'r' }]);
  assert(a.test.acc <= 0.65 && b.test.acc >= 0.98, `${pc(a.test.acc)} / ${pc(b.test.acc)}`);
  return `raw ${pc(a.test.acc)}, r ${pc(b.test.acc)}`;
});
test('conics: x1x2 solves XOR; [x1², x2²] fails an off-center circle', () => {
  const a = fit('xor', [{ id: 'quad2', params: { mask: [0, 0, 0, 1, 0] } }]);
  const b = fit('offcircle', [{ id: 'quad2', params: { mask: [0, 0, 1, 0, 1] } }], { params: { a: 1, b: 1, R: 1.2 } });
  const c = fit('offcircle', [{ id: 'quad2' }], { params: { a: 1, b: 1, R: 1.2 } });
  assert(a.test.acc >= 0.97, `xor ${pc(a.test.acc)}`);
  assert(b.test.acc <= c.test.acc - 0.08, `squares ${pc(b.test.acc)} vs full ${pc(c.test.acc)}`);
  return `xor ${pc(a.test.acc)}; offcircle squares ${pc(b.test.acc)} vs full ${pc(c.test.acc)}`;
});
test('degree: with 40 noisy moons, degree 10 tests worse than degree 3', () => {
  const o = { params: { noise: 0.35 }, nTrain: 40, nTest: 500, lambda: 1e-5 };
  const k3 = fit('moons', [{ id: 'poly', params: { k: 3 } }], o), k10 = fit('moons', [{ id: 'poly', params: { k: 10 } }], o);
  const reg = fit('moons', [{ id: 'poly', params: { k: 10 } }], { ...o, lambda: 0.01 });
  assert(k10.test.acc < k3.test.acc - 0.04, `k3 ${pc(k3.test.acc)} k10 ${pc(k10.test.acc)}`);
  assert(k10.train.acc > k3.train.acc, 'train rises');
  assert(reg.test.acc > k10.test.acc, 'λ helps');
  return `k3 train/test ${pc(k3.train.acc)}/${pc(k3.test.acc)}; k10 ${pc(k10.train.acc)}/${pc(k10.test.acc)}; k10 λ=.01 test ${pc(reg.test.acc)}`;
});
test('polar: ring needs two features; spirals: 2 spiral features beat poly-10', () => {
  const r1 = fit('ring', [{ id: 'r' }]), r2 = fit('ring', [{ id: 'r' }, { id: 'r2' }]);
  const sp = fit('spirals', [{ id: 'spiral', params: { omega: +spiralOmega(2).toFixed(2) } }]), p10 = fit('spirals', [{ id: 'poly', params: { k: 10 } }]);
  const off = fit('spirals', [{ id: 'spiral', params: { omega: +(0.6 * spiralOmega(2)).toFixed(2) } }]);
  const fl = fit('flower', [{ id: 'r' }, { id: 'petal', params: { k: 5 } }]);
  assert(r1.test.acc <= 0.8 && r2.test.acc >= 0.97, `ring ${pc(r1.test.acc)} / ${pc(r2.test.acc)}`);
  assert(sp.test.acc >= 0.97 && p10.test.acc <= sp.test.acc - 0.1, `spiral ${pc(sp.test.acc)} poly10 ${pc(p10.test.acc)}`);
  assert(off.test.acc < sp.test.acc - 0.05, `ω −40%: ${pc(off.test.acc)}`);
  assert(fl.test.acc >= 0.95, `flower ${pc(fl.test.acc)}`);
  return `ring r ${pc(r1.test.acc)}, [r,r²] ${pc(r2.test.acc)}; spiral ${pc(sp.test.acc)}, poly10 ${pc(p10.test.acc)}, ω−40% ${pc(off.test.acc)}; flower ${pc(fl.test.acc)}`;
});
test('fourier: phase needs cosine; checkerboard from one product', () => {
  const s1 = fit('stripes', [{ id: 'sinx1', params: { w: 1.5 } }]), s2 = fit('stripes', [{ id: 'fourier1', params: { w: 1.5 } }]);
  const ch = fit('checker', [{ id: 'checker', params: { w: Math.PI / 1.5 } }]);
  const chOff = fit('checker', [{ id: 'checker', params: { w: Math.PI / 1.5 } }], { params: { phase: 0.75 } });
  const ch4 = fit('checker', [{ id: 'checker4', params: { w: Math.PI / 1.5 } }], { params: { phase: 0.75 } });
  assert(s2.test.acc - s1.test.acc >= 0.15, 'phase');
  assert(ch.test.acc >= 0.97 && chOff.test.acc < 0.8 && ch4.test.acc >= 0.95, `checker ${pc(ch.test.acc)}, offset ${pc(chOff.test.acc)}, 4 products ${pc(ch4.test.acc)}`);
  return `stripes sin ${pc(s1.test.acc)} vs sin+cos ${pc(s2.test.acc)}; checker ${pc(ch.test.acc)}, offset ${pc(chOff.test.acc)} → 4 products ${pc(ch4.test.acc)}`;
});
test('rbf: landmarks at data with γ = 100 memorize', () => {
  const r = fit('moons', [{ id: 'rbf', params: { place: 'data', gamma: 100 } }], { params: { noise: 0.3 }, lambda: 1e-5 });
  const s = fit('moons', [{ id: 'rbf', params: { place: 'data', gamma: 1 } }], { params: { noise: 0.3 }, lambda: 1e-3 });
  assert(r.train.acc >= 0.99 && r.train.acc - r.test.acc >= 0.08, `train ${pc(r.train.acc)} test ${pc(r.test.acc)}`);
  return `γ=100 train ${pc(r.train.acc)} test ${pc(r.test.acc)}; γ=1 test ${pc(s.test.acc)}`;
});
test('piecewise: bins, corner indicator', () => {
  const b = fit('circles', [{ id: 'bins', params: { B: 5 } }]), c = fit('corner', [{ id: 'cornerind', params: { t: -0.5, s: -0.3 } }]);
  assert(b.test.acc >= 0.85 && c.test.acc >= 0.97, `bins ${pc(b.test.acc)} corner ${pc(c.test.acc)}`);
  return `bins ${pc(b.test.acc)}, corner ${pc(c.test.acc)}`;
});
test('norms: the matching single feature reaches ≥ 98% on each mystery shape', () => {
  const out = [];
  for (const [p, id] of [[1, 'l1'], [2, 'r'], [3, 'linf']]) {
    const r = fit('normball', [{ id }], { params: { p, R: 1.8 } });
    assert(r.test.acc >= 0.98, `p=${p} ${id} ${pc(r.test.acc)}`);
    out.push(`${id} ${pc(r.test.acc)}`);
  }
  const wrong = fit('normball', [{ id: 'linf' }], { params: { p: 1, R: 1.8 } });
  assert(wrong.test.acc < 0.97, `L∞ on diamond ${pc(wrong.test.acc)}`);
  return out.join(', ') + `; L∞ on the diamond ${pc(wrong.test.acc)}`;
});
test('monotone: ratio rule, log–log extrapolates better than quadratic', () => {
  const ra = fit('loans', [{ id: 'ratio' }], { params: { rule: 'ratio' } });
  const o = { params: { rule: 'power', trainBelow: 150 }, nTest: 600, lambda: 1e-4 };
  const q = fit('loans', [{ id: 'quad2' }], o), ll = fit('loans', [{ id: 'log1' }, { id: 'log2' }], o);
  assert(ra.test.acc >= 0.94, `ratio ${pc(ra.test.acc)}`);
  assert(ll.test.acc > q.test.acc, `quad ${pc(q.test.acc)} vs loglog ${pc(ll.test.acc)}`);
  return `ratio ${pc(ra.test.acc)}; extrapolation quad ${pc(q.test.acc)} vs log-log ${pc(ll.test.acc)}`;
});
test('wrap-up tiles: hand-built vs generic on the spirals', () => {
  const tiles = [
    ['spiral', [{ id: 'spiral', params: { omega: +spiralOmega(2).toFixed(2) } }], 1e-3],
    ['rbf', [{ id: 'rbf', params: { place: 'data', gamma: 4 } }], 1e-4],
    ['rff', [{ id: 'rff', params: { D: 200, ell: 0.35 } }], 1e-4],
    ['relu', [{ id: 'relu', params: { m: 200 } }], 1e-4],
  ];
  const out = [];
  for (const n of [60]) {
    out.push(`n=${n}: ` + tiles.map(([name, f, lam]) => `${name} ${pc(fit('spirals', f, { nTrain: n, lambda: lam }).test.acc)}`).join(' '));
  }
  return out.join(' | ');
});
