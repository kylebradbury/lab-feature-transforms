# Feature Transform Gallery (IDS 705)

An exhibition, not a lab: 18 exhibits that each pair one dataset with one representation
z = Φ(x). The model is always the same logistic regression. Only its input changes, and
with it the boundary: a circle, a spiral, a wave, a staircase. Students do not need to
learn each transform. The point is that a linear model goes a long way once the data
has a useful representation.

Each exhibit animates the plane from the original space into feature space (**Apply Φ**).
Points, grid lines, shading and the boundary all move together, and the curved boundary
lands on a straight line. Feature space is drawn directly when Φ has one or two features.
With more than two, it is shown edge-on: the horizontal axis is the direction of the
weights, so the boundary is a vertical line.

It is a static site with no build step, like the other labs. KaTeX comes from a CDN, pinned with SRI.

## Run it locally

```bash
cd exercise-feature-transforms/feature-transform-gallery
python3 -m http.server 8000
# open http://localhost:8000
```

## Pages

| Page | What it shows |
|---|---|
| `#` (the hall) | Every exhibit as a live tile. Hover over a tile to apply its Φ; **Apply every Φ** straightens all of them at once. |
| `#<id>`, e.g. `#spiral` | One exhibit: the morph, Φ, the boundary equation in feature space and in x, and test accuracy with the raw features vs. with Φ. Some exhibits have a knob, e.g. the number of turns the spiral feature assumes. |
| `#match` (the finale) | 7 representations × 6 datasets. Each dataset is cracked by its own Φ and not by the others. A generic Φ (49 bumps) does well almost everywhere, but needs 49 features. |

**Designed features:** line, circle, parabola, hyperbola, ring, flower, spiral, wedge, wave,
checkerboard, diamond, corner, power law, islands.

**Generic features:** polynomial (degree 3), RBF bumps, random ReLU hinges, bins.

**Keys on an exhibit:**

| Key | Action |
|---|---|
| Space | Apply Φ / back |
| ← / → | Previous / next exhibit |
| Esc | Back to the hall |
| R | Best straight line (raw features) |
| G | Grid lines |

**Color theme:** same as the Polynomial Features Lab. Change the theme stylesheet link in
`index.html`, or preview one with `?theme=brand`.

## Code map

| File | Responsibility |
|---|---|
| `js/exhibits.js` | **The exhibits**: dataset, Φ, text, optional knob. Also the finale's rows and columns. |
| `js/build.js` | Fits Φ and the raw features (cached), builds the display map, and lays out the mesh, boundary and points in [0, 1] coordinates for both spaces |
| `js/morph.js` | `MorphPlot`: one canvas that draws any point of the original → feature space morph |
| `js/app.js` | Hall, exhibit page, finale, hash routing, keyboard, theme |
| `js/rng.js`, `datasets.js`, `features.js`, `model.js`, `fit.js`, `geometry.js`, `plot2d.js`, `ui.js` | The engine shared with the other labs (copied, with additions noted below) |

Additions to the copied engine:
- `features.js`: `unitdir` (x/‖x‖) and `sinkt` (sin kθ alone)
- `datasets.js`: `islands`, `heart`, and an income-spread parameter for `loans`
- `plot2d.js`: exports `lut`, `niceTicks` and `texLabel`

### Add an exhibit

Add an entry to `EXHIBITS` in `js/exhibits.js`. Copy a similar one and give it:
- `ds` and `params`
- `features(k)`, returning feature specs from `features.js`
- `phi` (TeX)
- `zAxis` (axis names, when there are one or two features)
- the text: `lead`, `how`, `practice`

Then run the tests. They check that every exhibit beats the straight line on new data, and that
its boundary lands on a straight line in feature space.

## Tests

With the server running:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# engine math + every claim in the exhibit text, checked against real fits
"$CHROME" --headless=new --dump-dom http://localhost:8000/tests.html | grep -E "PASS|FAIL"
# end to end: the hall, every exhibit and control, keyboard, the finale, theme
"$CHROME" --headless=new --virtual-time-budget=900000 --window-size=1500,1000 \
  --dump-dom http://localhost:8000/smoke.html | grep -E "PASS|FAIL"
```

`smoke.html?shot=spiral&t=0.5` stops on a page for a screenshot. The parameters are listed
at the top of `js/tests/smoke.js`. The smoke test reports the theme's contrast shortfalls as
warnings: with `classic`, these are the ones listed in `css/themes/classic.css`.
