# Gravity Unknown — Implementation Plan

**Design source:** `GRAVITY_UNKNOWN_DESIGN.md`  
**Current directory:** `moon-experiment/`  
**Target directory:** `gravity-experiment/`

## Approved compact-layout revision

The final implementation must treat these requirements as newer than conflicting guidance below:

- Remove the top product panel and library back link.
- Remove the in-app world reference table; identification relies on the estimate and outside research.
- Remove playback-speed controls and run at `1×` real time.
- Remove visible click/tap/Space instructions.
- Use the released height for a taller tower and measurement table.
- Keep mission status and New Mission in the navigation panel.
- Keep the initial and revealed wide-desktop states inside one viewport; use normal stacked scrolling on narrow screens.

## 1. Known repository context

Repository root:

```text
/Users/ericnovik/Repos/apps
```

Known deployment setup:

- GitHub remote: `ericnovik/apps`
- GitHub Pages publishes the repository root.
- `.github/workflows/pages.yml` deploys from `main`.
- Live library: `https://ericnovik.github.io/apps/`
- Current app URL: `https://ericnovik.github.io/apps/moon-experiment/`
- Target app URL: `https://ericnovik.github.io/apps/gravity-experiment/`

Last known repository state before this handoff:

- Branch: `main`
- Last known commit: `44060cb Add Visual Trigonometry library card`
- Local and remote `main` were synchronized.
- Working tree was clean.

Verify all of this before editing. Do not assume it remains unchanged.

## 2. Current experiment behavior to preserve

From the existing implementation context:

- The current app is named Moon Drop Experiment.
- It simulates a ball dropped from a `100 m` tower.
- Existing gravity is fixed near lunar gravity, currently represented by a constant similar to `G = 1.625`.
- Red measurement flashes occur as the ball passes distance intervals.
- The player clicks at each flash.
- Recorded time/position measurements are used to estimate gravity.
- The app currently exposes or compares against a true model line.
- The homepage currently links to `moon-experiment/`.

Inspect the actual files before making changes. Preserve working measurement, timing, charting, and analysis behavior wherever possible.

## 3. Expected files

Inspect the directory before editing. Likely files include:

```text
moon-experiment/index.html
moon-experiment/moon-experiment.css
moon-experiment/moon-experiment.js
```

The exact filenames must be confirmed rather than assumed.

Also inspect:

```text
index.html
.github/workflows/pages.yml
README.md
```

Search the repository for all references to:

```text
moon-experiment
Moon Drop Experiment
moon experiment
Moon
1.625
true gravity
true line
```

Only replace references that belong to this app. Do not alter unrelated astronomical content.

## 4. Phase 1 — Baseline and safety

Before editing:

1. Check `git status`.
2. Confirm the active branch.
3. Inspect all files in `moon-experiment/`.
4. Identify generated or user-owned files.
5. Run any existing tests.
6. Open the current app in a browser.
7. Capture baseline behavior:
   - Initial scene
   - Drop flow
   - Flash/click flow
   - Analysis calculation
   - Graph datasets
   - Reset behavior
   - Existing result reveal
8. Determine how the current app renders:
   - Earth
   - Tower
   - Ball
   - Flashes
   - Graph
9. Verify responsive behavior before modifying it.

Do not rewrite the existing experiment from scratch unless the architecture makes a focused extension impossible.

## 5. Phase 2 — Rename the application directory

Use Git-aware movement:

```sh
git mv moon-experiment gravity-experiment
```

After moving:

1. Rename app-specific CSS or JavaScript filenames only if it improves clarity.
2. If internal filenames are renamed, update all corresponding references.
3. Update relative asset paths.
4. Confirm the app loads at:
   - `/gravity-experiment/`
   - GitHub Pages base `/apps/gravity-experiment/`
5. Search again for stale `moon-experiment` references.
6. Update the root homepage card link.

A legacy redirect from `/moon-experiment/` is optional and was not explicitly requested. Do not preserve the old full app directory merely to avoid the rename. If a redirect is added, keep it as a minimal compatibility page and document it.

## 6. Phase 3 — Rename visible product copy

Update:

- Document title
- Main heading
- Metadata description
- Instructions
- Buttons
- Result headings
- Accessibility labels
- Homepage card
- Preview alt text

Use:

```text
Gravity Unknown
```

Tagline:

```text
Measure the fall. Identify the world. Launch home.
```

Remove product-level references implying that the player is definitely on Earth’s Moon.

Generic scientific references to moons may remain where accurate.

## 7. Phase 4 — Extract world configuration

Replace the single fixed gravity constant with a world catalog.

Recommended shape:

```js
const WORLDS = Object.freeze([
  Object.freeze({
    id: "io",
    name: "Io",
    classification: "Moon of Jupiter",
    gravity: 1.8,
    aliases: Object.freeze(["io"]),
  }),
  Object.freeze({
    id: "earth-moon",
    name: "Earth’s Moon",
    classification: "Major Moon",
    gravity: 1.62,
    aliases: Object.freeze([
      "earth’s moon",
      "earth's moon",
      "earth moon",
      "moon",
      "the moon",
    ]),
  }),
  Object.freeze({
    id: "ganymede",
    name: "Ganymede",
    classification: "Moon of Jupiter",
    gravity: 1.43,
    aliases: Object.freeze(["ganymede"]),
  }),
  Object.freeze({
    id: "europa",
    name: "Europa",
    classification: "Moon of Jupiter",
    gravity: 1.32,
    aliases: Object.freeze(["europa"]),
  }),
  Object.freeze({
    id: "callisto",
    name: "Callisto",
    classification: "Moon of Jupiter",
    gravity: 1.24,
    aliases: Object.freeze(["callisto"]),
  }),
]);
```

Use the selected world’s `gravity` everywhere the old fixed constant controlled physics.

Avoid duplicating gravity values in multiple modules or UI branches.

## 8. Phase 5 — Introduce explicit mission state

Use a clear state object or state module.

Suggested shape:

```js
const mission = {
  world: null,
  phase: "ready",
  trials: [],
  currentTrial: null,
  estimate: null,
  incorrectGuesses: [],
};
```

Suggested phases:

```js
const PHASES = Object.freeze({
  READY: "ready",
  DROPPING: "dropping",
  ANALYZING: "analyzing",
  IDENTIFYING: "identifying",
  LAUNCHING_CORRECT: "launching-correct",
  LAUNCHING_INCORRECT: "launching-incorrect",
  CRASHED: "crashed",
  REVEALED: "revealed",
  COMPLETE: "complete",
});
```

Required state rules:

- `newMission()` selects a world and clears mission data.
- `resetTrial()` resets only trial-specific state.
- `startAnotherTrial()` retains the same world.
- An incorrect guess retains world, trials, and estimate.
- Repair retains world, trials, estimate, and guess history.
- A correct guess transitions to reveal and completion.
- UI rendering should derive from state rather than manually toggling unrelated elements.

Allow random selection to be injected or factored into a small pure function so it can be tested deterministically.

## 9. Phase 6 — Preserve and generalize the physics

Find every use of the fixed lunar gravity and replace it with the selected world’s gravity.

Likely affected calculations:

- Ball position
- Fall duration
- Flash timing
- Expected measurement times
- True curve or line
- Displayed true gravity
- Any error calculations

Preserve the existing tower height and measurement spacing unless testing shows they make some worlds impractically slow or fast.

Verify all five worlds:

- Complete the drop
- Trigger every intended flash
- Produce valid measurements
- Produce a finite estimate
- Fit within existing animation duration expectations

Do not round gravity before physics calculations. Use the numeric configuration value and round only for display.

## 10. Phase 7 — Gate true information

Identify all current paths that expose the answer.

Before a correct guess:

- Do not render or display the true line.
- Do not render a true-line legend entry.
- Do not display true gravity.
- Do not display selected world name.
- Do not place selected world name in visible or accessible scene text.
- Do not mark the matching table row.
- Do not show estimate error against truth.

Preferred implementation:

- Keep estimated and true datasets separate.
- Build or attach the true dataset only when state enters `revealed`.
- If the graph library requires the dataset to exist, make it non-visible and omit its label until reveal.
- Ensure tooltips cannot expose hidden true values.

After a correct guess:

1. Reveal result text.
2. Add or enable the true dataset.
3. Update the legend.
4. Display estimate error.
5. Start successful launch.

## 11. Phase 8 — Add the world reference catalog

Add a semantic table:

```text
World | Classification | Surface gravity
```

Rows:

```text
Io           | Moon of Jupiter | 1.80 m/s²
Earth’s Moon | Major Moon      | 1.62 m/s²
Ganymede     | Moon of Jupiter | 1.43 m/s²
Europa       | Moon of Jupiter | 1.32 m/s²
Callisto     | Moon of Jupiter | 1.24 m/s²
```

Requirements:

- Correct mathematical unit formatting
- Responsive layout
- No horizontal page overflow
- Readable at mobile widths
- No correct-row highlight before success
- Optional correct-row highlight after success
- Proper `table`, `thead`, `tbody`, `th`, and `td` semantics

If the table cannot fit naturally on a narrow phone, use either:

- A locally scrollable table container, or
- A stacked row treatment preserving semantic labels

Do not reduce text to illegible sizes.

## 12. Phase 9 — Add the identification form

Add:

- Visible label
- Text input
- Optional datalist or accessible suggestions
- Program Launch button
- Validation feedback
- Guess history
- Live status message

Normalize guesses with a pure function:

```js
function normalizeWorldName(value) {
  return String(value)
    .trim()
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}
```

Apply equivalent normalization to aliases.

Form behavior:

- Disabled before an estimate exists.
- Empty input shows validation but does not launch.
- Unknown input shows validation but does not launch.
- Valid incorrect world starts failed launch.
- Correct world starts reveal and successful launch.
- Button remains disabled while an animation is running.
- Duplicate event handlers must not be introduced on reset.

Suggested copy:

```text
Which world are you on?
Enter a world name
Program Launch
```

## 13. Phase 10 — Add the spacecraft

Add a small spacecraft to the left of the tower.

Preferred implementation:

- Inline SVG
- Existing scene coordinate system if available
- No external graphics dependency
- CSS classes for state
- Transform and opacity animations

Required visual states:

```text
landed
engine-start
launching-success
launching-failure
crashed
escaped
```

The craft should not obstruct:

- Tower
- Falling object
- Flash markers
- Measurement interaction
- Scene instructions

Provide a non-visual description through the surrounding scene summary rather than making decorative SVG internals excessively verbose.

## 14. Phase 11 — Remove Earth and identity clues

Find and remove:

- Earth illustration
- Earth-related sky labels
- Moon-specific scene descriptions
- Accessibility text saying the location is Earth’s Moon
- Any world-specific body shown in the sky

Replace with:

- Generic stars
- Neutral sky gradient
- Neutral surface
- Unknown-world scene description

The scene must remain the same for all hidden worlds before reveal.

World-specific visual theming after success is optional and not required for the first implementation.

## 15. Phase 12 — Implement launch outcomes

### Correct outcome

Order:

1. Set state to `launching-correct`.
2. Reveal world and true values.
3. Reveal true graph line.
4. Start engine.
5. Lift craft.
6. Tilt and accelerate craft out of scene.
7. Fade or remove craft visually.
8. Set state to `complete`.
9. Enable New Mission.

Use transform-based animation where possible.

### Incorrect outcome

Order:

1. Record the incorrect guess.
2. Set state to `launching-incorrect`.
3. Keep truth hidden.
4. Start engine.
5. Lift craft briefly.
6. Sputter, yaw, or stall.
7. Move craft through a short crash arc.
8. End in crashed pose with a dust effect.
9. Set state to `crashed`.
10. Enable repair and additional-trial actions.

After repair:

- Restore landed craft.
- Return to identifying state.
- Preserve hidden world.
- Preserve measurements.
- Preserve estimate.
- Preserve incorrect guess history.

Do not automatically reroll the mission after a crash.

## 16. Phase 13 — Support multiple trials

Inspect the existing analysis model before choosing an aggregation strategy.

Preferred strategy:

- Store each completed trial.
- Combine compatible observations.
- Recompute an aggregate estimate.
- Display trial count.
- Display uncertainty if meaningful.

Minimum acceptable strategy:

- Permit another complete drop.
- Keep the same hidden world.
- Label the current trial number.
- Replace the displayed estimate with the latest trial.
- Preserve incorrect guess history.

Do not introduce a mathematically misleading uncertainty value solely for visual appeal.

## 17. Phase 14 — Accessibility and reduced motion

Add or verify:

- `aria-live="polite"` for routine status
- Assertive announcement only if truly necessary
- Visible focus styles
- Keyboard-operable form and controls
- Semantic table
- Descriptive graph summary
- Correct focus movement after outcomes
- Text labels accompanying success/failure colors

Add reduced-motion CSS:

```css
@media (prefers-reduced-motion: reduce) {
  /* Remove long flight and crash trajectories. */
}
```

Reduced-motion behavior:

- Correct answer transitions quickly to escaped state.
- Incorrect answer transitions quickly to crashed state.
- Messages and controls remain identical.

Animations must not be required to understand the outcome.

## 18. Phase 15 — Update homepage

In root `index.html`:

1. Change card link to `gravity-experiment/`.
2. Change title to `Gravity Unknown`.
3. Change description to:

```text
Measure a falling probe, estimate local gravity, identify the hidden moon, and launch home.
```

4. Replace the existing Moon emoji placeholder with a real preview image.
5. Add appropriate alt text.
6. Preserve existing grid order unless there is a strong reason to reorder it.

Recommended preview path:

```text
gravity-experiment/preview.png
```

Create the preview after the final scene is stable.

The preview should show:

- Neutral scene
- Spacecraft left of tower
- Tower and falling test mass
- No Earth
- No hidden world identity

## 19. Phase 16 — Repository-wide cleanup

Search for stale references:

```text
moon-experiment/
Moon Drop Experiment
Moon Drop
lunar gravity
Earth’s Moon
1.625
```

Review each match. Some scientific references may still be valid, but product naming and fixed-world assumptions must be removed.

Update relevant:

- README links
- Metadata
- Homepage
- Tests
- Design documents
- Cache-busting query strings, if the project uses them

Do not change unrelated apps.

## 20. Test plan

### World selection

- Every selected world belongs to the approved catalog.
- Deterministic random boundaries select expected entries.
- New Mission selects through the configured random function.
- Reset Trial does not change the world.
- Failed guess does not change the world.
- Repair does not change the world.

### Physics

For every world:

- Position follows the configured gravity.
- Drop completes.
- Flash sequence remains valid.
- Estimated gravity is finite.
- True data uses the same world gravity.
- Display rounds to two decimals.

### Guess normalization

Accept:

```text
io
IO
 Europa
earth's moon
Earth’s Moon
earth moon
Moon
Ganymede
Callisto
```

Reject:

```text
Mars
Jupiter
Titan
blank input
whitespace-only input
```

### Reveal gating

Before success:

- True line absent or inaccessible.
- True gravity absent.
- Selected world name absent from result UI.
- Correct row not highlighted.

After incorrect guess:

- Truth remains hidden.
- Incorrect animation state runs.
- Repair becomes available.

After correct guess:

- Correct world appears.
- True gravity appears.
- True line appears.
- Error calculation appears.
- Successful animation state runs.

### State transitions

Test:

```text
ready → dropping → analyzing → identifying
identifying → launching-incorrect → crashed → identifying
identifying → launching-correct → revealed/complete
complete → ready via New Mission
```

### Browser validation

Test at minimum:

Desktop:

```text
1100 × 720
1200 × 900
1440 × 900
1600 × 900
```

Mobile/tablet:

```text
760 × 1000
390 × 844
```

Check:

- No card overlap
- No page-level horizontal overflow
- Table remains usable
- Input and button remain accessible
- Graph labels do not collide
- Spacecraft does not cover the experiment
- Correct animation exits cleanly
- Failed animation ends on the ground
- Reduced-motion path works
- Homepage card image loads
- Homepage link opens the renamed app

## 21. Validation commands

Determine the repository’s actual test setup first.

At minimum run:

```sh
node --check gravity-experiment/gravity-experiment.js
git diff --check
```

Use the actual JavaScript filename after inspecting or renaming it.

Also run:

- Existing app tests
- Any newly added model/state tests
- Project diagnostics
- Browser smoke tests
- Live link checks after deployment

Do not claim validation passed unless each command was actually run.

## 22. Suggested implementation order

Use this order to reduce risk:

1. Inspect and baseline current app.
2. Add pure world configuration.
3. Add mission state and deterministic selection.
4. Replace fixed gravity in physics.
5. Add tests for selection and state.
6. Gate true gravity and true graph line.
7. Add reference catalog.
8. Add guess normalization and form.
9. Add correct/incorrect transitions without animation.
10. Add spacecraft to scene.
11. Remove Earth.
12. Add success animation.
13. Add crash animation and repair.
14. Add multiple-trial support.
15. Add accessibility and reduced motion.
16. Rename directory and internal assets.
17. Update homepage card and preview.
18. Run complete validation.
19. Commit and push.
20. Wait for GitHub Pages deployment.
21. Verify live homepage and app.

If renaming early makes development paths clearer, it may be moved earlier, but ensure the app remains runnable throughout.

## 23. Git and deployment

Before committing:

- Confirm only intended files changed.
- Remove temporary browser scripts and screenshots.
- Run tests, diagnostics, syntax checks, and `git diff --check`.
- Confirm no generated or user-owned files were accidentally removed.

Suggested commit message:

```text
Transform Moon Drop into Gravity Unknown
```

Push `main` only after validation.

The Pages workflow should run automatically on a push to `main`.

After deployment verify:

```text
https://ericnovik.github.io/apps/
https://ericnovik.github.io/apps/gravity-experiment/
```

Live checks should confirm:

- Homepage card is present.
- Homepage link targets the renamed directory.
- Preview image loads.
- App title is Gravity Unknown.
- A mission begins with a hidden world.
- No true result appears before a correct guess.
- All static assets return HTTP 200.

## 24. Final delivery summary

The final implementation report should include:

- Directory rename
- Product rename
- Random-world model
- Identification and truth-gating behavior
- Scene and spacecraft changes
- Success and failure animations
- Homepage updates
- Tests executed
- Browser sizes validated
- Commit SHA
- Deployment run URL
- Live app URL
- Any non-blocking warnings
