import {
  HEIGHT,
  MARK_COUNT,
  MARK_STEP,
  MISSION_PHASES,
  WORLD_CATALOG,
  aggregateObservations,
  completeLaunchAnimation,
  completeTrial,
  distanceAtTime,
  estimateGravityFromTrials,
  findWorldByGuess,
  getMissionViewModel,
  makeCurve,
  newMission,
  repairMission,
  submitGuess,
  trueTimeAt
} from "./gravity-model.js";

const MARKS = Array.from({ length: MARK_COUNT }, (_, index) => (index + 1) * MARK_STEP);
const FLASH_DURATION = 0.45;
const FINAL_MARK_GRACE_MS = 650;
const PLAYBACK_SPEED = 1;
const CHART_MAX_TIME = 14;
const SUCCESS_LAUNCH_DURATION = 2500;
const FAILED_LAUNCH_DURATION = 2200;

const elements = {
  canvas: document.getElementById("scene"),
  clock: document.getElementById("clock"),
  markCount: document.getElementById("markCount"),
  nextMark: document.getElementById("nextMark"),
  trialCount: document.getElementById("trialCount"),
  showFlash: document.getElementById("showFlash"),
  resetButton: document.getElementById("resetBtn"),
  anotherTrialButton: document.getElementById("anotherTrialBtn"),
  csvButton: document.getElementById("csvBtn"),
  dataBody: document.getElementById("dataBody"),
  chartCanvas: document.getElementById("chart"),
  chartStatus: document.getElementById("chartStatus"),
  gravityEstimate: document.getElementById("gEstimate"),
  reactionDelay: document.getElementById("reactionDelay"),
  observationCount: document.getElementById("observationCount"),
  chartNote: document.getElementById("chartNote"),
  chartSummary: document.getElementById("chartSummary"),
  missionStatus: document.getElementById("missionStatus"),
  newMissionButton: document.getElementById("newMissionBtn"),
  liveRegion: document.getElementById("liveRegion"),
  navigationStatus: document.getElementById("navigationStatus"),
  guessForm: document.getElementById("worldGuessForm"),
  worldGuess: document.getElementById("worldGuess"),
  worldGuessHint: document.getElementById("worldGuessHint"),
  programLaunchButton: document.getElementById("programLaunchBtn"),
  guessFeedback: document.getElementById("guessFeedback"),
  guessHistoryWrap: document.getElementById("guessHistoryWrap"),
  guessHistory: document.getElementById("guessHistory"),
  missionOutcome: document.getElementById("missionOutcome"),
  outcomeTitle: document.getElementById("outcomeTitle"),
  outcomeMessage: document.getElementById("outcomeMessage"),
  truthDetails: document.getElementById("truthDetails"),
  revealedWorld: document.getElementById("revealedWorld"),
  revealedClassification: document.getElementById("revealedClassification"),
  revealedGravity: document.getElementById("revealedGravity"),
  revealedEstimate: document.getElementById("revealedEstimate"),
  revealedError: document.getElementById("revealedError"),
  repairButton: document.getElementById("repairBtn"),
  outcomeNewMissionButton: document.getElementById("outcomeNewMissionBtn")
};

const context = elements.canvas.getContext("2d");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const SCENE_WIDTH = elements.canvas.width;
const SCENE_HEIGHT = elements.canvas.height;
const DROP_TOP = 48;
const GROUND_Y = SCENE_HEIGHT - 56;
const PIXELS_PER_METER = (GROUND_Y - DROP_TOP) / HEIGHT;
const TOWER_X = SCENE_WIDTH * 0.69;
const TOWER_WIDTH = 30;
const BALL_X = TOWER_X - 7;
const BALL_RADIUS = 5;
const SHIP_ORIGIN_X = SCENE_WIDTH * 0.23;
const SHIP_ORIGIN_Y = GROUND_Y - 2;

const STARS = Array.from({ length: 92 }, (_, index) => ({
  x: (index * 83 + 19) % SCENE_WIDTH,
  y: (index * 149 + 31) % (GROUND_Y - 24),
  radius: index % 7 === 0 ? 1.45 : index % 3 === 0 ? 1 : 0.65,
  alpha: 0.24 + ((index * 37) % 58) / 100
}));

let mission = null;
let trial = null;
let showFlash = elements.showFlash.checked;
let chart = null;
let animationFrameId = null;
let previousFrameTime = 0;
let shipAnimation = null;
let shipRestingState = "landed";
let feedback = { message: "", kind: "" };

function createTrial() {
  return {
    status: "ready",
    simTime: 0,
    nextFlashIndex: 0,
    records: [],
    recordedMarkIndexes: new Set(),
    flashes: [],
    landingDeadline: null,
    committed: false
  };
}

function selectedWorld() {
  return WORLD_CATALOG.find((world) => world.id === mission.worldId);
}

function allCompletedObservations() {
  return aggregateObservations(mission.completedTrials) ?? [];
}

function currentAnalysisObservations() {
  const observations = [...allCompletedObservations()];
  if (!trial.committed) {
    observations.push(...trial.records.map(({ x, tObs }) => ({ x, tObs })));
  }
  return observations;
}

function currentAnalysisTrials() {
  const trials = mission.completedTrials.map((completedTrial) => ({
    observations: completedTrial.observations
  }));
  if (!trial.committed && trial.records.length > 0) {
    trials.push({ observations: trial.records });
  }
  return trials;
}

function rowsForDisplay() {
  const rows = [];
  mission.completedTrials.forEach((completedTrial, trialIndex) => {
    completedTrial.observations.forEach((record) => {
      rows.push({ trial: trialIndex + 1, ...record });
    });
  });

  if (!trial.committed) {
    const trialNumber = mission.completedTrials.length + 1;
    trial.records.forEach((record) => rows.push({ trial: trialNumber, ...record }));
  }

  return rows;
}

function currentTrialNumber() {
  return trial.committed
    ? Math.max(1, mission.completedTrials.length)
    : mission.completedTrials.length + 1;
}

function setClock(value) {
  const textNode = elements.clock.childNodes[0];
  if (textNode) {
    textNode.nodeValue = Number(value).toFixed(2);
  }
}

function announce(message) {
  elements.liveRegion.textContent = "";
  window.requestAnimationFrame(() => {
    elements.liveRegion.textContent = message;
  });
}

function setFeedback(message = "", kind = "") {
  feedback = { message, kind };
  elements.guessFeedback.textContent = message;
  elements.guessFeedback.classList.toggle("is-error", kind === "error");
  elements.guessFeedback.classList.toggle("is-success", kind === "success");
}

function publicPhase(view) {
  if (view.phase !== MISSION_PHASES.ACTIVE) {
    return view.phase;
  }
  if (trial.status === "falling" || trial.status === "landed") {
    return "dropping";
  }
  if (trial.status === "complete") {
    return view.estimate ? "identifying" : "analyzing";
  }
  return view.estimate ? "identifying" : "ready";
}

function renderMissionStatus(view) {
  const phase = publicPhase(view);
  document.body.dataset.missionPhase = phase;

  const labels = {
    ready: "Unknown world",
    dropping: "Collecting observations",
    analyzing: "More data required",
    identifying: "Navigation unlocked",
    [MISSION_PHASES.LAUNCHING_INCORRECT]: "Launch mismatch",
    [MISSION_PHASES.CRASHED]: "Craft requires repair",
    [MISSION_PHASES.LAUNCHING_CORRECT]: "World confirmed",
    [MISSION_PHASES.COMPLETE]: "Launch successful"
  };

  elements.missionStatus.textContent = labels[phase] ?? "Unknown world";
  if (view.reveal) {
    elements.missionStatus.textContent = `Confirmed: ${view.reveal.world.name}`;
  }
}

function renderExperiment(view) {
  const isAnimating = view.phase === MISSION_PHASES.LAUNCHING_CORRECT
    || view.phase === MISSION_PHASES.LAUNCHING_INCORRECT;
  const missionComplete = view.phase === MISSION_PHASES.COMPLETE;
  const active = view.phase === MISSION_PHASES.ACTIVE;

  setClock(trial.simTime);
  elements.markCount.textContent = `${trial.records.length} / ${MARK_COUNT}`;
  if (trial.status === "ready") {
    elements.nextMark.textContent = "5 m";
  } else if (trial.status === "landed") {
    elements.nextMark.textContent = "100 m";
  } else if (trial.status === "falling" && trial.nextFlashIndex < MARK_COUNT) {
    elements.nextMark.textContent = `${MARKS[trial.nextFlashIndex]} m`;
  } else {
    elements.nextMark.textContent = "—";
  }
  elements.trialCount.textContent = String(currentTrialNumber());


  elements.resetButton.disabled = !active || isAnimating || missionComplete;
  elements.anotherTrialButton.disabled = isAnimating
    || missionComplete
    || !(trial.status === "complete" || view.phase === MISSION_PHASES.CRASHED);
  elements.showFlash.disabled = isAnimating || missionComplete;
  elements.csvButton.disabled = rowsForDisplay().length === 0;

  const canGuess = view.canSubmitGuess
    && trial.status !== "falling"
    && trial.status !== "landed";
  elements.worldGuess.disabled = !canGuess;
  elements.programLaunchButton.disabled = !canGuess;

  if (view.reveal) {
    elements.navigationStatus.textContent = "Solution confirmed";
    elements.worldGuessHint.textContent = "Reference telemetry is unlocked.";
  } else if (view.phase === MISSION_PHASES.LAUNCHING_INCORRECT) {
    elements.navigationStatus.textContent = "Launch mismatch";
    elements.worldGuessHint.textContent = "The autopilot is testing the submitted navigation program.";
  } else if (view.phase === MISSION_PHASES.CRASHED) {
    elements.navigationStatus.textContent = "Repair required";
    elements.worldGuessHint.textContent = "Repair the craft before revising the launch program.";
  } else if (canGuess) {
    elements.navigationStatus.textContent = "Launch ready";
    elements.worldGuessHint.textContent = "Use your gravity estimate and outside research, then enter a world name.";
  } else if (trial.status === "falling" || trial.status === "landed") {
    elements.navigationStatus.textContent = "Telemetry active";
    elements.worldGuessHint.textContent = "Complete the current trial to unlock navigation.";
  } else {
    elements.navigationStatus.textContent = "Launch locked";
    elements.worldGuessHint.textContent = "Complete a trial with at least five observations to unlock navigation.";
  }
}

function renderMeasurements() {
  const rows = rowsForDisplay();
  elements.dataBody.innerHTML = rows.map((record) => {
    const mark = Math.round(record.x / MARK_STEP);
    return `<tr><td>${record.trial}</td><td>${mark}</td><td>${record.x.toFixed(0)}</td><td>${record.tObs.toFixed(3)}</td></tr>`;
  }).join("");

  const scrollContainer = elements.dataBody.closest(".table-scroll");
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
}

function liveEstimate() {
  return estimateGravityFromTrials(currentAnalysisTrials());
}

function renderAnalysis(view) {
  const estimate = liveEstimate();
  const observations = currentAnalysisObservations();
  elements.gravityEstimate.textContent = estimate ? estimate.gravity.toFixed(3) : "—";
  elements.reactionDelay.textContent = estimate
    ? `${estimate.delay >= 0 ? "+" : ""}${estimate.delay.toFixed(3)}`
    : "—";
  elements.observationCount.textContent = String(observations.length);

  if (view.reveal) {
    elements.chartStatus.textContent = "Reference revealed";
    elements.chartNote.textContent = "Red observations are recorded clicks, the dashed indigo curve is your estimate, and the solid mint curve is the revealed reference model.";
    elements.chartSummary.textContent = `The chart contains ${observations.length} observations, an estimated gravity curve, and the revealed ${view.reveal.world.name} reference curve.`;
  } else if (estimate) {
    elements.chartStatus.textContent = trial.status === "falling" ? "Fit updating" : "Estimate ready";
    elements.chartNote.textContent = "Red observations are recorded clicks. The dashed indigo curve is the current gravity estimate; the reference model remains hidden.";
    elements.chartSummary.textContent = `The chart contains ${observations.length} observations and an estimated gravity curve. The reference curve is hidden.`;
  } else {
    elements.chartStatus.textContent = observations.length ? "Gathering evidence" : "Awaiting observations";
    elements.chartNote.textContent = "Red observations are recorded clicks. The dashed indigo curve appears after enough evidence is available.";
    elements.chartSummary.textContent = observations.length
      ? `The chart contains ${observations.length} observations, not yet enough for a stable estimate.`
      : "The chart has no observations yet.";
  }

  renderChart(estimate, view);
}

function makeEstimatedCurve(estimate) {
  return makeCurve(estimate.gravity).map((point) => ({
    x: point.x + estimate.delay,
    y: point.y
  }));
}

function chartDatasets(estimate, view) {
  const observedPoints = currentAnalysisObservations().map(({ x, tObs }) => ({ x: tObs, y: x }));
  const datasets = [];

  if (view.reveal) {
    datasets.push({
      id: "reference",
      label: "Revealed reference: x = ½gt²",
      data: view.reveal.trueCurve,
      type: "line",
      borderColor: "#62d6a0",
      backgroundColor: "rgba(98, 214, 160, 0.12)",
      borderWidth: 2.4,
      pointRadius: 0,
      tension: 0.18,
      order: 3
    });
  }

  datasets.push({
    id: "estimate",
    label: "Estimated fit: x = ½ĝ(t − δ̂)²",
    data: estimate ? makeEstimatedCurve(estimate) : [],
    type: "line",
    borderColor: "#858cff",
    backgroundColor: "rgba(133, 140, 255, 0.1)",
    borderDash: [8, 5],
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.18,
    order: 2
  });

  datasets.push({
    id: "observations",
    label: "Observed clicks",
    data: observedPoints,
    backgroundColor: "#ff6476",
    borderColor: "#ffd0d6",
    borderWidth: 1.4,
    pointRadius: 4.5,
    pointHoverRadius: 6,
    order: 1
  });

  return datasets;
}

function renderChart(estimate, view) {
  const ChartConstructor = window.Chart;
  if (typeof ChartConstructor !== "function") {
    return;
  }

  const datasets = chartDatasets(estimate, view);
  if (chart) {
    chart.data.datasets = datasets;
    chart.update(reducedMotionQuery.matches ? "none" : undefined);
    return;
  }

  chart = new ChartConstructor(elements.chartCanvas, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,
      animation: reducedMotionQuery.matches ? false : { duration: 320 },
      scales: {
        x: {
          title: { display: true, text: "observed time t (s)", color: "#969fbd" },
          min: 0,
          max: CHART_MAX_TIME,
          grid: { color: "rgba(255, 255, 255, 0.055)" },
          ticks: { color: "#969fbd", maxTicksLimit: 8 }
        },
        y: {
          title: { display: true, text: "distance fallen x (m)", color: "#969fbd" },
          min: 0,
          max: HEIGHT,
          grid: { color: "rgba(255, 255, 255, 0.055)" },
          ticks: { color: "#969fbd", maxTicksLimit: 6 }
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 18,
            boxHeight: 2,
            color: "#f3f5ff",
            font: { size: 10 },
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label(tooltipContext) {
              const x = Number(tooltipContext.parsed.x).toFixed(2);
              const y = Number(tooltipContext.parsed.y).toFixed(1);
              return `${tooltipContext.dataset.label}: (${x} s, ${y} m)`;
            }
          }
        }
      }
    }
  });
}

function clearRevealFields() {
  elements.revealedWorld.textContent = "";
  elements.revealedClassification.textContent = "";
  elements.revealedGravity.textContent = "";
  elements.revealedEstimate.textContent = "";
  elements.revealedError.textContent = "";
}

function renderGuessHistory(view) {
  elements.guessHistory.innerHTML = view.incorrectGuesses
    .map((guess) => `<li>${guess.name}</li>`)
    .join("");
  elements.guessHistoryWrap.hidden = view.incorrectGuesses.length === 0;
}


function renderOutcome(view) {
  const failed = view.phase === MISSION_PHASES.LAUNCHING_INCORRECT
    || view.phase === MISSION_PHASES.CRASHED;
  const succeeded = view.phase === MISSION_PHASES.LAUNCHING_CORRECT
    || view.phase === MISSION_PHASES.COMPLETE;

  elements.missionOutcome.hidden = !(failed || succeeded);
  elements.missionOutcome.classList.toggle("outcome--failure", failed);
  elements.missionOutcome.classList.toggle("outcome--success", succeeded);
  elements.repairButton.hidden = view.phase !== MISSION_PHASES.CRASHED;
  elements.outcomeNewMissionButton.hidden = view.phase !== MISSION_PHASES.COMPLETE;

  if (failed) {
    elements.outcomeTitle.textContent = view.phase === MISSION_PHASES.CRASHED
      ? "Navigation mismatch — hard landing"
      : "Navigation mismatch";
    elements.outcomeMessage.textContent = view.phase === MISSION_PHASES.CRASHED
      ? "The launch program did not match the observed gravity. Repair the craft or collect another trial; the true location remains unknown."
      : "The spacecraft is attempting a launch with an incompatible navigation solution.";
    elements.truthDetails.hidden = true;
    clearRevealFields();
    return;
  }

  if (succeeded && view.reveal) {
    elements.outcomeTitle.textContent = `World confirmed: ${view.reveal.world.name}`;
    elements.outcomeMessage.textContent = view.phase === MISSION_PHASES.COMPLETE
      ? "Navigation solution accepted. The spacecraft has cleared the surface."
      : "Reference telemetry unlocked. Launch sequence in progress.";
    elements.truthDetails.hidden = false;
    elements.revealedWorld.textContent = view.reveal.world.name;
    elements.revealedClassification.textContent = view.reveal.world.classification;
    elements.revealedGravity.textContent = `${view.reveal.trueGravity.toFixed(2)} m/s²`;
    elements.revealedEstimate.textContent = `${view.estimate.gravity.toFixed(3)} m/s²`;
    elements.revealedError.textContent = `${view.reveal.percentageError.toFixed(1)}%`;
    return;
  }

  elements.truthDetails.hidden = true;
  clearRevealFields();
}

function renderAll() {
  const view = getMissionViewModel(mission);
  renderMissionStatus(view);
  renderExperiment(view);
  renderMeasurements();
  renderAnalysis(view);
  renderGuessHistory(view);
  renderOutcome(view);
  elements.guessFeedback.textContent = feedback.message;
  elements.guessFeedback.classList.toggle("is-error", feedback.kind === "error");
  elements.guessFeedback.classList.toggle("is-success", feedback.kind === "success");
  drawScene();
}

function invalidateAnimationLoop() {
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  shipAnimation = null;
  previousFrameTime = 0;
}

function scheduleFrame() {
  if (animationFrameId === null) {
    animationFrameId = window.requestAnimationFrame(frame);
  }
}

function startDrop() {
  const view = getMissionViewModel(mission);
  if (view.phase !== MISSION_PHASES.ACTIVE || trial.status !== "ready") {
    return;
  }

  trial.status = "falling";
  trial.simTime = 0;
  previousFrameTime = performance.now();
  setFeedback();
  renderAll();
  announce("Drop started. Record each red flash.");
  scheduleFrame();
}

function recordObservation() {
  if (
    (trial.status !== "falling" && trial.status !== "landed")
    || trial.nextFlashIndex === 0
  ) {
    return;
  }

  const markIndex = trial.nextFlashIndex - 1;
  if (trial.recordedMarkIndexes.has(markIndex)) {
    return;
  }

  trial.recordedMarkIndexes.add(markIndex);
  trial.records.push({
    mark: markIndex + 1,
    x: MARKS[markIndex],
    tObs: trial.simTime
  });
  elements.clock.classList.add("flash");
  window.setTimeout(() => elements.clock.classList.remove("flash"), 120);
  if (trial.status === "landed" && markIndex === MARK_COUNT - 1) {
    finishDrop();
  } else {
    renderAll();
  }
}

function handleSceneAction() {
  if (trial.status === "ready") {
    startDrop();
  } else if (trial.status === "falling" || trial.status === "landed") {
    recordObservation();
  }
}

function finishDrop() {
  if (trial.committed) {
    return;
  }
  trial.status = "complete";
  trial.simTime = Math.max(trial.simTime, trueTimeAt(HEIGHT, selectedWorld().gravity));
  trial.committed = true;
  mission = completeTrial(mission, trial.records);
  renderAll();

  const view = getMissionViewModel(mission);
  if (view.estimate) {
    announce(`Trial complete. Estimated gravity ${view.estimate.gravity.toFixed(3)} meters per second squared. Navigation is unlocked.`);
    elements.worldGuess.focus({ preventScroll: true });
  } else {
    announce("Trial complete. At least five observations are needed; run another trial.");
  }
}

function updateFalling(now) {
  const elapsedReal = Math.min(Math.max((now - previousFrameTime) / 1000, 0), 0.12);
  previousFrameTime = now;
  trial.simTime += elapsedReal * PLAYBACK_SPEED;

  while (
    trial.nextFlashIndex < MARK_COUNT
    && trial.simTime >= trueTimeAt(MARKS[trial.nextFlashIndex], selectedWorld().gravity)
  ) {
    trial.flashes.push({ index: trial.nextFlashIndex, startedAt: trial.simTime });
    trial.nextFlashIndex += 1;
  }

  const landingTime = trueTimeAt(HEIGHT, selectedWorld().gravity);
  if (trial.simTime >= landingTime) {
    trial.simTime = landingTime;
    trial.status = "landed";
    trial.landingDeadline = now + FINAL_MARK_GRACE_MS;
    previousFrameTime = now;
    const finalFlash = trial.flashes.find((flash) => flash.index === MARK_COUNT - 1);
    if (finalFlash) {
      finalFlash.startedAt = landingTime;
    }
  }
}

function updateLanded(now) {
  const elapsedReal = Math.min(Math.max((now - previousFrameTime) / 1000, 0), 0.12);
  previousFrameTime = now;
  trial.simTime += elapsedReal * PLAYBACK_SPEED;
  if (now >= trial.landingDeadline) {
    finishDrop();
  }
}

function frame(now) {
  animationFrameId = null;
  let shouldContinue = false;

  if (trial.status === "falling") {
    updateFalling(now);
    shouldContinue = trial.status === "falling" || trial.status === "landed";
  }
  if (trial.status === "landed") {
    updateLanded(now);
    shouldContinue = trial.status === "landed";
  }

  if (shipAnimation) {
    const progress = Math.min((now - shipAnimation.startedAt) / shipAnimation.duration, 1);
    shipAnimation.progress = Math.max(0, progress);
    if (progress >= 1) {
      finishShipAnimation();
    } else {
      shouldContinue = true;
    }
  }

  setClock(trial.simTime);
  if (trial.status === "falling") {
    elements.nextMark.textContent = trial.nextFlashIndex < MARK_COUNT
      ? `${MARKS[trial.nextFlashIndex]} m`
      : "100 m";
  } else if (trial.status === "landed") {
    elements.nextMark.textContent = "100 m";
  }
  drawScene();

  if (shouldContinue) {
    scheduleFrame();
  }
}

function startFreshTrial({ announceStart = true } = {}) {
  invalidateAnimationLoop();
  if (mission.phase === MISSION_PHASES.CRASHED) {
    mission = repairMission(mission);
  }
  trial = createTrial();
  shipRestingState = "landed";
  elements.worldGuess.value = "";
  setFeedback();
  renderAll();
  if (announceStart) {
    announce(`Trial ${currentTrialNumber()} ready. The hidden world is unchanged.`);
  }
}

function startNewMission() {
  invalidateAnimationLoop();
  mission = newMission();
  trial = createTrial();
  shipRestingState = "landed";
  elements.worldGuess.value = "";
  setFeedback();
  if (chart) {
    chart.destroy();
    chart = null;
  }
  renderAll();
  announce("New mission started on an unknown world.");
}

function handleGuessSubmit(event) {
  event.preventDefault();
  const view = getMissionViewModel(mission);
  if (
    !view.canSubmitGuess
    || trial.status === "falling"
    || trial.status === "landed"
  ) {
    return;
  }

  const value = elements.worldGuess.value;
  if (!value.trim()) {
    setFeedback("Enter a world name before programming the launch.", "error");
    return;
  }

  const guessedWorld = findWorldByGuess(value);
  if (!guessedWorld) {
    setFeedback("That is not a recognized world name.", "error");
    return;
  }

  if (mission.incorrectGuesses.includes(guessedWorld.id)) {
    setFeedback(`${guessedWorld.name} has already produced a navigation mismatch.`, "error");
    return;
  }

  const nextMission = submitGuess(mission, value);
  if (nextMission === mission) {
    return;
  }

  mission = nextMission;
  if (mission.phase === MISSION_PHASES.LAUNCHING_CORRECT) {
    setFeedback("Navigation solution accepted. Reference telemetry unlocked.", "success");
    announce("World confirmed. True gravity revealed. Successful launch sequence started.");
    renderAll();
    startShipAnimation("success");
  } else {
    setFeedback("Navigation mismatch. The true location remains unknown.", "error");
    announce("Incorrect world. Failed launch sequence started; true gravity remains hidden.");
    renderAll();
    startShipAnimation("failure");
  }
}

function startShipAnimation(kind) {
  const duration = kind === "success" ? SUCCESS_LAUNCH_DURATION : FAILED_LAUNCH_DURATION;
  if (reducedMotionQuery.matches) {
    shipRestingState = kind === "success" ? "escaped" : "crashed";
    mission = completeLaunchAnimation(mission);
    renderAll();
    finalizeShipOutcome(kind);
    return;
  }

  shipAnimation = {
    kind,
    duration,
    startedAt: performance.now(),
    progress: 0
  };
  scheduleFrame();
}

function finishShipAnimation() {
  if (!shipAnimation) {
    return;
  }
  const kind = shipAnimation.kind;
  shipAnimation = null;
  shipRestingState = kind === "success" ? "escaped" : "crashed";
  mission = completeLaunchAnimation(mission);
  renderAll();
  finalizeShipOutcome(kind);
}

function finalizeShipOutcome(kind) {
  if (kind === "success") {
    announce("Launch successful. The spacecraft has left the unknown world.");
  } else {
    announce("The spacecraft made a hard landing. Repair it or run another trial.");
  }
  elements.missionOutcome.focus({ preventScroll: false });
}

function repairCraft() {
  mission = repairMission(mission);
  shipRestingState = "landed";
  elements.worldGuess.value = "";
  setFeedback("Craft repaired. Revise the launch program or collect another trial.");
  renderAll();
  announce("Spacecraft repaired. The hidden world and measurements are unchanged.");
  elements.worldGuess.focus({ preventScroll: true });
}

function downloadCsv() {
  const rows = rowsForDisplay();
  if (!rows.length) {
    return;
  }

  const header = "trial,mark,distance_m,observed_time_s\n";
  const body = rows.map((record) => {
    const mark = Math.round(record.x / MARK_STEP);
    return `${record.trial},${mark},${record.x.toFixed(0)},${record.tObs.toFixed(4)}`;
  }).join("\n");
  const blob = new Blob([header + body + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gravity-unknown-observations.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function activeFlash(markIndex) {
  for (let index = trial.flashes.length - 1; index >= 0; index -= 1) {
    const flash = trial.flashes[index];
    if (flash.index === markIndex && trial.simTime - flash.startedAt < FLASH_DURATION) {
      return flash;
    }
  }
  return null;
}

function drawBackground() {
  const sky = context.createLinearGradient(0, 0, 0, SCENE_HEIGHT);
  sky.addColorStop(0, "#050711");
  sky.addColorStop(0.66, "#11162b");
  sky.addColorStop(1, "#1c2134");
  context.fillStyle = sky;
  context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  for (const star of STARS) {
    context.globalAlpha = star.alpha;
    context.fillStyle = "#dbe1ff";
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const horizonGlow = context.createLinearGradient(0, GROUND_Y - 130, 0, GROUND_Y);
  horizonGlow.addColorStop(0, "rgba(71, 79, 126, 0)");
  horizonGlow.addColorStop(1, "rgba(71, 79, 126, 0.22)");
  context.fillStyle = horizonGlow;
  context.fillRect(0, GROUND_Y - 130, SCENE_WIDTH, 130);

  context.fillStyle = "rgba(31, 37, 61, 0.9)";
  context.beginPath();
  context.moveTo(0, GROUND_Y);
  context.lineTo(0, GROUND_Y - 28);
  context.quadraticCurveTo(70, GROUND_Y - 60, 144, GROUND_Y - 24);
  context.quadraticCurveTo(220, GROUND_Y - 58, 302, GROUND_Y - 20);
  context.quadraticCurveTo(366, GROUND_Y - 42, SCENE_WIDTH, GROUND_Y - 22);
  context.lineTo(SCENE_WIDTH, GROUND_Y);
  context.closePath();
  context.fill();
}

function drawGround() {
  const ground = context.createLinearGradient(0, GROUND_Y, 0, SCENE_HEIGHT);
  ground.addColorStop(0, "#60677a");
  ground.addColorStop(1, "#303547");
  context.fillStyle = ground;
  context.fillRect(0, GROUND_Y, SCENE_WIDTH, SCENE_HEIGHT - GROUND_Y);

  context.strokeStyle = "rgba(219, 226, 255, 0.22)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, GROUND_Y + 0.5);
  context.lineTo(SCENE_WIDTH, GROUND_Y + 0.5);
  context.stroke();

  context.fillStyle = "rgba(5, 7, 14, 0.2)";
  for (const crater of [[34, 25, 18], [214, 31, 12], [354, 21, 21]]) {
    context.beginPath();
    context.ellipse(crater[0], GROUND_Y + crater[1], crater[2], crater[2] * 0.38, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawTower() {
  context.fillStyle = "#3d455e";
  context.fillRect(TOWER_X, DROP_TOP, TOWER_WIDTH, GROUND_Y - DROP_TOP);
  context.strokeStyle = "#232942";
  context.lineWidth = 1.2;
  context.strokeRect(TOWER_X, DROP_TOP, TOWER_WIDTH, GROUND_Y - DROP_TOP);

  context.strokeStyle = "rgba(181, 190, 228, 0.12)";
  for (let y = DROP_TOP + 18; y < GROUND_Y; y += 26) {
    context.beginPath();
    context.moveTo(TOWER_X, y);
    context.lineTo(TOWER_X + TOWER_WIDTH, y + 18);
    context.moveTo(TOWER_X + TOWER_WIDTH, y);
    context.lineTo(TOWER_X, y + 18);
    context.stroke();
  }

  context.font = "10px ui-monospace, SFMono-Regular, monospace";
  context.textBaseline = "middle";
  for (let index = 0; index < MARKS.length; index += 1) {
    const y = DROP_TOP + MARKS[index] * PIXELS_PER_METER;
    const flash = showFlash ? activeFlash(index) : null;

    if (flash) {
      const fade = Math.max(0, 1 - (trial.simTime - flash.startedAt) / FLASH_DURATION);
      context.save();
      context.shadowColor = "#ff6476";
      context.shadowBlur = 20 * fade;
      context.fillStyle = `rgba(255, 100, 118, ${0.55 + fade * 0.45})`;
      context.fillRect(TOWER_X - 5, y - 2.5, TOWER_WIDTH + 10, 5);
      context.restore();
    } else {
      context.fillStyle = "#a33f59";
      context.fillRect(TOWER_X, y - 1.5, TOWER_WIDTH, 3);
    }

    if (MARKS[index] % 25 === 0) {
      context.fillStyle = "#aab1ca";
      context.textAlign = "left";
      context.fillText(`${MARKS[index]} m`, TOWER_X + TOWER_WIDTH + 8, y);
    }
  }

  context.fillStyle = "#68718f";
  context.fillRect(TOWER_X - 10, DROP_TOP - 7, TOWER_WIDTH + 20, 7);
  context.fillStyle = "#858cff";
  context.fillRect(TOWER_X - 7, DROP_TOP - 10, 7, 3);
}

function drawBall() {
  let distance = 0;
  if (trial.status !== "ready") {
    distance = Math.min(distanceAtTime(trial.simTime, selectedWorld().gravity), HEIGHT);
  }
  const y = trial.status === "ready"
    ? DROP_TOP - BALL_RADIUS
    : DROP_TOP + distance * PIXELS_PER_METER;

  context.save();
  context.shadowColor = "rgba(255, 218, 91, 0.7)";
  context.shadowBlur = 8;
  const ball = context.createRadialGradient(BALL_X - 2, y - 2, 0.5, BALL_X, y, BALL_RADIUS);
  ball.addColorStop(0, "#fff6be");
  ball.addColorStop(1, "#f0bd32");
  context.fillStyle = ball;
  context.beginPath();
  context.arc(BALL_X, y, BALL_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value) {
  return value * value * value;
}

function resolvedShipPose() {
  if (!shipAnimation) {
    if (shipRestingState === "escaped") {
      return { visible: false };
    }
    if (shipRestingState === "crashed") {
      return {
        visible: true,
        x: SHIP_ORIGIN_X + 92,
        y: SHIP_ORIGIN_Y,
        rotation: 1.16,
        opacity: 1,
        flame: 0,
        dust: 0
      };
    }
    return {
      visible: true,
      x: SHIP_ORIGIN_X,
      y: SHIP_ORIGIN_Y,
      rotation: 0,
      opacity: 1,
      flame: 0,
      dust: 0
    };
  }

  const progress = shipAnimation.progress;
  if (shipAnimation.kind === "success") {
    const travel = easeInCubic(progress);
    return {
      visible: true,
      x: SHIP_ORIGIN_X + 64 * travel,
      y: SHIP_ORIGIN_Y - 760 * travel,
      rotation: 0.18 * easeOutCubic(progress),
      opacity: progress < 0.78 ? 1 : Math.max(0, 1 - (progress - 0.78) / 0.22),
      flame: Math.min(1, progress / 0.1),
      dust: progress < 0.18 ? 1 - progress / 0.18 : 0
    };
  }

  if (progress < 0.28) {
    const phase = easeOutCubic(progress / 0.28);
    return {
      visible: true,
      x: SHIP_ORIGIN_X + 8 * phase,
      y: SHIP_ORIGIN_Y - 68 * phase,
      rotation: 0.05 * phase,
      opacity: 1,
      flame: Math.min(1, progress / 0.08),
      dust: progress < 0.16 ? 1 - progress / 0.16 : 0
    };
  }

  if (progress < 0.78) {
    const phase = (progress - 0.28) / 0.5;
    return {
      visible: true,
      x: SHIP_ORIGIN_X + 8 + 76 * phase,
      y: SHIP_ORIGIN_Y - 68 + 54 * phase * phase,
      rotation: 0.08 + 0.9 * phase,
      opacity: 1,
      flame: Math.max(0, 1 - phase * 1.15),
      dust: 0
    };
  }

  const phase = easeOutCubic((progress - 0.78) / 0.22);
  return {
    visible: true,
    x: SHIP_ORIGIN_X + 84 + 8 * phase,
    y: SHIP_ORIGIN_Y - 14 + 14 * phase,
    rotation: 0.98 + 0.18 * phase,
    opacity: 1,
    flame: 0,
    dust: phase
  };
}

function drawDust(x, amount) {
  if (amount <= 0) {
    return;
  }
  context.save();
  context.globalAlpha = Math.min(0.55, amount * 0.55);
  context.fillStyle = "#c3bfd0";
  for (let index = 0; index < 6; index += 1) {
    const direction = index % 2 === 0 ? -1 : 1;
    const spread = amount * (10 + index * 5);
    context.beginPath();
    context.arc(
      x + direction * spread,
      GROUND_Y - 2 - amount * (index % 3) * 5,
      3 + amount * (7 - index * 0.6),
      0,
      Math.PI * 2
    );
    context.fill();
  }
  context.restore();
}

function drawShipBody(flame) {
  if (flame > 0) {
    const flameGradient = context.createLinearGradient(0, 0, 0, 24 + flame * 10);
    flameGradient.addColorStop(0, "rgba(255, 244, 176, 0.96)");
    flameGradient.addColorStop(0.45, "rgba(255, 153, 67, 0.9)");
    flameGradient.addColorStop(1, "rgba(255, 100, 118, 0)");
    context.fillStyle = flameGradient;
    context.beginPath();
    context.moveTo(-7, -2);
    context.quadraticCurveTo(0, 22 + flame * 12, 7, -2);
    context.closePath();
    context.fill();
  }

  context.fillStyle = "#d9deef";
  context.strokeStyle = "#555f7d";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(0, -50);
  context.quadraticCurveTo(19, -34, 15, -9);
  context.lineTo(9, 0);
  context.lineTo(-9, 0);
  context.lineTo(-15, -9);
  context.quadraticCurveTo(-19, -34, 0, -50);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#252d49";
  context.beginPath();
  context.moveTo(-14, -16);
  context.lineTo(-26, -3);
  context.lineTo(-10, -7);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(14, -16);
  context.lineTo(26, -3);
  context.lineTo(10, -7);
  context.closePath();
  context.fill();

  context.fillStyle = "#858cff";
  context.beginPath();
  context.arc(0, -29, 7, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(222, 229, 255, 0.7)";
  context.beginPath();
  context.arc(-2, -31, 2.2, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#707a98";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-9, -2);
  context.lineTo(-17, 8);
  context.lineTo(-23, 8);
  context.moveTo(9, -2);
  context.lineTo(17, 8);
  context.lineTo(23, 8);
  context.stroke();
}

function drawShip() {
  const pose = resolvedShipPose();
  if (!pose.visible || pose.opacity <= 0) {
    return;
  }

  drawDust(pose.x, pose.dust);
  context.save();
  context.globalAlpha = pose.opacity;
  context.translate(pose.x, pose.y);
  context.rotate(pose.rotation);
  drawShipBody(pose.flame);
  context.restore();
}

function drawSceneHud() {
  context.save();
  context.fillStyle = "rgba(7, 10, 18, 0.7)";
  context.fillRect(12, 12, 174, 34);
  context.strokeStyle = "rgba(176, 180, 255, 0.25)";
  context.strokeRect(12.5, 12.5, 173, 33);
  context.fillStyle = "#b0b4ff";
  context.font = "700 9px ui-monospace, SFMono-Regular, monospace";
  context.textAlign = "left";
  context.fillText("UNKNOWN SITE // VISUAL ID OFFLINE", 22, 33);
  context.restore();
}

function drawScene() {
  drawBackground();
  drawGround();
  drawShip();
  drawTower();
  drawBall();
  drawSceneHud();
}

function bindEvents() {
  elements.canvas.addEventListener("click", handleSceneAction);
  elements.canvas.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      if (!event.repeat) {
        handleSceneAction();
      }
    }
  });


  elements.showFlash.addEventListener("change", () => {
    showFlash = elements.showFlash.checked;
    drawScene();
  });

  elements.resetButton.addEventListener("click", () => startFreshTrial());
  elements.anotherTrialButton.addEventListener("click", () => startFreshTrial());
  elements.csvButton.addEventListener("click", downloadCsv);
  elements.newMissionButton.addEventListener("click", startNewMission);
  elements.outcomeNewMissionButton.addEventListener("click", startNewMission);
  elements.repairButton.addEventListener("click", repairCraft);
  elements.guessForm.addEventListener("submit", handleGuessSubmit);
  elements.worldGuess.addEventListener("input", () => {
    if (feedback.kind === "error") {
      setFeedback();
    }
  });

  reducedMotionQuery.addEventListener?.("change", () => {
    if (chart) {
      chart.options.animation = reducedMotionQuery.matches ? false : { duration: 320 };
    }
    if (reducedMotionQuery.matches && shipAnimation) {
      const kind = shipAnimation.kind;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      shipAnimation = null;
      shipRestingState = kind === "success" ? "escaped" : "crashed";
      mission = completeLaunchAnimation(mission);
      renderAll();
      finalizeShipOutcome(kind);
    }
  });
}

function initialize() {
  bindEvents();
  startNewMission();
}

initialize();
