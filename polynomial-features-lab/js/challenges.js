// Polynomial Features Lab: the challenges (datasets of increasing difficulty),
// the polynomial terms up to degree 3, and headless helpers to score hand-set
// weights and to fit the logistic regression "best fit" on a subset of terms.
//
// Weights are always kept as the full vector [w0, w1..w9] over TERMS; a mask
// says which terms are in the model. The engine only sees the active columns.

import { makeSplit } from './datasets.js';
import { prepare, makeTrainer, evaluate } from './fit.js';
import { foldWeights } from './features.js';

export const SPLIT = { nTrain: 150, nVal: 0, nTest: 0 };
// The best fit minimizes training cross-entropy. The engine's smallest L2
// penalty only keeps the weights finite when the classes separate perfectly;
// a larger one (the main lab uses 1e-3) lets hand-set weights beat the "best"
// cross-entropy. The tests check that no slider setting does.
export const LAMBDA = 1e-5;
export const W_MAX = 5; // slider range ±W_MAX for the bias and terms up to degree 2
export const W_MAX3 = 1; // degree-3 terms reach ±27 on this plot, so their sliders are finer

// `id` is the monomial transform in features.js (its column key is m{i},{j}).
export const TERMS = [
  { id: 'x1', deg: 1, tex: 'x_1', label: 'x₁', f: (a) => a },
  { id: 'x2', deg: 1, tex: 'x_2', label: 'x₂', f: (a, b) => b },
  { id: 'x1sq', deg: 2, tex: 'x_1^2', label: 'x₁²', f: (a) => a * a },
  { id: 'x1x2', deg: 2, tex: 'x_1x_2', label: 'x₁x₂', f: (a, b) => a * b },
  { id: 'x2sq', deg: 2, tex: 'x_2^2', label: 'x₂²', f: (a, b) => b * b },
  { id: 'x1cube', deg: 3, tex: 'x_1^3', label: 'x₁³', f: (a) => a * a * a },
  { id: 'x1sqx2', deg: 3, tex: 'x_1^2x_2', label: 'x₁²x₂', f: (a, b) => a * a * b },
  { id: 'x1x2sq', deg: 3, tex: 'x_1x_2^2', label: 'x₁x₂²', f: (a, b) => a * b * b },
  { id: 'x2cube', deg: 3, tex: 'x_2^3', label: 'x₂³', f: (a, b) => b * b * b },
];
// Slider limit for weight k of [w0, w1..w9].
export const wMax = (k) => (k > 0 && TERMS[k - 1].deg === 3 ? W_MAX3 : W_MAX);
export const upTo = (deg) => TERMS.map((t) => (t.deg <= deg ? 1 : 0));
export const RAW = upTo(1);
export const DEG2 = upTo(2);
export const ALL = upTo(3);
// The feature sets a student can switch between; a challenge offers those up to its maxDeg.
export const STAGES = [{ id: 'raw', deg: 1 }, { id: 'poly', deg: 2 }, { id: 'cubic', deg: 3 }];
export const stageDeg = (id) => STAGES.find((st) => st.id === id).deg;

const START = [0, 0, 1]; // x₂ = 0, class 1 above

/**
 * Each challenge: dataset + seed, a training-accuracy goal that can be reached
 * by hand (`hand` is a slider-reachable solution, checked by the tests), the
 * degree that solution needs (`need`) and the highest degree offered (`maxDeg`,
 * default 2), whether it is marked extra challenging (`hard`), and text shown
 * before (brief, hint) and after (insight) revealing the best fit. Text names
 * the class colors as {c0}/{c1} ({C0}/{C1} capitalized), filled in from the
 * color theme. Weight lists may stop early; missing weights are 0.
 */
export const CHALLENGES = [
  {
    id: 'blobs', name: 'Two blobs', ds: 'blobs', params: { sep: 3.4, angle: -35, noise: 0.6 }, seed: 7301,
    goal: 1, need: 1, start: START, hand: [0, 1.65, -1.15, 0, 0, 0],
    brief: 'Warm-up with the raw features. Turn and slide the line until every point is on its own color’s side.',
    hint: 'The vector (w₁, w₂) points toward the {c1} side, so it sets the line’s tilt. w₀ slides the line along that direction.',
    insight: 'Any separating line gets 100%. Logistic regression picks the one with the lowest cross-entropy, which pushes points far from the line. Its weights are large because only their <b>ratios</b> place the line; their <b>size</b> sets how quickly the probability goes from 0 to 1.',
  },
  {
    id: 'overlap', name: 'Overlap', ds: 'blobs', params: { sep: 2.4, angle: 165, noise: 0.85 }, seed: 7101,
    goal: 0.9, need: 1, start: START, hand: [0, -1.15, 0.3, 0, 0, 0],
    brief: 'The two clouds overlap, so no line gets every point right. How close to perfect can you get?',
    hint: 'Aim the line across the gap between the two clouds’ centers and accept a few mistakes on each side.',
    insight: 'Even the best fit misclassifies the overlapping points. Switch to polynomial features and reveal again: the extra terms barely help. The classes really do overlap, and extra flexibility can only chase noise.',
  },
  {
    id: 'bullseye', name: 'Bullseye', ds: 'circles', params: {}, seed: 7103,
    goal: 0.98, need: 2, start: START, hand: [1.8, 0, 0, -1, 0, -1],
    brief: '{C1} in the middle, {c0} all around. Try a line first, then switch to <b>polynomial features</b>.',
    hint: 'x₁² + x₂² is the squared distance from the origin, so r² − x₁² − x₂² = 0 is a circle of radius r. In feature space, put x₁² and x₂² on the axes.',
    insight: 'Plot x₁² against x₂²: the classes are split by a straight line. A circle in the original space is a flat cut in feature space. The best fit puts almost no weight on x₁, x₂ or x₁x₂.',
  },
  {
    id: 'parabola', name: 'Parabola', ds: 'parabola', params: { k: 0.8, c: -1.5 }, seed: 7204,
    goal: 0.98, need: 2, start: START, hand: [1.5, 0, 1, -0.8, 0, 0],
    brief: 'The boundary bends like a cup. A line can only do so well.',
    hint: 'A parabola opening upward is x₂ = a x₁² + c. Which terms does that equation use?',
    insight: 'Only x₁² and x₂ (with the bias) are needed. Untick x₁, x₁x₂ and x₂², then reveal again: same accuracy with fewer features.',
  },
  {
    id: 'xor', name: 'XOR', ds: 'xor', params: {}, seed: 7105,
    goal: 0.98, need: 2, start: START, hand: [0, 0, 0, 0, 1, 0],
    brief: '{C1} in two opposite quadrants. No line, circle or ellipse can do this.',
    hint: 'The product x₁x₂ is positive in quadrants I and III and negative in II and IV. Try putting x₁x₂ on a feature-space axis.',
    insight: 'One feature does it: x₁x₂. On an x₁x₂ axis the classes split at 0. An interaction term means “the effect of x₁ depends on x₂”, which is exactly the XOR pattern.',
  },
  {
    id: 'offcenter', name: 'Off-center circle', ds: 'offcircle', params: {}, seed: 7106,
    goal: 0.95, need: 2, start: START, hand: [-0.15, 2.2, -1.6, -1, 0, -1],
    brief: 'A circle again, but its center has moved away from the origin.',
    hint: 'Expand (x₁ − a)² = x₁² − 2a x₁ + a²: moving the center creates the x₁ and x₂ terms. Find the center first, then set w₁ = 2a and w₂ = 2b (with w₃ = w₅ = −1).',
    insight: 'The linear terms move the center. Expanding 1.3² − (x₁ − 1.1)² − (x₂ + 0.8)² gives w₁ = 2.2 and w₂ = −1.6 against w₃ = w₅ = −1. The best fit uses the same trick with larger weights; its center lands near (1.1, −0.8), and the noise makes its curve slightly elliptical.',
  },
  {
    id: 'moons', name: 'Moons', ds: 'moons', params: { noise: 0.2 }, seed: 7108,
    goal: 0.88, need: 2, start: START, hand: [0.1, 0.2, -1, 0, 0, -0.15],
    brief: 'Two interlocking crescents. A degree-2 curve can’t follow both bends. How close can you get?',
    hint: 'A gently curved boundary through the gap between the moons is about the best a conic can do.',
    insight: 'Degree 2 does no better than a straight line here: switch back to raw features and reveal again. The true boundary is S-shaped, which needs higher-degree features (challenge 9 brings these moons back with degree 3). You may even beat the best fit on accuracy, because logistic regression minimizes cross-entropy, not the number of mistakes.',
  },
  {
    id: 'scurve', name: 'S-curve', ds: 'cubic', params: { a: 0.4, b: -1.8 }, seed: 7308,
    goal: 0.97, need: 3, maxDeg: 3, hard: true, start: START, hand: [0, 1.8, 1, 0, 0, 0, -0.4],
    brief: 'The boundary bends twice, like an S. A conic can only bend once. Try degree 2 first, then switch to <b>Degree 3</b>.',
    hint: 'A cubic x₂ = a x₁³ + b x₁ bends twice. Moving everything to one side gives x₂ − b x₁ − a x₁³ = 0, so only x₁, x₂ and x₁³ are needed. Start with w₂ = 1, then set w₁ and w₆ (the x₁³ weight; its slider is finer because x₁³ grows fast).',
    insight: 'Degree 2 cannot do better than the best line here, because a conic bends only once. One cubic term, x₁³, adds the second bend: the data follow x₂ = 0.4x₁³ − 1.8x₁. Untick everything except x₁, x₂ and x₁³ and reveal again: still 100%.',
  },
  {
    id: 'moons3', name: 'Moons, again', ds: 'moons', params: { noise: 0.2 }, seed: 7108,
    goal: 0.96, need: 3, maxDeg: 3, hard: true, start: START, hand: [0, -1, -1, 0, 0, 0, 0.32],
    brief: 'The same two moons as challenge 7, but now you can use degree 3. Can an S-shaped boundary slip between the crescents?',
    hint: 'Use the idea from the S-curve: x₁, x₂ and x₁³. Here {c1} is <i>below</i> the curve, so start with w₂ = −1, then tilt it with w₁ and bend it with w₆.',
    insight: 'With x₁³ the boundary bends twice and threads between both crescents: the best fit reaches 100% where degree 2 got 88.7%. x₁, x₂ and x₁³ alone are enough; untick the rest and reveal again. Extra degree is not free, though: with more terms, a boundary can also start bending around noise.',
  },
];

const pad = (w) => [...w, ...Array(TERMS.length + 1 - w.length).fill(0)];
for (const c of CHALLENGES) {
  c.maxDeg = c.maxDeg || 2;
  c.start = pad(c.start);
  c.hand = pad(c.hand);
}

export const featuresFor = (mask) => TERMS.filter((t, k) => mask[k]).map((t) => ({ id: t.id, params: {} }));
export const splitFor = (c) => makeSplit(c.ds, c.params, { ...SPLIT, seed: c.seed });

// Weights on the active columns <-> the full [w0, w1..w9].
export function compress(wFull, mask) {
  const out = [wFull[0]];
  mask.forEach((on, k) => { if (on) out.push(wFull[k + 1]); });
  return out;
}
export function expand(w, mask) {
  const out = Array(TERMS.length + 1).fill(0);
  out[0] = w[0];
  let j = 1;
  mask.forEach((on, k) => { if (on) out[k + 1] = w[j++]; });
  return out;
}

// Training accuracy and cross-entropy of the full weights using the terms in mask.
export function scoreWeights(split, wFull, mask) {
  const prep = prepare(split, featuresFor(mask));
  return evaluate(prep, compress(wFull, mask)).train;
}

// L2 logistic regression (Newton) on the terms in mask.
// Returns {w (full weights), wActive, prep, acc, loss}.
export function bestFit(split, mask) {
  const prep = prepare(split, featuresFor(mask));
  const tr = makeTrainer(prep, LAMBDA);
  tr.run();
  // If the classes overlap, the unpenalized optimum exists: finish there with
  // plain Newton steps so that no weights at all have lower cross-entropy.
  if (evaluate(prep, foldWeights(tr.w, prep.std)).train.acc < 1) {
    Object.assign(tr, { lambda: 0, converged: false, iters: 0 });
    tr.loss = tr.objective(tr.w);
    tr.run();
  }
  const wActive = foldWeights(tr.w, prep.std);
  const m = evaluate(prep, wActive).train;
  return { w: expand(Array.from(wActive), mask), wActive, prep, acc: m.acc, loss: m.loss };
}

/**
 * The model's decision regions carried into the plane of terms a and c. Each
 * cell of a G×G grid over zView gets the average predicted probability of the
 * original points that land in it; `grid` holds the model's logits on a
 * cell-centered grid over xView (sampled more finely, interpolated). Returns
 * {G, V} with V the logit of that average: NaN where no point lands, near 0
 * where points of both predicted classes land together.
 */
export function mapRegions(grid, xView, a, c, zView, G = 80) {
  const { G: n, V: src } = grid, fa = TERMS[a].f, fc = TERMS[c].f;
  const spanX = xView.xmax - xView.xmin, spanY = xView.ymax - xView.ymin;
  const ku = G / (zView.xmax - zView.xmin), kv = G / (zView.ymax - zView.ymin);
  // Sample densely enough that neighbouring samples land under a cell apart
  // wherever the map stretches most (x³ is 27× steeper at the edges than at
  // 0), whatever the resolution of `grid`; otherwise gaps open in the plane.
  let stretch = 0;
  const K = 12, e = 1e-3;
  for (let jj = 0; jj <= K; jj++) {
    for (let ii = 0; ii <= K; ii++) {
      const x1 = xView.xmin + (ii / K) * spanX, x2 = xView.ymin + (jj / K) * spanY;
      for (const [f, k] of [[fa, ku], [fc, kv]]) {
        stretch = Math.max(stretch,
          (Math.abs(f(x1 + e, x2) - f(x1 - e, x2)) / (2 * e)) * k * spanX,
          (Math.abs(f(x1, x2 + e) - f(x1, x2 - e)) / (2 * e)) * k * spanY);
      }
    }
  }
  const m = Math.min(600, Math.max(2 * n, Math.ceil(stretch / 0.7)));
  const sum = new Float64Array(G * G), cnt = new Uint32Array(G * G);
  for (let j = 0; j < m; j++) {
    const x2 = xView.ymin + ((j + 0.5) / m) * spanY;
    const gj = Math.min(n - 1, Math.max(0, ((j + 0.5) / m) * n - 0.5)), j0 = Math.min(n - 2, Math.floor(gj)), tj = gj - j0;
    for (let i = 0; i < m; i++) {
      const x1 = xView.xmin + ((i + 0.5) / m) * spanX;
      const iu = Math.floor((fa(x1, x2) - zView.xmin) * ku), iv = Math.floor((fc(x1, x2) - zView.ymin) * kv);
      if (iu < 0 || iv < 0 || iu >= G || iv >= G) continue;
      const gi = Math.min(n - 1, Math.max(0, ((i + 0.5) / m) * n - 0.5)), i0 = Math.min(n - 2, Math.floor(gi)), ti = gi - i0;
      const r0 = j0 * n + i0, r1 = r0 + n;
      const logit = (src[r0] * (1 - ti) + src[r0 + 1] * ti) * (1 - tj) + (src[r1] * (1 - ti) + src[r1 + 1] * ti) * tj;
      const k = iv * G + iu;
      sum[k] += 1 / (1 + Math.exp(-logit));
      cnt[k]++;
    }
  }
  // Safety net for any remaining gaps: twice, fill an empty cell from its
  // reached neighbours when at least 5 of its 8 are reached. The second pass
  // closes cells where an empty row and an empty column cross; neither pass
  // grows a region's straight edges (a cell outside one has only 3).
  let p = new Float64Array(G * G).fill(NaN);
  for (let k = 0; k < G * G; k++) if (cnt[k]) p[k] = sum[k] / cnt[k];
  for (let pass = 0; pass < 2; pass++) {
    const next = p.slice();
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        if (!Number.isNaN(p[j * G + i])) continue;
        let t = 0, nb = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if ((di || dj) && ii >= 0 && jj >= 0 && ii < G && jj < G && !Number.isNaN(p[jj * G + ii])) { t += p[jj * G + ii]; nb++; }
          }
        }
        if (nb >= 5) next[j * G + i] = t / nb;
      }
    }
    p = next;
  }
  const V = new Float32Array(G * G);
  for (let k = 0; k < G * G; k++) {
    const q = Math.min(1 - 1e-6, Math.max(1e-6, p[k]));
    V[k] = Number.isNaN(q) ? NaN : Math.log(q / (1 - q));
  }
  return { G, V };
}

// Plain-text boundary equation, e.g. "1.40 + 0.20x₁ − 0.80x₁² = 0" (terms in mask only).
export function equationText(w, mask) {
  const term = (v, k) => `${Math.abs(v) < 0.005 ? '0.00' : Math.abs(v).toFixed(2)}${k ? TERMS[k - 1].label : ''}`;
  let s = (w[0] <= -0.005 ? '−' : '') + term(w[0], 0);
  mask.forEach((on, i) => { if (on) s += ` ${w[i + 1] <= -0.005 ? '−' : '+'} ${term(w[i + 1], i + 1)}`; });
  return `${s} = 0`;
}

// The same boundary with every weight within `frac` of its slider limit (a
// positive rescale), rounded to the sliders' 0.01 steps.
export function fitToRange(w, frac = 0.8) {
  let s = 1;
  w.forEach((v, k) => { if (Math.abs(v) * s > frac * wMax(k)) s = (frac * wMax(k)) / Math.abs(v); });
  return w.map((v) => Math.round(v * s * 100) / 100);
}
