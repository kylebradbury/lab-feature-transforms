// Polynomial Features Lab: every challenge goal is reachable by hand on the
// sliders, and every claim in the challenge text holds on the real data.

import { suite, test, assert } from './harness.js';
import { CHALLENGES, ALL, RAW, W_MAX, splitFor, scoreWeights, bestFit, compress, expand, fitToRange, featuresFor, equationText } from '../challenges.js';
import { prepare, makeTrainer } from '../fit.js';
import { foldWeights } from '../features.js';
import { metrics } from '../model.js';

suite('poly');

const pc = (v) => (100 * v).toFixed(1) + '%';
const C = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
const cache = new Map();
function fits(c) {
  if (!cache.has(c.id)) {
    const split = splitFor(c);
    cache.set(c.id, {
      split, hand: scoreWeights(split, c.hand, ALL), start: scoreWeights(split, c.start, ALL),
      raw: bestFit(split, RAW), quad: bestFit(split, ALL),
    });
  }
  return cache.get(c.id);
}

CHALLENGES.forEach((c, i) => {
  test(`poly challenge ${i + 1} (${c.name}): a slider-reachable hand solution meets the goal; the start does not`, () => {
    const r = fits(c);
    assert(c.hand.every((v) => Math.abs(v) <= W_MAX && Math.abs(100 * v - Math.round(100 * v)) < 1e-9), 'hand weights fit the sliders');
    assert(r.split.train.y.length === 150, `n = ${r.split.train.y.length}`);
    assert(r.hand.acc >= c.goal, `hand ${pc(r.hand.acc)} < goal ${pc(c.goal)}`);
    assert(r.start.acc < c.goal - 0.05, `start already ${pc(r.start.acc)}`);
    return `start ${pc(r.start.acc)}, hand ${pc(r.hand.acc)}, goal ${pc(c.goal)}; best line ${pc(r.raw.acc)}, best degree 2 ${pc(r.quad.acc)}`;
  });
});

test('poly: raw challenges are solvable with a line; curved ones need degree 2', () => {
  for (const c of CHALLENGES) {
    const r = fits(c);
    if (!c.poly) assert(r.raw.acc >= c.goal, `${c.id}: best line ${pc(r.raw.acc)} < goal`);
    else if (c.id !== 'moons') {
      assert(r.raw.acc < c.goal - 0.05, `${c.id}: a line already gets ${pc(r.raw.acc)}`);
      assert(r.quad.acc >= c.goal, `${c.id}: degree 2 only ${pc(r.quad.acc)}`);
    }
  }
});

test('poly insights: blobs best fit has larger weights than the hand line; overlap gains little from degree 2', () => {
  const b = fits(C.blobs), o = fits(C.overlap), big = (w) => Math.max(...w.slice(1).map(Math.abs));
  assert(big(b.raw.w) > 1.5 * big(C.blobs.hand), `best ${big(b.raw.w).toFixed(2)} vs hand ${big(C.blobs.hand)}`);
  assert(o.quad.acc - o.raw.acc <= 0.02, `overlap: line ${pc(o.raw.acc)}, degree 2 ${pc(o.quad.acc)}`);
  return `blobs max |w| ${big(b.raw.w).toFixed(2)}; overlap line ${pc(o.raw.acc)} vs degree 2 ${pc(o.quad.acc)}`;
});

test('poly insights: bullseye best fit puts little weight on x₁, x₂, x₁x₂', () => {
  const w = fits(C.bullseye).quad.w, sq = Math.min(Math.abs(w[3]), Math.abs(w[5]));
  for (const k of [1, 2, 4]) assert(Math.abs(w[k]) <= 0.2 * sq, `w${k} = ${w[k].toFixed(2)} vs squares ${sq.toFixed(2)}`);
  return w.map((v) => v.toFixed(2)).join(', ');
});

test('poly insights: parabola needs only x₁² and x₂; XOR only x₁x₂', () => {
  const p = fits(C.parabola), xs = bestFit(p.split, [0, 1, 1, 0, 0]);
  const x = bestFit(fits(C.xor).split, [0, 0, 0, 1, 0]);
  assert(xs.acc >= p.quad.acc - 0.01 && xs.acc >= C.parabola.goal, `parabola [x₂, x₁²] ${pc(xs.acc)} vs all five ${pc(p.quad.acc)}`);
  assert(x.acc >= C.xor.goal, `xor [x₁x₂] ${pc(x.acc)}`);
  return `parabola [x₂, x₁²] ${pc(xs.acc)}; xor [x₁x₂] ${pc(x.acc)}`;
});

test('poly insights: off-center best fit centers near (1.1, −0.8)', () => {
  const w = fits(C.offcenter).quad.w, cx = -w[1] / (2 * w[3]), cy = -w[2] / (2 * w[5]);
  assert(Math.hypot(cx - 1.1, cy + 0.8) < 0.4, `center (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  return `center (${cx.toFixed(2)}, ${cy.toFixed(2)})`;
});

test('poly insights: moons — degree 2 no better than a line, and the hand solution beats the best fit', () => {
  const r = fits(C.moons);
  assert(r.quad.acc <= r.raw.acc + 0.01, `line ${pc(r.raw.acc)}, degree 2 ${pc(r.quad.acc)}`);
  assert(r.hand.acc > r.quad.acc, `hand ${pc(r.hand.acc)} vs best ${pc(r.quad.acc)}`);
  return `line ${pc(r.raw.acc)}, degree 2 ${pc(r.quad.acc)}, hand ${pc(r.hand.acc)}`;
});

// Lowest training cross-entropy reachable on the sliders (|w| ≤ W_MAX): coordinate
// search with shrinking steps from each start. CE is convex, so this lands close.
function sliderMinCE(split, mask, starts) {
  const prep = prepare(split, featuresFor(mask));
  const ce = (w) => metrics(compress(w, mask), prep.tr.Z, prep.tr.y, prep.tr.N, prep.d).loss;
  const clip = (v) => Math.max(-W_MAX, Math.min(W_MAX, v));
  let best = Infinity;
  for (const s0 of starts) {
    let w = s0.map((v, k) => (k === 0 || mask[k - 1] ? clip(v) : 0)), L = ce(w);
    for (const step of [1, 0.3, 0.1, 0.03, 0.01]) {
      for (let improved = true, it = 0; improved && it < 60; it++) {
        improved = false;
        for (let k = 0; k <= 5; k++) {
          if (k > 0 && !mask[k - 1]) continue;
          for (const dir of [1, -1]) {
            const t = w.slice();
            t[k] = clip(t[k] + dir * step);
            const Lt = ce(t);
            if (Lt < L - 1e-12) { w = t; L = Lt; improved = true; }
          }
        }
      }
    }
    best = Math.min(best, L);
  }
  return best;
}
function fitWithLambda(split, mask, lambda) {
  const prep = prepare(split, featuresFor(mask)), tr = makeTrainer(prep, lambda);
  tr.run();
  return metrics(foldWeights(tr.w, prep.std), prep.tr.Z, prep.tr.y, prep.tr.N, prep.d).loss;
}

// Every subset of the five terms a student can tick (raw features = mask 00011).
const MASKS = Array.from({ length: 32 }, (_, m) => [0, 1, 2, 3, 4].map((k) => (m >> k) & 1));
test('poly: for every challenge and every subset of terms, no slider setting beats the best fit’s cross-entropy', () => {
  const out = [];
  let worst = Infinity;
  for (const c of CHALLENGES) {
    const split = fits(c).split;
    for (const mask of MASKS) {
      const b = bestFit(split, mask);
      const s = sliderMinCE(split, mask, [c.hand, fitToRange(b.w, W_MAX)]);
      assert(b.loss <= s + 1e-9, `${c.id} [${mask.join('')}]: best fit ${b.loss.toFixed(6)} > sliders ${s.toFixed(6)}`);
      worst = Math.min(worst, s - b.loss);
      if (mask.join('') === '11111') out.push(`${c.id} ${b.loss.toFixed(3)} vs ${s.toFixed(3)}`);
    }
  }
  return `smallest margin ${worst.toExponential(1)}; all five terms, best fit vs best on sliders: ${out.join(', ')}`;
});
test('poly: that search has teeth: it beats a λ = 0.001 fit (the earlier best fit) on separable data', () => {
  const split = fits(C.xor).split, old = fitWithLambda(split, ALL, 1e-3);
  const s = sliderMinCE(split, ALL, [C.xor.hand]);
  assert(s < old, `sliders ${s.toFixed(4)} vs λ=0.001 fit ${old.toFixed(4)}`);
  return `xor: λ=0.001 fit ${old.toFixed(4)}, sliders reach ${s.toFixed(4)}, best fit ${fits(C.xor).quad.loss.toFixed(4)}`;
});

test('poly: equation text for the answers table', () => {
  assert(equationText([1.4, 0.2, 0, -0.8, 0, -1], [1, 1, 1, 1, 1]) === '1.40 + 0.20x₁ + 0.00x₂ − 0.80x₁² + 0.00x₁x₂ − 1.00x₂² = 0', 'full');
  assert(equationText([-0.5, 1, 2, 3, 4, 5], [1, 0, 0, 0, 0]) === '−0.50 + 1.00x₁ = 0', 'subset');
});

test('poly: copying the best fit onto the sliders keeps its accuracy; compress/expand round-trip', () => {
  for (const c of CHALLENGES) {
    const r = fits(c), w = fitToRange(r.quad.w);
    assert(w.every((v) => Math.abs(v) <= W_MAX), `${c.id}: out of range`);
    const acc = scoreWeights(r.split, w, ALL).acc;
    assert(Math.abs(acc - r.quad.acc) <= 0.02, `${c.id}: copied ${pc(acc)} vs best ${pc(r.quad.acc)}`);
  }
  const mask = [1, 0, 1, 0, 1], w6 = [0.5, 1, 2, 3, 4, 5];
  assert(JSON.stringify(compress(w6, mask)) === '[0.5,1,3,5]', 'compress');
  assert(JSON.stringify(expand(compress(w6, mask), mask)) === '[0.5,1,0,3,0,5]', 'expand');
});
