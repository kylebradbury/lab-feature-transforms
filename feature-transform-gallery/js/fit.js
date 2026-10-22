// Headless glue: data split + feature map + fit + metrics. Used by the
// interactive Scene, the challenge scorer, background sweeps and the tests.

import { makeSplit, DATASETS } from './datasets.js';
import { buildFeatureMap, designMatrix, fitStandardizer, standardize, foldWeights } from './features.js';
import { Trainer, metrics } from './model.js';

export function viewFor(datasetId, logAxes = false) {
  const D = DATASETS[datasetId];
  return logAxes && D.logView ? D.logView : D.view;
}

// Build the feature map and design matrices for a split.
export function prepare(split, featureSpecs, { view, featureSeed = 1 } = {}) {
  const fmap = buildFeatureMap(featureSpecs, { Xtrain: split.train.X, view, featureSeed });
  const d = fmap.dim;
  const part = (set) => ({ Z: designMatrix(fmap, set.X), y: set.y, N: set.y.length });
  const tr = part(split.train), va = part(split.val), te = part(split.test);
  const std = fitStandardizer(tr.Z, tr.N, d);
  const Zs = standardize(tr.Z, tr.N, d, std);
  return { fmap, d, tr, va, te, std, Zs };
}

export function makeTrainer(prep, lambda, warm = null) {
  return new Trainer(prep.Zs, prep.tr.y, prep.tr.N, prep.d, lambda, warm);
}

export function evaluate(prep, wRaw) {
  const { d } = prep;
  return {
    train: metrics(wRaw, prep.tr.Z, prep.tr.y, prep.tr.N, d),
    val: metrics(wRaw, prep.va.Z, prep.va.y, prep.va.N, d),
    test: metrics(wRaw, prep.te.Z, prep.te.y, prep.te.N, d),
  };
}

/**
 * One-shot fit. opts: {params, nTrain, nVal, nTest, seed, lambda, featureSeed}
 * Returns {split, prep, wRaw, wStd, train, val, test, d}.
 */
export function quickFit(datasetId, features, opts = {}) {
  const { params = {}, nTrain = 200, nVal = 0, nTest = 300, seed = 705, lambda = 1e-3, featureSeed = 1, logAxes = false } = opts;
  const split = makeSplit(datasetId, params, { nTrain, nVal, nTest, seed });
  const prep = prepare(split, features, { view: viewFor(datasetId, logAxes), featureSeed });
  const tr = makeTrainer(prep, lambda);
  tr.run();
  const wRaw = foldWeights(tr.w, prep.std);
  return { split, prep, wRaw, wStd: tr.w, trainer: tr, d: prep.d, ...evaluate(prep, wRaw) };
}
