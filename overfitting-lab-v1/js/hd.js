// Extra inputs made of pure noise, for the "irrelevant inputs" station. Each
// noise input has its own seeded stream, so the first k inputs are the same
// whatever k is, and row i is the same whatever N is.

import { makeRng, deriveSeed } from './rng.js';

const cache = new Map();

// Column j (0-based) of noise for `tag`: n standard normal values.
export function noiseColumn(tag, j, n) {
  const key = `${tag}|${j}`;
  let col = cache.get(key);
  if (!col || col.length < n) {
    const rng = makeRng(deriveSeed(705, `noise:${tag}:${j}`));
    col = new Float64Array(n);
    for (let i = 0; i < n; i++) col[i] = rng.normal();
    cache.set(key, col);
  }
  return col;
}

// Append k noise inputs to a row-major N×d design Z: rows[i] picks the noise row
// for point i (its index in the pool or test set). Returns an N×(d+k) design.
export function withNoise(Z, N, d, k, tag, rows) {
  const D = d + k, out = new Float64Array(N * D), maxRow = Math.max(0, ...rows) + 1;
  const cols = Array.from({ length: k }, (_, j) => noiseColumn(tag, j, maxRow));
  for (let i = 0; i < N; i++) {
    for (let a = 0; a < d; a++) out[i * D + a] = Z[i * d + a];
    for (let j = 0; j < k; j++) out[i * D + d + j] = cols[j][rows[i]];
  }
  return out;
}
