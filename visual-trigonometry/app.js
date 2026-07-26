import { computeTrigModel, formatNumber, TAU } from "./model.js";
import { createCircleView } from "./circle-view.js";
import { createWaveView } from "./wave-view.js";
import {
  advanceAnimation,
  beginAngleInteraction,
  createState,
  endAngleInteraction,
  homeAngle,
  setAngleUnit,
  setDirection,
  setPrincipalAngle,
  setRadius,
  setSpeedMultiplier,
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
  polarMath: byId("polarMath"),
  cartesianMath: byId("cartesianMath"),
  complexMath: byId("complexMath"),
  exponentialMath: byId("exponentialMath"),
  eulerMath: byId("eulerMath"),
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

function announce(message) {
  elements.liveRegion.textContent = "";
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 25);
}

function angleForControl(model) {
  return state.angleUnit === "degrees"
    ? model.principalTheta * 180 / Math.PI
    : model.principalTheta;
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

  if (document.activeElement !== elements.angleRange) {
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
}

function renderViews(model) {
  const angleLabel = formatAngleLabel(model, state.angleUnit);
  circle.render(model, { angleUnit: state.angleUnit, precision: 3 });
  cosine.render(model, { angleLabel, valueLabel: formatNumber(model.cosTheta, 3) });
  sine.render(model, { angleLabel, valueLabel: formatNumber(model.sinTheta, 3) });
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

function setAngleFromInteraction(angle) {
  setPrincipalAngle(state, angle);
  renderFull();
}

function startAngleInteraction(angle) {
  beginAngleInteraction(state);
  setPrincipalAngle(state, angle);
  renderFull();
}

function finishAngleInteraction(angle) {
  setPrincipalAngle(state, angle);
  endAngleInteraction(state);
  renderFull();
  announce(`Angle ${formatAngleLabel(currentModel, state.angleUnit)}. Cosine ${formatNumber(currentModel.cosTheta, 3)}; sine ${formatNumber(currentModel.sinTheta, 3)}.`);
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

const sharedViewCallbacks = {
  onAngleStart: startAngleInteraction,
  onAngleChange: setAngleFromInteraction,
  onAngleEnd: finishAngleInteraction,
  onAngleStep: stepFromView,
  onAngleHome: homeFromView,
  onTogglePlay: togglePlayFromView
};

const circle = createCircleView(elements.circleView, sharedViewCallbacks);
const cosine = createWaveView(elements.cosineView, { kind: "cos", ...sharedViewCallbacks });
const sine = createWaveView(elements.sineView, { kind: "sin", ...sharedViewCallbacks });

function beginControlAngleInteraction() {
  beginAngleInteraction(state);
}

function updateAngleFromControl(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (!state.dragging) beginControlAngleInteraction();
  setPrincipalAngle(state, radiansFromControl(value));
  renderFull();
}

function endControlAngleInteraction() {
  if (!state.dragging) return;
  endAngleInteraction(state);
  renderFull();
  announce(`Angle ${formatAngleLabel(currentModel, state.angleUnit)}.`);
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
elements.angleRange.addEventListener("input", () => updateAngleFromControl(elements.angleRange.value));
elements.angleRange.addEventListener("change", endControlAngleInteraction);
elements.angleRange.addEventListener("pointerup", endControlAngleInteraction);
elements.angleRange.addEventListener("pointercancel", endControlAngleInteraction);
elements.angleInput.addEventListener("input", () => updateAngleFromControl(elements.angleInput.value));
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
