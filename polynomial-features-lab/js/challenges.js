// Polynomial Features Lab: the challenges (datasets of increasing difficulty),
// the five degree-2 terms, and headless helpers to score hand-set weights and
// to fit the logistic regression "best fit" on a subset of terms.
//
// Weights are always kept as the full vector [w0, w1..w5] over TERMS; a mask
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
export const W_MAX = 5; // slider range ±W_MAX

// Same order (and column keys) as the `quad2` transform.
export const TERMS = [
  { key: 'm1,0', tex: 'x_1', label: 'x₁', f: (a) => a },
  { key: 'm0,1', tex: 'x_2', label: 'x₂', f: (a, b) => b },
  { key: 'm2,0', tex: 'x_1^2', label: 'x₁²', f: (a) => a * a },
  { key: 'm1,1', tex: 'x_1x_2', label: 'x₁x₂', f: (a, b) => a * b },
  { key: 'm0,2', tex: 'x_2^2', label: 'x₂²', f: (a, b) => b * b },
];
export const ALL = [1, 1, 1, 1, 1];
export const RAW = [1, 1, 0, 0, 0];

const START = [0, 0, 1, 0, 0, 0]; // x₂ = 0, orange above

/**
 * Each challenge: dataset + seed, a training-accuracy goal that can be reached
 * by hand (`hand` is a slider-reachable solution, checked by the tests), and
 * text shown before (brief, hint) and after (insight) revealing the best fit.
 */
export const CHALLENGES = [
  {
    id: 'blobs', name: 'Two blobs', ds: 'blobs', params: { sep: 3.4, angle: -35, noise: 0.6 }, seed: 7301,
    goal: 1, poly: false, start: START, hand: [0, 1.65, -1.15, 0, 0, 0],
    brief: 'Warm-up with the raw features. Turn and slide the line until every point is on its own color’s side.',
    hint: 'The vector (w₁, w₂) points toward the orange side, so it sets the line’s tilt. w₀ slides the line along that direction.',
    insight: 'Any separating line gets 100%. Logistic regression picks the one with the lowest cross-entropy, which pushes points far from the line. Its weights are large because only their <b>ratios</b> place the line; their <b>size</b> sets how quickly the probability goes from 0 to 1.',
  },
  {
    id: 'overlap', name: 'Overlap', ds: 'blobs', params: { sep: 2.4, angle: 165, noise: 0.85 }, seed: 7101,
    goal: 0.9, poly: false, start: START, hand: [0, -1.15, 0.3, 0, 0, 0],
    brief: 'The two clouds overlap, so no line gets every point right. How close to perfect can you get?',
    hint: 'Aim the line across the gap between the two clouds’ centers and accept a few mistakes on each side.',
    insight: 'Even the best fit misclassifies the overlapping points. Switch to polynomial features and reveal again: the extra terms barely help. The classes really do overlap, and extra flexibility can only chase noise.',
  },
  {
    id: 'bullseye', name: 'Bullseye', ds: 'circles', params: {}, seed: 7103,
    goal: 0.98, poly: true, start: START, hand: [1.8, 0, 0, -1, 0, -1],
    brief: 'Orange in the middle, blue all around. Try a line first, then switch to <b>polynomial features</b>.',
    hint: 'x₁² + x₂² is the squared distance from the origin, so r² − x₁² − x₂² = 0 is a circle of radius r. In feature space, put x₁² and x₂² on the axes.',
    insight: 'Plot x₁² against x₂²: the classes are split by a straight line. A circle in the original space is a flat cut in feature space. The best fit puts almost no weight on x₁, x₂ or x₁x₂.',
  },
  {
    id: 'parabola', name: 'Parabola', ds: 'parabola', params: { k: 0.8, c: -1.5 }, seed: 7204,
    goal: 0.98, poly: true, start: START, hand: [1.5, 0, 1, -0.8, 0, 0],
    brief: 'The boundary bends like a cup. A line can only do so well.',
    hint: 'A parabola opening upward is x₂ = a x₁² + c. Which terms does that equation use?',
    insight: 'Only x₁² and x₂ (with the bias) are needed. Untick x₁, x₁x₂ and x₂², then reveal again: same accuracy with fewer features.',
  },
  {
    id: 'xor', name: 'XOR', ds: 'xor', params: {}, seed: 7105,
    goal: 0.98, poly: true, start: START, hand: [0, 0, 0, 0, 1, 0],
    brief: 'Orange in two opposite quadrants. No line, circle or ellipse can do this.',
    hint: 'The product x₁x₂ is positive in quadrants I and III and negative in II and IV. Try putting x₁x₂ on a feature-space axis.',
    insight: 'One feature does it: x₁x₂. On an x₁x₂ axis the classes split at 0. An interaction term means “the effect of x₁ depends on x₂”, which is exactly the XOR pattern.',
  },
  {
    id: 'offcenter', name: 'Off-center circle', ds: 'offcircle', params: {}, seed: 7106,
    goal: 0.95, poly: true, start: START, hand: [-0.15, 2.2, -1.6, -1, 0, -1],
    brief: 'A circle again, but its center has moved away from the origin.',
    hint: 'Expand (x₁ − a)² = x₁² − 2a x₁ + a²: moving the center creates the x₁ and x₂ terms. Find the center first, then set w₁ = 2a and w₂ = 2b (with w₃ = w₅ = −1).',
    insight: 'The linear terms move the center. Expanding 1.3² − (x₁ − 1.1)² − (x₂ + 0.8)² gives w₁ = 2.2 and w₂ = −1.6 against w₃ = w₅ = −1. The best fit uses the same trick with larger weights; its center lands near (1.1, −0.8), and the noise makes its curve slightly elliptical.',
  },
  {
    id: 'moons', name: 'Moons', ds: 'moons', params: { noise: 0.2 }, seed: 7108,
    goal: 0.88, poly: true, start: START, hand: [0.1, 0.2, -1, 0, 0, -0.15],
    brief: 'Two interlocking crescents. A degree-2 curve can’t follow both bends. How close can you get?',
    hint: 'A gently curved boundary through the gap between the moons is about the best a conic can do.',
    insight: 'Degree 2 does no better than a straight line here: switch back to raw features and reveal again. The true boundary is S-shaped, which needs higher-degree (or other) features. You may even beat the best fit on accuracy, because logistic regression minimizes cross-entropy, not the number of mistakes.',
  },
];

export const featuresFor = (mask) => [{ id: 'quad2', params: { mask: mask.slice() } }];
export const splitFor = (c) => makeSplit(c.ds, c.params, { ...SPLIT, seed: c.seed });

// Weights on the active columns <-> the full [w0, w1..w5].
export function compress(w6, mask) {
  const out = [w6[0]];
  mask.forEach((on, k) => { if (on) out.push(w6[k + 1]); });
  return out;
}
export function expand(w, mask) {
  const out = [w[0], 0, 0, 0, 0, 0];
  let j = 1;
  mask.forEach((on, k) => { if (on) out[k + 1] = w[j++]; });
  return out;
}

// Training accuracy and cross-entropy of the full weights w6 using the terms in mask.
export function scoreWeights(split, w6, mask) {
  const prep = prepare(split, featuresFor(mask));
  return evaluate(prep, compress(w6, mask)).train;
}

// L2 logistic regression (Newton) on the terms in mask.
// Returns {w (full 6-vector), wActive, prep, acc, loss}.
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

// Plain-text boundary equation, e.g. "1.40 + 0.20x₁ − 0.80x₁² = 0" (terms in mask only).
export function equationText(w6, mask) {
  const term = (v, k) => `${Math.abs(v) < 0.005 ? '0.00' : Math.abs(v).toFixed(2)}${k ? TERMS[k - 1].label : ''}`;
  let s = (w6[0] <= -0.005 ? '−' : '') + term(w6[0], 0);
  mask.forEach((on, i) => { if (on) s += ` ${w6[i + 1] <= -0.005 ? '−' : '+'} ${term(w6[i + 1], i + 1)}`; });
  return `${s} = 0`;
}

// The same boundary with every weight inside ±limit (a positive rescale), rounded.
export function fitToRange(w6, limit = W_MAX - 1) {
  const mx = Math.max(...w6.map(Math.abs));
  const s = mx > limit ? limit / mx : 1;
  return w6.map((v) => Math.round(v * s * 100) / 100);
}
