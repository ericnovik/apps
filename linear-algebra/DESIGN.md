# Geometry of Linear Algebra — Design Proposal

## 1. Recommendation

Build this as a prequel to **Geometry of Least Squares** called:

# Geometry of Linear Algebra

**Subtitle:** Build, cut, project, transform.

The app should not be organized as three disconnected tours of 1D, 2D, and 3D. Its central idea should be:

> An object has an **intrinsic dimension**, and it lives inside an **ambient dimension**.

A line is still one-dimensional whether it is the whole of $\mathbb R^1$, drawn in $\mathbb R^2$, or embedded in $\mathbb R^3$. A plane is two-dimensional whether it is the whole of $\mathbb R^2$ or embedded in $\mathbb R^3$.

From there, the app should present two complementary ways to describe the same geometric object:

1. **Build it from directions:** parametric/span form.
2. **Cut it out with constraints:** implicit/normal form.

Projection, determinant, and eigenvectors then become connected consequences rather than a collection of unrelated linear-algebra topics.

The conceptual finale should be a projection onto a plane in $\mathbb R^3$:

- the plane is built from two directions;
- it is cut out by one normal equation;
- projection removes the normal component;
- the projection matrix has eigenvalue $1$ along the plane and $0$ normal to it;
- its determinant is $0$ because it collapses 3D volume onto a 2D object.

That single construction unifies the whole app and hands the learner directly to the least-squares experience without introducing regression.

---

## 2. Product idea

An interactive visual explanation of points, lines, planes, and transformations in dimensions one through three.

The learner should be able to move continuously among four synchronized descriptions:

1. **Geometric scene:** the object inside $\mathbb R^1$, $\mathbb R^2$, or $\mathbb R^3$.
2. **Parametric description:** an anchor point plus generating directions.
3. **Implicit description:** one or more equations that constrain the coordinates.
4. **Transformation description:** what a matrix does to the object and its surrounding space.

The app should feel like a manipulable concept map, not a matrix calculator. Equations should identify something already visible in the scene.

---

## 3. Language and mathematical precision

The app should distinguish several commonly conflated ideas.

### Point versus vector

A point is a location. A vector is a displacement. Both may be represented by the same coordinate tuple, but their roles differ.

- Point: $p=(p_1,p_2,p_3)$.
- Vector: $v=(v_1,v_2,v_3)$.
- Point translated by vector: $p+v$.

The visual language should use dots for points and arrows for vectors.

### Linear versus affine objects

A linear subspace passes through the origin. An affine flat may be translated away from it.

- Linear line: $\{tv:t\in\mathbb R\}$.
- Affine line: $\{p+tv:t\in\mathbb R\}$.
- Linear plane: $\operatorname{span}\{u,v\}$.
- Affine plane: $p+\operatorname{span}\{u,v\}$.

Use “flat” as the general term only after points, lines, and planes are familiar.

### Space versus volume

A three-dimensional linear subspace of $\mathbb R^3$ is all of $\mathbb R^3$, not a bounded solid. Actual area and volume enter when the determinant measures the parallelogram or parallelepiped spanned by transformed vectors.

### Intrinsic versus ambient dimension

Use:

- $n$ for ambient dimension;
- $k$ for the intrinsic dimension of the object;
- $n-k$ for the number of independent constraints required to cut it out.

The app should repeatedly display the relation:

$$
\text{dimension of object}+\text{number of independent constraints}=\text{ambient dimension}.
$$

---

## 4. Learning goals

By the end of the experience, a learner should understand that:

- A point, line, or plane is classified by its own dimension, not by the size of the space around it.
- Coordinates describe an embedding in an ambient space.
- A line in $\mathbb R^3$ needs one generating direction but two independent scalar constraints.
- A plane in $\mathbb R^3$ needs two independent generating directions or one independent scalar constraint.
- The equation $ax+by+cz=d$ describes a plane because $(a,b,c)$ is normal to every allowed in-plane movement.
- A span gains dimension only when a new independent direction is added.
- Orthogonal projection decomposes a vector into a part inside a subspace and a perpendicular part.
- A determinant is signed area or volume scale, not merely a formula involving matrix entries.
- A zero determinant means that a transformation has collapsed dimension.
- An eigenvector is a direction that a transformation does not turn; its eigenvalue gives the signed scale along that direction.
- Projection matrices provide a concrete example of eigenvalues $1$ and $0$.
- The geometric vocabulary used in least squares—column space, projection, orthogonality, rank, and dimension—does not depend on regression.

---

## 5. The dimension ladder

Use a persistent dimension ladder as the app’s orienting device.

| Intrinsic dimension | In $\mathbb R^1$ | In $\mathbb R^2$ | In $\mathbb R^3$ |
|---|---|---|---|
| 0 | point | point | point |
| 1 | line / all of $\mathbb R^1$ | line | line |
| 2 | — | plane / all of $\mathbb R^2$ | plane |
| 3 | — | — | 3-space / all of $\mathbb R^3$ |

Each valid cell should be selectable. Changing cells should preserve the current concept when possible.

Examples:

- Moving across the “line” row shows the same one-dimensional object embedded in progressively larger spaces.
- Moving down the $\mathbb R^3$ column adds independent directions: point $\to$ line $\to$ plane $\to$ 3-space.
- Impossible cells are visible but inactive, making $k\le n$ concrete.

When ambient dimension changes:

- $\mathbb R^1$: emphasize the $x$-axis; hide or ghost the other axes.
- $\mathbb R^2$: emphasize the $xy$-plane; ghost the $z$-axis.
- $\mathbb R^3$: show the full scene with an orbitable camera.

---

## 6. Core mathematical model

Represent a $k$-dimensional affine flat in $\mathbb R^n$ by an anchor point $p$ and $k$ independent direction vectors collected as columns of $V$:

$$
\mathcal F
=
\{p+Vc:c\in\mathbb R^k\}
=
p+\mathcal C(V).
$$

If the columns of $N$ form a basis for the orthogonal complement of $\mathcal C(V)$, then the same object has the constraint form:

$$
\mathcal F
=
\{x:N^\top(x-p)=0\}
=
\{x:N^\top x=N^\top p\}.
$$

This gives the app’s “build versus cut” duality:

| Build | Cut |
|---|---|
| $k$ independent directions | $n-k$ independent constraints |
| $x=p+Vc$ | $N^\top x=N^\top p$ |
| column space | orthogonal complement / normals |

For a plane in $\mathbb R^3$, $N$ contains one normal vector $n=(a,b,c)$, so:

$$
n^\top x=d
\quad\Longleftrightarrow\quad
ax+by+cz=d.
$$

For projection onto the linear subspace with orthonormal basis $Q$:

$$
\operatorname{proj}_{\mathcal C(Q)}(x)=QQ^\top x.
$$

For an affine flat $p+\mathcal C(Q)$:

$$
\operatorname{proj}_{\mathcal F}(x)
=
p+QQ^\top(x-p).
$$

The orthogonal decomposition is:

$$
x-p
=
QQ^\top(x-p)
+
(I-QQ^\top)(x-p).
$$

For a linear transformation $A:\mathbb R^n\to\mathbb R^n$:

- $|\det A|$ is area scale in $\mathbb R^2$ or volume scale in $\mathbb R^3$;
- the sign of $\det A$ records orientation;
- $\det A=0$ exactly when the transformation collapses dimension;
- $Av=\lambda v$ identifies an eigenvector/eigenvalue pair.

---

## 7. Guided sequence

Use seven chapters. The whole workspace remains recognizable, but each chapter changes the active manipulation and the equation being explained.

### Chapter 1 — Same object, more room

**Message:** Dimension belongs to the object; coordinates tell us what space it occupies.

**Visual emphasis:**

- The dimension ladder.
- A point, then a line, embedded in $\mathbb R^1$, $\mathbb R^2$, and $\mathbb R^3$.
- Active ambient axes and ghosted unused axes.
- A badge reading, for example, “1D object in 3D space.”

**Interaction:**

Select cells in the dimension ladder. Drag a line’s anchor point in $\mathbb R^3$ without changing the line’s intrinsic dimension.

**Key insight:**

A line does not become three-dimensional merely because its points require three coordinates.

### Chapter 2 — Build with directions

**Message:** An independent direction adds one degree of freedom.

**Visual emphasis:**

- Anchor point $p$.
- Direction arrows $v_1,v_2,v_3$.
- Coefficient controls $c_1,c_2,c_3$.
- The generated point $p+Vc$ moving on the current flat.
- A live rank and dimension indicator.

**Interaction:**

- Drag coefficients to move along a line, across a plane, or through 3-space.
- Rotate a generating direction.
- Add a second direction to turn a line into a plane.
- Move the second direction until it becomes parallel to the first and watch the plane collapse back to a line.

**Live mathematics:**

$$
x=p+c_1v_1+c_2v_2
$$

followed by:

$$
x=p+Vc,
\qquad
\dim(\mathcal F)=\operatorname{rank}(V).
$$

**Key insight:**

More vectors do not necessarily mean more dimensions; only independent vectors do.

### Chapter 3 — Cut with equations

**Message:** One independent scalar equation removes one degree of freedom.

This chapter should directly answer how a plane equation is embedded in 3D.

**Visual emphasis:**

- The normal vector $n=(a,b,c)$.
- A translucent plane perpendicular to $n$.
- A stack of parallel level-set planes $n^\top x=d$ for several values of $d$.
- A trace from coordinate coefficients $(a,b,c,d)$ to the visible normal and offset.

**Interaction:**

- Drag the tip of $n$ to rotate the plane.
- Drag $d$ to slide the plane parallel to itself.
- Toggle the same one-equation pattern across ambient dimensions:

$$
\begin{aligned}
ax&=d &&\text{cuts a point from }\mathbb R^1,\\
ax+by&=d &&\text{cuts a line from }\mathbb R^2,\\
ax+by+cz&=d &&\text{cuts a plane from }\mathbb R^3.
\end{aligned}
$$

- In $\mathbb R^3$, add constraints one at a time:

$$
\text{3-space}\xrightarrow{1\text{ equation}}\text{plane}
\xrightarrow{2}\text{line}
\xrightarrow{3}\text{point}.
$$

**Key insight:**

The coefficients of a plane equation are not arbitrary labels. They form a vector perpendicular to every movement that remains in the plane.

### Chapter 4 — Drop a perpendicular

**Message:** Projection chooses the nearest point by removing the perpendicular component.

**Visual emphasis:**

- A draggable query point $x$.
- Its projection $\hat x$ onto a selected line or plane.
- The parallel and perpendicular components.
- A right-angle marker.
- A live distance readout.

**Interaction:**

- Drag $x$ freely and watch $\hat x$ remain constrained to the target.
- Switch the target among an axis, a line in $\mathbb R^2$, a line in $\mathbb R^3$, and a plane in $\mathbb R^3$.
- Toggle between the basis and normal calculations.

**Basis form:**

$$
\hat x=p+QQ^\top(x-p).
$$

**Normal form for a plane:**

$$
\hat x
=
x-
\frac{n^\top x-d}{n^\top n}n.
$$

**Key insight:**

The projected point is the same whether the target is described by directions or by constraints.

No regression language should appear in this chapter.

### Chapter 5 — Area, volume, and collapse

**Message:** A determinant measures how a linear transformation scales oriented area or volume.

**Visual emphasis:**

- A unit square in $\mathbb R^2$ and unit cube in $\mathbb R^3$.
- Basis vectors before and after applying $A$.
- The transformed parallelogram or parallelepiped.
- Numeric area/volume and orientation indicators.

**Interaction:**

Use curated transformations before allowing arbitrary entries:

1. Uniform and nonuniform scale.
2. Shear.
3. Rotation.
4. Reflection.
5. Dimension collapse.

Animate the transformation from $I$ to $A$ and scrub it with a timeline.

**Live mathematics:**

$$
\text{new signed area/volume}
=
\det(A)\cdot\text{old signed area/volume}.
$$

When $\det(A)=0$, show the square collapse to a line or the cube collapse to a plane. Coordinate this with the rank/dimension indicator.

**Key insight:**

A zero determinant means lost dimension, not merely “the matrix has no inverse.”

### Chapter 6 — Directions a transformation preserves

**Message:** Most directions turn. Eigenvectors stay on their own line.

The primary eigenvector lab should be in $\mathbb R^2$, where the geometry and equation can remain readable. Selected symmetric examples may extend to $\mathbb R^3$.

**Visual emphasis:**

- A field or fan of direction arrows before and after applying $A$.
- Eigenlines highlighted while ordinary vectors visibly turn away from their original lines.
- Signed eigenvalue controls/readouts.
- Before/after unit circle, becoming an ellipse for symmetric transformations.

**Interaction:**

- Drag a test vector around the unit circle and compare $v$ with $Av$.
- Snap to an eigenline when $Av$ becomes parallel to $v$.
- Explore presets for positive stretch, negative stretch/reflection, repeated eigenvalue, shear, and rotation.
- Include a rotation preset with no real eigenvector, explicitly showing that not every real matrix has a real eigenline.

**Live mathematics:**

$$
Av=\lambda v.
$$

For symmetric matrices, emphasize orthogonal eigendirections. In the 2D real-eigenvalue presets, connect determinant to the product of directional scales:

$$
\det(A)=\lambda_1\lambda_2.
$$

**Key insight:**

An eigenvector is a direction preserved by the transformation, not a point left fixed. It may stretch, shrink, reverse, or collapse.

### Chapter 7 — Projection is a transformation

**Message:** Projection unifies dimension, constraints, determinants, and eigenvectors.

Use orthogonal projection from $\mathbb R^3$ onto a plane as the capstone.

**Visual emphasis:**

- A cloud of points and a small cube being projected onto a plane.
- The cube flattening into a parallelogram.
- Two independent in-plane directions.
- The plane normal.
- Eigenvalue labels $1,1,0$ attached to those directions.

**Live mathematics:**

For an orthonormal plane basis $Q$:

$$
P=QQ^\top.
$$

Then:

$$
Pv=v\quad\text{for }v\text{ in the plane},
$$

and:

$$
Pn=0\quad\text{for }n\text{ normal to the plane}.
$$

Therefore:

$$
\operatorname{rank}(P)=2,
\qquad
\det(P)=0,
\qquad
\text{eigenvalues}(P)=\{1,1,0\}.
$$

Also show:

$$
P^2=P,
\qquad
P^\top=P.
$$

Label these as “projecting twice changes nothing” and “orthogonal projection,” respectively, before introducing the formal terms idempotent and symmetric.

**Handoff:**

End with a link to **Geometry of Least Squares**:

> In the next app, three measurements form a point in $\mathbb R^3$, possible fitted values form a plane, and least squares performs exactly this projection.

---

## 8. Proposed screen layout

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ GEOMETRY OF LINEAR ALGEBRA         Build · Cut · Project · Transform         │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1 Dimension  2 Span  3 Equations  4 Projection  5 Determinant  6 Eigen  7 P │
├─────────────────┬───────────────────────────────────┬────────────────────────┤
│ Guided idea     │ Geometric scene                   │ Same object, live math │
│                 │                                   │                        │
│ Step message    │      orbitable ℝ¹ / ℝ² / ℝ³       │ Ambient: n = 3         │
│                 │                                   │ Object: k = 2          │
│ Dimension       │      point / line / plane         │ Constraints: n-k = 1   │
│ ladder          │                                   │                        │
│                 │      vectors and construction     │ x = p + Vc             │
│ Active controls │                                   │ Nᵀx = Nᵀp              │
│                 │                                   │ rank / det / eigen     │
├─────────────────┴───────────────────────────────────┴────────────────────────┤
│ Presets / timeline / keyboard controls / accessible scene summary           │
└──────────────────────────────────────────────────────────────────────────────┘
```

The scene should be the dominant surface. The right panel should reveal equivalent representations, not become a dense dashboard.

### Mobile

Stack in this order:

1. Chapter message and navigation.
2. Geometric scene.
3. Active manipulation controls.
4. Dimension ladder.
5. Live mathematics.
6. Presets and textual scene summary.

Use a canonical camera button in 3D and fixed canonical views in 1D/2D.

---

## 9. Interaction system

### Coordinated highlighting

| Focused object | Coordinated highlights |
|---|---|
| Anchor point $p$ | Point in scene and constant term in parametric form |
| Direction $v_i$ | Arrow, column of $V$, and coefficient $c_i$ |
| Normal $n_i$ | Normal arrow, row/column of $N^\top$, and matching constraint |
| Projected point $\hat x$ | Point, parallel component, and projection formula |
| Perpendicular component | Right-angle marker, normal space, and distance |
| Transformed basis vector | Matrix column and edge of area/volume element |
| Eigenvector $v$ | Eigenline and equation $Av=\lambda v$ |
| Determinant | Area/volume element, orientation, and rank warning |

### Direct manipulation

- Drag points and vector tips in the scene.
- Provide sliders and numeric fields for every drag operation.
- Constrain coefficient dragging to sensible ranges without changing the underlying mathematics.
- Snap only when it teaches a concept, such as near dependence or an eigenline; never silently alter input.
- Pause calculations while the camera orbits only if needed for performance, not as a visible state change.

### Representation toggle

A persistent segmented control should switch among:

- **Geometry**
- **Build**
- **Cut**
- **Matrix**

The underlying object must not change when the learner changes representation.

---

## 10. Presets

### Geometry presets

1. Axis in $\mathbb R^2$.
2. Diagonal line in $\mathbb R^2$.
3. Skew line in $\mathbb R^3$.
4. Plane through the origin.
5. Translated plane $2x-y+z=3$.
6. Nearly dependent generators.
7. Exactly dependent generators.

### Projection presets

1. Project onto an axis.
2. Project onto a diagonal line.
3. Project onto a plane through the origin.
4. Project onto a translated plane.
5. Query point already on the target.

### Transformation presets

1. Scale.
2. Shear with determinant $1$.
3. Rotation with determinant $1$.
4. Reflection with determinant $-1$.
5. Rank-one collapse with determinant $0$.
6. Symmetric stretch with orthogonal eigenvectors.
7. Shear with only one eigenline.
8. Rotation with no real eigenline.
9. Orthogonal projection with eigenvalues $1$ and $0$.

---

## 11. Visual language

Reuse enough of the least-squares palette to make the relationship recognizable, while assigning colors by geometric role rather than by regression meaning.

| Object | Suggested role |
|---|---|
| Given point / test vector | Deep blue |
| Generated flat / allowed directions | Teal |
| Normal / perpendicular component | Coral |
| Projection / retained component | Emerald |
| Transformation output | Amber |
| Eigenvectors / invariant directions | Violet |
| Axes and construction lines | Slate |
| Background | Warm off-white |

Do not rely on color alone. Use labels, line styles, arrowheads, surface patterns, and endpoint shapes.

Motion should explain cause:

- adding an independent direction expands dimension;
- making directions dependent collapses a plane to a line;
- adding a constraint cuts dimension;
- projection removes the normal component;
- a determinant animation shows area or volume changing continuously;
- an eigenvector remains on its line while nearby directions turn.

Avoid continuous ambient animation.

---

## 12. Mathematical invariants

The implementation and visuals must preserve these facts:

- $0\le k\le n\le3$.
- $\dim(\mathcal C(V))=\operatorname{rank}(V)$.
- The derived normal basis satisfies $N^\top V\approx0$.
- The number of independent normal directions is $n-k$.
- A generated point satisfies its derived constraints.
- An orthogonal projection lies in the target flat.
- The projection residual is orthogonal to every target direction.
- For an orthogonal projection matrix, $P^2\approx P$ and $P^\top\approx P$.
- Equal world-unit scaling must be used on all visible axes.
- In determinant scenes, displayed area/volume must be computed from the same unrounded matrix used for rendering.
- Eigenvectors must satisfy $Av\approx\lambda v$ before they are labeled as such.
- Near-dependence and exact dependence must be visually and numerically distinguished.
- Rounded values must be marked or presented in a way that does not imply exactness.

---

## 13. Accessibility requirements

- Every 3D drag must have keyboard and numeric alternatives.
- Provide a text summary of the current ambient dimension, object dimension, equations, basis, normal directions, and relevant invariants.
- Make chapter navigation and the dimension ladder fully keyboard operable.
- Announce discrete changes such as “plane collapsed to a line” or “determinant is now zero,” not every animation frame.
- Support reduced motion; replace transformation morphs with before/after states.
- Keep equations readable at 200% zoom.
- Use an accessible table for matrices, basis vectors, transformed vectors, and eigenpairs.
- Do not encode orientation or dimension loss by color alone.
- Give the 3D scene canonical-view controls and a nonvisual description of camera-independent geometry.

---

## 14. Scope boundaries

### First complete version

- Ambient dimensions $n=1,2,3$.
- Points, affine lines, affine planes, and all of $\mathbb R^n$ where valid.
- Parametric and implicit representations.
- Linear independence and rank for at most three vectors.
- Orthogonal projection onto lines and planes.
- Determinants in $2\times2$ and $3\times3$ examples.
- Eigenvector exploration primarily for real $2\times2$ examples.
- Selected symmetric and projection examples in $\mathbb R^3$.
- The seven-chapter guided sequence.
- A link into the existing least-squares app.

### Explicitly deferred

- Dimensions above three.
- General row reduction as its own lesson.
- Full numerical eigendecomposition for arbitrary nonsymmetric $3\times3$ matrices.
- Complex eigenvectors beyond explaining that some real transformations have no real eigenline.
- Jordan form.
- Singular value decomposition.
- Oblique projections.
- Determinants defined primarily through cofactor expansion.
- Cross products as a separate topic.
- Arbitrary large user-entered matrices.
- Proof-heavy treatment of abstract vector spaces.

These topics can follow later, but they would dilute the geometry-first arc.

---

## 15. Implementation architecture

Follow the existing least-squares app’s no-build, GitHub Pages-compatible approach.

### Rendering

- Use Three.js/WebGL with an `OrthographicCamera` for the central scene.
- Keep equal scaling across axes.
- Use CSS2D labels or equivalent screen-space labels for mathematical names.
- Use SVG for the dimension ladder, small exact 2D diagrams, and accessible visual supplements.
- Use KaTeX for equations.

### State and model

All views should consume one immutable model result. Avoid letting the scene, equations, and controls perform separate calculations.

Suggested state:

```js
{
  chapter,
  ambientDimension,
  intrinsicDimension,
  representation,
  anchor,
  generators,
  constraints,
  queryPoint,
  transformation,
  preset,
  camera
}
```

Suggested computed result:

```js
{
  n,
  k,
  rank,
  anchor,
  rawGenerators,
  orthonormalBasis,
  normalBasis,
  constraintRhs,
  generatedPoint,
  projectedPoint,
  parallelComponent,
  perpendicularComponent,
  projectionMatrix,
  transformedBasis,
  determinant,
  orientation,
  eigenpairs,
  residualChecks,
  warnings
}
```

### Canonical object representation

The scene should render a canonical affine-flat result consisting of:

- anchor $p$;
- orthonormal tangent basis $Q$;
- orthonormal normal basis $N$;
- intrinsic dimension $k$.

In **Build** mode, derive this result from user-edited generators. In **Cut** mode, derive it from user-edited independent constraints. Switching modes should convert the current object rather than reset it.

For $n\le3$, a small custom linear-algebra module is sufficient:

- vector arithmetic and dot products;
- Gram–Schmidt with rank tolerance;
- orthogonal-complement construction;
- $2\times2$ and $3\times3$ determinant;
- affine projection;
- closed-form real $2\times2$ eigenpairs;
- a stable symmetric $3\times3$ eigensolver only if the selected 3D presets require it.

Do not implement a general-purpose matrix package inside the app. If arbitrary matrices become a later goal, adopt a tested numerical library rather than expanding bespoke routines indefinitely.

### Suggested file split

```text
linear-algebra/
├── DESIGN.md
├── index.html
├── linear-algebra.css
├── app.js
├── state.js
├── model.js
├── geometry-model.js
├── transformation-model.js
├── scene-3d.js
├── dimension-ladder.js
├── math-panel.js
├── controls.js
├── lesson.js
└── preview.png
```

Possible responsibilities:

- `model.js`: shared vector/matrix primitives and tolerances.
- `geometry-model.js`: span, rank, complements, constraints, and projections.
- `transformation-model.js`: determinant, transformed basis, and eigenpairs.
- `scene-3d.js`: points, vectors, flats, transformed cells, labels, and camera.
- `dimension-ladder.js`: the intrinsic/ambient dimension grid.
- `lesson.js`: chapter copy, emphasis, and available controls.
- `app.js`: state transitions and render coordination.

---

## 16. Implementation phases

### Phase 1 — Geometry kernel and dimension ladder

- Implement tested vector/matrix primitives for $n\le3$.
- Implement rank, orthonormal bases, and orthogonal complements.
- Build the canonical affine-flat model.
- Render points, lines, planes, axes, anchor points, and direction vectors.
- Add the intrinsic/ambient dimension ladder.

**Exit criterion:** the same line can be moved among $\mathbb R^1$, $\mathbb R^2$, and $\mathbb R^3$ while retaining dimension one.

### Phase 2 — Build and cut representations

- Add generator controls and coefficient-driven points.
- Derive implicit constraints from the tangent basis.
- Add normal and offset controls.
- Derive a canonical flat from constraints.
- Animate dependence and added constraints without hiding rank changes.

**Exit criterion:** a learner can create the same plane from two directions or from $ax+by+cz=d$ and switch representations without changing it.

### Phase 3 — Projection

- Add draggable query points.
- Implement line and plane projections in linear and affine cases.
- Render parallel/perpendicular decomposition and right-angle markers.
- Add basis-form and normal-form equations.

**Exit criterion:** geometry and equations agree for all projection presets, including translated planes.

### Phase 4 — Determinant transformation lab

- Render unit square/cube and transformed cells.
- Add transformation interpolation and scrubber.
- Implement determinant, orientation, and collapse states.
- Coordinate determinant zero with rank and visible dimension loss.

**Exit criterion:** scale, shear, rotation, reflection, and collapse presets all visibly match their determinant.

### Phase 5 — Eigenvector lab and synthesis

- Add real $2\times2$ eigenpair calculations and presets.
- Show preserved eigenlines and signed scaling.
- Handle repeated eigenvalues, one eigenline, and no real eigenline honestly.
- Build the projection-matrix capstone with eigenvalues $1$ and $0$.
- Add the conceptual link to Geometry of Least Squares.

**Exit criterion:** projection visibly unifies rank, determinant, and eigenvectors.

### Phase 6 — Accessibility, polish, and library integration

- Add semantic summaries, matrix tables, keyboard controls, and announcements.
- Add reduced-motion behavior.
- Tune mobile layout and canonical camera views.
- Add `preview.png`.
- Add the app to the root interactive-library index before the least-squares card, labeling it as the conceptual prequel.

---

## 17. Validation plan

### Model tests

Test exact and near-degenerate examples for:

- rank of zero, dependent, nearly dependent, and independent generator sets;
- $N^\top Q\approx0$;
- equivalence of parametric and implicit forms;
- affine projection onto lines and planes;
- projection orthogonality;
- $P^2\approx P$ and $P^\top\approx P$;
- $2\times2$ and $3\times3$ determinants;
- determinant sign under reflection;
- determinant zero under rank loss;
- real $2\times2$ eigenpairs;
- repeated eigenvalues, defective shear, and complex-eigenvalue rotation classification.

### Visual invariants

- Equal axis scales in every scene.
- Normal arrows remain perpendicular to visible flats.
- Generated and projected points remain on the displayed object.
- The transformed square/cube uses the exact matrix columns shown in the math panel.
- No chapter labels an approximate relationship as exact.

### Interaction checks

- Switching representation preserves the current object within numerical tolerance.
- Every pointer drag has a keyboard/numeric equivalent.
- Dimension-collapse transitions remain understandable with reduced motion.
- Chapter and preset changes reset only state that is incompatible with the new concept.

---

## 18. Success criteria

The app succeeds if a learner can answer these questions after using it:

1. What is the difference between the dimension of an object and the dimension of the space around it?
2. How can the same line or plane be described using directions or equations?
3. Why does $ax+by+cz=d$ describe a plane in $\mathbb R^3$?
4. Why does one equation usually reduce dimension by one?
5. What does it mean for generating vectors to be dependent?
6. Why is an orthogonal projection the nearest point?
7. What does a determinant measure geometrically?
8. Why does determinant zero mean dimension has collapsed?
9. What does a transformation preserve along an eigenvector?
10. Why does projection have eigenvalues $1$ and $0$?
11. How do these ideas prepare us to understand least squares as projection onto a model space?

Each answer should be visible in the geometry before it is summarized symbolically.

---

## 19. Main design risks

### Risk: too many topics in one app

**Mitigation:** use projection as the unifying finale and keep each chapter attached to the same dimension/build/cut vocabulary. Do not turn determinant or eigenvectors into separate formula courses.

### Risk: 3D spectacle obscures the mathematics

**Mitigation:** prefer canonical views, sparse geometry, equal scaling, and 2D views when the idea is genuinely two-dimensional. Use 3D only when embedding, plane geometry, volume, or dimension collapse requires it.

### Risk: editable equivalent representations drift apart

**Mitigation:** compute one canonical affine-flat model and derive all views from it. Do not maintain unrelated “plane equation” and “plane mesh” state.

### Risk: degeneracy looks like a rendering failure

**Mitigation:** treat dependence, determinant zero, and projection collapse as named lesson states with explicit dimension badges and transitions.

### Risk: eigenvectors become a root-finding exercise

**Mitigation:** start from visible preserved directions and curated matrices. Present $\det(A-\lambda I)=0$ only as an optional algebraic explanation after the geometry, not as the main interaction.

---

## 20. Final product position

The two apps should form a sequence:

1. **Geometry of Linear Algebra** — What are subspaces, constraints, projections, determinants, and eigenvectors?
2. **Geometry of Least Squares** — Why does fitting a line become projection onto a plane of possible fitted values?

The prequel should make the least-squares app’s model plane feel inevitable rather than surprising. The learner should arrive already knowing that a plane may be built from two columns, characterized by perpendicular constraints, and used as the target of an orthogonal projection.
