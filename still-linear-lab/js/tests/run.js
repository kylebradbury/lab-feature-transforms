// Runs synchronously (static imports) so results exist before the load event;
// that lets `chrome --headless --dump-dom` read them with a real clock.
import { results } from './harness.js';
import './math.test.js';
import './still.test.js';

const pass = results.filter((r) => r.ok).length;
const summary = `${pass === results.length ? 'PASS' : 'FAIL'} ${pass}/${results.length}`;
document.title = summary;
document.getElementById('summary').textContent = summary + '\n\n' + results
  .map((r) => `${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.info ? '  ' + r.info : ''}${r.ok ? '' : '  -- ' + r.err}  (${r.ms.toFixed(1)} ms)`)
  .join('\n');
