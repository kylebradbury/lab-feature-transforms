# Still a Linear Model (IDS 705)

A short lab about one picture. Logistic regression computes a score
s = w₀ + wᵀz from the features z = Φ(x) and predicts class 1 where s > 0. The lab
draws that score as a height, over two floors at once:

- **Over the feature axes (z₁, z₂)**, the score is always a flat plane, and it
  crosses s = 0 in a straight line.
- **Over the original axes (x₁, x₂)**, the same heights bend into a dome, a saddle,
  a ridge, a corrugated sheet or a spiral ramp. That surface crosses s = 0 along the
  curved boundary.

The model is still linear, just in a different space.

It is a static site with no build step, like the other labs. KaTeX and Plotly's 3-D
build come from a CDN, pinned with SRI.

## Run it locally

```bash
cd exercise-feature-transforms/still-linear-lab
python3 -m http.server 8000
# open http://localhost:8000
```

## The page

| Panel | What it shows |
|---|---|
| Original space | The data and the boundary s = 0, shaded by which side of it each spot is on |
| Score over the original space | The score as a surface over (x₁, x₂). The gray plane is s = 0, and the black curve is where they cross: the same boundary as the 2-D panel. |
| Score over feature space | The same heights over (z₁, z₂). **◀ Back to x / ▶ Apply Φ** slides every point and grid line sideways from x to z = Φ(x), and no height changes. At z the sheet lands on a flat plane, and the cut becomes a straight line. |

Below the panels:
- **3-D camera:**
  - **Oblique**, **Top** (becomes the 2-D panel) and **Side**.
  - **Edge-on** looks along the straight zero line in feature space, so the plane shows as a line while the surface over x still bends.
  - Dragging either 3-D view turns both.
- **The plane s = 0:** shows or hides the zero plane.
- **Hover:** hovering over a point in any panel highlights it in all three. The readout gives x, z = Φ(x) and its height s, which is the same in both 3-D views.
- **The weights:** sliders for w₀, w₁ and w₂ start at the fitted values. w₀ lifts or lowers every height by the same amount, and w₁ and w₂ tilt the plane. **Reset to the fit** restores the fitted values.
- **The same linear model:** Φ, then the score written in z and in x, with live numbers.
- **About this case:** what the panels show, what was chosen by hand, and the definitions.

**Keys:** ← / → change the dataset; Space applies Φ or goes back.

## Cases

| id | Data | Φ | Over x | Over z | New data: raw → Φ |
|---|---|---|---|---|---|
| `line` | blobs | [x₁, x₂] | tilted plane | the same plane | 97.0 → 97.0% |
| `circle` | circles | [x₁², x₂²] | dome | plane (four quadrants folded onto one) | 52.0 → 99.8% |
| `hyperbola` | xor | [x₁, x₁x₂] | saddle | plane | 48.3 → 100% |
| `ring` | ring | [r, r²] | circular ridge | plane; the data lies on the curve z₂ = z₁² | 45.8 → 99.3% |
| `wave` | sine (ω 2, A 1.5, no phase) | [sin 2x₁, x₂] | corrugated sheet | plane (folded like an accordion) | 87.3 → 100% |
| `spiral` | spirals (2 turns) | [sin(ωr − θ), cos(ωr − θ)] | spiral ramp | plane; the data lies on the unit circle | 64.3 → 100% |

Datasets, Φ and their parameters match the Feature Transform Gallery's exhibits:
- 200 training and 400 test points, seed 705;
- λ = 1e-3, Newton on standardized features.

Every Φ has exactly two features, so feature space can be drawn as it is. The
heights use the fitted weights divided by the largest |wⱼ|. That changes the scale
but not the sign of any score, so it changes no prediction.

**Color theme:** same as the other labs. Change the theme stylesheet link in
`index.html`, or preview one with `?theme=brand`.

## Code map

| File | Responsibility |
|---|---|
| `js/cases.js` | **The six cases**: dataset, Φ, axis names, Φ written in x, text, definitions, what was chosen by hand |
| `js/build.js` | Pure geometry: `fitCase` (fit, sheet, floors, height range), `scores`, `frame` (the x → z slide), `boundary`, `plane`, `zeroDirection` |
| `js/plot3d.js` | `ScorePlot3D`: one Plotly 3-D view of the score over either floor; camera presets; lazy Plotly loader |
| `js/app.js` | Page, case switching, weights, equations, hover readout, cameras, keys, theme |
| `js/rng.js`, `datasets.js`, `features.js`, `model.js`, `fit.js`, `geometry.js`, `plot2d.js`, `ui.js` | The engine, copied unchanged from `feature-transform-gallery` |

### Add a case

Add an entry to `CASES` in `js/cases.js`. Copy a similar one and give it:
- `ds` and `params`
- `features`, which must produce exactly two columns
- `phi`, `where` and `xTerms` (TeX)
- `zAxis` (plain-text axis names)
- `boundary`
- `lead`, `defs` and optionally `chosen`
- `collapse: true` if Φ squeezes the plane onto a curve

Then add a test in `js/tests/still.test.js` for any claim the `lead` makes.

## Tests

With the server running:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# engine math, the geometry, and every claim in the text, checked against real fits
"$CHROME" --headless=new --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
# end to end (needs WebGL, hence SwiftShader): every case, sliders, Apply Φ, hover, cameras, phone, theme
"$CHROME" --headless=new --enable-unsafe-swiftshader --virtual-time-budget=900000 --window-size=1500,1000 \
  --dump-dom http://localhost:8000/smoke.html | grep -E "PASS|FAIL"
```

**`tests.html`** checks, for every case:
- every height is the model's score, and it is the same over both floors;
- over z the sheet is exactly a plane, and over x it is not (except for Φ = identity);
- the boundary's Φ-image lies on the plane's zero line;
- the slide moves only the floor;
- the fit beats the raw features on new data;
- the shapes the text names (dome, saddle, ridge with two circles, unit circle).

**`smoke.html?shot=<case>`** stops on a case for a screenshot. Options:
- `&t=0..1` (the feature view's floor)
- `&cam=oblique|top|side|edge`
- `&w0=`, `&w1=`, `&w2=`
- `&hover=<i>`
- `&zero=0`
- `&mode=dark`
- `&theme=brand`
- `&sim=deutan|protan|gray`
- `&scroll=<px>`
- `&w=<px>`

Run screenshots one at a time; several headless Chromes at once can stall at "running…".

The smoke test reports the theme's contrast shortfalls as warnings: 12 with `classic`
(the ones `classic.css` lists, plus class-1 points on the region shades) and 2 with
`brand`.
