import { createState, applyPreset, markCustom, PRESETS } from "./state.js";
import { computeLeastSquares, formatNumber } from "./model.js";
import { createProjectionScene } from "./scene-3d.js";
import { createDataPlot } from "./data-plot.js";
import { createCoefficientInset } from "./coefficient-inset.js";
import { renderInputsMath, renderMathPanel } from "./math-panel.js";
import { LESSON_STEPS, updateLessonUI } from "./lesson.js";

const state = createState();

const elements = {
  presetSelect: document.getElementById("presetSelect"),
  randomizeButton: document.getElementById("randomizeButton"),
  resetButton: document.getElementById("resetButton"),
  resetCameraButton: document.getElementById("resetCameraButton"),
  previousStep: document.getElementById("previousStep"),
  nextStep: document.getElementById("nextStep"),
  stepCounter: document.getElementById("stepCounter"),
  stepTitle: document.getElementById("stepTitle"),
  stepCopy: document.getElementById("stepCopy"),
  stepInsight: document.getElementById("stepInsight"),
  lessonTabs: [...document.querySelectorAll(".lesson-tab")],
  mathRows: [...document.querySelectorAll(".math-row")],
  yRanges: [
    document.getElementById("y1Range"),
    document.getElementById("y2Range"),
    document.getElementById("y3Range")
  ],
  yInputs: [
    document.getElementById("y1Input"),
    document.getElementById("y2Input"),
    document.getElementById("y3Input")
  ],
  observationControls: [...document.querySelectorAll(".observation-control")],
  xValues: document.getElementById("xValues"),
  sceneContainer: document.getElementById("sceneContainer"),
  dataPlot: document.getElementById("dataPlot"),
  perturbationCard: document.getElementById("perturbationCard"),
  perturbationTitle: document.getElementById("perturbationTitle"),
  perturbationEyebrow: document.querySelector(".perturbation-card .eyebrow"),
  identityCard: document.querySelector(".identity-card"),
  identityTitle: document.getElementById("identityTitle"),
  identityEyebrow: document.querySelector(".identity-card .eyebrow"),
  h0Range: document.getElementById("h0Range"),
  h1Range: document.getElementById("h1Range"),
  h0Value: document.getElementById("h0Value"),
  h1Value: document.getElementById("h1Value"),
  zeroPerturbationButton: document.getElementById("zeroPerturbationButton"),
  candidateLegend: document.getElementById("candidateLegend"),
  inputsMath: document.getElementById("inputsMath"),
  spaceMath: document.getElementById("spaceMath"),
  fitMath: document.getElementById("fitMath"),
  normalMath: document.getElementById("normalMath"),
  sumResidualCheck: document.getElementById("sumResidualCheck"),
  weightedResidualCheck: document.getElementById("weightedResidualCheck"),
  perturbationMath: document.getElementById("perturbationMath"),
  identityMath: document.getElementById("identityMath"),
  candidateErrorValue: document.getElementById("candidateErrorValue"),
  minimumErrorValue: document.getElementById("minimumErrorValue"),
  extraDistanceValue: document.getElementById("extraDistanceValue"),
  candidateErrorBar: document.getElementById("candidateErrorBar"),
  minimumErrorBar: document.getElementById("minimumErrorBar"),
  extraDistanceBar: document.getElementById("extraDistanceBar"),
  rankNote: document.getElementById("rankNote"),
  rankBadge: document.getElementById("rankBadge"),
  fitStatus: document.getElementById("fitStatus"),
  sceneSummary: document.getElementById("sceneSummary"),
  observationTableBody: document.getElementById("observationTableBody"),
  liveRegion: document.getElementById("liveRegion")
};

function createFuturePlaceholder(card) {
  const placeholder = document.createElement("div");
  placeholder.className = "future-card-placeholder";
  const stepToken = document.createElement("span");
  stepToken.className = "future-step-token";
  stepToken.textContent = "5";
  const message = document.createElement("p");
  placeholder.append(stepToken, message);
  card.appendChild(placeholder);
  return { placeholder, message };
}

const perturbationFuture = createFuturePlaceholder(elements.perturbationCard);
const identityFuture = createFuturePlaceholder(elements.identityCard);

function clampResponse(value) {
  return Math.max(-4, Math.min(4, value));
}

function getCustomOption() {
  let option = elements.presetSelect.querySelector('option[value="custom"]');
  if (!option) {
    option = document.createElement("option");
    option.value = "custom";
    option.textContent = "Custom";
    elements.presetSelect.appendChild(option);
  }
  return option;
}

function announce(message) {
  elements.liveRegion.textContent = "";
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 30);
}

function updateFutureCards() {
  const revealComparisons = state.step === LESSON_STEPS.length - 1;
  elements.perturbationCard.classList.toggle("is-locked", !revealComparisons);
  elements.identityCard.classList.toggle("is-locked", !revealComparisons);
  elements.perturbationCard.setAttribute("aria-disabled", String(!revealComparisons));
  elements.identityCard.setAttribute("aria-disabled", String(!revealComparisons));
  [elements.h0Range, elements.h1Range].forEach((range) => {
    range.disabled = !revealComparisons;
  });

  if (revealComparisons) {
    elements.perturbationEyebrow.textContent = "Compare another fit";
    elements.perturbationTitle.textContent = "Perturb the coefficients";
    elements.identityEyebrow.textContent = "Distance decomposition";
    elements.identityTitle.textContent = "Every other fit is farther";
    return;
  }

  elements.perturbationEyebrow.textContent = "Coming in Step 5";
  elements.perturbationTitle.textContent = "Perturb β̂ by h";
  elements.identityEyebrow.textContent = "Coming in Step 5";
  elements.identityTitle.textContent = "Compare squared errors";
  perturbationFuture.message.textContent = state.step === 1
    ? "For now, drag β in coefficient space to see the forward map β → Xβ. Step 5 introduces β = β̂ + h."
    : "After establishing the least-squares optimum, Step 5 moves away from β̂ by a perturbation h.";
  identityFuture.message.textContent = "Step 5 turns the residual and in-plane movement into an exact Pythagorean error decomposition.";
}

let projectionScene;
try {
  projectionScene = createProjectionScene(elements.sceneContainer);
} catch (error) {
  console.error("Unable to initialize the 3D scene", error);
  elements.sceneContainer.innerHTML = `
    <div class="scene-error">
      <strong>The 3D view could not start.</strong>
      <span>The data plot and live mathematics remain available below.</span>
    </div>`;
  projectionScene = {
    render() {},
    highlightObservation() {},
    resetCamera() {},
    destroy() {}
  };
}

let currentModel = null;
let highlightedObservation = null;

const dataPlot = createDataPlot(elements.dataPlot, {
  onYChange(index, value) {
    state.y[index] = value;
    markCustom(state);
    renderAll();
  },
  onInteractionEnd() {
    announce(`Updated response vector y to ${state.y.map((value) => formatNumber(value)).join(", ")}.`);
  },
  onObservationHighlight(index) {
    setObservationHighlight(index);
  }
});

const coefficientInset = createCoefficientInset(elements.sceneContainer, {
  onHChange(nextH) {
    state.h = nextH;
    renderAll();
  },
  onInteractionEnd() {
    announce(`Candidate coefficients are ${formatNumber(currentModel.candidateBeta[0])}, ${formatNumber(currentModel.candidateBeta[1])}.`);
  }
});

function applyObservationHighlight() {
  elements.observationControls.forEach((control, index) => {
    control.classList.toggle("is-observation-highlighted", index === highlightedObservation);
  });
  elements.observationTableBody.querySelectorAll("tr[data-observation-index]").forEach((row) => {
    row.classList.toggle(
      "is-observation-highlighted",
      Number(row.dataset.observationIndex) === highlightedObservation
    );
  });
  dataPlot.highlightObservation(highlightedObservation);
  projectionScene.highlightObservation(highlightedObservation);
  if (currentModel) {
    renderInputsMath(currentModel, elements.inputsMath, highlightedObservation);
  }
}

function setObservationHighlight(index) {
  highlightedObservation = Number.isInteger(index) && index >= 0 && index < 3
    ? index
    : null;
  applyObservationHighlight();
}

function syncControls() {
  elements.yRanges.forEach((range, index) => {
    range.value = String(state.y[index]);
  });
  elements.yInputs.forEach((input, index) => {
    input.value = formatNumber(state.y[index], 2);
  });

  elements.h0Range.value = String(state.h[0]);
  elements.h1Range.value = String(state.h[1]);
  elements.h0Value.textContent = formatNumber(state.h[0], 2);
  elements.h1Value.textContent = formatNumber(state.h[1], 2);

  elements.xValues.replaceChildren(...state.x.map((value, index) => {
    const item = document.createElement("span");
    item.className = "x-value";
    item.textContent = `x${index + 1}=${formatNumber(value)}`;
    return item;
  }));

  if (state.preset === "custom") getCustomOption();
  elements.presetSelect.value = state.preset;
}

function renderAll() {
  const model = computeLeastSquares(state.x, state.y, state.h);
  currentModel = model;
  const showCandidate = state.step === 1 || state.step === LESSON_STEPS.length - 1;

  syncControls();
  updateLessonUI(state.step, elements);
  dataPlot.render(model, { showCandidate });
  projectionScene.render(model, { step: state.step, showCandidate });
  coefficientInset.render(model, { step: state.step, showCandidate });
  renderMathPanel(model, elements);
  updateFutureCards();
  applyObservationHighlight();

  elements.candidateLegend.setAttribute("aria-hidden", String(!showCandidate));
  elements.zeroPerturbationButton.disabled = state.step !== LESSON_STEPS.length - 1
    || state.h.every((value) => Math.abs(value) < 1e-12);
}

function setStep(nextStep, shouldAnnounce = true) {
  const bounded = Math.max(0, Math.min(LESSON_STEPS.length - 1, nextStep));
  if (bounded === state.step && shouldAnnounce) return;
  state.step = bounded;
  renderAll();
  if (shouldAnnounce) {
    announce(`Step ${bounded + 1}: ${LESSON_STEPS[bounded].title}.`);
  }
}

function updateResponse(index, rawValue, shouldAnnounce = false) {
  const number = Number(rawValue);
  if (!Number.isFinite(number)) return;
  const value = Math.round(clampResponse(number) * 20) / 20;
  state.y[index] = value;
  markCustom(state);
  renderAll();
  if (shouldAnnounce) announce(`Observation ${index + 1} is now ${formatNumber(value)}.`);
}

elements.lessonTabs.forEach((tab) => {
  tab.addEventListener("click", () => setStep(Number(tab.dataset.step)));
});

elements.previousStep.addEventListener("click", () => setStep(state.step - 1));
elements.nextStep.addEventListener("click", () => setStep(state.step + 1));

elements.presetSelect.addEventListener("change", () => {
  const name = elements.presetSelect.value;
  if (!(name in PRESETS)) return;
  applyPreset(state, name);
  renderAll();
  announce(`Loaded ${PRESETS[name].label}. The design has rank ${computeLeastSquares(state.x, state.y, state.h).rank}.`);
});

elements.randomizeButton.addEventListener("click", () => {
  state.y = state.y.map(() => Math.round((-2.6 + Math.random() * 5.6) * 20) / 20);
  markCustom(state);
  renderAll();
  announce("Randomized the three response values.");
});

elements.resetButton.addEventListener("click", () => {
  applyPreset(state, "projection");
  state.step = 0;
  projectionScene.resetCamera();
  renderAll();
  announce("Reset the lesson and restored the clear projection example.");
});

elements.resetCameraButton.addEventListener("click", () => {
  projectionScene.resetCamera();
  announce("Restored the canonical observation-space view.");
});

elements.observationControls.forEach((control, index) => {
  control.addEventListener("pointerenter", () => setObservationHighlight(index));
  control.addEventListener("pointerleave", () => {
    if (!control.contains(document.activeElement)) setObservationHighlight(null);
  });
  control.addEventListener("focusin", () => setObservationHighlight(index));
  control.addEventListener("focusout", (event) => {
    if (!control.contains(event.relatedTarget) && !control.matches(":hover")) {
      setObservationHighlight(null);
    }
  });
});

elements.observationTableBody.addEventListener("pointerover", (event) => {
  const row = event.target.closest?.("tr[data-observation-index]");
  if (row) setObservationHighlight(Number(row.dataset.observationIndex));
});
elements.observationTableBody.addEventListener("pointerout", (event) => {
  const row = event.target.closest?.("tr[data-observation-index]");
  if (row && !row.contains(event.relatedTarget)) setObservationHighlight(null);
});
elements.observationTableBody.addEventListener("focusin", (event) => {
  const row = event.target.closest?.("tr[data-observation-index]");
  if (row) setObservationHighlight(Number(row.dataset.observationIndex));
});
elements.observationTableBody.addEventListener("focusout", (event) => {
  const row = event.target.closest?.("tr[data-observation-index]");
  if (row && !row.contains(event.relatedTarget)) setObservationHighlight(null);
});

elements.yRanges.forEach((range, index) => {
  range.addEventListener("input", () => updateResponse(index, range.value));
  range.addEventListener("change", () => updateResponse(index, range.value, true));
});

elements.yInputs.forEach((input, index) => {
  input.addEventListener("change", () => updateResponse(index, input.value, true));
});

[elements.h0Range, elements.h1Range].forEach((range, index) => {
  range.addEventListener("input", () => {
    state.h[index] = Number(range.value);
    renderAll();
  });
  range.addEventListener("change", () => {
    announce(`Perturbation h is now ${formatNumber(state.h[0])}, ${formatNumber(state.h[1])}.`);
  });
});

elements.zeroPerturbationButton.addEventListener("click", () => {
  state.h = [0, 0];
  renderAll();
  announce("Set h to zero. The candidate fit now equals the least-squares fit.");
});

window.addEventListener("beforeunload", () => {
  dataPlot.destroy();
  coefficientInset.destroy();
  projectionScene.destroy();
}, { once: true });

renderAll();
