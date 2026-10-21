# Candidate Feature Transforms for 2-D Classification

**One idea ties the list together.** A linear classifier on transformed features φ(x₁, x₂) draws its boundary where w·φ(x) + b = 0. That boundary is a flat plane in feature space, but in the original (x₁, x₂) plane it can be any curve in the family that φ allows. Each transform below is defined by the family of shapes it can produce.

---

## 1. Baseline (the control case)

| Transform φ(x₁,x₂) | Boundary shape | Teaching hook |
|---|---|---|
| [x₁, x₂] | Straight line | Can only use a straight line, so it fails on circles, XOR and moons. |
| Linear mixes, e.g. [x₁+x₂, x₁−x₂], rotation, standardization | Still a straight line | **Linear transforms add no expressive power.** Rotating or rescaling the features gives the same set of possible lines. Scaling still matters for regularization and optimization, though. |

## 2. Polynomial transforms (the centerpiece)

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| [x₁, x₁², x₂] | Parabola, x₂ = ax₁² + bx₁ + c | Curving just one variable is enough to bend the line. |
| [x₁², x₂²] (squares only) | Ellipse or hyperbola centered at the origin; a circle when the weights are equal | Works on concentric circles, but only if they're centered at (0,0). |
| [x₁x₂] (interaction only) | Hyperbola whose asymptotes are the axes | **Solves XOR exactly**, since the sign of x₁x₂ gives the quadrant. |
| Full degree 2: [x₁, x₂, x₁², x₂², x₁x₂] | **Any conic**: line, parabola, ellipse, circle, hyperbola or a pair of lines, at any center and rotation | One transform gives many shapes depending on the learned weights. Also, the lower-order terms let the center move, because (x₁−a)² expands into x₁², x₁ and a constant. |
| Degree 3 | S-curves, cubics, boundaries with several separate pieces, e.g. x₂ = x₁³ − x₁ | Fits "moons" well. |
| Degree 5–10+ | Very wiggly curves that form islands | **Overfitting.** Number of features grows as (d+1)(d+2)/2; good place to add a regularization slider. |

## 3. Radial and polar transforms

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| r = √(x₁²+x₂²) | Circle | One well-chosen feature can beat a pile of polynomial terms. |
| [r, r²] or \|r − c\| | Annulus (ring), two concentric circles | Separates a ring class from a center plus outer class. |
| θ = atan2(x₂, x₁) | Rays from the origin (wedges, pie slices) | |
| [sin kθ, cos kθ] | Star or flower shape with k petals | |
| [r, sin kθ, cos kθ] | Wavy circle or blob, r = c + a·sin(kθ + φ) | |
| [sin(ωr − θ), cos(ωr − θ)] | **Spiral** | Makes the two-spirals dataset separable, which is the strongest "right transform" moment. |
| Shifted center: r measured from (a, b) | Circle away from the origin | Shows that hand-built features **encode assumptions**, here where the center is. |

## 4. Periodic (Fourier) transforms

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| [sin ωx₁] | Parallel bands or stripes | |
| [sin ωx₁, cos ωx₁] | Stripes at any phase | You need both sin and cos to shift the phase, the same lesson as the lower-order polynomial terms. |
| [sin ωx₁, x₂] | Sine-wave boundary, x₂ = a·sin(ωx₁) + c | |
| [sin ωx₁ · sin ωx₂] | **Checkerboard** | A product of two waves. |
| Random Fourier features [cos(wᵢ·x + bᵢ)], i = 1..D | Smooth arbitrary shapes; D and the scale of w set smoothness | Approximates an RBF-kernel SVM, a link to kernels. |

## 5. Local "bump" features (RBF)

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| exp(−γ‖x − c‖²) at one landmark c | Circle around c | |
| Several landmarks c₁…c_m (on a grid, at random, or at the data points) | Blobs, islands, arbitrary regions | γ controls smoothness: large γ gives tiny islands (overfit), small γ gives near-linear (underfit). Using every data point as a landmark is basically a kernel SVM. Students could drag landmarks around. |

## 6. Piecewise transforms (a bridge to trees and neural nets)

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| Binning / one-hot of x₁ and x₂ | Axis-aligned staircase | Looks like a decision tree. |
| Hinge features max(0, x₁ − t) at several knots | Piecewise-linear curve (a spline) | |
| Random ReLU features max(0, wᵢ·x + bᵢ) | Polygonal, piecewise-linear regions | **This is a one-hidden-layer neural net with frozen first layer.** Leads to "what if we learned φ?" |
| Indicator 1[x₁ > t]·1[x₂ > s] | Corner / quadrant | |

## 7. Norm, min/max and absolute-value transforms

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| \|x₁\| | Band \|x₁\| < c (two parallel lines) | |
| \|x₁\| + \|x₂\| | Diamond (L1 ball) | Compare circle (L2), diamond (L1) and square (L∞). This ties into regularization geometry later. |
| max(\|x₁\|, \|x₂\|) | Square (L∞ ball) | |
| min(x₁, x₂) or max(x₁, x₂) | L-shaped corner | |

## 8. Monotone and ratio transforms (closest to real-world practice)

| Transform | Boundary shape | Teaching hook |
|---|---|---|
| [log x₁, x₂] | Logarithmic curve, x₂ = a·log x₁ + c | Matches what practitioners actually do with skewed data like income or population. |
| [log x₁, log x₂] | Power law, x₂ = k·x₁ᵖ | |
| [exp x₁] or sigmoid(x₁) | Exponential or saturating curve | |
| x₂ / x₁ (ratio) | Line through the origin, i.e. a wedge | Domain-made features like "price per sq ft" or BMI. |

---

## Matching datasets to transforms

| Dataset | Transforms that crack it |
|---|---|
| Linearly separable blobs | Raw features already work. A useful sanity check that transforms aren't always needed. |
| Concentric circles | r; [x₁², x₂²]; full quadratic; RBF |
| Ring vs. center + outside | [r, r²]; RBF |
| XOR quadrants | x₁x₂; full quadratic |
| Moons | Degree-3 polynomial; RBF; ReLU features |
| Two spirals | Spiral polar features; many RBFs; random Fourier features |
| Checkerboard | sin ωx₁ · sin ωx₂; dense RBFs |
| Sine-wave boundary | [sin ωx₁, cos ωx₁, x₂] |
| Diamond or square region | \|x₁\| + \|x₂\|; max(\|x₁\|, \|x₂\|) |
| Off-center circle | Fails with pure r, works with full quadratic |

## Suggested shortlist for the first lab

1. **Raw vs. full quadratic**, with sliders for the 6 weights so students can make every conic by hand.
2. **A 3-D "lift" view**: plot points at (x₁, x₂, x₁² + x₂²), show a flat plane cutting the paraboloid, then show its projection back to 2-D becoming a circle. This is the most effective visual for the core point.
3. **Polynomial degree slider** (1 to ~10), with a regularization slider to show overfitting.
4. **Choose-your-features challenge**: a set of datasets, each with a tickbox palette of features from families 2–7, where students try to get the fewest features and highest accuracy.
5. **Closing step: RBF or ReLU features**, to show that a generic transform can learn almost anything, at the cost of interpretability, overfitting risk and number of features. This sets up kernels and neural nets.
