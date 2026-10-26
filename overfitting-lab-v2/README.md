# Overfitting Lab v2 (IDS 705)

A lab about overfitting itself: what it looks like and how to recognize it, not how to avoid it. Students:
- add noise to clean data;
- make a model more flexible: polynomial degree for logistic regression, fewer neighbors k for KNN;
- watch **training accuracy and held-out accuracy pull apart**.

Each challenge has a goal on the **held-out** set. The setting with the best training accuracy never reaches it.

There is no regularization and no ensembling anywhere. It is a static site with no build step, like the other labs.

## Run it locally

```bash
cd exercise-feature-transforms/overfitting-lab-v2
python3 -m http.server 8000
# open http://localhost:8000
```

## Stations

| # | Page | Goal (held-out) | Reaches it | Best training setting |
|---|---|---|---|---|
| 1a | `#lr-circles` Concentric circles · logistic regression | ≥ 87.5 % at noise 0.50 | degree 2–5 | degree 10: 100 % training, 81.3 % held-out |
| 1b | `#lr-moons` Two moons · logistic regression | ≥ 89.0 % at noise 0.50 | degree 3–5 | degree 10: 100 %, 85.4 % (about a straight line's 84.9 %) |
| 1c | `#lr-sine` Sine wave · logistic regression | ≥ 82.0 % at noise 0.30 | degree 5–6 | degree 10: 98.5 %, 80.6 % |
| 2a | `#knn-circles` Concentric circles · KNN | ≥ 88.5 % at noise 0.50 | k 3–21 | k = 1: 100 %, 86.6 %; k ≥ 99: 50 % |
| 2b | `#knn-moons` Two moons · KNN | ≥ 89.0 % at noise 0.50 | k 3–15 | k = 1: 100 %, 88.0 % |
| 2c | `#knn-sine` Sine wave · KNN | ≥ 84.0 % at noise 0.30 | k 5–21 | k = 1: 100 %, 79.0 % |
| 3 | `#resample` Resampling | — | — | — |
| ✎ | `#report` Report | — | — | — |

Every number in this table is checked by `tests.html`.

### A challenge page

- **Start:** clean data (noise 0) and the simplest setting.
- **Sliders:** noise η (0 to 0.60, with the goal level marked ▲) and degree or k.
- **Every setting tried** is recorded in two maps, training and held-out accuracy (noise × setting), and in a curve of accuracy against degree or k at the current noise.
- **Once the goal is met** at the marked noise, three things unlock:
  - the held-out points (300 of the 1000 shown);
  - the rule that generated the data (dashed);
  - every setting, which fills in both maps and the curve.
- **"What … show"** explains the dataset's failure pattern, with live numbers.
- **Submit to the report** records the current setting; resubmitting replaces it.

### Resampling

- **Kept fixed:** the dataset (moons or sine), the noise and the held-out set.
- **What changes:** the training set. Draw up to 30 of them. The model is logistic regression or KNN, with its slider.
- **Display:** every training set's boundary is drawn; the newest is bold.
- **Readouts:**
  - held-out accuracy per training set (dot strip, range, standard deviation);
  - **boundary movement (variance):** the share of held-out points two fits disagree on;
  - **consistent miss (bias):** the held-out points that at least 90 % of the fits get wrong, measured against the rule.
- **On moons at noise 0.50, 30 training sets:**

  | Setting | Boundary movement | Consistent miss |
  |---|---|---|
  | degree 1 | 2.4 % | 15.1 % |
  | degree 3 | 5.1 % | 2.5 % |
  | degree 10 | 20.1 % | 0 % |
  | k = 149 | 3.5 % | 23.1 % |
  | k = 15 | 4.5 % | 5.2 % |
  | k = 1 | 13.2 % | 0 % |

### Report

📋 **My report** shows each submitted challenge: noise, setting, training and held-out accuracy, goal and ✓/✗. The last station adds three written reflections and copies everything (HTML and plain text) for the LMS. **↺ Reset lab** erases everything this lab saved in the browser (keys `ftlab:overfitv2:*`; v1's saved data is separate).

## Data and model

- **Data:** 200 training points (100 per class) and 1000 held-out points per dataset, seed 705.
- **Noise** is x = x_clean + η·ε, with one fixed draw of ε per point, so the noise slider moves the same points smoothly and labels never change.
- **Datasets:**
  - circles: disk r < 1 vs. ring 1.7 < r < 2.7;
  - moons: arcs of radius 1.6;
  - sine: bands of width 1.2 on each side of y = 1.2 sin(2x + 0.5), with an empty 0.12 strip.
- **Logistic regression** on polynomial features, with no penalty. Plain Newton steps run until they no longer improve the fit.
  - When the training classes overlap everywhere, this is the exact best fit.
  - When some points separate perfectly, no best fit exists, and the page says so. A 10⁻⁸ penalty is used only to find a starting point and is removed before the final fit.
- **KNN:** odd k only, so votes never tie. A training point counts as its own neighbor, so k = 1 always gets 100 % training accuracy.

## Code map

| File | Responsibility |
|---|---|
| `js/data.js` | The three datasets: clean points plus one noise draw per point |
| `js/truth.js` | The rule that generated each dataset (dashed line) |
| `js/engine.js` | Training and held-out sets, `fitZ`, logistic regression and KNN results for every (noise, setting, training set), `CHALLENGES` with the goals, `resampleStats` |
| `js/knn.js` | KNN for every k at once (per-class sorted distances, merged) |
| `js/charts.js` | `CurveChart` (training and held-out, visited dots), `ExploreMap` (noise × setting heatmap), `AccStrip` |
| `js/stations.js` | All text: leads, goals, what each dataset shows (live numbers), definitions, reflections |
| `js/app.js` | Shell, challenge pages, resampling, landing, report |
| `js/model.js`, `features.js`, `plot2d.js`, `geometry.js`, `ui.js`, `rng.js`, `sweep.js` | Copied from v1 (`model.js` gains a `force` option for the exact-fit test) |

## Tests

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# math (KNN vs brute force, smooth noise, exact vs no-best-fit), every goal and claim, timing (85 tests)
"$CHROME" --headless=new --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
# end to end: every challenge (locks, goal, unlock, full maps, submit), resampling, report, reload, keys, phone, theme, reset
"$CHROME" --headless=new --virtual-time-budget=2000000 --window-size=1500,1000 \
  --dump-dom http://localhost:8000/smoke.html | grep -E "PASS|FAIL"
```

- `tests.html?suite=calibrate` prints every challenge's numbers, the suggested goal and resampling statistics.
- `smoke.html?shot=<page>` ends on a page for a screenshot. Options:
  - `&si=` and `&j=` set the sliders;
  - `&met=1` marks the goal as met;
  - `&show=held,rule,full` turns on the toggles;
  - `&R=` draws training sets (resampling);
  - `&mode=dark`, `&w=`, `&scroll=`, `&report=1`.
- If a headless run prints `running…`, Chrome captured the page early; run it again.
