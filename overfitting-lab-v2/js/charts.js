// Charts for the stations, drawn in the theme's ink colors (class colors are
// kept for the two classes only).
//
// CurveChart: training and held-out accuracy against the setting (degree or
// k) at the current noise. Only the settings the student has visited carry
// solid dots; after the goal, the rest can be revealed in a lighter style.
// Lines join neighboring settings that are both known.
//
// ExploreMap: one accuracy (training or held-out) for every noise level (rows)
// and setting (columns), in one sequential single-hue scale with the value
// printed in each cell. Unexplored cells stay empty.
//
// AccStrip: held-out accuracy of each resampled training set's fit, as dots.

import { theme, LIVE_PLOTS } from './plot2d.js';
import { h, fmt, pct } from './ui.js';

const STYLE = {
  train: { dash: [6, 4], width: 2, ink: 'ink2', label: 'training' },
  held: { dash: [], width: 2.5, ink: 'ink', label: 'held-out' },
};

class CanvasChart {
  constructor(box) {
    this.box = box;
    this.canvas = h('canvas');
    this.tip = h('div', { class: 'tooltip', hidden: true });
    box.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext('2d');
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
  set(data) { this.data = data; this.draw(); }
  begin() {
    const c = this.ctx, T = theme();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = T.surface; c.fillRect(0, 0, this.w, this.h);
    return { c, T };
  }
  showTip(html, x, y = 4) {
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(0, Math.min(this.w - tw, x + 10))}px`;
    this.tip.style.top = `${y}px`;
  }
}

export class CurveChart extends CanvasChart {
  constructor(box, { xLabel = '', xFmt = (v) => String(v), yRange = [0.4, 1] } = {}) {
    super(box);
    Object.assign(this, { xLabel, xFmt, yRange });
    this.draw(); // the base constructor's first draw ran before these were set
  }
  // data: {xs, series: [{kind: 'train'|'held', ys, visited: bool[]}], marker (index), goal (y value or null)}
  get rect() { return { L: 40, T: 10, W: this.w - 40 - 70, H: this.h - 10 - 36 }; }
  px(k) { const { L, W } = this.rect, n = this.data.xs.length; return L + (n <= 1 ? W / 2 : (W * k) / (n - 1)); }
  py(y) { const { T, H } = this.rect, [a, b] = this.yRange; return T + H - (H * (Math.min(b, Math.max(a, y)) - a)) / (b - a); }
  draw() {
    if (!this.yRange) return;
    const { c, T } = this.begin(), { L, T: top, W, H } = this.rect;
    c.font = '11px system-ui, sans-serif'; c.lineWidth = 1; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (const y of [0.4, 0.6, 0.8, 1]) {
      const py = Math.round(this.py(y)) + 0.5;
      c.strokeStyle = T.grid; c.beginPath(); c.moveTo(L, py); c.lineTo(L + W, py); c.stroke();
      c.fillStyle = T.muted; c.fillText(`${Math.round(100 * y)}%`, L - 5, py);
    }
    c.strokeStyle = T.axis; c.beginPath(); c.moveTo(L, top + H + 0.5); c.lineTo(L + W, top + H + 0.5); c.stroke();
    if (!this.data || !this.data.xs.length) return;
    const { xs, series, marker, goal } = this.data;
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = T.muted;
    xs.forEach((x, k) => c.fillText(this.xFmt(x), this.px(k), top + H + 5));
    c.fillStyle = T.ink2; c.fillText(this.xLabel, L + W / 2, top + H + 20);
    if (goal != null) {
      const gy = Math.round(this.py(goal)) + 0.5;
      c.save(); c.strokeStyle = T.good || T.ink; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(L, gy); c.lineTo(L + W, gy); c.stroke(); c.restore();
      c.fillStyle = T.ink2; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText('held-out goal', L + 4, gy - 2);
    }
    if (marker != null && marker >= 0) {
      const mx = Math.round(this.px(marker)) + 0.5;
      c.strokeStyle = T.ink2; c.lineWidth = 1; c.beginPath(); c.moveTo(mx, top); c.lineTo(mx, top + H); c.stroke();
    }
    const ends = [];
    for (const s of series) {
      const st = STYLE[s.kind], col = T[st.ink];
      c.strokeStyle = col; c.lineWidth = st.width; c.setLineDash(st.dash); c.lineJoin = 'round';
      for (let k = 0; k + 1 < xs.length; k++) {
        if (!Number.isFinite(s.ys[k]) || !Number.isFinite(s.ys[k + 1])) continue;
        c.globalAlpha = s.visited[k] && s.visited[k + 1] ? 1 : 0.35;
        c.beginPath(); c.moveTo(this.px(k), this.py(s.ys[k])); c.lineTo(this.px(k + 1), this.py(s.ys[k + 1])); c.stroke();
      }
      c.setLineDash([]); c.globalAlpha = 1;
      s.ys.forEach((y, k) => {
        if (!Number.isFinite(y)) return;
        c.beginPath(); c.arc(this.px(k), this.py(y), s.visited[k] ? 4 : 3, 0, 2 * Math.PI);
        if (s.visited[k]) { c.fillStyle = col; c.fill(); } else { c.fillStyle = T.surface; c.fill(); c.globalAlpha = 0.6; c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = 1; }
      });
      let last = -1;
      s.ys.forEach((y, k) => { if (Number.isFinite(y)) last = k; });
      if (last >= 0) ends.push({ y: this.py(s.ys[last]), text: st.label, color: col, x: this.px(last) });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    c.font = '12px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const e of ends) { c.fillStyle = e.color; c.fillText(e.text, e.x + 8, e.y); }
    if (this.hx != null) {
      const px = Math.round(this.px(this.hx)) + 0.5;
      c.strokeStyle = T.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(px, top); c.lineTo(px, top + H); c.stroke();
    }
  }
  hover(e) {
    if (!this.data || !this.data.xs.length) return;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left;
    let best = 0, bd = Infinity;
    this.data.xs.forEach((_, k) => { const d = Math.abs(this.px(k) - mx); if (d < bd) { bd = d; best = k; } });
    this.hx = best;
    this.draw();
    const lines = this.data.series.map((s) => `${STYLE[s.kind].label}: <b>${Number.isFinite(s.ys[best]) ? pct(s.ys[best]) : 'not explored yet'}</b>`).join('<br>');
    this.showTip(`<span class="k">${this.xLabel}</span> ${this.xFmt(this.data.xs[best])}<br>${lines}`, this.px(best));
  }
}

// Sequential single-hue scale: ink over the surface, from faint (50 %) to strong (100 %).
const level = (v) => Math.min(1, Math.max(0, (v - 0.5) / 0.5));

export class ExploreMap extends CanvasChart {
  constructor(box, { rowFmt = (v) => String(v), colFmt = (v) => String(v), onPick = null, tipFmt = null } = {}) {
    super(box);
    Object.assign(this, { rowFmt, colFmt, onPick, tipFmt });
    this.canvas.addEventListener('click', (e) => {
      const cell = this.cellAt(e);
      if (cell && this.onPick) this.onPick(cell.i, cell.j);
    });
    this.canvas.style.cursor = 'pointer';
    this.draw();
  }
  // data: {rows, cols, values[i][j] (NaN = unexplored), visited[i][j], current: [i, j], goalRow}
  get rect() { return { L: 34, T: 16, W: this.w - 34 - 4, H: this.h - 16 - 4 }; }
  cellAt(e) {
    if (!this.data) return null;
    const r = this.canvas.getBoundingClientRect(), { L, T: top, W, H } = this.rect, { rows, cols } = this.data;
    const j = Math.floor(((e.clientX - r.left - L) / W) * cols.length), i = Math.floor(((e.clientY - r.top - top) / H) * rows.length);
    return i >= 0 && i < rows.length && j >= 0 && j < cols.length ? { i, j } : null;
  }
  draw() {
    if (!this.rowFmt) return;
    const { c, T } = this.begin();
    if (!this.data) return;
    const { L, T: top, W, H } = this.rect, { rows, cols, values, visited, current, goalRow } = this.data;
    const cw = W / cols.length, ch = H / rows.length;
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = T.muted; c.textAlign = 'center'; c.textBaseline = 'bottom';
    const every = cw < 24 ? 2 : 1; // narrow columns: label every other one, always including the last
    cols.forEach((v, j) => { if (j % every === (cols.length - 1) % every) c.fillText(this.colFmt(v), L + (j + 0.5) * cw, top - 3); });
    c.textAlign = 'right'; c.textBaseline = 'middle';
    rows.forEach((v, i) => { if (i % 2 === 0 || i === goalRow) { c.fillStyle = i === goalRow ? T.ink : T.muted; c.fillText(this.rowFmt(v), L - 4, top + (i + 0.5) * ch); } });
    for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols.length; j++) {
      const x = L + j * cw, y = top + i * ch, v = values[i][j];
      c.strokeStyle = T.grid; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      if (!Number.isFinite(v)) continue;
      const a = 0.07 + 0.83 * level(v), vis = visited[i][j];
      c.globalAlpha = a * (vis ? 1 : 0.55); c.fillStyle = T.ink; c.fillRect(x + 1, y + 1, cw - 2, ch - 2); c.globalAlpha = 1;
      if (cw >= 15 && ch >= 10) {
        c.fillStyle = a * (vis ? 1 : 0.55) > 0.45 ? T.surface : T.ink; c.globalAlpha = vis ? 1 : 0.7;
        c.textAlign = 'center'; c.font = `${vis ? '600 ' : ''}${Math.min(10, ch - 2)}px system-ui, sans-serif`;
        c.fillText(String(Math.floor(100 * v)), x + cw / 2, y + ch / 2 + 0.5); c.globalAlpha = 1;
      }
    }
    if (goalRow != null) {
      c.save(); c.strokeStyle = T.ink; c.lineWidth = 1.5; c.setLineDash([3, 2]);
      c.strokeRect(L - 0.5, top + goalRow * ch - 0.5, W + 1, ch + 1); c.restore();
    }
    if (current) {
      const [i, j] = current;
      c.strokeStyle = T.ink; c.lineWidth = 2.5; c.strokeRect(L + j * cw + 1, top + i * ch + 1, cw - 2, ch - 2);
      c.strokeStyle = T.surface; c.lineWidth = 1; c.strokeRect(L + j * cw + 2.5, top + i * ch + 2.5, cw - 5, ch - 5);
    }
  }
  hover(e) {
    const cell = this.cellAt(e);
    if (!cell) { this.tip.hidden = true; return; }
    const html = this.tipFmt ? this.tipFmt(cell.i, cell.j) : '';
    this.showTip(html, e.clientX - this.canvas.getBoundingClientRect().left, Math.min(this.h - 40, e.clientY - this.canvas.getBoundingClientRect().top + 12));
  }
}

export class AccStrip extends CanvasChart {
  // data: {acc: number[], newest: index, mean}
  get rect() { return { L: 12, T: 8, W: this.w - 24, H: this.h - 8 - 24 }; }
  draw() {
    const { c, T } = this.begin();
    if (!this.data || !this.data.acc.length) return;
    const { L, T: top, W, H } = this.rect, { acc, newest } = this.data;
    const lo = Math.floor(100 * Math.min(...acc) - 2) / 100, hi = Math.ceil(100 * Math.max(...acc) + 2) / 100;
    this.lohi = [lo, hi];
    const px = (v) => L + ((v - lo) / (hi - lo)) * W, mid = top + H / 2;
    c.strokeStyle = T.axis; c.lineWidth = 1; c.beginPath(); c.moveTo(L, mid + 0.5); c.lineTo(L + W, mid + 0.5); c.stroke();
    c.font = '10px system-ui, sans-serif'; c.fillStyle = T.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    const step = hi - lo > 0.12 ? 0.05 : hi - lo > 0.05 ? 0.02 : 0.01;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) { c.fillText(`${Math.round(100 * v)}%`, px(v), top + H + 6); c.fillRect(px(v) - 0.5, mid - 3, 1, 6); }
    acc.forEach((v, r) => {
      const jitter = ((r * 37) % 11) - 5;
      c.beginPath(); c.arc(px(v), mid + jitter * 1.6, r === newest ? 5.5 : 4, 0, 2 * Math.PI);
      c.globalAlpha = r === newest ? 1 : 0.55; c.fillStyle = T.ink; c.fill();
      if (r === newest) { c.globalAlpha = 1; c.strokeStyle = T.surface; c.lineWidth = 1.5; c.stroke(); }
      c.globalAlpha = 1;
    });
  }
  hover(e) {
    if (!this.data || !this.lohi) return;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, { L, W } = this.rect, [lo, hi] = this.lohi;
    let best = -1, bd = 8;
    this.data.acc.forEach((v, k) => { const d = Math.abs(L + ((v - lo) / (hi - lo)) * W - mx); if (d < bd) { bd = d; best = k; } });
    if (best < 0) { this.tip.hidden = true; return; }
    this.showTip(`training set ${best + 1}: held-out <b>${pct(this.data.acc[best])}</b>`, mx);
  }
}

export { fmt };
