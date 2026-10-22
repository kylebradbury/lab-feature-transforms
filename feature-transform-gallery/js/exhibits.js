// The exhibits. Each pairs one dataset with one representation z = Φ(x) and
// says, in a few sentences, what Φ does to the plane and where it is used.
// The model is always the same: logistic regression on z.
//
// knobs: sliders, each {key, label, min, max, step, default, int?, log?, hint?}.
// k is an object of their values ({} without knobs); features(k) returns
// feature specs for features.js, and every text field may be a function of k.
// defs(k): footnote definitions of every function and symbol in Φ.
// chosen(k): what in Φ was set by hand rather than fit (see CHOSEN below).
// terms(fc, k): optional, each feature written out in x (TeX), with the fitted
// numbers (landmarks, hinges, bin edges); otherwise the features' own TeX.
// featureName(j): optional name of feature j, e.g. h_j(x) for hinges.
// tilePhi(k): optional shorter Φ for the hall tile, when phi is too long to fit.
// zAxis(k): names of the feature-space axes (plain text) when there are one or two features.
// view: the original-space box, when not the dataset's own.
// collapse: Φ squeezes the plane onto a curve (or onto points), or wraps it
// around many times, so the shaded original space fades out early in the morph.
// jumps: Φ is discontinuous, so the plane tears apart at every jump.

import { spiralOmega } from './datasets.js';

export const RAW = [{ id: 'raw', params: {} }];

const EDGE_HOW = 'With more than two features, feature space cannot be drawn directly, so this view looks at it <b>edge-on</b>: the horizontal axis is the one direction the model uses, so the flat boundary appears as a vertical line. The vertical axis is another direction in which the points spread out.';

// The indicator function's 𝟙 (KaTeX's \mathbb has no digits, so it would print a plain 1).
const IND = '\\text{𝟙}';

// ---- definitions shared by several exhibits (HTML with \( \) math) ----
const D = {
  x: '\\(x = (x_1, x_2)\\): a point; \\(x_1\\) is its horizontal and \\(x_2\\) its vertical coordinate.',
  square: '\\(a^2 = a \\cdot a\\): the square of a number. It is never negative, and \\(a\\) and \\(-a\\) have the same square.',
  product: '\\(x_1x_2 = x_1 \\cdot x_2\\): the product of the two coordinates. It is positive when they have the same sign and negative when their signs differ.',
  r: '\\(r = \\lVert x\\rVert = \\sqrt{x_1^2 + x_2^2}\\): the distance from \\(x\\) to the center \\((0, 0)\\).',
  theta: '\\(\\theta = \\operatorname{atan2}(x_2, x_1)\\): the angle of \\(x\\) in radians, measured counter-clockwise from the positive \\(x_1\\)-axis (atan2 is the arctangent of \\(x_2/x_1\\), adjusted to the quadrant of \\(x\\), so it runs from \\(-\\pi\\) to \\(\\pi\\)). It comes straight from the inputs: \\(\\cos\\theta = x_1/r\\) and \\(\\sin\\theta = x_2/r\\), with \\(r = \\sqrt{x_1^2 + x_2^2}\\).',
  sincos: '\\(\\sin a\\) and \\(\\cos a\\): the vertical and horizontal coordinates of the point at angle \\(a\\) (in radians) on the circle of radius 1. Both stay between −1 and 1 and repeat every \\(2\\pi\\).',
  abs: '\\(\\lvert a\\rvert\\): the absolute value, \\(a\\) with its sign removed: \\(\\lvert -2\\rvert = \\lvert 2\\rvert = 2\\).',
  minmax: '\\(\\min(a, b)\\): the smaller of \\(a\\) and \\(b\\). \\(\\max(a, b)\\): the larger.',
  log: '\\(\\log\\): the natural logarithm (base \\(e \\approx 2.718\\)), defined only for positive numbers. It turns products into sums and powers into products: \\(\\log(ab) = \\log a + \\log b\\) and \\(\\log a^p = p\\log a\\).',
  exp: '\\(e^{a} = \\exp(a)\\): the exponential function. \\(e^{0} = 1\\), and \\(e^{a}\\) shrinks toward 0 as \\(a\\) becomes more negative.',
  sqdist: '\\(\\lVert x - c\\rVert^2 = (x_1 - c_1)^2 + (x_2 - c_2)^2\\): the squared distance from \\(x\\) to a landmark \\(c = (c_1, c_2)\\).',
  rbf: 'Radial basis function (RBF): a feature \\(e^{-\\gamma\\lVert x - c\\rVert^2}\\) that depends only on the distance from \\(x\\) to its center \\(c\\) (the landmark). It is 1 at the center and falls toward 0 farther away, so it looks like a bump; this Gaussian form is the most common RBF.',
  gamma: '\\(\\gamma > 0\\): the width parameter of the RBF. An RBF falls to half its height at distance \\(\\sqrt{\\ln 2/\\gamma}\\) from its center, so a larger \\(\\gamma\\) gives narrower RBFs.',
  hinge: '\\(\\max(0, a)\\): \\(a\\) when \\(a\\) is positive, and 0 otherwise. This is the ReLU (rectified linear unit); its graph is shaped like a hinge.',
  dot: '\\(u_j^\\top x = u_{j1}x_1 + u_{j2}x_2\\): a weighted sum of the inputs (a dot product).',
  indicator: `\\(${IND}[\\text{condition}]\\): the indicator function. It equals 1 when the condition is true and 0 when it is false; for example, \\(${IND}[x_1 \\ge 2]\\) is 1 at \\(x_1 = 2.5\\) and 0 at \\(x_1 = 1\\).`,
};

// sin kθ as a polynomial in c = cos θ = x₁/r and s = sin θ = x₂/r (TeX):
// sin kθ = Σ over odd j of (−1)^((j−1)/2) C(k, j) c^(k−j) s^j.
export function sinMultiple(k) {
  const binom = (n, j) => { let b = 1; for (let i = 1; i <= j; i++) b = (b * (n - i + 1)) / i; return b; };
  const pw = (v, e) => (e === 0 ? '' : e === 1 ? v : `${v}^${e}`);
  let out = '';
  for (let j = 1; j <= k; j += 2) {
    const coef = binom(k, j), neg = ((j - 1) / 2) % 2 === 1;
    out += `${out ? (neg ? ' - ' : ' + ') : neg ? '-' : ''}${coef === 1 ? '' : coef}${pw('c', k - j)}${pw('s', j)}`;
  }
  return out;
}

// ---- writing features out with their fitted numbers ----
const n2 = (v) => String(+Math.abs(v).toFixed(2));
const first = (v) => `${v <= -0.005 ? '-' : ''}${n2(v)}`;
const then = (v) => `${v <= -0.005 ? '-' : '+'} ${n2(v)}`;
const sq = (x, c) => (Math.abs(c) < 0.005 ? `${x}^2` : `(${x} ${c > 0 ? '-' : '+'} ${n2(c)})^2`);

// RBF features: their width γ and centers (landmarks).
export function bumpParts(fc) {
  const part = fc.model.prep.fmap.parts[0];
  return { gamma: part.p.gamma, centers: part.inst.centers };
}
const bumpTex = (fc) => {
  const { gamma, centers } = bumpParts(fc);
  return centers.map(([a, b]) => `\\exp\\!\\big({-${n2(gamma)}}\\,[${sq('x_1', a)} + ${sq('x_2', b)}]\\big)`);
};
// Hinge h_j(x) = max(0, a x₁ + b x₂ + c), from max(0, u·(x − p)) in features.js.
export function hingeParts(fc) {
  const { U, P } = fc.model.prep.fmap.parts[0].inst.units;
  return U.map((u, j) => ({ a: u[0], b: u[1], c: -(u[0] * P[j][0] + u[1] * P[j][1]) }));
}
const hingeTex = (fc) => hingeParts(fc).map(({ a, b, c }) => `\\max(0,\\ ${first(a)}x_1 ${then(b)}x_2 ${then(c)})`);
// Bin features, in column order: x₁'s bins 2..B, then x₂'s. hi = null for the last bin (no upper edge).
export function binParts(fc) {
  const B = fc.model.prep.fmap.parts[0].p.B, v = fc.view, out = [];
  for (const [axis, lo, hi] of [[1, v.xmin, v.xmax], [2, v.ymin, v.ymax]]) {
    const w = (hi - lo) / B;
    for (let b = 1; b < B; b++) out.push({ axis, lo: lo + b * w, hi: b === B - 1 ? null : lo + (b + 1) * w });
  }
  return out;
}
const binTex = (fc) => binParts(fc).map(({ axis, lo, hi }) =>
  (hi === null ? `${IND}[x_${axis} \\ge ${first(lo)}]` : `${IND}[${first(lo)} \\le x_${axis} < ${first(hi)}]`));

export const WINGS = [
  { id: 'designed', name: 'Designed features', blurb: 'Each representation was chosen by looking at the data, and so were its parameters (frequencies, centers, landmarks): they are set by hand, not fit. One or two features are enough.' },
  { id: 'generic', name: 'Basis expansions', blurb: 'Many basis functions of one family (polynomial terms, radial basis functions, ReLU units, bin indicators), chosen without looking at the data. They can draw almost anything, at a price: many features, and weights that are hard to interpret.' },
];

export const EXHIBITS = [
  {
    id: 'line', wing: 'designed', family: 'Raw inputs', name: 'Straight line', shape: 'a straight line',
    ds: 'blobs', params: {},
    features: () => RAW,
    phi: '\\Phi(x) = [\\,x_1,\\ x_2\\,]',
    zAxis: () => ['x₁', 'x₂'],
    lead: 'The raw inputs, unchanged. On its own, a linear model can only draw a straight line.',
    how: 'Φ does nothing here, so feature space is the original space and nothing moves. Every other exhibit uses this same model; only its inputs change.',
    defs: () => [D.x, 'Here the features are the inputs themselves: \\(z_1 = x_1\\) and \\(z_2 = x_2\\).'],
  },
  {
    id: 'circle', wing: 'designed', family: 'Squared terms', name: 'Circle', shape: 'a circle',
    ds: 'circles', params: {},
    features: () => [{ id: 'x1sq' }, { id: 'x2sq' }],
    phi: '\\Phi(x) = [\\,x_1^2,\\ x_2^2\\,]',
    zAxis: () => ['x₁²', 'x₂²'],
    lead: 'Square each coordinate, and a straight line in the new features becomes a circle.',
    how: 'Squaring forgets the sign: x and −x land in the same place, so the plane folds twice and all four quadrants pile onto one. The circle x₁² + x₂² = R² becomes the straight line z₁ + z₂ = R².',
    defs: () => [D.x, D.square],
  },
  {
    id: 'parabola', wing: 'designed', family: 'Squared term', name: 'Parabola', shape: 'a parabola',
    ds: 'parabola', params: {},
    features: () => [{ id: 'x1sq' }, { id: 'x2' }],
    phi: '\\Phi(x) = [\\,x_1^2,\\ x_2\\,]',
    zAxis: () => ['x₁²', 'x₂'],
    lead: 'Square just one coordinate to bend the line into a parabola.',
    how: 'Only x₁ is squared, so the plane folds once, along the vertical axis, and the left half lands on top of the right. The parabola x₂ = a·x₁² + c becomes the straight line z₂ = a·z₁ + c.',
    defs: () => [D.x, D.square],
  },
  {
    id: 'hyperbola', wing: 'designed', family: 'Interaction term', name: 'Hyperbola', shape: 'a hyperbola',
    ds: 'xor', params: {},
    features: () => [{ id: 'x1' }, { id: 'x1x2' }],
    phi: '\\Phi(x) = [\\,x_1,\\ x_1x_2\\,]',
    zAxis: () => ['x₁', 'x₁x₂'],
    lead: 'Multiply the two coordinates: the sign of the product tells which pair of opposite quadrants a point is in.',
    how: 'Keeping x₁ and adding the product x₁x₂ flips the left half of the plane upside down and pinches it toward the middle. Opposite quadrants end up on the same side of the line z₂ = 0, and that line is the whole boundary.',
    defs: () => [D.x, D.product],
  },
  {
    id: 'ring', wing: 'designed', family: 'Radius', name: 'Ring', shape: 'two circles (a ring)', collapse: true,
    ds: 'ring', params: {},
    features: () => [{ id: 'r' }, { id: 'r2' }],
    phi: '\\Phi(x) = [\\,r,\\ r^2\\,],\\quad r = \\lVert x\\rVert',
    zAxis: () => ['r', 'r²'],
    lead: 'The distance from the center, and its square: one straight line now cuts out a ring.',
    how: 'The distance r forgets which way each point lies, so the whole plane collapses onto the curve z₂ = z₁². A straight line crosses that curve twice, at two distances, so in the original space the boundary is two circles.',
    defs: () => [D.r, '\\(r^2 = x_1^2 + x_2^2\\): the squared distance from the center.'],
  },
  {
    id: 'flower', wing: 'designed', family: 'Radius and angle', name: 'Flower', shape: ({ k }) => `a flower with ${k} petals`, collapse: true,
    ds: 'flower', params: {},
    features: ({ k }) => [{ id: 'r' }, { id: 'sinkt', params: { k } }],
    knobs: [{ key: 'k', label: 'Petals in the feature, k', min: 2, max: 8, step: 1, default: 5, int: true, hint: 'The data has 5 petals. Try a feature with a different number.' }],
    phi: ({ k }) => `\\Phi(x) = [\\,r,\\ \\sin ${k}\\theta\\,]`,
    zAxis: ({ k }) => ['r', `sin ${k}θ`],
    lead: 'The distance plus a wave that runs around the center: the boundary grows petals.',
    how: ({ k }) => `θ is the direction of x. Walking once around the center, sin ${k}θ goes up and down ${k} times, so the plane wraps ${k} times around onto a strip. The flower r = c + a·sin ${k}θ becomes the straight line z₁ = c + a·z₂.`,
    defs: ({ k }) => [D.r, D.theta, D.sincos, `\\(\\sin ${k}\\theta\\): the sine of ${k} times the angle. It goes through ${k} full cycles as \\(\\theta\\) goes once around the center. Written in the inputs, with \\(c = x_1/r\\) and \\(s = x_2/r\\): \\(\\sin ${k}\\theta = ${sinMultiple(k)}\\).`],
  },
  {
    id: 'spiral', wing: 'designed', family: 'Radius and angle', name: 'Spiral', shape: 'two interlocking spirals', collapse: true,
    ds: 'spirals', params: {},
    features: ({ turns }) => [{ id: 'spiral', params: { omega: spiralOmega(turns) } }],
    knobs: [{ key: 'turns', label: 'Turns the feature assumes', min: 0.5, max: 3, step: 0.25, default: 2, hint: 'The data turns twice. Try a feature that assumes a different number of turns.' }],
    phi: '\\Phi(x) = [\\,\\sin(\\omega r-\\theta),\\ \\cos(\\omega r-\\theta)\\,]',
    zAxis: () => ['sin(ωr − θ)', 'cos(ωr − θ)'],
    lead: 'Two features that turn with the distance untangle a pair of interlocking spirals.',
    how: 'Each point moves onto a circle, at the angle ωr − θ. Along one arm of a spiral that angle stays the same, so each arm shrinks to one spot, and the two arms land on opposite sides of the circle. A straight line between them is the whole boundary.',
    defs: ({ turns }) => [D.r, D.theta, D.sincos,
      'Written in the inputs, with \\(r = \\sqrt{x_1^2 + x_2^2}\\): \\(\\sin(\\omega r - \\theta) = (x_1\\sin\\omega r - x_2\\cos\\omega r)/r\\) and \\(\\cos(\\omega r - \\theta) = (x_1\\cos\\omega r + x_2\\sin\\omega r)/r\\), from \\(\\cos\\theta = x_1/r\\) and \\(\\sin\\theta = x_2/r\\).',
      `\\(\\omega\\): how fast the angle turns with the distance. A feature that assumes \\(T\\) turns out to radius 2.8 (the edge of the spirals) uses \\(\\omega = 2\\pi T/2.8\\); here \\(T = ${turns}\\), so \\(\\omega \\approx ${spiralOmega(turns).toFixed(2)}\\).`],
  },
  {
    id: 'wedge', wing: 'designed', family: 'Angle', name: 'Wedge', shape: 'a wedge (two rays from the center)', collapse: true,
    ds: 'wedge', params: { t1: 60, t2: 120, noise: 0.02 },
    features: () => [{ id: 'unitdir' }],
    phi: '\\Phi(x) = \\frac{x}{\\lVert x\\rVert} = [\\,\\cos\\theta,\\ \\sin\\theta\\,]',
    zAxis: () => ['cos θ', 'sin θ'],
    lead: 'Keep only the direction of each point and forget its length: a slice of pie becomes easy.',
    how: 'Dividing x by its length slides every point straight in or out onto the unit circle. The slice becomes an arc of that circle, and a straight line (a chord) cuts the arc off.',
    defs: () => [D.r, D.theta, D.sincos, '\\(x/\\lVert x\\rVert\\): \\(x\\) divided by its own length, the point at distance 1 from the center in the same direction as \\(x\\). Its coordinates come straight from the inputs: \\(\\big(x_1/\\sqrt{x_1^2 + x_2^2},\\ x_2/\\sqrt{x_1^2 + x_2^2}\\big) = (\\cos\\theta,\\ \\sin\\theta)\\).'],
  },
  {
    id: 'wave', wing: 'designed', family: 'Sine', name: 'Wave', shape: 'a sine wave',
    ds: 'sine', params: { ph: 0, w: 2, A: 1.5 },
    features: ({ w }) => [{ id: 'sinx1', params: { w } }, { id: 'x2' }],
    knobs: [{ key: 'w', label: 'Frequency in the feature, ω', min: 0.5, max: 4, step: 0.05, default: 2, hint: 'The data’s wave has ω = 2.' }],
    phi: ({ w }) => `\\Phi(x) = [\\,\\sin ${+w.toFixed(2)}x_1,\\ x_2\\,]`,
    zAxis: ({ w }) => [`sin ${+w.toFixed(2)}x₁`, 'x₂'],
    lead: 'The sine of one coordinate turns a straight line into a wave.',
    how: 'As x₁ increases, sin ωx₁ swings back and forth between −1 and 1, so the plane folds like an accordion onto a narrow strip. The wave x₂ = A·sin ωx₁ becomes the straight line z₂ = A·z₁.',
    defs: ({ w }) => [D.sincos, `\\(\\sin ${+w.toFixed(2)}x_1\\): the sine of \\(${+w.toFixed(2)}\\) times \\(x_1\\), here with frequency \\(\\omega = ${+w.toFixed(2)}\\). It repeats every \\(2\\pi/\\omega \\approx ${(2 * Math.PI / w).toFixed(2)}\\) units of \\(x_1\\).`],
  },
  {
    id: 'checker', wing: 'designed', family: 'Product of sines', name: 'Checkerboard', shape: 'a checkerboard',
    ds: 'checker', params: {},
    features: () => [{ id: 'checker', params: { w: Math.PI / 1.5 } }],
    phi: '\\Phi(x) = \\sin\\omega x_1 \\cdot \\sin\\omega x_2',
    zAxis: () => ['sin ωx₁ · sin ωx₂', 'x₂ (not used by the model)'],
    lead: 'One feature, the product of two waves, matches a checkerboard.',
    how: 'sin ωx₁ · sin ωx₂ is positive on half of the squares and negative on the others. Each point becomes a single number, and one cut at 0 separates the colors. (The vertical axis is x₂, kept only to spread the points out; the model does not use it.)',
    defs: () => [D.sincos, '\\(\\omega = \\pi/1.5 \\approx 2.09\\): each square of the board is 1.5 units wide, and \\(\\sin\\omega x_1\\) changes sign every 1.5 units of \\(x_1\\) (likewise \\(\\sin\\omega x_2\\) for \\(x_2\\)).', '\\(\\cdot\\): multiplication. The product is positive when the two sines have the same sign.'],
  },
  {
    id: 'diamond', wing: 'designed', family: 'Absolute values', name: 'Diamond', shape: 'a diamond',
    ds: 'normball', params: { p: 1 },
    features: () => [{ id: 'abs1' }, { id: 'abs2' }],
    phi: '\\Phi(x) = [\\,\\lvert x_1\\rvert,\\ \\lvert x_2\\rvert\\,]',
    zAxis: () => ['|x₁|', '|x₂|'],
    lead: 'Absolute values turn a straight line into a diamond.',
    how: 'Like squaring, |x| forgets the sign and folds all four quadrants onto one, but it does not stretch distances. The diamond |x₁| + |x₂| = R becomes the straight line z₁ + z₂ = R. The Circle exhibit makes the same fold, but there the squares bend the edges round.',
    defs: () => [D.x, D.abs],
  },
  {
    id: 'corner', wing: 'designed', family: 'Min and max', name: 'Corner', shape: 'an L-shaped corner',
    ds: 'corner', params: { t: -1, s: -1 },
    features: () => [{ id: 'minx' }, { id: 'maxx' }],
    phi: '\\Phi(x) = [\\,\\min(x_1,x_2),\\ \\max(x_1,x_2)\\,]',
    zAxis: () => ['min(x₁, x₂)', 'max(x₁, x₂)'],
    lead: 'Sort the two coordinates: the smaller one draws an L-shaped corner.',
    how: 'Putting the smaller coordinate first folds the plane along the diagonal x₁ = x₂, so every point lands above it. “Both coordinates above −1” becomes “the smaller coordinate is above −1”: the straight line z₁ = −1.',
    defs: () => [D.x, D.minmax],
  },
  {
    id: 'powerlaw', wing: 'designed', family: 'Logarithms', name: 'Power law', shape: 'a power-law curve',
    ds: 'loans', params: { incSd: 1, pw: 0.3, spread: 0.25, noise: 0 },
    view: { xmin: 0, xmax: 400, ymin: 0, ymax: 120 },
    features: () => [{ id: 'log1' }, { id: 'log2' }],
    phi: '\\Phi(x) = [\\,\\log x_1,\\ \\log x_2\\,]',
    zAxis: () => ['log income', 'log loan'],
    lead: 'Take logarithms of skewed, positive numbers, and a curve becomes a straight line.',
    how: 'Most incomes and loans are small and a few are large, so the points crowd into one corner. Logarithms spread out the small values and squeeze the large ones. Approved loans lie below the curve loan = k·incomeᵖ, which becomes the straight line log loan = log k + p·log income.',
    defs: () => ['\\(x_1\\): income and \\(x_2\\): loan amount, both in thousands of dollars.', D.log, '\\(k\\) and \\(p\\): the two constants of the approval curve \\(\\text{loan} = k\\cdot\\text{income}^p\\).'],
  },
  {
    id: 'islands', wing: 'designed', family: 'Radial basis functions', name: 'Islands', shape: 'two separate islands',
    ds: 'islands', params: {},
    features: ({ gamma }) => [{ id: 'rbf', params: { place: 'manual', pts: [[-1.3, 0.9], [1.2, -1.0]], gamma } }],
    knobs: [{ key: 'gamma', label: 'RBF width parameter, γ', min: 0.1, max: 5, step: 0.05, default: 1, log: true, hint: 'Small γ: wide RBFs. Large γ: narrow RBFs.' }],
    phi: '\\Phi(x) = [\\,e^{-\\gamma\\lVert x-c_1\\rVert^2},\\ e^{-\\gamma\\lVert x-c_2\\rVert^2}\\,]',
    zAxis: () => ['closeness to c₁', 'closeness to c₂'],
    terms: bumpTex,
    lead: 'Measure how close each point is to two landmarks: one linear model draws two separate islands.',
    how: 'Each feature is a radial basis function (RBF), a bump centered on a landmark (◆): 1 at the landmark and close to 0 far away. Points near the first landmark move toward (1, 0), points near the second toward (0, 1), and everything else piles up near (0, 0). A straight line cuts off that corner.',
    defs: () => [D.rbf, D.exp, D.sqdist, '\\(c_1 = (-1.3,\\ 0.9)\\) and \\(c_2 = (1.2,\\ -1.0)\\): the two landmarks (◆), at the centers of the islands.', D.gamma],
  },

  // ---- basis expansions ----
  {
    id: 'poly3', wing: 'generic', family: 'Polynomial', name: 'Wiggly curve', shape: ({ deg }) => `a curve of degree ${deg}`,
    ds: 'moons', params: { noise: 0.15 },
    features: ({ deg }) => [{ id: 'poly', params: { k: deg } }],
    knobs: [{ key: 'deg', label: 'Degree', min: 1, max: 6, step: 1, default: 3, int: true, hint: 'Degree 1 is the raw features again.' }],
    phi: ({ deg }) => `\\Phi(x) = [\\,x_1^i x_2^j : 1 \\le i + j \\le ${deg}\\,]`,
    lead: 'Every power and product of x₁ and x₂ up to degree 3: nine features, chosen without looking at the data.',
    how: EDGE_HOW,
    defs: ({ deg }) => {
      const all = [];
      for (let s = 1; s <= deg; s++) for (let i = s; i >= 0; i--) all.push([i, s - i]);
      const mono = ([i, j]) => `${i ? `x_1${i > 1 ? `^${i}` : ''}` : ''}${j ? `x_2${j > 1 ? `^${j}` : ''}` : ''}`;
      return [D.x, `\\(x_1^i x_2^j\\): \\(x_1\\) multiplied by itself \\(i\\) times, times \\(x_2\\) multiplied by itself \\(j\\) times (and \\(a^0 = 1\\)). Each pair with \\(1 \\le i + j \\le ${deg}\\) gives one feature, ${all.length} in all: \\(${all.map(mono).join(',\\ ')}\\).`];
    },
  },
  {
    id: 'rbf', wing: 'generic', family: 'Radial basis functions', name: 'Heart', shape: 'a heart',
    ds: 'heart', params: {},
    features: ({ m, gamma }) => [{ id: 'rbf', params: { place: 'grid', m, gamma } }],
    knobs: [
      { key: 'm', label: 'RBF centers per side of the grid, m', min: 1, max: 8, step: 1, default: 7, int: true, hint: 'm × m RBFs in all. With 3 × 3 = 9 or fewer, every RBF is written out in the equations below.' },
      { key: 'gamma', label: 'RBF width parameter, γ', min: 0.2, max: 8, step: 0.05, default: 1.5, log: true, hint: 'Small γ: wide, smooth RBFs. Large γ: narrow RBFs that only respond near their own center.' },
    ],
    phi: ({ m }) => `\\Phi(x) = [\\,e^{-\\gamma\\lVert x-c_j\\rVert^2} : j = 1,\\dots,${m * m}\\,]`,
    zAxis: ({ m }) => (m === 1 ? ['closeness to c₁', 'x₂ (not used by the model)'] : null),
    terms: bumpTex,
    lead: ({ m }) => `${m * m} radial basis function${m === 1 ? '' : 's'} (RBF${m === 1 ? '' : 's'}), bumps centered on the landmarks of a ${m} × ${m} grid (◆). With enough of them, RBFs can trace almost any outline.`,
    how: EDGE_HOW,
    defs: ({ m }) => [D.rbf, D.exp, D.sqdist, `\\(c_j\\): the center of RBF \\(j\\), landmark \\(j\\) (◆). The ${m * m} landmarks sit on a ${m} × ${m} grid spread evenly over the plot.`, D.gamma],
  },
  {
    id: 'relu', wing: 'generic', family: 'ReLU units', name: 'Straight pieces', shape: 'a curve made of straight pieces',
    ds: 'spirals', params: { turns: 1.25 },
    features: ({ m }) => [{ id: 'relu', params: { m } }],
    knobs: [{ key: 'm', label: 'ReLU units, m', min: 2, max: 200, step: 1, default: 60, int: true, hint: 'With 10 ReLU units or fewer, every unit is written out below; with 12 or fewer, the line where each one bends is dashed on the plot.' }],
    phi: ({ m }) => `\\Phi(x) = [\\,h_1(x),\\ \\dots,\\ h_{${m}}(x)\\,],\\quad h_j(x) = \\max(0,\\ u_j^\\top x + b_j)`,
    tilePhi: ({ m }) => `\\Phi(x) = [\\,h_1(x),\\ \\dots,\\ h_{${m}}(x)\\,]`,
    zAxis: ({ m }) => (m === 2 ? ['h₁(x)', 'h₂(x)'] : null),
    terms: hingeTex,
    featureName: (j) => `h_{${j}}(x)`,
    whereNote: ({ m }) => `Each feature is one ReLU unit: \\(z_j = h_j(x)\\), so \\(z = (h_1(x), \\dots, h_{${m}}(x))\\). In neural-network terms, \\(h_1, \\dots, h_{${m}}\\) are ${m} hidden units, \\(z\\) is the output of the hidden layer, and \\(w_0, \\dots, w_{${m}}\\) are the weights of the output unit, which is the logistic regression. Only the \\(w\\)'s are fit; each \\(u_j\\) and \\(b_j\\) is random and stays fixed.`,
    lead: ({ m }) => `${m} random ReLU (rectified linear unit) features. Each one, h(x) = max(0, uᵀx + b), is flat on one side of a line and rises on the other, like a hinge, so the boundary is built from straight pieces.`,
    how: `${EDGE_HOW} On the original plot, each dashed line is where one ReLU unit bends (shown for 12 units or fewer).`,
    defs: () => [D.hinge, D.dot, '\\(u_j\\): a random direction (a vector of length 1), and \\(b_j\\): a random offset. Both are drawn once and then fixed; they are not fit to the data.', '\\(h_j(x) = \\max(0,\\ u_j^\\top x + b_j)\\) is 0 on one side of the line \\(u_j^\\top x + b_j = 0\\) and grows in proportion to the distance from that line on the other side.'],
  },
  {
    id: 'bins', wing: 'generic', family: 'Bin indicators', name: 'Staircase', shape: 'a staircase', collapse: true, jumps: true,
    ds: 'circles', params: {},
    features: ({ B }) => [{ id: 'bins', params: { B } }],
    knobs: [{ key: 'B', label: 'Bins per axis, B', min: 2, max: 14, step: 1, default: 6, int: true, hint: 'With 6 bins or fewer per axis, every feature is written out below.' }],
    phi: ({ B }) => `\\Phi(x) = [\\,${IND}[x_1 \\in \\text{bin } b],\\ ${IND}[x_2 \\in \\text{bin } b] : b = 2,\\dots,${B}\\,]`,
    tilePhi: () => `\\Phi(x) = [\\,${IND}[x_i \\in \\text{bin } b]\\,]`,
    zAxis: ({ B }) => (B === 2 ? ['𝟙[x₁ ≥ 0]', '𝟙[x₂ ≥ 0]'] : null),
    terms: binTex,
    lead: 'Cut each axis into bins and give each bin its own on/off feature: the boundary can only step along the axes.',
    how: `${EDGE_HOW} Every point in the same pair of bins gets exactly the same features, so whole cells collapse onto single spots.`,
    defs: ({ B }) => [D.indicator,
      `Bin \\(b\\): the \\(b\\)-th of \\(B = ${B}\\) equal slices of an axis between −3 and 3, each ${n2(6 / B)} wide. The first bin also takes everything below −3 and the last everything above 3.`,
      `Bin 1 has no feature of its own: for a point in bin 1, that axis’s features are all 0, and the bias \\(w_0\\) covers it. So \\(B\\) bins give \\(B - 1\\) features per axis, \\(2(B - 1) = ${2 * (B - 1)}\\) in all.`],
  },
];

// What in Φ was set by hand rather than fit. Logistic regression only fits the
// weights w, which keeps it a linear (convex) fit; any parameter inside Φ was
// chosen before fitting, here usually to match how the data was generated.
const SEARCH = 'In practice you would choose it from what you know about the problem, or try several values and keep the one with the best validation accuracy. Each try is its own linear fit; the search over values is not part of that fit, and learning the value together with the weights would be a nonlinear optimization.';
const CENTER = 'the center that distances and angles are measured from, \\((0, 0)\\)';
const CHOSEN = {
  circle: () => 'The center of the circle, \\((0, 0)\\), is built into these features. Adding \\(x_1\\) and \\(x_2\\) as features would let the weights learn any center, because \\((x_1 - c_1)^2 = x_1^2 - 2c_1x_1 + c_1^2\\).',
  parabola: () => 'The position of the vertex, \\(x_1 = 0\\), is built into these features. Adding \\(x_1\\) as a feature would let the weights learn it, because \\((x_1 - h)^2 = x_1^2 - 2hx_1 + h^2\\).',
  ring: () => `The center that distances are measured from, \\((0, 0)\\), to match the data. ${SEARCH}`,
  flower: ({ k }) => `The number of petals, \\(k = ${k}\\), to match the data, and ${CENTER}. ${SEARCH}`,
  spiral: ({ turns }) => `The pitch \\(\\omega \\approx ${spiralOmega(turns).toFixed(2)}\\) (${turns} turns), to match the data, and ${CENTER}. ${SEARCH}`,
  wedge: () => `The center that angles are measured from, \\((0, 0)\\), to match the data. ${SEARCH}`,
  wave: ({ w }) => `The frequency \\(\\omega = ${+w.toFixed(2)}\\), to match the data. The data’s wave also has no phase shift, so \\(\\sin\\omega x_1\\) alone is enough; a phase \\(\\varphi\\) could be learned by the weights by adding \\(\\cos\\omega x_1\\) as a feature, because \\(\\sin(\\omega x_1 + \\varphi) = a\\sin\\omega x_1 + b\\cos\\omega x_1\\). The frequency cannot be absorbed this way. ${SEARCH}`,
  checker: () => `The frequency \\(\\omega = \\pi/1.5\\), to match the 1.5-unit squares, and the board's alignment with \\((0, 0)\\). ${SEARCH}`,
  diamond: () => 'The center of the diamond, \\((0, 0)\\), is built into these features. Unlike the circle’s center, it cannot be learned by adding features: \\(\\lvert x_1 - c\\rvert\\) is not a weighted sum of \\(\\lvert x_1\\rvert\\) and \\(x_1\\).',
  poly3: ({ deg }) => `Only the degree, ${deg}. The features themselves have no other parameters, so the fit stays linear in \\(z\\). ${SEARCH}`,
  islands: ({ gamma }) => `The two landmarks, placed at the centers of the islands, and the width \\(\\gamma = ${gamma}\\). ${SEARCH} Learning the centers and the width from the data makes this an RBF network.`,
  rbf: ({ m, gamma }) => `The grid of ${m * m} RBF centers and the width parameter \\(\\gamma = ${gamma}\\). The landmarks do not depend on the data, but how many there are and how wide they are matter. ${SEARCH}`,
  relu: ({ m }) => `Only the number of ReLU units, \\(m = ${m}\\). Each \\(u_j\\) and \\(b_j\\) is drawn at random and never tuned, so the fit stays linear in \\(z\\). Learning them as well is a nonlinear optimization: that is training a neural network.`,
  bins: ({ B }) => `The number of bins, \\(B = ${B}\\), and their equal-width edges between −3 and 3. ${SEARCH}`,
};
for (const ex of EXHIBITS) {
  ex.k0 = Object.fromEntries((ex.knobs || []).map((kn) => [kn.key, kn.default]));
  if (CHOSEN[ex.id]) ex.chosen = CHOSEN[ex.id];
}

export const byId = (id) => EXHIBITS.find((e) => e.id === id);
export const val = (v, k) => (typeof v === 'function' ? v(k) : v);

// Finale: every representation on every dataset.
export const MATCH = {
  datasets: [
    { ds: 'blobs', params: {}, name: 'Two blobs' },
    { ds: 'circles', params: {}, name: 'Circles' },
    { ds: 'xor', params: {}, name: 'Quadrants' },
    { ds: 'ring', params: {}, name: 'Ring' },
    { ds: 'sine', params: { ph: 0, w: 2, A: 1.5 }, name: 'Wave' },
    { ds: 'spirals', params: {}, name: 'Spirals' },
  ],
  reps: [
    { exhibit: 'line', tex: '[x_1,\\ x_2]', features: RAW },
    { exhibit: 'circle', tex: '[x_1^2,\\ x_2^2]', features: [{ id: 'x1sq' }, { id: 'x2sq' }] },
    { exhibit: 'hyperbola', tex: '[x_1,\\ x_1x_2]', features: [{ id: 'x1' }, { id: 'x1x2' }] },
    { exhibit: 'ring', tex: '[r,\\ r^2]', features: [{ id: 'r' }, { id: 'r2' }] },
    { exhibit: 'wave', tex: '[\\sin 2x_1,\\ x_2]', features: [{ id: 'sinx1', params: { w: 2 } }, { id: 'x2' }] },
    { exhibit: 'spiral', tex: '[\\sin(\\omega r-\\theta),\\ \\cos(\\omega r-\\theta)]', features: [{ id: 'spiral', params: { omega: spiralOmega(2) } }] },
    { exhibit: 'rbf', tex: '49\\ \\text{RBFs}', generic: true, features: [{ id: 'rbf', params: { place: 'grid', m: 7, gamma: 1.5 } }] },
  ],
};
