// Logistic regression fit by Newton's method (IRLS).
//
//   J(w) = (1/N) Σ [softplus(sᵢ) − yᵢ sᵢ] + λ Σ_{j≥1} wⱼ² + μ w₀²,   sᵢ = w₀ + wᵀzᵢ
//
// This lab fits without regularization. The only penalty is GUARD (λ = μ =
// 1e-8), a numerical guard that lets the fit stop when the training points
// can be separated perfectly and no best fit exists; engine.js removes it
// (λ = μ = 0) whenever the exact unpenalized fit exists.
//
// Features are standardized before fitting; see features.foldWeights to map the
// result back to raw-feature weights. Trainer works in the d + 1 weights;
// DualTrainer, for d + 1 > N, takes the same Newton steps in the N-dimensional
// span of the training points.

export const GUARD = 1e-8;
const BIAS_PEN = GUARD;

export const sigmoid = (s) => (s >= 0 ? 1 / (1 + Math.exp(-s)) : Math.exp(s) / (1 + Math.exp(s)));
const softplus = (s) => Math.max(s, 0) + Math.log1p(Math.exp(-Math.abs(s)));

export class Trainer {
  /**
   * Z: standardized N×d design (row-major Float64Array), y: Uint8Array labels.
   * warm: optional initial weights (length d+1) from a previous fit.
   */
  constructor(Z, y, N, d, lambda, warm = null) {
    this.Z = Z; this.y = y; this.N = N; this.d = d; this.D = d + 1;
    this.lambda = Math.max(lambda, 0);
    this.biasPen = BIAS_PEN;
    this.w = new Float64Array(this.D);
    if (warm && warm.length === this.D && warm.every(Number.isFinite)) this.w.set(warm);
    else {
      let m = 0;
      for (let i = 0; i < N; i++) m += y[i];
      const ybar = N ? Math.min(Math.max(m / N, 1e-3), 1 - 1e-3) : 0.5;
      this.w[0] = Math.log(ybar / (1 - ybar));
    }
    this.s = new Float64Array(N);
    this.g = new Float64Array(this.D);
    this.H = new Float64Array(this.D * this.D);
    this.delta = new Float64Array(this.D);
    this.wTry = new Float64Array(this.D);
    this.iters = 0;
    this.maxIter = 200;
    this.reason = N === 0 ? 'grad' : null; // why the fit stopped: 'grad' (gradient ~0), 'flat' (no more progress), 'cap' (iteration limit)
    this.converged = N === 0;
    this.loss = this.objective(this.w);
  }

  setLambda(lambda) {
    const l = Math.max(lambda, 0);
    if (l !== this.lambda) { this.lambda = l; this.converged = this.N === 0; this.reason = null; this.iters = 0; this.loss = this.objective(this.w); }
  }

  scores(w, out) {
    const { Z, N, d } = this;
    for (let i = 0; i < N; i++) {
      let s = w[0];
      const o = i * d;
      for (let j = 0; j < d; j++) s += w[j + 1] * Z[o + j];
      out[i] = s;
    }
    return out;
  }

  objective(w) {
    const { N, y } = this;
    if (N === 0) return 0;
    const s = this.scores(w, this.s);
    let L = 0;
    for (let i = 0; i < N; i++) L += softplus(s[i]) - y[i] * s[i];
    L /= N;
    let R = 0;
    for (let j = 1; j < this.D; j++) R += w[j] * w[j];
    return L + this.lambda * R + this.biasPen * w[0] * w[0];
  }

  // One Newton iteration with Armijo backtracking. Returns false once converged.
  iterate() {
    if (this.converged) return false;
    const { Z, y, N, d, D, w, g, H } = this;
    const s = this.scores(w, this.s);
    g.fill(0); H.fill(0);
    for (let i = 0; i < N; i++) {
      const p = 1 / (1 + Math.exp(-s[i]));
      const r = p - y[i];
      const v = Math.max(p * (1 - p), 1e-10);
      const o = i * d;
      g[0] += r;
      H[0] += v;
      for (let a = 0; a < d; a++) {
        const za = Z[o + a];
        g[a + 1] += r * za;
        const vza = v * za;
        H[a + 1] += vza; // row 0, col a+1
        const row = (a + 1) * D;
        for (let b = a; b < d; b++) H[row + b + 1] += vza * Z[o + b];
      }
    }
    const invN = 1 / N;
    for (let a = 0; a < D; a++) {
      g[a] = g[a] * invN + 2 * (a === 0 ? this.biasPen : this.lambda) * w[a];
      for (let b = a; b < D; b++) H[a * D + b] *= invN;
      H[a * D + a] += 2 * (a === 0 ? this.biasPen : this.lambda) + 1e-10;
      for (let b = a + 1; b < D; b++) H[b * D + a] = H[a * D + b];
    }
    let gmax = 0;
    for (let a = 0; a < D; a++) gmax = Math.max(gmax, Math.abs(g[a]));
    this.gmax = gmax;
    if (gmax < 1e-7) { this.converged = true; this.reason = 'grad'; return false; }

    const delta = this.delta;
    if (!solveSPD(H, g, D, delta)) { for (let a = 0; a < D; a++) delta[a] = g[a]; }
    for (let a = 0; a < D; a++) delta[a] = -delta[a];
    let gd = 0;
    for (let a = 0; a < D; a++) gd += g[a] * delta[a];
    if (!(gd < 0)) { for (let a = 0; a < D; a++) delta[a] = -g[a]; gd = -gmax * gmax; }

    const f0 = this.loss;
    let alpha = 1, fNew = Infinity;
    for (let h = 0; h < 30; h++) {
      for (let a = 0; a < D; a++) this.wTry[a] = w[a] + alpha * delta[a];
      fNew = this.objective(this.wTry);
      if (fNew <= f0 + 1e-4 * alpha * gd) break;
      alpha *= 0.5;
    }
    if (fNew <= f0) {
      w.set(this.wTry);
      const rel = Math.abs(f0 - fNew) / Math.max(1, Math.abs(f0));
      this.loss = fNew;
      if (rel < 1e-10) { this.converged = true; this.reason = 'flat'; }
    } else { this.converged = true; this.reason = 'flat'; }
    this.iters++;
    if (!this.converged && this.iters >= this.maxIter) { this.converged = true; this.reason = 'cap'; }
    return !this.converged;
  }

  // Largest |∂J/∂wⱼ| at the current weights (for checking that a fit is a true optimum).
  gradMax() {
    const { Z, y, N, d, D, w } = this, s = this.scores(w, this.s), g = new Float64Array(D);
    for (let i = 0; i < N; i++) {
      const r = 1 / (1 + Math.exp(-s[i])) - y[i], o = i * d;
      g[0] += r;
      for (let a = 0; a < d; a++) g[a + 1] += r * Z[o + a];
    }
    let m = 0;
    for (let a = 0; a < D; a++) m = Math.max(m, Math.abs(g[a] / N + 2 * (a === 0 ? this.biasPen : this.lambda) * w[a]));
    return m;
  }

  // Run whole Newton iterations until the time budget (ms) is spent.
  step(budgetMs = 30) {
    const t0 = performance.now();
    while (!this.converged) {
      this.iterate();
      if (performance.now() - t0 > budgetMs) break;
    }
    return this.converged;
  }

  run() {
    while (!this.converged) this.iterate();
    return this.w;
  }
}

/**
 * The same model and the same Newton steps for d + 1 > N, where the weights
 * live in the span of the training points: w = Aᵀβ with A = [1, Z] (N × (d+1)),
 * so s = Kβ with K = AAᵀ. With the penalty λ on every coefficient (bias too),
 * the primal Newton step H Δw = −g is exactly Δw = Aᵀδ with
 *   (K/N + diag(2λ / vᵢ)) δ = −c / v,   c = (p − y)/N + 2λβ,   vᵢ = pᵢ(1 − pᵢ).
 * Cost: O(N²d) once for K, then O(N³) per step instead of O(d³).
 * Requires λ > 0 (the guard): with λ = 0 the step is not unique.
 */
export class DualTrainer {
  constructor(Z, y, N, d, lambda) {
    this.Z = Z; this.y = y; this.N = N; this.d = d; this.D = d + 1;
    this.lambda = Math.max(lambda, 1e-14); // must be > 0: with λ = 0 the step is not unique
    const K = new Float64Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = i; j < N; j++) {
        let k = 1;
        const oi = i * d, oj = j * d;
        for (let a = 0; a < d; a++) k += Z[oi + a] * Z[oj + a];
        K[i * N + j] = k; K[j * N + i] = k;
      }
    }
    this.K = K;
    this.beta = new Float64Array(N); // start at w = 0 (every probability 1/2)
    this.s = new Float64Array(N);
    this.M = new Float64Array(N * N);
    this.rhs = new Float64Array(N);
    this.delta = new Float64Array(N);
    this.betaTry = new Float64Array(N);
    this.sTry = new Float64Array(N);
    this.iters = 0; this.maxIter = 200; this.converged = N === 0; this.reason = N === 0 ? 'grad' : null;
    this.loss = this.objective(this.beta, this.s);
  }
  // s = Kβ into `s`; returns J(β).
  objective(beta, s) {
    const { K, N, y } = this;
    let L = 0, R = 0;
    for (let i = 0; i < N; i++) {
      let v = 0;
      const o = i * N;
      for (let j = 0; j < N; j++) v += K[o + j] * beta[j];
      s[i] = v;
      L += softplus(v) - y[i] * v;
      R += beta[i] * v;
    }
    return L / N + this.lambda * R;
  }
  iterate() {
    if (this.converged) return false;
    const { N, y, K, M, rhs, delta, beta, s } = this, lam = this.lambda;
    let gmax = 0;
    const v = new Float64Array(N), c = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const p = 1 / (1 + Math.exp(-s[i]));
      v[i] = Math.max(p * (1 - p), 1e-10);
      c[i] = (p - y[i]) / N + 2 * lam * beta[i];
    }
    // ∂J/∂β = Kc (zero exactly when the w-space gradient Aᵀc is)
    for (let i = 0; i < N; i++) { let g = 0; for (let j = 0; j < N; j++) g += K[i * N + j] * c[j]; gmax = Math.max(gmax, Math.abs(g)); }
    this.gmax = gmax;
    if (gmax < 1e-9) { this.converged = true; this.reason = 'grad'; return false; }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) M[i * N + j] = K[i * N + j] / N;
      M[i * N + i] += (2 * lam) / v[i];
      rhs[i] = c[i] / v[i];
    }
    if (!solveSPD(M, rhs, N, delta)) { this.converged = true; this.reason = 'flat'; return false; }
    let gd = 0; // directional derivative of J along δ: (Kc)·δ
    for (let i = 0; i < N; i++) { let g = 0; for (let j = 0; j < N; j++) g += K[i * N + j] * c[j]; delta[i] = -delta[i]; gd += g * delta[i]; }
    const f0 = this.loss;
    let alpha = 1, fNew = Infinity;
    for (let h = 0; h < 30; h++) {
      for (let i = 0; i < N; i++) this.betaTry[i] = beta[i] + alpha * delta[i];
      fNew = this.objective(this.betaTry, this.sTry);
      if (fNew <= f0 + 1e-4 * alpha * gd) break;
      alpha *= 0.5;
    }
    if (fNew <= f0) {
      beta.set(this.betaTry); s.set(this.sTry);
      const rel = Math.abs(f0 - fNew) / Math.max(1, Math.abs(f0));
      this.loss = fNew;
      if (rel < 1e-12) { this.converged = true; this.reason = 'flat'; }
    } else { this.converged = true; this.reason = 'flat'; }
    this.iters++;
    if (!this.converged && this.iters >= this.maxIter) { this.converged = true; this.reason = 'cap'; }
    return !this.converged;
  }
  run() {
    while (!this.converged) this.iterate();
    return this.weights();
  }
  // w = Aᵀβ (standardized-feature weights, w[0] the bias).
  weights() {
    const { Z, N, d, beta } = this, w = new Float64Array(d + 1);
    for (let i = 0; i < N; i++) {
      w[0] += beta[i];
      const o = i * d;
      for (let a = 0; a < d; a++) w[a + 1] += beta[i] * Z[o + a];
    }
    return w;
  }
}

// Solve H x = g for symmetric positive (semi)definite H via Cholesky, adding
// escalating diagonal jitter if the factorization fails.
export function solveSPD(H, g, D, x) {
  let tr = 0;
  for (let a = 0; a < D; a++) tr += H[a * D + a];
  let jitter = 0;
  const L = new Float64Array(D * D);
  for (let attempt = 0; attempt < 8; attempt++) {
    if (choleskyInto(H, D, jitter, L)) {
      // forward: L u = g, back: Lᵀ x = u
      for (let i = 0; i < D; i++) {
        let s = g[i];
        for (let k = 0; k < i; k++) s -= L[i * D + k] * x[k];
        x[i] = s / L[i * D + i];
      }
      for (let i = D - 1; i >= 0; i--) {
        let s = x[i];
        for (let k = i + 1; k < D; k++) s -= L[k * D + i] * x[k];
        x[i] = s / L[i * D + i];
      }
      return x.every(Number.isFinite);
    }
    jitter = jitter === 0 ? 1e-8 * (tr / D || 1) : jitter * 10;
  }
  return false;
}

function choleskyInto(H, D, jitter, L) {
  for (let i = 0; i < D; i++) {
    for (let j = 0; j <= i; j++) {
      let s = H[i * D + j] + (i === j ? jitter : 0);
      for (let k = 0; k < j; k++) s -= L[i * D + k] * L[j * D + k];
      if (i === j) {
        if (!(s > 0)) return false;
        L[i * D + i] = Math.sqrt(s);
      } else L[i * D + j] = s / L[j * D + j];
    }
  }
  return true;
}

// ---- metrics on raw features with raw-space weights -----------------------

export function logits(w, Z, N, d, out = new Float64Array(N)) {
  for (let i = 0; i < N; i++) {
    let s = w[0];
    for (let j = 0; j < d; j++) s += w[j + 1] * Z[i * d + j];
    out[i] = s;
  }
  return out;
}

export function metrics(w, Z, y, N, d) {
  if (N === 0) return { acc: NaN, loss: NaN, n: 0 };
  const s = logits(w, Z, N, d);
  let correct = 0, loss = 0;
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(s[i])) continue;
    if ((s[i] > 0 ? 1 : 0) === y[i]) correct++;
    loss += softplus(s[i]) - y[i] * s[i];
  }
  return { acc: correct / N, loss: loss / N, n: N };
}
