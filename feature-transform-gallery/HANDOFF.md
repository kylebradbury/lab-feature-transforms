# Feature Transform Gallery: Project Handoff

*Updated 2026-10-22. Course: IDS 705 (Kyle Bradbury).*

---

## 1. Goal

An in-class **exhibition** (not a lab) showing that a linear model is hugely useful once the data has a good representation. Every exhibit uses the same logistic regression, σ(w₀ + wᵀz). Only the input changes: z = Φ(x). The curved boundaries students see (circles, spirals, waves, staircases) are all a flat boundary w₀ + wᵀz = 0 in feature space.

Students are **not** meant to learn each transform in detail. The earlier `feature-transforms-lab` attempted that depth. The gallery should leave one idea behind: *choose the representation well, and a linear model can draw almost anything.*

Sibling projects in the same repository (do not modify unless asked):
- `polynomial-features-lab/`: students set weights by hand on raw and polynomial features.
- `feature-transforms-lab/`: the detailed, module-by-module lab.

---

## 2. Where it lives and how to run it

```
exercise-feature-transforms/feature-transform-gallery/
```

```bash
cd exercise-feature-transforms/feature-transform-gallery
python3 -m http.server 8000      # ES modules need http, not file://
# open http://localhost:8000
```

| Page | URL | Content |
|---|---|---|
| Hall | `#` | 18 live tiles in two wings. Hovering a tile applies its Φ. **Apply every Φ** morphs all of them at once. |
| Exhibit | `#<id>`, e.g. `#spiral` | Morph plot, sliders, Φ, the model's equations, accuracy, explanation, the "chosen by hand" note, definitions |
| Finale | `#match` | 7 representations × 6 datasets. Each dataset is cracked by its own Φ. |

---

## 3. What exists now

### Exhibits

Accuracy is on 400 new test points, with the raw features → with Φ.

| id | Name | Family label | Dataset (params) | Φ | Accuracy | Knobs (default) |
|---|---|---|---|---|---|---|
| `line` | Straight line | Raw inputs | blobs | [x₁, x₂] | 97 → 97% | none |
| `circle` | Circle | Squared terms | circles | [x₁², x₂²] | 52 → 100% | none |
| `parabola` | Parabola | Squared term | parabola | [x₁², x₂] | 84 → 99% | none |
| `hyperbola` | Hyperbola | Interaction term | xor | [x₁, x₁x₂] | 48 → 100% | none |
| `ring` | Ring | Radius | ring | [r, r²] | 46 → 99% | none |
| `flower` | Flower | Radius and angle | flower | [r, sin kθ] | 53 → 100% | k petals 2–8 (5) |
| `spiral` | Spiral | Radius and angle | spirals | [sin(ωr−θ), cos(ωr−θ)] | 64 → 100% | turns 0.5–3 (2) |
| `wedge` | Wedge | Angle | wedge (t1 60, t2 120, noise .02) | x/‖x‖ = [cos θ, sin θ] | 82 → 94% | none |
| `wave` | Wave | Sine | sine (ph 0, ω 2, A 1.5) | [sin ωx₁, x₂] | 87 → 100% | ω 0.5–4 (2) |
| `checker` | Checkerboard | Product of sines | checker | sin ωx₁ · sin ωx₂ (1 feature) | 54 → 100% | none |
| `diamond` | Diamond | Absolute values | normball (p 1) | [\|x₁\|, \|x₂\|] | 59 → 99% | none |
| `corner` | Corner | Min and max | corner (t = s = −1) | [min, max] | 88 → 100% | none |
| `powerlaw` | Power law | Logarithms | loans (incSd 1, pw .3, spread .25, noise 0; view 0–400 × 0–120) | [log x₁, log x₂] | 89 → 99% | none |
| `islands` | Islands | Radial basis functions | islands (new) | 2 RBFs at the island centers | 47 → 100% | γ 0.1–5 (1) |
| `poly3` | Wiggly curve | Polynomial | moons (noise .15) | all monomials to degree k (9 features) | 86 → 99% | degree 1–6 (3) |
| `rbf` | Heart | Radial basis functions | heart (new) | m × m grid of RBFs (49 features) | 61 → 99% | m 1–8 (7), γ 0.2–8 (1.5) |
| `relu` | Straight pieces | ReLU units | spirals (turns 1.25) | m random ReLU units (60 features) | 68 → 97% | m 2–200 (60) |
| `bins` | Staircase | Bin indicators | circles | one-hot bins per axis (10 features) | 52 → 97% | B 2–14 (6) |

The two wings:
- **Designed features**: the first 14 exhibits.
- **Basis expansions**: the last 4.

### Exhibit page layout (wide screens)

- **Left:** the morph plot card, sticky. It holds:
  - the space name and an accuracy readout ("new data: 52% raw → 99.8% with Φ");
  - the plot, with a corner badge saying which space is shown and which way the morph is going;
  - **Apply Φ** / **Back to x** and a scrub slider;
  - toggles for grid lines and the best straight line (raw features);
  - the legend and a keyboard hint.
- **Right:** the text column, in this order:
  1. Title and one-line summary.
  2. Sliders (sticky at the top of the column).
  3. Φ.
  4. **The same linear model**: the equation in feature space, what each z_j is, and the equation in x. With ≤ 10 features, every feature is written out with its fitted numbers.
  5. Accuracy bars.
  6. **How this representation works**: the explanation, the "Chosen by hand, not fit" note, and the definitions.
- **Footer** on every page: "© 2026 Kyle Bradbury (link to https://kylebradbury.com/). Designed by Kyle Bradbury, built with Claude."

Keys on an exhibit: **Space** applies Φ or goes back, **← →** changes exhibit, **Esc** returns to the hall, **R** shows the best straight line, **G** toggles grid lines.

---

## 4. Architecture

Static site, no build step. Plain HTML, CSS and ES modules.

| File | Role |
|---|---|
| `index.html` | Shell, theme link (`css/themes/classic.css`), `?theme=` override, KaTeX (CDN, SRI-pinned) |
| `js/exhibits.js` | **All content**: wings, exhibits, finale config. Also the shared definitions (`D`), the "chosen by hand" notes (`CHOSEN`), and the write-out helpers (`bumpParts`, `hingeParts`, `binParts`, `sinMultiple`) |
| `js/build.js` | `fitCase` fits Φ and the raw features (cached); `displayMap` and `geometry` lay out the mesh, contour, points, landmarks and ReLU fold lines in [0, 1] coordinates for both spaces |
| `js/morph.js` | `MorphPlot`: one canvas that draws any point of the x → z morph, plus the space badge and the point tooltip |
| `js/app.js` | Hall, exhibit page, finale, routing, keyboard, theme, footer |
| `js/{rng,datasets,features,model,fit,geometry,plot2d,ui}.js` | Engine **copied** from `polynomial-features-lab` (the repo convention: each lab carries its own copy) |
| `css/lab.css` + `css/gallery.css` + `css/themes/{classic,brand}.css` | Layout, then the gallery's own styles, then colors (themes) |
| `tests.html`, `js/tests/{harness,math.test,gallery.test,run}.js` | Engine math, plus every claim in the text checked against real fits |
| `smoke.html`, `js/tests/smoke.js` | End-to-end UI driver; also a screenshot mode |

Additions to the copied engine:
- `features.js`: `unitdir` (x/‖x‖) and `sinkt` (sin kθ alone).
- `datasets.js`: `islands`, `heart`, and an `incSd` parameter for `loans`.
- `plot2d.js`: exports `lut`, `niceTicks` and `texLabel`.

How feature space is drawn (`build.js`):
- **1 feature:** (z₁, x₂). x₂ is for display only, and the boundary is a vertical line.
- **2 features:** (z₁, z₂) exactly; the boundary is the line w₀ + w₁z₁ + w₂z₂ = 0.
- **More than 2 features:** edge-on. The horizontal axis is u = ŵ·z̃ (standardized features), and v is the direction ⟂ ŵ with the most spread. The hyperplane is exactly the vertical line u = −w₀/‖w‖. The axis ranges come from the points.

Fitting:
- `SPLIT = 200 train / 400 test`, seed 705.
- λ = 1e-3, Newton/IRLS on standardized features.
- Weights are shown in raw units, divided by the largest |w_j|, with 2 decimals.

---

## 5. Key decisions and why

1. **A new, self-contained folder.** It copies the engine instead of sharing it, which matches how the two existing labs are organized.
2. **An exhibition.** The model is fit automatically and nobody sets weights by hand. Student agency comes from the morph, hovering points, and a few sliders.
3. **The morph is the core visual.** The original plane, as a "rubber sheet" of grid lines and shaded cells, is carried into feature space, and the curved boundary lands on a straight line. At t = 1 the shading becomes the model's two half-planes. Two exhibit flags adjust it:
   - `collapse`: Φ squeezes the plane onto a curve, so the shading fades out early.
   - `jumps`: Φ is discontinuous (bins), so the plane tears apart at the jumps.
4. **Test accuracy, not training accuracy,** is shown everywhere ("new data"), to stay honest about usefulness.
5. **Datasets were tuned so a straight line visibly fails.** Examples: a narrower wedge, a higher-frequency wave, the corner at −1, a wider income spread. Each exhibit's feature parameters match how its data was generated, and the page says so.
6. **Two wings,** designed features vs. basis expansions, then a finale matrix. The diagonal emerges: each dataset is cracked only by its own Φ, and the RBF row does well broadly at the cost of 49 features.
7. **Theme:** `classic` (orange and blue) is the default, to match `polynomial-features-lab`'s `index.html`. `brand` (green and gray) passes every contrast check; preview it with `?theme=brand`.
8. **Every control must be usable with the plot in view.** The plot card is sticky, and so is the slider card on wide screens. On tall, narrow screens the plot shrinks to about 40% of the height and stays pinned on top.
9. **Each feature is written out with real numbers when there are ≤ 10** (`WRITE_OUT` in `app.js`): RBF centers, ReLU coefficients, bin edges. Above 10, the page lists z₁ to z₃, then ⋮, then the last feature.
10. **Proper technical names** (radial basis functions, ReLU units, basis expansions, interaction term). Informal words like "bump" and "hinge" appear only as descriptions next to them.

---

## 6. Rules learned from Kyle's feedback

These are standing requirements. Apply them to anything new.

1. **Use proper names.** Write "radial basis function (RBF)", not "bumps", and "ReLU (rectified linear unit)", not "hinges". An informal word may follow as a description ("an RBF looks like a bump").
2. **Labels must be technically accurate.** For example, x₁x₂ is an *interaction term*, not "powers"; [r, r²] is *radius*-based; [r, sin kθ] is *radius and angle*.
3. **Define every function and symbol in Φ,** at least in a footnote: atan2, ‖·‖, |·|, min/max, log, exp, max(0, ·), 𝟙[·], γ, ω, bins, and so on.
4. **Write derived quantities directly from the inputs.** For example: θ = atan2(x₂, x₁), cos θ = x₁/r, sin θ = x₂/r, and sin kθ as a polynomial in x₁/r and x₂/r.
5. **Be honest about what is fit and what is chosen.** Logistic regression fits only w. Any parameter inside Φ (ω, k, centers, landmarks, γ, number of units or bins) was chosen by hand, and the page must say so. It should also say how you would choose it in practice (domain knowledge, or validation search), and that learning it jointly with w is a nonlinear optimization.
6. **Err on the side of mathematical clarity.** Long, explicit equations with real numbers are preferred to vague summaries.
7. **Students must see the effect of every control.** Sliders, the plot and the equations must be visible together; moving a slider should visibly change the equations.
8. **Always say which space a plot shows** (original x, or feature space z = Φ(x)), including the direction of a transform in progress (x → z, or z → x).
9. **UI must be stable.** A toggle must not resize its container.
10. **Keep the focus on the core message.** Peripheral sections were removed ("Where this shows up").
11. **Credit footer on every page** (see §3).

---

## 7. Writing style and tone

- **Audience:** graduate data-science students, reading on a projector or their own laptop.
- **Voice:** plain, direct English; short sentences; present tense. No marketing language, no filler, no exclamation marks.
- **Notation** follows the course lectures:
  - z = Φ(x);
  - the bias is w₀ and the weights are w₁, w₂, …;
  - the boundary is w₀ + wᵀz = 0;
  - the model is σ(w₀ + wᵀz).
- **No hard-coded numbers in prose** unless a test checks them. Accuracies and weights are computed live. Claims such as "the data has 5 petals, and k = 5 is best" are verified in `gallery.test.js`.
- **Class names** ("orange", "blue") come from the theme file, never hard-coded.
- **Math in HTML** uses `\( \)` delimiters; a single `$` is not a delimiter. The indicator is written `\text{𝟙}`, because KaTeX's `\mathbb{1}` renders as a plain 1.
- **Code** follows the surrounding style: concise comments that say *why*, and the same naming and idioms as the copied engine.
- **Reporting back to Kyle:**
  - state what was verified and how (tests, headless screenshots, or live in a browser);
  - report warnings faithfully;
  - flag simplifications or "cheats", such as parameters matched to the data.

---

## 8. Constraints

- **Static site:** no build step and no npm. It must be served over http (a `file://` banner explains this).
- **Dependencies:** KaTeX 0.16.11 only, from jsDelivr, pinned with SRI.
- **Tooling available:** no Node; Python 3 is available; Pillow is not installed. Tests run in headless Chrome at `/Applications/Google Chrome.app`.
- **localStorage keys:**
  - `ftlab:theme` is shared with the other labs;
  - `ftlab:gallery:view` stores the grid-line and straight-line toggles.
- **Body class gotcha:** the `<body>` class is `ftg`, **not** `gallery`, because `lab.css` already styles `.gallery` as a 4-column grid.
- **Headless Chrome gotchas:**
  - With `--virtual-time-budget`, `requestAnimationFrame` never fires, so the smoke driver swaps in timers.
  - Desktop windows have a minimum width of about 500px. Use `&w=390` to lay out phone widths.
  - The first `tests.html` capture after starting a server sometimes shows "running…"; just re-run.
- **Don't touch the other labs** unless asked.

---

## 9. Testing

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# engine math + every claim in the exhibit text (currently 102 tests)
"$CHROME" --headless=new --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
# end to end: hall, all 18 exhibits and their controls, keyboard, finale, phone layout, theme
"$CHROME" --headless=new --virtual-time-budget=900000 --window-size=1500,1000 \
  --dump-dom http://localhost:8000/smoke.html | grep -E "PASS|FAIL"
```

- **The smoke test checks**, among other things:
  - the space badges, including the reversed arrow;
  - that the straight-line toggle doesn't resize the card;
  - that every control is usable with the plot in view, on desktop and on a phone;
  - that the sliders, Φ and the equation are all on screen on arrival;
  - the written-out RBF, ReLU and bin equations;
  - the footer;
  - that every tile's Φ fits its tile.
- **Theme contrast:** the smoke test reports contrast shortfalls as **warnings**. `classic` has 8, which `classic.css` documents; `brand` has 0.
- **Screenshot mode:** `smoke.html?shot=<hall|match|id>` with:
  - `&t=0..1` (morph position)
  - `&k=key:value,…` (slider values)
  - `&raw=1` (best straight line)
  - `&hover=<i>` (hover training point i)
  - `&scroll=<px>`
  - `&w=<px>` (layout width)
  - `&mode=dark`
  - `&theme=brand`
  - `&sim=deutan|protan|gray` (color-vision simulation)

---

## 10. Current status

- **Complete and committed.** HEAD is `f5d40c7` ("Refined the feature transform gallery"), and the working tree is clean.
- **Tests:** 102/102 unit and content tests pass. The smoke test passes with 0 errors (8 contrast warnings on `classic`, 0 on `brand`).
- **Visual checks:** headless screenshots at 1440×900, 1280×800 and 390px phone width, in light and dark modes, on both themes.
- **Not verified live:** the animation pacing (1.6 s per morph, 0.9 s on tile hover) has not been watched in a real browser by Claude.

---

## 11. Open questions and possible next steps

- [ ] **Default theme:** `classic` matches the polynomial lab; `brand` passes the accessibility checks. Pick one for class.
- [ ] **Wedge** shows the smallest gain (82 → 94%). Keep it, change its data, or replace it?
- [ ] **Phase demonstration:** use nonzero-phase wave data with features [sin ωx₁, cos ωx₁, x₂], to show a phase being absorbed into the weights while ω must still be chosen.
- [ ] **Animation pacing** needs a check in a real browser and on the classroom projector.
- [ ] **𝟙 glyph:** rendered from a system math font. Fine on macOS; likely fine on Windows and ChromeOS, but unverified.
- [ ] **Presentation mode** (large type, toggled with P) exists in `feature-transforms-lab` but not here.
- [ ] **Deployment** (e.g. GitHub Pages) is not set up. All paths are relative, so any static host works.
- [ ] **Copyright year** is hard-coded as 2026.
- [ ] **Internal names** still say "bumps" and "hinges" in some code comments, test names and helpers (`bumpParts`, `hingeParts`). Students never see these.
- [ ] **Finale RBF row** is fixed at m = 7, γ = 1.5.

---

## 12. Starter prompt for a new workspace

> I'm continuing work on the Feature Transform Gallery (IDS 705) in `exercise-feature-transforms/feature-transform-gallery/`. Read `HANDOFF.md` first, especially §6 (rules from my feedback) and §7 (style), and follow them for any change. It's a static ES-module site with no build; serve it with `python3 -m http.server`. After any change, run `tests.html` and `smoke.html` in headless Chrome as described in §9, and check the result with screenshots from `smoke.html?shot=…`. Don't modify the other labs unless I ask.
