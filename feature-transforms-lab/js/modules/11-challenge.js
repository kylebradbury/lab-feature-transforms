import { standardModule, lambdaControl, buttonRow, more, viewToggles, h, card, group, store, pct, tex, renderMath, TRANSFORMS } from './common.js';
import { paletteFor } from './10-sandbox.js';
import { HOLES, BUDGET, SUBMISSIONS, SPLIT, holeSeed, points } from '../challenge.js';
import { quickFit } from '../fit.js';
import { copyText } from '../ui.js';

const record = () => store('challenge') || {};
const saveRecord = (r) => store('challenge', r);

function setHole(c, i, features = []) {
  const H = HOLES[i];
  c.dataset = { id: H.ds, params: structuredClone(H.params) };
  c.seed = holeSeed(i);
  c.split = { ...SPLIT };
  c.features = structuredClone(features);
  c.fit = { mode: 'auto', lambda: 1e-3, w: null };
  c.view.showTest = false; c.view.showVal = false; c.view.log = false;
}

function featText(feats) {
  return feats.map((f) => TRANSFORMS[f.id].label + (f.params && Object.keys(f.params).length ? ` (${Object.entries(f.params).map(([k, v]) => `${k}=${Array.isArray(v) ? '…' : +(+v).toFixed(3)}`).join(', ')})` : '')).join(' + ') || 'none';
}

export default standardModule({
  id: 'challenge',
  title: 'Challenge: Feature Golf',
  short: 'Challenge',
  core: true,
  valInsteadOfTest: true,
  hideTest: true,
  keyIdea: `Fewest features, highest accuracy. Each hole: build \\(\\Phi\\) using the <b>validation</b> accuracy as your guide, then submit to a <b>hidden test set</b> (${SUBMISSIONS} submissions per hole, the last one counts). Score = round(100 × test accuracy) − 2 × (feature columns). Budget: ${BUDGET} columns.`,
  initial: () => {
    const c = {};
    c.view = {};
    setHole(c, 0);
    return c;
  },
  initialState: () => ({ hole: 0 }),
  controls(m, el) {
    const i = m.state.hole, H = HOLES[i], rec = record()[H.id] || { subs: [] };
    const subs = rec.subs || [];
    const d = m.scene.prep.d;
    const holes = h('div', { class: 'holes' });
    HOLES.forEach((Hk, k) => {
      const r = record()[Hk.id], last = r && r.subs && r.subs[r.subs.length - 1];
      const st = last ? (last.acc >= Hk.target ? `✓ ${last.pts} pts` : `✗ ${pct(last.acc)}`) : 'not played';
      const b = h('button', { class: 'hole-btn', type: 'button', 'aria-pressed': String(k === i) }, `${k + 1}. ${Hk.name}`, h('span', { class: 'st' + (last && last.acc >= Hk.target ? ' ok' : '') }, st));
      b.addEventListener('click', () => { m.state.hole = k; m.apply((c) => setHole(c, k)); });
      holes.append(b);
    });
    el.append(holes);
    el.append(h('div', { class: 'ctl', html: `<b>Hole ${i + 1}: ${H.name}.</b> Target test accuracy ≥ <b>${pct(H.target)}</b>. Hint: ${H.hint}` }));
    el.append(group('Build Φ', [paletteFor(m, { budget: BUDGET })]));
    el.append(lambdaControl(m, { essential: true }));
    const left = SUBMISSIONS - subs.length;
    const done = left <= 0 || rec.solution;
    const result = h('div', { class: 'ctl' });
    if (subs.length) {
      const last = subs[subs.length - 1];
      result.innerHTML = `Last submission: test accuracy <b>${pct(last.acc)}</b> with ${last.d} column${last.d === 1 ? '' : 's'} → <b>${last.acc >= H.target ? `${last.pts} points ✓` : 'below target (0 points)'}</b>.`;
    }
    el.append(buttonRow([
      {
        label: done ? 'No submissions left' : `Submit to hidden test set (${left} left)`, primary: true, disabled: done || d > BUDGET || d === 0,
        onClick: () => {
          const M = m.scene.metrics, r = record();
          const cur = r[H.id] || { subs: [] };
          cur.subs = [...(cur.subs || []), { acc: M.test.acc, d, pts: points(M.test.acc, d), feats: structuredClone(m.cfg.features), lambda: m.cfg.fit.lambda }];
          r[H.id] = cur;
          saveRecord(r);
          m.rebuild();
          m.extras.refresh();
        },
      },
      {
        label: rec.solution ? 'Solution shown' : 'Show solution', disabled: !!rec.solution && false,
        onClick: () => {
          if (!rec.solution && subs.length < SUBMISSIONS && !window.confirm('Show the reference solution? This hole will be marked “solution viewed”.')) return;
          const r = record(); r[H.id] = { ...(r[H.id] || { subs: [] }), solution: true }; saveRecord(r);
          m.apply((c) => { c.features = structuredClone(H.ref); });
          m.extras.refresh();
        },
      },
    ]));
    if (d > BUDGET) el.append(h('div', { class: 'warn' }, `Over budget: ${d} > ${BUDGET} columns.`));
    el.append(result);
    if (rec.solution) {
      const ref = quickFit(H.ds, H.ref, { params: H.params, ...SPLIT, seed: holeSeed(i) });
      el.append(h('div', { class: 'ctl', html: `<b>Reference:</b> ${H.why} Test accuracy ${pct(ref.test.acc)}, ${ref.d} column${ref.d === 1 ? '' : 's'} → par <b>${points(ref.test.acc, ref.d)}</b>.` }));
    }
    el.append(more([...viewToggles(m, ['mistakes', 'shade']), h('label', { class: 'toggle' }, Object.assign(h('input', { type: 'checkbox' }), { checked: m.cfg.view.showVal, onchange: (e) => m.set((c) => { c.view.showVal = e.target.checked; }, 'paint') }), 'Show validation points (hollow)')]));
  },
  describe: () => 'test accuracy is hidden until you submit',
  inPractice: 'This is the honest workflow from Lectures 6–7: tune on validation data, look at the test set once. Peeking at the test set to choose features (as we did in earlier modules for teaching) makes the reported accuracy optimistic.',
  extras(m, el) {
    const c = card('Scorecard');
    const body = h('div');
    const copy = h('button', { class: 'btn', type: 'button' }, 'Copy scorecard');
    c.body.append(body, buttonRow([]), copy);
    el.append(c.el);
    const showAll = m.app.query.get('solutions') === '1';
    function refresh() {
      const r = record();
      let total = 0;
      const rows = HOLES.map((H, k) => {
        const rec = r[H.id] || {}, last = rec.subs && rec.subs[rec.subs.length - 1];
        const ok = last && last.acc >= H.target, pts = ok ? last.pts : 0;
        total += pts;
        const ref = showAll ? `<td>${H.ref.map((f) => tex(TRANSFORMS[f.id].tex)).join(' + ')}</td>` : '';
        return `<tr><td>${k + 1}. ${H.name}</td><td>${pct(H.target)}</td><td>${last ? pct(last.acc) : '–'}</td><td>${last ? last.d : '–'}</td><td><b>${pts}</b>${rec.solution ? ' (solution viewed)' : ''}</td>${ref}</tr>`;
      }).join('');
      body.innerHTML = `<table class="scorecard"><thead><tr><th>Hole</th><th>Target</th><th>Test acc.</th><th>d</th><th>Points</th>${showAll ? '<th>Reference Φ</th>' : ''}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="4">Total</th><th>${total}</th></tr></tfoot></table>` +
        `<p class="hint">Points count only when test accuracy reaches the target. Scores are saved in this browser. ${showAll ? '' : 'Instructors: add <code>?solutions=1</code> to the URL (#challenge?solutions=1) to list every reference solution.'}</p>`;
      renderMath(body);
      copy.onclick = () => {
        const lines = ['Feature Golf scorecard', ...HOLES.map((H, k) => {
          const rec = r[H.id] || {}, last = rec.subs && rec.subs[rec.subs.length - 1];
          return `${k + 1}. ${H.name}\t${last ? pct(last.acc) : '-'}\td=${last ? last.d : '-'}\t${last && last.acc >= H.target ? last.pts : 0} pts\t${last ? featText(last.feats) : ''}${rec.solution ? '\t(solution viewed)' : ''}`;
        }), `Total\t${total}`];
        copyText(lines.join('\n'));
        copy.textContent = '✓ Copied';
        setTimeout(() => { copy.textContent = 'Copy scorecard'; }, 1400);
      };
    }
    refresh();
    return { refresh };
  },
});
