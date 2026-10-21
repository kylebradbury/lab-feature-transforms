import { standardModule, datasetControl, presetButtons, centerControls, lambdaControl, viewToggles, toggle, buttonRow, more, h, dlist } from './common.js';
import { theme } from '../plot2d.js';
import { hashString } from '../rng.js';

const one = (id, params = {}) => [{ id, params }];
const SINGLE = [
  { label: '\\(r\\) (L2)', features: one('r') },
  { label: '\\(\\lvert x_1\\rvert + \\lvert x_2\\rvert\\) (L1)', features: one('l1') },
  { label: '\\(\\max(\\lvert x_1\\rvert, \\lvert x_2\\rvert)\\) (L∞)', features: one('linf') },
  { label: '\\(\\lvert x_1 - c_1\\rvert\\)', features: one('abs1') },
  { label: '\\(\\lvert x_2 - c_2\\rvert\\)', features: one('abs2') },
  { label: '\\(\\min(x_1, x_2)\\)', features: one('minx') },
  { label: '\\(\\max(x_1, x_2)\\)', features: one('maxx') },
  { label: '\\([\\lvert x_1\\rvert, \\lvert x_2\\rvert]\\)', features: [{ id: 'abs1', params: {} }, { id: 'abs2', params: {} }] },
];
const mysteryP = (seed) => [1, 2, 3][hashString(`mystery${seed}`) % 3];
const set = (c, ds, feats, params = {}) => { c.dataset = { id: ds, params }; c.features = structuredClone(feats); c.fit.mode = 'auto'; c.view.showTest = false; };

// Dashed L1 / L2 / L∞ unit balls of radius R.
function ballsOverlay(R = 1.5) {
  return (ctx, plot) => {
    const T = theme();
    ctx.save();
    ctx.strokeStyle = T.ink2; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    const cx = plot.sx(0), cy = plot.sy(0), rx = plot.sx(R) - cx, ry = cy - plot.sy(R);
    ctx.beginPath(); ctx.moveTo(cx + rx, cy); ctx.lineTo(cx, cy - ry); ctx.lineTo(cx - rx, cy); ctx.lineTo(cx, cy + ry); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeRect(cx - rx, cy - ry, 2 * rx, 2 * ry);
    ctx.setLineDash([]); ctx.fillStyle = T.ink2; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('L1', cx + 4, cy - ry + 16); ctx.fillText('L2', cx + 0.72 * rx + 4, cy - 0.72 * ry - 2); ctx.fillText('L∞', cx + rx + 4, cy - ry + 12);
    ctx.restore();
  };
}

export default standardModule({
  id: 'norms',
  title: 'Norms, absolute values, min and max',
  short: 'Norms & min/max',
  keyIdea: 'Different ways of measuring size give different shapes: \\(\\lvert x_1\\rvert\\) gives a band, the L1 norm a <b>diamond</b>, L2 a <b>circle</b>, L∞ a <b>square</b>; \\(\\min\\) and \\(\\max\\) give L-shaped corners. Each is a single feature.',
  initial: () => ({ dataset: { id: 'band', params: {} }, features: one('abs1', { cx: 0.3 }), fit: { mode: 'auto', lambda: 1e-3 } }),
  initialState: () => ({ mystery: false, revealed: false, balls: false }),
  controls(m, el) {
    const s = m.state;
    el.append(presetButtons(m, SINGLE, { label: 'Pick a feature' }));
    if (s.mystery) {
      el.append(h('div', { class: 'hint', html: 'Mystery shape: diamond, circle or square? Choose <b>one</b> feature that reaches ≥ 98% test accuracy.' }));
      el.append(buttonRow([
        { label: s.revealed ? `It was ${['', 'L1 (diamond)', 'L2 (circle)', 'L∞ (square)'][m.cfg.dataset.params.p]}` : 'Reveal the shape', disabled: s.revealed, onClick: () => { s.revealed = true; m.rebuild(); } },
        { label: '🎲 New mystery', onClick: () => m.apply((c) => { c.seed += 1; c.dataset.params = { p: mysteryP(c.seed), R: 1.8 }; s.revealed = false; }) },
        { label: 'Leave mystery mode', onClick: () => { s.mystery = false; m.rebuild(); } },
      ]));
    } else {
      el.append(...datasetControl(m, ['band', 'corner', 'normball'], { params: true }));
      el.append(buttonRow([{ label: '❓ Mystery shape game', onClick: () => m.apply((c) => { s.mystery = true; s.revealed = false; c.seed += 1; set(c, 'normball', one('r'), { p: mysteryP(c.seed), R: 1.8 }); }) }]));
    }
    el.append(...centerControls(m));
    el.append(toggle({ label: 'Show the L1 / L2 / L∞ unit balls', value: s.balls, onChange: (b) => { s.balls = b; m.scene.overlays = b ? [ballsOverlay()] : []; m.scene.invalidate('paint'); } }).el);
    el.append(more([lambdaControl(m), ...viewToggles(m, ['test', 'mistakes'])]));
  },
  onFrame(m, sc) { sc.overlays = m.state.balls ? [ballsOverlay()] : []; },
  beats: [
    {
      title: 'A band from |x₁ − c|',
      html: 'Orange points sit in a vertical band. The single feature \\(\\lvert x_1 - c_1\\rvert\\) is small inside the band and large outside, so one threshold makes two parallel lines.',
      apply: (c) => set(c, 'band', one('abs1', { cx: 0.3 })),
    },
    {
      title: 'An L-shaped corner from min',
      html: '\\(\\min(x_1 - t, x_2 - s) > 0\\) means “both coordinates are large”. With the feature \\(\\min(x_1, x_2)\\) the boundary is an L-shaped corner on the diagonal \\(t = s\\); the data’s corner is near it. (Module 7’s corner indicator can put the corner anywhere.)',
      apply: (c) => set(c, 'corner', one('minx')),
    },
    {
      title: 'Mystery shape',
      html: 'The data is a diamond, a circle or a square, and the dataset name won’t tell you. Pick <b>one</b> feature from the buttons that reaches ≥ 98% test accuracy, then reveal.',
      apply: (c, m) => { m.state.mystery = true; m.state.revealed = false; set(c, 'normball', one('r'), { p: mysteryP(c.seed), R: 1.8 }); },
    },
    {
      title: 'Two absolute values',
      html: '\\([\\lvert x_1\\rvert, \\lvert x_2\\rvert]\\) gives boundaries \\(a\\lvert x_1\\rvert + b\\lvert x_2\\rvert = c\\): rhombi of any aspect ratio (both weights the same sign), bands (one weight 0), or bow-ties (opposite signs). Try it on the diamond.',
      apply: (c, m) => { m.state.mystery = false; set(c, 'normball', [{ id: 'abs1' }, { id: 'abs2' }], { p: 1 }); },
    },
    {
      title: 'Unit balls',
      html: 'The three norms have unit “balls” shaped like a diamond (L1), circle (L2) and square (L∞). You will meet these again in Lecture 9: L1 regularization (lasso) has a diamond-shaped constraint, which is why it sets weights exactly to zero.',
      apply: (c, m) => { m.state.mystery = false; m.state.balls = true; set(c, 'normball', one('linf'), { p: 3 }); },
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'Which single feature gives a <b>square</b> boundary?',
      choices: ['\\(\\lvert x_1\\rvert + \\lvert x_2\\rvert\\)', '\\(\\max(\\lvert x_1\\rvert, \\lvert x_2\\rvert)\\)', '\\(r\\)', '\\(\\min(x_1, x_2)\\)'], answer: 1,
      explain: 'The level sets of the L∞ norm \\(\\max(\\lvert x_1\\rvert, \\lvert x_2\\rvert)\\) are axis-aligned squares.',
      reveal: (c, m) => { m.state.mystery = false; set(c, 'normball', one('linf'), { p: 3 }); },
    },
    {
      id: 'q2', prompt: 'With features \\([\\lvert x_1\\rvert, \\lvert x_2\\rvert]\\), which of these shapes is <b>not</b> possible?',
      choices: ['A diamond', 'A band', 'A bow-tie', 'A circle'], answer: 3,
      explain: 'The score \\(w_0 + a\\lvert x_1\\rvert + b\\lvert x_2\\rvert\\) is piecewise linear, so its zero set is made of straight segments: diamonds, bands and bow-ties, but never a circle.',
      reveal: (c, m) => { m.state.mystery = false; set(c, 'normball', [{ id: 'abs1' }, { id: 'abs2' }], { p: 2 }); },
    },
  ],
  inPractice: dlist(['Manhattan (L1) distance on a street grid: “blocks to the nearest station”', 'worst-case tolerance checks: \\(\\max_i \\lvert\\text{deviation}_i\\rvert < \\varepsilon\\) (L∞)', '“both conditions hold” rules like \\(\\min(\\text{score}_A, \\text{score}_B) > t\\)']),
  why: 'A single feature \\(g(x)\\) with a linear classifier always gives the boundary \\(g(x) = \\text{const}\\): a level set of \\(g\\). So the shape of the boundary is the shape of \\(g\\)’s level sets: diamonds for L1, circles for L2, squares for L∞.',
});
