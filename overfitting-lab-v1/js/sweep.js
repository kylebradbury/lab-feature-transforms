// Run a list of jobs (each one fit or a few) in ~25 ms slices so the page
// stays responsive while a chart fills in; the pattern of the main lab's
// degree module. Fits are cached in engine.js, so a sweep that was already
// run finishes at once.

export function sweep(jobs, { onProgress = null, onDone = null, sliceMs = 25 } = {}) {
  let i = 0, cancelled = false;
  const step = () => {
    if (cancelled) return;
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < sliceMs) jobs[i++]();
    if (onProgress) onProgress(i, jobs.length);
    if (i < jobs.length) setTimeout(step, 0);
    else if (onDone) onDone();
  };
  setTimeout(step, 0);
  return { cancel() { cancelled = true; }, get done() { return i >= jobs.length; } };
}
