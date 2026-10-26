// Headless geometry behind the three panels.
//
// fitCase: one case → logistic regression on Φ (and on the raw features, for
// comparison), plus everything that does not depend on the weights: a G × G
// sheet of vertices over the original box with Φ at each, the training points
// with their features, and the floor boxes of both spaces.
//
// The score at any vertex or point is s = w₀ + w₁z₁ + w₂z₂, computed from its
// features: the height is the same whichever floor it is drawn over. Both 3-D
// views use normalized floor coordinates in [0, 1]: x̂ over the original box,
// ẑ over the feature box. frame(t) slides every vertex and point from x̂ to ẑ.

import { makeSplit } from './datasets.js';
import { prepare, makeTrainer, evaluate, viewFor } from './fit.js';
import { foldWeights } from './features.js';
import { evalGrid } from './plot2d.js';
import { marchingSquares, chainSegments } from './geometry.js';
import { RAW } from './cases.js';

export const SPLIT = { nTrain: 200, nVal: 0, nTest: 400 };
export const SEED = 705;
export const LAMBDA = 1e-3;
export const G = 61; // sheet vertices per side
export const LINE_STEP = 5; // a carried grid line every 5 vertices: 13 per direction
export const CUT_G = 170; // boundary grid, the same as the 2-D panel's
const PLANE_N = 21;

export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function fitModel(split, features, view, lambda = LAMBDA) {
  const prep = prepare(split, features, { view });
  const tr = makeTrainer(prep, lambda);
  tr.run();
  const wRaw = foldWeights(tr.w, prep.std);
  return { prep, d: prep.d, wRaw, ...evaluate(prep, wRaw) };
}

// Weights for display: raw-space weights divided by the largest |wⱼ| (j ≥ 1).
// A positive factor changes the heights but not the sign of any score.
export function shownWeights(w) {
  const m = Math.max(1e-12, ...Array.from(w).slice(1).map(Math.abs));
  return Array.from(w, (v) => v / m);
}

const fits = new Map();

export function fitCase(c) {
  if (fits.has(c.id)) return fits.get(c.id);
  const split = makeSplit(c.ds, c.params, { ...SPLIT, seed: SEED });
  const view = c.view || viewFor(c.ds);
  const model = fitModel(split, c.features, view);
  const raw = fitModel(split, RAW, view);
  if (model.d !== 2) throw new Error(`${c.id}: Φ must have exactly 2 features, not ${model.d}`);
  const w0 = shownWeights(model.wRaw);
  const { fmap, tr } = model.prep, row = new Float64Array(2);

  // sheet vertices (row-major, j along x₂): x and Φ(x)
  const VX = new Float64Array(2 * G * G), VZ = new Float64Array(2 * G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const q = 2 * (j * G + i), x1 = view.xmin + (i / (G - 1)) * (view.xmax - view.xmin), x2 = view.ymin + (j / (G - 1)) * (view.ymax - view.ymin);
    fmap.evalRow(x1, x2, row);
    VX[q] = x1; VX[q + 1] = x2; VZ[q] = row[0]; VZ[q + 1] = row[1];
  }
  const PX = split.train.X, PZ = tr.Z, N = tr.N;

  // feature-space floor: around the points, padded. The far corners of the box
  // can land far out (x₁² = 9 at the corners), so the sheet is clipped there.
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let k = 0; k < PZ.length; k += 2) for (let a = 0; a < 2; a++) { lo[a] = Math.min(lo[a], PZ[k + a]); hi[a] = Math.max(hi[a], PZ[k + a]); }
  const pad = (a) => Math.max(1e-6, 0.04 * (hi[a] - lo[a]) || 0.5);
  const xbox = { u0: view.xmin, u1: view.xmax, v0: view.ymin, v1: view.ymax };
  // Φ = identity: the same floor, so the two 3-D views are the same picture
  const zbox = c.features === RAW ? { ...xbox } : { u0: lo[0] - pad(0), u1: hi[0] + pad(0), v0: lo[1] - pad(1), v1: hi[1] + pad(1) };

  // height range: the training points' scores at the fitted weights (and 0), padded;
  // fixed per case so the axes stay put while the weights are nudged
  let smin = 0, smax = 0;
  for (let i = 0; i < N; i++) { const s = w0[0] + w0[1] * PZ[2 * i] + w0[2] * PZ[2 * i + 1]; smin = Math.min(smin, s); smax = Math.max(smax, s); }
  const sp = 0.15 * (smax - smin);
  const sRange = [smin - sp, smax + sp];

  const fc = {
    ...c, split, view, model, raw, w0, fmap, N, VX, VZ, PX, PZ, xbox, zbox, sRange,
    VXn: normalize(VX, xbox), VZn: normalize(VZ, zbox), PXn: normalize(PX, xbox), PZn: normalize(PZ, zbox),
  };
  fits.set(c.id, fc);
  return fc;
}

// Interleaved (u, v) pairs → [0, 1] over a floor box.
export function normalize(A, box) {
  const out = new Float64Array(A.length), du = box.u1 - box.u0, dv = box.v1 - box.v0;
  for (let k = 0; k < A.length; k += 2) { out[k] = (A[k] - box.u0) / du; out[k + 1] = (A[k + 1] - box.v0) / dv; }
  return out;
}

// Heights: s = w₀ + w₁z₁ + w₂z₂ at every sheet vertex (S) and training point (P).
export function scores(fc, w) {
  const at = (Z) => {
    const out = new Float64Array(Z.length / 2);
    for (let k = 0; k < out.length; k++) out[k] = w[0] + w[1] * Z[2 * k] + w[2] * Z[2 * k + 1];
    return out;
  };
  return { S: at(fc.VZ), P: at(fc.PZ) };
}

// Floor positions at morph time t (0: original floor x̂, 1: feature floor ẑ).
export function frame(fc, t) {
  const e = ease(Math.min(1, Math.max(0, t))), f = 1 - e;
  const mix = (A, B) => { const out = new Float64Array(A.length); for (let k = 0; k < A.length; k++) out[k] = f * A[k] + e * B[k]; return out; };
  return { e, V: mix(fc.VXn, fc.VZn), P: mix(fc.PXn, fc.PZn) };
}

// Vertex indices of the carried grid lines: rows, then columns.
export function gridLines() {
  const out = [];
  for (let j = 0; j < G; j += LINE_STEP) out.push(Array.from({ length: G }, (_, i) => j * G + i));
  for (let i = 0; i < G; i += LINE_STEP) out.push(Array.from({ length: G }, (_, j) => j * G + i));
  return out;
}

// The boundary s = 0, from the same grid the 2-D panel shades: {grid, segs}
// for the 2-D panel, and each polyline with its points in x, x̂ and ẑ.
let lastCut = null;
export function boundary(fc, w) {
  if (lastCut && lastCut.fc === fc && lastCut.w.every((v, k) => v === w[k])) return lastCut.out;
  const view = fc.view, grid = evalGrid(fc.fmap, w, view, CUT_G), segs = marchingSquares(grid.V, CUT_G), row = new Float64Array(2);
  const lines = chainSegments(segs).map((line) => {
    const n = line.length / 2, X = new Float64Array(2 * n), Z = new Float64Array(2 * n);
    for (let k = 0; k < n; k++) {
      const x1 = view.xmin + ((line[2 * k] + 0.5) / CUT_G) * (view.xmax - view.xmin), x2 = view.ymin + ((line[2 * k + 1] + 0.5) / CUT_G) * (view.ymax - view.ymin);
      fc.fmap.evalRow(x1, x2, row);
      X[2 * k] = x1; X[2 * k + 1] = x2; Z[2 * k] = row[0]; Z[2 * k + 1] = row[1];
    }
    return { X, Z, Xn: normalize(X, fc.xbox), Zn: normalize(Z, fc.zbox) };
  });
  const out = { grid, segs, lines };
  lastCut = { fc, w: Array.from(w), out };
  return out;
}

// The flat plane s = w₀ + w₁z₁ + w₂z₂ over the whole feature floor, on a
// PLANE_N × PLANE_N grid in normalized coordinates, and its zero line
// (where it crosses s = 0), clipped to the floor; null if it misses the floor.
export function plane(fc, w) {
  const b = fc.zbox, u = [], S = [];
  for (let k = 0; k < PLANE_N; k++) u.push(k / (PLANE_N - 1));
  for (const v of u) S.push(u.map((uu) => w[0] + w[1] * (b.u0 + uu * (b.u1 - b.u0)) + w[2] * (b.v0 + v * (b.v1 - b.v0))));
  // zero line in normalized coordinates: a·u + c·v + d = 0
  const a = w[1] * (b.u1 - b.u0), c = w[2] * (b.v1 - b.v0), d = w[0] + w[1] * b.u0 + w[2] * b.v0;
  return { u, S, zero: clipToUnit(a, c, d) };
}

// The part of a·u + c·v + d = 0 inside [0, 1]², as two endpoints, or null.
function clipToUnit(a, c, d) {
  if (Math.abs(a) < 1e-12 && Math.abs(c) < 1e-12) return null;
  const n = Math.hypot(a, c), p = [(-a * d) / (n * n), (-c * d) / (n * n)], dir = [-c / n, a / n];
  let lo = -Infinity, hi = Infinity;
  for (let k = 0; k < 2; k++) {
    if (Math.abs(dir[k]) < 1e-12) { if (p[k] < 0 || p[k] > 1) return null; continue; }
    const s1 = -p[k] / dir[k], s2 = (1 - p[k]) / dir[k];
    lo = Math.max(lo, Math.min(s1, s2)); hi = Math.min(hi, Math.max(s1, s2));
  }
  return lo < hi ? [[p[0] + lo * dir[0], p[1] + lo * dir[1]], [p[0] + hi * dir[0], p[1] + hi * dir[1]]] : null;
}

// Unit direction of the zero line on the normalized feature floor, pointed
// toward the viewer (negative v): the Edge-on camera looks along it.
export function zeroDirection(fc, w) {
  const b = fc.zbox, a = w[1] * (b.u1 - b.u0), c = w[2] * (b.v1 - b.v0), n = Math.hypot(a, c);
  if (n < 1e-12) return [0, -1];
  let du = -c / n, dv = a / n;
  if (dv > 0 || (dv === 0 && du < 0)) { du = -du; dv = -dv; }
  return [du, dv];
}

// Training and new-data accuracy for any weights.
export function accuracy(fc, w) {
  const m = evaluate(fc.model.prep, w);
  return { train: m.train.acc, test: m.test.acc };
}
