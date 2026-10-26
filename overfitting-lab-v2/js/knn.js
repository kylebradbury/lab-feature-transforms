// k-nearest neighbors (KNN) for two classes, for every k at once.
//
// For each query point the squared distances to the training points of each
// class are sorted separately (native typed-array sort) and merged; walking
// the merged order counts the class-1 labels among the first m neighbors for
// every m, and the counts at the k values asked for are kept. On an exact
// distance tie between the classes, the class-0 point comes first, so results
// are deterministic. With odd k the vote never ties.
//
// A training point queried against its own training set finds itself at
// distance 0, so it counts as one of its own k neighbors (the usual convention:
// with k = 1 every training point is classified correctly).

// counts[q * K + j] = number of class-1 points among the ks[j] nearest training points to query q.
export function knnCounts(Xtr, ytr, Q, nq, ks) {
  const n = ytr.length, i1 = [], i0 = [];
  for (let i = 0; i < n; i++) (ytr[i] ? i1 : i0).push(i);
  const n1 = i1.length, n0 = i0.length, K = ks.length, kmax = Math.max(...ks);
  if (kmax > n) throw new Error(`k = ${kmax} > ${n} training points`);
  const order = ks.map((k, j) => [k, j]).sort((a, b) => a[0] - b[0]);
  const x1 = Float64Array.from(i1.flatMap((i) => [Xtr[2 * i], Xtr[2 * i + 1]])), x0 = Float64Array.from(i0.flatMap((i) => [Xtr[2 * i], Xtr[2 * i + 1]]));
  const d1 = new Float64Array(n1), d0 = new Float64Array(n0), out = new Uint8Array(nq * K);
  for (let q = 0; q < nq; q++) {
    const a = Q[2 * q], b = Q[2 * q + 1];
    for (let i = 0; i < n1; i++) { const u = x1[2 * i] - a, v = x1[2 * i + 1] - b; d1[i] = u * u + v * v; }
    for (let i = 0; i < n0; i++) { const u = x0[2 * i] - a, v = x0[2 * i + 1] - b; d0[i] = u * u + v * v; }
    d1.sort(); d0.sort();
    let i = 0, j = 0, c1 = 0, m = 0, o = 0;
    while (m < kmax) {
      if (i < n1 && (j >= n0 || d1[i] < d0[j])) { c1++; i++; } else j++;
      m++;
      while (o < K && order[o][0] === m) { out[q * K + order[o][1]] = c1; o++; }
    }
  }
  return out;
}

// Predicted class (1 if most of the k neighbors are class 1) for every query and every k.
export function knnPredict(counts, nq, ks) {
  const K = ks.length;
  return ks.map((k, j) => {
    const p = new Uint8Array(nq);
    for (let q = 0; q < nq; q++) p[q] = 2 * counts[q * K + j] > k ? 1 : 0;
    return p;
  });
}

// Brute force, for the tests: class-1 count among the k nearest, ties broken the same way.
export function knnCountBrute(Xtr, ytr, a, b, k) {
  const n = ytr.length, idx = Array.from({ length: n }, (_, i) => i);
  const d = idx.map((i) => (Xtr[2 * i] - a) ** 2 + (Xtr[2 * i + 1] - b) ** 2);
  idx.sort((p, q) => d[p] - d[q] || ytr[p] - ytr[q]);
  let c = 0;
  for (let m = 0; m < k; m++) c += ytr[idx[m]];
  return c;
}
