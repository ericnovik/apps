# Visual Trigonometry — Design Proposal

## 1. Product idea

**Visual Trigonometry** is a single-screen interactive instrument connecting four descriptions of the same rotating point:

1. Polar coordinates $(r,\theta)$.
2. Cartesian coordinates $(x,y)$.
3. A point $z=x+iy$ in the complex plane.
4. The two coordinate functions $\cos\theta$ and $\sin\theta$.

The central promise is:

> One moving point should explain the circle, Cartesian coordinates, sine and cosine waves, Euler’s formula, and the main trigonometric identities.

There should be no chapter sequence or locked progression. Every view remains visible and synchronized, following the Fourier app’s “one instrument, many representations” model.

A learner can:

- drag an angle point around the unit circle;
- drag the phase cursor on either wave plot;
- play or pause continuous rotation;
- switch between radians and degrees;
- snap to important angles and see exact values;
- choose an identity lens that adds geometric constructions to the same persistent views.

The app should feel exploratory rather than instructional: explanations appear where the current geometry makes them meaningful.

---

## 2. Core design decision

The unit circle and complex plane should not be separate panels. The unit circle already lives in the complex plane:

$$
u=e^{i\theta}=\cos\theta+i\sin\theta.
$$

The point $u$ on the unit circle supplies the trigonometric values:

$$
\operatorname{Re}(u)=\cos\theta,
\qquad
\operatorname{Im}(u)=\sin\theta.
$$

A polar point with arbitrary radius lies on the same ray:

$$
z=ru=r e^{i\theta}
=r\cos\theta+i\,r\sin\theta.
$$

Therefore:

$$
x=r\cos\theta,
\qquad
y=r\sin\theta,
$$

and, when $r\ne0$:

$$
\cos\theta=\frac{x}{r},
\qquad
\sin\theta=\frac{y}{r}.
$$

The scene should always distinguish:

- the **unit direction point** $u=e^{i\theta}$, which drives sine and cosine;
- the optional **polar point** $z=ru$, which explains radius and Cartesian scaling.

At the default $r=1$, the two points coincide. If the learner changes $r$, $u$ remains on the unit circle while $z$ moves along the same ray. This prevents an adjustable radius from confusing the meaning of the unit sine and cosine functions.

---

## 3. Learning goals

After using the app, a learner should understand that:

- Polar and Cartesian coordinates describe the same point.
- On the unit circle, the horizontal coordinate is $\cos\theta$ and the vertical coordinate is $\sin\theta$.
- The sine and cosine graphs are records of those coordinates as the angle rotates.
- A point $(x,y)$ can also be read as the complex number $x+iy$.
- Euler’s formula packages the two coordinate functions into one complex exponential.
- Exact values at $30^\circ$, $45^\circ$, and $60^\circ$ come from simple right-triangle constructions, not from a lookup table.
- $\cos^2\theta+\sin^2\theta=1$ is the unit-circle equation and the squared modulus of $e^{i\theta}$.
- Multiplying complex numbers adds their angles, which produces the sine and cosine addition identities.
- Complex conjugation reflects across the real axis, explaining why cosine is even and sine is odd.
- Multiplication by $i$ is a quarter turn, explaining the phase relationship between sine and cosine.
- Powers of $e^{i\theta}$ multiply angles, giving double-angle identities and De Moivre’s theorem.

---

## 4. One-screen experience

The interface should have no lesson navigation and no separate explainer page. Use four persistent regions.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Play  speed  direction  θ input  r input  radians/degrees  exact-angle snap │
├──────────────────────────────────────────────────────────────────────────────┤
│ (r, θ)  ↔  (x, y)  ↔  z = x + iy  ↔  z = r eⁱᶿ                       │
│ Identity: Coordinates · Norm · Addition · Powers · Conjugate · Quarter turn │
├──────────────────────────────────┬───────────────────────────────────────────┤
│ Complex plane + unit circle      │ cosine                                   │
│                                  │       • (θ, cos θ)                        │
│          Im                      ├───────────────────────────────────────────┤
│           │  z                   │ sine                                     │
│       sin │ /                    │       • (θ, sin θ)                        │
│    ───────┼──── Re               │                                           │
│          cos                     │                                           │
├──────────────────────────────────┴───────────────────────────────────────────┤
│ Live identity dock: geometry first, complex multiplication, trig identity   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Desktop proportions

- Compact toolbar: approximately 52 px.
- Coordinate and identity strip: approximately 72 px.
- Main visual stage: approximately 55–62% of viewport height.
- Identity dock: remaining height, with a target of 150–190 px.
- Main stage split: roughly 42% complex plane and 58% stacked wave plots.

The complex-plane view should remain approximately square. The sine and cosine plots should share the same angle scale and vertical cursor.

### Mobile

Stack in this order:

1. Playback and angle controls.
2. Coordinate equivalence strip.
3. Complex-plane circle.
4. Cosine plot.
5. Sine plot.
6. Identity selector and identity dock.

The views remain synchronized; mobile is not converted into a step-by-step carousel.

---

## 5. Shared mathematical state

Use one state object as the source of truth:

```js
{
  theta,
  unwrappedTheta,
  radius,
  playing,
  angularSpeed,
  direction,
  angleUnit,
  snapToExactAngles,
  identityMode,
  alpha,
  beta,
  power,
  dragging,
  reducedMotion
}
```

The computed model should include:

```js
{
  theta,
  normalizedTheta,
  revolutions,
  radius,
  unitPoint: { x: cosTheta, y: sinTheta },
  polarPoint: { x, y },
  complex: { real: x, imaginary: y, modulus: radius, argument: theta },
  cosTheta,
  sinTheta,
  exactAngle,
  exactCos,
  exactSin,
  identityConstruction,
  invariantChecks
}
```

All SVGs, equations, readouts, and accessibility descriptions must consume the same computed result.

---

## 6. Primary interaction

### Drag the unit-circle point

The primary handle lies on the unit circle. Pointer position determines:

$$
\theta=\operatorname{atan2}(y,x).
$$

Dragging should:

- update the point and angle arc;
- update the horizontal and vertical projections;
- move the cursor and points on both wave plots;
- update polar, Cartesian, and complex readouts;
- update the selected identity construction.

The implementation must unwrap angle changes around the $-\pi/\pi$ branch cut so dragging through the negative real axis does not visibly jump backward.

### Drag either waveform cursor

Dragging horizontally on the sine or cosine plot should update $\theta$ and move the point around the circle. This makes the synchronization bidirectional rather than treating the plots as output-only diagrams.

### Radius

Use a compact radius slider and numeric input in the first version. Changing $r$ moves $z=ru$ along the current ray while leaving $u=e^{i\theta}$ on the unit circle.

A later version may add a separate radial drag handle. Do not make one ambiguous handle simultaneously change both radius and angle.

### Keyboard

- Left/right arrows: move by a small angular increment.
- Shift + left/right: move by a larger increment.
- Up/down on the radius control: change $r$.
- Space: play or pause when focus is not in a text field.
- Home: move to angle $0$.

Every drag operation must have a keyboard and numeric alternative.

---

## 7. Animation

Use `requestAnimationFrame` with elapsed time, not frame count:

$$
\theta(t+\Delta t)=\theta(t)+d\,\omega\,\Delta t,
$$

where $d\in\{-1,1\}$ is direction and $\omega$ is angular speed.

Controls:

- Play/pause.
- Direction: clockwise/counterclockwise.
- Speed presets such as $\tfrac14\times$, $\tfrac12\times$, $1\times$, and $2\times$.
- Optional trail toggle.

Behavior:

- Pointer dragging temporarily pauses animation.
- Releasing the pointer resumes only if animation was playing before the drag.
- The waveform cursor loops smoothly while `unwrappedTheta` retains revolution count for continuity.
- Reduced-motion mode starts paused and uses no automatic animation unless explicitly started.
- Background tabs should not accumulate a large time jump; reset the animation timestamp after visibility changes.

---

## 8. Complex-plane and circle view

The main left visualization should contain:

- Real/$x$ axis and imaginary/$y$ axis.
- Unit circle.
- Optional faint concentric polar-radius rings.
- Angle ray from the origin.
- Angle arc labeled $\theta$.
- Unit point $u=e^{i\theta}$.
- Polar point $z=ru$ when $r\ne1$.
- Horizontal projection labeled $\cos\theta$.
- Vertical projection labeled $\sin\theta$.
- Right-angle marker.
- Current Cartesian coordinates.
- Standard-angle rays when exact-angle guides are enabled.

Use the same colors everywhere:

| Quantity | Role |
|---|---|
| $\cos\theta$ / real / horizontal | Blue |
| $\sin\theta$ / imaginary / vertical | Coral |
| $u=e^{i\theta}$ | Violet |
| $z=ru$ / radius | Teal |
| $\theta$ / arcs / rotation | Amber |
| Derived or comparison point | Green |

The angle ray itself should be thin. Projection lines should be dashed. Points and handles should be visually stronger than construction lines.

---

## 9. Sine and cosine plots

Use two separate but aligned plots:

$$
C(t)=\cos t,
\qquad
S(t)=\sin t.
$$

Each plot should show:

- horizontal angle axis from $-2\pi$ to $2\pi$ or a configurable two-period window;
- exact tick labels at multiples of $\pi/2$;
- vertical values $-1,0,1$;
- the full function curve;
- a shared vertical cursor at $t=\theta$;
- the current point $(\theta,\cos\theta)$ or $(\theta,\sin\theta)$;
- a faint trace showing the current revolution if animation is running.

The plots should remain separate so the learner can see each coordinate function independently. They should nevertheless share:

- the same horizontal scale;
- one cursor position;
- coordinated hover and focus states;
- aligned zero axes and exact-angle guides.

### Cross-view connectors

An overlay SVG may draw two very thin, low-opacity leaders:

- horizontal unit-circle projection $\to$ current cosine point;
- vertical unit-circle projection $\to$ current sine point.

Show these strongly while dragging or focusing a quantity and faintly otherwise. Color alone is insufficient; use dashed versus solid line styles as well.

---

## 10. Exact-angle geometry

The app should explain exact values rather than merely display them.

Provide selectable angle chips and optional snapping for:

$$
0,
\frac{\pi}{6},
\frac{\pi}{4},
\frac{\pi}{3},
\frac{\pi}{2},
\pi,
\frac{3\pi}{2},
2\pi.
$$

Use symmetry to derive the remaining standard angles.

### Quadrantal angles

At $0$, $\pi/2$, $\pi$, and $3\pi/2$, emphasize that one coordinate lies on an axis and the other is zero.

### $45^\circ$

Show an isosceles right triangle inside the unit circle:

$$
a^2+a^2=1
\quad\Longrightarrow\quad
a=\frac{\sqrt2}{2}.
$$

Therefore:

$$
\cos\frac\pi4=\sin\frac\pi4=\frac{\sqrt2}{2}.
$$

### $30^\circ$ and $60^\circ$

Show half of an equilateral triangle with hypotenuse $1$ and short leg $1/2$:

$$
x^2+\left(\frac12\right)^2=1
\quad\Longrightarrow\quad
x=\frac{\sqrt3}{2}.
$$

Use the orientation of the triangle to distinguish which coordinate is $1/2$ and which is $\sqrt3/2$.

### Exact-value display

When the current angle is exact or snapped:

- show symbolic values such as $\sqrt3/2$;
- also show a quiet decimal approximation;
- highlight the corresponding point on both wave plots;
- identify the quadrant signs separately from the reference triangle.

When the angle is arbitrary, show rounded decimals without pretending they are exact.

---

## 11. Identity lenses

Identity lenses are freely selectable overlays, not lesson steps. Switching lenses must not reset $\theta$, radius, animation, or camera/view state.

The circle and both function plots remain visible in every lens.

### A. Coordinates / Euler

Persistent foundation:

$$
e^{i\theta}=\cos\theta+i\sin\theta.
$$

For arbitrary radius:

$$
z=r e^{i\theta}=r\cos\theta+i\,r\sin\theta=x+iy.
$$

Visual emphasis:

- one point, four coordinate descriptions;
- real and imaginary parts mapped to cosine and sine plots.

### B. Norm / Pythagorean identity

Visual emphasis:

- right triangle formed by the coordinate projections;
- optional subtle squares on the two legs and hypotenuse;
- unit modulus.

Complex derivation:

$$
|e^{i\theta}|^2
=e^{i\theta}e^{-i\theta}
=1.
$$

Coordinate result:

$$
\cos^2\theta+\sin^2\theta=1.
$$

For arbitrary radius, also show:

$$
x^2+y^2=r^2.
$$

### C. Angle addition / complex multiplication

Introduce two editable angles $\alpha$ and $\beta$ plus their product direction $\alpha+\beta$.

Visual emphasis:

- vectors $e^{i\alpha}$ and $e^{i\beta}$;
- multiplication by $e^{i\beta}$ shown as rotation through $\beta$;
- result $e^{i(\alpha+\beta)}$;
- wave cursor follows the resulting angle while ghost markers retain the component angles.

Complex equation:

$$
e^{i(\alpha+\beta)}
=e^{i\alpha}e^{i\beta}.
$$

Expansion:

$$
(\cos\alpha+i\sin\alpha)
(\cos\beta+i\sin\beta).
$$

Real and imaginary parts reveal:

$$
\cos(\alpha+\beta)
=\cos\alpha\cos\beta-\sin\alpha\sin\beta,
$$

$$
\sin(\alpha+\beta)
=\sin\alpha\cos\beta+\cos\alpha\sin\beta.
$$

### D. Powers / double angle / De Moivre

Add a small integer control $n\in\{2,3,4,5,6\}$.

Show the base point $u=e^{i\theta}$ and derived point $u^n=e^{in\theta}$.

$$
(e^{i\theta})^n=e^{in\theta}.
$$

Equivalent form:

$$
(\cos\theta+i\sin\theta)^n
=\cos(n\theta)+i\sin(n\theta).
$$

For $n=2$, reveal the familiar identities:

$$
\cos2\theta=\cos^2\theta-\sin^2\theta,
$$

$$
\sin2\theta=2\sin\theta\cos\theta.
$$

The visual should show the derived angle wrapping around the circle twice as fast, not merely display the algebra.

### E. Conjugate / even and odd symmetry

Show $u=e^{i\theta}$ and its reflection across the real axis:

$$
\bar u=e^{-i\theta}=\cos\theta-i\sin\theta.
$$

Then:

$$
\cos(-\theta)=\cos\theta,
$$

$$
\sin(-\theta)=-\sin\theta.
$$

Coordinate this with mirrored cursors at $\theta$ and $-\theta$ on both function plots.

### F. Quarter turn / phase shift

Show multiplication by $i$ as a $90^\circ$ rotation:

$$
i e^{i\theta}=e^{i(\theta+\pi/2)}.
$$

Use this to connect the functions:

$$
\sin\left(\theta+\frac\pi2\right)=\cos\theta,
$$

$$
\cos\left(\theta+\frac\pi2\right)=-\sin\theta.
$$

Overlay a faint shifted comparison curve on the sine and cosine plots. Keep the primary curves visually dominant.

---

## 12. Live coordinate strip

The strip above the visual stage should continuously show equivalent forms:

$$
(r,\theta)
\quad\longleftrightarrow\quad
(x,y)
\quad\longleftrightarrow\quad
z=x+iy
\quad\longleftrightarrow\quad
z=r e^{i\theta}.
$$

For $r=1$, add:

$$
u=e^{i\theta}=\cos\theta+i\sin\theta.
$$

The currently focused quantity should highlight across the strip and all plots:

| Focus | Coordinated emphasis |
|---|---|
| $\theta$ | angle arc, wave cursor, exponential phase |
| $\cos\theta$ | horizontal leg, real coordinate, cosine point |
| $\sin\theta$ | vertical leg, imaginary coordinate, sine point |
| $r$ | radius ray, modulus, polar point |
| $z$ | complex point and all coordinate representations |

---

## 13. Identity dock

The dock should present each selected identity in three aligned layers:

1. **Geometry:** a short sentence describing what changed in the picture.
2. **Complex form:** multiplication, conjugation, modulus, or power.
3. **Trigonometric form:** the resulting identity.

Example for angle addition:

```text
GEOMETRY              COMPLEX NUMBERS                 REAL + IMAGINARY PARTS
rotate by β            eⁱ⁽ᵅ⁺ᵝ⁾ = eⁱᵅeⁱᵝ              cos(α+β) = …
                                                     sin(α+β) = …
```

Do not show a long derivation by default. A disclosure control may reveal one intermediate algebra line.

The dock should also automatically show exact-angle triangle geometry when the current angle is a recognized standard angle, without changing the selected identity lens.

---

## 14. Visual language

Use a restrained palette with stable semantic roles:

- Cosine / real / horizontal: deep blue.
- Sine / imaginary / vertical: coral.
- Unit complex point: violet.
- Radius / arbitrary polar point: teal.
- Angle / rotation: amber.
- Derived identity point: emerald.
- Reference geometry: slate.
- Background: warm off-white.

Rules:

- Keep curve strokes stronger than grid lines.
- Keep active points stronger than curves.
- Keep construction lines thin and partially transparent.
- Do not place large pills over the geometry.
- Use compact labels near endpoints and place detailed values in the coordinate strip.
- Use exact mathematical symbols in labels rather than prose where possible.
- Do not distinguish sine and cosine by color alone; use solid versus dashed projection styles and visible $x/y$ or Re/Im labels.

Motion should explain causality:

- rotation moves the coordinate projections;
- those projections move the two waveform markers;
- complex multiplication rotates a vector;
- powers accelerate angular motion;
- conjugation reflects the point.

Avoid ambient animation when playback is paused.

---

## 15. Mathematical invariants

The implementation must preserve:

- $u=(\cos\theta,\sin\theta)$.
- $\lVert u\rVert=1$.
- $z=ru$.
- $x=r\cos\theta$ and $y=r\sin\theta$.
- $z=x+iy=r e^{i\theta}$.
- $\cos^2\theta+\sin^2\theta=1$.
- The current cosine graph point is exactly $(\theta,\cos\theta)$.
- The current sine graph point is exactly $(\theta,\sin\theta)$.
- $e^{i\alpha}e^{i\beta}=e^{i(\alpha+\beta)}$.
- $\overline{e^{i\theta}}=e^{-i\theta}$.
- $(e^{i\theta})^n=e^{in\theta}$ for integer $n$.
- Exact-angle labels agree with the quadrant and reference-angle construction.
- Angle normalization used for display must not destroy the unwrapped phase needed for animation continuity.

Use tolerances only for recognizing and displaying near-exact angles. Do not silently snap unless exact-angle snapping is enabled.

---

## 16. Technical architecture

Use a no-build, GitHub Pages-compatible vanilla JavaScript architecture.

### Rendering

Use SVG rather than a 3D/WebGL scene:

- one SVG for the complex plane and circle;
- one SVG each for cosine and sine;
- one transparent overlay SVG for cross-panel connector lines;
- KaTeX for equations.

SVG is preferable here because:

- the geometry is two-dimensional;
- lines, arcs, labels, and focus targets remain crisp;
- pointer interaction is straightforward;
- semantic descriptions and keyboard focus are easier than with canvas;
- only a few dynamic attributes change each frame.

Precompute static sine and cosine paths. During animation, update only:

- circle points and rays;
- projection segments;
- wave cursors and current markers;
- identity overlay geometry;
- numeric readouts.

### Suggested file split

```text
visual-trigonometry/
├── DESIGN.md
├── index.html
├── visual-trigonometry.css
├── app.js
├── state.js
├── model.js
├── exact-values.js
├── circle-view.js
├── wave-view.js
├── connector-view.js
├── identity-view.js
├── math-panel.js
├── interaction.js
├── model.test.mjs
└── preview.png
```

Responsibilities:

- `model.js`: pure polar/Cartesian/complex calculations and identity models.
- `exact-values.js`: canonical angles, symbolic values, quadrant reduction, and construction metadata.
- `state.js`: interaction state and animation transitions.
- `circle-view.js`: complex plane, unit circle, triangles, points, and identity overlays.
- `wave-view.js`: reusable sine/cosine SVG plot.
- `connector-view.js`: cross-panel leaders.
- `identity-view.js`: identity-specific geometry and dock content.
- `math-panel.js`: KaTeX rendering from the shared model.
- `interaction.js`: pointer-to-angle conversion, unwrapping, dragging, and keyboard controls.
- `app.js`: initialization, animation loop, state changes, and coordinated rendering.

### Numerical model

The model should be dependency-free. Required operations are simple scalar trigonometry and complex multiplication:

```js
multiplyComplex(a, b)
conjugateComplex(z)
complexPower(z, n)
normalizeAngle(theta)
unwrapAngle(previous, nextPrincipal)
recognizeExactAngle(theta, tolerance)
computeTrigModel(state)
```

Do not introduce a general complex-number or matrix library for this scope.

---

## 17. Accessibility

- The unit-circle handle must be focusable and keyboard movable.
- Angle and radius must have range and numeric inputs.
- Play/pause must expose `aria-pressed` and a clear accessible name.
- Each SVG needs a concise current-state description.
- Provide a textual table containing $\theta$, $r$, $x$, $y$, $\sin\theta$, $\cos\theta$, and $z$.
- Announce snapped exact angles and identity changes, but do not announce every animation frame.
- While animation runs, throttle optional live updates heavily or keep them silent until paused.
- Honor `prefers-reduced-motion`; begin paused and avoid animated identity transitions.
- Preserve readable equations at 200% zoom.
- Use line style, labels, and marker shapes in addition to color.
- Make all identity lenses operable without pointer dragging.

---

## 18. First-version scope

### Include

- One synchronized screen with no guided steps.
- Unit circle inside the complex plane.
- Polar, Cartesian, and complex coordinate forms.
- Adjustable angle and radius.
- Draggable unit-circle point.
- Draggable shared waveform cursor.
- Play/pause, direction, and speed.
- Separate sine and cosine plots.
- Radian and degree display.
- Exact-angle chips and optional snapping.
- Geometric derivations for $30^\circ$, $45^\circ$, and $60^\circ$.
- Coordinate/Euler, Pythagorean, addition, powers, conjugate, and quarter-turn lenses.
- Responsive layout and reduced-motion support.
- Pure model tests.

### Defer

- Tangent, secant, cosecant, and cotangent plots.
- Inverse trigonometric functions and branch cuts.
- Hyperbolic functions.
- Arbitrary complex-number arithmetic beyond the selected identities.
- Fourier sums and multiple simultaneous frequencies.
- 3D spherical coordinates.
- Formal epsilon-style proofs.
- User-authored symbolic identities.

Tangent is intentionally deferred because its asymptotes would add a third plot and distract from the core real/imaginary-coordinate story.

---

## 19. Implementation phases

### Phase 1 — Shared model and static synchronized views

- Implement angle normalization and unwrapping.
- Implement polar, Cartesian, and complex conversions.
- Render unit circle/complex plane.
- Render separate sine and cosine paths.
- Add shared cursor and coordinate strip.
- Add pure model tests.

**Exit criterion:** setting one angle produces the same cosine and sine values in every view.

### Phase 2 — Direct manipulation and animation

- Drag the unit-circle handle.
- Drag either waveform cursor.
- Add keyboard alternatives.
- Add play/pause, direction, and speed.
- Handle visibility changes and reduced motion.

**Exit criterion:** all three views can drive the same angle state without jumps at $\pm\pi$.

### Phase 3 — Exact values and triangle constructions

- Add standard-angle guides and chips.
- Add snapping toggle.
- Implement symbolic exact-value metadata.
- Render $45^\circ$ and $30^\circ/60^\circ$ constructions.
- Add quadrant sign reduction.

**Exit criterion:** exact sine and cosine values are visibly derived from triangle side lengths.

### Phase 4 — Complex identity lenses

- Euler/coordinate lens.
- Norm/Pythagorean lens.
- Addition lens with $\alpha$ and $\beta$.
- Powers/De Moivre lens with integer $n$.
- Conjugate symmetry lens.
- Quarter-turn phase-shift lens.

**Exit criterion:** each trigonometric identity is tied to a visible complex-plane operation.

### Phase 5 — Responsive layout, accessibility, and polish

- Add semantic summaries and numerical table.
- Tune labels and connector opacity.
- Validate 200% zoom and mobile stacking.
- Add preview image and library card.

---

## 20. Validation plan

### Pure model tests

Test:

- polar-to-Cartesian conversions;
- Cartesian-to-polar conversions, including origin behavior;
- unit-circle norm over representative and random angles;
- periodicity of sine and cosine;
- angle normalization and branch-cut unwrapping;
- exact-angle recognition and symbolic values;
- quadrant sign reduction;
- complex multiplication and angle addition;
- conjugation;
- integer powers and De Moivre;
- quarter-turn multiplication by $i$;
- all displayed identity residuals within numerical tolerance.

### Interaction tests

- Drag continuously through $\pi$ and $-\pi$ without a backward jump.
- Drag on either wave plot and verify the circle follows.
- Pause during drag and restore prior playback state on release.
- Switch radians/degrees without changing the underlying angle.
- Enable and disable snapping without silently altering arbitrary angles.
- Switch identity lenses without resetting angle, radius, or playback.

### Visual checks

- Projection colors match their wave plots.
- Current markers agree at standard and arbitrary angles.
- Exact labels do not overlap the active point.
- Addition and power overlays remain distinguishable from the primary point.
- Connector lines remain secondary and do not obscure curves.
- All panels remain visible on a typical 1440×900 viewport.

---

## 21. Success criteria

The app succeeds if a learner can answer:

1. Why is $\cos\theta$ the horizontal coordinate?
2. Why is $\sin\theta$ the vertical coordinate?
3. How does a rotating point produce sine and cosine waves?
4. How do $(r,\theta)$, $(x,y)$, $x+iy$, and $r e^{i\theta}$ describe the same point?
5. Where do $\sqrt2/2$, $1/2$, and $\sqrt3/2$ come from?
6. Why does $\cos^2\theta+\sin^2\theta=1$?
7. Why does complex multiplication add angles?
8. How do the addition formulas follow from complex multiplication?
9. Why is cosine even and sine odd?
10. Why is cosine a quarter-period shift of sine?
11. Why do powers of a complex unit rotate through multiples of the angle?

Each answer should be visible in the synchronized geometry before it is stated algebraically.

---

## 22. Main design risks

### Risk: too many overlays obscure the core circle

**Mitigation:** identity lenses add only the geometry needed for one identity at a time. The base point, coordinate projections, and wave cursor remain stable.

### Risk: adjustable radius confuses sine and cosine values

**Mitigation:** keep the unit point $u=e^{i\theta}$ visible and distinct from the polar point $z=ru$. The wave plots always map the unit coordinates.

### Risk: connector lines create visual noise

**Mitigation:** use thin, low-opacity leaders and strengthen them only during drag, hover, or keyboard focus.

### Risk: exact-angle snapping feels unpredictable

**Mitigation:** snapping is explicit, optional, and visually indicated. Without it, nearby values may be recognized approximately but the point is not moved.

### Risk: animation becomes decorative rather than explanatory

**Mitigation:** every animated quantity is a direct consequence of the shared angle. No ambient motion occurs while playback is paused.

### Risk: addition formulas still feel like unexplained algebra

**Mitigation:** show multiplication as a visible rotation first, then expand the two complex numbers, then identify real and imaginary parts.

---

## 23. Product position

Visual Trigonometry should sit conceptually before the Fourier explorer:

- **Visual Trigonometry:** one rotating complex number produces sine and cosine.
- **Fourier Series Explorer:** many rotating complex numbers combine to produce general periodic waves.

The app itself should not require a prominent handoff card. The relationship can be expressed in the library description and, if useful later, through a quiet contextual link rather than a large in-app promotion.
