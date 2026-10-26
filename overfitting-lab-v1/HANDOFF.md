# Overfitting Lab: Project Handoff

## 1. Goal

A follow-up to the Feature Transform Gallery (`../feature-transform-gallery/`) for IDS 705. The
gallery's message is that a linear model goes a long way with the right representation. This lab
shows the pitfall: with noise, flexible representations fit the noise, and adding inputs makes it
worse in ways 2-D intuition does not predict.

Constraints set by Kyle:
- **No regularization**, used or introduced. A later lab covers it; this one only seeds it.
- Seed the later discussions on **regularization** and **representation learning**.
- Guided stations with predict-then-reveal, about 30–40 minutes.
- The only high-dimensional topic is **irrelevant inputs**.

## 2. Run it

```bash
cd exercise-feature-transforms/overfitting-lab
python3 -m http.server 8000   # then open http://localhost:8000
```

Tests are described in `README.md`. `tests.html?suite=calibrate` prints the numbers behind every station.

## 3. Stations and their numbers (seed 705, test set of 2000 new points)

| Station | Setting | Training | New points | Notes |
|---|---|---|---|---|
| 1 Noise gets memorized | circles, 15 % flipped, N = 100 | designed 76 %, degree 10 94 %, RBF 100 % | 84 %, 68 %, 63 % | best possible 85 %; degree 10 memorizes 17 of 22 flips, the designed features none |
| 2 The complexity dial | degree 1–10, mean of 5 sets | degree 10: 96 % | degree 2: 82 % (best); degree 10: 71 % | gap at degree 10: 33 points (N = 40) → 8 points (N = 400) |
| 3 Another training set | 8 sets of N = 100 | | one degree-10 fit 70 %; vote 84 % | disagreement 40 % (degree 10) vs. 12 % (designed, mostly in the empty gap) |
| 4 Irrelevant inputs | [x₁², x₂²] + k noise inputs, N = 50, 10 % flipped | 100 % from k = 20 | 90 % (k = 0) → 63 % (k = 100) → 55 % (k = 500) | at k = 100, 85 % of the squared weights sit on noise inputs |

## 4. Key decisions

- **New-point results are locked** until a prediction is locked in. Training results are always visible, which makes the overfitting gap the reveal.
- **Label flips are the noise.** The best possible accuracy is then computed exactly: the generating rule's accuracy on the test set. Position noise (0.12) is fixed and small.
- **Training sets are nested:** each seed has a pool of 800 points, and N = 40 ⊂ 100 ⊂ 400. Flips are nested as the rate rises, and X never changes with the flip rate (all tested). So the curves move smoothly.
- **The exact unpenalized fit is used whenever it exists.** This follows the polynomial lab's `bestFit`. The guard (10⁻⁸) decides only for separable training sets, and each station discloses it when it applies.
- **`DualTrainer`** makes d + 1 > N fits (station 4, up to d = 502 with N = 50) take about 2 ms. It takes exactly the primal Newton steps (tested to 1e-7).
- **Station 4 draws no boundary in the original space.** Each prediction there depends on that point's own noise inputs. "Any two features" with the score on one axis shows the perfect training split instead.

## 5. Instructor note (not in the student text)

The guard matters for the next lab. Even 10⁻⁸ changes degree 10's accuracy on new points: 68.1 % at
10⁻⁸ vs. 64.5 % at 10⁻¹⁰. The gallery's 10⁻³ hides much of the effect, and the polynomial lab's 10⁻⁵
some of it. "Even a tiny penalty changes the answer" is a natural opener for regularization, and
the wrap-up's lever 3 ("make large weights cost something") points there. Degree 10's largest
standardized weight is about 680, against about 1.3 for the designed features.

## 6. Possible next steps

- A station on position noise (jitter), where the best possible accuracy is not simply 1 − flip rate.
- An honest model-selection station (a validation split), answering the wrap-up's "how would you choose k honestly?".
- A `brand` theme default, which passes every contrast check. The classic theme has known shortfalls, reported as warnings.
