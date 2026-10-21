// Drives the Polynomial Features Lab in an iframe: every challenge's hand
// solution through the real controls, submit, both feature stages (which must
// hide a revealed best fit), term toggles, axis drag-and-drop and the chip
// menu, the feature-space boundary, reveal, copy-best-fit, reset and undo, next
// challenge, the answers table, and Reset lab (declined, then confirmed: the
// page reloads and must look like a first visit). Records any error and
// restores the lab's saved progress afterwards.
// ?shot=<challenge id> ends in a showcase state on that challenge (screenshots);
// add &poly=0 to stay on raw features, &reveal=0 to keep the best fit hidden,
// and &answers=1 to finish with the answers table open.
const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const errors = [], log = [];
let current = 'boot';
let phase = 'main', confirmText = ''; // 'afterReset' once Reset lab has reloaded the page

const KEYS = ['ftlab:poly:state', 'ftlab:poly:progress', 'ftlab:poly:last', 'ftlab:poly:view', 'ftlab:poly:helpSeen', 'ftlab:poly:answers', 'ftlab:poly:name'];
const backup = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
const restore = () => KEYS.forEach((k) => (backup[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, backup[k])));

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
  const chip = (k) => doc.querySelectorAll('.zchips .zchip')[k]; // chips follow the term order x₁, x₂, x₁², x₁x₂, x₂²

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
        btn(/Polynomial/).click();
        [1.4, 0.2, 0, -0.8, 0, -1].forEach((v, k) => app.setWeight(k, v));
        app.assignAxis(2, 0); app.assignAxis(4, 1);
      }
      if (params.get('reveal') !== '0') btn(/Reveal best fit/).click();
      await sleep(400);
      if (params.get('answers') === '1') app.showAnswers();
      restore();
      out.hidden = true;
      document.body.classList.add('shot');
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
    if (c.poly) btn(/Polynomial/).click();
    await sleep(80);
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
    check(doc.querySelectorAll('.eq-main .term[data-k]').length === (c.poly ? 6 : 3), 'equation term count');
    check(c.poly ? app.zDrawn > 0 : app.zDrawn === 'line', `feature-space boundary not drawn (${app.zDrawn})`);

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
    if (c.poly) {
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
    const other = c.poly ? /^Raw/ : /Polynomial/, back = c.poly ? /Polynomial/ : /^Raw/;
    btn(other).click(); await sleep(120);
    check(!app.state.revealed && doc.querySelector('.eqrow.fit').hidden && doc.querySelector('.compare').hidden, 'best fit still shown after changing features');
    btn(back).click(); await sleep(120);

    // untick and re-tick a term, then reset + undo
    const box = doc.querySelector('.wrow[data-k="1"] input[type=checkbox]');
    box.click(); await sleep(80);
    check(doc.querySelectorAll('.eq-main .term[data-k]').length === (c.poly ? 5 : 2), 'unticked term still in equation');
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
  btn(/Polynomial/).click(); app.setWeight(3, -0.7); btn(/Reveal best fit/).click(); await sleep(150);
  app.switchTo(3); await sleep(100); app.switchTo(2); await sleep(150);
  check(app.state.stage === 'raw' && !app.state.revealed && doc.querySelector('.eqrow.fit').hidden, `reopened on ${app.state.stage}, revealed ${app.state.revealed}`);
  btn(/Polynomial/).click(); await sleep(80);
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
