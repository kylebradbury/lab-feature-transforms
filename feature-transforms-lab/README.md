# Feature Transforms Lab (IDS 705)

An interactive web lab showing that a **linear classifier on transformed features**
z = Φ(x) can draw almost any decision boundary in the original inputs. These include
circles, conics, rings, flowers, spirals, checkerboards and staircases. The boundary is
always a flat hyperplane in Z-space.

It is a static site with no build step: plain HTML, CSS and JavaScript ES modules.
KaTeX (math) and Plotly (3-D views only, lazy-loaded) come from a CDN, pinned with SRI.

## Run it locally

ES modules do not load from `file://`, so serve the folder:

```bash
cd exercise-feature-transforms/feature-transforms-lab
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Copy the folder to any static host, for example GitHub Pages:
1. Push the folder to a repository.
2. Go to Settings → Pages and choose to deploy from a branch.

All paths are relative and routing uses the URL hash (`#polar`, `#sandbox?s=…`), so it
works from a sub-path with no server configuration.

> Dropbox and git: if you `git init` inside Dropbox, mark `.git` as ignored by Dropbox
> (`xattr -w com.dropbox.ignored 1 .git`) or keep the repository elsewhere.

## Modules

● marks the suggested core path for one 75-minute class: 0 → 1 → 2 → 3 → 4 (spiral step) → 6 → 11 → 12.

| # | Module | Idea |
|---|---|---|
| 0 ● | Intro: raw features | σ(w₀ + wᵀx) only draws lines; linear remixes don't help; gallery of what Φ can do |
| 1 ● | Polynomial: conics | 6 weight sliders sculpt every conic; conic badge; Shape Match game |
| 2 ● | 3-D lift | Points lifted onto a bowl or saddle; a flat plane cut projects to a circle |
| 3 ● | Degree & overfitting | Degree 1–10, train/test curves vs. k and λ, "boundary spaghetti" |
| 4 ● | Radial & polar | r, [r, r²], \|r − ρ\|, flowers, spirals, wedges; draggable center; ω scan |
| 5 | Periodic / Fourier | Stripes need sin + cos (phase); sine boundary; checkerboard; random Fourier features |
| 6 ● | RBF bumps | Click to place landmarks; γ sets smoothness; landmarks at data ≈ kernel method |
| 7 | Piecewise & ReLU | Bins (tree-like), draggable hinge knots, corner indicator, random ReLU = frozen NN |
| 8 | Norms & min/max | Band, diamond, circle, square, L-corner; mystery-shape game; unit balls |
| 9 | Logs & ratios | Skewed loan data; ratio and log–log features; log axes; extrapolation |
| 10 | Sandbox | Any dataset × any combination of transforms; shareable link |
| 11 ● | Challenge: Feature Golf | 12 holes, feature budget 8, validation visible, hidden test set, 3 submissions |
| 12 ● | Wrap-up | Hand-built vs. generic Φ on the spirals; kernels and neural nets; cheat sheet; exit ticket |

## Teaching notes

- **Presentation mode.** Press **P**, or add `?present=1` to the URL (`index.html#intro?present=1`).
  This uses large type, hides the sidebar and shows only the essential controls.
- **Keyboard shortcuts:**

  | Key | Action |
  |---|---|
  | ← / → | Walkthrough steps; → on the last step goes to the next module |
  | Shift + ← / → | Previous / next module |
  | R | Reveal the next question (works without "Lock in" in presentation mode) |
  | T | Show or hide test points |
  | D | Dark mode |
  | F | Full screen |
  | ? | Help |
- **Predict, then reveal.** Students must lock in an answer before revealing. Each reveal also
  applies a preset so the answer appears on the plot.
- **Challenge.** Seeds are fixed, so the whole class sees identical data and comparable scores.
  - Scores live in each student's browser.
  - **Copy scorecard** produces a plain-text table to paste into the LMS.
  - Instructors can list every reference solution with `#challenge?solutions=1`.
- **Wrap-up exit ticket.** Answers are stored locally, and **Copy my answers** copies them for submission.

## Code map

| File | Responsibility |
|---|---|
| `js/rng.js` | Seeded RNG (mulberry32), Gaussian, `deriveSeed` |
| `js/datasets.js` | 16 seeded, class-balanced generators; `makeSplit` (train/val/test, test from its own seed) |
| `js/features.js` | **Transform registry**, `buildFeatureMap` (column dedupe), standardizer, `foldWeights` |
| `js/model.js` | L2 logistic regression by Newton/IRLS (Cholesky + jitter, Armijo line search); metrics |
| `js/fit.js` | Headless glue: split → features → fit → metrics (`quickFit`) |
| `js/geometry.js` | Marching squares, conic classification, IoU |
| `js/scene.js` | Config → derived state → render; dirty levels; time-sliced training; drag handles; tooltips |
| `js/plot2d.js` | Canvas X-space plot, Z-space panel, line chart, theme colors |
| `js/plot3d.js` | Lazy Plotly loader, Lift view, 3-D Z-space modal |
| `js/ui.js` | DOM helpers, KaTeX, sliders/toggles, walkthrough, predict-then-reveal, feature palette |
| `js/main.js` | App shell, hash routing, keyboard, theme, presentation mode |
| `js/challenge.js` | Feature Golf holes, scoring, reference solutions |
| `js/modules/*.js` | One file per module: mostly config, narrative and presets (`common.js` holds the shared layout and control builders) |

**Notation follows Lectures 05 and 09:**
- z = Φ(x)
- bias w₀
- boundary w₀ + wᵀz = 0
- C(w) = cross-entropy + λ Σ_{j≥1} wⱼ²

### Add a transform

Add an entry to `TRANSFORMS` in `js/features.js`:

```js
myfeat: {
  family: 'radial', label: 'my feature', tex: 'g(x)',
  params: { a: { min: 0, max: 3, step: 0.05, default: 1, label: 'a' } },
  make: (p) => ({
    cols: [{ key: `myfeat(${p.a})`, tex: 'g(x)' }],      // key identifies identical columns
    eval(x1, x2, out, o) { out[o] = /* value */ 0; },     // write cols.length values at out[o…]
  }),
},
```

- It then appears automatically in the Sandbox and Challenge palettes.
- Add `handles(p)` to make a parameter draggable on the plot (see `CENTER` / `centerHandle`).
- Add `domain: 'positive'` if it needs positive inputs.

### Add a dataset

Add an entry to `DATASETS` in `js/datasets.js` with:
- `params` (slider specs)
- `gen(n, params, rng)`, which must return exactly ⌊n/2⌋ class-1 points

Use `region(...)` for rejection sampling from a labeling rule.

### Add a module

Copy a module in `js/modules/` and register it in `js/modules/index.js`.
`standardModule` takes:
- `initial()` (config)
- `controls(m, el)`
- `beats[]`, each `{title, html, apply(cfg, m)}`
- `questions[]`, each `{prompt, choices, answer, explain, reveal(cfg, m)}`
- `inPractice`, `why`
- optional `extras(m, el)`

## Tests

Start the server, then open the pages in a browser or run them headless:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# math + content + performance (79 tests)
"$CHROME" --headless=new --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
# end-to-end smoke test: every module, step, reveal and control button
"$CHROME" --headless=new --virtual-time-budget=900000 --window-size=1500,1000 \
  --dump-dom http://localhost:8000/smoke.html | grep -E "PASS|FAIL"
```

**`tests.html?suite=…`** selects suites; math always runs:
- **math**: RNG, datasets, transforms (including continuity across the θ = ±π seam), standardization, Newton vs. finite-difference gradients and long gradient descent, separability and negative controls, contours, conic classes.
- **content**: every number the narrative claims (e.g. "the best line on circles is about 52%") and every challenge reference solution (≥ target + 1.5 points, within budget), checked against the real engine. Run it after changing any preset, dataset default or noise level.
- **perf**: median timings for Newton steps, grids, contours and a drag frame (soft budgets).

### Visual checklist (what you should see)

- **Intro:** blobs split by a line; circles at about 52%; the r step turns the boundary into a circle near 100%; 8 live gallery tiles.
- **Conics:** the circle badge; sweeping w₄ passes through ellipse → parallel lines (at 2) → hyperbola; Shape Match turns ✓ at IoU ≥ 95%.
- **3-D lift:** points rise onto a bowl; the plane cut and its dashed shadow match the 2-D circle; Top view equals the 2-D plot.
- **Degree:** with 40 noisy moons, degree 10 reaches 100% train and about 83% test; spaghetti fans out at degree 10.
- **Polar:** the two spiral features reach about 100%; poly-10 about 80%; ω chart peaks near 4.49.
- **Challenge:** test accuracy is never shown before you submit; the scorecard updates.
