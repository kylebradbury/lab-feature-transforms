// The rule that generated each dataset (before any noise), as a signed score:
// positive where the rule says class 1. Used for the dashed "rule that
// generated the data" line and for the best possible accuracy on a test set.

import { datasetDefaults } from './datasets.js';
import { marchingSquares } from './geometry.js';

const RULES = {
  // class 1 is the inner disk r < 1, class 0 the ring r > 1 + gap; the rule's
  // boundary is the circle halfway across the empty gap.
  circles: (p) => (x1, x2) => 1 + p.gap / 2 - Math.hypot(x1, x2),
};

export function truthRule(ds, params) {
  const make = RULES[ds];
  if (!make) throw new Error(`no generating rule for ${ds}`);
  return make({ ...datasetDefaults(ds), ...params });
}

// Accuracy of the generating rule on a labeled set: the best any model can do
// on it, since the flipped labels cannot be predicted from x.
export function ruleAccuracy(rule, X, y) {
  let ok = 0;
  for (let i = 0; i < y.length; i++) if ((rule(X[2 * i], X[2 * i + 1]) > 0 ? 1 : 0) === y[i]) ok++;
  return y.length ? ok / y.length : NaN;
}

// The rule's boundary as marchingSquares segments on a G×G cell-centered grid over view.
export function ruleSegs(rule, view, G = 120) {
  const V = new Float32Array(G * G);
  for (let j = 0; j < G; j++) {
    const x2 = view.ymin + ((j + 0.5) / G) * (view.ymax - view.ymin);
    for (let i = 0; i < G; i++) V[j * G + i] = rule(view.xmin + ((i + 0.5) / G) * (view.xmax - view.xmin), x2);
  }
  return { G, segs: marchingSquares(V, G) };
}
