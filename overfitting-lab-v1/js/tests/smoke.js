// Drives the Overfitting Lab in an iframe: the first-visit help, the landing
// page, every station (new-point results hidden until a prediction is locked
// in, every control, the plot and chart in view while the side column
// scrolls, reveal applying its preset, drag and drop in "Any two features"),
// the wrap-up and exit ticket, My answers and Copy table, keys, a phone-sized
// layout, the theme (contrast as warnings), and Reset lab (declined, then
// confirmed: the page reloads as a first visit). Restores saved data afterwards.
// ?shot=<landing|a1|a2|a3|b1|wrap> ends on that page for a screenshot:
// &lock=<choice index> locks in a prediction, &reveal=1 reveals it,
// &set=<json> patches the station's settings, &mode=dark|light, &w=<px>
// (page width), &scroll=<px>, &answers=1 opens My answers.
const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const errors = [], warnings = [], log = [];
let current = 'boot', phase = 'main', confirmText = '';

const PREFIX = 'ftlab:overfit:';
const backup = Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) || k === 'ftlab:theme').map((k) => [k, localStorage.getItem(k)]));
const restore = () => {
  for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k === 'ftlab:theme') localStorage.removeItem(k);
  for (const [k, v] of Object.entries(backup)) localStorage.setItem(k, v);
};
for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); // start as a first visit

const themeParam = params.get('theme');
if (params.get('w')) frame.style.width = `${+params.get('w')}px`;
frame.src = `index.html${themeParam ? `?theme=${encodeURIComponent(themeParam)}` : ''}`;

function contrastChecks(win, mode, check) {
  const cs = win.getComputedStyle(win.document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
  const rgb = (c) => (c.startsWith('#') ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/[\d.]+/g).slice(0, 3).map(Number));
  const lum = (c) => { const [r, g, b] = rgb(c).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(v(a)), lum(v(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const rules = [['--ink', '--surface', 7], ['--ink', '--page', 7], ['--ink-2', '--surface', 7], ['--muted', '--surface', 4.5], ['--muted', '--page', 4.5], ['--good', '--surface', 4.5], ['--on-primary', '--primary', 4.5]];
  for (const bg of ['--region0', '--region1', '--heat-mid']) rules.push(['--class0', bg, 3], ['--ink', bg, 3]);
  for (const [a, b, min] of rules) { const q = ratio(a, b); check(q >= min, `${mode}: ${a} on ${b} is ${q.toFixed(2)}:1, needs ${min}:1`); }
  return rules.length;
}

frame.addEventListener('load', async () => {
  const w = frame.contentWindow, doc = w.document;
  w.addEventListener('error', (e) => errors.push(`${current}: ${e.message}`));
  w.addEventListener('unhandledrejection', (e) => errors.push(`${current}: ${e.reason}`));
  const origErr = w.console.error.bind(w.console);
  w.console.error = (...a) => { errors.push(`${current}: ${a.map(String).join(' ')}`); origErr(...a); };
  // Headless Chrome under --virtual-time-budget never fires requestAnimationFrame.
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(w.performance.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  await sleep(300);
  const app = w.overfit;
  const check = (cond, msg) => { if (!cond) errors.push(`${current}: ${msg}`); };
  const helpShown = !!doc.querySelector('.modal');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(50);
  const go = async (hash) => { w.location.hash = hash; await sleep(80); };
  const ready = async (ms = 15000) => { for (let t = 0; t < ms; t += 50) { if (doc.querySelector('main[data-ready]')) return true; await sleep(50); } return false; };
  const btn = (re, root = doc) => [...root.querySelectorAll('button, a')].find((b) => re.test(b.textContent));
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= w.innerHeight + 0.5; };
  const series = () => (app.cur && app.cur.chart.data ? app.cur.chart.data.series.map((s) => s.kind).join(',') : '');
  const readouts = () => doc.querySelector('.readouts').textContent;
  const lockIn = async (k) => {
    const choices = doc.querySelectorAll('.q .choice');
    choices[k].click(); await sleep(20);
    btn(/^Lock in$/).click(); await sleep(150);
  };

  async function finish() {
    restore();
    out.textContent = `${errors.length ? 'FAIL' : 'PASS'} overfit smoke (${errors.length} errors, ${warnings.length} contrast warnings)\n\n${log.join('\n')}\n\n${errors.join('\n')}` +
      (warnings.length ? `\n\ncontrast warnings (theme colors):\n${warnings.join('\n')}` : '');
    document.title = errors.length ? 'FAIL' : 'PASS';
  }

  // ---- screenshot mode ----
  const shot = params.get('shot');
  if (shot) {
    current = 'shot';
    if (params.get('mode') && params.get('mode') !== doc.documentElement.dataset.theme) btn(/Theme/).click();
    await go(shot === 'landing' ? '' : shot);
    await sleep(300);
    if (params.has('lock')) await lockIn(+params.get('lock'));
    if (params.get('reveal') === '1') { btn(/^Reveal$/).click(); await sleep(200); }
    if (params.has('set')) { app.set(shot, JSON.parse(params.get('set'))); await sleep(200); }
    await ready();
    if (params.has('scroll')) { w.scrollTo(0, +params.get('scroll')); await sleep(100); }
    if (params.get('answers') === '1') { app.showAnswers(); await sleep(100); }
    await sleep(200);
    w.requestAnimationFrame = () => 0;
    restore();
    out.hidden = true;
    document.body.classList.add('shot');
    document.title = errors.length ? 'FAIL' : 'PASS';
    return;
  }

  // ---- after Reset lab confirmed and the page reloaded ----
  if (phase === 'afterReset') {
    current = 'after reset';
    const kept = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) && k !== `${PREFIX}helpSeen`);
    check(/cannot be undone/.test(confirmText), 'no warning in the reset prompt');
    check(helpShown, 'help not shown after reset (first visit)');
    check(!kept.length, `still saved after reset: ${kept.join(', ')}`);
    check(!Object.keys(app.answers).length && /0\/4/.test(btn(/My answers/).textContent), 'answers survived the reset');
    log.push(`reset lab: prompt shown, ${kept.length} keys left`);
    await finish();
    return;
  }

  // ---- landing ----
  current = 'landing';
  check(helpShown, 'help not shown on the first visit');
  check(doc.querySelectorAll('.tile').length === 4, `${doc.querySelectorAll('.tile').length} station tiles`);
  await sleep(600);
  check(app.live.length === 4 && app.live.every((p) => p.data), 'a station thumbnail is empty');
  const foot = doc.querySelector('footer.site-foot');
  check(foot && foot.querySelector('a[href="https://kylebradbury.com/"]') && /Designed by Kyle Bradbury, built with Claude/.test(foot.textContent), 'no attribution footer');

  // ---- every station ----
  const PICK = { a1: 2, a2: 0, a3: 2, b1: 2 }; // a2 deliberately wrong
  for (const st of app.stations) {
    current = st.id;
    await go(st.id);
    check(await ready(), 'chart never finished');
    check(/🔒/.test(readouts()) && series() === 'train', `new-point results visible before locking in (${series()})`);
    check(doc.querySelector('.ex-side .katex') && doc.querySelectorAll('.defs li').length >= 4, 'math or definitions missing');
    check(/Chosen by hand/.test(doc.querySelector('.chosen').textContent), 'no "chosen by hand" note');
    // plot, chart and the settings stay in view while the side column scrolls
    const plotBox = doc.querySelector('.stage .plot-box'), chartBox = doc.querySelector('.curve-box');
    for (const y of [0, 400, doc.documentElement.scrollHeight]) {
      w.scrollTo(0, y); await sleep(40);
      check(inView(plotBox) && inView(chartBox) && [...doc.querySelectorAll('.knob input, .knob .seg button')].every(inView), `at scroll ${y}, the plot, chart or settings left the screen`);
    }
    w.scrollTo(0, 0);
    // lock in a prediction: new-point results appear
    await lockIn(PICK[st.id]);
    check(await ready(), 'chart did not finish after locking in');
    check(!/🔒/.test(readouts()) && series() === 'train,test,best', `results still hidden after locking in (${series()})`);
    check(app.answers[st.id] && app.answers[st.id].locked, 'prediction not saved');
    log.push(`${st.id}: ${readouts().replace(/\s+/g, ' ').slice(0, 170)}`);
    await sleep(50);
  }

  // station-specific controls
  current = 'a1 controls';
  await go('a1'); await ready();
  for (const b of doc.querySelectorAll('.knob .seg button')) { b.click(); await sleep(60); }
  check(app.state.a1.rep === 'rbf', `representation buttons gave ${app.state.a1.rep}`);
  const flipIn = doc.querySelector('.knob input[type=range]');
  flipIn.value = '0'; flipIn.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(80);
  check(app.state.a1.flip === 0 && /100\.0 %/.test(readouts()), `flip 0 should fit everything: ${readouts().slice(0, 60)}`);
  doc.querySelectorAll('.stage-opts input').forEach((el) => el.click()); await sleep(80);
  check(app.state.a1.flips && app.state.a1.mistakes && app.state.a1.test, 'plot toggles did not switch on');
  btn(/^Reveal$/).click(); await sleep(200);
  check(app.state.a1.rep === 'poly10' && app.state.a1.flip === 0.15 && doc.querySelector('.q .explain:not([hidden])'), 'reveal did not apply its preset');

  current = 'a2 controls';
  await go('a2'); await ready();
  const kIn = doc.querySelector('.knob input[type=range]');
  kIn.value = '3'; kIn.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(80);
  check(app.state.a2.k === 3 && /9 · 100/.test(readouts()), 'degree slider did not refit');
  btn(/^400$/).click(); await sleep(60);
  check(await ready(30000), 'N = 400 curves never finished');
  check(app.state.a2.N === 400 && /9 · 400/.test(readouts()), 'N buttons did not refit');
  btn(/^Reveal$/).click(); await sleep(150);
  check(app.state.a2.k === 2 && app.state.a2.N === 100, 'reveal did not apply its preset');

  current = 'a3 controls';
  await go('a3'); await ready();
  check(app.cur.plot.data.ghosts.length === 9, `${app.cur.plot.data.ghosts.length} boundaries drawn (8 fits + the rule)`);
  btn(/Designed/).click(); await sleep(80);
  const disD = parseFloat(readouts().match(/Disagreement between fits([\d.]+)/)[1]);
  btn(/Polynomial/).click(); await sleep(80);
  const disP = parseFloat(readouts().match(/Disagreement between fits([\d.]+)/)[1]);
  check(disP >= 3 * disD, `disagreement ${disP} vs ${disD}`);
  btn(/^Reveal$/).click(); await sleep(150);
  check(app.state.a3.vote && app.cur.plot.data.segs && app.cur.plot.data.segs.length, 'vote boundary not drawn');

  current = 'b1 controls';
  await go('b1'); await ready();
  const kb = doc.querySelector('.knob input[type=range]');
  kb.value = '7'; kb.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(120);
  check(app.state.b1.k === 100 && /102 · 50/.test(readouts()), `k slider: ${app.state.b1.k}`);
  check(app.cur.plot.data && !app.cur.plot.data.grid, 'a boundary is drawn in the original space');
  btn(/Any two features/).click(); await sleep(120);
  const chips = [...doc.querySelectorAll('.zchips .zchip')];
  check(chips.length === 9, `${chips.length} feature chips`);
  const at = (el, fx, fy) => { const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; };
  const pe = (type, [x, y]) => new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, button: 0, pointerType: 'mouse', clientX: x, clientY: y });
  const box = doc.querySelector('.stage .plot-box');
  chips[2].dispatchEvent(pe('pointerdown', at(chips[2], 0.5, 0.5)));
  chips[2].dispatchEvent(pe('pointermove', at(box, 0.85, 0.85)));
  chips[2].dispatchEvent(pe('pointerup', at(box, 0.85, 0.85)));
  await sleep(120);
  check(app.state.b1.axes[0] === 'score', `drag the score to the horizontal axis gave ${app.state.b1.axes}`);
  const sc = app.cur.plot.data.points.find((p) => p.name === 'training'), sTr = app.cur.r.sTr;
  check(sc && [...sTr].every((v, i) => (sc.X[2 * i] > 0) === (v > 0)), 'score axis does not match the scores');
  const chips2 = [...doc.querySelectorAll('.zchips .zchip')];
  chips2[3].click(); await sleep(60);
  const menu = doc.querySelector('.zmenu');
  check(!!menu, 'chip menu did not open');
  if (menu) btn(/vertical/, menu).click();
  await sleep(120);
  check(/^n\d+$/.test(app.state.b1.axes[1]), `menu gave axes ${app.state.b1.axes}`);
  check(doc.querySelectorAll('.wbar-row').length === 8, 'weight bars missing');
  check(doc.querySelectorAll('.intuitions li').length === 3, 'intuitions missing');
  btn(/^Reveal$/).click(); await sleep(150);
  check(app.state.b1.k === 100, 'reveal did not apply its preset');

  // ---- wrap-up, exit ticket, My answers ----
  current = 'wrap';
  await go('wrap');
  const tas = [...doc.querySelectorAll('.exit textarea')];
  check(tas.length === 3, `${tas.length} exit questions`);
  tas.forEach((t, i) => { t.value = `answer ${i + 1}`; t.dispatchEvent(new w.Event('input', { bubbles: true })); });
  check(!/🔒/.test(doc.querySelector('.saw').textContent), 'wrap-up still hides numbers after every prediction was locked in');
  check([...doc.querySelectorAll('.dot')].every((d) => d.classList.contains('met')), 'stepper ✓ marks missing');
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { write: async () => {}, writeText: async () => {} } });
  btn(/My answers/).click(); await sleep(100);
  const rows = doc.querySelectorAll('.modal table.answers tbody tr');
  check(rows.length === 7 && !doc.querySelector('.modal tr.missing'), `answers table has ${rows.length} rows`);
  check(/✗/.test(rows[1].textContent) && /✓/.test(rows[0].textContent), 'right/wrong marks wrong');
  btn(/Copy table/, doc.querySelector('.modal')).click(); await sleep(100);
  check(/Copied/.test(btn(/Copied|Copy table/, doc.querySelector('.modal')).textContent), 'copy table did not confirm');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(60);
  check(!doc.querySelector('.modal') && w.location.hash === '#wrap', 'Esc should close the answers first');
  log.push(`answers: ${rows.length} rows, header ${btn(/My answers/).textContent.trim()}`);

  // ---- keys ----
  current = 'keys';
  await go('a2');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(80);
  check(w.location.hash === '#a3', `→ went to ${w.location.hash}`);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await sleep(80);
  check(w.location.hash === '#a2', `← went to ${w.location.hash}`);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(120);
  check(!!doc.querySelector('.landing'), 'Esc did not return to the start');

  // ---- phone ----
  current = 'phone';
  frame.style.width = '390px'; frame.style.height = '844px';
  await sleep(150);
  for (const id of ['a1', 'b1']) {
    await go(id); await ready();
    check(doc.documentElement.scrollWidth <= w.innerWidth + 1, `${id}: page is ${doc.documentElement.scrollWidth}px wide`);
    const slider = doc.querySelector('.knob input[type=range]');
    slider.scrollIntoView({ block: 'end' }); await sleep(60);
    const pb = doc.querySelector('.stage .plot-box').getBoundingClientRect();
    check(pb.top >= 0 && pb.bottom <= w.innerHeight && inView(slider), `${id}: with the slider in view the plot is at ${Math.round(pb.top)}–${Math.round(pb.bottom)}`);
  }
  log.push(`phone: plot ${Math.round(doc.querySelector('.stage .plot-box').getBoundingClientRect().height)}px`);
  frame.style.width = ''; frame.style.height = '';
  await sleep(150);

  // ---- theme and contrast ----
  current = 'theme';
  await go('a1'); await ready();
  const warn = (cond, msg) => { if (!cond) warnings.push(msg); };
  const mode = () => doc.documentElement.dataset.theme;
  let n = contrastChecks(w, mode(), warn);
  btn(/Theme/).click(); await sleep(150);
  n += contrastChecks(w, mode(), warn);
  btn(/Theme/).click(); await sleep(150);
  log.push(`contrast: ${n} checks on the ${themeParam || 'default'} theme, light and dark; ${warnings.length} below target`);

  // ---- Reset lab: declining changes nothing; confirming reloads as a first visit ----
  current = 'reset lab';
  w.confirm = () => false;
  btn(/Reset lab/).click(); await sleep(100);
  check(Object.keys(app.answers).length === 4 && localStorage.getItem(`${PREFIX}answers`), 'declining the prompt still reset the lab');
  phase = 'afterReset';
  w.confirm = (msg) => { confirmText = msg; return true; };
  btn(/Reset lab/).click();
});
