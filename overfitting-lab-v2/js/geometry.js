// Contours, conic classification and region overlap.

/**
 * Marching squares at `level` on a G×H grid stored row-major (index j*G + i,
 * i along x₁, j along x₂). Returns a flat array [i0, j0, i1, j1, ...] of
 * segment endpoints in fractional grid-index coordinates.
 */
export function marchingSquares(V, G, H = G, level = 0) {
  const segs = [];
  const pts = new Float64Array(8);
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < G - 1; i++) {
      const a = V[j * G + i] - level, b = V[j * G + i + 1] - level;
      const c = V[(j + 1) * G + i + 1] - level, d = V[(j + 1) * G + i] - level;
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const sa = a > 0, sb = b > 0, sc = c > 0, sd = d > 0;
      if (sa === sb && sb === sc && sc === sd) continue;
      // crossings on edges: 0 bottom (a-b), 1 right (b-c), 2 top (d-c), 3 left (a-d)
      const has = [sa !== sb, sb !== sc, sd !== sc, sa !== sd];
      if (has[0]) { pts[0] = i + a / (a - b); pts[1] = j; }
      if (has[1]) { pts[2] = i + 1; pts[3] = j + b / (b - c); }
      if (has[2]) { pts[4] = i + d / (d - c); pts[5] = j + 1; }
      if (has[3]) { pts[6] = i; pts[7] = j + a / (a - d); }
      const e = [];
      for (let k = 0; k < 4; k++) if (has[k]) e.push(k);
      const seg = (p, q) => segs.push(pts[2 * p], pts[2 * p + 1], pts[2 * q], pts[2 * q + 1]);
      if (e.length === 2) seg(e[0], e[1]);
      else if (e.length === 4) {
        const center = (a + b + c + d) / 4 > 0;
        if (center === sa) { seg(0, 1); seg(2, 3); } else { seg(0, 3); seg(1, 2); }
      }
    }
  }
  return segs;
}

/**
 * Join marchingSquares segments that share endpoints into polylines, so a
 * dashed stroke runs along the curve instead of restarting in every cell.
 * Returns an array of flat [i0, j0, i1, j1, ...] point lists.
 */
export function chainSegments(segs) {
  const n = segs.length / 4, key = (x, y) => `${x.toFixed(6)},${y.toFixed(6)}`;
  const at = new Map(), used = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    const k0 = key(segs[4 * s], segs[4 * s + 1]), k1 = key(segs[4 * s + 2], segs[4 * s + 3]);
    if (k0 === k1) { used[s] = 1; continue; } // zero length (contour through a grid vertex)
    for (const k of [k0, k1]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(s);
    }
  }
  // Follow unused segments from (x, y), appending each new endpoint to out.
  const walk = (x, y, out) => {
    for (;;) {
      const here = key(x, y), next = (at.get(here) || []).find((s) => !used[s]);
      if (next === undefined) return;
      used[next] = 1;
      const o = 4 * next, fwd = key(segs[o], segs[o + 1]) === here;
      x = fwd ? segs[o + 2] : segs[o]; y = fwd ? segs[o + 3] : segs[o + 1];
      out.push(x, y);
    }
  };
  const lines = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const o = 4 * s, head = [], tail = [];
    walk(segs[o + 2], segs[o + 3], tail);
    walk(segs[o], segs[o + 1], head);
    const line = [];
    for (let k = head.length - 2; k >= 0; k -= 2) line.push(head[k], head[k + 1]);
    line.push(segs[o], segs[o + 1], segs[o + 2], segs[o + 3], ...tail);
    lines.push(line);
  }
  return lines;
}

/**
 * Name the boundary w0 + w1 x1 + w2 x2 + w3 x1² + w4 x1x2 + w5 x2² = 0.
 * Returns {name, detail}.
 */
export function classifyConic(w) {
  const scale = Math.max(...w.map(Math.abs), 1e-12);
  const [F, D, E, A, B, C] = w.map((v) => v / scale);
  const tol = 1e-7;
  const z = (v) => Math.abs(v) < tol;
  if (z(A) && z(B) && z(C)) {
    if (z(D) && z(E)) return { name: 'none', detail: 'No boundary: one class everywhere' };
    return { name: 'line', detail: 'A straight line (no quadratic terms)' };
  }
  const disc = B * B - 4 * A * C;
  const det = A * (C * F - (E * E) / 4) - (B / 2) * ((B / 2) * F - (E * D) / 4) + (D / 2) * ((B / 2) * (E / 2) - C * (D / 2));
  if (disc < -tol) {
    if (z(det)) return { name: 'point', detail: 'Degenerate ellipse: a single point' };
    if ((A + C) * det > 0) return { name: 'empty', detail: 'Imaginary ellipse: no boundary, one class everywhere' };
    if (z(A - C) && z(B)) return { name: 'circle', detail: 'Circle (B² − 4AC < 0, A = C, B = 0)' };
    return { name: 'ellipse', detail: 'Ellipse (B² − 4AC < 0)' };
  }
  if (disc > tol) {
    if (z(det)) return { name: 'crossing lines', detail: 'Degenerate hyperbola: two crossing lines' };
    return { name: 'hyperbola', detail: 'Hyperbola (B² − 4AC > 0)' };
  }
  if (!z(det)) return { name: 'parabola', detail: 'Parabola (B² − 4AC = 0)' };
  // Degenerate parabola: quadratic part is λ u² along one direction.
  const lam = A + C;
  const n = Math.hypot(A, C) || 1;
  // eigenvector of the nonzero eigenvalue of [[A, B/2],[B/2, C]]
  let ux = Math.abs(A) >= Math.abs(C) ? A : B / 2, uy = Math.abs(A) >= Math.abs(C) ? B / 2 : C;
  const un = Math.hypot(ux, uy) || n;
  ux /= un; uy /= un;
  const Lu = D * ux + E * uy;
  const q = Lu * Lu - 4 * lam * F;
  if (q > tol) return { name: 'parallel lines', detail: 'Degenerate parabola: two parallel lines' };
  if (q < -tol) return { name: 'empty', detail: 'No boundary: one class everywhere' };
  return { name: 'line', detail: 'Degenerate parabola: a single (double) line' };
}

// Intersection-over-union of the "true" cells of two boolean grids.
export function iou(A, B) {
  let inter = 0, uni = 0;
  for (let k = 0; k < A.length; k++) {
    if (A[k] && B[k]) inter++;
    if (A[k] || B[k]) uni++;
  }
  return uni === 0 ? 1 : inter / uni;
}

// Sum of segment lengths for a marchingSquares output, scaled by (sx, sy).
export function contourLength(segs, sx = 1, sy = 1) {
  let L = 0;
  for (let k = 0; k < segs.length; k += 4) L += Math.hypot((segs[k + 2] - segs[k]) * sx, (segs[k + 3] - segs[k + 1]) * sy);
  return L;
}
