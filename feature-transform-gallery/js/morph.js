// MorphPlot: one canvas that shows the original space at t = 0, feature space
// at t = 1, and the plane being carried from one to the other in between.
//
// Everything moves along a straight path from its position in the original
// plot to its position in the feature-space plot (both scaled to [0, 1]):
// training points, a coarse mesh of grid lines (the "rubber sheet"), small
// cells shaded by the model's prediction, and the boundary curve, which lands
// on a straight line. At t = 1 the shading becomes the model's two half-planes.
// A badge in the corner always says which space is on screen.

import { theme, lut, LIVE_PLOTS } from './plot2d.js';
import { h, isPresent } from './ui.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const label = (v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : String(+v.toFixed(2)));

export class MorphPlot {
  constructor(box, { thumb = false, onHover = null } = {}) {
    this.box = box;
    this.thumb = thumb;
    this.onHover = onHover;
    this.canvas = h('canvas', { role: 'img', 'aria-label': 'Decision boundary in the original space and in feature space' });
    this.ctx = this.canvas.getContext('2d');
    this.tip = h('div', { class: 'tooltip', hidden: true });
    this.badge = h('div', { class: `space-badge${thumb ? ' thumb' : ''}`, hidden: true, 'aria-live': thumb ? null : 'polite' });
    box.append(this.canvas, this.badge, this.tip);
    this.g = null; this.t = 0; this.hoverI = -1;
    this.opts = { mesh: true, rawLine: false };
    this.images = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(box);
    if (!thumb) this.bindPointer();
    LIVE_PLOTS.add(this);
    this.resize();
  }
  destroy() { this.ro.disconnect(); LIVE_PLOTS.delete(this); cancelAnimationFrame(this.anim); }

  set(g) { this.g = g; this.images = null; this.hoverI = -1; this.tip.hidden = true; this.draw(); }
  setT(t) { this.t = Math.min(1, Math.max(0, t)); this.draw(); }
  setOpts(o) { Object.assign(this.opts, o); this.draw(); }

  // Animate t to `to` over `ms`; onStep(t) runs every frame.
  animate(to, { ms = 1500, onStep = null, onDone = null } = {}) {
    cancelAnimationFrame(this.anim);
    const from = this.t, dist = Math.abs(to - from);
    if (dist < 1e-6 || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.setT(to); onStep && onStep(to); onDone && onDone(); return; }
    const t0 = performance.now(), dur = ms * dist;
    const step = (now) => {
      const f = Math.min(1, (now - t0) / dur);
      this.setT(from + (to - from) * f);
      onStep && onStep(this.t);
      if (f < 1) this.anim = requestAnimationFrame(step);
      else onDone && onDone();
    };
    this.anim = requestAnimationFrame(step);
  }
  stop() { cancelAnimationFrame(this.anim); }

  resize() {
    const r = this.box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.w = Math.max(10, r.width); this.hgt = Math.max(10, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.hgt * dpr);
    this.draw();
  }

  get rect() {
    if (this.thumb) return { L: 0, T: 0, W: this.w, H: this.hgt };
    const L = 52, B = 44, T = 8, R = 10;
    return { L, T, W: this.w - L - R, H: this.hgt - T - B };
  }

  // Heat images depend on the theme (region colors), so rebuild them when it changes.
  ensureImages() {
    const T = theme();
    if (this.images && this.images.theme === T) return;
    const g = this.g, L = lut('prob');
    const img = (G, value) => {
      const cv = document.createElement('canvas'), id = new ImageData(G, G), px = id.data;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const v = value(i, j), k = Math.round(255 / (1 + Math.exp(-v))) * 3, o = 4 * ((G - 1 - j) * G + i);
        px[o] = L[k]; px[o + 1] = L[k + 1]; px[o + 2] = L[k + 2]; px[o + 3] = 255;
      }
      cv.width = G; cv.height = G; cv.getContext('2d').putImageData(id, 0, 0);
      return cv;
    };
    const { G, V } = g.heat, [c0, cu, cv] = g.line, Gz = this.thumb ? 48 : 96;
    this.images = {
      theme: T,
      x: img(G, (i, j) => (Number.isFinite(V[j * G + i]) ? V[j * G + i] : 0)),
      z: img(Gz, (i, j) => c0 + cu * (i + 0.5) / Gz + cv * (j + 0.5) / Gz),
      colors: Array.from({ length: 256 }, (_, k) => `rgb(${L[3 * k]},${L[3 * k + 1]},${L[3 * k + 2]})`),
    };
  }

  draw() {
    const c = this.ctx, T = theme(), g = this.g;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.hgt);
    c.fillStyle = T.surface; c.fillRect(0, 0, this.w, this.hgt);
    const { L, T: top, W, H } = this.rect;
    c.fillStyle = T.mid; c.fillRect(L, top, W, H);
    if (!g) return;
    this.ensureImages();
    this.drawBadge();
    const e = ease(this.t), f = 1 - e;
    const X = (a, b) => L + W * (f * a + e * b), Y = (a, b) => top + H * (1 - (f * a + e * b));
    // Pieces stretched further than this are torn apart, not drawn. Features that
    // jump (bins) tear at every jump, as soon as the jump starts to open.
    const tear = g.jumps ? (this.thumb ? 0.09 : 0.05) : this.thumb ? 0.35 : 0.3;
    c.save();
    c.beginPath(); c.rect(L, top, W, H); c.clip();

    // shading: the original space, carried along cell by cell; then the half-planes
    if (e < 1e-4) c.drawImage(this.images.x, L, top, W, H);
    else {
      const bgA = smooth(0.45, 0.95, e);
      if (bgA > 0) { c.globalAlpha = bgA; c.drawImage(this.images.z, L, top, W, H); c.globalAlpha = 1; }
      const qA = g.collapse ? 1 - smooth(0.25, 0.7, e) : 1 - smooth(0.8, 1, e);
      if (qA > 0) this.drawCells(c, X, Y, tear * Math.min(W, H), qA);
    }
    if (this.opts.mesh) this.drawMesh(c, X, Y, tear * Math.min(W, H), T);
    const foldA = 1 - smooth(0, 0.3, e);
    if (g.folds.length && foldA > 0) this.drawFolds(c, L, top, W, H, foldA, T);

    // the boundary: the curve carried along, and in feature space the full straight line
    const lineA = smooth(0.55, 1, e);
    if (lineA > 0) this.drawFullLine(c, L, top, W, H, lineA, T);
    this.drawContour(c, X, Y, tear * Math.min(W, H), T);
    if (this.opts.rawLine && e < 0.3) this.drawRawLine(c, L, top, W, H, 1 - e / 0.3, T);

    this.drawLandmarks(c, X, Y, T);
    this.drawPoints(c, X, Y, T);
    c.restore();
    if (!this.thumb) this.drawAxes(c, e, T);
  }

  // Which space is on screen: x at t = 0, z = Φ(x) at t = 1, and the morph in between.
  drawBadge() {
    const t = this.t, s = t <= 1e-3 ? 'x' : t >= 1 - 1e-3 ? 'z' : 'mid', key = `${s}|${this.g.mode}`;
    if (this.badgeKey !== key) {
      this.badgeKey = key;
      const edge = this.g.mode === 'edge';
      this.badge.textContent = this.thumb
        ? { x: 'x · original space', z: `z = Φ(x) · ${edge ? 'edge-on' : 'feature space'}`, mid: 'x → z = Φ(x)' }[s]
        : { x: 'Original space: x', z: `Feature space: z = Φ(x)${edge ? ', seen edge-on' : ''}`, mid: 'Applying Φ: x → z = Φ(x)' }[s];
      this.badge.dataset.space = s;
      this.badge.hidden = false;
    }
    const { L, T } = this.rect;
    this.badge.style.left = `${L + 6}px`;
    this.badge.style.top = `${T + 6}px`;
  }

  // Hinges: the line where each one folds (0 on one side, rising on the other), labeled hⱼ.
  drawFolds(c, L, top, W, H, alpha, T) {
    c.save();
    c.globalAlpha = alpha; c.setLineDash([5, 4]); c.lineWidth = this.thumb ? 1 : 1.4; c.strokeStyle = T.ink2;
    for (const { a, b } of this.g.folds) {
      c.beginPath(); c.moveTo(L + W * a[0], top + H * (1 - a[1])); c.lineTo(L + W * b[0], top + H * (1 - b[1])); c.stroke();
    }
    c.setLineDash([]);
    if (!this.thumb) {
      c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3;
      for (const { a, b, label: lab } of this.g.folds) {
        const x = L + W * (a[0] + 0.12 * (b[0] - a[0])), y = top + H * (1 - (a[1] + 0.12 * (b[1] - a[1])));
        c.strokeStyle = T.surface; c.strokeText(lab, x, y); c.fillStyle = T.ink; c.fillText(lab, x, y);
      }
    }
    c.restore();
  }

  drawCells(c, X, Y, tearPx, alpha) {
    const { M, X: MX, Z: MZ, Q } = this.g.mesh, V1 = M + 1, paths = new Array(256);
    const px = new Float64Array(8);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const vs = [j * V1 + i, j * V1 + i + 1, (j + 1) * V1 + i + 1, (j + 1) * V1 + i];
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (let k = 0; k < 4; k++) {
        const q = 2 * vs[k], x = X(MX[q], MZ[q]), y = Y(MX[q + 1], MZ[q + 1]);
        px[2 * k] = x; px[2 * k + 1] = y;
        if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
      if (xmax - xmin > tearPx || ymax - ymin > tearPx) continue;
      // same winding for every cell, so folded cells add up instead of cancelling
      const area = (px[2] - px[0]) * (px[7] - px[1]) - (px[6] - px[0]) * (px[3] - px[1]);
      const k = Q[j * M + i], p = paths[k] || (paths[k] = new Path2D()), order = area >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
      p.moveTo(px[2 * order[0]], px[2 * order[0] + 1]);
      for (let m = 1; m < 4; m++) p.lineTo(px[2 * order[m]], px[2 * order[m] + 1]);
      p.closePath();
    }
    c.save();
    c.globalAlpha = alpha; c.lineWidth = 0.6; c.lineJoin = 'round';
    paths.forEach((p, k) => { if (!p) return; c.fillStyle = c.strokeStyle = this.images.colors[k]; c.fill(p); c.stroke(p); });
    c.restore();
  }

  drawMesh(c, X, Y, tearPx, T) {
    const { M, step, X: MX, Z: MZ } = this.g.mesh, V1 = M + 1, path = new Path2D();
    const run = (idx) => {
      let px = 0, py = 0, on = false;
      for (const v of idx) {
        const q = 2 * v, x = X(MX[q], MZ[q]), y = Y(MX[q + 1], MZ[q + 1]);
        if (on && Math.abs(x - px) < tearPx && Math.abs(y - py) < tearPx) path.lineTo(x, y); else path.moveTo(x, y);
        px = x; py = y; on = true;
      }
    };
    for (let a = 0; a <= M; a += step) {
      run(Array.from({ length: V1 }, (_, i) => a * V1 + i)); // a row of constant x₂
      run(Array.from({ length: V1 }, (_, j) => j * V1 + a)); // a column of constant x₁
    }
    // When Φ squeezes the plane onto a curve, every grid line piles up there: fade them.
    const fade = this.g.collapse ? 1 - 0.7 * smooth(0.4, 1, ease(this.t)) : 1;
    c.save();
    c.strokeStyle = T.ink; c.globalAlpha = (this.thumb ? 0.16 : 0.2) * fade; c.lineWidth = 1; c.lineJoin = 'round';
    c.stroke(path);
    c.restore();
  }

  drawFullLine(c, L, top, W, H, alpha, T) {
    const [c0, cu, cv] = this.g.line, pts = [];
    // intersections of c0 + cu·u + cv·v = 0 with the edges of the unit square
    if (Math.abs(cv) > 1e-12) for (const u of [0, 1]) { const v = -(c0 + cu * u) / cv; if (v >= -1e-9 && v <= 1 + 1e-9) pts.push([u, v]); }
    if (Math.abs(cu) > 1e-12) for (const v of [0, 1]) { const u = -(c0 + cv * v) / cu; if (u >= -1e-9 && u <= 1 + 1e-9) pts.push([u, v]); }
    if (pts.length < 2) return;
    const [a, b] = pts;
    c.save();
    c.globalAlpha = alpha; c.lineCap = 'round';
    c.beginPath(); c.moveTo(L + W * a[0], top + H * (1 - a[1])); c.lineTo(L + W * b[0], top + H * (1 - b[1]));
    c.strokeStyle = T.surface; c.lineWidth = (this.thumb ? 1.6 : 2.5) + 2.5; c.globalAlpha = alpha * 0.85; c.stroke();
    c.strokeStyle = T.ink; c.lineWidth = this.thumb ? 1.6 : 2.5; c.globalAlpha = alpha; c.stroke();
    c.restore();
  }

  drawContour(c, X, Y, tearPx, T) {
    const path = new Path2D();
    for (const line of this.g.contour) {
      let px = 0, py = 0, on = false;
      for (let k = 0; k < line.length; k += 4) {
        const x = X(line[k], line[k + 2]), y = Y(line[k + 1], line[k + 3]);
        if (on && Math.abs(x - px) < tearPx && Math.abs(y - py) < tearPx) path.lineTo(x, y); else path.moveTo(x, y);
        px = x; py = y; on = true;
      }
    }
    const wdt = (this.thumb ? 1.6 : 2.5) * (isPresent() ? 1.3 : 1);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = T.surface; c.lineWidth = wdt + 2.5; c.globalAlpha = 0.85; c.stroke(path);
    c.strokeStyle = T.ink; c.lineWidth = wdt; c.globalAlpha = 1; c.stroke(path);
    c.restore();
  }

  drawRawLine(c, L, top, W, H, alpha, T) {
    const fit = getComputedStyle(document.documentElement).getPropertyValue('--fit').trim() || T.ink2, path = new Path2D();
    for (const line of this.g.rawLine) {
      path.moveTo(L + W * line[0], top + H * (1 - line[1]));
      for (let k = 2; k < line.length; k += 2) path.lineTo(L + W * line[k], top + H * (1 - line[k + 1]));
    }
    c.save();
    c.setLineDash([9, 6]); c.lineCap = 'round';
    c.strokeStyle = T.surface; c.lineWidth = 4.6; c.globalAlpha = 0.85 * alpha; c.stroke(path);
    c.strokeStyle = fit; c.lineWidth = 2.4; c.globalAlpha = alpha; c.stroke(path);
    c.restore();
  }

  drawLandmarks(c, X, Y, T) {
    const s = this.thumb ? 3.5 : 6;
    c.save();
    for (const [a, b, u, v] of this.g.landmarks) {
      const x = X(a, u), y = Y(b, v);
      c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath();
      c.fillStyle = T.surface; c.fill(); c.strokeStyle = T.ink; c.lineWidth = this.thumb ? 1 : 1.75; c.stroke();
    }
    c.restore();
  }

  drawPoints(c, X, Y, T) {
    const { X: PX, Z: PZ, y } = this.g.points, n = y.length;
    const r = (this.thumb ? 2.5 : 4) * (isPresent() ? 1.3 : 1);
    c.save();
    for (let i = 0; i < n; i++) {
      const x = X(PX[2 * i], PZ[2 * i]), yy = Y(PX[2 * i + 1], PZ[2 * i + 1]);
      c.beginPath();
      if ((y[i] ? T.shape1 : T.shape0) === 'square') c.rect(x - r * 0.9, yy - r * 0.9, 1.8 * r, 1.8 * r);
      else c.arc(x, yy, r, 0, 2 * Math.PI);
      c.lineWidth = T.edgeW * (this.thumb ? 0.7 : 1); c.strokeStyle = y[i] ? T.edge1 : T.edge0; c.stroke();
      c.fillStyle = y[i] ? T.c1 : T.c0; c.fill();
    }
    if (this.hoverI >= 0 && this.hoverI < n) {
      // the hovered point's path: where it starts (original space) and where it ends up (feature space)
      const i = this.hoverI, { L, T: top, W, H } = this.rect;
      const sx = L + W * PX[2 * i], sy = top + H * (1 - PX[2 * i + 1]), fx = L + W * PZ[2 * i], fy = top + H * (1 - PZ[2 * i + 1]);
      c.setLineDash([3, 4]); c.strokeStyle = T.ink; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(fx, fy); c.stroke(); c.setLineDash([]);
      for (const [px, py] of [[sx, sy], [fx, fy]]) { c.beginPath(); c.arc(px, py, 2.5, 0, 2 * Math.PI); c.fillStyle = T.ink; c.fill(); }
      const x = X(PX[2 * i], PZ[2 * i]), yy = Y(PX[2 * i + 1], PZ[2 * i + 1]);
      c.beginPath(); c.arc(x, yy, r + 4, 0, 2 * Math.PI); c.lineWidth = 2; c.strokeStyle = T.ink; c.stroke();
    }
    c.restore();
  }

  drawAxes(c, e, T) {
    const g = this.g, { L, T: top, W, H } = this.rect;
    c.save();
    c.strokeStyle = T.axis; c.lineWidth = 1;
    c.strokeRect(L + 0.5, top + 0.5, W - 1, H - 1);
    c.font = '11px system-ui, sans-serif';
    const ticks = (tk, alpha) => {
      if (!tk || alpha <= 0) return;
      c.globalAlpha = alpha; c.fillStyle = T.muted;
      c.textAlign = 'center'; c.textBaseline = 'top';
      for (const { v, n } of tk[0]) if (n >= -1e-6 && n <= 1 + 1e-6) c.fillText(label(v), L + W * n, top + H + 5);
      c.textAlign = 'right'; c.textBaseline = 'middle';
      for (const { v, n } of tk[1]) if (n >= -1e-6 && n <= 1 + 1e-6) c.fillText(label(v), L - 5, top + H * (1 - n));
    };
    const ax = 1 - smooth(0, 0.4, e), az = smooth(0.6, 1, e);
    ticks(g.xTicks, ax);
    ticks(g.zTicks, az);
    const titles = (pair, alpha) => {
      if (alpha <= 0) return;
      c.globalAlpha = alpha; c.fillStyle = T.ink; c.font = 'italic 14px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(pair[0], L + W / 2, top + H + 22);
      c.save(); c.translate(13, top + H / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle'; c.fillText(pair[1], 0, 0); c.restore();
    };
    titles(g.titles.x, 1 - smooth(0.2, 0.5, e));
    titles(g.titles.z, smooth(0.5, 0.8, e));
    c.restore();
  }

  // ---- hover: nearest training point at its current position ----
  bindPointer() {
    const cv = this.canvas;
    cv.addEventListener('pointermove', (ev) => {
      if (!this.g) return;
      const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const { L, T: top, W, H } = this.rect, e = ease(this.t), f = 1 - e, { X: PX, Z: PZ, y } = this.g.points;
      let best = -1, bd = 10;
      for (let i = 0; i < y.length; i++) {
        const d = Math.hypot(L + W * (f * PX[2 * i] + e * PZ[2 * i]) - mx, top + H * (1 - (f * PX[2 * i + 1] + e * PZ[2 * i + 1])) - my);
        if (d < bd) { bd = d; best = i; }
      }
      if (best !== this.hoverI) { this.hoverI = best; this.draw(); }
      const html = best >= 0 && this.onHover ? this.onHover(best) : null;
      if (!html) { this.tip.hidden = true; return; }
      this.tip.innerHTML = html;
      this.tip.hidden = false;
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      let x = mx + 14, yy = my + 14;
      if (x + tw > this.w) x = mx - tw - 14;
      if (yy + th > this.hgt) yy = my - th - 14;
      this.tip.style.left = `${Math.max(0, x)}px`;
      this.tip.style.top = `${Math.max(0, yy)}px`;
    });
    cv.addEventListener('pointerleave', () => { this.tip.hidden = true; if (this.hoverI >= 0) { this.hoverI = -1; this.draw(); } });
  }
}
