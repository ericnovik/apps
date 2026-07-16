# Geometry of Least Squares — Design Proposal

## 1. Product idea

An interactive visual explanation of ordinary least squares for exactly three observations.

The central idea is to show the **same problem in two synchronized spaces**:

1. **Data space:** three points and their least-squares line.
2. **Observation space:** the response vector $y\in\mathbb R^3$ projected onto the model space $\mathcal C(X)$.

Every object should keep the same color, name, and role in both spaces. Moving one data point changes one coordinate of $y$, then immediately updates the fitted vector, residual, coefficients, equations, and distances.

The app should feel like a visual proof—not a dashboard or a general-purpose regression tool.

---

## 2. Learning goals

By the end of the experience, a learner should understand that:

- The coefficient vector $\hat\beta\in\mathbb R^2$ and fitted vector $\hat y=X\hat\beta\in\mathbb R^3$ are different objects.
- The set of all possible fitted vectors is the column space $\mathcal C(X)$, a plane in $\mathbb R^3$ when $X$ has rank two.
- Least squares chooses the point $\hat y\in\mathcal C(X)$ closest to $y$.
- The residual $r=y-\hat y$ is perpendicular to the entire model space.
- Orthogonality gives the normal equations $X^\top(y-X\hat\beta)=0$.
- Any other model vector $X\beta$ is farther from $y$, as shown by the Pythagorean identity.
- If $X$ is rank deficient, the fitted vector remains unique even though its coefficient representation need not be.

---

## 3. Core mathematical model

Use three observations and a line with an intercept:

$$
X=
\begin{bmatrix}
1 & x_1\\
1 & x_2\\
1 & x_3
\end{bmatrix},
\qquad
y=
\begin{bmatrix}
y_1\\y_2\\y_3
\end{bmatrix},
\qquad
\beta=
\begin{bmatrix}
\beta_0\\\beta_1
\end{bmatrix}.
$$

The two columns of $X$ are vectors in $\mathbb R^3$:

$$
\mathbf 1=(1,1,1)^\top,
\qquad
x=(x_1,x_2,x_3)^\top.
$$

Their span is the model space:

$$
\mathcal C(X)=\operatorname{span}\{\mathbf 1,x\}.
$$

The fitted vector and residual are:

$$
\hat y=X\hat\beta,
\qquad
r=y-\hat y.
$$

For full-rank $X$:

$$
\hat\beta=(X^\top X)^{-1}X^\top y.
$$

The implementation should ultimately use a pseudoinverse or numerically stable equivalent so the same conceptual model also supports the rank-deficient case:

$$
\hat\beta=X^+y,
\qquad
\hat y=XX^+y.
$$

### Mathematical invariants the design must preserve

- $\hat y\in\mathcal C(X)$.
- $r\perp\mathcal C(X)$.
- $X^\top r=0$.
- The 3D scene must use equal geometric scaling on all axes so a right angle is visually honest.
- Rounded labels must not imply that approximate numerical values are exact.

---

## 4. Experience structure

Use a five-step guided sequence. The entire workspace remains visible, but each step emphasizes only the objects needed for the current idea.

### Step 1 — Three observations become one vector

**Message:** The vertical values of three plotted points form one point $y=(y_1,y_2,y_3)$ in $\mathbb R^3$.

**Visual emphasis:**

- Three draggable observations in the data-space plot.
- The blue vector $y$ in observation space.
- A subtle coordinate correspondence: point 1 ↔ $y_1$, point 2 ↔ $y_2$, point 3 ↔ $y_3$.

**Interaction:** Drag a point vertically. Its matching coordinate in the 3D vector should pulse.

### Step 2 — All possible lines form a plane

**Message:** Every coefficient pair $(\beta_0,\beta_1)$ produces a fitted vector $X\beta$. Those vectors fill $\mathcal C(X)$.

**Visual emphasis:**

- The plane $\mathcal C(X)$.
- The two generating directions $\mathbf 1$ and $x$.
- A coefficient-space inset showing $(\beta_0,\beta_1)$ mapping to a point on the plane.

**Interaction:** Move $\beta_0$ and $\beta_1$. The candidate line in data space and candidate vector on the plane move together.

### Step 3 — Least squares is the closest point

**Message:** The fitted vector $\hat y$ is the point on the model plane closest to $y$.

**Visual emphasis:**

- The green projection $\hat y$.
- The coral residual $r=y-\hat y$.
- The least-squares line in the data-space plot.
- Three residual segments in the data-space plot.

**Interaction:** A short “drop projection” animation can move from $y$ to $\hat y$, then remain static for study.

### Step 4 — Orthogonality and the normal equations

**Message:** At the closest point, the residual is perpendicular to every direction available inside the model space.

**Visual emphasis:**

- A right-angle marker where $r$ meets the plane.
- The inner products with both columns of $X$:

$$
\mathbf 1^\top r=0,
\qquad
x^\top r=0.
$$

- Their compact matrix form:

$$
X^\top(y-X\hat\beta)=0.
$$

- The equivalent normal equations:

$$
X^\top X\hat\beta=X^\top y.
$$

**Interaction:** Hovering over either normal equation highlights the matching basis vector in the plane.

### Step 5 — Why every other fit is worse

**Message:** Perturbing the optimum by any $h$ moves the fitted vector within the model space by $Xh$. That movement is perpendicular to the residual.

**Visual emphasis:**

- An amber candidate point $X\beta$, where $\beta=\hat\beta+h$.
- The right triangle with sides:
  - $r=y-\hat y$,
  - $X\beta-\hat y=Xh$,
  - $y-X\beta$.
- The live identity:

$$
\|y-X\beta\|^2
=
\|y-X\hat\beta\|^2
+
\|X\beta-X\hat\beta\|^2.
$$

**Interaction:** Drag the candidate point inside the plane or adjust $h_0,h_1$. The three squared lengths update as labeled areas or bars.

---

## 5. Proposed screen layout

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ GEOMETRY OF LEAST SQUARES         ŷ = proj C(X)(y)       Reset   Examples  │
├───────────────┬───────────────────────────────────────┬──────────────────────┤
│ Guided story  │ Observation space R³                  │ Live mathematics     │
│               │                                       │                      │
│ 1  Data       │        y •                            │ X = […]              │
│ 2  Model      │          │ r                           │ y = […]              │
│ 3  Projection │      ┌── ŷ ───┐  C(X)                │ β̂ = […]             │
│ 4  Normal eq. │     /           /                      │ Xᵀr = […]            │
│ 5  Pythagoras │    └───────────┘                       │ SSE = …              │
│               │                                       │                      │
│ Step text     │ Drag to orbit                          │ Current derivation   │
├───────────────┴───────────────────────────────────────┴──────────────────────┤
│ Data space: three draggable points, fitted line, candidate line, residuals  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile

Stack in conceptual order rather than desktop-column order:

1. Step title and explanation.
2. Data-space plot.
3. Observation-space scene.
4. Live equation card.
5. Step navigation.

This order starts with the familiar line-fitting problem before introducing the abstract geometry.

---

## 6. Main views

### A. Data-space plot

A clean 2D plot of $(x_i,y_i)$ for $i=1,2,3$.

It should show:

- Three large draggable points labeled 1, 2, and 3.
- The least-squares line in green.
- Vertical residual segments in coral.
- An optional candidate line in amber during the Pythagorean step.
- Small fitted points $(x_i,\hat y_i)$ to distinguish the continuous line from the fitted vector at the observed design points.

Dragging should initially be restricted to the vertical direction. This keeps $X$ and therefore $\mathcal C(X)$ fixed while $y$ moves. Editing $x$ can be introduced later as an advanced mode because changing $x$ changes the model space itself.

### B. Observation-space scene

A rotatable 3D scene with equal axis scaling.

It should contain:

- Coordinate axes $y_1,y_2,y_3$.
- The model plane $\mathcal C(X)$, drawn as a translucent surface with a sparse grid.
- Basis arrows $\mathbf 1$ and $x$.
- The data vector $y$.
- The fitted vector $\hat y$.
- The residual from $\hat y$ to $y$.
- A right-angle marker.
- The candidate vector $X\beta$ in Step 5.

The camera should orbit but not allow unequal zooming or axis deformation. A “canonical view” button should restore the clearest angle.

### C. Live mathematics panel

The panel should reveal rather than merely report calculations. Organize it into a vertical chain:

1. **Inputs:** $X$ and $y$.
2. **Coefficients:** $\hat\beta$.
3. **Fitted vector:** $\hat y=X\hat\beta$.
4. **Residual:** $r=y-\hat y$.
5. **Orthogonality check:** $X^\top r\approx 0$.
6. **Squared distances:** optimum, perturbation, and candidate total.

Only the row relevant to the current lesson step should be strongly emphasized. Other rows remain available but visually quiet.

---

## 7. Visual language

Use a warm, editorial visual style: precise enough for mathematics, but less clinical than a numerical analysis package.

### Palette

| Object | Color | Meaning |
|---|---|---|
| $y$ / observed points | Deep blue | Given data |
| $\hat y$ / fitted line | Emerald green | Optimal projection |
| $r$ / residuals | Coral red | Unexplained component |
| $X\beta$ / candidate | Amber | Alternative model |
| $\mathcal C(X)$ | Pale teal | Model space |
| Axes and construction lines | Slate | Reference geometry |
| Background | Warm off-white | Reading surface |

Suggested starting values:

- Ink: `#172033`
- Blue: `#315EFB`
- Green: `#159A7D`
- Coral: `#E76551`
- Amber: `#D89524`
- Plane: `#BFE3DC`
- Paper: `#F7F4ED`

### Typography

- A restrained sans serif for controls and explanations.
- A math-oriented serif or KaTeX for equations.
- Use upright labels for named objects and italic mathematical symbols where appropriate.
- Numerical values should use tabular figures to prevent layout shifts while dragging.

### Motion

Motion should explain causality:

- Dragging a data point moves the matching coordinate of $y$.
- Releasing it lets the projection and line settle in a short, direct transition.
- Switching steps fades irrelevant construction lines rather than rebuilding the scene.
- Avoid continuous ambient animation; the geometry should remain inspectable.

---

## 8. Interaction details

### Direct manipulation

- Drag any observed point vertically.
- Drag the 3D background to orbit the scene.
- In Step 5, drag the candidate point while constraining it to $\mathcal C(X)$.
- Provide sliders or numeric controls as accessible alternatives to every drag interaction.

### Coordinated highlighting

Hovering or focusing an object should highlight all its representations:

| Focused object | Coordinated highlights |
|---|---|
| Observation $i$ | Data point, coordinate axis $y_i$, matrix row $i$ |
| $y$ | Three observations and blue vector |
| $\hat y$ | Fitted points, fitted line, green vector |
| $r$ | Residual segments, coral vector, $X^\top r$ |
| $\mathbf 1$ | First column of $X$, plane direction, intercept coefficient |
| $x$ | Second column of $X$, plane direction, slope coefficient |

### Example presets

1. **Clear projection:** visibly nonzero residuals.
2. **Perfect fit:** $r=0$, with text explaining that the residual direction is undefined because its length is zero.
3. **One outlier:** emphasizes squared-error sensitivity.
4. **Centered design:** $x=(-1,0,1)$, making $\mathbf 1\perp x$.
5. **Rank deficient:** $x=(1,1,1)$, collapsing the model plane to a line.

---

## 9. Rank-deficient mode

This should be a deliberate final concept, not an error state.

For $x=(1,1,1)$:

$$
\mathcal C(X)=\operatorname{span}\{(1,1,1)^\top\}.
$$

The visual plane collapses to a line. The fitted vector is still unique:

$$
\hat y=\bar y\,\mathbf 1.
$$

But the coefficients are not unique. All pairs satisfying

$$
\beta_0+\beta_1=\bar y
$$

produce the same fitted values at the observed design points.

The design should show this in three coordinated ways:

- In observation space, multiple coefficient choices land on the same $\hat y$.
- In coefficient space, the valid coefficients form a line.
- In data space, several different regression lines pass through the same fitted value at $x=1$, clarifying that predictions away from the observed design point are not unique.

If one representative coefficient vector is displayed, label it explicitly as the **minimum-norm representative**, not “the unique solution.”

---

## 10. Pythagorean identity presentation

The identity should appear as geometry first and algebra second.

### Geometric construction

For $\beta=\hat\beta+h$:

- Residual side: $r=y-\hat y$.
- In-plane side: $Xh=X\beta-\hat y$.
- Hypotenuse: $y-X\beta$.

Because $r\perp Xh$:

$$
\|y-X\beta\|^2
=
\|r\|^2+
\|Xh\|^2.
$$

### Numerical presentation

Below the equation, use three proportional bars or square tiles:

```text
candidate error²     =     minimum error²     +     extra in-plane distance²
      8.42                         3.17                         5.25
██████████████              ███████                   █████████
```

The display should identify the candidate as worse by exactly the nonnegative extra term—not merely state that its error is larger.

---

## 11. Content tone

Use short, declarative explanations beside the visual rather than long paragraphs.

Preferred:

> A line produces three fitted values. In $\mathbb R^3$, those values are one point on the model plane.

Avoid:

> The coefficient vector is transformed by the design matrix in order to produce a corresponding element in the column space.

Terms such as “column space,” “normal equations,” and “rank deficient” should still appear, but only after the visual object has been introduced in plain language.

---

## 12. Accessibility requirements

- Every drag interaction must have keyboard and numeric-input alternatives.
- Do not distinguish vectors by color alone; also use line style, labels, and endpoint shapes.
- Keep equations readable at 200% zoom.
- Provide a reduced-motion mode.
- The 3D scene needs a text summary of current vectors and orthogonality values.
- Use an accessible data table for $(x_i,y_i,\hat y_i,r_i)$.
- Announce meaningful updates after keyboard interactions without announcing every animation frame.

---

## 13. Scope boundaries

### First version

- Exactly three observations.
- Intercept and one predictor.
- Vertical dragging of $y_i$.
- Linked data-space and observation-space views.
- Normal equations and Pythagorean identity.
- Full-rank and rank-deficient presets.

### Explicitly deferred

- More than three observations.
- Multiple predictors.
- Weighted least squares.
- Statistical inference, standard errors, and confidence intervals.
- Optimization algorithms such as gradient descent.
- Arbitrary user-imported datasets.

These topics are valuable, but they dilute the geometric argument of the first experience.

---

## 14. Success criteria

The design is successful if a learner can answer these questions after using it:

1. Where does $\hat y$ live, and where does $\hat\beta$ live?
2. Why is least squares a projection?
3. Why does $X^\top r=0$?
4. Why must every other fitted vector have at least as much squared error?
5. What remains unique when the columns of $X$ are dependent?

The app should make each answer visible before presenting it symbolically.

---

## 15. Implementation architecture

Use a hybrid rendering architecture, with each view consuming one shared, immutable model result containing $X$, $y$, $\hat\beta$, $\hat y$, $r$, candidate-fit values, norms, and rank information. State changes trigger one model computation, then the 3D scene, data plot, mathematical panel, and lesson UI render from that same result so their values cannot drift apart.

- **Observation space:** use Three.js/WebGL with an `OrthographicCamera`, `OrbitControls`, `CSS2DRenderer` for readable labels, and raycasting for pointer interaction. Keep equal world-unit scaling on every axis.
- **Linked 2D views:** use D3 with SVG for the data plot and for an exact Pythagorean diagram constructed from computed lengths. Screen projection does not preserve every 3D angle, so apparent canvas angles must not be treated as proof of orthogonality; establish the relationship from model-space calculations and the exact SVG construction.
- **Mathematics:** render equations with KaTeX, using the same unrounded model values as the visualizations and clearly labeling rounded display values.
- **Application code:** use vanilla JavaScript modules, not React. Begin with a small custom pure linear-algebra module tailored to the fixed $3\times2$ problem; defer `ml-matrix` and SVD until arbitrary matrix sizes are supported.
- **Suggested split:** `index.html`, CSS, `app.js` for initialization and render coordination, `state.js` for interaction state, `model.js` for pure calculations, `scene-3d.js`, `data-plot.js`, `math-panel.js`, and `lesson.js`.
- **Deployment:** use native ESM and exact pinned CDN versions for Three.js, D3, and KaTeX, preserving a no-build deployment compatible with GitHub Pages.

Because WebGL canvas content is not inherently exposed to assistive technology, every 3D interaction and result must have keyboard-operable controls plus equivalent semantic text, equations, and tabular values outside the canvas. Raycast-only interactions require labeled controls, focus states, and numeric alternatives; updates should be announced at meaningful interaction boundaries rather than on every frame.
