// Headless computation behind every plot in the gallery.
//
// fitCase: one dataset + one representation Φ → logistic regression on Φ and,
// for comparison, on the raw features, plus a display map D(x) → (u, v) for
// the feature-space view:
//   d = 1: (z₁, x₂), the boundary is the vertical line z₁ = −w₀/w₁
//   d = 2: (z₁, z₂) itself, the boundary is the line w₀ + w₁z₁ + w₂z₂ = 0
//   d > 2: edge-on. u = ŵ·z̃ along the weights (z̃ standardized), v = the
//          direction ⟂ ŵ with the most spread, so the hyperplane is the
//          vertical line u = −w₀/‖w‖ exactly.
// geometry: everything the morph view draws, in [0, 1] plot coordinates for
// both spaces: a mesh over the original box, the boundary contour, the
// training points, landmarks, and axis ticks.

import { makeSplit, DATASETS } from './datasets.js';
import { prepare, makeTrainer, evaluate, viewFor } from './fit.js';
import { foldWeights } from './features.js';
import { evalGrid, niceTicks, texLabel } from './plot2d.js';
import { marchingSquares, chainSegments } from './geometry.js';
import { RAW, val } from './exhibits.js';

export const SPLIT = { nTrain: 200, nVal: 0, nTest: 400 };
export const SEED = 705;
export const LAMBDA = 1e-3;
const RES = {
  full: { heat: 150, mesh: 60, meshStep: 5, contour: 170 },
  thumb: { heat: 56, mesh: 24, meshStep: 4, contour: 80 },
};

export function fitModel(split, features, view, lambda = LAMBDA) {
  const prep = prepare(split, features, { view });
  const tr = makeTrainer(prep, lambda);
  tr.run();
  const wRaw = foldWeights(tr.w, prep.std);
  return { prep, d: prep.d, wStd: Float64Array.from(tr.w), wRaw, ...evaluate(prep, wRaw) };
}

// One exhibit at knob value k, as a case for fitCase.
export function exhibitCase(ex, k = ex.k0) {
  return {
    key: `${ex.id}|${k}`, ds: ex.ds, params: ex.params, view: ex.view, features: ex.features(k), lambda: ex.lambda,
    zAxis: val(ex.zAxis, k), zTex: ex.zTex, collapse: !!ex.collapse, jumps: !!ex.jumps,
  };
}

const fits = new Map(), geos = new Map();

// c: {key, ds, params, features, view?, lambda?, zAxis?, zTex?, collapse?, jumps?}
export function fitCase(c) {
  if (fits.has(c.key)) return fits.get(c.key);
  const split = makeSplit(c.ds, c.params, { ...SPLIT, seed: SEED });
  const view = c.view || viewFor(c.ds);
  const model = fitModel(split, c.features, view, c.lambda);
  const raw = fitModel(split, RAW, view, c.lambda);
  const out = { ...c, split, view, model, raw, display: displayMap(model) };
  fits.set(c.key, out);
  return out;
}

function displayMap(model) {
  const { fmap, d, std, Zs, tr } = model.prep, w = model.wRaw, ws = model.wStd, row = new Float64Array(Math.max(1, d));
  if (d === 1) return { mode: 'line', coef: [w[0], w[1], 0], D(x1, x2, o) { fmap.evalRow(x1, x2, row); o[0] = row[0]; o[1] = x2; } };
  if (d === 2) return { mode: 'plane', coef: [w[0], w[1], w[2]], D(x1, x2, o) { fmap.evalRow(x1, x2, row); o[0] = row[0]; o[1] = row[1]; } };
  let n = 0;
  for (let j = 1; j <= d; j++) n += ws[j] * ws[j];
  n = Math.sqrt(n) || 1;
  const a = new Float64Array(d);
  for (let j = 0; j < d; j++) a[j] = ws[j + 1] / n;
  const b = spreadDirection(Zs, tr.N, d, a);
  return {
    mode: 'edge', coef: [ws[0], n, 0], a, b,
    D(x1, x2, o) {
      fmap.evalRow(x1, x2, row);
      let u = 0, v = 0;
      for (let j = 0; j < d; j++) { const z = (row[j] - std.mu[j]) / std.sd[j]; u += a[j] * z; v += b[j] * z; }
      o[0] = u; o[1] = v;
    },
  };
}

// Unit vector ⟂ a along which the standardized training features vary most
// (power iteration on their covariance, projected off a).
function spreadDirection(Z, N, d, a) {
  const C = new Float64Array(d * d);
  for (let i = 0; i < N; i++) {
    const o = i * d;
    for (let j = 0; j < d; j++) { const zj = Z[o + j]; if (zj) for (let k = j; k < d; k++) C[j * d + k] += zj * Z[o + k]; }
  }
  for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) C[j * d + k] = C[k * d + j];
  const off = (v) => { let s = 0; for (let j = 0; j < d; j++) s += v[j] * a[j]; for (let j = 0; j < d; j++) v[j] -= s * a[j]; };
  const unit = (v) => { const s = Math.hypot(...v); if (s > 1e-12) for (let j = 0; j < d; j++) v[j] /= s; return s > 1e-12; };
  let v = Float64Array.from({ length: d }, (_, j) => Math.cos(1 + 2.3 * j));
  const t = new Float64Array(d);
  for (let it = 0; it < 120; it++) {
    off(v);
    if (!unit(v)) break;
    for (let j = 0; j < d; j++) { let s = 0; for (let k = 0; k < d; k++) s += C[j * d + k] * v[k]; t[j] = s; }
    v.set(t);
  }
  off(v);
  if (!unit(v)) { v = new Float64Array(d); v[a[0] === 0 ? 0 : 1] = 1; off(v); unit(v); }
  return v;
}

const isIdentity = (fc) => fc.features.length === 1 && fc.features[0].id === 'raw';

export function geometry(fc, res = 'full') {
  const key = `${fc.key}|${res}`;
  if (geos.has(key)) return geos.get(key);
  const R = RES[res], { view, model, raw, display, split } = fc, DS = DATASETS[fc.ds];
  const { fmap, d } = model.prep, w = model.wRaw, D = display.D, o = [0, 0];
  const nx = (x) => (x - view.xmin) / (view.xmax - view.xmin), ny = (y) => (y - view.ymin) / (view.ymax - view.ymin);
  // Positive-only inputs (logs): keep the mesh away from 0.
  const mv = DS.domain === 'positive' ? { ...view, xmin: Math.max(view.xmin, DS.logView.xmin), ymin: Math.max(view.ymin, DS.logView.ymin) } : view;
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  const grow = () => { for (let k = 0; k < 2; k++) if (Number.isFinite(o[k])) { lo[k] = Math.min(lo[k], o[k]); hi[k] = Math.max(hi[k], o[k]); } };

  // mesh: (M+1)² vertices; X in original-plot units, Z raw display units (normalized below)
  const M = R.mesh, V1 = M + 1, MX = new Float32Array(2 * V1 * V1), MZ = new Float64Array(2 * V1 * V1);
  for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
    const x1 = mv.xmin + (i / M) * (mv.xmax - mv.xmin), x2 = mv.ymin + (j / M) * (mv.ymax - mv.ymin), q = 2 * (j * V1 + i);
    MX[q] = nx(x1); MX[q + 1] = ny(x2);
    D(x1, x2, o); MZ[q] = o[0]; MZ[q + 1] = o[1]; grow();
  }
  const meshBox = [lo[0], lo[1], hi[0], hi[1]];
  // Edge-on views scale to the points: the far corners of the box can land very far out (x₁³ = 27).
  if (display.mode === 'edge') { lo.fill(Infinity); hi.fill(-Infinity); }
  const tr = split.train, N = tr.y.length, PX = new Float32Array(2 * N), PZ = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) {
    const x1 = tr.X[2 * i], x2 = tr.X[2 * i + 1];
    PX[2 * i] = nx(x1); PX[2 * i + 1] = ny(x2);
    D(x1, x2, o); PZ[2 * i] = o[0]; PZ[2 * i + 1] = o[1]; grow();
  }
  // Landmarks of bump features, carried along like points.
  const LM = [];
  for (const part of fmap.parts) if (part.spec.id === 'rbf' && part.inst.centers) for (const [a, b] of part.inst.centers) { D(a, b, o); LM.push([nx(a), ny(b), o[0], o[1]]); }

  // display range: the image of the box plus the points, padded (none for Φ = identity)
  let range;
  if (isIdentity(fc)) range = { umin: view.xmin, umax: view.xmax, vmin: view.ymin, vmax: view.ymax };
  else {
    const pad = (k) => Math.max(1e-6, 0.04 * (hi[k] - lo[k]) || 0.5);
    range = { umin: lo[0] - pad(0), umax: hi[0] + pad(0), vmin: lo[1] - pad(1), vmax: hi[1] + pad(1) };
  }
  const nu = (u) => (u - range.umin) / (range.umax - range.umin), nv = (v) => (v - range.vmin) / (range.vmax - range.vmin);
  const norm = (Z) => { const out = new Float32Array(Z.length); for (let k = 0; k < Z.length; k += 2) { out[k] = nu(Z[k]); out[k + 1] = nv(Z[k + 1]); } return out; };
  const mesh = { M, step: R.meshStep, X: MX, Z: norm(MZ) };
  const points = { X: PX, Z: norm(PZ), raw: PZ, y: tr.y }; // raw: display units, for the tooltip
  const landmarks = LM.map(([a, b, u, v]) => [a, b, nu(u), nv(v)]);

  // quad colors: probability at each mesh cell center, as a 0–255 index
  const qg = evalGrid(fmap, w, mv, M), Q = new Uint8Array(M * M);
  for (let k = 0; k < M * M; k++) Q[k] = Math.round(255 / (1 + Math.exp(-qg.V[k])));
  mesh.Q = Q;

  // smooth shading for the untransformed view, and the boundary contour
  const heat = evalGrid(fmap, w, view, R.heat);
  const G = R.contour, cg = evalGrid(fmap, w, view, G);
  const contour = chainSegments(marchingSquares(cg.V, G)).map((line) => {
    const out = new Float32Array(2 * line.length);
    for (let k = 0; k < line.length; k += 2) {
      const a = (line[k] + 0.5) / G, b = (line[k + 1] + 0.5) / G;
      D(view.xmin + a * (view.xmax - view.xmin), view.ymin + b * (view.ymax - view.ymin), o);
      out[2 * k] = a; out[2 * k + 1] = b; out[2 * k + 2] = nu(o[0]); out[2 * k + 3] = nv(o[1]);
    }
    return out; // [nx, ny, nu, nv] per vertex
  });
  const rg = evalGrid(raw.prep.fmap, raw.wRaw, view, 64);
  const rawLine = chainSegments(marchingSquares(rg.V, 64)).map((line) => Float32Array.from(line, (v) => (v + 0.5) / 64));

  // the model in display coordinates: s = c0 + cu·u + cv·v, rewritten for normalized (u, v)
  const [c0, cu, cv] = display.coef, du = range.umax - range.umin, dv = range.vmax - range.vmin;
  const line = [c0 + cu * range.umin + cv * range.vmin, cu * du, cv * dv];

  const tick = (lo2, hi2, n, f) => niceTicks(lo2, hi2, n).map((v) => ({ v, n: f(v) }));
  const xAxis = DS.axisLabels || ['x₁', 'x₂'];
  const zAxis = display.mode === 'edge' ? ['w · z  (the direction the model uses)', 'another direction'] :
    fc.zAxis ? fc.zAxis : d === 1 ? [texLabel(fmap.columns[0].tex), 'x₂ (not used by the model)'] : fmap.columns.map((c) => texLabel(c.tex));
  const out = {
    key, mode: display.mode, collapse: fc.collapse, jumps: fc.jumps, res, mesh, points, landmarks, heat, contour, rawLine, line, range, meshBox,
    xTicks: [tick(view.xmin, view.xmax, 6, nx), tick(view.ymin, view.ymax, 6, ny)],
    zTicks: display.mode === 'edge' ? null : [tick(range.umin, range.umax, 5, nu), tick(range.vmin, range.vmax, 5, nv)],
    titles: { x: xAxis, z: zAxis },
  };
  geos.set(key, out);
  return out;
}

// Weights for display: raw-space weights divided by the largest |wⱼ| (j ≥ 1).
export function shownWeights(w) {
  const m = Math.max(1e-12, ...Array.from(w).slice(1).map(Math.abs));
  return Array.from(w, (v) => v / m);
}
