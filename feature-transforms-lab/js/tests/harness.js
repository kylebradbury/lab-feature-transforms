// Tiny DOM-free test harness: test(name, fn), assert helpers, bench.

export const results = [];

// ?suite=content,perf runs math plus the listed suites; no query runs everything.
const want = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('suite') : null;
const enabled = want === null ? null : new Set(['math', ...want.split(',').filter(Boolean)]);
let current = 'math';
export function suite(name) { current = name; }

export function test(name, fn) {
  if (enabled && !enabled.has(current)) return;
  const t0 = performance.now();
  try {
    const info = fn();
    results.push({ name, ok: true, ms: performance.now() - t0, info: typeof info === 'string' ? info : '' });
  } catch (e) {
    results.push({ name, ok: false, ms: performance.now() - t0, err: e && e.message ? e.message : String(e) });
  }
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertClose(a, b, tol, msg = '') {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg} expected ${b} ± ${tol}, got ${a}`);
}

// Median time (ms) over `reps` runs.
export function bench(fn, reps = 5) {
  const ts = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  return ts[Math.floor(ts.length / 2)];
}
