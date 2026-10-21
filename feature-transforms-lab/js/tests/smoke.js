// Drives the real app in an iframe: every module, every walkthrough step,
// every question reveal and every control button. Records any error.
const frame = document.getElementById('app');
const out = document.getElementById('summary');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = [];

frame.addEventListener('load', async () => {
  const w = frame.contentWindow;
  w.addEventListener('error', (e) => errors.push(`${current}: ${e.message}`));
  w.addEventListener('unhandledrejection', (e) => errors.push(`${current}: ${e.reason}`));
  const origErr = w.console.error.bind(w.console);
  w.console.error = (...a) => { errors.push(`${current}: ${a.map(String).join(' ')}`); origErr(...a); };
  w.confirm = () => true; w.alert = () => {};
  await sleep(500);
  const app = w.ftlab;
  w.document.body.classList.add('present'); // reveal without locking in
  const only = new URLSearchParams(location.search).get('only');
  for (const mod of app.modules.filter((m) => !only || m.id === only)) {
    current = mod.id;
    app.go(mod.id);
    await sleep(400);
    const inst = app.instance;
    const nb = mod.beats ? mod.beats.length : 0;
    for (let b = 1; b < nb; b++) { inst.keys.next(); await sleep(250); }
    for (let q = 0; q < (mod.questions || []).length; q++) { inst.keys.reveal(); await sleep(250); }
    // click every control button once (skip navigation)
    const doc = w.document;
    const sel = () => [...doc.querySelectorAll('.mod-side .card button, .extras button')].filter((b) => !/Next|Back|Copy|Print|Submit/.test(b.textContent));
    let clicked = 0;
    for (let k = 0; k < 40; k++) {
      const b = sel()[k];
      if (!b) break;
      if (b.disabled) continue;
      b.click(); clicked++;
      await sleep(120);
      if (only) log.push(`  clicked "${b.textContent.slice(0, 40)}" → ${[...doc.querySelectorAll('.stat .val')].map((e) => e.textContent).slice(0, 3).join(' | ')}`);
    }
    // a couple of slider moves
    const ranges = [...doc.querySelectorAll('.mod-side input[type=range]')].slice(0, 4);
    for (const r of ranges) { r.value = r.max; r.dispatchEvent(new Event('input')); await sleep(80); r.value = r.min; r.dispatchEvent(new Event('input')); await sleep(80); }
    await sleep(300);
    const sc = [...(w.document.querySelectorAll('.stat .val'))].map((e) => e.textContent).slice(0, 3).join(' | ');
    log.push(`${mod.id}: ${nb} beats, ${(mod.questions || []).length} questions, ${clicked} buttons, ${ranges.length} sliders · readouts ${sc}`);
  }
  current = 'done';
  out.textContent = `${errors.length ? 'FAIL' : 'PASS'} smoke (${errors.length} errors)\n\n${log.join('\n')}\n\n${errors.join('\n')}`;
  document.title = errors.length ? 'FAIL' : 'PASS';
});
let current = 'boot';
