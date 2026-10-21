// Seeded 2-D binary classification datasets. Class 1 is drawn orange, class 0 blue.
// Every generator returns exactly floor(n/2) class-1 points and the rest class 0.

import { makeRng, deriveSeed } from './rng.js';

export const BOX = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
const TAU = 2 * Math.PI;

// Uniform rejection sampling in a box; label(x1, x2) returns 1, 0 or -1 (reject).
function region(n, rng, label, box = BOX, filter = null) {
  const n1 = Math.floor(n / 2), n0 = n - n1;
  const X = new Float64Array(2 * n), y = new Uint8Array(n);
  let c0 = 0, c1 = 0, k = 0, tries = 0;
  while ((c0 < n0 || c1 < n1) && tries < 400000) {
    tries++;
    const a = rng.range(box.xmin, box.xmax), b = rng.range(box.ymin, box.ymax);
    if (filter && !filter(a, b)) continue;
    const L = label(a, b);
    if ((L === 1 && c1 < n1) || (L === 0 && c0 < n0)) {
      X[2 * k] = a; X[2 * k + 1] = b; y[k] = L; k++;
      if (L === 1) c1++; else c0++;
    }
  }
  return { X: X.subarray(0, 2 * k), y: y.subarray(0, k) };
}

// Build a dataset from two per-class point samplers.
function twoClass(n, rng, sample1, sample0) {
  const n1 = Math.floor(n / 2);
  const X = new Float64Array(2 * n), y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const cls = i < n1 ? 1 : 0;
    const [a, b] = cls ? sample1(rng) : sample0(rng);
    X[2 * i] = a; X[2 * i + 1] = b; y[i] = cls;
  }
  return { X, y };
}

// Uniform-by-area sampler on the annulus r0 < r < r1.
const annulus = (r0, r1) => (r) => {
  const rad = Math.sqrt(r.range(r0 * r0, r1 * r1)), t = r.range(0, TAU);
  return [rad * Math.cos(t), rad * Math.sin(t)];
};

function jitter(X, s, rng) {
  if (!(s > 0)) return;
  for (let i = 0; i < X.length; i++) X[i] += s * rng.normal();
}

const near = (v, g) => Math.abs(v) < g;
const fracDist = (v) => Math.abs(v - Math.round(v));
const deg = (d) => (d * Math.PI) / 180;
function angleIn(t, a, b) {
  // is angle t inside the counter-clockwise arc from a to b (radians)?
  const w = (x) => ((x % TAU) + TAU) % TAU;
  return w(t - a) < w(b - a);
}

const NOISE = (def, max = 0.5) => ({ min: 0, max, step: 0.01, default: def, label: 'noise' });

export const DATASETS = {
  none: {
    label: 'No data (blank canvas)',
    params: {},
    gen: () => ({ X: new Float64Array(0), y: new Uint8Array(0) }),
  },
  blobs: {
    label: 'Two blobs',
    params: {
      noise: { min: 0.2, max: 1.6, step: 0.05, default: 0.75, label: 'spread' },
      sep: { min: 0, max: 5, step: 0.1, default: 3, label: 'separation' },
      angle: { min: 0, max: 180, step: 1, default: 30, label: 'angle (°)' },
    },
    gen(n, p, rng) {
      const cx = (p.sep / 2) * Math.cos(deg(p.angle)), cy = (p.sep / 2) * Math.sin(deg(p.angle));
      return twoClass(n, rng,
        (r) => [cx + p.noise * r.normal(), cy + p.noise * r.normal()],
        (r) => [-cx + p.noise * r.normal(), -cy + p.noise * r.normal()]);
    },
    noJitter: true,
  },
  circles: {
    label: 'Concentric circles',
    params: { noise: NOISE(0.12), gap: { min: 0, max: 1.2, step: 0.05, default: 0.7, label: 'gap' } },
    gen(n, p, rng) {
      return twoClass(n, rng, annulus(0, 1), annulus(1 + p.gap, 2.7));
    },
  },
  ring: {
    label: 'Ring (donut)',
    params: { noise: NOISE(0.05) },
    gen(n, p, rng) {
      // class 0 is split evenly between the center disk and the outer ring
      return twoClass(n, rng, annulus(1.25, 2.0), (r) => (r.uniform() < 0.5 ? annulus(0, 0.85)(r) : annulus(2.4, 2.95)(r)));
    },
  },
  offcircle: {
    label: 'Off-center circle',
    params: {
      noise: NOISE(0.05),
      a: { min: -1.5, max: 1.5, step: 0.05, default: 1.1, label: 'center a' },
      b: { min: -1.5, max: 1.5, step: 0.05, default: -0.8, label: 'center b' },
      R: { min: 0.6, max: 1.6, step: 0.05, default: 1.3, label: 'radius R' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        const d = Math.hypot(x - p.a, y - p.b) - p.R;
        return near(d, 0.1) ? -1 : d < 0 ? 1 : 0;
      });
    },
  },
  xor: {
    label: 'XOR quadrants',
    params: {
      noise: NOISE(0.08),
      a: { min: -1.5, max: 1.5, step: 0.05, default: 0, label: 'shift a' },
      b: { min: -1.5, max: 1.5, step: 0.05, default: 0, label: 'shift b' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        const u = x - p.a, v = y - p.b;
        if (near(u, 0.15) || near(v, 0.15)) return -1;
        return u * v > 0 ? 1 : 0;
      });
    },
  },
  moons: {
    label: 'Two moons',
    params: { noise: NOISE(0.2, 0.6) },
    gen(n, p, rng) {
      const S = 1.6;
      return twoClass(n, rng,
        (r) => { const t = r.range(0, Math.PI); return [S * (1 - Math.cos(t) - 0.5), S * (0.5 - Math.sin(t) - 0.25)]; },
        (r) => { const t = r.range(0, Math.PI); return [S * (Math.cos(t) - 0.5), S * (Math.sin(t) - 0.25)]; });
    },
  },
  spirals: {
    label: 'Two spirals',
    params: {
      noise: NOISE(0.06, 0.4),
      turns: { min: 0.5, max: 3, step: 0.25, default: 2, label: 'turns' },
      chir: { options: [{ value: 1, label: 'counter-clockwise' }, { value: -1, label: 'clockwise' }], default: 1, label: 'chirality' },
    },
    gen(n, p, rng) {
      const w = spiralOmega(p.turns), s = p.chir;
      const arm = (off) => (r) => {
        const rad = Math.sqrt(r.range(0.25 * 0.25, 2.8 * 2.8)), t = s * w * rad + off;
        return [rad * Math.cos(t), rad * Math.sin(t)];
      };
      return twoClass(n, rng, arm(0), arm(Math.PI));
    },
  },
  checker: {
    label: 'Checkerboard',
    params: {
      noise: NOISE(0.03, 0.3),
      cells: { min: 2, max: 6, step: 1, default: 4, label: 'cells per side' },
      phase: { min: 0, max: 1.5, step: 0.05, default: 0, label: 'offset' },
    },
    gen(n, p, rng) {
      const s = 6 / p.cells;
      return region(n, rng, (x, y) => {
        const u = (x - p.phase) / s, v = (y - p.phase) / s;
        if (fracDist(u) * s < 0.06 || fracDist(v) * s < 0.06) return -1;
        return Math.sin(Math.PI * u) * Math.sin(Math.PI * v) > 0 ? 1 : 0;
      });
    },
  },
  sine: {
    label: 'Sine-wave boundary',
    params: {
      noise: NOISE(0.06),
      A: { min: 0, max: 2, step: 0.05, default: 1.2, label: 'amplitude A' },
      w: { min: 0.5, max: 4, step: 0.05, default: 1.5, label: 'frequency' },
      ph: { min: 0, max: 6.28, step: 0.01, default: 0.5, label: 'phase' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        const d = y - p.A * Math.sin(p.w * x + p.ph);
        return near(d, 0.12) ? -1 : d > 0 ? 1 : 0;
      });
    },
  },
  stripes: {
    label: 'Stripes',
    params: {
      noise: NOISE(0.04, 0.3),
      w: { min: 0.5, max: 4, step: 0.05, default: 1.5, label: 'frequency' },
      ph: { min: 0, max: 6.28, step: 0.01, default: 1, label: 'phase' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x) => {
        const v = Math.sin(p.w * x + p.ph);
        return near(v, 0.12) ? -1 : v > 0 ? 1 : 0;
      });
    },
  },
  flower: {
    label: 'Flower',
    params: {
      noise: NOISE(0.04, 0.3),
      k: { min: 2, max: 8, step: 1, default: 5, label: 'petals k' },
      amp: { min: 0, max: 0.6, step: 0.05, default: 0.4, label: 'petal depth' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        const r = Math.hypot(x, y), t = Math.atan2(y, x);
        const d = r - 1.7 * (1 + p.amp * Math.sin(p.k * t));
        return near(d, 0.1) ? -1 : d < 0 ? 1 : 0;
      });
    },
  },
  wedge: {
    label: 'Wedge (pie slice)',
    params: {
      noise: NOISE(0.04, 0.3),
      t1: { min: -180, max: 180, step: 1, default: 20, label: 'from angle (°)' },
      t2: { min: -180, max: 180, step: 1, default: 130, label: 'to angle (°)' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        if (Math.hypot(x, y) < 0.15) return -1;
        return angleIn(Math.atan2(y, x), deg(p.t1), deg(p.t2)) ? 1 : 0;
      });
    },
  },
  normball: {
    label: 'Norm ball (diamond / circle / square)',
    params: {
      noise: NOISE(0.03, 0.3),
      p: { options: [{ value: 1, label: 'L1 (diamond)' }, { value: 2, label: 'L2 (circle)' }, { value: 3, label: 'L∞ (square)' }], default: 1, label: 'shape' },
      R: { min: 1, max: 2.5, step: 0.05, default: 1.8, label: 'size R' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        const v = p.p === 1 ? Math.abs(x) + Math.abs(y) : p.p === 2 ? Math.hypot(x, y) : Math.max(Math.abs(x), Math.abs(y));
        return near(v - p.R, 0.08) ? -1 : v < p.R ? 1 : 0;
      });
    },
  },
  band: {
    label: 'Vertical band',
    params: {
      noise: NOISE(0.04, 0.3),
      c: { min: -1.5, max: 1.5, step: 0.05, default: 0.3, label: 'center c' },
      h: { min: 0.3, max: 1.5, step: 0.05, default: 0.9, label: 'half-width h' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x) => {
        const d = Math.abs(x - p.c) - p.h;
        return near(d, 0.08) ? -1 : d < 0 ? 1 : 0;
      });
    },
  },
  corner: {
    label: 'Corner (L-shape)',
    params: {
      noise: NOISE(0.04, 0.3),
      t: { min: -2, max: 2, step: 0.05, default: -0.5, label: 'corner x' },
      s: { min: -2, max: 2, step: 0.05, default: -0.3, label: 'corner y' },
    },
    gen(n, p, rng) {
      return region(n, rng, (x, y) => {
        const d = Math.min(x - p.t, y - p.s);
        return near(d, 0.08) ? -1 : d > 0 ? 1 : 0;
      });
    },
  },
  loans: {
    label: 'Loans (income vs. loan, $k)',
    domain: 'positive',
    view: { xmin: 0, xmax: 400, ymin: 0, ymax: 400 },
    logView: { xmin: 4, xmax: 450, ymin: 1, ymax: 700 },
    axisLabels: ['income ($k)', 'loan ($k)'],
    params: {
      noise: { min: 0, max: 1, step: 0.01, default: 0.02, label: 'label noise' },
      rule: { options: [{ value: 'power', label: 'power law: loan ≤ k·income^p' }, { value: 'ratio', label: 'loan ≤ 0.4·income' }, { value: 'log', label: 'loan ≤ 30·ln(income) − 20' }], default: 'power', label: 'approval rule' },
      trainBelow: { min: 0, max: 400, step: 10, default: 0, label: 'train only below income' },
      spread: { min: 0.2, max: 1, step: 0.05, default: 0.4, label: 'spread of loan sizes' },
      pw: { min: 0.3, max: 1, step: 0.05, default: 0.45, label: 'power p (power rule)' },
    },
    gen(n, p, rng, filter) {
      const bound = loanBoundary(p.rule, p.pw);
      const n1 = Math.floor(n / 2), n0 = n - n1;
      const X = new Float64Array(2 * n), y = new Uint8Array(n);
      let c0 = 0, c1 = 0, k = 0, tries = 0;
      while ((c0 < n0 || c1 < n1) && tries < 400000) {
        tries++;
        const inc = Math.exp(Math.log(60) + 0.7 * rng.normal());
        if (inc < 5 || inc > 400) continue;
        if (filter && !filter(inc, 0)) continue;
        const eps = p.spread * rng.normal();
        const loan = bound(inc) * Math.exp(eps);
        if (loan < 0.5 || loan > 600) continue;
        const L = eps + p.noise * rng.normal() < 0 ? 1 : 0;
        if ((L === 1 && c1 < n1) || (L === 0 && c0 < n0)) {
          X[2 * k] = inc; X[2 * k + 1] = loan; y[k] = L; k++;
          if (L) c1++; else c0++;
        }
      }
      return { X: X.subarray(0, 2 * k), y: y.subarray(0, k) };
    },
    noJitter: true,
  },
};

export function loanBoundary(rule, pw = 0.6) {
  if (rule === 'ratio') return (x) => 0.4 * x;
  if (rule === 'log') return (x) => 30 * Math.log(x) - 20;
  return (x) => 3 * Math.pow(60, 0.6 - pw) * Math.pow(x, pw);
}

// Spiral pitch so that `turns` turns span r in [0, 2.8].
export function spiralOmega(turns) {
  return (TAU * turns) / 2.8;
}

// Add the common label-flip parameter to every dataset.
for (const d of Object.values(DATASETS)) {
  d.view = d.view || BOX;
  d.domain = d.domain || 'all';
  if (d.params.noise !== undefined || Object.keys(d.params).length) {
    d.params.flip = { min: 0, max: 0.25, step: 0.01, default: 0, label: 'label flips' };
  }
}

export function datasetDefaults(id) {
  const out = {};
  for (const [k, s] of Object.entries(DATASETS[id].params)) out[k] = s.default;
  return out;
}

function generate(id, params, n, seed, filter) {
  const def = DATASETS[id];
  const p = { ...datasetDefaults(id), ...params };
  const rng = makeRng(seed);
  const { X, y } = def.gen(n, p, rng, filter);
  if (!def.noJitter) jitter(X, p.noise, rng);
  if (p.flip > 0) for (let i = 0; i < y.length; i++) if (rng.uniform() < p.flip) y[i] = 1 - y[i];
  return { X, y };
}

// Stratified split of one class-balanced sample into two parts.
function stratSplit(X, y, nFirst, rng) {
  const idx = [[], []];
  for (let i = 0; i < y.length; i++) idx[y[i]].push(i);
  rng.shuffle(idx[0]);
  rng.shuffle(idx[1]);
  const k1 = Math.round(nFirst * idx[1].length / Math.max(1, y.length));
  const first = idx[1].slice(0, k1).concat(idx[0].slice(0, nFirst - k1));
  const second = idx[1].slice(k1).concat(idx[0].slice(nFirst - k1));
  const take = (ids) => {
    const Xo = new Float64Array(2 * ids.length), yo = new Uint8Array(ids.length);
    ids.forEach((i, k) => { Xo[2 * k] = X[2 * i]; Xo[2 * k + 1] = X[2 * i + 1]; yo[k] = y[i]; });
    return { X: Xo, y: yo };
  };
  return [take(first), take(second)];
}

/**
 * Train / (validation) / test sets. Test comes from its own seed stream so it
 * does not change when nTrain changes, and a challenge test set stays hidden.
 */
export function makeSplit(id, params, { nTrain = 200, nVal = 0, nTest = 300, seed = 705 } = {}) {
  const p = { ...datasetDefaults(id), ...params };
  const filter = p.trainBelow > 0 ? (x1) => x1 < p.trainBelow : null;
  const tv = generate(id, params, nTrain + nVal, deriveSeed(seed, `${id}:trainval`), filter);
  const test = generate(id, params, nTest, deriveSeed(seed, `${id}:test`), null);
  let train = tv, val = { X: new Float64Array(0), y: new Uint8Array(0) };
  if (nVal > 0) [train, val] = stratSplit(tv.X, tv.y, nTrain, makeRng(deriveSeed(seed, 'split')));
  return { train, val, test, params: p };
}
