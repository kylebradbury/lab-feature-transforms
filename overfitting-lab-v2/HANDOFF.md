# Overfitting Lab v2: Project Handoff

## Goal

Kyle reviewed v1 (`../overfitting-lab-v1/`) and asked for a more targeted v2. It should focus on overfitting itself, not remedies: no ensembling, no regularization, no "more data" lever. It has three parts:
1. **Logistic regression challenges:** a polynomial degree slider plus a noise slider, starting from clean data, with training vs. held-out performance tracked as both vary. Three datasets show different degrees of failure, and each challenge has a held-out goal. The held-out points can only be shown once the goal is met.
2. **KNN challenges:** the same datasets, with a k slider.
3. **Resampling:** resample only the training data, to show bias and variance.

At the end, students submit a report.

## Decisions made with Kyle

- **Noise** is position blur. Goals sit at a marked noise level.
- **Charts** fill in as students explore, and the full picture unlocks after the goal.
- **Datasets:** circles, moons, sine.
- **Resampling:** one station with a logistic regression / KNN toggle.
- **Report:** results plus three written reflections.

## Calibration notes

- **N = 200:** at N = 100, the per-seed spread made the goal properties fragile.
- **Sine is a band** (`data.js`): uniform sampling in the box made it behave like the moons.
- **How each goal T is set:** the best held-out accuracy at the goal noise, minus a margin (1.5 points; 1.0 for KNN circles and sine; 0.5 for KNN moons), rounded down to 0.5 %.
  - Tests check that at least 2 settings reach it, and that every setting tied for the best training accuracy misses it by at least 1 point.
  - KNN moons misses by exactly 1.0 point (k = 1: 88.0 % vs. 89.0 %), the mildest failure, which is on purpose: "KNN is forgiving here".
- **Fitting without regularization.** v1's check for an exact fit (accept only if every |score| < 25) was wrong on noisy data. v2 always takes the unpenalized Newton limit. Ten forced extra steps decide only the disclosure: if the weights keep growing, no best fit exists.
  - Using the 10⁻⁸ guard as the fit instead would act as regularization: moons at degree 10 would go from 100 %/85.4 % to 94.5 %/89.1 % (training/held-out).
  - That is why the guard is only a starting point.
- **Two numbers keep the goals honest:**
  - At η = 0 (clean data), the most flexible setting is within 2 points of the best. Overfitting needs noise.
  - The rule's accuracy is never called "best possible", because under position noise it is not the best possible classifier.

## Possible next steps

- Choose a theme. `classic` is the default, like the other labs; `brand` passes every contrast check.
- Add an honest model-selection step (a separate validation split) to answer reflection 3 ("is the held-out number a fair estimate?").
- v1's exact-fit check has the bug described above. Port v2's `fitZ` if v1 stays in use.
