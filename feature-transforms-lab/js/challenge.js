// "Feature Golf" holes, scoring and the reference solutions.

import { spiralOmega } from './datasets.js';

export const BUDGET = 8;
export const SUBMISSIONS = 3;
export const SPLIT = { nTrain: 200, nVal: 200, nTest: 1000 };

export const HOLES = [
  { id: 'warmup', name: 'Warm-up', ds: 'blobs', params: { noise: 0.6 }, target: 0.95, ref: [{ id: 'raw' }], hint: 'Sometimes no transform is needed.', why: 'Two Gaussian blobs are linearly separable: raw features, 2 columns.' },
  { id: 'bullseye', name: 'Bullseye', ds: 'circles', params: {}, target: 0.97, ref: [{ id: 'r' }], hint: 'One feature is enough.', why: 'The radius r: a single threshold is a circle.' },
  { id: 'offcenter', name: 'Off-center', ds: 'offcircle', params: { a: 1.1, b: -0.8, R: 1.3 }, target: 0.97, ref: [{ id: 'r', params: { cx: 1.1, cy: -0.8 } }], hint: 'Where is the center? Drag it.', why: 'r measured from the true center (1.1, −0.8). The full quadratic also works but costs 5 columns.' },
  { id: 'xor', name: 'Shifted XOR', ds: 'xor', params: { a: 0.7, b: -0.5 }, target: 0.95, ref: [{ id: 'prodc', params: { cx: 0.7, cy: -0.5 } }], hint: 'XOR, but the crossing point moved.', why: '(x₁ − a)(x₂ − b) with (a, b) = (0.7, −0.5): one column.' },
  { id: 'donut', name: 'Donut', ds: 'ring', params: {}, target: 0.96, ref: [{ id: 'absr', params: { rho: 1.62 } }], hint: 'Two radii from one feature?', why: '|r − ρ| with ρ ≈ 1.6 (the ring’s middle): one column. [r, r²] also works with 2.' },
  { id: 'moons', name: 'Moons', ds: 'moons', params: { noise: 0.15 }, target: 0.95, ref: [{ id: 'raw' }, { id: 'x1cube' }], hint: 'Think of the boundary as x₂ = f(x₁).', why: '[x₁, x₂, x₁³]: the boundary x₂ = a x₁³ + b x₁ + c is an S-curve that threads between the moons.' },
  { id: 'galaxy', name: 'Galaxy', ds: 'spirals', params: {}, target: 0.97, ref: [{ id: 'spiral', params: { omega: +spiralOmega(2).toFixed(2) } }], hint: 'Tune the feature’s parameter on the validation set.', why: 'The spiral pair [sin(ωr − θ), cos(ωr − θ)] at ω ≈ 4.49: two columns.' },
  { id: 'chess', name: 'Chessboard', ds: 'checker', params: {}, target: 0.95, ref: [{ id: 'checker', params: { w: +(Math.PI / 1.5).toFixed(3) } }], hint: 'Cells are 1.5 wide.', why: 'sin ωx₁ · sin ωx₂ with ω = π/1.5: one column.' },
  { id: 'wave', name: 'Wave', ds: 'sine', params: {}, target: 0.95, ref: [{ id: 'fourier1', params: { w: 1.5 } }, { id: 'x2' }], hint: 'Boundary x₂ = A sin(ωx₁ + φ). Find ω.', why: '[sin ωx₁, cos ωx₁, x₂] with ω = 1.5: three columns.' },
  { id: 'diamond', name: 'Diamond heist', ds: 'normball', params: { p: 1 }, target: 0.97, ref: [{ id: 'l1' }], hint: 'Which norm has a diamond for a unit ball?', why: 'The L1 norm |x₁| + |x₂|: one column.' },
  { id: 'loans', name: 'Loan officer', ds: 'loans', params: { rule: 'power' }, target: 0.96, ref: [{ id: 'log1' }, { id: 'log2' }], hint: 'Positive, skewed, multiplicative.', why: '[log income, log loan]: the power-law rule is a straight line in log–log space.' },
  { id: 'starfish', name: 'Bonus: Starfish', ds: 'flower', params: { k: 5 }, target: 0.95, ref: [{ id: 'r' }, { id: 'petal', params: { k: 5 } }], hint: 'Radius plus angle.', why: '[r, sin 5θ, cos 5θ]: three columns.' },
];

export const holeSeed = (i) => 7000 + 17 * i;
export const points = (acc, d) => Math.round(100 * acc) - 2 * d;
