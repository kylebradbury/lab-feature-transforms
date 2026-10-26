// Drives the Overfitting Lab (v2) in an iframe: first-visit help, landing,
// every challenge (explore, reach the goal at the marked noise, the toggles
// unlocking, the full maps, submitting), the resampling station, the report
// (reflections, Copy), persistence across a reload, keys, a phone-sized
// layout, the theme (contrast as warnings) and Reset lab (declined, then
// confirmed). Restores the saved data afterwards.
// ?shot=<landing|challenge id|resample|report> ends on that page for a screenshot:
// &si=<noise index>&j=<setting index> moves the sliders, &met=1 reaches the goal first,
// &show=held,rule,full turns toggles on, &R=<n> draws training sets (resample),
// &mode=dark|light, &w=<px>, &scroll=<px>, &report=1 opens My report.
import { CHALLENGES, SETTINGS, result } from '../engine.js';

const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const errors = [], warnings = [], log = [];
let current = 'boot', phase = 'main', confirmText = '';

const PREFIX = 'ftlab:overfitv2:';
const backup = Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) || k === 'ftlab:theme').map((k) => [k, localStorage.getItem(k)]));
const restore = () => {
  for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k === 'ftlab:theme') localStorage.removeItem(k);
  for (const [k, v] of Object.entries(backup)) localStorage.setItem(k, v);
};
for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); // start as a first visit

const themeParam = params.get('theme');
if (params.get('w')) frame.style.width = `${+params.get('w')}px`;
frame.src = `index.html${themeParam ? `?theme=${encodeURIComponent(themeParam)}` : ''}`;

// The setting with the most held-out points right at the goal noise (it reaches the goal),
// and the one with the most training points right (it must not).
const best = (ch) => { const S = SETTINGS[ch.model]; let j = 0; S.forEach((s, k) => { if (result(ch.model, ch.ds, ch.goalSi, s).heldCorrect > result(ch.model, ch.ds, ch.goalSi, S[j]).heldCorrect) j = k; }); return j; };
const topTrain = (ch) => { const S = SETTINGS[ch.model]; let j = 0; S.forEach((s, k) => { if (result(ch.model, ch.ds, ch.goalSi, s).trainCorrect >= result(ch.model, ch.ds, ch.goalSi, S[j]).trainCorrect) j = k; }); return j; };

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
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(w.performance.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  await sleep(300);
  const app = w.overfit2;
  const check = (cond, msg) => { if (!cond) errors.push(`${current}: ${msg}`); };
  const helpShown = !!doc.querySelector('.modal');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(50);
  const go = async (hash) => { w.location.hash = hash; await sleep(100); };
  const ready = async (ms = 30000) => { for (let t = 0; t < ms; t += 50) { if (doc.querySelector('main[data-ready]')) return true; await sleep(50); } return false; };
  const btn = (re, root = doc) => [...root.querySelectorAll('button, a')].find((b) => re.test(b.textContent));
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= w.innerHeight + 0.5; };
  const sliders = () => [...doc.querySelectorAll('.knob input[type=range]')];
  const slide = async (k, v) => { const s = sliders()[k]; s.value = String(v); s.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(60); };
  const toggles = () => [...doc.querySelectorAll('.stage-opts input[type=checkbox]')];
  const mapVals = (k) => app.live.filter((p) => p.constructor.name === 'ExploreMap')[k].data.values.flat();

  async function finish() {
    restore();
    out.textContent = `${errors.length ? 'FAIL' : 'PASS'} overfit v2 smoke (${errors.length} errors, ${warnings.length} contrast warnings)\n\n${log.join('\n')}\n\n${errors.join('\n')}` +
      (warnings.length ? `\n\ncontrast warnings (theme colors):\n${warnings.join('\n')}` : '');
    document.title = errors.length ? 'FAIL' : 'PASS';
  }

  // ---- screenshot mode ----
  const shot = params.get('shot');
  if (shot) {
    current = 'shot';
    if (params.get('mode') && params.get('mode') !== doc.documentElement.dataset.theme) btn(/Theme/).click();
    const ch = CHALLENGES.find((c) => c.id === shot);
    if (ch && params.get('met') === '1') app.set(ch.id, { goalMet: true });
    if (ch && params.has('show')) { const sh = { held: false, rule: false, full: false }; for (const k of params.get('show').split(',')) sh[k] = true; app.set(ch.id, { show: sh }); }
    await go(shot === 'landing' ? '' : shot);
    if (ch && (params.has('si') || params.has('j'))) app.set(ch.id, { si: params.has('si') ? +params.get('si') : app.state[ch.id].si, j: params.has('j') ? +params.get('j') : app.state[ch.id].j });
    if (shot === 'resample' && params.has('R')) { app.set('resample', { R: +params.get('R'), ...(params.has('model') ? { model: params.get('model') } : {}), ...(params.has('ds') ? { ds: params.get('ds') } : {}) }); }
    await sleep(200);
    await ready();
    if (params.has('scroll')) { w.scrollTo(0, +params.get('scroll')); await sleep(100); }
    if (params.get('report') === '1') { app.showReport(); await sleep(100); }
    await sleep(300);
    w.requestAnimationFrame = () => 0;
    restore();
    out.hidden = true;
    document.body.classList.add('shot');
    document.title = errors.length ? 'FAIL' : 'PASS';
    return;
  }

  // ---- after a reload: everything saved is back ----
  if (phase === 'afterReload') {
    current = 'after reload';
    check(!helpShown, 'help shown again on a return visit');
    for (const ch of CHALLENGES) {
      const s = app.state[ch.id];
      check(s.goalMet && s.sub && s.visited.length > 3, `${ch.id}: saved state lost (${JSON.stringify({ met: s.goalMet, sub: !!s.sub, visited: s.visited.length })})`);
    }
    await go(CHALLENGES[0].id); await ready();
    check(toggles().every((t) => !t.disabled), 'toggles locked again after a reload');
    check(mapVals(1).filter(Number.isFinite).length >= 4, 'visited cells not filled in after a reload');
    check(app.reflect[0] === 'reflection 1', 'reflections lost');
    log.push('reload: goals, submissions, visited cells and reflections restored');
    // Reset lab: declining changes nothing; confirming reloads as a first visit.
    current = 'reset lab';
    w.confirm = () => false;
    btn(/Reset lab/).click(); await sleep(100);
    check(localStorage.getItem(`${PREFIX}state`), 'declining the prompt still reset the lab');
    phase = 'afterReset';
    w.confirm = (msg) => { confirmText = msg; return true; };
    btn(/Reset lab/).click();
    return;
  }
  if (phase === 'afterReset') {
    current = 'after reset';
    const kept = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) && k !== `${PREFIX}helpSeen`);
    check(/cannot be undone/.test(confirmText), 'no warning in the reset prompt');
    check(helpShown, 'help not shown after reset (first visit)');
    check(!kept.length, `still saved after reset: ${kept.join(', ')}`);
    check(CHALLENGES.every((c) => !app.state[c.id].goalMet && !app.state[c.id].sub), 'challenge state survived the reset');
    log.push(`reset lab: prompt shown, ${kept.length} keys left`);
    await finish();
    return;
  }

  // ---- landing ----
  current = 'landing';
  check(helpShown, 'help not shown on the first visit');
  check(doc.querySelectorAll('.tile').length === 7, `${doc.querySelectorAll('.tile').length} tiles`);
  await sleep(500);
  check(app.live.every((p) => p.data), 'a thumbnail is empty');
  const foot = doc.querySelector('footer.site-foot');
  check(foot && foot.querySelector('a[href="https://kylebradbury.com/"]') && /Designed by Kyle Bradbury, built with Claude/.test(foot.textContent), 'no attribution footer');

  // ---- every challenge ----
  for (const ch of CHALLENGES) {
    current = ch.id;
    await go(ch.id);
    check(await ready(), 'never ready');
    const s = app.state[ch.id];
    check(s.si === 0 && s.j === 0, 'does not start at clean data and the simplest setting');
    check(toggles().length === 3 && toggles().every((t) => t.disabled), 'toggles not locked before the goal');
    check(doc.querySelector('.lesson').hidden, 'lesson visible before the goal');
    check(mapVals(0).filter(Number.isFinite).length === 1, 'the map should show only the one cell tried');
    // plot, chart, settings stay in view while the side column scrolls
    for (const y of [0, 500, doc.documentElement.scrollHeight]) {
      w.scrollTo(0, y); await sleep(40);
      check(inView(doc.querySelector('.stage .plot-box')) && inView(doc.querySelector('.curve-box')) && sliders().every(inView), `at scroll ${y}, the plot, chart or sliders left the screen`);
    }
    w.scrollTo(0, 0);
    // explore: the most flexible setting with clean data, then the goal noise
    await slide(1, SETTINGS[ch.model].length - 1);
    await slide(0, ch.goalSi);
    check(/goal/i.test(doc.querySelector('.goal-status').textContent) && !s.goalMet, 'goal status at the goal noise');
    // the setting with the best training accuracy misses the goal
    await slide(1, topTrain(ch));
    check(!s.goalMet && toggles().every((t) => t.disabled), 'the top-training setting met the goal');
    // a setting that reaches it unlocks everything
    await slide(1, best(ch));
    check(s.goalMet && toggles().every((t) => !t.disabled) && !doc.querySelector('.lesson').hidden, 'goal not met (or nothing unlocked) at the best setting');
    check(/✓ Goal met/.test(doc.querySelector('.goal-status').textContent), 'no goal-met message');
    for (const t of toggles()) { t.click(); await sleep(60); }
    check(app.cur.plot.data.points.some((p) => p.name === 'held' && p.y.length === 300) && app.cur.plot.data.ghosts.length === 1, 'held-out points or rule not drawn');
    check(await ready(60000), 'full maps never finished');
    check(mapVals(0).every(Number.isFinite) && mapVals(1).every(Number.isFinite), 'full maps incomplete');
    btn(/Submit to the report/).click(); await sleep(60);
    check(s.sub && s.sub.met, 'submission not recorded as meeting the goal');
    log.push(`${ch.id}: ${doc.querySelector('.acc-chip').textContent}; visited ${s.visited.length} cells`);
  }

  // ---- resampling ----
  current = 'resample';
  await go('resample'); await ready();
  check(/needs 5/.test(doc.querySelector('.readouts').textContent), 'variance and bias shown with one training set');
  btn(/Draw a new training set/).click(); await sleep(50); await ready();
  btn(/Draw 10 more/).click(); await sleep(50); check(await ready(60000), 'resampling never finished');
  check(app.state.resample.R === 12 && app.cur.plot.data.ghosts.length === 13, `R = ${app.state.resample.R}, ${app.cur.plot.data.ghosts.length} boundaries`);
  check(!/needs 5/.test(doc.querySelector('.readouts').textContent) && app.cur.strip.data.acc.length === 12, 'readouts or strip not filled');
  const rLR = doc.querySelector('.readouts').textContent;
  const knob = doc.querySelector('.knob');
  btn(/^KNN$/, knob).click(); await sleep(50); check(await ready(60000), 'KNN resampling never finished');
  btn(/^Sine wave$/, doc.querySelector('.knob')).click(); await sleep(50); check(await ready(60000), 'sine resampling never finished');
  check(app.state.resample.model === 'knn' && app.state.resample.ds === 'sine', 'model or dataset buttons');
  log.push(`resample: ${rLR.replace(/\s+/g, ' ').slice(0, 160)}`);

  // ---- report ----
  current = 'report';
  await go('report'); await ready();
  const tas = [...doc.querySelectorAll('.exit textarea')];
  check(tas.length === 3, `${tas.length} reflection boxes`);
  tas.forEach((t, i) => { t.value = `reflection ${i + 1}`; t.dispatchEvent(new w.Event('input', { bubbles: true })); });
  const rows = doc.querySelectorAll('table.answers tbody tr');
  check(rows.length === 9 && !doc.querySelector('table.answers tr.missing'), `report has ${rows.length} rows (or missing ones)`);
  check([...rows].slice(0, 6).every((r) => /✓/.test(r.textContent)), 'goal-met marks missing');
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { write: async () => {}, writeText: async () => {} } });
  btn(/Copy report/).click(); await sleep(100);
  check(/Copied/.test(btn(/Copied|Copy report/).textContent), 'copy did not confirm');
  btn(/My report/).click(); await sleep(80);
  check(doc.querySelectorAll('.modal table.answers tbody tr').length === 9, 'My report modal rows');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(60);
  check(!doc.querySelector('.modal') && w.location.hash === '#report', 'Esc should close the modal first');
  check([...doc.querySelectorAll('.dot')].every((d) => d.classList.contains('met')), 'stepper ✓ marks missing');

  // ---- keys ----
  current = 'keys';
  await go('lr-moons');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(100);
  check(w.location.hash === '#lr-sine', `→ went to ${w.location.hash}`);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await sleep(100);
  check(w.location.hash === '#lr-moons', `← went to ${w.location.hash}`);

  // ---- phone ----
  current = 'phone';
  frame.style.width = '390px'; frame.style.height = '844px';
  await sleep(150);
  for (const id of ['knn-circles', 'resample']) {
    await go(id); await ready();
    check(doc.documentElement.scrollWidth <= w.innerWidth + 1, `${id}: page is ${doc.documentElement.scrollWidth}px wide`);
    const sl = sliders()[0];
    sl.scrollIntoView({ block: 'end' }); await sleep(60);
    const pb = doc.querySelector('.stage .plot-box').getBoundingClientRect();
    check(pb.top >= 0 && pb.bottom <= w.innerHeight && inView(sl), `${id}: with a slider in view the plot is at ${Math.round(pb.top)}–${Math.round(pb.bottom)}`);
  }
  frame.style.width = ''; frame.style.height = '';
  await sleep(150);

  // ---- theme and contrast ----
  current = 'theme';
  await go('lr-circles'); await ready();
  const warn = (cond, msg) => { if (!cond) warnings.push(msg); };
  const mode = () => doc.documentElement.dataset.theme;
  let n = contrastChecks(w, mode(), warn);
  btn(/Theme/).click(); await sleep(150);
  n += contrastChecks(w, mode(), warn);
  btn(/Theme/).click(); await sleep(150);
  log.push(`contrast: ${n} checks on the ${themeParam || 'default'} theme, light and dark; ${warnings.length} below target`);

  // ---- reload: the saved state comes back ----
  await sleep(400); // the debounced save
  phase = 'afterReload';
  w.location.reload();
});
