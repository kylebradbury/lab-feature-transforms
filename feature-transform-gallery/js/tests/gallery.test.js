// Feature Transform Gallery: every exhibit's representation beats the straight
// line, its boundary really is straight in the feature-space view, and every
// claim in the exhibit text and the finale holds on the real data and fits.

import { suite, test, assert } from './harness.js';
import { EXHIBITS, MATCH, byId, bumpParts, hingeParts, binParts, sinMultiple } from '../exhibits.js';
import { fitCase, exhibitCase, geometry, shownWeights } from '../build.js';

suite('content');
const pct = (v) => `${(100 * v).toFixed(1)}%`;
const fitOf = (id, k = {}) => fitCase(exhibitCase(byId(id), { ...byId(id).k0, ...k }));
const w = (id) => shownWeights(fitOf(id).model.wRaw);

for (const ex of EXHIBITS) {
  test(`${ex.id}: Φ beats the straight line on new data`, () => {
    const fc = fitCase(exhibitCase(ex)), a = fc.model.test.acc, r = fc.raw.test.acc;
    assert(a >= 0.93, `Φ test accuracy ${pct(a)}`);
    if (ex.id === 'line') assert(Math.abs(a - r) < 1e-9, 'Φ = identity should match the raw features');
    else assert(a - r >= 0.05, `gain only ${pct(a - r)}`);
    return `raw ${pct(r)} → Φ ${pct(a)}, ${fc.model.d} features`;
  });
  test(`${ex.id}: the boundary lands on a straight line in feature space`, () => {
    const fc = fitCase(exhibitCase(ex)), g = geometry(fc, 'full'), [c0, cu, cv] = g.line, n = Math.hypot(cu, cv);
    const want = { 1: 'line', 2: 'plane' }[fc.model.d] || 'edge';
    assert(g.mode === want, `view ${g.mode}, expected ${want}`);
    // Bin features jump, so no point scores exactly 0: the staircase maps to the cells on either side of the line.
    if (ex.id === 'bins') return 'skipped: discontinuous features';
    const dev = [];
    for (const line of g.contour) for (let k = 0; k < line.length; k += 4) dev.push(Math.abs(c0 + cu * line[k + 2] + cv * line[k + 3]) / n);
    dev.sort((a, b) => a - b);
    assert(dev.length > 20, 'no boundary');
    const p98 = dev[Math.floor(0.98 * (dev.length - 1))];
    assert(p98 < 0.01, `98% of the boundary within ${p98.toFixed(4)} of the line (plot widths)`);
    return `${dev.length} boundary points, 98% within ${p98.toFixed(4)}`;
  });
}

// ---- claims in the exhibit text ----
test('circle and diamond: z₁ + z₂ = R (equal weights)', () => {
  for (const id of ['circle', 'diamond']) { const v = w(id); assert(Math.abs(v[1] / v[2] - 1) < 0.2, `${id}: w₁/w₂ = ${(v[1] / v[2]).toFixed(2)}`); }
});
test('hyperbola: the boundary is the line z₂ = 0', () => {
  const v = w('hyperbola');
  assert(Math.abs(v[0]) < 0.25 && Math.abs(v[1]) < 0.25 && Math.abs(v[2]) === 1, `weights ${v.map((x) => x.toFixed(2))}`);
});
test('ring: the line crosses z₂ = z₁² at two distances inside the plot', () => {
  const [a, b, c] = w('ring'), disc = b * b - 4 * c * a, r1 = (-b - Math.sqrt(disc)) / (2 * c), r2 = (-b + Math.sqrt(disc)) / (2 * c);
  const [lo, hi] = [Math.min(r1, r2), Math.max(r1, r2)];
  assert(disc > 0 && lo > 0.5 && hi < 3, `radii ${lo.toFixed(2)}, ${hi.toFixed(2)}`);
  return `radii ${lo.toFixed(2)} and ${hi.toFixed(2)}`;
});
test('corner: the boundary is the line z₁ = −1', () => {
  const v = w('corner'), cut = -v[0] / v[1];
  assert(Math.abs(v[2]) < 0.15 && Math.abs(cut + 1) < 0.15, `weights ${v.map((x) => x.toFixed(2))}, cut ${cut.toFixed(2)}`);
});
test('checkerboard: one cut at 0', () => {
  const v = w('checker');
  assert(Math.abs(v[0]) < 0.15, `w₀/w₁ = ${v[0].toFixed(2)}`);
});
test('feature counts named in the text: 9 (degree 3), 49 bumps, 60 hinges', () => {
  assert(fitOf('poly3').model.d === 9 && fitOf('rbf').model.d === 49 && fitOf('relu').model.d === 60, 'feature count');
});
test('poly3: degree 1 is the raw features again', () => {
  const fc = fitOf('poly3', { deg: 1 });
  assert(Math.abs(fc.model.test.acc - fc.raw.test.acc) < 1e-9 && fc.model.d === 2, 'degree 1 differs from raw');
});
// Knob hints name the setting that matches the data: it must be the best one.
for (const [id, key, ks] of [['flower', 'k', [2, 3, 4, 5, 6, 7, 8]], ['spiral', 'turns', [0.5, 1, 1.5, 1.75, 2, 2.25, 2.5, 3]], ['wave', 'w', [0.5, 1, 1.5, 1.75, 2, 2.25, 2.5, 3, 4]]]) {
  test(`${id}: the data's own setting is the best knob value`, () => {
    const k0 = byId(id).k0[key], acc = ks.map((v) => fitOf(id, { [key]: v }).model.test.acc), best = Math.max(...acc);
    assert(acc[ks.indexOf(k0)] >= best - 1e-9, `${key} = ${k0}: ${pct(acc[ks.indexOf(k0)])}, best ${pct(best)}`);
    return ks.map((k, j) => `${k}: ${pct(acc[j])}`).join(', ');
  });
}

// ---- definitions and written-out features ----
test('every exhibit with a parameter inside Φ says it was chosen by hand', () => {
  const want = ['circle', 'parabola', 'ring', 'flower', 'spiral', 'wedge', 'wave', 'checker', 'diamond', 'islands', 'rbf', 'relu', 'bins'];
  for (const id of want) { const ex = byId(id); assert(ex.chosen && ex.chosen(ex.k0).length > 40, `${id}: no hand-chosen note`); }
  for (const ex of EXHIBITS) if (ex.knobs) assert(ex.chosen, `${ex.id} has a knob but no hand-chosen note`);
});
test('every exhibit defines the functions in its Φ', () => {
  for (const ex of EXHIBITS) {
    const defs = typeof ex.defs === 'function' ? ex.defs(ex.k0) : null;
    assert(Array.isArray(defs) && defs.length > 0 && defs.every((d) => typeof d === 'string' && d.length > 20), `${ex.id}: no definitions`);
  }
});
// The equations write each feature out from these numbers; they must give the feature's value.
const PTS = [[0.3, -1.7], [-2.2, 0.4], [1.9, 2.6], [-0.6, -2.9], [2.95, -0.05], [0, 0]];
function sameAsFeatures(fc, f) {
  const { fmap, d } = fc.model.prep, row = new Float64Array(d);
  for (const [a, b] of PTS) {
    fmap.evalRow(a, b, row);
    for (let j = 0; j < d; j++) assert(Math.abs(f(j, a, b) - row[j]) < 1e-9, `feature ${j + 1} at (${a}, ${b}): ${f(j, a, b)} vs ${row[j]}`);
  }
}
test('hinges written out as max(0, a·x₁ + b·x₂ + c) match the features', () => {
  for (const m of [2, 6, 60]) {
    const fc = fitOf('relu', { m }), H = hingeParts(fc);
    assert(H.length === m, `${H.length} hinges for m = ${m}`);
    sameAsFeatures(fc, (j, x1, x2) => Math.max(0, H[j].a * x1 + H[j].b * x2 + H[j].c));
  }
});
test('bumps written out with their landmarks and γ match the features', () => {
  for (const fc of [fitOf('rbf', { m: 3 }), fitOf('rbf'), fitOf('islands')]) {
    const { gamma, centers } = bumpParts(fc);
    sameAsFeatures(fc, (j, x1, x2) => Math.exp(-gamma * ((x1 - centers[j][0]) ** 2 + (x2 - centers[j][1]) ** 2)));
  }
  assert(fitOf('rbf', { m: 3 }).model.d === 9, 'a 3 × 3 grid has 9 bumps');
});
test('bins written out as 𝟙[lo ≤ xᵢ < hi] match the features', () => {
  for (const B of [2, 6, 14]) {
    const fc = fitOf('bins', { B }), P = binParts(fc);
    assert(P.length === 2 * (B - 1), `${P.length} bins for B = ${B}`);
    sameAsFeatures(fc, (j, x1, x2) => { const v = P[j].axis === 1 ? x1 : x2; return v >= P[j].lo && (P[j].hi === null || v < P[j].hi) ? 1 : 0; });
  }
});

test('sin kθ written in c = x₁/r and s = x₂/r equals sin kθ', () => {
  // parse "5c^4s - 10c^2s^3 + s^5" into terms and evaluate it
  const evalPoly = (str, c, s) => str.split(/\s(?=[+-]\s)/).reduce((sum, term) => {
    const m = term.replace(/\s/g, '').match(/^([+-]?)(\d*)(?:c(?:\^(\d))?)?(?:s(?:\^(\d))?)?$/);
    assert(m, `cannot read term "${term}"`);
    const ce = /c/.test(term) ? +(m[3] || 1) : 0, se = /s/.test(term) ? +(m[4] || 1) : 0;
    return sum + (m[1] === '-' ? -1 : 1) * (m[2] ? +m[2] : 1) * c ** ce * s ** se;
  }, 0);
  for (let k = 1; k <= 8; k++) for (const t of [0.3, 1.1, 2.5, -0.7, 3]) {
    const v = evalPoly(sinMultiple(k), Math.cos(t), Math.sin(t));
    assert(Math.abs(v - Math.sin(k * t)) < 1e-9, `k = ${k}, θ = ${t}: ${sinMultiple(k)} gives ${v}, sin kθ = ${Math.sin(k * t)}`);
  }
  return `k = 5: ${sinMultiple(5)}`;
});

// ---- finale ----
const MATCHING = { blobs: 'line', circles: 'circle', xor: 'hyperbola', ring: 'ring', sine: 'wave', spirals: 'spiral' };
test('finale: each dataset is cracked by its own representation, and some representation fails on it', () => {
  const rows = [];
  for (const D of MATCH.datasets) {
    const acc = MATCH.reps.map((rep) => fitCase({ key: `match|${rep.exhibit}|${D.ds}`, ds: D.ds, params: D.params, features: rep.features }).model.test.acc);
    const designed = acc.filter((_, r) => !MATCH.reps[r].generic), own = acc[MATCH.reps.findIndex((r) => r.exhibit === MATCHING[D.ds])];
    assert(own >= 0.95 && own >= Math.max(...designed) - 1e-9, `${D.name}: own representation ${pct(own)}`);
    assert(Math.min(...designed) <= 0.75, `${D.name}: no representation fails (worst ${pct(Math.min(...designed))})`);
    rows.push(`${D.name}: ${acc.map((a) => Math.round(100 * a)).join(' ')}`);
  }
  return rows.join(' | ');
});
