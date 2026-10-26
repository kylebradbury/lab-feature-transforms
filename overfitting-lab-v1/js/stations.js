// The stations: text only (what each page says), in the style of the
// gallery's exhibits.js. Behavior lives in app.js. Fields may be functions of
// r, the station's live results, so every number in the text is computed.
// Numbers that cannot be computed live (question choices) are checked by
// js/tests/overfit.test.js.

export const PARTS = [
  { id: 'A', name: 'Part A · Overfitting you can see', blurb: 'Two inputs, so every boundary can be drawn. Flipped labels are the noise.' },
  { id: 'B', name: 'Part B · Higher dimensions', blurb: 'Add inputs, and overfitting no longer shows in any picture.' },
];

// ---- shared definitions (HTML with \( \) math) ----
const D = {
  x: '\\(x = (x_1, x_2)\\): a point; \\(x_1\\) is its horizontal and \\(x_2\\) its vertical coordinate.',
  model: '\\(\\sigma(s) = 1/(1 + e^{-s})\\): the logistic function. It turns the score \\(s = w_0 + w^\\top z = w_0 + w_1z_1 + \\dots + w_dz_d\\) into the probability of class 1. The boundary is where \\(s = 0\\).',
  fit: 'Fitting: choose the weights \\(w_0, \\dots, w_d\\) that make the average log-loss on the \\(N\\) training points as small as possible. Nothing else is added to the objective.',
  sets: 'Training points: the \\(N\\) points the model is fit to. New points (the test set): 2000 more points from the same source, never used for fitting. The plot shows 300 of them.',
  flip: 'Label flip: a point whose class was switched at random when the data were made. Nothing about \\(x\\) tells you it was flipped.',
  best: 'Best possible accuracy: the accuracy of the rule that generated the data (the dashed circle) on the new points. Flipped labels cannot be predicted, so no model can beat it except by luck.',
  poly: '\\(x_1^i x_2^j\\): \\(x_1\\) multiplied by itself \\(i\\) times, times \\(x_2\\) multiplied by itself \\(j\\) times. Degree \\(k\\) uses every pair with \\(1 \\le i + j \\le k\\): \\(k(k + 3)/2\\) features (65 for degree 10).',
  rbf: 'Radial basis function (RBF): \\(e^{-\\gamma\\lVert x - c\\rVert^2}\\), a bump centered on the landmark \\(c\\), where \\(\\lVert x - c\\rVert^2 = (x_1 - c_1)^2 + (x_2 - c_2)^2\\). Here 100 landmarks sit on a 10 × 10 grid, with \\(\\gamma = 4\\).',
  noise: '\\(\\varepsilon_1, \\dots, \\varepsilon_k\\): noise inputs. Each one is a random number from the standard normal distribution (mean 0, standard deviation 1), drawn separately for every point, training and new alike. They carry no information about the class.',
  dN: '\\(d\\): the number of features (the length of \\(z\\)). \\(N\\): the number of training points.',
};

// What was set by hand. The guard note appears only when the fit needed it.
export const GUARD_NOTE = 'These training points can be separated perfectly, so no best fit exists: the weights could grow without limit. A vanishingly small numerical guard (10⁻⁸ times the sum of the squared weights) lets the computer stop. Making it smaller only makes the overfitting you see worse.';

const pc = (v) => `${(100 * v).toFixed(1)} %`;

export const STATIONS = [
  {
    id: 'a1', part: 'A', name: 'Noise gets memorized', minutes: 9,
    lead: 'The concentric circles from the gallery, with a twist: some labels are wrong. When the data were made, each point had a chance of being switched to the other class. Which representation learns the circle, and which learns the mistakes?',
    how: (r) => `A flipped label cannot be predicted from x: the point sits among the other class. To get it right on the training set, a model has to bend its boundary around that one point. New points in the same spot will almost all have the other label, so every such bend costs accuracy on new points. The designed features [x₁², x₂²] can only draw circles, so they cannot bend around single points: they stay close to the best possible accuracy. Degree 10 and the 100 RBFs can bend almost anywhere, and they do.${r ? ` Here: ${r.memorized} of the ${r.flipped} flipped training labels are on the model's side of the boundary.` : ''}`,
    chosen: (r) => `The representation, the share of flipped labels, and the number of training points (N = ${r ? r.N : 100}) are set with the controls; the circles' size and the 0.12 position noise are fixed.`,
    defs: () => [D.x, D.model, D.fit, D.sets, D.flip, D.best, D.poly, D.rbf],
    question: {
      prompt: 'With 15 % of the labels flipped, degree 10 gets 94 % of its 100 training points right. How many new points will it get right?',
      choices: ['About 94 %', 'About 85 %, the best possible', 'About 68 %', 'About 50 %, a coin flip'],
      answer: 2,
      explain: 'About 68 %. It put 17 of the 22 flipped training labels on their (wrong) side, and each bend that does so mislabels the new points around it. The designed features get 84 % of the new points right and memorize none of the flips.',
      reveal: { rep: 'poly10', flip: 0.15, flips: true },
    },
  },
  {
    id: 'a2', part: 'A', name: 'The complexity dial', minutes: 8,
    lead: 'Polynomial features of every degree from 1 to 10, on the same noisy circles (15 % flipped). The chart averages 5 training sets, so that one lucky or unlucky sample does not decide. Then change N, the number of training points.',
    how: (r) => `Training accuracy climbs with the degree: each degree can draw everything the lower degrees can, and more. Accuracy on new points rises until the features can draw a circle (degree 2), then falls: the extra flexibility is spent on the noise.${r && r.gapText ? ` ${r.gapText}` : ''} More training points leave less room to bend around single points, so the same degree overfits less.`,
    chosen: () => 'The degree and N are set with the controls. 15 % of the labels are flipped.',
    defs: () => [D.x, D.model, D.fit, D.sets, D.best, D.poly, D.dN],
    question: {
      prompt: 'With N = 100 training points, which degree gets the most new points right (average of 5 training sets)?',
      choices: ['Degree 1', 'Degree 2', 'Degree 5', 'Degree 10'],
      answer: 1,
      explain: 'Degree 2, about 82 % of new points: the circle needs exactly x₁² and x₂². Degree 10 gets about 96 % of its training points right but only about 71 % of new ones.',
      reveal: { k: 2, N: 100 },
    },
  },
  {
    id: 'a3', part: 'A', name: 'Another training set', minutes: 6,
    lead: 'Draw 8 training sets of 100 points from the same circles, with the same 15 % chance of a flip, and fit each one. A boundary that changes with every sample is fitting the sample, not the circle.',
    how: (r) => `Each training set flips different points, so a model that bends around flipped points bends differently every time.${r ? ` The 8 boundaries disagree on ${pc(r.disagree)} of the area where data can appear (r ≤ 2.7)${r.rep === 'designed' ? ', almost all of it in the empty gap between the two classes, where no point ever lands' : ''}.` : ''} The majority vote averages the bends away: a bend that only one or two fits make was there to fit noise. It also saw 8 × 100 = 800 points, and that is exactly the point: more data, from the same source, washes out the noise.`,
    chosen: () => 'The representation is set with the control. Each training set has N = 100 points with 15 % of the labels flipped.',
    defs: () => [D.x, D.model, D.fit, D.sets, D.best, D.poly, 'Majority vote: for each new point, the class that most of the 8 fits predict.', 'Disagreement: for each pair of fits, the share of the area (r ≤ 2.7) where they predict different classes, averaged over all 28 pairs.'],
    question: {
      prompt: 'A single degree-10 fit gets about 70 % of new points right. What will the majority vote of all 8 degree-10 fits get?',
      choices: ['Worse: about 60 %', 'About the same: 70 %', 'Better: about 84 %'],
      answer: 2,
      explain: 'Better: about 84 %, as good as the designed features. Each fit bent around a different set of flipped points; the vote keeps only what most fits agree on, and that is close to the circle.',
      reveal: { rep: 'poly10', vote: true },
    },
  },
  {
    id: 'b1', part: 'B', name: 'Irrelevant inputs', minutes: 9,
    lead: 'Keep the two designed features x₁², x₂², and N = 50 training points with 10 % of the labels flipped. Then add k inputs of pure noise: random numbers with no connection to the class. In two dimensions a useless input looks harmless. Watch what happens as k grows.',
    how: (r) => `Each noise input gives the model one more direction in which it can move the training points. Once d + 1 ≥ N (d features, N training points), some flat boundary can put every training point on its own side, whatever the labels. Here that happens much sooner, from k = 20 on: x₁² and x₂² already handle most points, so the noise inputs only have to take care of the flipped and the hardest ones.${r ? ` With k = ${r.k}, ${pc(1 - r.realShare)} of the squared weights sit on noise inputs.` : ''} On new points the noise inputs take new random values, so those weights only add random error: the scores of new points spread across 0 (the histogram), and accuracy falls toward a coin flip.`,
    chosen: (r) => `The number of noise inputs k is set with the slider. N = 50 training points, 10 % flipped; the designed features [x₁², x₂²] are always included.${r ? '' : ''}`,
    defs: () => [D.x, D.model, D.fit, D.sets, D.best, D.noise, D.dN, 'Score \\(s = w_0 + w^\\top z\\): positive means the model predicts class 1. Its histogram shows how far each point is from the boundary.'],
    question: {
      prompt: 'Add 100 noise inputs and keep N = 50. How many new points does the model get right?',
      choices: ['About 90 %: it ignores the noise', 'About 80 %', 'About 65 %', '50 %: a coin flip'],
      answer: 2,
      explain: 'About 65 % (63 % for the training set shown, 65 % on average over 5 training sets), down from about 90 % with no noise inputs, while every training point is classified correctly.',
      reveal: { k: 100 },
    },
  },
];

// The three 2-D intuitions that fail in the irrelevant-inputs station, each with a live number.
export const INTUITIONS = [
  { claim: '“A useless input can’t hurt: the model will just ignore it.”', fact: (r) => `It does not ignore them: ${pc(1 - r.realShare)} of the squared weights are on the ${r.k} noise inputs.` },
  { claim: '“Overfitting looks like a wiggly boundary.”', fact: () => 'Here the boundary is perfectly flat: a hyperplane in all d dimensions. No picture of x₁ and x₂ shows it, yet it overfits.' },
  { claim: '“If the classes overlap in every picture, no flat boundary can separate them.”', fact: (r) => `Put any two features on the axes in “Any two features”: the classes overlap. Yet ${pc(r.train)} of the training points are on their own side of one flat boundary in all ${r.d} dimensions.` },
];

export const EXIT = [
  'In your own words: what does a model memorize when it overfits, and why does that hurt on new data?',
  'The overfit models had very large weights. How could you change the fitting objective so that large weights are discouraged? What might that cost?',
  'Two designed features beat 65 polynomial features and 100 RBFs. Where could good features come from when you cannot design them by hand?',
];

export const byId = (id) => STATIONS.find((s) => s.id === id);
export const val = (v, r) => (typeof v === 'function' ? v(r) : v);
