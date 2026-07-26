import { computeTrigModel, formatNumber, principalAngle, TAU } from "./model.js";
import { snapToExactAngle } from "./exact-values.js";
import { createCircleView } from "./circle-view.js";
import { createWaveView } from "./wave-view.js";
import {
  advanceAnimation,
  beginAngleInteraction,
  createState,
  endAngleInteraction,
  homeAngle,
  selectExactAngle,
  setAngleUnit,
  setDirection,
  setIdentityAlpha,
  setIdentityBeta,
  setIdentityMode,
  setIdentityPower,
  setPrincipalAngle,
  setRadius,
  setSnapToExactAngles,
  setSpeedMultiplier,
  setWaveAngle,
  stepAngle,
  togglePlayback
} from "./state.js";
import { formatAngleLabel, renderMathPanel } from "./math-panel.js";

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = createState({ reducedMotion: reducedMotionQuery.matches });
const byId = (id) => document.getElementById(id);

const elements = {
  playButton: byId("playButton"),
  directionButton: byId("directionButton"),
  speedSelect: byId("speedSelect"),
  angleRange: byId("angleRange"),
  angleInput: byId("angleInput"),
  radiusRange: byId("radiusRange"),
  radiusInput: byId("radiusInput"),
  radianButton: byId("radianButton"),
  degreeButton: byId("degreeButton"),
  snapButton: byId("snapButton"),
  snapStateLabel: byId("snapStateLabel"),
  exactAngleStatus: byId("exactAngleStatus"),
  exactAngleChips: Array.from(document.querySelectorAll(".exact-angle-chip")),
  polarMath: byId("polarMath"),
  cartesianMath: byId("cartesianMath"),
  complexMath: byId("complexMath"),
  exponentialMath: byId("exponentialMath"),
  identityLensButtons: Array.from(document.querySelectorAll(".identity-lens-button")),
  identityPanel: byId("identityPanel"),
  identityTitle: byId("identityTitle"),
  identityBadge: byId("identityBadge"),
  identityGeometryText: byId("identityGeometryText"),
  identityComplexMath: byId("identityComplexMath"),
  identityTrigMath: byId("identityTrigMath"),
  identityAlgebra: byId("identityAlgebra"),
  identityDetailMath: byId("identityDetailMath"),
  identitySummary: byId("identitySummary"),
  additionParameters: byId("additionParameters"),
  alphaInput: byId("alphaInput"),
  betaInput: byId("betaInput"),
  powerParameters: byId("powerParameters"),
  powerSelect: byId("powerSelect"),
  exactDerivation: byId("exactDerivation"),
  exactConstructionTitle: byId("exactConstructionTitle"),
  exactQuadrantBadge: byId("exactQuadrantBadge"),
  exactEquationMath: byId("exactEquationMath"),
  exactValuesMath: byId("exactValuesMath"),
  exactApproximation: byId("exactApproximation"),
  exactConstructionExplanation: byId("exactConstructionExplanation"),
  thetaReadout: byId("thetaReadout"),
  cosReadout: byId("cosReadout"),
  sinReadout: byId("sinReadout"),
  revolutionReadout: byId("revolutionReadout"),
  circleView: byId("circleView"),
  circleSummary: byId("circleSummary"),
  cosineView: byId("cosineView"),
  cosineSummary: byId("cosineSummary"),
  sineView: byId("sineView"),
  sineSummary: byId("sineSummary"),
  valuesTableBody: byId("valuesTableBody"),
  liveRegion: byId("liveRegion")
};

let currentModel = computeTrigModel(state);
let lastFrameTime = null;
let lastMathTime = -Infinity;
let animationFrame = null;
let destroyed = false;
let interactionSnapped = false;

function announce(message) {
  elements.liveRegion.textContent = "";
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 25);
}

function angleForControl(model) {
  return state.angleUnit === "degrees"
    ? model.displayTheta * 180 / Math.PI
    : model.displayTheta;
}

function radiansFromControl(value) {
  return state.angleUnit === "degrees" ? value * Math.PI / 180 : value;
}

function syncControls(model) {
  const useDegrees = state.angleUnit === "degrees";
  const controlAngle = angleForControl(model);
  const angleMin = useDegrees ? -180 : -Math.PI;
  const angleMax = useDegrees ? 180 : Math.PI;
  const angleStep = useDegrees ? 0.1 : 0.001;

  [elements.angleRange, elements.angleInput].forEach((input) => {
    input.min = String(angleMin);
    input.max = String(angleMax);
    input.step = String(angleStep);
  });

  if (document.activeElement !== elements.angleRange || interactionSnapped) {
    elements.angleRange.value = String(controlAngle);
  }
  if (document.activeElement !== elements.angleInput) {
    elements.angleInput.value = useDegrees
      ? formatNumber(controlAngle, 1)
      : formatNumber(controlAngle, 3);
  }
  if (document.activeElement !== elements.radiusRange) {
    elements.radiusRange.value = String(model.radius);
  }
  if (document.activeElement !== elements.radiusInput) {
    elements.radiusInput.value = formatNumber(model.radius, 2);
  }

  const playIcon = elements.playButton.querySelector(".button-icon");
  const playLabel = elements.playButton.querySelector("span:last-child");
  playIcon.textContent = state.playing ? "❚❚" : "▶";
  playLabel.textContent = state.playing ? "Pause" : "Play";
  elements.playButton.setAttribute("aria-pressed", String(state.playing));
  elements.playButton.setAttribute("aria-label", state.playing ? "Pause rotation" : "Play rotation");

  const clockwise = state.direction < 0;
  elements.directionButton.querySelector(".direction-glyph").textContent = clockwise ? "↻" : "↺";
  elements.directionButton.querySelector("span:last-child").textContent = clockwise ? "CW" : "CCW";
  elements.directionButton.setAttribute("aria-pressed", String(clockwise));
  elements.directionButton.setAttribute("aria-label", `Direction: ${clockwise ? "clockwise" : "counterclockwise"}`);
  elements.speedSelect.value = String(state.speedMultiplier);

  elements.radianButton.classList.toggle("is-active", !useDegrees);
  elements.radianButton.setAttribute("aria-pressed", String(!useDegrees));
  elements.degreeButton.classList.toggle("is-active", useDegrees);
  elements.degreeButton.setAttribute("aria-pressed", String(useDegrees));

  elements.snapButton.setAttribute("aria-pressed", String(state.snapToExactAngles));
  elements.snapButton.classList.toggle("is-active", state.snapToExactAngles);
  elements.snapStateLabel.textContent = state.snapToExactAngles ? "on" : "off";

  const exactAngle = model.exactAngle;
  const atPositiveTurnBoundary = model.plotTheta === TAU;
  const activeChipAngle = atPositiveTurnBoundary ? TAU : exactAngle?.angle.value;
  for (const chip of elements.exactAngleChips) {
    const chipAngle = Number(chip.dataset.angle);
    const active = Number.isFinite(activeChipAngle)
      && Math.abs(chipAngle - activeChipAngle) < 1e-9;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
    chip.textContent = useDegrees ? chip.dataset.degrees : chip.dataset.radians;
  }

  for (const button of elements.identityLensButtons) {
    const active = button.dataset.identityMode === state.identityMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  elements.additionParameters.hidden = state.identityMode !== "addition";
  elements.powerParameters.hidden = state.identityMode !== "powers";
  elements.powerSelect.value = String(state.power);

  const parameterMin = useDegrees ? -180 : -3.142;
  const parameterMax = useDegrees ? 180 : 3.142;
  const parameterStep = useDegrees ? 0.1 : 0.001;
  const parameterValue = (angle) => useDegrees
    ? principalAngle(angle) * 180 / Math.PI
    : principalAngle(angle);
  for (const [input, angle] of [
    [elements.alphaInput, state.alpha],
    [elements.betaInput, state.beta]
  ]) {
    input.min = String(parameterMin);
    input.max = String(parameterMax);
    input.step = String(parameterStep);
    if (document.activeElement !== input) {
      input.value = useDegrees
        ? formatNumber(parameterValue(angle), 1)
        : formatNumber(parameterValue(angle), 3);
    }
  }

  if (exactAngle) {
    const canonicalLabel = atPositiveTurnBoundary
      ? useDegrees ? "360°" : "2π"
      : useDegrees ? exactAngle.angle.degreeLabel : exactAngle.angle.plain;
    const displayLabel = formatAngleLabel(model, state.angleUnit);
    const equivalence = canonicalLabel === displayLabel
      ? canonicalLabel
      : `${canonicalLabel} ≡ ${displayLabel}`;
    elements.exactAngleStatus.textContent = `${equivalence} · ${exactAngle.quadrant.label}`;
    elements.exactAngleStatus.dataset.exact = "true";
  } else {
    elements.exactAngleStatus.textContent = "Arbitrary angle · decimal values";
    elements.exactAngleStatus.dataset.exact = "false";
  }
}

function renderViews(model) {
  const angleLabel = formatAngleLabel(model, state.angleUnit);
  const sharedOptions = {
    angleUnit: state.angleUnit,
    angleLabel,
    snapEnabled: state.snapToExactAngles
  };
  circle.render(model, { ...sharedOptions, precision: 3 });
  cosine.render(model, {
    ...sharedOptions,
    angleLabel,
    valueLabel: model.exactCos?.plain ?? formatNumber(model.cosTheta, 3)
  });
  sine.render(model, {
    ...sharedOptions,
    angleLabel,
    valueLabel: model.exactSin?.plain ?? formatNumber(model.sinTheta, 3)
  });
}

function renderFull(now = performance.now()) {
  currentModel = computeTrigModel(state);
  syncControls(currentModel);
  renderViews(currentModel);
  renderMathPanel(currentModel, state, elements);
  lastMathTime = now;
}

function renderAnimationFrame(now) {
  currentModel = computeTrigModel(state);
  renderViews(currentModel);

  if (now - lastMathTime >= 90) {
    syncControls(currentModel);
    renderMathPanel(currentModel, state, elements);
    lastMathTime = now;
  }
}

function applyInteractiveAngle(angle, allowSnap = true, source = "principal") {
  const snapResult = snapToExactAngle(angle, {
    enabled: allowSnap && state.snapToExactAngles
  });
  interactionSnapped = snapResult.snapped;
  if (source === "wave") {
    setWaveAngle(state, snapResult.angle);
  } else {
    setPrincipalAngle(state, snapResult.angle);
  }
  return snapResult;
}

function setAngleFromInteraction(angle, source = "principal") {
  applyInteractiveAngle(angle, true, source);
  renderFull();
}

function startAngleInteraction(angle, source = "principal") {
  beginAngleInteraction(state);
  interactionSnapped = false;
  applyInteractiveAngle(angle, true, source);
  renderFull();
}

function finishAngleInteraction(angle, source = "principal") {
  const snapResult = applyInteractiveAngle(angle, true, source);
  endAngleInteraction(state);
  renderFull();
  const exactPrefix = snapResult.snapped && currentModel.exactAngle
    ? `Snapped to ${currentModel.exactAngle.angle.degreeLabel}. `
    : "";
  announce(`${exactPrefix}Angle ${formatAngleLabel(currentModel, state.angleUnit)}. Cosine ${currentModel.exactCos?.plain ?? formatNumber(currentModel.cosTheta, 3)}; sine ${currentModel.exactSin?.plain ?? formatNumber(currentModel.sinTheta, 3)}.`);
  interactionSnapped = false;
}

function stepFromView(delta) {
  togglePlayback(state, false);
  stepAngle(state, delta);
  renderFull();
  announce(`Angle ${formatAngleLabel(currentModel, state.angleUnit)}.`);
}

function homeFromView() {
  togglePlayback(state, false);
  homeAngle(state);
  renderFull();
  announce("Angle returned to zero in the current revolution.");
}

function togglePlayFromView() {
  togglePlayback(state);
  lastFrameTime = null;
  renderFull();
  announce(state.playing ? "Rotation playing." : "Rotation paused.");
}

const sharedKeyboardCallbacks = {
  onAngleStep: stepFromView,
  onAngleHome: homeFromView,
  onTogglePlay: togglePlayFromView
};
const circleCallbacks = {
  ...sharedKeyboardCallbacks,
  onAngleStart: startAngleInteraction,
  onAngleChange: setAngleFromInteraction,
  onAngleEnd: finishAngleInteraction
};
const waveCallbacks = {
  ...sharedKeyboardCallbacks,
  onAngleStart: (angle) => startAngleInteraction(angle, "wave"),
  onAngleChange: (angle) => setAngleFromInteraction(angle, "wave"),
  onAngleEnd: (angle) => finishAngleInteraction(angle, "wave")
};

const circle = createCircleView(elements.circleView, circleCallbacks);
const cosine = createWaveView(elements.cosineView, { kind: "cos", ...waveCallbacks });
const sine = createWaveView(elements.sineView, { kind: "sin", ...waveCallbacks });

function beginControlAngleInteraction() {
  interactionSnapped = false;
  beginAngleInteraction(state);
}

function updateAngleFromControl(rawValue, allowSnap) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (!state.dragging) beginControlAngleInteraction();
  applyInteractiveAngle(radiansFromControl(value), allowSnap);
  renderFull();
}

function endControlAngleInteraction() {
  if (!state.dragging) return;
  const snapped = interactionSnapped;
  endAngleInteraction(state);
  renderFull();
  const exactPrefix = snapped && currentModel.exactAngle
    ? `Snapped to ${currentModel.exactAngle.angle.degreeLabel}. `
    : "";
  announce(`${exactPrefix}Angle ${formatAngleLabel(currentModel, state.angleUnit)}.`);
  interactionSnapped = false;
}

elements.playButton.addEventListener("click", togglePlayFromView);
elements.directionButton.addEventListener("click", () => {
  setDirection(state, -state.direction);
  renderFull();
  announce(`Rotation direction ${state.direction < 0 ? "clockwise" : "counterclockwise"}.`);
});
elements.speedSelect.addEventListener("change", () => {
  setSpeedMultiplier(state, Number(elements.speedSelect.value));
  renderFull();
  announce(`Animation speed ${state.speedMultiplier} times.`);
});

elements.angleRange.addEventListener("pointerdown", beginControlAngleInteraction);
elements.angleRange.addEventListener("input", () => updateAngleFromControl(elements.angleRange.value, true));
elements.angleRange.addEventListener("change", endControlAngleInteraction);
elements.angleRange.addEventListener("pointerup", endControlAngleInteraction);
elements.angleRange.addEventListener("pointercancel", endControlAngleInteraction);
elements.angleInput.addEventListener("input", () => updateAngleFromControl(elements.angleInput.value, false));
elements.angleInput.addEventListener("change", endControlAngleInteraction);
elements.angleInput.addEventListener("blur", () => {
  if (state.dragging) endControlAngleInteraction();
});

elements.radiusRange.addEventListener("input", () => {
  setRadius(state, Number(elements.radiusRange.value));
  renderFull();
});
elements.radiusRange.addEventListener("change", () => {
  announce(`Radius ${formatNumber(currentModel.radius, 2)}.`);
});
elements.radiusInput.addEventListener("input", () => {
  const radius = Number(elements.radiusInput.value);
  if (!Number.isFinite(radius)) return;
  setRadius(state, radius);
  renderFull();
});
elements.radiusInput.addEventListener("change", () => {
  setRadius(state, Number(elements.radiusInput.value));
  renderFull();
  announce(`Radius ${formatNumber(currentModel.radius, 2)}.`);
});

elements.radianButton.addEventListener("click", () => {
  setAngleUnit(state, "radians");
  renderFull();
  announce("Angles shown in radians.");
});
elements.degreeButton.addEventListener("click", () => {
  setAngleUnit(state, "degrees");
  renderFull();
  announce("Angles shown in degrees.");
});

elements.snapButton.addEventListener("click", () => {
  setSnapToExactAngles(state, !state.snapToExactAngles);
  renderFull();
  announce(state.snapToExactAngles
    ? "Exact-angle snapping enabled. The current angle was not changed."
    : "Exact-angle snapping disabled. The current angle was not changed.");
});

for (const button of elements.identityLensButtons) {
  button.addEventListener("click", () => {
    setIdentityMode(state, button.dataset.identityMode);
    renderFull();
    announce(`${currentModel.identity.title} lens selected. ${currentModel.identity.geometryText}`);
  });
}

function updateIdentityAngleParameter(input, setter) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  togglePlayback(state, false);
  setter(state, radiansFromControl(value));
  lastFrameTime = null;
  renderFull();
}

elements.alphaInput.addEventListener("input", () => {
  updateIdentityAngleParameter(elements.alphaInput, setIdentityAlpha);
});
elements.betaInput.addEventListener("input", () => {
  updateIdentityAngleParameter(elements.betaInput, setIdentityBeta);
});
elements.alphaInput.addEventListener("change", () => {
  announce(`Alpha ${formatAngleLabel({ ...currentModel, exactAngle: null, displayTheta: principalAngle(state.alpha) }, state.angleUnit)}.`);
});
elements.betaInput.addEventListener("change", () => {
  announce(`Beta ${formatAngleLabel({ ...currentModel, exactAngle: null, displayTheta: principalAngle(state.beta) }, state.angleUnit)}.`);
});
elements.powerSelect.addEventListener("change", () => {
  setIdentityPower(state, Number(elements.powerSelect.value));
  renderFull();
  announce(`Power ${state.power}. The derived point is at ${state.power} theta.`);
});

for (const chip of elements.exactAngleChips) {
  chip.addEventListener("click", () => {
    const angle = Number(chip.dataset.angle);
    if (!Number.isFinite(angle)) return;
    togglePlayback(state, false);
    selectExactAngle(state, angle);
    lastFrameTime = null;
    renderFull();
    const exactAngle = currentModel.exactAngle;
    announce(exactAngle
      ? `Exact angle ${chip.dataset.degrees}. Cosine ${exactAngle.cos.plain}; sine ${exactAngle.sin.plain}.`
      : `Angle ${formatAngleLabel(currentModel, state.angleUnit)}.`);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;

  const target = event.target;
  const tagName = target instanceof Element ? target.tagName.toLowerCase() : "";
  if (["input", "button", "select", "summary"].includes(tagName) || target?.isContentEditable) return;

  if ((event.key === " " || event.code === "Space") && !event.repeat) {
    event.preventDefault();
    togglePlayFromView();
  }
});

document.addEventListener("visibilitychange", () => {
  lastFrameTime = null;
});

function handleReducedMotionChange(event) {
  state.reducedMotion = event.matches;
  if (event.matches) togglePlayback(state, false);
  lastFrameTime = null;
  renderFull();
}

if (typeof reducedMotionQuery.addEventListener === "function") {
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
} else {
  reducedMotionQuery.addListener(handleReducedMotionChange);
}

function animate(now) {
  if (destroyed) return;

  if (lastFrameTime === null) lastFrameTime = now;
  const elapsedSeconds = Math.max(0, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (!document.hidden && advanceAnimation(state, elapsedSeconds)) {
    renderAnimationFrame(now);
  }

  animationFrame = window.requestAnimationFrame(animate);
}

function destroy() {
  if (destroyed) return;
  destroyed = true;
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  circle.destroy();
  cosine.destroy();
  sine.destroy();
  if (typeof reducedMotionQuery.removeEventListener === "function") {
    reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
  } else {
    reducedMotionQuery.removeListener(handleReducedMotionChange);
  }
}

window.addEventListener("pagehide", destroy, { once: true });

renderFull();
animationFrame = window.requestAnimationFrame(animate);
