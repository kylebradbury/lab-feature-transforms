// All station text (what each page says); behavior lives in app.js. Every
// number is computed from the engine (the r argument), and the claims made in
// words are checked by js/tests/claims.test.js.

import { CHALLENGES, ETAS, N_TRAIN, N_HELD, SEED, KS, result } from './engine.js';
import { DATA } from './data.js';

const pc = (v) => `${(100 * v).toFixed(1)} %`;
export const MODEL_NAME = { lr: 'logistic regression', knn: 'k-nearest neighbors (KNN)' };
export const MODEL_SHORT = { lr: 'Logistic regression', knn: 'KNN' };
export const SETTING_NAME = { lr: 'degree', knn: 'k' };
export const PARTS = [
  { id: 1, name: 'Part 1 · Logistic regression', blurb: 'Polynomial features of degree 1 to 10. More degrees, more flexible boundaries.' },
  { id: 2, name: 'Part 2 · k-nearest neighbors', blurb: 'The same three datasets. Fewer neighbors, more flexible boundaries.' },
  { id: 3, name: 'Part 3 · Resampling', blurb: 'Keep the held-out set, draw new training sets, and watch the boundaries move.' },
];

const DS_LEAD = {
  circles: 'Class 1 is the inner disk, class 0 the ring around it, with an empty gap between them.',
  moons: 'Two interleaving half-moons.',
  sine: 'Two bands on either side of a sine curve.',
};

export const goalText = (ch) => `At noise η = ${ETAS[ch.goalSi].toFixed(2)}, get at least ${(ch.T / 10).toFixed(1)} % of the held-out points right.`;
export const challengeName = (ch) => `${DATA[ch.ds].name} · ${MODEL_SHORT[ch.model]}`;
export const challengeNumber = (ch) => `${ch.part}${'abc'[CHALLENGES.filter((c) => c.part === ch.part).indexOf(ch)]}`;

export function lead(ch) {
  const flex = ch.model === 'lr' ? 'Try degrees from 1 to 10' : 'Try values of k from 199 down to 1';
  return `${DS_LEAD[ch.ds]} Start with clean data (noise 0). ${flex}, then add noise with the noise slider. Your goal is on the held-out set, not the training set.`;
}

// After the goal: what this dataset shows, with live numbers (displayed training set).
export function lesson(ch) {
  const at = (si, s) => result(ch.model, ch.ds, si, s), g = ch.goalSi, eta = ETAS[g].toFixed(2);
  if (ch.id === 'lr-circles') return `Too simple fails completely: degree 1 gets ${pc(at(g, 1).held)} of the held-out points right, because a straight line cannot draw a circle. Degree 2 gets ${pc(at(g, 2).held)}. Degree 10 gets ${pc(at(g, 10).train)} of the training points right but only ${pc(at(g, 10).held)} of the held-out points: with this much noise, the extra flexibility bends the boundary around single training points. With clean data (noise 0), the same degree 10 gets ${pc(at(0, 10).held)}: overfitting needs noise.`;
  if (ch.id === 'lr-moons') return `Overfitting can be as bad as underfitting. At noise ${eta}, degrees 3–4 get about ${pc(at(g, 3).held)}–${pc(at(g, 4).held)} of the held-out points right. Degree 10 gets ${pc(at(g, 10).train)} of the training points right but only ${pc(at(g, 10).held)} of the held-out points, about as few as a straight line (degree 1: ${pc(at(g, 1).held)}).`;
  if (ch.id === 'lr-sine') return `Squeezed from both sides. Degrees 1–2 cannot follow the wave (${pc(at(g, 1).held)}). Degrees 5–6 reach the goal (${pc(at(g, 5).held)}, ${pc(at(g, 6).held)}). From degree 7 on, held-out accuracy is lower again (degree 10: ${pc(at(g, 10).held)}) while training accuracy keeps climbing (${pc(at(g, 6).train)} at degree 6, ${pc(at(g, 10).train)} at degree 10). Training accuracy gives no warning.`;
  if (ch.id === 'knn-circles') return `k = 1 gets every training point right (each point is its own nearest neighbor) but only ${pc(at(g, 1).held)} of the held-out points. Too many neighbors fails completely: with k = 99 or more, the vote takes in so much of both classes that it predicts nearly the same class everywhere (${pc(at(g, 99).held)}, a coin flip).`;
  if (ch.id === 'knn-moons') return `KNN is forgiving here: a wide range of k works (k from ${goalRange(ch)} reach the goal). k = 1 still overfits: ${pc(at(g, 1).train)} of the training points right, ${pc(at(g, 1).held)} of the held-out points.`;
  return `k = 1: ${pc(at(g, 1).train)} of the training points, ${pc(at(g, 1).held)} of the held-out points. k from ${goalRange(ch)} reach the goal. With k = 65 or more, the vote reaches across the wave and cannot follow it (${pc(at(g, 65).held)}).`;
}
// "15 down to 3" style range of the settings that reach the goal (KNN).
export function goalRange(ch) {
  const ok = KS.filter((k) => result(ch.model, ch.ds, ch.goalSi, k).heldCorrect >= ch.T);
  return `${ok[0]} down to ${ok[ok.length - 1]}`;
}

export const HOW = {
  lr: 'Logistic regression on polynomial features draws a boundary w₀ + w₁z₁ + … + w_d z_d = 0, where the features z are all the products x₁ⁱx₂ʲ up to the chosen degree. Each extra degree adds features, so the boundary can bend more. With noise, the training points of the two classes overlap, and a flexible boundary can wrap around single points to get them right. Those wraps fit this particular noise, not the shape that generated the data, so they cost accuracy on the held-out points.',
  knn: 'KNN draws no formula: each point gets the class held by most of its k nearest training points. With small k the boundary follows every training point, including the ones that noise pushed across; with large k it averages over a wide area and can no longer follow the shape. A training point counts as its own neighbor, so with k = 1 training accuracy is always 100 %, whatever the data.',
};

const DEF = {
  noise: 'Noise η: each point is moved by η·ε from its clean position, x = x_clean + η·ε, where ε is a pair of standard normal numbers drawn once for each point. η = 0 is the clean data; the labels never change.',
  held: `Held-out set: ${N_HELD} more points from the same source, at the same noise level, never used for fitting. The plot shows 300 of them once you unlock them.`,
  acc: 'Training accuracy: the share of the training points the model gets right. Held-out accuracy: the share of the held-out points it gets right.',
  rule: 'The rule that generated the data (dashed): the line halfway across the empty gap between the classes in the clean data. Under noise it is not the best possible boundary, so no accuracy is attached to it.',
  lr: 'Logistic regression: \\(P(\\text{class 1} \\mid x) = \\sigma(w_0 + w^\\top z)\\), with \\(\\sigma(s) = 1/(1 + e^{-s})\\). Fit by making the average log-loss on the training points as small as possible, with no penalty (no regularization).',
  poly: '\\(z\\): the polynomial features \\(x_1^i x_2^j\\) with \\(1 \\le i + j \\le\\) degree; degree \\(k\\) gives \\(k(k + 3)/2\\) features (65 for degree 10).',
  knn: 'k-nearest neighbors (KNN): a point gets the class held by most of the \\(k\\) training points nearest to it (straight-line, Euclidean, distance). \\(k\\) is odd, so the vote never ties. A training point counts as one of its own neighbors.',
};
export const defs = (model) => (model === 'lr' ? [DEF.noise, DEF.held, DEF.acc, DEF.lr, DEF.poly, DEF.rule] : [DEF.noise, DEF.held, DEF.acc, DEF.knn, DEF.rule]);

export const chosen = (ch) => `${N_TRAIN} training points (${N_TRAIN / 2} per class) and ${N_HELD} held-out points, generated once (seed ${SEED}); noise levels from 0 to 0.60 in steps of 0.05. The goal (noise ${ETAS[ch.goalSi].toFixed(2)}, ${(ch.T / 10).toFixed(1)} %) was set from these data so that the setting with the highest training accuracy misses it${ch.model === 'knn' ? '; the values of k are odd, from 199 down to 1' : '; degrees from 1 to 10'}.`;
export const GUARD_NOTE = 'Some of these training points can be separated perfectly from the rest, so no best fit exists: the weights could grow without limit while the boundary barely moves. The computer stops once further steps no longer improve the fit, and shows the boundary where it stopped. (A vanishingly small penalty, 10⁻⁸ times the sum of the squared weights, is used only to find a starting point; it is removed before the final fit.)';

// ---------- resampling ----------
export const RESAMPLE = {
  lead: 'Keep everything fixed except the training set: same source, same noise, same held-out set, but a fresh sample of 200 training points each time. Draw several and watch what the boundary does.',
  how: 'Two different ways to miss. A flexible model (high degree, small k) follows each training set closely, so its boundary moves a lot from one training set to the next: that is variance. A rigid model (degree 1, very large k) gives nearly the same boundary every time, but that boundary misses the shape in the same places every time: that is bias. Overfitting is high variance: the boundary depends on the particular noise in the sample you happened to draw.',
  defs: [
    'Training set: 200 points drawn fresh from the same source each time you press Draw. Training set 1 is the one used in Parts 1 and 2.',
    'Held-out set: the same 1000 points for every training set.',
    'Boundary movement (variance): pick two different training sets; on what share of the held-out points do their fits predict different classes? Averaged over all pairs.',
    'Consistent miss (bias): the share of held-out points where at least 90 % of the fits disagree with the rule that generated the data.',
  ],
};

// ---------- report ----------
export const REFLECT = [
  'In every challenge, the setting with the highest training accuracy missed the held-out goal. Using one of your rows, explain why training accuracy misled you.',
  'In the resampling station, which settings had boundaries that moved the most, and which consistently missed the dashed line? How does that connect to your challenge results?',
  'You chose your settings by watching held-out accuracy. Is that number a fair estimate of accuracy on brand-new data? Why or why not?',
];

export const LANDING = {
  title: 'Training accuracy is not the goal',
  lead: 'A model overfits when it fits its training points better than new points from the same source. In this lab you will make that happen on purpose: add noise to clean data, make the model more flexible, and watch training accuracy and accuracy on a held-out set pull apart.',
  steps: [
    '<b>Explore.</b> Start with clean data, move the degree (or k) slider, then add noise. Every setting you try is recorded in two maps: training and held-out accuracy.',
    '<b>Reach the goal.</b> Each challenge sets a target for the <i>held-out</i> accuracy at a marked noise level. The setting with the best training accuracy will not get you there.',
    '<b>Unlock and submit.</b> Once you reach the goal, you can show the held-out points, the rule that generated the data, and the full map. Submit your setting to the report.',
  ],
};
