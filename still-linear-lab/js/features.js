// Feature transform registry: z = Φ(x₁, x₂).
//
// Each transform has a `make(params, ctx)` factory that returns
//   { cols: [{key, tex}], eval(x1, x2, out, offset) }
// Column `key`s identify identical columns so combining transforms never
// counts the same feature twice (e.g. raw + quad2 has five columns, not seven).

import { makeRng, deriveSeed } from './rng.js';
import { BOX } from './datasets.js';

const TAU = 2 * Math.PI;
const k3 = (v) => (Math.round(v * 1000) / 1000).toString();
const POS_EPS = 1e-9;

// ---- small helpers ------------------------------------------------------

function monoTex(i, j) {
  const pow = (v, e) => (e === 0 ? '' : e === 1 ? v : `${v}^{${e}}`);
  return (pow('x_1', i) + pow('x_2', j)) || '1';
}
const monoKey = (i, j) => `m${i},${j}`;

function mono(i, j) {
  return {
    family: 'poly', label: monoTex(i, j), tex: monoTex(i, j), params: {},
    make: () => ({
      cols: [{ key: monoKey(i, j), tex: monoTex(i, j) }],
      eval(x1, x2, out, o) { out[o] = Math.pow(x1, i) * Math.pow(x2, j); },
    }),
  };
}

// Unit direction (cos θ, sin θ) about a center without atan2, so there is no
// seam on the negative x-axis. Writes into the 2-array `cs`.
function polar(x1, x2, cx, cy, cs) {
  const dx = x1 - cx, dy = x2 - cy, r = Math.hypot(dx, dy);
  if (r < 1e-12) { cs[0] = 1; cs[1] = 0; } else { cs[0] = dx / r; cs[1] = dy / r; }
  return r;
}
// cos kθ, sin kθ by complex-power recurrence.
function multiAngle(c, s, k, cs) {
  let ck = 1, sk = 0;
  for (let m = 0; m < k; m++) { const t = ck * c - sk * s; sk = sk * c + ck * s; ck = t; }
  cs[0] = ck; cs[1] = sk;
}

const CENTER = {
  cx: { min: -3, max: 3, step: 0.05, default: 0, label: 'center c₁' },
  cy: { min: -3, max: 3, step: 0.05, default: 0, label: 'center c₂' },
};
const centerHandle = (p) => [{ kind: 'center', x: p.cx, y: p.cy, set: (q, x, y) => { q.cx = x; q.cy = y; } }];
const cTex = (p) => (Math.abs(p.cx) < 1e-9 && Math.abs(p.cy) < 1e-9 ? '' : '_c');
const OMEGA = (def) => ({ min: 0.2, max: 8, step: 0.01, default: def, label: 'ω' });

function viewOf(ctx) { return (ctx && ctx.view) || BOX; }

// ---- registry -----------------------------------------------------------

export const FAMILIES = [
  ['baseline', 'Baseline'],
  ['poly', 'Polynomial'],
  ['radial', 'Radial / polar'],
  ['periodic', 'Periodic (Fourier)'],
  ['rbf', 'RBF bumps'],
  ['piecewise', 'Piecewise / ReLU'],
  ['norms', 'Norms, abs, min/max'],
  ['monotone', 'Monotone / ratio'],
];

export const TRANSFORMS = {
  // Baseline
  raw: {
    family: 'baseline', label: 'raw [x₁, x₂]', tex: '[x_1,\\ x_2]', params: {},
    make: () => ({
      cols: [{ key: monoKey(1, 0), tex: 'x_1' }, { key: monoKey(0, 1), tex: 'x_2' }],
      eval(x1, x2, out, o) { out[o] = x1; out[o + 1] = x2; },
    }),
  },
  x1: { ...mono(1, 0), family: 'baseline', label: 'x₁' },
  x2: { ...mono(0, 1), family: 'baseline', label: 'x₂' },
  linmix: {
    family: 'baseline', label: 'rotate + scale', tex: '[s_1(\\cos\\alpha\\,x_1+\\sin\\alpha\\,x_2),\\ s_2(-\\sin\\alpha\\,x_1+\\cos\\alpha\\,x_2)]',
    params: {
      alpha: { min: 0, max: 180, step: 1, default: 0, label: 'rotation α (°)' },
      s1: { min: 0.25, max: 4, step: 0.05, default: 1, label: 'scale s₁' },
      s2: { min: 0.25, max: 4, step: 0.05, default: 1, label: 'scale s₂' },
    },
    make(p) {
      const a = (p.alpha * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), tag = `${k3(p.alpha)},${k3(p.s1)},${k3(p.s2)}`;
      return {
        cols: [{ key: `lin1(${tag})`, tex: 'z_1' }, { key: `lin2(${tag})`, tex: 'z_2' }],
        eval(x1, x2, out, o) { out[o] = p.s1 * (c * x1 + s * x2); out[o + 1] = p.s2 * (-s * x1 + c * x2); },
      };
    },
  },

  // Polynomial
  poly: {
    family: 'poly', label: 'polynomial, degree k', tex: '\\{x_1^i x_2^j : 1\\le i+j\\le k\\}',
    params: { k: { min: 1, max: 10, step: 1, default: 2, label: 'degree k', int: true } },
    make(p) {
      const terms = [];
      for (let d = 1; d <= p.k; d++) for (let i = d; i >= 0; i--) terms.push([i, d - i]);
      const P1 = new Float64Array(p.k + 1), P2 = new Float64Array(p.k + 1);
      return {
        cols: terms.map(([i, j]) => ({ key: monoKey(i, j), tex: monoTex(i, j) })),
        eval(x1, x2, out, o) {
          P1[0] = 1; P2[0] = 1;
          for (let e = 1; e <= p.k; e++) { P1[e] = P1[e - 1] * x1; P2[e] = P2[e - 1] * x2; }
          for (let t = 0; t < terms.length; t++) out[o + t] = P1[terms[t][0]] * P2[terms[t][1]];
        },
      };
    },
  },
  quad2: {
    family: 'poly', label: 'full quadratic', tex: '[x_1,\\ x_2,\\ x_1^2,\\ x_1x_2,\\ x_2^2]',
    params: { mask: { default: [1, 1, 1, 1, 1], hidden: true } },
    make(p) {
      const all = [[1, 0], [0, 1], [2, 0], [1, 1], [0, 2]];
      const terms = all.filter((_, t) => p.mask[t]);
      return {
        cols: terms.map(([i, j]) => ({ key: monoKey(i, j), tex: monoTex(i, j) })),
        eval(x1, x2, out, o) {
          for (let t = 0; t < terms.length; t++) out[o + t] = Math.pow(x1, terms[t][0]) * Math.pow(x2, terms[t][1]);
        },
      };
    },
  },
  x1sq: mono(2, 0),
  x2sq: mono(0, 2),
  x1x2: mono(1, 1),
  x1cube: mono(3, 0),
  x2cube: mono(0, 3),
  x1sqx2: mono(2, 1),
  x1x2sq: mono(1, 2),
  prodc: {
    family: 'poly', label: '(x₁−a)(x₂−b)', tex: '(x_1-a)(x_2-b)',
    params: { cx: { ...CENTER.cx, label: 'a' }, cy: { ...CENTER.cy, label: 'b' } },
    handles: centerHandle,
    make: (p) => ({
      cols: [{ key: `prodc(${k3(p.cx)},${k3(p.cy)})`, tex: '(x_1-a)(x_2-b)' }],
      eval(x1, x2, out, o) { out[o] = (x1 - p.cx) * (x2 - p.cy); },
    }),
  },

  // Radial / polar (all about a draggable center c)
  r: {
    family: 'radial', label: 'radius r = ‖x − c‖', tex: 'r=\\lVert x-c\\rVert', params: { ...CENTER }, handles: centerHandle,
    make: (p) => ({
      cols: [{ key: `r(${k3(p.cx)},${k3(p.cy)})`, tex: `r${cTex(p)}` }],
      eval(x1, x2, out, o) { out[o] = Math.hypot(x1 - p.cx, x2 - p.cy); },
    }),
  },
  r2: {
    family: 'radial', label: 'r² = ‖x − c‖²', tex: 'r^2', params: { ...CENTER }, handles: centerHandle,
    make: (p) => ({
      cols: [{ key: `r2(${k3(p.cx)},${k3(p.cy)})`, tex: `r${cTex(p)}^2` }],
      eval(x1, x2, out, o) { const a = x1 - p.cx, b = x2 - p.cy; out[o] = a * a + b * b; },
    }),
  },
  absr: {
    family: 'radial', label: '|r − ρ|', tex: '\\lvert r-\\rho\\rvert',
    params: { ...CENTER, rho: { min: 0, max: 3, step: 0.05, default: 1.6, label: 'ρ' } }, handles: centerHandle,
    make: (p) => ({
      cols: [{ key: `absr(${k3(p.cx)},${k3(p.cy)},${k3(p.rho)})`, tex: `\\lvert r-${k3(p.rho)}\\rvert` }],
      eval(x1, x2, out, o) { out[o] = Math.abs(Math.hypot(x1 - p.cx, x2 - p.cy) - p.rho); },
    }),
  },
  angle: {
    family: 'radial', label: '[sin θ, cos θ]', tex: '[\\sin\\theta,\\ \\cos\\theta]', params: { ...CENTER }, handles: centerHandle,
    make(p) {
      const cs = [0, 0], t = `${k3(p.cx)},${k3(p.cy)}`;
      return {
        cols: [{ key: `sin1t(${t})`, tex: '\\sin\\theta' }, { key: `cos1t(${t})`, tex: '\\cos\\theta' }],
        eval(x1, x2, out, o) { polar(x1, x2, p.cx, p.cy, cs); out[o] = cs[1]; out[o + 1] = cs[0]; },
      };
    },
  },
  unitdir: {
    family: 'radial', label: 'direction x / ‖x‖', tex: '[\\cos\\theta,\\ \\sin\\theta]', params: { ...CENTER }, handles: centerHandle,
    make(p) {
      const cs = [0, 0], t = `${k3(p.cx)},${k3(p.cy)}`;
      return {
        cols: [{ key: `cos1t(${t})`, tex: '\\cos\\theta' }, { key: `sin1t(${t})`, tex: '\\sin\\theta' }],
        eval(x1, x2, out, o) { polar(x1, x2, p.cx, p.cy, cs); out[o] = cs[0]; out[o + 1] = cs[1]; },
      };
    },
  },
  sinkt: {
    family: 'radial', label: 'sin kθ', tex: '\\sin k\\theta',
    params: { ...CENTER, k: { min: 1, max: 8, step: 1, default: 5, label: 'k', int: true } }, handles: centerHandle,
    make(p) {
      const cs = [0, 0], m = [0, 0], t = `${p.k},${k3(p.cx)},${k3(p.cy)}`;
      return {
        cols: [{ key: `sinkt(${t})`, tex: `\\sin ${p.k}\\theta` }],
        eval(x1, x2, out, o) { polar(x1, x2, p.cx, p.cy, cs); multiAngle(cs[0], cs[1], p.k, m); out[o] = m[1]; },
      };
    },
  },
  petal: {
    family: 'radial', label: '[sin kθ, cos kθ]', tex: '[\\sin k\\theta,\\ \\cos k\\theta]',
    params: { ...CENTER, k: { min: 1, max: 8, step: 1, default: 5, label: 'k', int: true } }, handles: centerHandle,
    make(p) {
      const cs = [0, 0], m = [0, 0], t = `${p.k},${k3(p.cx)},${k3(p.cy)}`;
      return {
        cols: [{ key: `sinkt(${t})`, tex: `\\sin ${p.k}\\theta` }, { key: `coskt(${t})`, tex: `\\cos ${p.k}\\theta` }],
        eval(x1, x2, out, o) { polar(x1, x2, p.cx, p.cy, cs); multiAngle(cs[0], cs[1], p.k, m); out[o] = m[1]; out[o + 1] = m[0]; },
      };
    },
  },
  spiral: {
    family: 'radial', label: 'spiral [sin(ωr−θ), cos(ωr−θ)]', tex: '[\\sin(\\omega r-\\theta),\\ \\cos(\\omega r-\\theta)]',
    params: { ...CENTER, omega: OMEGA(3), chir: { options: [{ value: 1, label: 'counter-clockwise' }, { value: -1, label: 'clockwise' }], default: 1, label: 'chirality' } },
    handles: centerHandle,
    make(p) {
      const cs = [0, 0], t = `${k3(p.omega)},${p.chir},${k3(p.cx)},${k3(p.cy)}`;
      return {
        cols: [{ key: `sinsp(${t})`, tex: '\\sin(\\omega r-\\theta)' }, { key: `cossp(${t})`, tex: '\\cos(\\omega r-\\theta)' }],
        eval(x1, x2, out, o) {
          const r = polar(x1, x2, p.cx, p.cy, cs), a = p.omega * r, sa = Math.sin(a), ca = Math.cos(a);
          const st = p.chir * cs[1]; // sin(sθ) for s = ±1
          out[o] = sa * cs[0] - ca * st;
          out[o + 1] = ca * cs[0] + sa * st;
        },
      };
    },
  },
  theta_raw: {
    family: 'radial', label: 'θ = atan2 (has a seam!)', tex: '\\theta', params: { ...CENTER }, handles: centerHandle, sandboxOnly: true,
    make: (p) => ({
      cols: [{ key: `theta(${k3(p.cx)},${k3(p.cy)})`, tex: '\\theta' }],
      eval(x1, x2, out, o) { out[o] = Math.atan2(x2 - p.cy, x1 - p.cx); },
    }),
  },

  // Periodic
  sinx1: periodic('sin', 1), cosx1: periodic('cos', 1), sinx2: periodic('sin', 2), cosx2: periodic('cos', 2),
  fourier1: {
    family: 'periodic', label: '[sin ωx₁, cos ωx₁]', tex: '[\\sin\\omega x_1,\\ \\cos\\omega x_1]', params: { w: OMEGA(1.5) },
    make: (p) => ({
      cols: [{ key: `sin1(${k3(p.w)})`, tex: `\\sin ${k3(p.w)}x_1` }, { key: `cos1(${k3(p.w)})`, tex: `\\cos ${k3(p.w)}x_1` }],
      eval(x1, x2, out, o) { out[o] = Math.sin(p.w * x1); out[o + 1] = Math.cos(p.w * x1); },
    }),
  },
  fourier2: {
    family: 'periodic', label: '[sin ωx₂, cos ωx₂]', tex: '[\\sin\\omega x_2,\\ \\cos\\omega x_2]', params: { w: OMEGA(1.5) },
    make: (p) => ({
      cols: [{ key: `sin2(${k3(p.w)})`, tex: `\\sin ${k3(p.w)}x_2` }, { key: `cos2(${k3(p.w)})`, tex: `\\cos ${k3(p.w)}x_2` }],
      eval(x1, x2, out, o) { out[o] = Math.sin(p.w * x2); out[o + 1] = Math.cos(p.w * x2); },
    }),
  },
  checker: {
    family: 'periodic', label: 'sin ωx₁ · sin ωx₂', tex: '\\sin\\omega x_1\\cdot\\sin\\omega x_2', params: { w: OMEGA(2.09) },
    make: (p) => ({
      cols: [{ key: `ss(${k3(p.w)})`, tex: '\\sin\\omega x_1\\sin\\omega x_2' }],
      eval(x1, x2, out, o) { out[o] = Math.sin(p.w * x1) * Math.sin(p.w * x2); },
    }),
  },
  checker4: {
    family: 'periodic', label: 'all 4 sin/cos products', tex: '[ss,\\ sc,\\ cs,\\ cc]', params: { w: OMEGA(2.09) },
    make(p) {
      const t = k3(p.w);
      return {
        cols: [
          { key: `ss(${t})`, tex: '\\sin\\omega x_1\\sin\\omega x_2' }, { key: `sc(${t})`, tex: '\\sin\\omega x_1\\cos\\omega x_2' },
          { key: `cs(${t})`, tex: '\\cos\\omega x_1\\sin\\omega x_2' }, { key: `cc(${t})`, tex: '\\cos\\omega x_1\\cos\\omega x_2' },
        ],
        eval(x1, x2, out, o) {
          const s1 = Math.sin(p.w * x1), c1 = Math.cos(p.w * x1), s2 = Math.sin(p.w * x2), c2 = Math.cos(p.w * x2);
          out[o] = s1 * s2; out[o + 1] = s1 * c2; out[o + 2] = c1 * s2; out[o + 3] = c1 * c2;
        },
      };
    },
  },
  rff: {
    family: 'periodic', label: 'random Fourier features', tex: '\\sqrt{2/D}\\cos(\\omega_i^\\top x+b_i)',
    params: {
      D: { min: 5, max: 300, step: 1, default: 50, label: 'D (features)', int: true },
      ell: { min: 0.1, max: 5, step: 0.01, default: 0.7, label: 'length scale ℓ', log: true },
    },
    random: true,
    make(p, ctx) {
      const rng = makeRng(deriveSeed(ctx.featureSeed ?? 1, `rff${ctx.index ?? 0}`));
      const W = new Float64Array(2 * p.D), B = new Float64Array(p.D), sc = Math.sqrt(2 / p.D);
      for (let i = 0; i < p.D; i++) { W[2 * i] = rng.normal() / p.ell; W[2 * i + 1] = rng.normal() / p.ell; B[i] = rng.range(0, TAU); }
      const tag = `${ctx.featureSeed ?? 1},${ctx.index ?? 0},${k3(p.ell)}`;
      return {
        cols: Array.from({ length: p.D }, (_, i) => ({ key: `rff(${tag}):${i}`, tex: `\\cos(\\omega_{${i + 1}}^\\top x+b_{${i + 1}})` })),
        eval(x1, x2, out, o) { for (let i = 0; i < p.D; i++) out[o + i] = sc * Math.cos(W[2 * i] * x1 + W[2 * i + 1] * x2 + B[i]); },
      };
    },
  },

  // RBF bumps
  rbf: {
    family: 'rbf', label: 'RBF bumps exp(−γ‖x − cⱼ‖²)', tex: 'e^{-\\gamma\\lVert x-c_j\\rVert^2}',
    params: {
      place: { options: [{ value: 'grid', label: 'grid' }, { value: 'random', label: 'random' }, { value: 'data', label: 'at training points' }, { value: 'manual', label: 'manual (click to add)' }], default: 'grid', label: 'landmarks' },
      m: { min: 1, max: 12, step: 1, default: 4, label: 'm (grid side / count)', int: true },
      gamma: { min: 0.01, max: 100, step: 0.01, default: 1, label: 'γ', log: true },
      pts: { default: [[0, 0]], hidden: true },
    },
    random: true,
    handles(p) {
      if (p.place !== 'manual') return [];
      return p.pts.map((c, i) => ({ kind: 'landmark', x: c[0], y: c[1], index: i, set: (q, x, y) => { q.pts = q.pts.map((d, j) => (j === i ? [x, y] : d)); } }));
    },
    make(p, ctx) {
      const C = rbfCenters(p, ctx);
      return {
        centers: C,
        cols: C.map((c, i) => ({ key: `rbf(${k3(p.gamma)},${k3(c[0])},${k3(c[1])})`, tex: `\\phi_{${i + 1}}` })),
        eval(x1, x2, out, o) {
          for (let i = 0; i < C.length; i++) { const a = x1 - C[i][0], b = x2 - C[i][1]; out[o + i] = Math.exp(-p.gamma * (a * a + b * b)); }
        },
      };
    },
  },

  // Piecewise
  bins: {
    family: 'piecewise', label: 'bins (one-hot per axis)', tex: '\\mathbb{1}[x_1\\in\\text{bin}_b],\\ \\mathbb{1}[x_2\\in\\text{bin}_b]',
    params: { B: { min: 2, max: 14, step: 1, default: 5, label: 'bins per axis B', int: true } },
    make(p, ctx) {
      const v = viewOf(ctx), B = p.B;
      const bin = (x, lo, hi) => Math.min(B - 1, Math.max(0, Math.floor(((x - lo) / (hi - lo)) * B)));
      const cols = [];
      for (let b = 1; b < B; b++) cols.push({ key: `bin1(${B}):${b}`, tex: `\\mathbb{1}[x_1\\in b_{${b + 1}}]` });
      for (let b = 1; b < B; b++) cols.push({ key: `bin2(${B}):${b}`, tex: `\\mathbb{1}[x_2\\in b_{${b + 1}}]` });
      return {
        cols,
        eval(x1, x2, out, o) {
          for (let t = 0; t < 2 * (B - 1); t++) out[o + t] = 0;
          const b1 = bin(x1, v.xmin, v.xmax), b2 = bin(x2, v.ymin, v.ymax);
          if (b1 > 0) out[o + b1 - 1] = 1;
          if (b2 > 0) out[o + B - 1 + b2 - 1] = 1;
        },
      };
    },
  },
  bins2d: {
    family: 'piecewise', label: '2-D grid cells', tex: '\\mathbb{1}[x\\in\\text{cell}_{ab}]',
    params: { B: { min: 2, max: 12, step: 1, default: 4, label: 'cells per side B', int: true } },
    make(p, ctx) {
      const v = viewOf(ctx), B = p.B;
      const bin = (x, lo, hi) => Math.min(B - 1, Math.max(0, Math.floor(((x - lo) / (hi - lo)) * B)));
      const cols = [];
      for (let c = 1; c < B * B; c++) cols.push({ key: `cell(${B}):${c}`, tex: `\\mathbb{1}[\\text{cell}_{${c + 1}}]` });
      return {
        cols,
        eval(x1, x2, out, o) {
          for (let t = 0; t < B * B - 1; t++) out[o + t] = 0;
          const c = bin(x2, v.ymin, v.ymax) * B + bin(x1, v.xmin, v.xmax);
          if (c > 0) out[o + c - 1] = 1;
        },
      };
    },
  },
  hinge: {
    family: 'piecewise', label: 'hinges max(0, x₁ − tₖ)', tex: '\\max(0,\\ x_1-t_k)',
    params: { knots: { default: [-1, 0, 1], hidden: true } },
    handles: (p) => p.knots.map((t, i) => ({ kind: 'vline', x: t, y: 0, index: i, set: (q, x) => { q.knots = q.knots.map((u, j) => (j === i ? x : u)); } })),
    make: (p) => ({
      cols: p.knots.map((t) => ({ key: `hinge(${k3(t)})`, tex: `\\max(0,x_1-${k3(t)})` })),
      eval(x1, x2, out, o) { for (let i = 0; i < p.knots.length; i++) out[o + i] = Math.max(0, x1 - p.knots[i]); },
    }),
  },
  relu: {
    family: 'piecewise', label: 'random ReLU units', tex: '\\max(0,\\ u_i^\\top(x-p_i))',
    params: { m: { min: 2, max: 200, step: 1, default: 20, label: 'units m', int: true } },
    random: true,
    make(p, ctx) {
      const v = viewOf(ctx), rng = makeRng(deriveSeed(ctx.featureSeed ?? 1, `relu${ctx.index ?? 0}`));
      const U = [], P = [];
      for (let i = 0; i < p.m; i++) {
        const t = rng.range(0, TAU);
        U.push([Math.cos(t), Math.sin(t)]);
        P.push([rng.range(v.xmin, v.xmax), rng.range(v.ymin, v.ymax)]);
      }
      const tag = `${ctx.featureSeed ?? 1},${ctx.index ?? 0}`;
      return {
        units: { U, P },
        cols: U.map((_, i) => ({ key: `relu(${tag}):${i}`, tex: `h_{${i + 1}}` })),
        eval(x1, x2, out, o) {
          for (let i = 0; i < U.length; i++) out[o + i] = Math.max(0, U[i][0] * (x1 - P[i][0]) + U[i][1] * (x2 - P[i][1]));
        },
      };
    },
  },
  cornerind: {
    family: 'piecewise', label: 'corner 𝟙[x₁>t]·𝟙[x₂>s]', tex: '\\mathbb{1}[x_1>t]\\,\\mathbb{1}[x_2>s]',
    params: { t: { min: -3, max: 3, step: 0.05, default: 0, label: 't' }, s: { min: -3, max: 3, step: 0.05, default: 0, label: 's' } },
    handles: (p) => [{ kind: 'corner', x: p.t, y: p.s, set: (q, x, y) => { q.t = x; q.s = y; } }],
    make: (p) => ({
      cols: [{ key: `corner(${k3(p.t)},${k3(p.s)})`, tex: '\\mathbb{1}[x_1>t]\\mathbb{1}[x_2>s]' }],
      eval(x1, x2, out, o) { out[o] = x1 > p.t && x2 > p.s ? 1 : 0; },
    }),
  },

  // Norms, abs, min/max
  abs1: {
    family: 'norms', label: '|x₁ − c₁|', tex: '\\lvert x_1-c_1\\rvert', params: { cx: CENTER.cx },
    make: (p) => ({ cols: [{ key: `abs1(${k3(p.cx)})`, tex: '\\lvert x_1\\rvert' }], eval(x1, x2, out, o) { out[o] = Math.abs(x1 - p.cx); } }),
  },
  abs2: {
    family: 'norms', label: '|x₂ − c₂|', tex: '\\lvert x_2-c_2\\rvert', params: { cy: CENTER.cy },
    make: (p) => ({ cols: [{ key: `abs2(${k3(p.cy)})`, tex: '\\lvert x_2\\rvert' }], eval(x1, x2, out, o) { out[o] = Math.abs(x2 - p.cy); } }),
  },
  l1: {
    family: 'norms', label: 'L1: |x₁| + |x₂|', tex: '\\lvert x_1\\rvert+\\lvert x_2\\rvert', params: { ...CENTER }, handles: centerHandle,
    make: (p) => ({ cols: [{ key: `l1(${k3(p.cx)},${k3(p.cy)})`, tex: '\\lVert x\\rVert_1' }], eval(x1, x2, out, o) { out[o] = Math.abs(x1 - p.cx) + Math.abs(x2 - p.cy); } }),
  },
  linf: {
    family: 'norms', label: 'L∞: max(|x₁|, |x₂|)', tex: '\\max(\\lvert x_1\\rvert,\\lvert x_2\\rvert)', params: { ...CENTER }, handles: centerHandle,
    make: (p) => ({ cols: [{ key: `linf(${k3(p.cx)},${k3(p.cy)})`, tex: '\\lVert x\\rVert_\\infty' }], eval(x1, x2, out, o) { out[o] = Math.max(Math.abs(x1 - p.cx), Math.abs(x2 - p.cy)); } }),
  },
  minx: {
    family: 'norms', label: 'min(x₁, x₂)', tex: '\\min(x_1,x_2)', params: {},
    make: () => ({ cols: [{ key: 'min', tex: '\\min(x_1,x_2)' }], eval(x1, x2, out, o) { out[o] = Math.min(x1, x2); } }),
  },
  maxx: {
    family: 'norms', label: 'max(x₁, x₂)', tex: '\\max(x_1,x_2)', params: {},
    make: () => ({ cols: [{ key: 'max', tex: '\\max(x_1,x_2)' }], eval(x1, x2, out, o) { out[o] = Math.max(x1, x2); } }),
  },

  // Monotone / ratio
  log1: {
    family: 'monotone', label: 'log x₁', tex: '\\log x_1', params: {}, domain: 'positive',
    make: () => ({ cols: [{ key: 'log1', tex: '\\log x_1' }], eval(x1, x2, out, o) { out[o] = Math.log(Math.max(x1, POS_EPS)); } }),
  },
  log2: {
    family: 'monotone', label: 'log x₂', tex: '\\log x_2', params: {}, domain: 'positive',
    make: () => ({ cols: [{ key: 'log2', tex: '\\log x_2' }], eval(x1, x2, out, o) { out[o] = Math.log(Math.max(x2, POS_EPS)); } }),
  },
  exp1: {
    family: 'monotone', label: 'exp(x₁)', tex: 'e^{x_1}', params: {},
    make: () => ({ cols: [{ key: 'exp1', tex: 'e^{x_1}' }], eval(x1, x2, out, o) { out[o] = Math.exp(Math.min(x1, 50)); } }),
  },
  sig1: {
    family: 'monotone', label: 'sigmoid((x₁ − t)/s)', tex: '\\sigma\\!\\left(\\tfrac{x_1-t}{s}\\right)',
    params: { t: { min: -3, max: 3, step: 0.05, default: 0, label: 't' }, s: { min: 0.1, max: 2, step: 0.05, default: 0.5, label: 's' } },
    make: (p) => ({ cols: [{ key: `sig1(${k3(p.t)},${k3(p.s)})`, tex: '\\sigma(\\cdot)' }], eval(x1, x2, out, o) { out[o] = 1 / (1 + Math.exp(-(x1 - p.t) / p.s)); } }),
  },
  ratio: {
    family: 'monotone', label: 'ratio x₂ / x₁', tex: 'x_2/x_1', params: {}, domain: 'positive',
    make: () => ({ cols: [{ key: 'ratio', tex: 'x_2/x_1' }], eval(x1, x2, out, o) { out[o] = x2 / Math.max(x1, POS_EPS); } }),
  },
};

function periodic(fn, axis) {
  const f = fn === 'sin' ? Math.sin : Math.cos;
  return {
    family: 'periodic', label: `${fn} ωx${axis === 1 ? '₁' : '₂'}`, tex: `\\${fn}\\omega x_${axis}`, params: { w: OMEGA(1.5) },
    make: (p) => ({
      cols: [{ key: `${fn}${axis}(${k3(p.w)})`, tex: `\\${fn} ${k3(p.w)}x_${axis}` }],
      eval(x1, x2, out, o) { out[o] = f(p.w * (axis === 1 ? x1 : x2)); },
    }),
  };
}

export function rbfCenters(p, ctx) {
  const v = viewOf(ctx);
  if (p.place === 'manual') return p.pts.map((c) => [c[0], c[1]]);
  if (p.place === 'data') {
    const X = (ctx && ctx.Xtrain) || new Float64Array(0), C = [];
    for (let i = 0; i < X.length; i += 2) C.push([X[i], X[i + 1]]);
    return C;
  }
  if (p.place === 'random') {
    const rng = makeRng(deriveSeed(ctx.featureSeed ?? 1, `rbf${ctx.index ?? 0}`));
    return Array.from({ length: p.m }, () => [rng.range(v.xmin, v.xmax), rng.range(v.ymin, v.ymax)]);
  }
  const C = [], m = p.m, pad = (v.xmax - v.xmin) / (2 * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    C.push([v.xmin + pad + (i * (v.xmax - v.xmin - 2 * pad)) / Math.max(1, m - 1), v.ymin + pad + (j * (v.ymax - v.ymin - 2 * pad)) / Math.max(1, m - 1)]);
  }
  if (m === 1) return [[(v.xmin + v.xmax) / 2, (v.ymin + v.ymax) / 2]];
  return C;
}

for (const [id, T] of Object.entries(TRANSFORMS)) T.id = id;

export function paramDefaults(id) {
  const out = {};
  for (const [k, s] of Object.entries(TRANSFORMS[id].params)) out[k] = Array.isArray(s.default) ? s.default.map((v) => (Array.isArray(v) ? v.slice() : v)) : s.default;
  return out;
}

export function resolveParams(spec) {
  return { ...paramDefaults(spec.id), ...(spec.params || {}) };
}

/**
 * Compose transforms into one feature map.
 * specs: [{id, params}]; ctx: {Xtrain, view, featureSeed}
 */
export function buildFeatureMap(specs, ctx = {}) {
  const parts = [], columns = [], seen = new Set();
  let maxW = 1;
  specs.forEach((spec, index) => {
    const T = TRANSFORMS[spec.id];
    if (!T) throw new Error(`unknown transform ${spec.id}`);
    const p = resolveParams(spec);
    const inst = T.make(p, { ...ctx, index });
    const keep = [];
    inst.cols.forEach((c, k) => {
      if (!seen.has(c.key)) { seen.add(c.key); keep.push(k); columns.push({ ...c, specIndex: index }); }
    });
    maxW = Math.max(maxW, inst.cols.length);
    parts.push({ inst, keep, width: inst.cols.length, spec, p });
  });
  const tmp = new Float64Array(maxW);
  const dim = columns.length;
  return {
    dim,
    columns,
    parts,
    structure: specs.map((s) => s.id).join('|') + `#${dim}`,
    positiveOnly: specs.some((s) => TRANSFORMS[s.id].domain === 'positive'),
    evalRow(x1, x2, out) {
      let pos = 0;
      for (let q = 0; q < parts.length; q++) {
        const P = parts[q];
        if (P.keep.length === P.width) { P.inst.eval(x1, x2, out, pos); pos += P.width; continue; }
        P.inst.eval(x1, x2, tmp, 0);
        for (let k = 0; k < P.keep.length; k++) out[pos++] = tmp[P.keep[k]];
      }
      return out;
    },
  };
}

export function designMatrix(fmap, X) {
  const N = X.length / 2, d = fmap.dim, Z = new Float64Array(N * d), row = new Float64Array(Math.max(1, d));
  for (let i = 0; i < N; i++) {
    fmap.evalRow(X[2 * i], X[2 * i + 1], row);
    Z.set(row.subarray(0, d), i * d);
  }
  return Z;
}

// Column means / sds (sd floored to 1 for constant columns).
export function fitStandardizer(Z, N, d) {
  const mu = new Float64Array(d), sd = new Float64Array(d);
  if (N === 0) { sd.fill(1); return { mu, sd }; }
  for (let i = 0; i < N; i++) for (let j = 0; j < d; j++) mu[j] += Z[i * d + j];
  for (let j = 0; j < d; j++) mu[j] /= N;
  for (let i = 0; i < N; i++) for (let j = 0; j < d; j++) { const t = Z[i * d + j] - mu[j]; sd[j] += t * t; }
  for (let j = 0; j < d; j++) { sd[j] = Math.sqrt(sd[j] / N); if (!(sd[j] > 1e-12)) sd[j] = 1; }
  return { mu, sd };
}

export function standardize(Z, N, d, { mu, sd }) {
  const out = new Float64Array(N * d);
  for (let i = 0; i < N; i++) for (let j = 0; j < d; j++) out[i * d + j] = (Z[i * d + j] - mu[j]) / sd[j];
  return out;
}

// Weights for standardized features -> weights for raw features (same logits).
export function foldWeights(w, { mu, sd }) {
  const d = mu.length, out = new Float64Array(d + 1);
  out[0] = w[0];
  for (let j = 0; j < d; j++) { out[j + 1] = w[j + 1] / sd[j]; out[0] -= (w[j + 1] * mu[j]) / sd[j]; }
  return out;
}

export function featureCount(specs, ctx) {
  return buildFeatureMap(specs, ctx).dim;
}
