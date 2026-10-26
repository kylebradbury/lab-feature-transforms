// Charts for the stations, drawn in the theme's ink colors (class colors are
// kept for the two classes only).
//
// CurveChart: training and test accuracy against one setting (degree, flip
// rate, number of noise inputs), with the best possible accuracy as a dotted
// reference line, the train–test gap lightly filled, a marker at the current
// setting, a legend, direct labels and a hover tooltip. x values are spaced
// evenly (categorical). Values still being computed are NaN and simply not
// drawn yet.
//
// ScoreHistogram: the model's scores s = w₀ + wᵀz for the training points
// (above the axis) and the test points (below), stacked by true class, with
// the boundary s = 0 as a vertical line.

import { theme, niceTicks, LIVE_PLOTS } from './plot2d.js';
import { h, fmt, pct } from './ui.js';

const STYLE = {
  train: { dash: [6, 4], width: 2, ink: 'ink2', label: 'training' },
  test: { dash: [], width: 2.5, ink: 'ink', label: 'new points' },
  best: { dash: [2, 3], width: 1.5, ink: 'muted', label: 'best possible' },
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
  showTip(html, x) {
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(0, Math.min(this.w - tw, x + 10))}px`;
    this.tip.style.top = '4px';
  }
}

export class CurveChart extends CanvasChart {
  constructor(box, { xLabel = '', xFmt = (v) => fmt(v), yRange = [0.4, 1] } = {}) {
    super(box);
    Object.assign(this, { xLabel, xFmt, yRange });
    this.draw(); // the base constructor's first draw ran before these were set
  }
  // data: {xs, series: [{kind: 'train'|'test'|'best', ys, name?}], marker (an x value)}
  get rect() { return { L: 40, T: 10, W: this.w - 40 - 92, H: this.h - 10 - 36 }; }
  px(k) { const { L, W } = this.rect, n = this.data.xs.length; return L + (n <= 1 ? W / 2 : (W * k) / (n - 1)); }
  py(y) { const { T, H } = this.rect, [a, b] = this.yRange; return T + H - (H * (Math.min(b, Math.max(a, y)) - a)) / (b - a); }
  draw() {
    if (!this.yRange) return;
    const { c, T } = this.begin(), { L, T: top, W, H } = this.rect;
    c.font = '11px system-ui, sans-serif'; c.lineWidth = 1;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (const y of niceTicks(this.yRange[0], this.yRange[1], 4)) {
      const py = Math.round(this.py(y)) + 0.5;
      c.strokeStyle = T.grid; c.beginPath(); c.moveTo(L, py); c.lineTo(L + W, py); c.stroke();
      c.fillStyle = T.muted; c.fillText(`${Math.round(100 * y)}%`, L - 5, py);
    }
    c.strokeStyle = T.axis; c.beginPath(); c.moveTo(L, top + H + 0.5); c.lineTo(L + W, top + H + 0.5); c.stroke();
    if (!this.data || !this.data.xs.length) return;
    const { xs, series } = this.data, byKind = (k) => series.find((s) => s.kind === k);
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = T.muted;
    xs.forEach((x, k) => c.fillText(this.xFmt(x), this.px(k), top + H + 5));
    c.fillStyle = T.ink2; c.fillText(this.xLabel, L + W / 2, top + H + 20);
    // the train–test gap, lightly filled where both are known
    const tr = byKind('train'), te = byKind('test');
    if (tr && te) {
      c.save(); c.globalAlpha = T.dark ? 0.12 : 0.08; c.fillStyle = T.ink;
      for (let k = 0; k + 1 < xs.length; k++) {
        const v = [tr.ys[k], tr.ys[k + 1], te.ys[k], te.ys[k + 1]];
        if (!v.every(Number.isFinite)) continue;
        c.beginPath(); c.moveTo(this.px(k), this.py(v[0])); c.lineTo(this.px(k + 1), this.py(v[1]));
        c.lineTo(this.px(k + 1), this.py(v[3])); c.lineTo(this.px(k), this.py(v[2])); c.closePath(); c.fill();
      }
      c.restore();
    }
    const mk = this.data.marker === undefined ? -1 : xs.indexOf(this.data.marker);
    if (mk >= 0) {
      const mx = Math.round(this.px(mk)) + 0.5;
      c.strokeStyle = T.ink2; c.lineWidth = 1; c.beginPath(); c.moveTo(mx, top); c.lineTo(mx, top + H); c.stroke();
    }
    // lines, then direct labels at the right end, pushed apart so they never overlap
    const ends = [];
    for (const s of series) {
      const st = STYLE[s.kind];
      c.strokeStyle = T[st.ink]; c.lineWidth = st.width; c.setLineDash(st.dash); c.lineJoin = 'round';
      c.beginPath();
      let last = -1;
      s.ys.forEach((y, k) => {
        if (!Number.isFinite(y)) return;
        if (last < 0 || last !== k - 1) c.moveTo(this.px(k), this.py(y)); else c.lineTo(this.px(k), this.py(y));
        last = k;
      });
      c.stroke(); c.setLineDash([]);
      if (last >= 0) ends.push({ y: this.py(s.ys[last]), x: this.px(last), text: s.name || st.label, color: T[st.ink] });
      // the current setting's value, marked on each line
      if (mk >= 0 && Number.isFinite(s.ys[mk]) && s.kind !== 'best') {
        c.beginPath(); c.arc(this.px(mk), this.py(s.ys[mk]), 4, 0, 2 * Math.PI); c.fillStyle = T.surface; c.fill();
        c.strokeStyle = T[st.ink]; c.lineWidth = 2; c.stroke();
      }
    }
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    c.font = '12px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const e of ends) { c.fillStyle = e.color; c.fillText(e.text, L + W + 8, e.y); }
    if (this.hx !== null && this.hx !== undefined) {
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
    const lines = this.data.series.map((s) => `${s.name || STYLE[s.kind].label}: <b>${Number.isFinite(s.ys[best]) ? pct(s.ys[best]) : '…'}</b>`).join('<br>');
    this.showTip(`<span class="k">${this.xLabel}</span> ${this.xFmt(this.data.xs[best])}<br>${lines}`, this.px(best));
  }
}

export class ScoreHistogram extends CanvasChart {
  constructor(box, { bins = 25 } = {}) {
    super(box);
    this.bins = bins;
  }
  // data: {train: {s, y}, test: {s, y}}
  get rect() { return { L: 74, T: 6, W: this.w - 74 - 10, H: this.h - 6 - 30 }; }
  layout() {
    const { train, test } = this.data, all = [...train.s, ...test.s].map(Math.abs).sort((a, b) => a - b);
    const S = Math.max(1, all[Math.floor(0.95 * (all.length - 1))]), B = this.bins;
    const count = (set) => {
      const n = set.y.length, out = Array.from({ length: B }, () => [0, 0]);
      for (let i = 0; i < n; i++) {
        const b = Math.min(B - 1, Math.max(0, Math.floor(((set.s[i] + S) / (2 * S)) * B)));
        out[b][set.y[i]] += 1 / n;
      }
      return out;
    };
    const tr = count(train), te = count(test);
    const top = Math.max(1e-9, ...tr.map((v) => v[0] + v[1]), ...te.map((v) => v[0] + v[1]));
    return { S, B, tr, te, top };
  }
  draw() {
    const { c, T } = this.begin(), { L, T: top, W, H } = this.rect;
    if (!this.data) return;
    const { S, B, tr, te, top: m } = this.layout(), mid = top + H / 2, bw = W / B;
    this.lay = { S, B, tr, te };
    c.font = '11px system-ui, sans-serif'; c.fillStyle = T.ink2; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText('training', L - 8, top + H / 4); c.fillText('test', L - 8, top + (3 * H) / 4);
    const bar = (b, v, up) => {
      let y0 = mid;
      for (const cls of [0, 1]) {
        const hgt = (v[cls] / m) * (H / 2 - 4);
        if (hgt < 0.5) continue;
        c.fillStyle = cls ? T.c1 : T.c0;
        const x = L + b * bw + 1, w = Math.max(1, bw - 2); // 2px surface gap between bars
        if (up) { c.fillRect(x, y0 - hgt, w, hgt); y0 -= hgt + 1; } else { c.fillRect(x, y0, w, hgt); y0 += hgt + 1; }
      }
    };
    for (let b = 0; b < B; b++) { bar(b, tr[b], true); bar(b, te[b], false); }
    c.strokeStyle = T.axis; c.lineWidth = 1; c.beginPath(); c.moveTo(L, mid + 0.5); c.lineTo(L + W, mid + 0.5); c.stroke();
    const x0 = Math.round(L + W / 2) + 0.5;
    c.strokeStyle = T.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, top); c.lineTo(x0, top + H); c.stroke();
    c.fillStyle = T.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(`≤ −${fmt(S, 1)}`, L + 14, top + H + 4); c.fillText('0', x0, top + H + 4); c.fillText(`≥ ${fmt(S, 1)}`, L + W - 14, top + H + 4);
    c.fillStyle = T.ink2; c.fillText('score s = w₀ + wᵀz  (predicted ' + T.names[0] + ' ←  → ' + T.names[1] + ')', L + W / 2, top + H + 16);
    if (this.hx !== null && this.hx !== undefined) {
      c.strokeStyle = T.ink; c.lineWidth = 1; c.strokeRect(L + this.hx * bw + 0.5, top + 0.5, bw - 1, H - 1);
    }
  }
  hover(e) {
    if (!this.data || !this.lay) return;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, { L, W } = this.rect, { S, B, tr, te } = this.lay;
    const b = Math.floor(((mx - L) / W) * B);
    if (b < 0 || b >= B) { this.tip.hidden = true; return; }
    this.hx = b;
    this.draw();
    const lo = -S + (2 * S * b) / B, hi = lo + (2 * S) / B, [n0, n1] = theme().names;
    const row = (lab, v) => `${lab}: ${pct(v[0] + v[1])} (${n0} ${pct(v[0])}, ${n1} ${pct(v[1])})`;
    this.showTip(`<span class="k">score</span> ${fmt(lo, 2)} to ${fmt(hi, 2)}<br>${row('training', tr[b])}<br>${row('test', te[b])}`, L + b * (W / B));
  }
}
