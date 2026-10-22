// The exhibits. Each pairs one dataset with one representation z = Φ(x) and
// says, in a few sentences, what Φ does to the plane and where it is used.
// The model is always the same: logistic regression on z.
//
// features(k) returns feature specs for features.js; k is the exhibit's knob
// value (undefined without a knob). Text fields may be functions of k.
// zAxis names the feature-space axes (plain text, for the plot); zTex optionally
// replaces the features' own TeX in the equations.
// view: the original-space box, when not the dataset's own.
// collapse: Φ squeezes the plane onto a curve (or onto points), or wraps it
// around many times, so the shaded original space fades out early in the morph.
// jumps: Φ is discontinuous, so the plane tears apart at every jump.

import { spiralOmega } from './datasets.js';

export const RAW = [{ id: 'raw', params: {} }];

const EDGE_HOW = 'With more than two features, feature space cannot be drawn directly, so this view looks at it <b>edge-on</b>: the horizontal axis is the one direction the model uses, so the flat boundary appears as a vertical line. The vertical axis is another direction in which the points spread out.';

export const WINGS = [
  { id: 'designed', name: 'Designed features', blurb: 'Each representation was chosen by looking at the data. One or two features are enough.' },
  { id: 'generic', name: 'Generic features', blurb: 'Many features of one kind, chosen without looking at the data. They can draw almost anything, at a price: many features, and weights that are hard to interpret.' },
];

export const EXHIBITS = [
  {
    id: 'line', wing: 'designed', family: 'Raw inputs', name: 'Straight line', shape: 'a straight line',
    ds: 'blobs', params: {},
    features: () => RAW,
    phi: '\\Phi(x) = [\\,x_1,\\ x_2\\,]',
    zAxis: ['x₁', 'x₂'],
    lead: 'The raw inputs, unchanged. On its own, a linear model can only draw a straight line.',
    how: 'Φ does nothing here, so feature space is the original space and nothing moves. Every other exhibit uses this same model; only its inputs change.',
    practice: 'Often all you need: when the classes differ by a weighted sum of the inputs, no transform is required. The raw features are the baseline every other representation has to beat.',
  },
  {
    id: 'circle', wing: 'designed', family: 'Powers', name: 'Circle', shape: 'a circle',
    ds: 'circles', params: {},
    features: () => [{ id: 'x1sq' }, { id: 'x2sq' }],
    phi: '\\Phi(x) = [\\,x_1^2,\\ x_2^2\\,]',
    zAxis: ['x₁²', 'x₂²'],
    lead: 'Square each coordinate, and a straight line in the new features becomes a circle.',
    how: 'Squaring forgets the sign: x and −x land in the same place, so the plane folds twice and all four quadrants pile onto one. The circle x₁² + x₂² = R² becomes the straight line z₁ + z₂ = R².',
    practice: 'Deviations in either direction: a body temperature or blood pressure that is too high or too low. A square (or squared distance from a typical value) measures how far off a reading is, whichever way.',
  },
  {
    id: 'parabola', wing: 'designed', family: 'Powers', name: 'Parabola', shape: 'a parabola',
    ds: 'parabola', params: {},
    features: () => [{ id: 'x1sq' }, { id: 'x2' }],
    phi: '\\Phi(x) = [\\,x_1^2,\\ x_2\\,]',
    zAxis: ['x₁²', 'x₂'],
    lead: 'Square just one coordinate to bend the line into a parabola.',
    how: 'Only x₁ is squared, so the plane folds once, along the vertical axis, and the left half lands on top of the right. The parabola x₂ = a·x₁² + c becomes the straight line z₂ = a·z₁ + c.',
    practice: 'Effects that rise and then fall: crop yield against temperature, performance against stress, a drug that helps at moderate doses and harms at high ones.',
  },
  {
    id: 'hyperbola', wing: 'designed', family: 'Powers', name: 'Hyperbola', shape: 'a hyperbola',
    ds: 'xor', params: {},
    features: () => [{ id: 'x1' }, { id: 'x1x2' }],
    phi: '\\Phi(x) = [\\,x_1,\\ x_1x_2\\,]',
    zAxis: ['x₁', 'x₁x₂'],
    lead: 'Multiply the two coordinates: the sign of the product tells which pair of opposite quadrants a point is in.',
    how: 'Keeping x₁ and adding the product x₁x₂ flips the left half of the plane upside down and pinches it toward the middle. Opposite quadrants end up on the same side of the line z₂ = 0, and that line is the whole boundary.',
    practice: 'Interactions, when the effect of one input depends on another: a treatment that helps only patients with a certain gene, or a discount that matters only to price-sensitive customers.',
  },
  {
    id: 'ring', wing: 'designed', family: 'Distance', name: 'Ring', shape: 'two circles (a ring)', collapse: true,
    ds: 'ring', params: {},
    features: () => [{ id: 'r' }, { id: 'r2' }],
    phi: '\\Phi(x) = [\\,r,\\ r^2\\,],\\quad r = \\lVert x\\rVert',
    zAxis: ['r', 'r²'],
    lead: 'The distance from the center, and its square: one straight line now cuts out a ring.',
    how: 'The distance r forgets which way each point lies, so the whole plane collapses onto the curve z₂ = z₁². A straight line crosses that curve twice, at two distances, so in the original space the boundary is two circles.',
    practice: 'Targets that are a band: the “Goldilocks” distance from a star at which water stays liquid, or a lab value that is risky both when too low and when too high.',
  },
  {
    id: 'flower', wing: 'designed', family: 'Direction', name: 'Flower', shape: (k) => `a flower with ${k} petals`, collapse: true,
    ds: 'flower', params: {},
    features: (k) => [{ id: 'r' }, { id: 'sinkt', params: { k } }],
    knob: { label: 'Petals in the feature, k', min: 2, max: 8, step: 1, default: 5, int: true, hint: 'The data has 5 petals. Try a feature with a different number.' },
    phi: (k) => `\\Phi(x) = [\\,r,\\ \\sin ${k}\\theta\\,]`,
    zAxis: (k) => ['r', `sin ${k}θ`],
    lead: 'The distance plus a wave that runs around the center: the boundary grows petals.',
    how: (k) => `θ is the direction of x. Walking once around the center, sin ${k}θ goes up and down ${k} times, so the plane wraps ${k} times around onto a strip. The flower r = c + a·sin ${k}θ becomes the straight line z₁ = c + a·z₂.`,
    practice: 'Anything that depends on the direction around a center: how far a directional antenna or a lighthouse beam reaches in each direction.',
  },
  {
    id: 'spiral', wing: 'designed', family: 'Direction', name: 'Spiral', shape: 'two interlocking spirals', collapse: true,
    ds: 'spirals', params: {},
    features: (k) => [{ id: 'spiral', params: { omega: spiralOmega(k) } }],
    knob: { label: 'Turns the feature assumes', min: 0.5, max: 3, step: 0.25, default: 2, hint: 'The data turns twice. Try a feature that assumes a different number of turns.' },
    phi: '\\Phi(x) = [\\,\\sin(\\omega r-\\theta),\\ \\cos(\\omega r-\\theta)\\,]',
    zAxis: ['sin(ωr − θ)', 'cos(ωr − θ)'],
    lead: 'Two features that turn with the distance untangle a pair of interlocking spirals.',
    how: 'Each point moves onto a circle, at the angle ωr − θ. Along one arm of a spiral that angle stays the same, so each arm shrinks to one spot, and the two arms land on opposite sides of the circle. A straight line between them is the whole boundary.',
    practice: 'Rare in a spreadsheet, but the lesson is general: when you know the shape of the problem (here, how fast the arms turn), building it into the features beats hoping the model will find it.',
  },
  {
    id: 'wedge', wing: 'designed', family: 'Direction', name: 'Wedge', shape: 'a wedge (two rays from the center)', collapse: true,
    ds: 'wedge', params: { t1: 60, t2: 120, noise: 0.02 },
    features: () => [{ id: 'unitdir' }],
    phi: '\\Phi(x) = \\frac{x}{\\lVert x\\rVert} = [\\,\\cos\\theta,\\ \\sin\\theta\\,]',
    zAxis: ['cos θ', 'sin θ'],
    lead: 'Keep only the direction of each point and forget its length: a slice of pie becomes easy.',
    how: 'Dividing x by its length slides every point straight in or out onto the unit circle. The slice becomes an arc of that circle, and a straight line (a chord) cuts the arc off.',
    practice: 'When only direction matters: wind direction, the heading of a ship, or comparing documents by the direction of their word-count vectors instead of their length (cosine similarity).',
  },
  {
    id: 'wave', wing: 'designed', family: 'Waves', name: 'Wave', shape: 'a sine wave',
    ds: 'sine', params: { ph: 0, w: 2, A: 1.5 },
    features: (k) => [{ id: 'sinx1', params: { w: k } }, { id: 'x2' }],
    knob: { label: 'Frequency in the feature, ω', min: 0.5, max: 4, step: 0.05, default: 2, hint: 'The data’s wave has ω = 2.' },
    phi: (k) => `\\Phi(x) = [\\,\\sin ${+k.toFixed(2)}x_1,\\ x_2\\,]`,
    zAxis: (k) => [`sin ${+k.toFixed(2)}x₁`, 'x₂'],
    lead: 'The sine of one coordinate turns a straight line into a wave.',
    how: 'As x₁ increases, sin ωx₁ swings back and forth between −1 and 1, so the plane folds like an accordion onto a narrow strip. The wave x₂ = A·sin ωx₁ becomes the straight line z₂ = A·z₁.',
    practice: 'Anything that repeats: the hour of the day, the day of the week, the month of the year. Encoding time with sin and cos puts 11:59 pm right next to midnight.',
  },
  {
    id: 'checker', wing: 'designed', family: 'Waves', name: 'Checkerboard', shape: 'a checkerboard',
    ds: 'checker', params: {},
    features: () => [{ id: 'checker', params: { w: Math.PI / 1.5 } }],
    phi: '\\Phi(x) = \\sin\\omega x_1 \\cdot \\sin\\omega x_2',
    zAxis: ['sin ωx₁ · sin ωx₂', 'x₂ (not used by the model)'],
    lead: 'One feature, the product of two waves, matches a checkerboard.',
    how: 'sin ωx₁ · sin ωx₂ is positive on half of the squares and negative on the others. Each point becomes a single number, and one cut at 0 separates the colors. (The vertical axis is x₂, kept only to spread the points out; the model does not use it.)',
    practice: 'Repeating two-dimensional patterns, such as textures in images or crystal lattices. More generally, the product of two features lets them act together.',
  },
  {
    id: 'diamond', wing: 'designed', family: 'Folds', name: 'Diamond', shape: 'a diamond',
    ds: 'normball', params: { p: 1 },
    features: () => [{ id: 'abs1' }, { id: 'abs2' }],
    phi: '\\Phi(x) = [\\,\\lvert x_1\\rvert,\\ \\lvert x_2\\rvert\\,]',
    zAxis: ['|x₁|', '|x₂|'],
    lead: 'Absolute values turn a straight line into a diamond.',
    how: 'Like squaring, |x| forgets the sign and folds all four quadrants onto one, but it does not stretch distances. The diamond |x₁| + |x₂| = R becomes the straight line z₁ + z₂ = R. The Circle exhibit makes the same fold, but there the squares bend the edges round.',
    practice: 'Total deviation in any direction: city-block distance (how far you walk on a grid of streets), or a part that passes inspection when its errors in each dimension add up to less than a tolerance.',
  },
  {
    id: 'corner', wing: 'designed', family: 'Folds', name: 'Corner', shape: 'an L-shaped corner',
    ds: 'corner', params: { t: -1, s: -1 },
    features: () => [{ id: 'minx' }, { id: 'maxx' }],
    phi: '\\Phi(x) = [\\,\\min(x_1,x_2),\\ \\max(x_1,x_2)\\,]',
    zAxis: ['min(x₁, x₂)', 'max(x₁, x₂)'],
    lead: 'Sort the two coordinates: the smaller one draws an L-shaped corner.',
    how: 'Putting the smaller coordinate first folds the plane along the diagonal x₁ = x₂, so every point lands above it. “Both coordinates above −1” becomes “the smaller coordinate is above −1”: the straight line z₁ = −1.',
    practice: 'Weakest link and best of: approve a joint loan only if both applicants’ credit scores clear a cutoff (the minimum), or admit a student if either test score is high enough (the maximum).',
  },
  {
    id: 'powerlaw', wing: 'designed', family: 'Logs', name: 'Power law', shape: 'a power-law curve',
    ds: 'loans', params: { incSd: 1, pw: 0.3, spread: 0.25, noise: 0 },
    view: { xmin: 0, xmax: 400, ymin: 0, ymax: 120 },
    features: () => [{ id: 'log1' }, { id: 'log2' }],
    phi: '\\Phi(x) = [\\,\\log x_1,\\ \\log x_2\\,]',
    zAxis: ['log income', 'log loan'],
    lead: 'Take logarithms of skewed, positive numbers, and a curve becomes a straight line.',
    how: 'Most incomes and loans are small and a few are large, so the points crowd into one corner. Logarithms spread out the small values and squeeze the large ones. Approved loans lie below the curve loan = k·incomeᵖ, which becomes the straight line log loan = log k + p·log income.',
    practice: 'Income, population, prices, file sizes: positive numbers that span several orders of magnitude. Ratios such as debt-to-income or BMI also become straight lines on log scales.',
  },
  {
    id: 'islands', wing: 'designed', family: 'Similarity', name: 'Islands', shape: 'two separate islands',
    ds: 'islands', params: {},
    features: (k) => [{ id: 'rbf', params: { place: 'manual', pts: [[-1.3, 0.9], [1.2, -1.0]], gamma: k } }],
    knob: { label: 'Bump width, γ', min: 0.1, max: 5, step: 0.05, default: 1, log: true, hint: 'Small γ: wide bumps. Large γ: narrow bumps.' },
    phi: '\\Phi(x) = [\\,e^{-\\gamma\\lVert x-c_1\\rVert^2},\\ e^{-\\gamma\\lVert x-c_2\\rVert^2}\\,]',
    zAxis: ['closeness to c₁', 'closeness to c₂'],
    zTex: ['e^{-\\gamma\\lVert x-c_1\\rVert^2}', 'e^{-\\gamma\\lVert x-c_2\\rVert^2}'],
    lead: 'Measure how close each point is to two landmarks: one linear model draws two separate islands.',
    how: 'Each feature is a bump: 1 at its landmark (◆) and close to 0 far away. Points near the first landmark move toward (1, 0), points near the second toward (0, 1), and everything else piles up near (0, 0). A straight line cuts off that corner.',
    practice: 'Similarity to known cases: the distance to the nearest hospital, or how much a transaction looks like known fraud. Kernel methods such as support vector machines put a landmark at every training point.',
  },

  // ---- generic ----
  {
    id: 'poly3', wing: 'generic', family: 'Polynomial', name: 'Wiggly curve', shape: (k) => `a curve of degree ${k}`,
    ds: 'moons', params: { noise: 0.15 },
    features: (k) => [{ id: 'poly', params: { k } }],
    knob: { label: 'Degree', min: 1, max: 6, step: 1, default: 3, int: true, hint: 'Degree 1 is the raw features again.' },
    phi: (k) => `\\Phi(x) = [\\,x_1^i x_2^j : 1 \\le i + j \\le ${k}\\,]`,
    lead: 'Every power and product of x₁ and x₂ up to degree 3: nine features, chosen without looking at the data.',
    how: EDGE_HOW,
    practice: 'A quick, generic first try. The number of features grows fast with the degree and with the number of inputs, and high degrees bend to fit noise.',
  },
  {
    id: 'bumps', wing: 'generic', family: 'Bumps (RBF)', name: 'Heart', shape: 'a heart',
    ds: 'heart', params: {},
    features: (k) => [{ id: 'rbf', params: { place: 'grid', m: 7, gamma: k } }],
    knob: { label: 'Bump width, γ', min: 0.2, max: 8, step: 0.05, default: 1.5, log: true, hint: 'Small γ: wide, smooth bumps. Large γ: narrow bumps that can only see their own neighborhood.' },
    phi: '\\Phi(x) = [\\,e^{-\\gamma\\lVert x-c_j\\rVert^2} : j = 1,\\dots,49\\,]',
    lead: '49 bumps, one at each landmark of a 7 × 7 grid (◆), can trace almost any outline.',
    how: EDGE_HOW,
    practice: 'The idea behind kernel methods: a support vector machine with an RBF kernel puts a bump at every training point.',
  },
  {
    id: 'relu', wing: 'generic', family: 'Hinges (ReLU)', name: 'Straight pieces', shape: 'a curve made of straight pieces',
    ds: 'spirals', params: { turns: 1.25 },
    features: (k) => [{ id: 'relu', params: { m: k } }],
    knob: { label: 'Hinges', min: 5, max: 200, step: 1, default: 60, int: true },
    phi: (k) => `\\Phi(x) = [\\,\\max(0,\\ u_j^\\top x + b_j) : j = 1,\\dots,${k}\\,]`,
    lead: '60 random hinges, max(0, uᵀx + b), each bending along its own line: the boundary is built from straight pieces.',
    how: EDGE_HOW,
    practice: 'This is a neural network with one hidden layer whose first layer is frozen at random values. Training that layer as well, so that the network learns Φ from the data, is what deep learning does.',
  },
  {
    id: 'bins', wing: 'generic', family: 'Bins', name: 'Staircase', shape: 'a staircase', collapse: true, jumps: true,
    ds: 'circles', params: {},
    features: (k) => [{ id: 'bins', params: { B: k } }],
    knob: { label: 'Bins per axis', min: 2, max: 14, step: 1, default: 6, int: true },
    phi: '\\Phi(x) = [\\,\\mathbb{1}[x_1 \\in \\text{bin } b],\\ \\mathbb{1}[x_2 \\in \\text{bin } b]\\,]',
    lead: 'Cut each axis into bins and give each bin its own on/off feature: the boundary can only step along the axes.',
    how: `${EDGE_HOW} Every point in the same pair of bins gets exactly the same features, so whole cells collapse onto single spots.`,
    practice: 'Binning (age groups, income brackets) is common and easy to explain. Decision trees also split along the axes, which is why their boundaries look like staircases too.',
  },
];

for (const ex of EXHIBITS) ex.k0 = ex.knob ? ex.knob.default : undefined;

export const byId = (id) => EXHIBITS.find((e) => e.id === id);
export const val = (v, k) => (typeof v === 'function' ? v(k) : v);

// Finale: every representation on every dataset.
export const MATCH = {
  datasets: [
    { ds: 'blobs', params: {}, name: 'Two blobs' },
    { ds: 'circles', params: {}, name: 'Circles' },
    { ds: 'xor', params: {}, name: 'Quadrants' },
    { ds: 'ring', params: {}, name: 'Ring' },
    { ds: 'sine', params: { ph: 0, w: 2, A: 1.5 }, name: 'Wave' },
    { ds: 'spirals', params: {}, name: 'Spirals' },
  ],
  reps: [
    { exhibit: 'line', tex: '[x_1,\\ x_2]', features: RAW },
    { exhibit: 'circle', tex: '[x_1^2,\\ x_2^2]', features: [{ id: 'x1sq' }, { id: 'x2sq' }] },
    { exhibit: 'hyperbola', tex: '[x_1,\\ x_1x_2]', features: [{ id: 'x1' }, { id: 'x1x2' }] },
    { exhibit: 'ring', tex: '[r,\\ r^2]', features: [{ id: 'r' }, { id: 'r2' }] },
    { exhibit: 'wave', tex: '[\\sin 2x_1,\\ x_2]', features: [{ id: 'sinx1', params: { w: 2 } }, { id: 'x2' }] },
    { exhibit: 'spiral', tex: '[\\sin(\\omega r-\\theta),\\ \\cos(\\omega r-\\theta)]', features: [{ id: 'spiral', params: { omega: spiralOmega(2) } }] },
    { exhibit: 'bumps', tex: '49\\ \\text{bumps}', generic: true, features: [{ id: 'rbf', params: { place: 'grid', m: 7, gamma: 1.5 } }] },
  ],
};
