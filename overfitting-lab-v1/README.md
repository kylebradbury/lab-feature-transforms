# Overfitting Lab (IDS 705)

The follow-up to the Feature Transform Gallery. The gallery showed that one linear model can
draw almost any boundary once the data has a good representation z = Φ(x). This lab shows what
the same flexibility does with **noise**:
- flexible representations memorize flipped labels;
- the boundary changes with every training sample;
- in higher dimensions, inputs that carry no information make things worse in ways no 2-D picture shows.

The model is always logistic regression with **no regularization**. Penalties are left for a
later lab, and this one seeds that discussion and the one on representation learning.

The lab is a guided sequence of five stations, about 35 minutes. Each station asks for a
prediction first; results on new points (the test set) stay hidden until a prediction is locked in.

It is a static site with no build step, like the other labs. KaTeX comes from a CDN, pinned with SRI.

## Run it locally

```bash
cd exercise-feature-transforms/overfitting-lab
python3 -m http.server 8000
# open http://localhost:8000
```

## Stations

| # | Page | What it shows | Default |
|---|---|---|---|
| 1 | `#a1` Noise gets memorized | Concentric circles with label flips. Designed [x₁², x₂²] vs. polynomial degree 10 vs. a 10 × 10 RBF grid; slider for the share of labels flipped. | 15 % flipped, N = 100: designed 76 % training / 84 % new; degree 10 94 % / 68 % (17 of 22 flips memorized); RBF 100 % / 63 %; best possible 85 % |
| 2 | `#a2` The complexity dial | Polynomial degree 1–10 and N ∈ {40, 100, 400}; curves average 5 training sets. | N = 100: new points best at degree 2 (82 %); degree 10 96 % / 71 % |
| 3 | `#a3` Another training set | 8 training sets, 8 boundaries; majority vote. | Degree 10: fits disagree on 40 % of the data region (designed 12 %); one fit 70 %, the vote 84 % |
| 4 | `#b1` Irrelevant inputs | [x₁², x₂²] plus k pure-noise inputs, N = 50, 10 % flipped. Original space, **Any two features** (drag-and-drop axes, including the score), weight bars, score histogram, three 2-D intuitions that fail. | New points 90 % at k = 0 → 63 % at k = 100 → 55 % at k = 500; training 100 % from k = 20 |
| 5 | `#wrap` Wrap-up | What we saw (live numbers), four open questions (more data, fewer features, large weights → regularization, learned features → representation learning), the exit ticket. | |

All numbers above are checked by `tests.html` against the real engine.

**Submitting work:** 📋 **My answers** (top right) collects every locked-in prediction (✓/✗ and the
station's result) and the exit ticket, with a name field and **Copy table** (HTML and plain text,
for an LMS or a spreadsheet). **↺ Reset lab** erases everything this lab saved in the browser.

**Keys:** ← → move between stations, Esc returns to the start (or closes a dialog).

## "No regularization", exactly

- **Classes overlap in the training set:** the unpenalized maximum-likelihood fit exists, and the
  lab uses it exactly (Newton steps with λ = 0, kept only at a true optimum).
- **Training points can be separated perfectly** (degree 10, the RBF grid, many noise inputs):
  no best fit exists, because the weights grow without limit. A fixed numerical guard
  (10⁻⁸ × the sum of the squared weights) lets the fit stop. Every station that needs it says so
  under "How it works".
- **Direction of the guard:** making it smaller only increases the overfitting (tested at 10⁻¹⁰).
  So the guard understates, never hides, the effect.

## Code map

| File | Responsibility |
|---|---|
| `js/stations.js` | All station text: leads, questions, how it works, "chosen by hand", definitions, the B1 intuitions, the exit ticket |
| `js/app.js` | Shell (stepper, My answers, help, Reset lab, theme, keys), landing, the four station controllers, wrap-up |
| `js/engine.js` | Headless: pooled training sets (smaller N are prefixes of larger ones), the test set, exact/guarded fit (`fitZ`), `runCase`, disagreement, majority vote |
| `js/model.js` | Newton/IRLS `Trainer` (guard `GUARD = 1e-8`, stop reasons), `DualTrainer` for d + 1 > N (same Newton steps in the span of the training points) |
| `js/truth.js` | The rule that generated the data (dashed line) and the best possible accuracy |
| `js/hd.js` | Seeded noise inputs, nested in k |
| `js/charts.js` | `CurveChart` (training, new points, best possible; gap shaded; direct labels) and `ScoreHistogram` |
| `js/sweep.js` | Time-sliced chart filling |
| `js/plot2d.js`, `features.js`, `datasets.js`, `fit.js`, `geometry.js`, `ui.js`, `rng.js` | Copied from the gallery. Changes: a dashed "flipped label" ring in `XPlot`; `generateSet` exported from `datasets.js` |
| `css/overfit.css` | Station layout; stepper, segmented controls, weight bars, feature chips and the answers table come from the polynomial lab |

## Tests

Start the server, then open the pages in a browser or run them headless:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# engine math, every number in the station text and questions, timing (74 tests)
"$CHROME" --headless=new --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
# end to end: every station and control, predictions, My answers, keys, phone, theme, Reset lab
"$CHROME" --headless=new --virtual-time-budget=900000 --window-size=1500,1000 \
  --dump-dom http://localhost:8000/smoke.html | grep -E "PASS|FAIL"
```

- `tests.html?suite=calibrate` prints the numbers behind every station default.
- `smoke.html?shot=<landing|a1|a2|a3|b1|wrap>` ends on that page for a screenshot. Options:
  - `&lock=<choice>` locks in a prediction, and `&reveal=1` reveals it;
  - `&set=<json>` patches the station's settings;
  - `&mode=dark` switches to dark mode;
  - `&w=<px>` sets the page width;
  - `&scroll=<px>` scrolls the page;
  - `&answers=1` opens My answers.
- If a headless run prints `running…`, Chrome captured the page before the test modules finished; run it again.
- The smoke test reports the classic theme's known contrast shortfalls as warnings. With `?theme=brand` there are none.
