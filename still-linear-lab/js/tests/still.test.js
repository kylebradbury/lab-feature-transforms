// The lab's geometry and every claim in its text, checked against real fits.
import { suite, test, assert, assertClose } from './harness.js';
import { CASES, byId } from '../cases.js';
import { fitCase, scores, frame, boundary, plane, accuracy, zeroDirection, gridLines, ease, G } from '../build.js';

suite('content');

const pct = (v) => `${(100 * v).toFixed(1)}%`;
const f2 = (v) => v.toFixed(2);
const score = (w, z1, z2) => w[0] + w[1] * z1 + w[2] * z2;

// Relative RMS residual of the best plane s ≈ a + b·u + c·v through the sheet
// (3 × 3 normal equations): 0 for a flat sheet.
function planeResidual(UV, S) {
  const n = S.length, A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
  let mean = 0;
  for (let k = 0; k < n; k++) {
    const x = [1, UV[2 * k], UV[2 * k + 1]];
    for (let a = 0; a < 3; a++) { r[a] += x[a] * S[k]; for (let b = 0; b < 3; b++) A[a][b] += x[a] * x[b]; }
    mean += S[k] / n;
  }
  // Gaussian elimination
  for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
    const m = A[q][p] / A[p][p];
    for (let b = p; b < 3; b++) A[q][b] -= m * A[p][b];
    r[q] -= m * r[p];
  }
  const c = [0, 0, 0];
  for (let p = 2; p >= 0; p--) { let s = r[p]; for (let b = p + 1; b < 3; b++) s -= A[p][b] * c[b]; c[p] = s / A[p][p]; }
  let res = 0, tot = 0;
  for (let k = 0; k < n; k++) { res += (S[k] - c[0] - c[1] * UV[2 * k] - c[2] * UV[2 * k + 1]) ** 2; tot += (S[k] - mean) ** 2; }
  return Math.sqrt(res / Math.max(1e-300, tot));
}

for (const c of CASES) {
  test(`${c.id}: Φ fits, and beats the raw features on new data (except Φ = identity)`, () => {
    const fc = fitCase(c), a = fc.model.test.acc, r = fc.raw.test.acc;
    assert(a >= 0.95, `test accuracy ${pct(a)}`);
    if (c.id === 'line') assertClose(a, r, 1e-12, 'identity should match the raw features');
    else assert(a >= r + 0.1, `raw ${pct(r)} → Φ ${pct(a)}`);
    const acc = accuracy(fc, fc.w0);
    assertClose(acc.test, a, 1e-12, 'shown weights predict like the fitted ones');
    return `raw ${pct(r)} → Φ ${pct(a)} (train ${pct(fc.model.train.acc)}); shown w = [${fc.w0.map(f2).join(', ')}]; s range [${fc.sRange.map(f2).join(', ')}]`;
  });

  test(`${c.id}: every height is the model's score, the same over both floors`, () => {
    const fc = fitCase(c), w = fc.w0, { P, S } = scores(fc, w), row = new Float64Array(2);
    for (let i = 0; i < fc.N; i++) {
      fc.fmap.evalRow(fc.PX[2 * i], fc.PX[2 * i + 1], row);
      assertClose(P[i], score(w, row[0], row[1]), 1e-9, `point ${i}`);
    }
    for (let k = 0; k < G * G; k += 97) {
      fc.fmap.evalRow(fc.VX[2 * k], fc.VX[2 * k + 1], row);
      assertClose(S[k], score(w, row[0], row[1]), 1e-9, `vertex ${k}`);
    }
  });

  test(`${c.id}: flat over the feature floor, ${c.id === 'line' ? 'and flat over x too' : 'curved over the original floor'}`, () => {
    const fc = fitCase(c), { S } = scores(fc, fc.w0);
    const rz = planeResidual(fc.VZn, S), rx = planeResidual(fc.VXn, S);
    assert(rz < 1e-9, `feature floor residual ${rz}`);
    if (c.id === 'line') assert(rx < 1e-9, `identity: original floor residual ${rx}`);
    else assert(rx > 0.1, `original floor residual only ${rx}`);
    return `residual of the best plane: over z ${rz.toExponential(1)}, over x ${rx.toFixed(3)}`;
  });

  test(`${c.id}: the boundary's Φ-image lies on the zero line of the plane`, () => {
    const fc = fitCase(c), w = fc.w0, b = boundary(fc, w), span = fc.sRange[1] - fc.sRange[0];
    assert(b.lines.length > 0, 'no boundary');
    let worst = 0, n = 0;
    for (const L of b.lines) for (let k = 0; k < L.Z.length; k += 2) { worst = Math.max(worst, Math.abs(score(w, L.Z[k], L.Z[k + 1]))); n++; }
    // The cut is interpolated on a grid; the spiral's score twists sharply at the
    // center (θ is undefined there), which costs it about 1% of the height range.
    assert(worst < 0.02 * span, `|s| on the cut up to ${worst} (span ${span})`);
    return `${b.lines.length} curve(s), ${n} points, |s| ≤ ${worst.toExponential(1)} (${(100 * worst / span).toFixed(2)}% of the height range)`;
  });

  test(`${c.id}: the morph moves the floor only`, () => {
    const fc = fitCase(c), f0 = frame(fc, 0), f1 = frame(fc, 1), fm = frame(fc, 0.5);
    for (let k = 0; k < f0.V.length; k++) { assert(f0.V[k] === fc.VXn[k] && f1.V[k] === fc.VZn[k], `vertex coordinate ${k}`); }
    for (let k = 0; k < f0.P.length; k++) assertClose(fm.P[k], 0.5 * (fc.PXn[k] + fc.PZn[k]), 1e-12, 'midway');
    assert(ease(0) === 0 && ease(1) === 1 && ease(0.5) === 0.5, 'ease endpoints');
  });

  test(`${c.id}: the drawn plane and its zero line match the scores`, () => {
    const fc = fitCase(c), w = fc.w0, p = plane(fc, w), b = fc.zbox;
    const at = (u, v) => score(w, b.u0 + u * (b.u1 - b.u0), b.v0 + v * (b.v1 - b.v0));
    assertClose(p.S[3][5], at(p.u[5], p.u[3]), 1e-9, 'plane height');
    assert(p.zero, 'zero line misses the feature floor');
    for (const [u, v] of p.zero) assertClose(at(u, v), 0, 1e-9, 'zero line endpoint');
    const [du, dv] = zeroDirection(fc, w);
    assertClose(at(0.5 + 0.2 * du, 0.5 + 0.2 * dv), at(0.5, 0.5), 1e-9, 'height changes along the edge-on direction');
    assert(dv <= 0, 'edge-on camera behind the plot');
  });
}

// The accuracy table in README.md (new data, raw → Φ, in %).
const README_ACC = { line: [97.0, 97.0], circle: [52.0, 99.8], hyperbola: [48.3, 100], ring: [45.8, 99.3], wave: [87.3, 100], spiral: [64.3, 100] };
test('README accuracy table matches the fits', () => {
  for (const c of CASES) {
    const fc = fitCase(c), [r, a] = README_ACC[c.id];
    assertClose(100 * fc.raw.test.acc, r, 0.05, `${c.id} raw`);
    assertClose(100 * fc.model.test.acc, a, 0.05, `${c.id} Φ`);
  }
});

test('every case has 2 features, a lead and definitions', () => {
  for (const c of CASES) {
    const fc = fitCase(c);
    assert(fc.model.d === 2 && c.where.length === 2 && c.xTerms.length === 2 && c.zAxis.length === 2, c.id);
    assert(c.lead && c.defs.length >= 1, `${c.id}: text`);
  }
  assert(gridLines().length === 2 * Math.ceil(G / 5), 'grid lines');
});

test('nudging w₀ by δ moves every height by δ; scaling w changes no prediction', () => {
  const fc = fitCase(byId('circle')), w = fc.w0, a = scores(fc, w), b = scores(fc, [w[0] + 0.37, w[1], w[2]]), c = scores(fc, w.map((v) => 3.7 * v));
  for (let k = 0; k < a.S.length; k++) assertClose(b.S[k] - a.S[k], 0.37, 1e-12);
  for (let k = 0; k < a.P.length; k++) assert(a.P[k] > 0 === c.P[k] > 0, 'scaling flipped a prediction');
});

test('Φ = identity: the two floors are the same', () => {
  const fc = fitCase(byId('line'));
  for (let k = 0; k < fc.VXn.length; k++) assertClose(fc.VXn[k], fc.VZn[k], 1e-12);
});

// ---- the text's claims about the fitted shapes ----
const s0 = (id, x1, x2) => { const fc = fitCase(byId(id)), row = new Float64Array(2); fc.fmap.evalRow(x1, x2, row); return score(fc.w0, row[0], row[1]); };

test('circle: the score is a dome, crossing 0 in one circle', () => {
  const fc = fitCase(byId('circle')), w = fc.w0, b = boundary(fc, w);
  assert(w[1] < 0 && w[2] < 0 && w[0] > 0, `w = ${w.map(f2)}`);
  assert(b.lines.length === 1, `${b.lines.length} curves`);
  return `radii ${f2(Math.sqrt(w[0] / -w[1]))} along x₁, ${f2(Math.sqrt(w[0] / -w[2]))} along x₂`;
});

test('hyperbola: up where x₁ and x₂ share a sign, down where they differ; two branches', () => {
  assert(s0('hyperbola', 2, 2) > 0 && s0('hyperbola', -2, -2) > 0 && s0('hyperbola', 2, -2) < 0 && s0('hyperbola', -2, 2) < 0, 'quadrant signs');
  const b = boundary(fitCase(byId('hyperbola')), fitCase(byId('hyperbola')).w0);
  assert(b.lines.length === 2, `${b.lines.length} curves`);
});

test('ring: a ridge, low at the center and far out, crossing 0 in two circles; Φ lands on z₂ = z₁²', () => {
  const fc = fitCase(byId('ring')), [a, b, c] = fc.w0, disc = b * b - 4 * c * a;
  assert(c < 0 && disc > 0, `w = ${fc.w0.map(f2)}`);
  const r1 = (-b + Math.sqrt(disc)) / (2 * c), r2 = (-b - Math.sqrt(disc)) / (2 * c), lo = Math.min(r1, r2), hi = Math.max(r1, r2);
  assert(lo > 0 && hi < 3, `roots ${f2(lo)}, ${f2(hi)}`);
  assert(s0('ring', 0, 0) < 0 && s0('ring', 3, 0) < 0 && s0('ring', 1.6, 0) > 0, 'low, high, low');
  assert(boundary(fc, fc.w0).lines.length === 2, 'two curves');
  for (let i = 0; i < fc.N; i++) assertClose(fc.PZ[2 * i + 1], fc.PZ[2 * i] ** 2, 1e-9, 'z₂ = z₁²');
  return `circles of radius ${f2(lo)} and ${f2(hi)}`;
});

test('spiral: every point lands on the circle of radius 1, and the plane crosses 0 there', () => {
  const fc = fitCase(byId('spiral')), w = fc.w0;
  for (let i = 0; i < fc.N; i++) assertClose(Math.hypot(fc.PZ[2 * i], fc.PZ[2 * i + 1]), 1, 1e-9, 'radius');
  assert(Math.abs(w[0]) < Math.hypot(w[1], w[2]), 'the zero line misses the circle');
});
