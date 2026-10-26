// The three datasets of this lab, each generated once per seed as clean
// points Xc plus one fixed draw of standard normal noise ε, so that the data
// at noise level η is exactly X(η) = Xc + η·ε. Moving the noise slider moves
// the same points smoothly; labels never change.
// Every set has exactly half its points in each class (class 1 first).

import { makeRng } from './rng.js';

export const BOX = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
const TAU = 2 * Math.PI;

// Uniform-by-area sampler on the annulus r0 < r < r1.
const annulus = (r0, r1) => (rng) => {
  const rad = Math.sqrt(rng.range(r0 * r0, r1 * r1)), t = rng.range(0, TAU);
  return [rad * Math.cos(t), rad * Math.sin(t)];
};
const S = 1.6; // moons: arc radius
export const SINE = { A: 1.2, w: 2, ph: 0.5, gap: 0.12, width: 1.2 };
const sineY = (x) => SINE.A * Math.sin(SINE.w * x + SINE.ph);

export const DATA = {
  circles: {
    name: 'Concentric circles',
    // class 1: the disk r < 1; class 0: the ring 1.7 < r < 2.7
    sample: [annulus(0, 1), annulus(1.7, 2.7)],
  },
  moons: {
    name: 'Two moons',
    sample: [
      (rng) => { const t = rng.range(0, Math.PI); return [S * (1 - Math.cos(t) - 0.5), S * (0.5 - Math.sin(t) - 0.25)]; },
      (rng) => { const t = rng.range(0, Math.PI); return [S * (Math.cos(t) - 0.5), S * (Math.sin(t) - 0.25)]; },
    ],
  },
  sine: {
    name: 'Sine wave',
    // a band on each side of y = 1.2 sin(2x + 0.5): class 1 above, class 0 below, with an empty 0.12 strip
    sample: [
      (rng) => { const x = rng.range(-3, 3); return [x, sineY(x) + rng.range(SINE.gap, SINE.width)]; },
      (rng) => { const x = rng.range(-3, 3); return [x, sineY(x) - rng.range(SINE.gap, SINE.width)]; },
    ],
  },
};
export const DATASET_IDS = Object.keys(DATA);

// n points (n/2 per class) with their noise draw: {Xc, eps, y}.
export function base(id, n, seed) {
  const rng = makeRng(seed), n1 = Math.floor(n / 2), Xc = new Float64Array(2 * n), y = new Uint8Array(n), [s1, s0] = DATA[id].sample;
  for (let i = 0; i < n; i++) {
    const cls = i < n1 ? 1 : 0, [a, b] = cls ? s1(rng) : s0(rng);
    Xc[2 * i] = a; Xc[2 * i + 1] = b; y[i] = cls;
  }
  const eps = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i++) eps[i] = rng.normal();
  return { Xc, eps, y, n };
}

// The points at noise level eta.
export function atNoise(b, eta) {
  const X = new Float64Array(b.Xc.length);
  for (let i = 0; i < X.length; i++) X[i] = b.Xc[i] + eta * b.eps[i];
  return X;
}
