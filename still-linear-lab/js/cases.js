// The cases. Each pairs one dataset with a representation z = Φ(x) of exactly
// two features, so feature space can be drawn as it is: the floor (z₁, z₂)
// and the score s = w₀ + w₁z₁ + w₂z₂ as the height. Datasets, features and
// their parameters match the Feature Transform Gallery's exhibits.
//
// zAxis: plain-text names of z₁ and z₂ (3-D axis titles).
// where: TeX for what each feature is, in the inputs.
// xTerms: TeX for each feature written in x, to substitute into the score.
// boundary: the shape of s = 0 in the original space.
// lead: what the three panels show at the fitted weights (HTML; claims are
// checked in still.test.js). collapse: Φ squeezes the plane onto a curve,
// so the carried sheet has no area left in feature space.

import { spiralOmega } from './datasets.js';

export const RAW = [{ id: 'raw', params: {} }];
const OMEGA = spiralOmega(2);
const om = OMEGA.toFixed(2);

// ---- definitions shared by several cases (HTML with \( \) math) ----
const D = {
  x: '\\(x = (x_1, x_2)\\): a point; \\(x_1\\) is its horizontal and \\(x_2\\) its vertical coordinate.',
  square: '\\(a^2 = a \\cdot a\\): the square of a number. It is never negative, and \\(a\\) and \\(-a\\) have the same square.',
  product: '\\(x_1x_2 = x_1 \\cdot x_2\\): the product of the two coordinates. It is positive when they have the same sign and negative when their signs differ.',
  r: '\\(r = \\lVert x\\rVert = \\sqrt{x_1^2 + x_2^2}\\): the distance from \\(x\\) to the center \\((0, 0)\\).',
  theta: '\\(\\theta = \\operatorname{atan2}(x_2, x_1)\\): the angle of \\(x\\) in radians, measured counter-clockwise from the positive \\(x_1\\)-axis (atan2 is the arctangent of \\(x_2/x_1\\), adjusted to the quadrant of \\(x\\), so it runs from \\(-\\pi\\) to \\(\\pi\\)). It comes straight from the inputs: \\(\\cos\\theta = x_1/r\\) and \\(\\sin\\theta = x_2/r\\).',
  sincos: '\\(\\sin a\\) and \\(\\cos a\\): the vertical and horizontal coordinates of the point at angle \\(a\\) (in radians) on the circle of radius 1. Both stay between −1 and 1 and repeat every \\(2\\pi\\).',
};

// What in Φ was set by hand rather than fit (from the gallery's notes).
const SEARCH = 'In practice you would choose it from what you know about the problem, or try several values and keep the one with the best validation accuracy. Each try is its own linear fit; the search over values is not part of that fit, and learning the value together with the weights would be a nonlinear optimization.';
const CENTER = 'the center that distances and angles are measured from, \\((0, 0)\\)';

export const CASES = [
  {
    id: 'line', name: 'Straight line', ds: 'blobs', params: {},
    features: RAW,
    phi: '\\Phi(x) = [\\,x_1,\\ x_2\\,]',
    zAxis: ['x₁', 'x₂'],
    where: ['z_1 = x_1', 'z_2 = x_2'],
    xTerms: ['x_1', 'x_2'],
    boundary: 'a straight line',
    lead: 'The raw inputs, unchanged: \\(z = x\\). The score is already a flat, tilted plane over the original axes, so the two 3-D views show the same plane. On its own, a linear model can only draw a straight line. Every other case uses this same model; only its inputs change.',
    defs: [D.x, 'Here the features are the inputs themselves: \\(z_1 = x_1\\) and \\(z_2 = x_2\\).'],
  },
  {
    id: 'circle', name: 'Circle', ds: 'circles', params: {},
    features: [{ id: 'x1sq' }, { id: 'x2sq' }],
    phi: '\\Phi(x) = [\\,x_1^2,\\ x_2^2\\,]',
    zAxis: ['x₁²', 'x₂²'],
    where: ['z_1 = x_1^2', 'z_2 = x_2^2'],
    xTerms: ['x_1^2', 'x_2^2'],
    boundary: 'a circle',
    lead: 'Square each coordinate. Over the original axes, the score is a dome: highest at the center and falling off in every direction, so it crosses 0 in a circle. Squaring forgets the sign, so applying Φ folds all four quadrants onto one, and the dome lands flat on a plane.',
    defs: [D.x, D.square],
    chosen: 'The center of the circle, \\((0, 0)\\), is built into these features. Adding \\(x_1\\) and \\(x_2\\) as features would let the weights learn any center, because \\((x_1 - c_1)^2 = x_1^2 - 2c_1x_1 + c_1^2\\).',
  },
  {
    id: 'hyperbola', name: 'Hyperbola', ds: 'xor', params: {},
    features: [{ id: 'x1' }, { id: 'x1x2' }],
    phi: '\\Phi(x) = [\\,x_1,\\ x_1x_2\\,]',
    zAxis: ['x₁', 'x₁x₂'],
    where: ['z_1 = x_1', 'z_2 = x_1x_2'],
    xTerms: ['x_1', 'x_1x_2'],
    boundary: 'a hyperbola',
    lead: 'Keep \\(x_1\\) and add the product \\(x_1x_2\\). Over the original axes, the score is a saddle: up in the two quadrants where \\(x_1\\) and \\(x_2\\) have the same sign, down in the other two. It crosses 0 along a hyperbola that hugs the axes. Applying Φ flips the left half of the plane over, and the saddle lands flat on a plane.',
    defs: [D.x, D.product],
    chosen: 'The center of the quadrants, \\((0, 0)\\), is built into the product \\(x_1x_2\\). Adding \\(x_2\\) as a feature would let the weights learn a shifted center, because \\((x_1 - a)(x_2 - b) = x_1x_2 - b\\,x_1 - a\\,x_2 + ab\\).',
  },
  {
    id: 'ring', name: 'Ring', ds: 'ring', params: {}, collapse: true,
    features: [{ id: 'r' }, { id: 'r2' }],
    phi: '\\Phi(x) = [\\,r,\\ r^2\\,],\\quad r = \\lVert x\\rVert',
    zAxis: ['r', 'r²'],
    where: ['z_1 = r = \\sqrt{x_1^2 + x_2^2}', 'z_2 = r^2 = x_1^2 + x_2^2'],
    xTerms: ['\\sqrt{x_1^2 + x_2^2}', '(x_1^2 + x_2^2)'],
    boundary: 'two circles (a ring)',
    lead: 'The distance from the center, and its square. Over the original axes, the score is a circular ridge: low at the center, high at a middle distance and low again far out, so it crosses 0 twice, in two circles. Applying Φ squeezes the whole plane onto the curve \\(z_2 = z_1^2\\). That curve lies on a flat plane, which crosses 0 in one straight line, and the line meets the curve twice.',
    defs: [D.r, '\\(r^2 = x_1^2 + x_2^2\\): the squared distance from the center.'],
    chosen: `The center that distances are measured from, \\((0, 0)\\), to match the data. ${SEARCH}`,
  },
  {
    id: 'wave', name: 'Wave', ds: 'sine', params: { ph: 0, w: 2, A: 1.5 },
    features: [{ id: 'sinx1', params: { w: 2 } }, { id: 'x2' }],
    phi: '\\Phi(x) = [\\,\\sin 2x_1,\\ x_2\\,]',
    zAxis: ['sin 2x₁', 'x₂'],
    where: ['z_1 = \\sin 2x_1', 'z_2 = x_2'],
    xTerms: ['\\sin 2x_1', 'x_2'],
    boundary: 'a sine wave',
    lead: 'The sine of one coordinate. Over the original axes, the score is a corrugated sheet that ripples along \\(x_1\\), so it crosses 0 along a sine wave. Applying Φ folds the plane like an accordion onto a narrow strip, and the ripples land flat on a plane.',
    defs: [D.sincos, `\\(\\sin 2x_1\\): the sine of 2 times \\(x_1\\), with frequency \\(\\omega = 2\\). It repeats every \\(2\\pi/\\omega \\approx ${(Math.PI).toFixed(2)}\\) units of \\(x_1\\).`],
    chosen: `The frequency \\(\\omega = 2\\), to match the data. The data’s wave also has no phase shift, so \\(\\sin\\omega x_1\\) alone is enough; a phase \\(\\varphi\\) could be learned by the weights by adding \\(\\cos\\omega x_1\\) as a feature, because \\(\\sin(\\omega x_1 + \\varphi) = a\\sin\\omega x_1 + b\\cos\\omega x_1\\). The frequency cannot be absorbed this way. ${SEARCH}`,
  },
  {
    id: 'spiral', name: 'Spiral', ds: 'spirals', params: {}, collapse: true,
    features: [{ id: 'spiral', params: { omega: OMEGA } }],
    phi: '\\Phi(x) = [\\,\\sin(\\omega r-\\theta),\\ \\cos(\\omega r-\\theta)\\,]',
    zAxis: ['sin(ωr − θ)', 'cos(ωr − θ)'],
    where: ['z_1 = \\sin(\\omega r - \\theta)', 'z_2 = \\cos(\\omega r - \\theta)'],
    xTerms: [`\\sin(${om}\\,r - \\theta)`, `\\cos(${om}\\,r - \\theta)`],
    boundary: 'two interlocking spirals',
    lead: 'Two features that turn with the distance. Over the original axes, the score is a spiral ramp that winds around the center, so it crosses 0 along two spirals. Applying Φ moves every point onto a circle of radius 1. That circle lies on a flat plane, which crosses 0 in one straight line through the circle.',
    defs: [D.r, D.theta, D.sincos,
      'Written in the inputs: \\(\\sin(\\omega r - \\theta) = (x_1\\sin\\omega r - x_2\\cos\\omega r)/r\\) and \\(\\cos(\\omega r - \\theta) = (x_1\\cos\\omega r + x_2\\sin\\omega r)/r\\), from \\(\\cos\\theta = x_1/r\\) and \\(\\sin\\theta = x_2/r\\).',
      `\\(\\omega\\): how fast the angle turns with the distance. The data’s spirals turn twice out to radius 2.8, so \\(\\omega = 2\\pi \\cdot 2/2.8 \\approx ${om}\\).`],
    chosen: `The pitch \\(\\omega \\approx ${om}\\) (2 turns), to match the data, and ${CENTER}. ${SEARCH}`,
  },
];

export const byId = (id) => CASES.find((c) => c.id === id);
