// The rule that generated each dataset, as a signed score (positive where the
// rule says class 1): the line halfway across the empty gap between the two
// classes in the clean data. Drawn as the dashed line. Under position noise it
// is not the best possible classifier, so its accuracy is never called that.

import { SINE } from './data.js';
import { marchingSquares } from './geometry.js';

const S = 1.6;
// Distance from (x, y) to an arc of radius S centered at (cx, cy): the lower half (lower = true) or the upper half.
function arcDist(x, y, cx, cy, lower) {
  const dx = x - cx, dy = y - cy;
  if (lower ? dy <= 0 : dy >= 0) return Math.abs(Math.hypot(dx, dy) - S);
  return Math.min(Math.hypot(dx - S, dy), Math.hypot(dx + S, dy)); // nearer endpoint
}

export const RULES = {
  circles: (x, y) => 1.35 - Math.hypot(x, y),
  sine: (x, y) => y - SINE.A * Math.sin(SINE.w * x + SINE.ph),
  // nearer to the class-1 arc (center (0.8, 0.4), lower half) than to the class-0 arc (center (−0.8, −0.4), upper half)
  moons: (x, y) => arcDist(x, y, -0.8, -0.4, false) - arcDist(x, y, 0.8, 0.4, true),
};

export const ruleLabel = (ds, x, y) => (RULES[ds](x, y) > 0 ? 1 : 0);

// The rule's boundary as marchingSquares segments on a G×G cell-centered grid over view.
const segCache = new Map();
export function ruleSegs(ds, view, G = 160) {
  const key = `${ds}|${G}`;
  if (segCache.has(key)) return segCache.get(key);
  const f = RULES[ds], V = new Float32Array(G * G);
  for (let j = 0; j < G; j++) {
    const y = view.ymin + ((j + 0.5) / G) * (view.ymax - view.ymin);
    for (let i = 0; i < G; i++) V[j * G + i] = f(view.xmin + ((i + 0.5) / G) * (view.xmax - view.xmin), y);
  }
  const out = { G, segs: marchingSquares(V, G) };
  segCache.set(key, out);
  return out;
}
