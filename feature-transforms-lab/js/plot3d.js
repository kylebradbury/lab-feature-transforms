// 3-D views (Plotly, lazy-loaded): the Lift view and the 3-D Z-space view.

import { theme } from './plot2d.js';
import { marchingSquares } from './geometry.js';
import { h } from './ui.js';

const PLOTLY_SRC = 'https://cdn.jsdelivr.net/npm/plotly.js-gl3d-dist-min@2.35.2/plotly-gl3d.min.js';
const PLOTLY_SRI = 'sha384-2iqtxZG7QVTVIK1aD3fKbwQfCo/3iDyYom8ASNY8N8jdnpWBRncRnKFPZU95loka';
let loading = null;

export function loadPlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PLOTLY_SRC; s.integrity = PLOTLY_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.Plotly);
      s.onerror = () => { loading = null; reject(new Error('Could not load Plotly (offline?)')); };
      document.head.append(s);
    });
  }
  return loading;
}

export const CAMERAS = {
  oblique: { eye: { x: 1.55, y: -1.55, z: 1.05 }, up: { x: 0, y: 0, z: 1 } },
  side: { eye: { x: 0.01, y: -2.4, z: 0.15 }, up: { x: 0, y: 0, z: 1 } },
  top: { eye: { x: 0, y: 0, z: 2.6 }, up: { x: 0, y: 1, z: 0 } },
};

function baseLayout(T, zTitle, camera) {
  const ax = (title) => ({ title: { text: title }, gridcolor: T.grid, zerolinecolor: T.axis, color: T.ink2, backgroundcolor: T.surface, showbackground: false });
  return {
    paper_bgcolor: T.surface, plot_bgcolor: T.surface, font: { color: T.ink2, family: 'system-ui, sans-serif', size: 11 },
    margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, uirevision: 'keep',
    scene: { xaxis: ax('x₁'), yaxis: ax('x₂'), zaxis: ax(zTitle), camera, aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: 0.75 } },
  };
}

function pointTraces(X, y, zOf, T) {
  const sets = [[], []];
  for (let i = 0; i < y.length; i++) sets[y[i]].push(i);
  return sets.map((idx, cls) => ({
    type: 'scatter3d', mode: 'markers', hoverinfo: 'skip',
    x: idx.map((i) => X[2 * i]), y: idx.map((i) => X[2 * i + 1]), z: idx.map((i) => zOf(X[2 * i], X[2 * i + 1])),
    marker: { size: 3.2, symbol: cls ? 'square' : 'circle', color: cls ? T.c1 : T.c0, line: { width: 0.5, color: T.surface } },
  }));
}

/**
 * Lift view. opts: {X, y, hfun, t (0..1 lift), plane:{a,b,c}, showSurface, showCut, camera, zRange}
 */
export function renderLift(div, opts) {
  const P = window.Plotly, T = theme();
  const { X, y, hfun, t = 1, plane, showSurface = true, showCut = true, zRange, view = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 } } = opts;
  const n = 40, xs = [], ys = [];
  for (let k = 0; k < n; k++) { xs.push(view.xmin + (k * (view.xmax - view.xmin)) / (n - 1)); ys.push(view.ymin + (k * (view.ymax - view.ymin)) / (n - 1)); }
  const surfZ = ys.map((yy) => xs.map((xx) => t * hfun(xx, yy)));
  const planeZ = ys.map((yy) => xs.map((xx) => clampZ(plane.a * xx + plane.b * yy + plane.c, zRange)));
  const traces = pointTraces(X, y, (a, b) => t * hfun(a, b), T);
  if (showSurface) traces.push({ type: 'surface', x: xs, y: ys, z: surfZ, opacity: 0.28, showscale: false, hoverinfo: 'skip', colorscale: [[0, T.ink2], [1, T.ink2]] });
  if (t > 0.999) {
    traces.push({ type: 'surface', x: xs, y: ys, z: planeZ, opacity: 0.42, showscale: false, hoverinfo: 'skip', colorscale: [[0, T.ink], [1, T.ink]] });
    if (showCut) {
      const G = 140, V = new Float32Array(G * G), st = (view.xmax - view.xmin) / G;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const xx = view.xmin + (i + 0.5) * st, yy = view.ymin + (j + 0.5) * st;
        V[j * G + i] = plane.a * xx + plane.b * yy + plane.c - hfun(xx, yy);
      }
      const segs = marchingSquares(V, G), lx = [], ly = [], lz = [], fz = [];
      for (let k = 0; k < segs.length; k += 4) {
        for (const q of [0, 2]) {
          const xx = view.xmin + (segs[k + q] + 0.5) * st, yy = view.ymin + (segs[k + q + 1] + 0.5) * st;
          lx.push(xx); ly.push(yy); lz.push(hfun(xx, yy)); fz.push(zRange[0]);
        }
        lx.push(null); ly.push(null); lz.push(null); fz.push(null);
      }
      traces.push({ type: 'scatter3d', mode: 'lines', x: lx, y: ly, z: lz, line: { color: T.ink, width: 6 }, hoverinfo: 'skip' });
      traces.push({ type: 'scatter3d', mode: 'lines', x: lx, y: ly, z: fz, line: { color: T.ink, width: 4, dash: 'dash' }, hoverinfo: 'skip' });
    }
  }
  const layout = baseLayout(T, opts.zTitle || 'h(x)', opts.camera || CAMERAS.oblique);
  layout.scene.zaxis.range = zRange;
  layout.scene.xaxis.range = [view.xmin, view.xmax];
  layout.scene.yaxis.range = [view.ymin, view.ymax];
  if (opts.forceCamera) { layout.uirevision = Math.random(); }
  return P.react(div, traces, layout, { displayModeBar: false, responsive: true });
}
function clampZ(v, r) { return Math.max(r[0] - 1, Math.min(r[1] + 1, v)); }

// Modal 3-D view of Z-space for d = 3: points z = Φ(x) and the separating plane.
export async function openZ3D(scene) {
  const sheet = h('div', { class: 'sheet' });
  const close = h('button', { class: 'btn', type: 'button' }, 'Close');
  const box = h('div', { class: 'plotly-box' }, 'Loading 3-D view…');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '3-D Z-space' }, sheet);
  sheet.append(h('header', {}, h('b', {}, 'Z-space in 3-D: the boundary is a flat plane'), close), box,
    h('p', { class: 'hint' }, 'Drag to rotate. Every point is z = Φ(x) for one data point; the gray plane is w₀ + w₁z₁ + w₂z₂ + w₃z₃ = 0.'));
  const done = () => { if (window.Plotly) window.Plotly.purge(box); modal.remove(); };
  close.addEventListener('click', done);
  modal.addEventListener('click', (e) => { if (e.target === modal) done(); });
  document.body.append(modal);
  let P;
  try { P = await loadPlotly(); } catch (e) { box.textContent = e.message; return; }
  box.textContent = '';
  const T = theme(), prep = scene.prep, w = scene.wRaw, Z = prep.tr.Z, N = prep.tr.N, labels = prep.fmap.columns.map((c) => c.tex.replace(/\\/g, ''));
  const sets = [[], []];
  for (let i = 0; i < N; i++) sets[prep.tr.y[i]].push(i);
  const traces = sets.map((idx, cls) => ({
    type: 'scatter3d', mode: 'markers', hoverinfo: 'skip',
    x: idx.map((i) => Z[3 * i]), y: idx.map((i) => Z[3 * i + 1]), z: idx.map((i) => Z[3 * i + 2]),
    marker: { size: 3.2, symbol: cls ? 'square' : 'circle', color: cls ? T.c1 : T.c0 },
  }));
  const lo = [0, 1, 2].map((k) => Math.min(...Array.from({ length: N }, (_, i) => Z[3 * i + k])));
  const hi = [0, 1, 2].map((k) => Math.max(...Array.from({ length: N }, (_, i) => Z[3 * i + k])));
  // Solve the plane for the coordinate with the largest weight.
  const k = [1, 2, 3].reduce((a, b) => (Math.abs(w[b]) > Math.abs(w[a]) ? b : a), 1) - 1;
  const others = [0, 1, 2].filter((q) => q !== k), n = 30;
  const u = Array.from({ length: n }, (_, i) => lo[others[0]] + (i * (hi[others[0]] - lo[others[0]])) / (n - 1));
  const v = Array.from({ length: n }, (_, i) => lo[others[1]] + (i * (hi[others[1]] - lo[others[1]])) / (n - 1));
  const solve = (a, b) => { const val = -(w[0] + w[others[0] + 1] * a + w[others[1] + 1] * b) / w[k + 1]; return Math.max(lo[k] - 0.5, Math.min(hi[k] + 0.5, val)); };
  const grid = v.map((b) => u.map((a) => solve(a, b)));
  const plane = { type: 'surface', opacity: 0.45, showscale: false, hoverinfo: 'skip', colorscale: [[0, T.ink2], [1, T.ink2]] };
  const axes = ['x', 'y', 'z'];
  plane[axes[others[0]]] = v.map(() => u);
  plane[axes[others[1]]] = v.map((b) => u.map(() => b));
  plane[axes[k]] = grid;
  const layout = baseLayout(T, labels[2], CAMERAS.oblique);
  layout.scene.xaxis.title.text = labels[0];
  layout.scene.yaxis.title.text = labels[1];
  P.react(box, [...traces, plane], layout, { displayModeBar: false, responsive: true });
}
