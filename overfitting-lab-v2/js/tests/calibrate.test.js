// ?suite=calibrate: prints the numbers behind every challenge, so that goals
// and text are set from what this engine actually computes.

import { suite, test } from './harness.js';
import { CHALLENGES, SETTINGS, ETAS, result, suggestT, resampleStats, MAX_RESAMPLES } from '../engine.js';

suite('calibrate');
const P = (v) => (100 * v).toFixed(1);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

for (const ch of CHALLENGES) {
  test(`calibrate ${ch.id} at noise ${ETAS[ch.goalSi]}`, () => {
    const S = SETTINGS[ch.model], rs = S.map((s) => result(ch.model, ch.ds, ch.goalSi, s));
    const T = suggestT(ch), reach = S.filter((s, i) => rs[i].heldCorrect >= T);
    const topTrain = Math.max(...rs.map((r) => r.trainCorrect)), tops = S.filter((s, i) => rs[i].trainCorrect === topTrain);
    const topHeld = Math.max(...rs.filter((r) => r.trainCorrect === topTrain).map((r) => r.heldCorrect));
    const row = S.map((s, i) => `${s}:${P(rs[i].train)}/${P(rs[i].held)}${rs[i].guarded ? 'g' : ''}`).join(' ');
    const avg = S.map((s) => `${s}:${P(mean(Array.from({ length: 12 }, (_, r) => result(ch.model, ch.ds, ch.goalSi, s, r).held)))}`).join(' ');
    return `T=${T} reach [${reach.join(',')}] top-train [${tops.join(',')}] held ${topHeld} (misses by ${(T - topHeld) / 10} pts) || ${row} || mean of 12 sets: ${avg}`;
  });
  test(`calibrate ${ch.id} at noise 0`, () => {
    const S = SETTINGS[ch.model], rs = S.map((s) => result(ch.model, ch.ds, 0, s));
    return S.map((s, i) => `${s}:${P(rs[i].train)}/${P(rs[i].held)}${rs[i].guarded ? 'g' : ''}`).join(' ');
  });
}
for (const [ds, si] of [['moons', 10], ['sine', 6]]) {
  test(`calibrate resampling ${ds} at noise ${ETAS[si]}, 30 sets`, () => [['lr', 1], ['lr', 3], ['lr', 5], ['lr', 10], ['knn', 1], ['knn', 15], ['knn', 149]].map(([model, s]) => {
    const st = resampleStats({ ds, si, model, setting: s, R: MAX_RESAMPLES });
    return `${model}${s}: mean ${P(mean(st.acc))} [${P(Math.min(...st.acc))}–${P(Math.max(...st.acc))}] disagree ${P(st.disagree)} miss ${P(st.miss)}`;
  }).join(' | '));
}
