import { standardModule, presetButtons, lambdaControl, viewToggles, toggle, select, buttonRow, more, h, DATASETS, dlist } from './common.js';

const F = {
  raw: [{ id: 'raw', params: {} }],
  ratio: [{ id: 'ratio', params: {} }],
  logx: [{ id: 'log1', params: {} }, { id: 'x2', params: {} }],
  loglog: [{ id: 'log1', params: {} }, { id: 'log2', params: {} }],
  quad: [{ id: 'quad2', params: { mask: [1, 1, 1, 1, 1] } }],
};
const PRESETS = [
  { label: 'raw [income, loan]', features: F.raw },
  { label: 'ratio loan / income', features: F.ratio },
  { label: '[log income, loan]', features: F.logx },
  { label: '[log income, log loan]', features: F.loglog },
  { label: 'quadratic (5)', features: F.quad },
];
const set = (c, rule, feats, extra = {}) => {
  c.dataset = { id: 'loans', params: { rule, trainBelow: extra.trainBelow || 0 } };
  c.features = structuredClone(feats); c.fit.mode = 'auto'; c.fit.lambda = 1e-4;
  c.view.log = !!extra.log; c.view.showTest = !!extra.showTest;
};

export default standardModule({
  id: 'monotone',
  title: 'Logs and ratios: what practitioners actually do',
  short: 'Logs & ratios',
  keyIdea: 'Real-world positive quantities (income, prices, counts) are skewed, and rules about them are often <b>ratios</b> or <b>power laws</b>. Taking \\(\\log\\) or forming a ratio turns those rules into straight lines, and the model extrapolates far better.',
  initial: () => ({ dataset: { id: 'loans', params: { rule: 'power' } }, features: F.raw, fit: { mode: 'auto', lambda: 1e-4 } }),
  controls(m, el) {
    const p = { ...m.cfg.dataset.params };
    el.append(
      presetButtons(m, PRESETS),
      select({ label: 'True approval rule (normally unknown!)', options: DATASETS.loans.params.rule.options, value: p.rule || 'power', onChange: (v) => m.apply((c) => { c.dataset.params = { ...c.dataset.params, rule: v }; }) }).el,
      toggle({ label: 'Log–log axes for the plot', value: m.cfg.view.log, onChange: (b) => m.apply((c) => { c.view.log = b; }) }).el,
      toggle({ label: 'Train only on incomes below $150k (test on all)', value: (p.trainBelow || 0) > 0, onChange: (b) => m.apply((c) => { c.dataset.params = { ...c.dataset.params, trainBelow: b ? 150 : 0 }; c.view.showTest = b || c.view.showTest; }) }).el,
      buttonRow([{ label: '🎲 New sample', onClick: () => m.set((c) => { c.seed += 1; }, 'data') }], { essential: false }),
      more([lambdaControl(m), ...viewToggles(m, ['test', 'mistakes'])]),
      h('p', { class: 'hint', html: 'Hover the plot to read dollar values. Orange = approved.' }),
    );
  },
  beats: [
    {
      title: 'Skewed data, raw features',
      html: 'Incomes (\\(x_1\\), $k) and requested loans (\\(x_2\\)). Most points crowd near the origin; a few are huge. The true rule is a power law, so a straight line in raw units fits badly at both ends.',
      apply: (c) => set(c, 'power', F.raw),
    },
    {
      title: 'A ratio feature',
      html: 'Switch the rule to “loan ≤ 0.4 · income”. The domain feature \\(x_2 / x_1\\) (a <b>debt-to-income ratio</b>) captures it with <b>one</b> column: the boundary is a line through the origin. BMI, price per square foot and click-through rate are ratio features too.',
      apply: (c) => set(c, 'ratio', F.ratio),
    },
    {
      title: 'Logs straighten power laws',
      html: 'A power law “loan ≤ \\(k\\cdot\\text{income}^{p}\\)” becomes \\(\\log x_2 \\le \\log k + p\\log x_1\\), linear in \\([\\log x_1, \\log x_2]\\). Turn on <b>log–log axes</b>: the curved boundary becomes a straight line. Taking logs <i>is</i> a change of axes.',
      apply: (c) => set(c, 'power', F.loglog, { log: true }),
    },
    {
      title: 'Logging just one variable',
      html: 'For the rule “loan ≤ \\(30\\ln(\\text{income}) - 20\\)”, \\([\\log x_1, x_2]\\) gives exactly a logarithmic boundary. Choose the transform that matches how the quantity behaves.',
      apply: (c) => set(c, 'log', F.logx),
    },
    {
      title: 'Extrapolation',
      html: 'Train only on incomes below $150k, test on everyone. The <b>quadratic</b> model fits the training range but bends the wrong way beyond it (look at the hollow test points on the right). Now pick <b>[log income, log loan]</b>: a transform that matches the true structure extrapolates cleanly.',
      apply: (c) => set(c, 'power', F.quad, { trainBelow: 150, showTest: true }),
    },
  ],
  questions: [
    {
      id: 'q1', prompt: 'Approve if loan ≤ 0.4 × income. Which <b>single</b> feature captures this exactly?',
      choices: ['\\(x_1\\)', '\\(x_2 / x_1\\)', '\\(\\log x_1\\)', '\\(x_1 x_2\\)'], answer: 1,
      explain: '\\(x_2 / x_1 \\le 0.4\\) is one threshold on the ratio.',
      reveal: (c) => set(c, 'ratio', F.ratio),
    },
    {
      id: 'q2', prompt: 'Approve if loan ≤ \\(k\\cdot\\text{income}^{p}\\) (a power law). Which pair makes the boundary a straight line?',
      choices: ['\\([x_1, x_2]\\)', '\\([\\log x_1, x_2]\\)', '\\([\\log x_1, \\log x_2]\\)', '\\([x_1^2, x_2^2]\\)'], answer: 2,
      explain: 'Taking logs of both sides: \\(\\log x_2 \\le \\log k + p\\log x_1\\), a straight line in \\((\\log x_1, \\log x_2)\\).',
      reveal: (c) => set(c, 'power', F.loglog, { log: true }),
    },
    {
      id: 'q3', prompt: 'Trained only below $150k, tested on all incomes: which extrapolates better?',
      choices: ['Quadratic (5 features)', '[log income, log loan] (2 features)', 'They are the same'], answer: 1,
      explain: 'The log–log model has the right shape everywhere; the quadratic only matches the shape inside the training range.',
      reveal: (c) => set(c, 'power', F.loglog, { trainBelow: 150, showTest: true }),
    },
  ],
  inPractice: dlist(['log(income), log(price), log(1 + count) for skewed positive variables', 'ratios: debt-to-income, BMI, price per square foot, conversion rate', 'log–log models for power laws (elasticities in economics)']) + '<p class="hint">Domain matters: \\(\\log\\) and ratios need positive inputs, so these features are disabled on the centered datasets in the Sandbox.</p>',
  why: 'A monotone transform of one feature does not change the ordering of points along that axis, but it changes which boundaries are straight. If the true rule is \\(x_2 = k x_1^p\\), then in \\((\\log x_1, \\log x_2)\\) coordinates it is the line \\(\\log x_2 = \\log k + p\\log x_1\\), which a linear classifier represents exactly.',
});
