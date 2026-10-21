# Plan: Feature Transforms Interactive Lab (IDS 705, Lab 1)

## Context

This is the first lab in a planned series of web interactives for the ML class. It should get across two ideas:

1. Real models are trained on **transformed features**, not raw ones.
2. A linear classifier on z = Φ(x) has a **hyperplane boundary in Z-space**. In the original 2-D X-space that same boundary can be a line, a conic, a ring, a flower, a spiral, a checkerboard or a staircase.

The content comes from `candidate-feature-transforms.md` in this folder: 8 transform families, a table matching datasets to transforms, and a suggested shortlist.

**Decisions already made:**
- Static site, no build step.
- One lab page with guided modules.
- Used both for instructor-led projection and self-paced work.

**Starting point:**
- The folder currently holds only the `.md` file.
- The sibling exercises are PowerPoint/Word with one Python script, so there is no web code to reuse.
- Node is not installed. `python3` and Google Chrome are.

**Notation** follows Lectures 05 and 09 (`ml-lectures/2026/`):
- Φ, z = Φ(x), and "X-space / Z-space"
- bias w₀
- boundary w₀ + w₁z₁ + … + w_p z_p = 0
- regularized cost C(w) = CE + λΣ_{j≥1} wⱼ², with the bias not penalized

---

## 1. Stack and file layout

**Stack:**
- Plain HTML/CSS/JS, using native ES modules (`<script type="module">`) with no bundler or npm.
- CDN libraries pinned to exact versions with SRI (check that each version is at least two weeks old when implementing):
  - **KaTeX** (`katex@0.19.x`) for math.
  - **Plotly 3-D build** (`plotly.js-gl3d-dist-min@4.x`), loaded only when a 3-D view first opens.
- Canvas 2D for every 2-D plot, for speed.
- Preview locally with `python3 -m http.server 8000`, since ES modules don't load from `file://`. An inline script detects `file:` and shows that command.
- Deploy to GitHub Pages using relative paths and hash routing.

Root: `exercise-feature-transforms/`

```
index.html            Page shell: header, sidebar stepper, stage, side panel; CDN tags; file:// banner
tests.html            Runs js/tests/run.js; writes PASS/FAIL to page + document.title
README.md             Run/deploy, how to add a transform/dataset/module, smoke checklist, TA guide
.gitignore            .DS_Store, shots/
css/lab.css           Theme tokens (light/dark), layout grid, controls, cards, presentation mode
js/main.js            State store, dirty-flag pipeline + rAF scheduler, hash router, module lifecycle,
                      keyboard shortcuts, theme/presentation toggles, localStorage
js/rng.js             mulberry32, gaussian (Box–Muller), shuffle, deriveSeed(base, tag)
js/datasets.js        16 seeded, class-balanced generators + metadata; makeSplit()
js/features.js        Transform registry, buildFeatureMap(), column dedupe, standardizer, weight folding
js/model.js           L2 logistic regression via Newton/IRLS; time-boxed Trainer; metrics
js/geometry.js        Marching squares, conic classifier, region IoU, unit-ball outlines
js/plot2d.js          X-space canvas (heatmap, boundary, points, axes, hover, drag handles),
                      Z-space panel, mini line/bar charts
js/plot3d.js          Lazy Plotly loader; Lift view; generic 3-D Z-space view (points + plane)
js/ui.js              Declarative controls, KaTeX helpers, beats, predict-then-reveal cards, feature palette
js/challenge.js       Holes, scoring, submissions, solutions, scorecard export
js/modules/index.js   Ordered module list (+ "core path" flags)
js/modules/00-intro.js … 12-wrapup.js   Mostly declarative config + narrative
js/tests/{harness,math.test,content.test,perf.test,run}.js
```

**Rules:**
- `rng`, `datasets`, `features`, `model` and `geometry` never touch the DOM, so they can be tested headlessly. They would also run under `node --test` if Node is installed later.
- Module files hold content and config only. All mechanics live in the core files.
- Expected size: about 4,800 lines of JS and 450 of CSS.

---

## 2. Core engine

### 2.1 Datasets (`datasets.js`)

**Contract:** `gen(n, params, rand) → {X: Float64Array(2n), y: Uint8Array(n)}`.
- Classes are exactly balanced, using rejection sampling for region-defined datasets.
- Metadata: `{id, label, view, domain:'all'|'positive', params, defaults}`.
- Common params: `n`, `noise` (positional jitter), `flip` (label noise, 0–0.2).
- Default view is [−3, 3]² at equal aspect.
- `makeSplit(id, params, {nTrain, nTest, nVal?, seed})` does a stratified split by count.

| id | Rule (class 1) | Key params | Solved by |
|---|---|---|---|
| blobs | two Gaussians | sep, angle | raw |
| circles | inner disk vs outer ring | gap | r, [x₁²,x₂²], quad |
| ring | annulus vs center ∪ outside | widths | [r,r²], \|r−ρ\| |
| offcircle | disk centered (a,b) | a,b,R | r about (a,b), quad |
| xor | sign((x₁−a)(x₂−b)) | gap,a,b | x₁x₂, (x₁−a)(x₂−b) |
| moons | two moons | — | [x₁,x₁³,x₂], RBF, ReLU |
| spirals | θ=ω*r vs θ=ω*r+π | turns, chirality | spiral feature |
| checker | sign(sin(πx₁/s)sin(πx₂/s)) | cells, phase | sin ωx₁·sin ωx₂ |
| sine | x₂ > A sin(ωx₁+φ)+c | A,ω,φ,c | [sin ωx₁, cos ωx₁, x₂] |
| stripes | sign(sin(ωx₁+φ)) | ω,φ | [sin ωx₁, cos ωx₁] |
| flower | r < R(1+a sin(kθ+φ)) | k,a,φ | [r, sin kθ, cos kθ] |
| wedge | θ∈(θ₁,θ₂) | θ₁,θ₂ | [sin θ, cos θ] |
| normball | ‖x−c‖_p < R, p∈{1,2,∞} | p,R,c | L1 / r / L∞ |
| band | \|x₁−c\| < h | c,h | \|x₁\| |
| corner | min(x₁−t, x₂−s) > 0 | t,s | min, corner indicator |
| loans | income (log-normal) vs loan; rule = power / ratio / log-curve | p,k,rule, train-only-<$150k | x₂/x₁, [log x₁, log x₂], [log x₁, x₂] |

`loans` is positive-only, with view [1, 400] × [0.5, 600] and an optional log-axis display.

### 2.2 Transform registry (`features.js`): covers every option in the candidate list

**Entry shape:** `{id, family, label, latex, params{slider specs}, columns(p)→[{key, latex}], domain, overlays, eval(x1, x2, p, out, offset)}`.
- `eval` writes into a preallocated `Float64Array`, so evaluating the grid allocates nothing.

| Family | Transforms |
|---|---|
| Baseline | `raw` [x₁,x₂]; `x1`; `x2`; `linmix` (rotate α, scale s₁,s₂); standardize toggle |
| Polynomial | `poly(k)` k=1..10, all monomials with 1≤i+j≤k ((k+1)(k+2)/2−1 cols, 65 at k=10); `quad2` with term mask; single monomials (x₁², x₂², x₁x₂, cubics); `prodc` (x₁−a)(x₂−b) |
| Radial/polar | `r`, `r2`, `absr` \|r−ρ\| (all about a center c); `angle` [sin θ, cos θ]; `petal` [sin kθ, cos kθ]; `spiral` [sin(ωr−sθ), cos(ωr−sθ)]; `theta_raw` (sandbox only, to show the seam) |
| Periodic | sin/cos ωx₁, ωx₂; `fourier1` [sin,cos]; `checker` sin ωx₁·sin ωx₂; `checker4` (4 products); `rff` √(2/D)cos(ωᵢᵀx+bᵢ), D 5–300, length scale ℓ |
| RBF | `rbf` exp(−γ‖x−cⱼ‖²); landmark placement grid / random / data / manual (draggable); γ log 0.01–100 |
| Piecewise | `bins` (one-hot per axis); `bins2d` (B×B cells); `hinge` max(0, x−t_k) on draggable knots; `relu` max(0, uᵢᵀ(x−pᵢ)) random units; `cornerind` 1[x₁>t]·1[x₂>s] |
| Norms | `abs1`, `abs2`, `l1` \|·\|+\|·\|, `linf` max(\|·\|,\|·\|), `minx`, `maxx` |
| Monotone/ratio | `log1`, `log2`, `exp1`, `sig1` σ((x₁−t)/s), `ratio` x₂/x₁ |

**Implementation notes:**
- **Angles never use `atan2`.**
  - Compute cθ = dx/r and sθ = dy/r, falling back to (1, 0) when r ≈ 0.
  - Get sin kθ and cos kθ from the complex power recurrence.
  - Spiral: sin(a − θ) = sin a·cθ − cos a·sθ, where a = ωr.
  - This avoids the branch cut along the negative x₁-axis.
- **Polynomial columns** are filled from a per-point table of powers.
- **Positive-domain transforms** (`log*`, `ratio`) clamp their input to 1e-9 and are disabled on datasets whose domain is `all`.
- **Random features** (RFF, ReLU, random RBF) draw from `deriveSeed(featureSeed, id)`, so they change only when the user clicks "Resample features".

**`buildFeatureMap(specs, ctx)`:**
- Deduplicates columns by `key`, so raw combined with quad2 still has 5 columns. This keeps the challenge feature count fair.
- Returns `{dim, columns, signature, evalRow, domainOK}`.

**Standardization** (always on when fitting):
- `fitStandardizer` floors sd at 1 for constant columns.
- `foldWeights` converts the weights back to raw-feature space. The grid, the equation display and the manual sliders all work in raw space.
- **Teaching note:** standardization never changes the set of reachable boundaries. With λ > 0 it does change which boundary the fit picks.

### 2.3 Training (`model.js`)

**Objective:**
- Mean cross-entropy, computed with a stable softplus, plus λΣ_{j≥1} w̃ⱼ² in standardized space.
- A tiny 1e-8 penalty on w₀ keeps the solution finite.

**Optimizer: Newton/IRLS.**
- Hessian = (1/N) ZᵀSZ + 2λI′, built from its upper triangle only.
- Solve with Cholesky. If it fails, add jitter that escalates ×10 up to 6 times; after that, fall back to a gradient step.
- Armijo backtracking line search, so the loss never increases.
- Stop when ‖g‖∞ < 1e-7, or the relative change in loss is below 1e-10, or after 50 iterations.

**Why Newton:**
- d ≤ 300 and N ≤ 600, so a step costs about 1–2 ms at d = 66.
- It needs 5–10 iterations from cold and 1–3 from a warm start.
- There's no learning rate to tune, and it gives exact optima for the content tests.

**`Trainer.step(budgetMs)`:**
- Runs in `requestAnimationFrame` chunks: 8 ms while dragging, 30 ms otherwise.
- **Warm start:** used when the feature signature hasn't changed, e.g. while dragging ω, γ, a center, a landmark or λ.
- **Cold start:** w = 0 and w₀ = logit(ȳ).
- No Web Worker. Feature closures can't be posted to a worker.

**λ** is set with a log slider from 1e-5 to 10, labeled "λ ≈ 0" at the left end.
- The 1e-5 floor keeps separable problems finite.
- Default 1e-3; Degree module default 1e-5.

**Manual mode:**
- The user sets the raw weights directly.
- Live readouts of accuracy and cross-entropy.
- "Snap to best fit" rescales the fitted weights by a positive constant c so they fit the slider ranges; the boundary doesn't change.
- A "confidence" slider multiplies all weights, which changes how sharp the shading is but not the boundary.

### 2.4 Rendering

**X-space canvas (`plot2d.js`):** square, DPR-scaled, with a `ResizeObserver`.

- **Heatmap:**
  - Logits evaluated at cell centers: 100² while dragging, 200² once settled.
  - Shaded with a 256-entry lookup table: blue tint → neutral gray → orange tint.
  - Option for "class only" flat shading.
- **Boundary:**
  - Marching squares at logit 0, drawn as a 2.5 px ink line with a surface-colored halo.
  - Optional dashed contours at p = 0.25 and 0.75.
- **Points:** class 0 is a blue circle and class 1 an orange square, so class is never shown by color alone. Training points are filled and test points hollow. Optional "highlight mistakes".
- **Overlays/handles** (pointer capture; larger hit areas in presentation mode):
  - center crosshair
  - RBF landmarks: a γ-ring, sized by |weight| and colored by sign
  - hinge knots
  - ReLU kink lines (shown faint, not draggable)
  - corner point
  - ghost target curve, and "boundary spaghetti" (boundaries from several resamples)
- **Hover tooltip** at any location: x, Φ(x), w₀ + wᵀz, p. On a data point it adds the label and whether it's train or test.

**Z-space panel**, which makes "a hyperplane in feature space" visible:

| d | What it shows |
|---|---|
| 1 | Number-line strip with the threshold |
| 2 | (z₁, z₂) scatter with the separating line and the same shading; hover is linked to the X-space plot |
| 3 | Button to open the Plotly 3-D view (points + plane) |
| > 3 | Bar chart of the top 20 weights by \|w\|, with KaTeX labels |

**3-D (`plot3d.js`):**
- Lift view traces: class points at (x₁, x₂, h(x)); the surface h at opacity 0.25; a plane z = a·x₁ + b·x₂ + c; their 3-D intersection curve; and its projection onto the floor.
- Choices for h: bowl x₁² + x₂², saddle x₁x₂, egg-crate sin·sin, cone r.
- The "Lift!" animation scales h from 0 to 1. It is skipped when `prefers-reduced-motion` is set.
- Camera presets: Oblique, Side, Top. Top looks the same as the 2-D plot.
- `Plotly.purge` runs on unmount.

**Mini charts:**
- Train/test accuracy against degree, λ, γ or ω.
- Ink colors, solid vs. dashed lines, direct labels and a marker at the current setting.
- Sweeps are computed in `setTimeout` chunks and cancelled if the state changes.

### 2.5 State, pipeline, routing (`main.js`)

**State:**
- `state = {route, present, theme, mods:{[id]:{dataset, features, fit, view, beat, answers}}}`.
- A separate cache holds everything derived: split, feature map, design matrix, trainer, raw weights, grid, contours and metrics.

**Update pipeline:**
- `set(patch, level)` marks state dirty at one of five levels: data > features > model > grid > paint. It then schedules a single rAF frame.
- Each frame redoes only the stages that are dirty.
- While the trainer hasn't converged, a "converging…" pill shows and another frame is queued.

**Routing:**
- Hash form `#<module>?<shareable params>`, e.g. `#sandbox?ds=spirals&f=spiral(omega=4.49)&lam=-3`.
- "Copy link" in the header copies the current state.
- `?present=1` turns on presentation mode; `?debug=1` shows a per-stage timing HUD.

**localStorage** keeps theme, progress, answers and challenge submissions. Every read and write is wrapped in try/catch.

### 2.6 Module contract and UI kit (`ui.js`)

**Module object:** `{id, title, core, keyIdea, defaults, controls[], beats[], questions[], inPractice, mount?, unmount?}`.

**Control types:**

| Type | What it is |
|---|---|
| slider / log-slider / int | Range input with a KaTeX label and value readout |
| select | Dropdown |
| toggle | On/off switch |
| buttons | Preset row |
| weights | A slider per term, plus the live colored equation |
| mask | Term checkboxes |
| palette | Feature chips grouped by family, with column counts and inline params |
| dataset | Dataset chooser |
| lambda | The λ log slider |
| readouts | Accuracy, loss, feature count |

Controls marked `essential:true` are the only ones shown in presentation mode, plus a "More controls" disclosure.

**Beats:**
- Short narrative steps of at most about 80 words.
- Each can have a "Show me" button that applies a preset.
- → moves to the next beat and applies its preset.

**Predict-then-reveal card:**
- Lettered choices A–D, sized for hand-raise polling.
- Self-paced students must "Lock in" an answer before "Reveal" works. In presentation mode, Reveal is always available (also via the R key).
- Reveal shows the answer and explanation, and applies `revealPreset` so the answer appears on the plot.

**Extras:** each module has an "In practice" callout and a collapsible "Why it works" math box.

---

## 3. Module specifications

**Core path for one 75-minute class:** modules 0, 1, 2, 3, 4 (spiral beat), 6 and 12, plus 20 minutes of Challenge. The rest are self-paced.

### M0 Intro / Baseline: "Lines are all you get" (core)
- **Objective:**
  - σ(w₀ + w₁x₁ + w₂x₂) always has a straight-line boundary.
  - Linear remixes of the features add no new shapes.
  - Teaches the display conventions: shading, boundary, filled = train, hollow = test.
- **Data:** blobs; quick buttons for circles, XOR, moons and spirals.
- **Features:** raw, optional linmix (α, s₁, s₂), standardize toggle.
- **Controls:** manual/auto toggle and w₀, w₁, w₂ sliders. Under "More": noise, n and λ.
- **Visuals:** X-space and Z-space panels, plus a **teaser gallery** of 8 live thumbnails (line, circle, hyperbola, ring, flower, spiral, checkerboard, staircase), each captioned "also a linear classifier" and linking to its module.
- **Beats:**
  1. The model and its boundary; hover anywhere to see the logit.
  2. Drag the line by hand, then press Fit.
  3. Switch to circles.
  4. Linmix: Z-space changes but X-space still shows a line.
  5. In practice: BMI, log income, hour as sin/cos, distance to the nearest store.
- **Questions:**
  - Q1: best line on circles reaches about 50–60%.
  - Q2: [x₁+x₂, x₁−x₂] adds no new shapes.
  - Q3: in manual mode, try to beat the optimizer's loss.

### M1 Polynomial: "Sculpt every conic" (core)
- **Objective:**
  - With quad2 = [x₁, x₂, x₁², x₁x₂, x₂²], the boundary can be any conic.
  - The lower-order terms move its center.
  - Subsets of the terms restrict which shapes are possible.
- **Data:** none (blank canvas), then offcircle, xor and circles.
- **Controls:**
  - Six weight sliders (essential): w₀ ∈ [−6, 6], the others ∈ [−3, 3].
  - Live equation with coefficients colored by sign.
  - Mask presets: [x₁², x₂²], [x₁x₂], [x₁, x₁², x₂], all five.
  - Snap to best fit, confidence slider.
- **Conic badge** from `geometry.classifyConic`, based on Δ = B² − 4AC plus a 3×3 determinant for degenerate cases. Possible badges: ellipse, circle, parabola, hyperbola, two intersecting lines, two parallel lines, single line, point, empty.
- **Shape Match mini-game:**
  - Six dashed target shapes: circle at the origin; shifted circle; upward parabola; XOR hyperbola; band |x₁| < 1; ellipse tilted 45°.
  - Success at IoU ≥ 0.95. If the complement matches, show "Right shape, wrong side — flip every sign."
- **Beats:** map each slider to its coefficient → build a circle → sweep w₄ → expand (x₁ − a)² to see why the shift needs linear terms → what each mask can and can't do → fit mode, then compare the fitted weights to yours.
- **Questions:**
  - Q1: raise the x₁x₂ weight from 0 to 3. The circle becomes an ellipse, then two parallel lines at w₄ = 2, then a hyperbola. Reveal animates the sweep.
  - Q2: which single feature solves XOR? x₁x₂.
  - Q3: can [x₁², x₂²] alone fit a circle centered at (1, 1)? No.

### M2 3-D Lift: "A flat cut through a curved surface" (core)
- **Objective:**
  - Lifted to the bowl z = x₁² + x₂², the data can be cut by a plane z = a·x₁ + b·x₂ + c.
  - The cut projects down to the circle (x₁ − a/2)² + (x₂ − b/2)² = c + (a² + b²)/4.
  - This is M1's center-shift, seen geometrically.
- **Data:** circles and offcircle; xor with the saddle; checker with the egg crate.
- **Controls:**
  - Lift surface select; plane c, a and b (essential).
  - "Fit plane" runs logistic regression on [x₁, x₂, h].
  - Lift!, surface and intersection toggles, camera presets.
- **Layout:** Plotly about 60% of the width, linked live to the 2-D canvas.
- **Beats:** Lift → raise and lower the plane (radius √c) → tilt it (center moves to (a/2, b/2)) → lower it below the bowl (everything one class) → saddle on XOR → Top camera ("the 2-D plot is the view from above").
- **Questions:**
  - Q1: a horizontal slice of the bowl seen from above is a circle.
  - Q2: tilting moves the circle and changes its size.
  - Q3: the saddle surface makes XOR separable by a plane.

### M3 Degree and overfitting (core)
- **Objective:**
  - Flexibility grows with degree k, as does the column count.
  - High degree overfits: islands, huge weights, and a train/test gap.
  - λ and more data both help.
- **Data:** moons with noise 0.25, nTrain = 60, nTest = 500, λ = 1e-5. Alternative: circles with flip = 0.1.
- **Controls:** k = 1–10 with a live column count; λ (essential); nTrain; noise; Resample; show test points; Boundary spaghetti (5 seeds, fitted while idle).
- **Visuals:** a mini chart with tabs "vs degree" and "vs λ", plus log |w| bars.
- **Beats:** k = 1, 2, 3 → k = 10 at λ ≈ 0 → the U-shaped curve → spaghetti (variance) → λ with C(w) = CE + λΣwⱼ² (previews Lecture 9) → more data → choosing k on test data is cheating, use validation (leads into Challenge).
- **Questions:**
  - Q1: degree 10 has 65 features.
  - Q2: test accuracy at k = 10 is lower than at k = 3.
  - Q3: across resamples, which boundary moves more? k = 10.
- **Mini-challenge:** best validation accuracy using at most 10 features.

### M4 Radial and polar (spiral beat is core)
Each sub-beat comes with its own preset.

- **a. Circles with [r].** One feature reaches about 100%, vs. 5 features for quad2. The 1-D strip shows the threshold.
- **b. Ring.**
  - [r] fails; [r, r²] works, because in Z-space the points sit on the parabola z₂ = z₁² and a line cuts it twice, giving two radii.
  - |r − ρ| is the one-feature alternative.
- **c. Offcircle.** Drag the center of r; accuracy peaks at the true center. "The feature encodes an assumption; quad2 learns it instead."
- **d. Flower with [r, sin kθ, cos kθ].** Count petals to set k.
- **e. Spirals.**
  - Raw features reach about 50%, and poly-10 is wiggly and poor.
  - [sin(ωr − θ), cos(ωr − θ)] at the right ω reaches about 100%. Z-space shows two clusters on the unit circle.
  - An ω slider shows what happens when the pitch is wrong. A chirality toggle handles mirrored spirals.
- **f. Wedge with [sin θ, cos θ].**

**In practice:** distance to a city center or a sensor.

**Questions:**
- Q1: can [r] alone separate the ring? No.
- Q2: predict spirals accuracy for poly-10 (65 features) vs. the 2 spiral features.
- Q3: ω set 10% too small makes the boundary spiral at the wrong pitch, so the outer arms fail first.

### M5 Periodic / Fourier
- **a. Stripes at phase 1.** [sin ωx₁] fails at any weights; adding cos works, since a·sin + b·cos = R·sin(·+φ). The phase lesson matches M1's center-shift lesson.
- **b. Sine boundary with [sin ωx₁, cos ωx₁, x₂].** Students find ω. An **ω-scan chart** shows that accuracy is bumpy in the feature parameter, while the fit over w is convex.
- **c. Checker with sin ωx₁·sin ωx₂** at ω = π/s. Adding a phase breaks the single product; `checker4` fixes it.
- **d. Moons/spirals with RFF.** Controls D, ℓ and Resample. Small ℓ gives wiggly boundaries; large D gives smooth, stable ones. This bridges to kernels.

**In practice:** encode hour, weekday or wind direction as a sin/cos pair.

**Questions:**
- Q1: sin alone can't fit stripes at an unknown phase.
- Q2: a 4×4 checkerboard on [−3, 3] needs ω = π/1.5 ≈ 2.09.
- Q3: with RFF, as D grows, train accuracy approaches 100% and test peaks and then falls.

### M6 RBF bumps (core)
- **Objective:**
  - Bumps are local features, so where you place landmarks matters.
  - γ sets smoothness. Small γ ≈ 1 − γ‖x − c‖², which is quadratic, so the boundary is close to a circle or a line.
  - Putting a landmark on every data point is essentially a kernel method.
- **Beats:**
  1. Offcircle with one manual landmark; drag it onto the center (the same as shifted r).
  2. Moons with a 4×4 landmark grid; sweep γ.
  3. Manual landmarks: click to add (up to 30), drag to move, Alt-click to remove. Each landmark's size and color show its weight.
  4. Spirals with landmarks at the data (nTrain = 200, so d = 200): large vs. small γ.
  5. γ-scan chart.
- **Controls:** placement mode and γ (essential); m; λ; γ-rings toggle.
- **In practice:** distance to each of your 20 stores; similarity to prototype customers.
- **Questions:**
  - Q1: landmarks at the data with γ = 100 give 100% train accuracy, but test falls and islands appear.
  - Q2: γ = 0.01 gives a near-circle or a line.
  - Q3 (mini): solve spirals with the fewest manual landmarks while keeping test ≥ 95%.

### M7 Piecewise and ReLU (bridge to trees, Lecture 11, and neural nets, Lecture 12)
- **a. Circles with `bins`.** B per axis gives an axis-aligned staircase, like a tree. `bins2d` is a lookup table that overfits at large B.
- **b. Sine with [x₁, x₂, hinge on x₁].** Drag up to 8 knot lines; the boundary bends only at the knots.
- **c. Corner with `cornerind`.** Drag the corner; this is an AND of two thresholds.
- **d. Moons/spirals with random ReLU.**
  - m from 2 to 200, with a Resample button; faint kink lines shown.
  - "The boundary is a polygon whose corners lie on these lines. A neural net *moves the lines*; that is learning Φ."

**In practice:** age bands, tax brackets.

**Questions:**
- Q1: the hinge model can bend only at a knot.
- Q2: with random ReLU, corners appear only on the m lines.
- Q3: training a neural net would learn uᵢ and pᵢ, moving those lines.

### M8 Norms, abs, min/max
- **Beats:**
  1. Band with |x₁|.
  2. Corner with min(x₁, x₂).
  3. **Mystery-shape game:** normball with a hidden p ∈ {1, 2, ∞}. Pick ONE feature to reach at least 98% test accuracy.
  4. [|x₁|, |x₂|] gives rhombi and bow-ties.
  5. Toggle the L1, L2 and L∞ unit balls ("you'll see these in Lecture 9").
- **In practice:** Manhattan distance; max-tolerance checks in manufacturing.
- **Questions:**
  - Q1: max(|x₁|, |x₂|) gives a square.
  - Q2: name the shapes [|x₁|, |x₂|] can make.
  - Q3: the mystery game.

### M9 Monotone and ratio: "what practitioners do"
- **Data:** loans, with rules power, ratio and log-curve.
- **Feature presets:** raw, x₂/x₁, [log x₁, x₂], [log x₁, log x₂], and quad2 for comparison.
- **Special interactions:**
  - **Linear/log axes toggle.** With log-log features the boundary is a straight line on log axes.
  - **Extrapolation toggle:** train only on income below $150k. Above that, quad2 diverges while log-log extrapolates cleanly.
  - Dollar values appear on hover.
  - A domain warning explains why log/ratio chips are disabled on centered datasets.
- **Questions:**
  - Q1: "loan ≤ 0.4 × income" needs only x₂/x₁.
  - Q2: "loan ≤ 3·income^0.6" needs [log x₁, log x₂].
  - Q3: log-log extrapolates better than quad2.

### M10 Sandbox
- Any dataset, with params and seed.
- The full feature palette, grouped by family, with column counts and inline params.
- A live d counter: warning above 150, hard cap 300.
- λ and manual/auto mode.
- Z-space panel; when d > 3, a "z_i vs z_j" projection selector with a caveat that the boundary in a projection need not be a line.
- 3-D view when d = 3, and Copy link.
- Includes `theta_raw`, with a note about the atan2 seam.

### M11 Challenge: "Feature Golf" (section 4)

### M12 Wrap-up: kernels and neural nets (core)
- **Visuals:** a 2×2 grid on the same spirals data:
  - hand-built spiral features (2 columns)
  - RBF at the data (about 200)
  - RFF (D = 200)
  - random ReLU (m = 200)
  - Each tile shows its column count and test accuracy.
- **Text:**
  - Three ways to choose Φ: hand-built (interpretable, encodes assumptions), generic (flexible, prone to overfitting), learned or implicit (neural nets, kernels).
  - Teasers: K(x, x′) = Φ(x)·Φ(x′), and "backprop moves the lines".
- **Printable cheat sheet** of the shape families.
- **Exit ticket:** 3 reflections, stored locally and copyable.

---

## 4. Challenge mode: "Feature Golf"

This borrows the sibling game's separation of validation and test data.

**Data:**
- Each hole fixes a dataset and its seeds, so every student sees identical data.
- Train (200) and validation (200) points are visible, with live validation accuracy.
- The test set (1,000 points) is hidden and drawn from a separate seed.

**Playing a hole:**
- Students use the Sandbox palette, with free choice of feature params and λ.
- **Feature budget:** at most 8 columns per hole.
- **Submissions:** "Submit to test" reveals test accuracy. Each hole allows 3 submissions, and the last one counts.

**Score:**
- Points = round(100 × test accuracy) − 2 × d.
- A hole is cleared only if test accuracy reaches its target. The total is the sum over cleared holes.
- After a submission, "Par" shows the reference solution's score.

**Solutions:**
- Revealed after 3 submissions or on request, and the hole is flagged "solution viewed".
- `#challenge?solutions=1` shows every solution for an end-of-class debrief.
- "Copy scorecard" produces a plain-text table to paste into an LMS. There is no server.

| # | Hole | Dataset | Target | Reference (cols) |
|---|---|---|---|---|
| 1 | Warm-up | blobs | 95% | raw (2) |
| 2 | Bullseye | circles | 97% | r (1) |
| 3 | Off-center | offcircle | 97% | r about c (1) |
| 4 | Shifted XOR | xor a=.7,b=−.5 | 95% | (x₁−a)(x₂−b) (1) |
| 5 | Donut | ring | 96% | \|r−ρ\| (1) |
| 6 | Moons | moons | 95% | [x₁,x₁³,x₂] (3) |
| 7 | Galaxy | spirals | 97% | spiral (2) |
| 8 | Chessboard | checker 4×4 | 95% | sin·sin (1) |
| 9 | Wave | sine | 95% | [sin,cos,x₂] (3) |
| 10 | Diamond heist | normball p=1 | 97% | L1 (1) |
| 11 | Loan officer | loans power | 95% | [log x₁, log x₂] (2) |
| 12 | Bonus: Starfish | flower k=5 | 95% | [r, sin5θ, cos5θ] (3) |

---

## 5. Design and accessibility

**Classes:**
- Class 0 is blue (`#2a78d6` light / `#3987e5` dark); class 1 is orange (`#eb6834` / `#d95926`). Both pairs pass the dataviz validator for colorblind separation.
- Class is always shown by shape too: circle vs. square.
- The heatmap LUT uses the class hues around a neutral gray, with a separate LUT for dark mode.
- Chart series use ink colors with solid/dashed lines, not the class hues.

**Themes:**
- Colors are CSS tokens on `:root`, redefined for `prefers-color-scheme: dark` and for the `data-theme` toggle.
- Canvas code re-reads the tokens whenever the theme changes.

**Presentation mode** (`P` key or `?present=1`):
- Hides the sidebar, leaves a one-line key-idea banner and only essential controls.
- Scales type ×1.4, points and lines ×1.5, and handle hit areas.
- Shows large readouts for test accuracy, train accuracy and d.
- Keys:

| Key | Action |
|---|---|
| ← / → | Previous / next beat |
| Shift + ← / → | Previous / next module |
| R | Reveal the current question |
| T | Show or hide test points |
| D | Dark mode |
| F | Fullscreen |
| ? | Help overlay |

- Check at 1280×720 and 1024×768.

**Responsive layout:**

| Width | Layout |
|---|---|
| ≥ 1200 px | Three columns |
| 800–1200 px | Sidebar becomes a module dropdown |
| < 800 px | Single stacked column (pointer events, so touch works) |

**Other a11y:**
- Native range inputs with focus rings.
- Throttled `aria-live` readouts.
- A text description under each plot, e.g. "Boundary: circle, test 97%".
- `prefers-reduced-motion` turns off animations.

---

## 6. Implementation phases (each ends with a gate)

| Phase | Work | Gate |
|---|---|---|
| P0 Skeleton (0.5d) | index.html, lab.css tokens/layout, router + stepper with placeholder modules, file:// banner | Served by http.server; hash nav works |
| P1 Math core (1.5d) | rng; datasets blobs/circles/xor/moons/spirals; features raw/poly/quad2/r/spiral; standardizer; Newton; marching squares, conics; test harness | tests.html green headless (grad/Hessian checks, separability, poly counts) |
| P2 Renderer + Intro (1.5d) | plot2d heatmap/contour/points/hover; dirty pipeline; Trainer; debug HUD; M0 | Perf budgets met; blobs gives a line, circles visibly fails |
| P3 UI kit + Conics + Z-space (1.5d) | ui.js, weights mode, conic badge, Shape Match, Z-space panel | All 9 conic badges reachable; IoU works |
| P4 Lift (1d) | plot3d, plane/intersection, animation, cameras | Center = (a/2, b/2) numerically; Top view matches 2-D |
| P5 Degree (1d) | poly ≤ 10, sweeps chart, spaghetti, weight bars | Degree 10 at λ = 1e-5 is finite; U-shape appears |
| P6 Families (2.5d) | Remaining datasets/transforms; M4–M9; handles; log axes | Every beat `expect` passes in content tests |
| P7 Sandbox + Challenge (1.5d) | Palette, dedupe/budget, URL share, holes, scoring, storage, solutions | Every reference solution ≥ target + 1.5 points |
| P8 Wrap-up + polish + deploy (1d) | M12, presentation/dark polish, a11y, Safari/Firefox, README TA guide, git init, GitHub Pages | Projector check; Pages URL live |

P1–P3 prove the core idea end to end before any family module is built.

---

## 7. Verification

**Headless tests (no build, no Node):**
```
python3 -m http.server 8000   # background, from exercise-feature-transforms/
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --virtual-time-budget=20000 --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
```

**`math.test.js`:**
- **RNG:** determinism; Gaussian moments.
- **Datasets:** n and balance; disjoint stratified splits; with noise = 0 labels obey their rule; loans values positive.
- **Transforms:**
  - quad2 at (1, 2) gives [1, 2, 1, 2, 4];
  - poly column counts for k = 1..10 match (k+1)(k+2)/2 − 1;
  - **polar continuity across the negative x-axis**;
  - spiral features match atan2 away from the seam;
  - log/ratio stay finite for inputs ≤ 0;
  - dedupe merges raw + quad2 into 5 columns.
- **Standardizer:** folded raw-space logits match standardized logits within 1e-9.
- **Model:**
  - finite-difference gradient and Hessian checks (relative error < 1e-6);
  - loss decreases monotonically;
  - matches a long gradient-descent reference within 1e-4;
  - degree 10 and d = 300 stay finite.
- **Separability** (train accuracy ≥ 0.99 at noise = 0):
  - circles+r, xor+x₁x₂, spirals+spiral, checker+sin·sin, ring+[r,r²]
  - normball+L1, loans+log-log, stripes+sin/cos
  - blobs+raw ≥ 0.98
- **Negative controls:** circles, xor and spirals with raw features stay ≤ 0.70; ring+r ≤ 0.75; stripes with sin alone scores at least 15 points below sin+cos.
- **Geometry:** the unit-circle contour stays within 0.01 of the circle; `classifyConic` passes 12 cases; IoU identities; the Lift intersection-center formula.

**`content.test.js`:** builds every beat preset that has an `expect`, and every challenge reference solution, headlessly. This catches regressions when narrative presets or noise levels are edited.

**Performance budgets** (`perf.test.js` and the `?debug=1` HUD):

| Operation | Budget |
|---|---|
| Warm Newton step, d ≤ 30 | ≤ 3 ms |
| Cold fit, d = 66, N = 300 | ≤ 40 ms |
| Grid 100², d ≤ 30 | ≤ 5 ms |
| Drag frame, d ≤ 30 | ≤ 33 ms |
| Drag frame, d ≤ 66 | ≤ 50 ms |
| d ≈ 200 | Previews at ≥ 10 fps; converged ≤ 600 ms |
| First load | < 300 KB (excluding fonts); Plotly lazy-loaded |

**Visual smoke checks:**
- A headless-Chrome screenshot loop over every `#module`, saving to `shots/` (gitignored); use `--enable-unsafe-swiftshader` for WebGL.
- A README checklist with one line per module saying what you should see.
- Manual passes: presentation mode at 1280×720, dark mode, Safari and Firefox, a keyboard-only walkthrough.

---

## 8. Risks and mitigations

1. **file:// blocks ES modules.** Show a banner with the server command; use `.js` extensions.
2. **atan2 seam.** Compute angle features as sin/cos via x/r, y/r and recurrences; covered by a unit test.
3. **log or ratio on values ≤ 0.** Clamp inputs, flag transform domains, skip non-finite cells in marching squares.
4. **High-degree conditioning.** Use float64, standardization, the λ floor, Cholesky jitter, line search and an iteration cap.
5. **Separable data with λ → 0.** The λ floor keeps weights finite, and a "converging…" pill shows while fitting continues.
6. **Slow at large d.** Time-boxed steps, a coarser grid while dragging, N caps, and a hard limit of d ≤ 300.
7. **λ depends on feature scaling.** Explain it in the lab; manual-mode snapping uses only positive rescaling, which leaves the boundary unchanged.
8. **Random features changing between renders.** All randomness comes from seeds; only "Resample features" changes it.
9. **KaTeX and dollar amounts.** Use only `\( \)` and `$$` delimiters, and cache rendered labels.
10. **CDN outage during class.** Pin versions with SRI; the README documents an optional `vendor/` fallback.
11. **Plotly WebGL leaks.** Call `purge` on unmount and keep a single 3-D container.
12. **Dropbox and git.** Mark `.git` as Dropbox-ignored (`xattr -w com.dropbox.ignored 1 .git`), or keep the repo outside Dropbox.
13. **Scope creep.** Beats stay at most about 80 words. Stretch goals stay out of v1: a warped-grid Z-space view, ReLU lines trained by dragging, and a shared leaderboard.
