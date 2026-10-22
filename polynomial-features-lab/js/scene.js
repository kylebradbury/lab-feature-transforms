// A Scene ties one configuration (dataset, features, fit settings) to its
// derived state (split, design matrices, trainer, weights, grid, boundary)
// and renders it into an XPlot (+ optional Z-space panel).
//
// Changes mark a dirty level (data > features > model > grid > paint); one
// requestAnimationFrame redoes only the stale stages. Newton steps run in
// small time slices so dragging stays smooth while the fit converges.

import { makeSplit, DATASETS } from './datasets.js';
import { prepare, makeTrainer, evaluate, viewFor } from './fit.js';
import { foldWeights, TRANSFORMS, resolveParams } from './features.js';
import { evalGrid, theme } from './plot2d.js';
import { marchingSquares } from './geometry.js';
import { tex, fmt, pct } from './ui.js';
import { logits } from './model.js';

export const LEVEL = { paint: 0, grid: 1, model: 2, features: 3, data: 4 };
export const LIVE_SCENES = new Set();

export function defaultCfg() {
  return {
    dataset: { id: 'blobs', params: {} },
    seed: 705,
    split: { nTrain: 200, nVal: 0, nTest: 300 },
    features: [{ id: 'raw', params: {} }],
    featureSeed: 1,
    fit: { mode: 'auto', lambda: 1e-3, w: null },
    view: { log: false, showTrain: true, showTest: false, showVal: false, mistakes: false, shade: 'prob', handles: true, gridFine: 170 },
  };
}

export function mergeCfg(base, over = {}) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...structuredClone(v) };
    else out[k] = structuredClone(v);
  }
  return out;
}

export class Scene {
  constructor({ plot = null, zpanel = null, onFrame = null, thumb = false, cfg = {} } = {}) {
    this.cfg = mergeCfg(defaultCfg(), cfg);
    this.plot = plot; this.zpanel = zpanel; this.onFrame = onFrame; this.thumb = thumb;
    this.dirty = LEVEL.data; this.raf = 0; this.alive = true; this.lastInput = 0;
    this.ghosts = []; this.overlays = []; this.underlays = [];
    this.busy = false;
    LIVE_SCENES.add(this);
    if (plot) {
      plot.onHover = (x, y, near) => this.hoverHtml(x, y, near);
      plot.onHandleDrag = (hd, x, y, phase) => this.dragHandle(hd, x, y, phase);
      plot.onClick = (x, y, ev, hd) => this.click(x, y, ev, hd);
    }
    this.schedule();
  }

  update(fn, level = 'model') {
    if (fn) fn(this.cfg);
    this.lastInput = performance.now();
    this.invalidate(level);
  }
  invalidate(level = 'paint') {
    this.dirty = Math.max(this.dirty, LEVEL[level]);
    this.schedule();
  }
  schedule() {
    if (!this.raf && this.alive) this.raf = requestAnimationFrame(() => this.frame());
  }
  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.fineT);
    LIVE_SCENES.delete(this);
  }

  get dataset() { return DATASETS[this.cfg.dataset.id]; }
  displayView() { return this.cfg.view.override || viewFor(this.cfg.dataset.id, this.cfg.view.log); }

  // Bring split / features / trainer up to date without stepping the optimizer.
  sync() {
    const cfg = this.cfg, lvl = this.dirty;
    if (lvl >= LEVEL.data || !this.split) {
      this.split = makeSplit(cfg.dataset.id, cfg.dataset.params, { ...cfg.split, seed: cfg.seed });
    }
    if (lvl >= LEVEL.features || !this.prep) {
      const prep = prepare(this.split, cfg.features, { view: viewFor(cfg.dataset.id, false), featureSeed: cfg.featureSeed });
      const warm = this.trainer && this.prep && this.prep.fmap.structure === prep.fmap.structure ? this.trainer.w : null;
      this.prep = prep;
      this.trainer = makeTrainer(prep, cfg.fit.lambda, warm);
    }
    if (lvl >= LEVEL.model) this.trainer.setLambda(cfg.fit.lambda);
    this.dirty = Math.min(this.dirty, LEVEL.grid);
  }

  // Fit to convergence right now; returns raw-space weights.
  fitNow() {
    this.sync();
    this.trainer.run();
    return foldWeights(this.trainer.w, this.prep.std);
  }

  manualWeights() {
    const d = this.prep.dim ?? this.prep.d, w = new Float64Array(d + 1), src = this.cfg.fit.w || [];
    for (let k = 0; k <= d; k++) w[k] = Number.isFinite(src[k]) ? src[k] : 0;
    return w;
  }

  frame() {
    this.raf = 0;
    if (!this.alive) return;
    const t0 = performance.now(), cfg = this.cfg;
    const lvl = this.dirty;
    const wasBusy = this.busy;
    let G = 0;
    try {
      this.sync();
      this.dirty = -1;
      if (cfg.fit.mode === 'auto') {
        const dragging = performance.now() - this.lastInput < 120;
        this.trainer.step(this.thumb ? 200 : dragging ? 8 : 30);
        this.wStd = this.trainer.w;
        this.wRaw = foldWeights(this.trainer.w, this.prep.std);
        this.busy = !this.trainer.converged;
      } else {
        this.wRaw = this.manualWeights();
        this.wStd = null;
        this.busy = false;
      }
      this.metrics = evaluate(this.prep, this.wRaw);
      const interacting = this.busy || performance.now() - this.lastInput < 150;
      G = this.thumb ? 72 : interacting ? 90 : cfg.view.gridFine;
      if (this.plot) {
        if (lvl >= LEVEL.grid || wasBusy || this.busy || !this.grid || this.grid.G !== G) {
          this.grid = evalGrid(this.prep.fmap, this.wRaw, this.displayView(), G, { xlog: cfg.view.log, ylog: cfg.view.log });
          this.segs = marchingSquares(this.grid.V, G);
        }
        this.paint();
      }
      if (this.zpanel) this.zpanel.update(this);
      if (this.onFrame) this.onFrame(this);
    } catch (e) {
      console.error(e);
    }
    this.frameMs = performance.now() - t0;
    if (this.busy) { this.dirty = Math.max(this.dirty, LEVEL.paint); this.schedule(); }
    else if (this.plot && !this.thumb && G && G < cfg.view.gridFine) {
      clearTimeout(this.fineT);
      this.fineT = setTimeout(() => this.invalidate('grid'), 170);
    }
  }

  mistakes(set) {
    const p = set === 'test' ? this.prep.te : this.prep.tr;
    const s = logits(this.wRaw, p.Z, p.N, this.prep.d), out = new Uint8Array(p.N);
    for (let i = 0; i < p.N; i++) out[i] = (s[i] > 0 ? 1 : 0) !== p.y[i] ? 1 : 0;
    return out;
  }

  paint() {
    const cfg = this.cfg, v = cfg.view, sp = this.split;
    this.plot.setView(this.displayView(), { xlog: v.log, ylog: v.log });
    const points = [];
    if (v.showTrain !== false) points.push({ X: sp.train.X, y: sp.train.y, name: 'training', mistakes: v.mistakes ? this.mistakes('train') : null });
    if (v.showVal && sp.val.y.length) points.push({ X: sp.val.X, y: sp.val.y, name: 'validation', hollow: true });
    if (v.showTest) points.push({ X: sp.test.X, y: sp.test.y, name: 'test', hollow: true, mistakes: v.mistakes ? this.mistakes('test') : null });
    this.plot.render({
      grid: this.grid, segs: this.segs, shade: v.shade, points,
      handles: v.handles && !this.thumb ? this.handles() : [], ghosts: this.ghosts, overlays: this.overlays, underlays: this.underlays,
    });
  }

  // Draggable handles exposed by the active transforms (centers, knots, landmarks…).
  handles() {
    const out = [], cols = this.prep ? this.prep.fmap.columns : [], w = this.wRaw;
    this.cfg.features.forEach((spec, idx) => {
      const T = TRANSFORMS[spec.id], p = resolveParams(spec);
      if (T.handles) for (const hd of T.handles(p)) out.push({ ...hd, draggable: true, specIndex: idx });
      if (spec.id === 'rbf' && w) {
        const ws = [];
        cols.forEach((c, k) => { if (c.specIndex === idx) ws.push(w[k + 1]); });
        const mx = Math.max(1e-9, ...ws.map(Math.abs)), ringR = Math.sqrt(Math.LN2 / p.gamma);
        if (p.place === 'manual') {
          out.forEach((hd) => { if (hd.specIndex === idx && hd.kind === 'landmark') { hd.weight = (ws[hd.index] ?? 0) / mx; hd.ringR = this.cfg.view.rings === false ? 0 : ringR; } });
        } else if (p.place !== 'data') {
          const part = this.prep.fmap.parts[idx];
          (part.inst.centers || []).forEach((c, k) => out.push({ kind: 'marker', x: c[0], y: c[1], weight: (ws[k] ?? 0) / mx, ringR: this.cfg.view.rings ? ringR : 0 }));
        }
      }
    });
    return out;
  }

  dragHandle(hd, x, y, phase) {
    const spec = this.cfg.features[hd.specIndex];
    if (!spec) return;
    const p = resolveParams(spec), snap = (v) => Math.round(v * 100) / 100;
    hd.set(p, snap(x), snap(y));
    spec.params = p;
    // Centers of radial-type features move together (e.g. r and r² share one center).
    if (hd.kind === 'center' && this.cfg.view.linkCenters !== false) {
      this.cfg.features.forEach((s2) => {
        const P = TRANSFORMS[s2.id].params;
        if (s2 !== spec && P.cx && P.cy) s2.params = { ...resolveParams(s2), cx: p.cx, cy: p.cy };
      });
    }
    this.update(null, 'features');
    if (phase === 'end' && this.onHandleEnd) this.onHandleEnd(hd);
  }

  click(x, y, ev, hd) {
    // Manual RBF landmarks: click adds, Alt/Shift-click on a landmark removes.
    const idx = this.cfg.features.findIndex((s) => s.id === 'rbf' && resolveParams(s).place === 'manual');
    if (idx < 0) { if (this.onPlotClick) this.onPlotClick(x, y, ev, hd); return; }
    const spec = this.cfg.features[idx], p = resolveParams(spec);
    if (hd && hd.kind === 'landmark') {
      if (ev.altKey || ev.shiftKey) { p.pts = p.pts.filter((_, j) => j !== hd.index); spec.params = p; this.update(null, 'features'); }
    } else if (!hd && p.pts.length < 30) {
      p.pts = [...p.pts, [Math.round(x * 100) / 100, Math.round(y * 100) / 100]];
      spec.params = p;
      this.update(null, 'features');
    }
    if (this.onHandleEnd) this.onHandleEnd(null);
  }

  hoverHtml(x, y, near) {
    if (!this.prep || !this.wRaw) return null;
    const { fmap, d } = this.prep, row = new Float64Array(Math.max(1, d));
    fmap.evalRow(x, y, row);
    let s = this.wRaw[0];
    for (let k = 0; k < d; k++) s += this.wRaw[k + 1] * row[k];
    const money = this.cfg.dataset.id === 'loans';
    const xs = money ? `income $${fmt(x, 0)}k · loan $${fmt(y, 0)}k` : `x = (${fmt(x)}, ${fmt(y)})`;
    const show = Math.min(d, 4);
    let feats = '';
    for (let k = 0; k < show; k++) feats += `<br>${tex(fmap.columns[k].tex)} = ${fmt(row[k], 3)}`;
    if (d > show) feats += `<br><span class="k">… ${d - show} more features</span>`;
    const p = 1 / (1 + Math.exp(-s)), [n0, n1] = theme().names;
    return `${xs}<div class="sep"></div><span class="k">z = Φ(x):</span>${feats}<div class="sep"></div>` +
      `<span class="k">w₀ + wᵀz</span> = ${fmt(s, 3)}<br><span class="k">P(${n1})</span> = ${pct(p)} → <b>${p >= 0.5 ? n1 : n0}</b>` +
      (near ? `<div class="sep"></div>${near.name} point, true class <b>${near.label ? n1 : n0}</b>` : '');
  }
}
