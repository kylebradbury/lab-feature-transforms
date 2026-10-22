// Canvas 2-D rendering: the X-space decision plot, the Z-space panel and
// small line charts. Colors come from CSS tokens so light/dark both work.

import { marchingSquares, chainSegments } from './geometry.js';
import { h, tex, fmt, pct, isPresent } from './ui.js';

// ---- theme -------------------------------------------------------------------

let THEME = null;
const LUTS = new Map();
export const LIVE_PLOTS = new Set(); // redrawn on theme / presentation changes

function parseColor(s) {
  s = s.trim();
  if (s.startsWith('#')) {
    const v = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}
export function refreshTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  const word = (n, fallback) => g(n).replace(/["']/g, '').trim() || fallback;
  const dark = g('color-scheme').includes('dark');
  THEME = {
    dark, surface: g('--surface'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), grid: g('--grid'), axis: g('--axis'),
    c0: g('--class0'), c1: g('--class1'), mid: g('--heat-mid'),
    // per-class point style and the class names used in text (see css/themes/)
    edge0: g('--class0-edge') || g('--surface'), edge1: g('--class1-edge') || g('--surface'),
    edgeW: parseFloat(g('--point-edge-width')) || 1.5,
    shape0: word('--class0-shape', 'circle'), shape1: word('--class1-shape', 'square'),
    names: [word('--class0-name', 'class 0'), word('--class1-name', 'class 1')],
  };
  const rgb = { surface: parseColor(THEME.surface), c0: parseColor(THEME.c0), c1: parseColor(THEME.c1), mid: parseColor(THEME.mid) };
  // Confident-region shading: the theme's --region0/1, else a tint of each class color.
  const strength = dark ? 0.5 : 0.42;
  rgb.r0 = g('--region0') ? parseColor(g('--region0')) : mix(rgb.surface, rgb.c0, strength);
  rgb.r1 = g('--region1') ? parseColor(g('--region1')) : mix(rgb.surface, rgb.c1, strength);
  THEME.rgb = rgb;
  LUTS.clear();
  return THEME;
}
export const theme = () => THEME || refreshTheme();

const mix = (a, b, t) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
// 256-entry RGB lookup from p = σ(logit): class-0 region → neutral (p = 0.5) → class-1 region.
function lut(mode) {
  const key = mode;
  if (LUTS.has(key)) return LUTS.get(key);
  const T = theme(), out = new Uint8ClampedArray(256 * 3);
  const pole0 = T.rgb.r0, pole1 = T.rgb.r1;
  for (let k = 0; k < 256; k++) {
    const p = k / 255, t = Math.abs(p - 0.5) * 2;
    let c;
    if (mode === 'class') c = p >= 0.5 ? pole1 : pole0;
    else c = mix(T.rgb.mid, p >= 0.5 ? pole1 : pole0, Math.pow(t, 0.75));
    out.set(c, 3 * k);
  }
  LUTS.set(key, out);
  return out;
}

// ---- ticks ---------------------------------------------------------------------

function niceTicks(lo, hi, target = 6) {
  const span = hi - lo, raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= target) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) {
    const v = m * Math.pow(10, e);
    if (v >= lo && v <= hi) out.push(v);
  }
  return out;
}

// ---- X-space plot --------------------------------------------------------------

export class XPlot {
  constructor(box, { thumb = false, axisLabels = ['x_1', 'x_2'], outerLabels = false } = {}) {
    this.box = box;
    this.thumb = thumb;
    this.axisLabels = axisLabels;
    this.outerLabels = outerLabels; // axis titles outside the plot area instead of in its corners; may be {L, B} margins
    this.canvas = h('canvas', { role: 'img', 'aria-label': 'Decision regions plot' });
    this.ctx = this.canvas.getContext('2d');
    this.heat = document.createElement('canvas');
    this.tip = h('div', { class: 'tooltip', hidden: true });
    box.append(this.canvas, this.tip);
    this.view = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
    this.xlog = false; this.ylog = false;
    this.data = null;
    this.onHover = null; this.onHandleDrag = null; this.onClick = null;
    this.drag = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(box);
    if (!thumb) this.bindPointer();
    LIVE_PLOTS.add(this);
    this.resize();
  }
  destroy() { this.ro.disconnect(); LIVE_PLOTS.delete(this); }

  setView(view, { xlog = false, ylog = false } = {}) { this.view = view; this.xlog = xlog; this.ylog = ylog; }

  resize() {
    const r = this.box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.cssW = Math.max(10, r.width); this.cssH = Math.max(10, r.height);
    this.canvas.width = Math.round(this.cssW * dpr); this.canvas.height = Math.round(this.cssH * dpr);
    this.dpr = dpr;
    this.draw();
  }

  get rect() {
    if (this.thumb) return { L: 0, T: 0, W: this.cssW, H: this.cssH };
    const o = this.outerLabels, L = o ? o.L ?? 54 : 38, B = o ? o.B ?? 42 : 28, T = 8, R = 10;
    return { L, T, W: this.cssW - L - R, H: this.cssH - T - B };
  }
  tx(x) { return this.xlog ? Math.log(x) : x; }
  ty(y) { return this.ylog ? Math.log(y) : y; }
  sx(x) { const { L, W } = this.rect, v = this.view; return L + (W * (this.tx(x) - this.tx(v.xmin))) / (this.tx(v.xmax) - this.tx(v.xmin)); }
  sy(y) { const { T, H } = this.rect, v = this.view; return T + H - (H * (this.ty(y) - this.ty(v.ymin))) / (this.ty(v.ymax) - this.ty(v.ymin)); }
  ix(px) { const { L, W } = this.rect, v = this.view, t = this.tx(v.xmin) + ((px - L) / W) * (this.tx(v.xmax) - this.tx(v.xmin)); return this.xlog ? Math.exp(t) : t; }
  iy(py) { const { T, H } = this.rect, v = this.view, t = this.ty(v.ymin) + ((T + H - py) / H) * (this.ty(v.ymax) - this.ty(v.ymin)); return this.ylog ? Math.exp(t) : t; }
  // grid index → px (grid sampled at cell centers)
  gx(i, G) { const { L, W } = this.rect; return L + ((i + 0.5) / G) * W; }
  gy(j, G) { const { T, H } = this.rect; return T + H - ((j + 0.5) / G) * H; }
  scale() { return (this.thumb ? 0.6 : 1) * (isPresent() ? 1.4 : 1); }

  render(data) { this.data = data; this.draw(); }

  draw() {
    const c = this.ctx, T = theme(), d = this.data;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.cssW, this.cssH);
    const { L, T: top, W, H } = this.rect;
    c.fillStyle = T.surface; c.fillRect(0, 0, this.cssW, this.cssH);
    if (d && d.grid) this.drawHeat(d.grid, d.shade);
    else { c.fillStyle = T.mid; c.fillRect(L, top, W, H); }
    if (!this.thumb) this.drawAxes();
    if (!d) return;
    c.save();
    c.beginPath(); c.rect(L, top, W, H); c.clip();
    for (const o of d.underlays || []) o(c, this);
    for (const g of d.ghosts || []) this.drawSegs(g.segs, g.G, { color: g.color || T.ink, width: g.width || 1.5, dash: g.dash || [6, 5], alpha: g.alpha ?? 0.9, halo: false });
    if (d.grid && d.segs) this.drawSegs(d.segs, d.grid.G, { color: T.ink, width: (this.thumb ? 1.6 : 2.5) * (isPresent() ? 1.3 : 1), halo: true });
    for (const p of d.points || []) this.drawPoints(p);
    for (const o of d.overlays || []) o(c, this);
    for (const hd of d.handles || []) this.drawHandle(hd);
    c.restore();
  }

  drawHeat(grid, shade = 'prob') {
    const { G, V, Gy = G } = grid, L = lut(shade), img = new ImageData(G, Gy), px = img.data, mid = theme().rgb.mid;
    for (let j = 0; j < Gy; j++) {
      const row = Gy - 1 - j;
      for (let i = 0; i < G; i++) {
        const v = V[j * G + i], o = 4 * (row * G + i);
        // No value (e.g. a spot no data point can reach): neutral, never a class color.
        if (!Number.isFinite(v)) { px[o] = mid[0]; px[o + 1] = mid[1]; px[o + 2] = mid[2]; px[o + 3] = 255; continue; }
        const k = Math.round((1 / (1 + Math.exp(-v))) * 255) * 3;
        px[o] = L[k]; px[o + 1] = L[k + 1]; px[o + 2] = L[k + 2]; px[o + 3] = 255;
      }
    }
    this.heat.width = G; this.heat.height = Gy;
    this.heat.getContext('2d').putImageData(img, 0, 0);
    const { L: l, T: t, W, H } = this.rect;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.heat, l, t, W, H);
  }

  drawAxes() {
    const c = this.ctx, T = theme(), v = this.view, { L, T: top, W, H } = this.rect;
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = T.muted; c.strokeStyle = T.grid; c.lineWidth = 1;
    const xt = this.xlog ? logTicks(v.xmin, v.xmax) : niceTicks(v.xmin, v.xmax);
    const yt = this.ylog ? logTicks(v.ymin, v.ymax) : niceTicks(v.ymin, v.ymax);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (const x of xt) {
      const px = Math.round(this.sx(x)) + 0.5;
      c.globalAlpha = 0.55; c.beginPath(); c.moveTo(px, top); c.lineTo(px, top + H); c.stroke(); c.globalAlpha = 1;
      c.fillText(fmtTick(x), px, top + H + 5);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (const y of yt) {
      const py = Math.round(this.sy(y)) + 0.5;
      c.globalAlpha = 0.55; c.beginPath(); c.moveTo(L, py); c.lineTo(L + W, py); c.stroke(); c.globalAlpha = 1;
      c.fillText(fmtTick(y), L - 5, py);
    }
    c.strokeStyle = T.axis;
    c.strokeRect(L + 0.5, top + 0.5, W - 1, H - 1);
    if (!this.xlog && v.xmin < 0 && v.xmax > 0) { const px = Math.round(this.sx(0)) + 0.5; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(px, top); c.lineTo(px, top + H); c.stroke(); c.globalAlpha = 1; }
    if (!this.ylog && v.ymin < 0 && v.ymax > 0) { const py = Math.round(this.sy(0)) + 0.5; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(L, py); c.lineTo(L + W, py); c.stroke(); c.globalAlpha = 1; }
    const xl = this.axisLabels[0].replace('x_1', 'x₁').replace('z_1', 'z₁'), yl = this.axisLabels[1].replace('x_2', 'x₂').replace('z_2', 'z₂');
    if (this.outerLabels) {
      // axis titles in the margins: centered under the x ticks, rotated left of the y ticks
      c.fillStyle = T.ink; c.font = 'italic 14px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(xl, L + W / 2, top + H + 19);
      c.save(); c.translate(Math.max(9, L - 41), top + H / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle';
      c.fillText(yl, 0, 0);
      c.restore();
      return;
    }
    c.fillStyle = T.ink2; c.font = 'italic 12px system-ui, sans-serif';
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(xl, L + W - 4, top + H - 3);
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(yl, L + 4, top + 3);
  }

  drawSegs(segs, G, { color, width, dash = null, alpha = 1, halo = false }) {
    if (!segs || !segs.length) return;
    const c = this.ctx, T = theme();
    const path = new Path2D();
    if (dash && dash.length) {
      // dashes restart at every moveTo, so draw joined polylines
      for (const line of chainSegments(segs)) {
        path.moveTo(this.gx(line[0], G), this.gy(line[1], G));
        for (let k = 2; k < line.length; k += 2) path.lineTo(this.gx(line[k], G), this.gy(line[k + 1], G));
      }
    } else {
      for (let k = 0; k < segs.length; k += 4) {
        path.moveTo(this.gx(segs[k], G), this.gy(segs[k + 1], G));
        path.lineTo(this.gx(segs[k + 2], G), this.gy(segs[k + 3], G));
      }
    }
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (dash) c.setLineDash(dash);
    if (halo) { c.strokeStyle = T.surface; c.lineWidth = width + 2.5; c.globalAlpha = 0.85; c.stroke(path); }
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.stroke(path);
    c.restore();
  }

  // pts: {X, y, hollow, mistakes, alpha}
  drawPoints(pts) {
    const c = this.ctx, T = theme(), s = this.scale(), r = 4 * s, n = pts.y.length;
    c.save();
    c.globalAlpha = pts.alpha ?? 1;
    for (let i = 0; i < n; i++) {
      const px = this.sx(pts.X[2 * i]), py = this.sy(pts.X[2 * i + 1]);
      if (px < -10 || py < -10 || px > this.cssW + 10 || py > this.cssH + 10) continue;
      const col = pts.y[i] ? T.c1 : T.c0;
      c.beginPath();
      if ((pts.y[i] ? T.shape1 : T.shape0) === 'square') c.rect(px - r * 0.9, py - r * 0.9, 1.8 * r, 1.8 * r);
      else c.arc(px, py, r, 0, 2 * Math.PI);
      if (pts.hollow) {
        c.fillStyle = T.surface; c.fill();
        c.lineWidth = 2 * Math.min(1, s); c.strokeStyle = col; c.stroke();
      } else {
        // edge first, then fill: the outer half of the edge shows as an outline
        c.lineWidth = T.edgeW * Math.min(1, s); c.strokeStyle = pts.y[i] ? T.edge1 : T.edge0; c.stroke();
        c.fillStyle = col; c.fill();
      }
      if (pts.mistakes && pts.mistakes[i]) {
        c.beginPath(); c.arc(px, py, r + 3.5, 0, 2 * Math.PI); c.lineWidth = 1.5; c.strokeStyle = T.ink; c.stroke();
      }
    }
    c.restore();
  }

  drawHandle(hd) {
    const c = this.ctx, T = theme(), s = isPresent() ? 1.4 : 1;
    const px = this.sx(hd.x), py = this.sy(hd.y), { T: top, H, W, L } = this.rect;
    c.save();
    c.lineWidth = 2;
    if (hd.kind === 'center') {
      c.strokeStyle = T.surface; c.lineWidth = 4;
      c.beginPath(); c.moveTo(px - 12 * s, py); c.lineTo(px + 12 * s, py); c.moveTo(px, py - 12 * s); c.lineTo(px, py + 12 * s); c.stroke();
      c.strokeStyle = T.ink; c.lineWidth = 1.5; c.stroke();
      c.beginPath(); c.arc(px, py, 6 * s, 0, 2 * Math.PI); c.fillStyle = T.surface; c.fill(); c.lineWidth = 2; c.stroke();
    } else if (hd.kind === 'landmark' || hd.kind === 'marker') {
      if (hd.ringR) {
        const rp = Math.abs(this.sx(hd.x + hd.ringR) - px);
        c.setLineDash([3, 4]); c.strokeStyle = T.ink2; c.lineWidth = 1; c.globalAlpha = 0.7;
        c.beginPath(); c.arc(px, py, rp, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      }
      const size = (hd.kind === 'marker' ? 3.5 : 5) * s + 6 * Math.min(1, Math.abs(hd.weight || 0)) * s;
      c.beginPath(); c.moveTo(px, py - size); c.lineTo(px + size, py); c.lineTo(px, py + size); c.lineTo(px - size, py); c.closePath();
      c.fillStyle = hd.weight > 0 ? T.c1 : hd.weight < 0 ? T.c0 : T.surface; c.fill();
      c.strokeStyle = T.ink; c.lineWidth = hd.kind === 'marker' ? 1 : 1.75; c.stroke();
    } else if (hd.kind === 'vline') {
      c.setLineDash([6, 4]); c.strokeStyle = T.ink; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, top); c.lineTo(px, top + H); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(px, top + H - 10 * s, 6 * s, 0, 2 * Math.PI); c.fillStyle = T.surface; c.fill(); c.lineWidth = 2; c.stroke();
    } else if (hd.kind === 'corner') {
      c.setLineDash([6, 4]); c.strokeStyle = T.ink; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, py); c.lineTo(L + W, py); c.moveTo(px, py); c.lineTo(px, top); c.stroke(); c.setLineDash([]);
      c.fillStyle = T.surface; c.fillRect(px - 6 * s, py - 6 * s, 12 * s, 12 * s); c.lineWidth = 2; c.strokeRect(px - 6 * s, py - 6 * s, 12 * s, 12 * s);
    }
    c.restore();
  }

  // ---- pointer ----
  bindPointer() {
    const cv = this.canvas;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const hit = (px, py) => {
      const hs = (this.data && this.data.handles) || [], R = isPresent() ? 16 : 11;
      let best = null, bd = R;
      for (const hd of hs) {
        if (!hd.draggable) continue;
        const dx = this.sx(hd.x) - px;
        const dist = hd.kind === 'vline' ? Math.abs(dx) : Math.hypot(dx, this.sy(hd.y) - py);
        if (dist <= bd) { bd = dist; best = hd; }
      }
      return best;
    };
    cv.addEventListener('pointerdown', (e) => {
      const [px, py] = pos(e), hd = hit(px, py);
      this.down = { px, py, hd, moved: false };
      if (hd) {
        cv.setPointerCapture(e.pointerId);
        this.drag = hd;
        this.tip.hidden = true;
        e.preventDefault();
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const [px, py] = pos(e);
      if (this.down && Math.hypot(px - this.down.px, py - this.down.py) > 3) this.down.moved = true;
      if (this.drag) {
        const v = this.view, x = clamp(this.ix(px), v.xmin, v.xmax), y = clamp(this.iy(py), v.ymin, v.ymax);
        this.onHandleDrag && this.onHandleDrag(this.drag, x, y, 'move');
        return;
      }
      cv.style.cursor = hit(px, py) ? 'grab' : this.onClick ? 'crosshair' : 'default';
      this.hover(px, py);
    });
    const up = (e) => {
      const [px, py] = pos(e);
      if (this.drag) {
        const hd = this.drag;
        this.drag = null;
        const v = this.view;
        if (this.down && !this.down.moved) this.onClick && this.onClick(this.ix(px), this.iy(py), e, hd);
        else this.onHandleDrag && this.onHandleDrag(hd, clamp(this.ix(px), v.xmin, v.xmax), clamp(this.iy(py), v.ymin, v.ymax), 'end');
      } else if (this.down && !this.down.moved) {
        this.onClick && this.onClick(this.ix(px), this.iy(py), e, null);
      }
      this.down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { this.drag = null; this.down = null; });
    cv.addEventListener('pointerleave', () => { if (!this.drag) this.tip.hidden = true; });
  }

  nearestPoint(px, py) {
    let best = null, bd = 8;
    (this.data && this.data.points || []).forEach((set, si) => {
      for (let i = 0; i < set.y.length; i++) {
        const d = Math.hypot(this.sx(set.X[2 * i]) - px, this.sy(set.X[2 * i + 1]) - py);
        if (d < bd) { bd = d; best = { set: si, i, label: set.y[i], hollow: set.hollow, name: set.name, x: set.X[2 * i], y: set.X[2 * i + 1] }; }
      }
    });
    return best;
  }

  hover(px, py) {
    const { L, T: top, W, H } = this.rect;
    if (!this.onHover || px < L || px > L + W || py < top || py > top + H) { this.tip.hidden = true; return; }
    const html = this.onHover(this.ix(px), this.iy(py), this.nearestPoint(px, py));
    if (!html) { this.tip.hidden = true; return; }
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = px + 14, y = py + 14;
    if (x + tw > this.cssW) x = px - tw - 14;
    if (y + th > this.cssH) y = py - th - 14;
    this.tip.style.left = `${Math.max(0, x)}px`;
    this.tip.style.top = `${Math.max(0, y)}px`;
  }
}

function fmtTick(v) {
  if (Math.abs(v) >= 1000) return `${v / 1000}k`;
  return String(+v.toFixed(2));
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- evaluation helpers -------------------------------------------------------

/**
 * Evaluate logit w0 + w·Φ(x) on a G×G grid of cell centers over `view`
 * (log-spaced along log axes). Returns {G, V}.
 */
export function evalGrid(fmap, w, view, G, { xlog = false, ylog = false } = {}) {
  const V = new Float32Array(G * G), d = fmap.dim, row = new Float64Array(Math.max(1, d));
  const ax = (lo, hi, t, lg) => (lg ? Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo))) : lo + t * (hi - lo));
  const xs = new Float64Array(G);
  for (let i = 0; i < G; i++) xs[i] = ax(view.xmin, view.xmax, (i + 0.5) / G, xlog);
  for (let j = 0; j < G; j++) {
    const y = ax(view.ymin, view.ymax, (j + 0.5) / G, ylog);
    for (let i = 0; i < G; i++) {
      fmap.evalRow(xs[i], y, row);
      let s = w[0];
      for (let k = 0; k < d; k++) s += w[k + 1] * row[k];
      V[j * G + i] = s;
    }
  }
  return { G, V };
}

// ---- Z-space panel ---------------------------------------------------------

export class ZPanel {
  constructor(container, { onOpen3D } = {}) {
    this.el = container;
    this.title = h('div', { class: 'plot-title' }, h('b', {}, 'Z-space'), h('span', { class: 'zsub' }));
    this.body = h('div');
    this.note = h('div', { class: 'znote' });
    this.el.append(this.title, this.body, this.note);
    this.mode = null;
    this.onOpen3D = onOpen3D;
    this.lastBars = 0;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.body.innerHTML = '';
    if (this.plot) { this.plot.destroy(); this.plot = null; }
    if (mode === 'strip' || mode === 'plane') {
      const box = h('div', { class: 'plot-box' + (mode === 'strip' ? ' strip' : '') });
      this.body.append(box);
      this.plot = new XPlot(box, { axisLabels: mode === 'strip' ? ['z_1', ''] : ['z_1', 'z_2'] });
    } else if (mode === 'bars') {
      this.bars = h('div', { class: 'zbars' });
      this.btn3d = h('button', { class: 'btn', type: 'button', hidden: true }, 'Open 3-D Z-space view');
      this.btn3d.addEventListener('click', () => this.onOpen3D && this.onOpen3D());
      this.body.append(this.bars, h('div', { class: 'btn-row' }, this.btn3d));
    }
  }

  // sc: Scene (needs prep, wRaw, wStd, mode)
  update(sc) {
    const prep = sc.prep;
    if (!prep) return;
    const d = prep.d, sub = this.title.querySelector('.zsub');
    sub.innerHTML = d === 0 ? '' : `z = Φ(x) has <b>d = ${d}</b> feature${d === 1 ? '' : 's'}`;
    if (d === 0) {
      this.setMode('none');
      this.body.innerHTML = '<p class="hint">No features: the model is just the bias w₀, so one class is predicted everywhere.</p>';
      this.note.textContent = '';
      return;
    }
    const w = sc.wRaw, cols = prep.fmap.columns;
    if (d <= 2) {
      this.setMode(d === 1 ? 'strip' : 'plane');
      const Z = [prep.tr, prep.te];
      let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      for (const s of Z) for (let i = 0; i < s.N; i++) for (let k = 0; k < d; k++) {
        const v = s.Z[i * d + k];
        if (Number.isFinite(v)) { lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); }
      }
      if (!Number.isFinite(lo[0])) { lo = [-1, -1]; hi = [1, 1]; }
      const pad = (k) => Math.max(1e-6, 0.08 * (hi[k] - lo[k]) || 0.5);
      const view = { xmin: lo[0] - pad(0), xmax: hi[0] + pad(0), ymin: d === 2 ? lo[1] - pad(1) : -1, ymax: d === 2 ? hi[1] + pad(1) : 1 };
      this.plot.setView(view);
      this.plot.axisLabels = d === 2 ? [cols[0].tex, cols[1].tex].map(texLabel) : [texLabel(cols[0].tex), ''];
      const G = 64, V = new Float32Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const z1 = view.xmin + ((i + 0.5) / G) * (view.xmax - view.xmin), z2 = view.ymin + ((j + 0.5) / G) * (view.ymax - view.ymin);
        V[j * G + i] = w[0] + w[1] * z1 + (d === 2 ? w[2] * z2 : 0);
      }
      const pts = [];
      const toXY = (s, hollow) => {
        const X = new Float64Array(2 * s.N);
        for (let i = 0; i < s.N; i++) {
          X[2 * i] = s.Z[i * d];
          X[2 * i + 1] = d === 2 ? s.Z[i * d + 1] : jitter(i, s.y[i]);
        }
        return { X, y: s.y, hollow, name: hollow ? 'test' : 'train' };
      };
      if (sc.cfg.view.showTrain !== false) pts.push(toXY(prep.tr, false));
      if (sc.cfg.view.showTest) pts.push(toXY(prep.te, true));
      this.plot.onHover = (z1, z2, near) => {
        const s = w[0] + w[1] * z1 + (d === 2 ? w[2] * z2 : 0);
        return `<span class="k">z₁</span> ${fmt(z1)}${d === 2 ? `&nbsp; <span class="k">z₂</span> ${fmt(z2)}` : ''}<br><span class="k">w₀ + wᵀz</span> = ${fmt(s)}<br><span class="k">P(orange)</span> = ${pct(1 / (1 + Math.exp(-s)))}${near ? `<div class="sep"></div>${near.name} point, class ${near.label ? 'orange' : 'blue'}` : ''}`;
      };
      this.plot.render({ grid: { G, V }, segs: marchingSquares(V, G), points: pts, shade: sc.cfg.view.shade });
      this.note.innerHTML = d === 1
        ? 'In Z-space the boundary is a single threshold on z₁ (points are jittered vertically so you can see them).'
        : 'In Z-space the boundary is always a straight line: w₀ + w₁z₁ + w₂z₂ = 0.';
      return;
    }
    this.setMode('bars');
    this.btn3d.hidden = d !== 3;
    const now = performance.now();
    if (now - this.lastBars < 120 && sc.busy) return;
    this.lastBars = now;
    const useStd = sc.cfg.fit.mode === 'auto' && sc.wStd;
    const wv = useStd ? sc.wStd : w;
    const idx = Array.from({ length: d }, (_, k) => k).sort((a, b) => Math.abs(wv[b + 1]) - Math.abs(wv[a + 1])).slice(0, 16);
    const mx = Math.max(1e-12, ...idx.map((k) => Math.abs(wv[k + 1])));
    this.bars.innerHTML = '';
    for (const k of idx) {
      const v = wv[k + 1], frac = Math.min(1, Math.abs(v) / mx) * 50;
      const bar = h('div', { class: `bar ${v >= 0 ? 'pos' : 'neg'}`, style: { left: v >= 0 ? '50%' : `${50 - frac}%`, width: `${frac}%` } });
      this.bars.append(h('div', { class: 'row', title: `${fmt(v, 3)}` }, h('div', { class: 'lab', html: tex(cols[k].tex) }), h('div', { class: 'track' }, bar)));
    }
    if (d > idx.length) this.bars.append(h('div', { class: 'more' }, `… and ${d - idx.length} more`));
    this.note.innerHTML = `Z-space is ${d}-dimensional, so the boundary w₀ + wᵀz = 0 is a flat hyperplane we cannot draw directly. Bars show the ${useStd ? 'weights on standardized features' : 'weights'} (largest ${Math.min(d, 16)} by size; orange pushes toward the orange class).`;
  }
}

function texLabel(t) {
  return t.replace(/\\[a-zA-Z]+/g, (m) => ({ '\\sin': 'sin', '\\cos': 'cos', '\\theta': 'θ', '\\omega': 'ω', '\\log': 'log', '\\lvert': '|', '\\rvert': '|', '\\lVert': '‖', '\\rVert': '‖', '\\max': 'max', '\\min': 'min', '\\infty': '∞', '\\mathbb': '' })[m] ?? '').replace(/[{}]/g, '').replace(/_1/g, '₁').replace(/_2/g, '₂').replace(/\^2/g, '²').replace(/\^3/g, '³');
}
function jitter(i, y) {
  const t = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (t - Math.floor(t)) * 0.8 - 0.4 + (y ? 0.45 : -0.45);
}

// ---- line chart -------------------------------------------------------------

export class LineChart {
  constructor(box, { xLabel = '', xLog = false, xFmt = (v) => fmt(v), yFmt = pct, yRange = [0, 1] } = {}) {
    this.box = box;
    this.canvas = h('canvas');
    this.tip = h('div', { class: 'tooltip', hidden: true });
    box.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext('2d');
    Object.assign(this, { xLabel, xLog, xFmt, yFmt, yRange });
    this.data = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(box);
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('pointerleave', () => { this.tip.hidden = true; this.hx = null; this.draw(); });
    LIVE_PLOTS.add(this);
    this.resize();
  }
  destroy() { this.ro.disconnect(); LIVE_PLOTS.delete(this); }
  resize() {
    const r = this.box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.w = Math.max(10, r.width); this.h = Math.max(10, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.draw();
  }
  // data: {xs, series:[{name, ys, dash, strong}], marker}
  set(data) { this.data = data; this.draw(); }
  get rect() { return { L: 44, T: 10, W: this.w - 44 - 64, H: this.h - 10 - 34 }; }
  px(x) { const { L, W } = this.rect, xs = this.data.xs, a = xs[0], b = xs[xs.length - 1], f = this.xLog ? Math.log : (v) => v; return L + (W * (f(x) - f(a))) / (f(b) - f(a) || 1); }
  py(y) { const { T, H } = this.rect, [a, b] = this.yRange; return T + H - (H * (y - a)) / (b - a); }
  draw() {
    const c = this.ctx, T = theme();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = T.surface; c.fillRect(0, 0, this.w, this.h);
    const { L, T: top, W, H } = this.rect;
    c.font = '11px system-ui, sans-serif'; c.fillStyle = T.muted; c.strokeStyle = T.grid; c.lineWidth = 1;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (const y of niceTicks(this.yRange[0], this.yRange[1], 4)) {
      const py = Math.round(this.py(y)) + 0.5;
      c.beginPath(); c.moveTo(L, py); c.lineTo(L + W, py); c.stroke();
      c.fillText(this.yFmt(y).replace('.0%', '%'), L - 5, py);
    }
    c.strokeStyle = T.axis; c.beginPath(); c.moveTo(L, top + H + 0.5); c.lineTo(L + W, top + H + 0.5); c.stroke();
    if (!this.data || !this.data.xs.length) return;
    const xs = this.data.xs;
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = T.muted;
    const ticks = this.xLog ? logTicks(xs[0], xs[xs.length - 1]) : xs.length <= 12 ? xs : niceTicks(xs[0], xs[xs.length - 1], 6);
    for (const x of ticks) c.fillText(this.xFmt(x), this.px(x), top + H + 5);
    c.fillStyle = T.ink2; c.fillText(this.xLabel, L + W / 2, top + H + 19);
    if (this.data.marker !== undefined && this.data.marker !== null) {
      const mx = this.px(this.data.marker);
      c.strokeStyle = T.ink2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(mx, top); c.lineTo(mx, top + H); c.stroke(); c.setLineDash([]);
    }
    for (const s of this.data.series) {
      c.strokeStyle = s.strong ? T.ink : T.ink2; c.lineWidth = 2; c.setLineDash(s.dash ? [6, 4] : []);
      c.beginPath();
      let started = false, lastX = 0, lastY = 0;
      s.ys.forEach((y, k) => {
        if (!Number.isFinite(y)) return;
        const px = this.px(xs[k]), py = this.py(y);
        if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        lastX = px; lastY = py;
      });
      c.stroke(); c.setLineDash([]);
      if (started) { c.fillStyle = s.strong ? T.ink : T.ink2; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '12px system-ui, sans-serif'; c.fillText(s.name, lastX + 6, lastY + (s.dash ? -7 : 7)); }
    }
    if (this.hx !== null && this.hx !== undefined) {
      const px = this.px(xs[this.hx]);
      c.strokeStyle = T.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(px, top); c.lineTo(px, top + H); c.stroke();
      for (const s of this.data.series) {
        const y = s.ys[this.hx];
        if (!Number.isFinite(y)) continue;
        c.beginPath(); c.arc(px, this.py(y), 4, 0, 2 * Math.PI); c.fillStyle = T.surface; c.fill(); c.strokeStyle = s.strong ? T.ink : T.ink2; c.lineWidth = 2; c.stroke();
      }
    }
  }
  hover(e) {
    if (!this.data || !this.data.xs.length) return;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left;
    let best = 0, bd = Infinity;
    this.data.xs.forEach((x, k) => { const d = Math.abs(this.px(x) - mx); if (d < bd) { bd = d; best = k; } });
    this.hx = best;
    this.draw();
    const lines = this.data.series.map((s) => `${s.name}: <b>${Number.isFinite(s.ys[best]) ? this.yFmt(s.ys[best]) : '…'}</b>`).join('<br>');
    this.tip.innerHTML = `<span class="k">${this.xLabel}</span> ${this.xFmt(this.data.xs[best])}<br>${lines}`;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    this.tip.style.left = `${Math.min(this.w - tw, this.px(this.data.xs[best]) + 10)}px`;
    this.tip.style.top = '6px';
  }
}
