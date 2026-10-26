// 3-D views of the score s = w₀ + wᵀz (Plotly, lazy-loaded). Over the
// original floor (x₁, x₂) the score bends; over the feature floor (z₁, z₂) it
// is a flat plane. Both views use normalized floor coordinates in [0, 1] with
// real tick labels, so the feature view can slide from one floor to the other
// (build.js frame) while every height stays where it is.

import { theme, niceTicks } from './plot2d.js';
import { frame, scores, boundary, plane, gridLines, zeroDirection, G } from './build.js';

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
      s.onerror = () => { loading = null; reject(new Error('Could not load the 3-D plotting library (offline?)')); };
      document.head.append(s);
    });
  }
  return loading;
}

const UP = { x: 0, y: 0, z: 1 }, MID = { x: 0, y: 0, z: 0 };
const ORTHO = 2; // orthographic views zoom with the scene's aspect ratio (ORTHO_ZOOM), not the eye's distance
const ORTHO_ZOOM = 1.6;
export const CAMERAS = {
  oblique: { eye: { x: 1.3, y: -1.65, z: 0.9 }, up: UP, center: { x: 0, y: 0, z: -0.08 }, projection: { type: 'perspective' } },
  // straight down, x₁ to the right and x₂ up: the same picture as the 2-D panel (the
  // turntable keeps z up, so the eye leans a hair toward −x₂ to fix which way is up)
  top: { eye: { x: 0, y: -1e-3, z: ORTHO }, up: UP, center: MID, projection: { type: 'orthographic' } },
  side: { eye: { x: 0, y: -ORTHO, z: 0 }, up: UP, center: MID, projection: { type: 'orthographic' } },
};
// Level, looking along the zero line in feature space: there the plane is seen edge-on.
export function edgeCamera(fc, w) {
  const [du, dv] = zeroDirection(fc, w);
  return { eye: { x: ORTHO * du, y: ORTHO * dv, z: 0 }, up: UP, center: MID, projection: { type: 'orthographic' } };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const mix = (a, b, t) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
const LINES = gridLines();
const CONFIG = { displayModeBar: false, responsive: true, scrollZoom: false };
const SHEET_OPACITY = 0.78;
const LIGHT = { ambient: 0.82, diffuse: 0.32, specular: 0.04, roughness: 0.9, fresnel: 0.05 };

export class ScorePlot3D {
  // space 'x': the original floor, always. space 'z': the feature floor at t = 1,
  // the original floor at t = 0. onHover(i) gets a training point index or -1;
  // onCamera(camera) runs when the camera is dragged.
  constructor(box, { space, onHover = null, onCamera = null }) {
    this.box = box;
    this.space = space;
    this.onHover = onHover;
    this.onCamera = onCamera;
    this.t = space === 'z' ? 1 : 0;
    this.dir = 1;
    this.opts = { zeroPlane: true };
    this.hi = -1;
    this.camera = CAMERAS.oblique;
    this.camRev = 0;
    this.muted = 0;
    this.fc = null; this.w = null;
    this.ready = false; this.drawn = false; this.req = 0; this.anim = 0;
    box.textContent = 'Loading the 3-D view…';
    box.classList.add('loading');
    // Plotly sizes itself to the window; follow the box instead (a narrower column, a phone)
    this.ro = new ResizeObserver(() => { if (this.drawn) window.Plotly.Plots.resize(this.box); });
    this.ro.observe(box);
    loadPlotly().then(() => { this.ready = true; box.textContent = ''; box.classList.remove('loading'); this.draw(); })
      .catch((e) => { box.textContent = e.message; });
  }

  set(fc, w) { this.fc = fc; this.w = Array.from(w); this.hi = -1; this.schedule(); }
  setW(w) { this.w = Array.from(w); this.schedule(); }
  setOpts(o) { Object.assign(this.opts, o); this.schedule(); }
  highlight(i) { if (i !== this.hi) { this.hi = i; this.schedule(); } }
  setT(t) {
    t = Math.min(1, Math.max(0, t));
    if (t !== this.t) this.dir = t > this.t ? 1 : -1;
    this.t = t;
    this.schedule();
  }
  // Animate t to `to` (gallery timing: ms for the whole way); onStep(t) runs every frame.
  animate(to, { ms = 1600, onStep = null, onDone = null } = {}) {
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

  // A preset (or any camera): replaces whatever the viewer dragged to.
  setCamera(cam) { this.camera = cam; this.camRev++; this.schedule(); }
  // The other 3-D view moved: follow it without echoing the change back.
  followCamera(cam) {
    this.camera = cam;
    if (!this.drawn) return;
    this.muted++;
    window.Plotly.relayout(this.box, { 'scene.camera': cam }).finally(() => { this.muted--; });
  }

  schedule() {
    if (!this.req) this.req = requestAnimationFrame(() => { this.req = 0; this.draw(); });
  }

  draw() {
    if (!this.ready || !this.fc || !this.w) return;
    const T = theme(), fc = this.fc, w = this.w, inZ = this.space === 'z';
    const fr = frame(fc, inZ ? this.t : 0), e = fr.e, { S, P } = scores(fc, w);
    const [s0, s1] = fc.sRange, span = s1 - s0, M = Math.max(Math.abs(s0), Math.abs(s1));
    // two tones with a sharp break at s = 0: the two sides of the boundary. The region
    // shades of a dark theme are close to its background, so lean them toward the class colors.
    const k = T.dark ? 0.4 : 0, r0 = rgb(mix(T.rgb.r0, T.rgb.c0, k)), r1 = rgb(mix(T.rgb.r1, T.rgb.c1, k));
    const tones = { colorscale: [[0, r0], [0.5, r0], [0.5, r1], [1, r1]], cmin: -M, cmax: M, showscale: false, hoverinfo: 'skip', lighting: LIGHT };
    const sheetFade = !inZ ? 1 : fc.collapse ? 1 - smooth(0.4, 0.95, e) : 1 - smooth(0.8, 1, e);
    const planeFade = inZ ? smooth(0.8, 1, e) : 0;
    const traces = [];

    // the score sheet: one vertex per grid point of the original box, at height s
    const grid = (off) => Array.from({ length: G }, (_, j) => Array.from({ length: G }, (_, i) => fr.V[2 * (j * G + i) + off]));
    const U = grid(0), V = grid(1);
    const Z = Array.from({ length: G }, (_, j) => Array.from(S.subarray(j * G, (j + 1) * G)));
    traces.push({ type: 'surface', name: 'sheet', x: U, y: V, z: Z, surfacecolor: Z, ...tones, opacity: SHEET_OPACITY * sheetFade, visible: sheetFade > 0.02 });

    // feature space at the end of the morph: the whole plane, which the sheet lies on
    const pl = plane(fc, w);
    traces.push({ type: 'surface', name: 'plane', x: pl.u, y: pl.u, z: pl.S, surfacecolor: pl.S, ...tones, opacity: SHEET_OPACITY * planeFade, visible: planeFade > 0.02 });

    // s = 0
    traces.push({ type: 'surface', name: 'zero', x: [0, 1], y: [0, 1], z: [[0, 0], [0, 0]], showscale: false, hoverinfo: 'skip',
      colorscale: [[0, T.ink2], [1, T.ink2]], opacity: 0.2, visible: this.opts.zeroPlane, lighting: LIGHT });

    // grid lines of the original box, carried along with the sheet
    const gl = { x: [], y: [], z: [] }, lift = 0.004 * span;
    for (const line of LINES) {
      for (const k of line) { gl.x.push(fr.V[2 * k]); gl.y.push(fr.V[2 * k + 1]); gl.z.push(S[k] + lift); }
      gl.x.push(null); gl.y.push(null); gl.z.push(null);
    }
    traces.push({ type: 'scatter3d', mode: 'lines', name: 'grid', ...gl, line: { color: T.ink2, width: 1.5 }, opacity: T.dark ? 0.3 : 0.45, hoverinfo: 'skip' });

    // the cut: where the surface crosses s = 0 (the boundary), carried along too
    const cut = { x: [], y: [], z: [] }, f = 1 - e;
    for (const L of boundary(fc, w).lines) {
      for (let k = 0; k < L.Xn.length; k += 2) { cut.x.push(f * L.Xn[k] + e * L.Zn[k]); cut.y.push(f * L.Xn[k + 1] + e * L.Zn[k + 1]); cut.z.push(0); }
      cut.x.push(null); cut.y.push(null); cut.z.push(null);
    }
    traces.push({ type: 'scatter3d', mode: 'lines', name: 'cut', ...cut, line: { color: T.ink, width: 7 }, hoverinfo: 'skip' });
    // and the plane's whole zero line, a straight line across the feature floor
    const zl = pl.zero || [[0, 0], [0, 0]];
    traces.push({ type: 'scatter3d', mode: 'lines', name: 'zeroline', x: [zl[0][0], zl[1][0]], y: [zl[0][1], zl[1][1]], z: [0, 0],
      line: { color: T.ink, width: 5 }, opacity: planeFade, visible: planeFade > 0.02 && !!pl.zero, hoverinfo: 'skip' });

    // the training points, at their scores
    const y = fc.split.train.y;
    for (const cls of [0, 1]) {
      const idx = []; for (let i = 0; i < fc.N; i++) if (y[i] === cls) idx.push(i);
      traces.push({
        type: 'scatter3d', mode: 'markers', name: `points${cls}`, meta: 'points', customdata: idx, hoverinfo: 'none',
        x: idx.map((i) => fr.P[2 * i]), y: idx.map((i) => fr.P[2 * i + 1]), z: idx.map((i) => P[i]),
        marker: { size: 3.6, color: cls ? T.c1 : T.c0, symbol: (cls ? T.shape1 : T.shape0) === 'square' ? 'square' : 'circle', line: { width: 0.6, color: cls ? T.edge1 : T.edge0 } },
      });
    }
    // the highlighted point, and its height above (or below) s = 0
    const hi = this.hi, has = hi >= 0 && hi < fc.N;
    const hx = has ? fr.P[2 * hi] : 0, hy = has ? fr.P[2 * hi + 1] : 0, hz = has ? P[hi] : 0;
    traces.push({ type: 'scatter3d', mode: 'markers', name: 'hi', x: [hx], y: [hy], z: [hz], visible: has, hoverinfo: 'skip',
      marker: { size: 11, color: T.ink, symbol: 'circle-open', line: { width: 3, color: T.ink } } });
    traces.push({ type: 'scatter3d', mode: 'lines', name: 'drop', x: [hx, hx], y: [hy, hy], z: [0, hz], visible: has, hoverinfo: 'skip',
      line: { color: T.ink, width: 3, dash: 'dash' } });

    window.Plotly.react(this.box, traces, this.layout(T, e), CONFIG);
    if (!this.drawn) this.bind();
    this.drawn = true;
  }

  layout(T, e) {
    const fc = this.fc, inZ = this.space === 'z';
    // tick labels in real units: x at the start of the morph, z at the end, none in between
    const ticks = (box, k) => {
      const lo = k ? box.v0 : box.u0, hi = k ? box.v1 : box.u1;
      const vals = niceTicks(lo, hi, 5);
      return { tickvals: vals.map((v) => (v - lo) / (hi - lo)), ticktext: vals.map((v) => String(+v.toFixed(2))) };
    };
    const showZ = inZ && e >= 0.5;
    const mid = inZ && e > 0.001 && e < 0.999;
    const floorAx = (k) => {
      const t = mid ? { tickvals: [], ticktext: [] } : ticks(showZ ? fc.zbox : fc.xbox, k);
      const title = showZ ? `z${k ? '₂' : '₁'} = ${fc.zAxis[k]}` : `x${k ? '₂' : '₁'}`;
      return { ...axis(T, title), range: [-0.003, 1.003], autorange: false, ...t, tickmode: 'array' };
    };
    return {
      paper_bgcolor: T.surface, plot_bgcolor: T.surface, font: { color: T.ink2, family: 'system-ui, sans-serif', size: 11 },
      margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, uirevision: this.camRev, hovermode: 'closest',
      scene: {
        xaxis: floorAx(0), yaxis: floorAx(1),
        zaxis: { ...axis(T, 's'), range: fc.sRange, autorange: false, nticks: 6 },
        camera: this.camera, aspectmode: 'manual', aspectratio: aspect(this.camera), dragmode: 'turntable',
      },
    };
  }

  bind() {
    const div = this.box;
    div.on('plotly_hover', (ev) => {
      const p = ev && ev.points && ev.points[0];
      if (p && p.data && p.data.meta === 'points' && this.onHover) this.onHover(p.customdata);
    });
    div.on('plotly_unhover', () => this.onHover && this.onHover(-1));
    const cam = (ev) => {
      const c = ev && ev['scene.camera'];
      if (!c || this.muted) return;
      this.camera = { ...this.camera, ...c }; // a drag keeps the projection (and so the zoom)
      this.onCamera && this.onCamera(this.camera);
    };
    div.on('plotly_relayout', cam);
    div.on('plotly_relayouting', cam);
  }

  destroy() {
    this.ro.disconnect();
    cancelAnimationFrame(this.anim);
    cancelAnimationFrame(this.req);
    if (window.Plotly && this.drawn) window.Plotly.purge(this.box);
  }
}

function aspect(cam) {
  const k = cam.projection && cam.projection.type === 'orthographic' ? ORTHO_ZOOM : 1;
  return { x: k, y: k, z: 0.8 * k };
}
function axis(T, title) {
  return { gridcolor: T.grid, zerolinecolor: T.axis, linecolor: T.axis, color: T.ink2, showbackground: false, showspikes: false, tickfont: { size: 10 }, title: { text: title, font: { size: 12, color: T.ink } } };
}
