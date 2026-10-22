// L2-regularized logistic regression fit by Newton's method (IRLS).
//
//   J(w) = (1/N) Σ [softplus(sᵢ) − yᵢ sᵢ] + λ Σ_{j≥1} wⱼ² + 1e-8 w₀²,   sᵢ = w₀ + wᵀzᵢ
//
// Features are standardized before fitting; see features.foldWeights to map the
// result back to raw-feature weights. Newton needs no learning rate and
// converges in a handful of steps for the d ≤ 300 problems in this lab.

const BIAS_PEN = 1e-8;

export const sigmoid = (s) => (s >= 0 ? 1 / (1 + Math.exp(-s)) : Math.exp(s) / (1 + Math.exp(s)));
const softplus = (s) => Math.max(s, 0) + Math.log1p(Math.exp(-Math.abs(s)));

export class Trainer {
  /**
   * Z: standardized N×d design (row-major Float64Array), y: Uint8Array labels.
   * warm: optional initial weights (length d+1) from a previous fit.
   */
  constructor(Z, y, N, d, lambda, warm = null) {
    this.Z = Z; this.y = y; this.N = N; this.d = d; this.D = d + 1;
    this.lambda = Math.max(lambda, 1e-5);
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
    this.maxIter = 60;
    this.converged = N === 0;
    this.loss = this.objective(this.w);
  }

  setLambda(lambda) {
    const l = Math.max(lambda, 1e-5);
    if (l !== this.lambda) { this.lambda = l; this.converged = this.N === 0; this.iters = 0; this.loss = this.objective(this.w); }
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
    return L + this.lambda * R + BIAS_PEN * w[0] * w[0];
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
      g[a] = g[a] * invN + 2 * (a === 0 ? BIAS_PEN : this.lambda) * w[a];
      for (let b = a; b < D; b++) H[a * D + b] *= invN;
      H[a * D + a] += 2 * (a === 0 ? BIAS_PEN : this.lambda) + 1e-10;
      for (let b = a + 1; b < D; b++) H[b * D + a] = H[a * D + b];
    }
    let gmax = 0;
    for (let a = 0; a < D; a++) gmax = Math.max(gmax, Math.abs(g[a]));
    if (gmax < 1e-7) { this.converged = true; return false; }

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
      if (rel < 1e-10) this.converged = true;
    } else this.converged = true;
    this.iters++;
    if (this.iters >= this.maxIter) this.converged = true;
    return !this.converged;
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
