import { computeGeometry, formatNumber, TRANSFORM_PRESETS } from "./model.js";
import { createGeometryScene } from "./scene-3d.js";
import { createState, enterChapter, setDimension } from "./state.js";
import { LESSON_STEPS, updateLessonUI } from "./lesson.js";
import { objectName, renderMathPanel, sceneSummary } from "./math-panel.js";

let state = createState();
let currentModel = null;

const byId = (id) => document.getElementById(id);
const elements = {
  previousStep: byId("previousStep"),
  nextStep: byId("nextStep"),
  stepCounter: byId("stepCounter"),
  stepTitle: byId("stepTitle"),
  stepCopy: byId("stepCopy"),
  stepInsightText: document.querySelector("#stepInsight p"),
  activeChip: document.querySelector(".active-chip"),
  lessonTabs: [...document.querySelectorAll(".lesson-tab")],
  dimensionCells: [...document.querySelectorAll("button.dimension-cell")],
  representationTabs: [...document.querySelectorAll(".representation-tab")],
  mathRows: [...document.querySelectorAll(".math-row")],
  sceneContainer: byId("sceneContainer"),
  sceneSummary: byId("sceneSummary"),
  ambientBadge: byId("ambientBadge"),
  objectBadge: byId("objectBadge"),
  rankBadge: byId("rankBadge"),
  orientationRange: byId("orientationRange"),
  orientationValue: byId("orientationValue"),
  tiltRange: byId("tiltRange"),
  tiltValue: byId("tiltValue"),
  offsetRange: byId("offsetRange"),
  offsetValue: byId("offsetValue"),
  dependenceRange: byId("dependenceRange"),
  dependenceValue: byId("dependenceValue"),
  coefficientRanges: [byId("coefficient1Range"), byId("coefficient2Range"), byId("coefficient3Range")],
  coefficientValues: [byId("coefficient1Value"), byId("coefficient2Value"), byId("coefficient3Value")],
  queryRanges: [byId("queryXRange"), byId("queryYRange"), byId("queryZRange")],
  queryValues: [byId("queryXValue"), byId("queryYValue"), byId("queryZValue")],
  transformPreset: byId("transformPreset"),
  transformProgress: byId("transformProgress"),
  transformProgressValue: byId("transformProgressValue"),
  dimensionMath: byId("dimensionMath"),
  parametricMath: byId("parametricMath"),
  constraintMath: byId("constraintMath"),
  activeMath: byId("activeMath"),
  matrixMath: byId("matrixMath"),
  invariantList: byId("invariantList"),
  liveRegion: byId("liveRegion")
};

let geometryScene;
try {
  geometryScene = createGeometryScene(elements.sceneContainer);
} catch (error) {
  console.error("Unable to initialize the linear-algebra scene", error);
  elements.sceneContainer.innerHTML = `
    <div class="scene-error">
      <strong>The 3D view could not start.</strong>
      <span>The controls and live mathematics remain available.</span>
    </div>`;
  geometryScene = { render() {}, resetCamera() {}, destroy() {} };
}

function announce(message) {
  elements.liveRegion.textContent = "";
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 30);
}

function syncRange(range, output, value, suffix = "") {
  if (!range || !output) return;
  range.value = String(value);
  output.textContent = `${formatNumber(value, suffix === "°" ? 0 : 2)}${suffix}`;
}



function syncControls(model) {
  syncRange(elements.orientationRange, elements.orientationValue, state.orientation, "°");
  syncRange(elements.tiltRange, elements.tiltValue, state.tilt, "°");
  syncRange(elements.offsetRange, elements.offsetValue, state.offset);
  syncRange(elements.dependenceRange, elements.dependenceValue, state.dependence);
  state.coefficients.forEach((value, index) => syncRange(elements.coefficientRanges[index], elements.coefficientValues[index], value));
  state.queryPoint.forEach((value, index) => syncRange(elements.queryRanges[index], elements.queryValues[index], value));
  elements.transformPreset.value = state.transformPreset;
  elements.transformProgress.value = String(state.transformProgress);
  elements.transformProgressValue.textContent = `${Math.round(state.transformProgress * 100)}%`;

  elements.orientationRange.disabled = model.n === 1;
  elements.tiltRange.disabled = model.n < 3;
  elements.offsetRange.disabled = model.requestedK === model.n;
  elements.dependenceRange.disabled = model.requestedK < 2;
  elements.coefficientRanges.forEach((range, index) => {
    if (range) range.disabled = index >= model.requestedK;
  });
  elements.queryRanges.forEach((range, index) => {
    range.disabled = index >= model.n;
  });

  elements.dimensionCells.forEach((cell) => {
    const active = Number(cell.dataset.n) === state.ambientDimension
      && Number(cell.dataset.k) === state.intrinsicDimension;
    cell.classList.toggle("is-active", active);
    cell.setAttribute("aria-pressed", String(active));
  });

  elements.representationTabs.forEach((tab) => {
    const active = tab.dataset.representation === state.representation;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  elements.mathRows.forEach((row) => {
    row.classList.toggle("is-active", row.dataset.representation === state.representation);
  });
}

function syncStatus(model) {
  elements.ambientBadge.innerHTML = `<b>Ambient</b> <i>n</i> = ${model.n}`;
  elements.objectBadge.innerHTML = `<b>Object</b> <i>k</i> = ${model.k}`;
  elements.rankBadge.innerHTML = `<b>Rank</b> ${model.rank}`;
  elements.rankBadge.dataset.status = model.isDependent ? "warning" : "ok";
  elements.sceneSummary.textContent = sceneSummary(model, state.chapter);
}

function renderAll() {
  currentModel = computeGeometry(state);
  updateLessonUI(state.chapter, elements);
  syncControls(currentModel);
  syncStatus(currentModel);
  renderMathPanel(currentModel, state, elements);
  geometryScene.render(currentModel, { chapter: state.chapter });
}

function setChapter(chapter, shouldAnnounce = true) {
  enterChapter(state, chapter);
  renderAll();
  geometryScene.resetCamera();
  if (shouldAnnounce) {
    announce(`Chapter ${state.chapter + 1}: ${LESSON_STEPS[state.chapter].title}.`);
  }
}

function bindScalarRange(range, stateKey, description) {
  range.addEventListener("input", () => {
    state[stateKey] = Number(range.value);
    state.revision += 1;
    renderAll();
  });
  range.addEventListener("change", () => {
    announce(`${description} is now ${formatNumber(state[stateKey])}.`);
  });
}

bindScalarRange(elements.orientationRange, "orientation", "Orientation");
bindScalarRange(elements.tiltRange, "tilt", "Tilt");
bindScalarRange(elements.offsetRange, "offset", "Offset");
bindScalarRange(elements.dependenceRange, "dependence", "Generator dependence");
bindScalarRange(elements.transformProgress, "transformProgress", "Transformation progress");

elements.coefficientRanges.forEach((range, index) => {
  if (!range) return;
  range.addEventListener("input", () => {
    state.coefficients[index] = Number(range.value);
    state.revision += 1;
    renderAll();
  });
  range.addEventListener("change", () => announce(`Coefficient ${index + 1} is now ${formatNumber(state.coefficients[index])}.`));
});

elements.queryRanges.forEach((range, index) => {
  range.addEventListener("input", () => {
    state.queryPoint[index] = Number(range.value);
    state.revision += 1;
    renderAll();
  });
  range.addEventListener("change", () => announce(`Query coordinate ${index + 1} is now ${formatNumber(state.queryPoint[index])}.`));
});

elements.transformPreset.addEventListener("change", () => {
  if (!Object.hasOwn(TRANSFORM_PRESETS, elements.transformPreset.value)) return;
  state.transformPreset = elements.transformPreset.value;
  state.transformProgress = 1;
  state.revision += 1;
  renderAll();
  announce(`Loaded ${TRANSFORM_PRESETS[state.transformPreset]}. Determinant ${formatNumber(currentModel.determinant)}.`);
});

elements.dimensionCells.forEach((cell) => {
  cell.addEventListener("click", () => {
    setDimension(state, Number(cell.dataset.n), Number(cell.dataset.k));
    renderAll();
    geometryScene.resetCamera();
    const name = objectName(currentModel.k, currentModel.n);
    announce(`Showing a ${name} in R ${currentModel.n}.`);
  });
});

elements.representationTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.representation = tab.dataset.representation;
    state.revision += 1;
    renderAll();
    announce(`Emphasizing the ${tab.textContent.trim()} representation.`);
  });
});

elements.lessonTabs.forEach((tab) => {
  tab.addEventListener("click", () => setChapter(Number(tab.dataset.step)));
});

elements.previousStep.addEventListener("click", () => setChapter(state.chapter - 1));
elements.nextStep.addEventListener("click", () => setChapter(state.chapter + 1));



window.addEventListener("beforeunload", () => geometryScene.destroy(), { once: true });

renderAll();
