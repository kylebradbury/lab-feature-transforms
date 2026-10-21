// Polynomial Features Lab: every challenge goal is reachable by hand on the
// sliders, and every claim in the challenge text holds on the real data.

import { suite, test, assert } from './harness.js';
import { CHALLENGES, TERMS, ALL, DEG2, RAW, wMax, splitFor, scoreWeights, bestFit, compress, expand, fitToRange, featuresFor, equationText, mapRegions } from '../challenges.js';
import { prepare, makeTrainer } from '../fit.js';
import { foldWeights } from '../features.js';
import { metrics } from '../model.js';

suite('poly');

const pc = (v) => (100 * v).toFixed(1) + '%';
const C = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
const NT = TERMS.length;
// A mask with just the named terms, e.g. only('x2', 'x1sq').
const only = (...ids) => TERMS.map((t) => (ids.includes(t.id) ? 1 : 0));
const cache = new Map();
function fits(c) {
  if (!cache.has(c.id)) {
    const split = splitFor(c);
    cache.set(c.id, {
      split, hand: scoreWeights(split, c.hand, ALL), start: scoreWeights(split, c.start, ALL),
      raw: bestFit(split, RAW), quad: bestFit(split, DEG2), cubic: c.maxDeg >= 3 ? bestFit(split, ALL) : null,
    });
  }
  return cache.get(c.id);
}

CHALLENGES.forEach((c, i) => {
  test(`poly challenge ${i + 1} (${c.name}): a slider-reachable hand solution meets the goal; the start does not`, () => {
    const r = fits(c);
    assert(c.hand.length === NT + 1 && c.hand.every((v, k) => Math.abs(v) <= wMax(k) && Math.abs(100 * v - Math.round(100 * v)) < 1e-9), 'hand weights fit the sliders');
    assert(c.hand.every((v, k) => k === 0 || v === 0 || TERMS[k - 1].deg <= c.need), 'hand uses terms above its degree');
    assert(r.split.train.y.length === 150, `n = ${r.split.train.y.length}`);
    assert(r.hand.acc >= c.goal, `hand ${pc(r.hand.acc)} < goal ${pc(c.goal)}`);
    assert(r.start.acc < c.goal - 0.05, `start already ${pc(r.start.acc)}`);
    return `start ${pc(r.start.acc)}, hand ${pc(r.hand.acc)}, goal ${pc(c.goal)}; best line ${pc(r.raw.acc)}, degree 2 ${pc(r.quad.acc)}${r.cubic ? `, degree 3 ${pc(r.cubic.acc)}` : ''}`;
  });
});

test('poly: each challenge needs exactly the degree it says (moons excepted: degree 2 cannot reach a good goal)', () => {
  for (const c of CHALLENGES) {
    const r = fits(c);
    assert(c.maxDeg === Math.max(2, c.need), `${c.id}: offers degree ${c.maxDeg} but needs ${c.need}`);
    if (c.need === 1) assert(r.raw.acc >= c.goal, `${c.id}: best line ${pc(r.raw.acc)} < goal`);
    if (c.need === 2 && c.id !== 'moons') {
      assert(r.raw.acc < c.goal - 0.05, `${c.id}: a line already gets ${pc(r.raw.acc)}`);
      assert(r.quad.acc >= c.goal, `${c.id}: degree 2 only ${pc(r.quad.acc)}`);
    }
    if (c.need === 3) {
      assert(r.quad.acc < c.goal - 0.05, `${c.id}: degree 2 already gets ${pc(r.quad.acc)}`);
      assert(r.cubic.acc >= c.goal, `${c.id}: degree 3 only ${pc(r.cubic.acc)}`);
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
  return w.slice(0, 6).map((v) => v.toFixed(2)).join(', ');
});

test('poly insights: parabola needs only x₁² and x₂; XOR only x₁x₂', () => {
  const p = fits(C.parabola), xs = bestFit(p.split, only('x2', 'x1sq'));
  const x = bestFit(fits(C.xor).split, only('x1x2'));
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

test('poly insights: S-curve — degree 2 no better than a line; x₁, x₂, x₁³ alone reach 100%', () => {
  const r = fits(C.scurve), three = bestFit(r.split, only('x1', 'x2', 'x1cube'));
  assert(r.quad.acc <= r.raw.acc + 0.01, `line ${pc(r.raw.acc)}, degree 2 ${pc(r.quad.acc)}`);
  assert(three.acc === 1, `[x₁, x₂, x₁³] ${pc(three.acc)}`);
  return `line ${pc(r.raw.acc)}, degree 2 ${pc(r.quad.acc)}, [x₁, x₂, x₁³] ${pc(three.acc)}`;
});

test('poly insights: moons, again — the same data as challenge 7; degree 3 reaches 100% where degree 2 got 88.7%', () => {
  const a = C.moons, b = C.moons3, r = fits(b);
  assert(a.ds === b.ds && a.seed === b.seed && JSON.stringify(a.params) === JSON.stringify(b.params), 'not the same moons');
  const three = bestFit(r.split, only('x1', 'x2', 'x1cube'));
  assert(r.cubic.acc === 1 && three.acc >= b.goal, `degree 3 ${pc(r.cubic.acc)}, [x₁, x₂, x₁³] ${pc(three.acc)}`);
  assert(pc(r.quad.acc) === '88.7%' && pc(fits(a).quad.acc) === '88.7%', `degree 2 ${pc(r.quad.acc)}`);
  return `degree 2 ${pc(r.quad.acc)}, degree 3 ${pc(r.cubic.acc)}, [x₁, x₂, x₁³] ${pc(three.acc)}`;
});

// Lowest training cross-entropy reachable on the sliders (|w_k| ≤ wMax(k)): coordinate
// search with shrinking steps from each start. CE is convex, so this lands close.
function sliderMinCE(split, mask, starts) {
  const prep = prepare(split, featuresFor(mask));
  const ce = (w) => metrics(compress(w, mask), prep.tr.Z, prep.tr.y, prep.tr.N, prep.d).loss;
  const clip = (v, k) => Math.max(-wMax(k), Math.min(wMax(k), v));
  let best = Infinity;
  for (const s0 of starts) {
    let w = s0.map((v, k) => (k === 0 || mask[k - 1] ? clip(v, k) : 0)), L = ce(w);
    for (const step of [1, 0.3, 0.1, 0.03, 0.01]) {
      for (let improved = true, it = 0; improved && it < 60; it++) {
        improved = false;
        for (let k = 0; k <= NT; k++) {
          if (k > 0 && !mask[k - 1]) continue;
          for (const dir of [1, -1]) {
            const t = w.slice();
            t[k] = clip(t[k] + dir * step, k);
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

// The subsets of terms a student can tick: every subset of the five degree-2
// terms and, on degree-3 challenges, each of those with no cubic term, one
// cubic term, or all four.
const SUBSETS2 = Array.from({ length: 32 }, (_, m) => [0, 1, 2, 3, 4].map((k) => (m >> k) & 1));
const CUBIC_SETS = [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [1, 1, 1, 1]];
const masksFor = (c) => (c.maxDeg >= 3 ? SUBSETS2.flatMap((m) => CUBIC_SETS.map((q) => [...m, ...q])) : SUBSETS2.map((m) => [...m, 0, 0, 0, 0]));
test('poly: for every challenge and subset of terms, no slider setting beats the best fit’s cross-entropy', () => {
  const out = [];
  let worst = Infinity, n = 0;
  for (const c of CHALLENGES) {
    const split = fits(c).split;
    for (const mask of masksFor(c)) {
      const b = bestFit(split, mask);
      const s = sliderMinCE(split, mask, [c.hand, fitToRange(b.w, 1)]);
      assert(b.loss <= s + 1e-9, `${c.id} [${mask.join('')}]: best fit ${b.loss.toFixed(6)} > sliders ${s.toFixed(6)}`);
      worst = Math.min(worst, s - b.loss);
      n++;
      if (mask.join('') === (c.maxDeg >= 3 ? ALL : DEG2).join('')) out.push(`${c.id} ${b.loss.toFixed(3)} vs ${s.toFixed(3)}`);
    }
  }
  return `${n} challenge/subset pairs, smallest margin ${worst.toExponential(1)}; all terms, best fit vs best on sliders: ${out.join(', ')}`;
});
test('poly: that search has teeth: it beats a λ = 0.001 fit (the earlier best fit) on separable data', () => {
  const split = fits(C.xor).split, old = fitWithLambda(split, DEG2, 1e-3);
  const s = sliderMinCE(split, DEG2, [C.xor.hand]);
  assert(s < old, `sliders ${s.toFixed(4)} vs λ=0.001 fit ${old.toFixed(4)}`);
  return `xor: λ=0.001 fit ${old.toFixed(4)}, sliders reach ${s.toFixed(4)}, best fit ${fits(C.xor).quad.loss.toFixed(4)}`;
});

// Logits of f on a cell-centered n×n grid over the plotting box (like the app's grid).
const BOX = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
function logitGrid(f, n = 170) {
  const V = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) V[j * n + i] = f(-3 + (6 * (i + 0.5)) / n, -3 + (6 * (j + 0.5)) / n);
  return { G: n, V };
}
// [cell centre u, v, predicted probability or NaN] for each cell of a mapRegions result.
function cells(r, zv) {
  const out = [];
  for (let j = 0; j < r.G; j++) {
    for (let i = 0; i < r.G; i++) {
      const v = r.V[j * r.G + i];
      out.push([zv.xmin + ((i + 0.5) / r.G) * (zv.xmax - zv.xmin), zv.ymin + ((j + 0.5) / r.G) * (zv.ymax - zv.ymin), Number.isNaN(v) ? NaN : 1 / (1 + Math.exp(-v))]);
    }
  }
  return out;
}
const T = Object.fromEntries(TERMS.map((t, k) => [t.id, k]));
test('poly: shading carried into feature space matches the original regions', () => {
  const circle = (x, y) => 4 * (1.8 - x * x - y * y);
  // identity view: the same regions as the original plot
  let bad = 0;
  for (const [u, v, q] of cells(mapRegions(logitGrid(circle), BOX, T.x1, T.x2, BOX), BOX)) if (Math.abs(1.8 - u * u - v * v) > 0.2 && (Number.isNaN(q) || (q > 0.5) !== (1.8 - u * u - v * v > 0))) bad++;
  assert(bad === 0, `identity view: ${bad} wrong cells`);
  // x₁² vs x₂²: the circle becomes the straight split u + v = 1.8, with no gaps
  const sq = { xmin: 0, xmax: 9, ymin: 0, ymax: 9 };
  let wrong = 0, gaps = 0;
  for (const [u, v, q] of cells(mapRegions(logitGrid(circle), BOX, T.x1sq, T.x2sq, sq), sq)) {
    if (u < 0.3 || v < 0.3 || u > 8.7 || v > 8.7) continue;
    if (Number.isNaN(q)) gaps++;
    else if (Math.abs(1.8 - u - v) > 0.3 && (q > 0.5) !== (u + v < 1.8)) wrong++;
  }
  assert(!wrong && !gaps, `x₁² vs x₂²: ${wrong} wrong, ${gaps} gaps`);
  // x₁³ stretches the edges by up to 27×: still no gaps inside the reachable band
  const cube = { xmin: -27, xmax: 27, ymin: -3, ymax: 3 };
  const holes = cells(mapRegions(logitGrid((x, y) => y - 0.4 * x * x * x), BOX, T.x1cube, T.x2, cube), cube).filter(([u, v, q]) => Math.abs(u) < 25 && Math.abs(v) < 2.8 && Number.isNaN(q)).length;
  assert(holes === 0, `x₁³ vs x₂: ${holes} gaps`);
  // folding: a model that depends on the sign of x₁ cannot be separated by x₁², so both classes overlap (blend)
  const mixed = cells(mapRegions(logitGrid((x) => 5 * x), BOX, T.x1sq, T.x2, { xmin: 0, xmax: 9, ymin: -3, ymax: 3 }), { xmin: 0, xmax: 9, ymin: -3, ymax: 3 })
    .filter(([u, v, q]) => u > 0.5 && u < 8.5 && Math.abs(v) < 2.8 && !Number.isNaN(q));
  const blend = mixed.reduce((t, [, , q]) => t + Math.abs(q - 0.5), 0) / mixed.length;
  assert(blend < 0.05, `folded view not blended: mean |p − 0.5| = ${blend.toFixed(3)}`);
  return `x₁³ gaps ${holes}, folded blend ${blend.toFixed(3)}`;
});

test('poly: no gaps in that shading mid-drag (coarse grid) with x³ on both axes, and fast enough per frame', () => {
  const zv = { xmin: -31, xmax: 31, ymin: -31, ymax: 31 }, t0 = performance.now();
  const r = mapRegions(logitGrid((x, y) => x * y - 0.5, 90), BOX, T.x2cube, T.x1cube, zv);
  const ms = performance.now() - t0;
  const holes = cells(r, zv).filter(([u, v, q]) => Math.abs(u) < 26 && Math.abs(v) < 26 && Number.isNaN(q)).length;
  assert(holes === 0, `${holes} gaps`);
  assert(ms < 60, `${ms.toFixed(0)} ms per frame`);
  return `${ms.toFixed(1)} ms`;
});

test('poly: equation text for the answers table', () => {
  assert(equationText([1.4, 0.2, 0, -0.8, 0, -1], [1, 1, 1, 1, 1]) === '1.40 + 0.20x₁ + 0.00x₂ − 0.80x₁² + 0.00x₁x₂ − 1.00x₂² = 0', 'full');
  assert(equationText([-0.5, 1, 2, 3, 4, 5], [1, 0, 0, 0, 0]) === '−0.50 + 1.00x₁ = 0', 'subset');
  assert(equationText(C.scurve.hand, only('x1', 'x2', 'x1cube')) === '0.00 + 1.80x₁ + 1.00x₂ − 0.40x₁³ = 0', 'cubic');
});

test('poly: copying the best fit onto the sliders keeps its accuracy; compress/expand round-trip', () => {
  for (const c of CHALLENGES) {
    const r = fits(c), b = r.cubic || r.quad, w = fitToRange(b.w);
    assert(w.every((v, k) => Math.abs(v) <= wMax(k)), `${c.id}: out of range`);
    const acc = scoreWeights(r.split, w, ALL).acc;
    assert(Math.abs(acc - b.acc) <= 0.02, `${c.id}: copied ${pc(acc)} vs best ${pc(b.acc)}`);
  }
  const mask = [1, 0, 1, 0, 1, 0, 0, 1, 0], w = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert(JSON.stringify(compress(w, mask)) === '[0.5,1,3,5,8]', 'compress');
  assert(JSON.stringify(expand(compress(w, mask), mask)) === '[0.5,1,0,3,0,5,0,0,8,0]', 'expand');
});
