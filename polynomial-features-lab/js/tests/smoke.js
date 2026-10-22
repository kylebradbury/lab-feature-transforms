// Drives the Polynomial Features Lab in an iframe: every challenge's hand
// solution through the real controls, submit, both feature stages (which must
// hide a revealed best fit), term toggles, axis drag-and-drop and the chip
// menu, the feature-space boundary, reveal, copy-best-fit, reset and undo, next
// challenge, the answers table, and Reset lab (declined, then confirmed: the
// page reloads and must look like a first visit). Records any error and
// restores the lab's saved progress afterwards.
// ?shot=<challenge id> ends in a showcase state on that challenge (screenshots);
// add &poly=0 to stay on raw features (or &stage=cubic for degree 3, with
// &w=w0,w1,... for its weights), &reveal=0 to keep the best fit hidden, and
// &answers=1 to finish with the answers table open.
const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const errors = [], log = [];
let current = 'boot';
let phase = 'main', confirmText = ''; // 'afterReset' once Reset lab has reloaded the page

const KEYS = ['ftlab:poly:state', 'ftlab:poly:progress', 'ftlab:poly:last', 'ftlab:poly:view', 'ftlab:poly:helpSeen', 'ftlab:poly:answers', 'ftlab:poly:name', 'ftlab:theme'];
const backup = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
const restore = () => KEYS.forEach((k) => (backup[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, backup[k])));

// ?theme=<name> runs everything (including the contrast checks) on another color theme.
const themeParam = params.get('theme');
frame.src = `index.html${themeParam ? `?theme=${encodeURIComponent(themeParam)}` : ''}#blobs`;

// WCAG contrast checks on the active theme's colors (css/themes/): text, then
// points and lines against both shaded regions and the neutral shade. The
// class-1 outline is a style choice (white in the brand theme) and not checked.
function contrastChecks(win, mode, check) {
  const cs = win.getComputedStyle(win.document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
  const rgb = (c) => (c.startsWith('#') ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/[\d.]+/g).slice(0, 3).map(Number));
  const lum = (c) => {
    const [r, g, b] = rgb(c).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(v(a)), lum(v(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const lstar = (c) => { const Y = lum(v(c)); return 116 * (Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116) - 16; };
  const rules = [['--ink', '--surface', 7], ['--ink', '--page', 7], ['--ink-2', '--surface', 7], ['--muted', '--surface', 4.5], ['--muted', '--page', 4.5],
    ['--good', '--surface', 4.5], ['--on-primary', '--primary', 4.5], ['--fit', '--surface', 4.5]];
  for (const bg of ['--region0', '--region1', '--heat-mid']) rules.push(['--class0', bg, 3], ['--ink', bg, 3], ['--fit', bg, 3]);
  for (const [a, b, min] of rules) {
    const q = ratio(a, b);
    check(q >= min, `${mode}: ${a} on ${b} is ${q.toFixed(2)}:1, needs ${min}:1`);
  }
  const dl = Math.abs(lstar('--region0') - lstar('--region1'));
  check(dl >= 10, `${mode}: the two region shades differ by ${dl.toFixed(1)} lightness units, need 10`);
  return rules.length + 1;
}

frame.addEventListener('load', async () => {
  const w = frame.contentWindow, doc = w.document;
  w.addEventListener('error', (e) => errors.push(`${current}: ${e.message}`));
  w.addEventListener('unhandledrejection', (e) => errors.push(`${current}: ${e.reason}`));
  const origErr = w.console.error.bind(w.console);
  w.console.error = (...a) => { errors.push(`${current}: ${a.map(String).join(' ')}`); origErr(...a); };
  await sleep(500);
  const helpShown = !!doc.querySelector('.modal');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); // first-visit help
  const app = w.polylab;
  // Headless Chrome under --virtual-time-budget never fires requestAnimationFrame
  // (timers still run), so drive frames with timers and restart the pending one.
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(w.performance.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  app.scene.raf = 0;
  app.scene.invalidate('data');
  await sleep(200);
  const check = (cond, msg) => { if (!cond) errors.push(`${current}: ${msg}`); };
  const btn = (re, root = doc) => [...root.querySelectorAll('button')].find((b) => re.test(b.textContent));
  const acc = (sel) => parseFloat(doc.querySelector(sel).textContent);
  const at = (el, fx, fy) => { const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; };
  const pe = (type, [x, y]) => new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, button: 0, pointerType: 'mouse', clientX: x, clientY: y });
  async function drag(chip, to, fx, fy) {
    chip.dispatchEvent(pe('pointerdown', at(chip, 0.5, 0.5)));
    chip.dispatchEvent(pe('pointermove', at(to, fx, fy)));
    chip.dispatchEvent(pe('pointerup', at(to, fx, fy)));
    chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
  }
  const chip = (k) => doc.querySelectorAll('.zchips .zchip')[k]; // chips follow the term order x₁, x₂, x₁², x₁x₂, x₂², …
  const stageBtn = (id) => doc.querySelector(`.seg button[data-stage="${id}"]`);
  const STAGE_FOR = [null, 'raw', 'poly', 'cubic']; // by challenge.need
  const TERMS_UPTO = [0, 2, 5, 9]; // number of terms up to each degree

  // Restore the saved progress, optionally set up a screenshot, report.
  async function finish() {
    restore();
    const shot = params.get('shot');
    if (shot) {
      current = 'shot';
      const i = app.challenges.findIndex((c) => c.id === shot);
      app.switchTo(Math.max(0, i));
      await sleep(100);
      btn(/^↺ Reset$/).click();
      if (params.get('poly') !== '0') {
        stageBtn(params.get('stage') || 'poly').click();
        (params.get('w') ? params.get('w').split(',').map(Number) : [1.4, 0.2, 0, -0.8, 0, -1]).forEach((v, k) => app.setWeight(k, v));
        if (!params.get('w')) { app.assignAxis(2, 0); app.assignAxis(4, 1); }
      }
      if (params.get('reveal') !== '0') btn(/Reveal best fit/).click();
      await sleep(400);
      if (params.get('mode') && params.get('mode') !== doc.documentElement.dataset.theme) { btn(/Theme/).click(); await sleep(200); }
      if (params.get('solid') === '1') { doc.querySelectorAll('.xcard .opts input')[1].click(); await sleep(200); }
      app.fitZ(); await sleep(60);
      log.push(`shot ${shot}: feature-space plot ${Math.round(doc.querySelector('.zbox').getBoundingClientRect().height)}px, column ${doc.querySelector('.col.mid').clientHeight}px`);
      if (params.get('answers') === '1') app.showAnswers();
      // Headless screenshots re-lay out the page briefly while capturing; stop
      // further frames so that transient size cannot resize the plots.
      w.requestAnimationFrame = () => 0;
      restore();
      out.hidden = true;
      document.body.classList.add('shot');
      const sim = params.get('sim'); // how the page looks with a color-vision deficiency, or in grayscale
      if (sim) frame.style.filter = sim === 'gray' ? 'grayscale(1)' : `url(#${sim})`;
    }
    out.textContent = `${errors.length ? 'FAIL' : 'PASS'} poly smoke (${errors.length} errors)\n\n${log.join('\n')}\n\n${errors.join('\n')}`;
    document.title = errors.length ? 'FAIL' : 'PASS';
  }

  // After Reset lab confirmed and the page reloaded: a first visit again.
  if (phase === 'afterReset') {
    current = 'after reset';
    const kept = Object.keys(localStorage).filter((k) => k.startsWith('ftlab:poly:') && k !== 'ftlab:poly:helpSeen');
    check(/cannot be undone/.test(confirmText), 'no warning in the reset prompt');
    check(helpShown, 'help not shown after reset (first visit)');
    check(!kept.length, `still saved after reset: ${kept.join(', ')}`);
    check(w.location.hash === '#' + app.challenges[0].id, `reopened at ${w.location.hash}`);
    check(!Object.keys(app.answers).length && /0\//.test(btn(/My answers/).textContent), 'answers survived the reset');
    check(app.state.stage === 'raw' && !app.state.touched && JSON.stringify(app.state.w) === JSON.stringify(app.challenges[0].start), 'challenge state survived the reset');
    check(!doc.querySelector('.dot.met'), 'goals reached survived the reset');
    log.push(`reset lab: prompt shown, ${kept.length} keys left, back at ${w.location.hash}`);
    await finish();
    return;
  }

  for (let i = 0; i < app.challenges.length; i++) {
    const c = app.challenges[i];
    current = c.id;
    app.switchTo(i);
    await sleep(150);
    btn(/^↺ Reset$/).click();
    await sleep(150);
    const startAcc = acc('.accbox .big');
    check(stageBtn('cubic').hidden === (c.maxDeg < 3), `degree-3 option ${c.maxDeg < 3 ? 'shown' : 'missing'}`);
    check(doc.querySelector('.hard-badge').hidden === !c.hard && doc.querySelectorAll('.dot')[i].classList.contains('hard') === !!c.hard, 'extra-challenging marker on the wrong challenges');
    stageBtn(STAGE_FOR[c.need]).click();
    await sleep(80);
    if (c.need === 3) check(doc.querySelector('.wrow[data-k="6"] input[type=range]').max === '1', 'cubic slider range is not ±1');
    c.hand.forEach((v, k) => {
      const input = doc.querySelector(`.wrow[data-k="${k}"] input[type=range]`);
      if (input.closest('.wrow').hidden) return;
      input.value = String(v);
      input.dispatchEvent(new w.Event('input', { bubbles: true }));
    });
    await sleep(250);
    const handAcc = acc('.accbox .big');
    check(handAcc >= 100 * c.goal - 0.05, `hand solution ${handAcc}% below goal ${100 * c.goal}%`);
    check(doc.querySelector('.accbox .goal').classList.contains('met'), 'goal not shown as met');
    check(doc.querySelectorAll('.eq-main .term[data-k]').length === 1 + TERMS_UPTO[c.need], 'equation term count');
    check(c.need > 1 ? app.zDrawn > 0 : app.zDrawn === 'line', `feature-space boundary not drawn (${app.zDrawn})`);
    // the feature-space plot stays readable and its note stays inside the card
    app.fitZ(); await sleep(60);
    const zr = doc.querySelector('.zbox').getBoundingClientRect(), cr = doc.querySelector('.zcard').getBoundingClientRect();
    check(zr.height >= 210, `feature-space plot only ${Math.round(zr.height)}px tall`);
    const zg = app.zplot.data && app.zplot.data.grid, shaded = zg ? Array.from(zg.V).filter(Number.isFinite).length / zg.V.length : 0;
    check(shaded > 0.1, `feature-space plot shaded on only ${(100 * shaded).toFixed(0)}% of its area`);
    check(doc.querySelector('.znote').getBoundingClientRect().bottom <= cr.bottom + 0.5, 'feature-space note overflows its card');

    // submit the hand solution
    btn(/Submit answer/).click();
    await sleep(80);
    const ans = app.answers[c.id];
    check(ans && Math.abs(100 * ans.acc - handAcc) < 0.06 && !ans.afterReveal, `submitted answer ${ans && ans.acc}`);
    check(/submitted/.test(doc.querySelector('.status').textContent), 'no submit confirmation');

    // feature space: drag x₂ onto the horizontal axis (swaps), then use the chip menu
    const zb = doc.querySelector('.zbox');
    await drag(chip(1), zb, 0.85, 0.85);
    check(app.state.axes[0] === 1 && app.state.axes[1] === 0, `drag to horizontal gave axes ${app.state.axes}`);
    if (c.need > 1) {
      await drag(chip(4), zb, 0.1, 0.1);
      check(app.state.axes[1] === 4, `drag x₂² to vertical gave axes ${app.state.axes}`);
      chip(2).click();
      await sleep(60);
      const menu = doc.querySelector('.zmenu');
      check(!!menu, 'chip menu did not open');
      if (menu) btn(/horizontal/, menu).click();
      await sleep(120);
      check(app.state.axes[0] === 2, `menu gave axes ${app.state.axes}`);
    }
    check(doc.querySelector('.znote').textContent.length > 20, 'feature-space note empty');

    // reveal, compare, copy best fit
    btn(/Reveal best fit/).click();
    await sleep(300);
    check(!doc.querySelector('.eqrow.fit').hidden, 'best-fit equation hidden after reveal');
    check(doc.querySelectorAll('table.cmp tr').length === 4 && /Features used/.test(doc.querySelector('table.cmp').textContent), 'compare table missing');
    check(/\d feature/.test(doc.querySelector('.eq-fit').textContent), 'feature count missing from best-fit equation');
    const bestAcc = acc('.accbox.fit');
    check(bestAcc > 0, 'best-fit accuracy missing');
    btn(/Copy best fit/).click();
    await sleep(250);
    const copied = acc('.accbox .big');
    check(Math.abs(copied - bestAcc) <= 2.01, `copied best fit ${copied}% vs best ${bestAcc}%`);
    // changing the features hides the best fit (no spoilers for the new features)
    stageBtn(c.need > 1 ? 'raw' : 'poly').click(); await sleep(120);
    check(!app.state.revealed && doc.querySelector('.eqrow.fit').hidden && doc.querySelector('.compare').hidden, 'best fit still shown after changing features');
    stageBtn(STAGE_FOR[c.need]).click(); await sleep(120);

    // untick and re-tick a term, then reset + undo
    const box = doc.querySelector('.wrow[data-k="1"] input[type=checkbox]');
    box.click(); await sleep(80);
    check(doc.querySelectorAll('.eq-main .term[data-k]').length === TERMS_UPTO[c.need], 'unticked term still in equation');
    box.click(); await sleep(80);
    const before = JSON.stringify(app.state.w);
    btn(/^↺ Reset$/).click(); await sleep(150);
    check(Math.abs(acc('.accbox .big') - startAcc) < 0.05, `reset accuracy ${acc('.accbox .big')} vs start ${startAcc}`);
    check(app.state.stage === 'raw' && !app.state.revealed, 'reset did not restore the start');
    btn(/Undo/).click(); await sleep(150);
    check(JSON.stringify(app.state.w) === before, 'undo did not restore weights');
    log.push(`${c.id}: start ${startAcc}% → hand ${handAcc}% (goal ${100 * c.goal}%), best fit ${bestAcc}%, copied ${copied}%`);
  }

  // reopening a challenge: raw features, best fit hidden, polynomial weights kept
  current = 'reopen';
  app.switchTo(2); await sleep(100);
  stageBtn('poly').click(); app.setWeight(3, -0.7); btn(/Reveal best fit/).click(); await sleep(150);
  app.switchTo(3); await sleep(100); app.switchTo(2); await sleep(150);
  check(app.state.stage === 'raw' && !app.state.revealed && doc.querySelector('.eqrow.fit').hidden, `reopened on ${app.state.stage}, revealed ${app.state.revealed}`);
  stageBtn('poly').click(); await sleep(80);
  check(app.state.w[3] === -0.7 && !app.state.revealed, 'polynomial weights not kept');

  // next challenge button
  current = 'next';
  app.switchTo(0); await sleep(100);
  btn(/Next challenge/).click(); await sleep(150);
  check(w.location.hash === '#overlap', `next challenge went to ${w.location.hash}`);

  // answers table: every challenge submitted, name, copy
  current = 'answers';
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { write: async () => {}, writeText: async () => {} } });
  btn(/My answers/).click(); await sleep(100);
  const rows = doc.querySelectorAll('.modal table.answers tbody tr');
  check(rows.length === app.challenges.length && !doc.querySelector('.modal tr.missing'), `answers table has ${rows.length} rows`);
  check(/= 0/.test(rows[0] && rows[0].textContent), 'answers table has no equation');
  const nameIn = doc.querySelector('.modal input[type=text]');
  nameIn.value = 'Test Student'; nameIn.dispatchEvent(new w.Event('input', { bubbles: true }));
  btn(/Copy table/, doc.querySelector('.modal')).click(); await sleep(100);
  check(/Copied/.test(btn(/Copied|Copy table/, doc.querySelector('.modal')).textContent), 'copy table did not confirm');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(80);
  log.push(`answers: ${rows.length} rows, header ${btn(/My answers/).textContent.trim()}`);

  // theme toggle + view toggles redraw without errors
  current = 'view';
  btn(/Theme/).click(); await sleep(120); btn(/Theme/).click(); await sleep(120);
  doc.querySelectorAll('.xcard .opts input').forEach((el) => { el.click(); el.click(); });
  await sleep(400); // let the lab's debounced save land before restoring

  // contrast of the theme's colors, in light and dark mode
  current = 'contrast';
  const mode = () => doc.documentElement.dataset.theme;
  let nChecks = contrastChecks(w, mode(), check);
  btn(/Theme/).click(); await sleep(150);
  nChecks += contrastChecks(w, mode(), check);
  btn(/Theme/).click(); await sleep(150);
  log.push(`contrast: ${nChecks} checks on the ${themeParam || 'default'} theme, light and dark`);

  // Reset lab: declining changes nothing; confirming wipes the lab and reloads
  // the page, which runs this handler again (phase 'afterReset' above).
  current = 'reset lab';
  w.confirm = () => false;
  btn(/Reset lab/).click(); await sleep(100);
  check(Object.keys(app.answers).length === app.challenges.length && localStorage.getItem('ftlab:poly:answers'), 'declining the prompt still reset the lab');
  phase = 'afterReset';
  w.confirm = (msg) => { confirmText = msg; return true; };
  btn(/Reset lab/).click();
});
