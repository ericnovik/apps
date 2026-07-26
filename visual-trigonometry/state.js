import { normalizeAngle, TAU, unwrapAngle } from "./model.js";

export const BASE_ANGULAR_SPEED = TAU / 8;

const IDENTITY_MODE_IDS = new Set([
  "coordinates",
  "norm",
  "addition",
  "powers",
  "conjugate",
  "quarter-turn"
]);

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function createState({ reducedMotion = false } = {}) {
  return {
    unwrappedTheta: Math.PI / 4,
    radius: 1,
    playing: !reducedMotion,
    speedMultiplier: 1,
    direction: 1,
    angleUnit: "radians",
    snapToExactAngles: false,
    identityMode: "coordinates",
    alpha: Math.PI / 6,
    beta: Math.PI / 12,
    power: 2,
    plotEndpoint: null,
    principalEndpoint: null,
    dragging: false,
    resumeAfterDrag: false,
    reducedMotion: Boolean(reducedMotion),
    revision: 0
  };
}

function syncAdditionComponents(state) {
  if (state.identityMode !== "addition") return;
  state.beta = unwrapAngle(state.beta, state.unwrappedTheta - state.alpha);
}

function syncAdditionResult(state) {
  state.unwrappedTheta = unwrapAngle(
    state.unwrappedTheta,
    state.alpha + state.beta
  );
  state.plotEndpoint = null;
  state.principalEndpoint = null;
}

export function setPrincipalAngle(state, nextAngle) {
  if (!Number.isFinite(nextAngle)) return;
  state.unwrappedTheta = unwrapAngle(state.unwrappedTheta, nextAngle);
  state.plotEndpoint = null;
  state.principalEndpoint = Math.abs(nextAngle - Math.PI) <= 1e-10
    ? "positive"
    : Math.abs(nextAngle + Math.PI) <= 1e-10
      ? "negative"
      : null;
  syncAdditionComponents(state);
  state.revision += 1;
}

export function setWaveAngle(state, phaseAngle) {
  if (!Number.isFinite(phaseAngle)) return;
  const phase = Math.min(TAU, Math.max(0, phaseAngle));
  const normalizedCurrent = normalizeAngle(state.unwrappedTheta);
  const atDisplayedEnd = normalizedCurrent === 0 && state.plotEndpoint === "end";
  const cycleStart = state.unwrappedTheta - normalizedCurrent - (atDisplayedEnd ? TAU : 0);
  state.unwrappedTheta = cycleStart + phase;
  state.plotEndpoint = phase === TAU ? "end" : null;
  state.principalEndpoint = Math.abs(phase - Math.PI) <= 1e-10 ? "positive" : null;
  syncAdditionComponents(state);
  state.revision += 1;
}

export function selectExactAngle(state, angle) {
  if (!Number.isFinite(angle)) return;

  if (Math.abs(angle - TAU) <= 1e-10) {
    const normalizedCurrent = normalizeAngle(state.unwrappedTheta);
    if (Math.abs(state.unwrappedTheta) <= 1e-10) {
      state.unwrappedTheta = TAU;
    } else if (normalizedCurrent !== 0) {
      state.unwrappedTheta += TAU - normalizedCurrent;
    }
    state.plotEndpoint = "end";
    state.principalEndpoint = null;
  } else {
    state.unwrappedTheta = unwrapAngle(state.unwrappedTheta, angle);
    state.plotEndpoint = null;
    state.principalEndpoint = Math.abs(angle - Math.PI) <= 1e-10 ? "positive" : null;
  }

  syncAdditionComponents(state);
  state.revision += 1;
}

export function stepAngle(state, delta) {
  if (!Number.isFinite(delta)) return;
  state.unwrappedTheta += delta;
  state.plotEndpoint = null;
  state.principalEndpoint = null;
  syncAdditionComponents(state);
  state.revision += 1;
}

export function homeAngle(state) {
  state.unwrappedTheta = unwrapAngle(state.unwrappedTheta, 0);
  state.plotEndpoint = null;
  state.principalEndpoint = null;
  syncAdditionComponents(state);
  state.revision += 1;
}

export function setRadius(state, radius) {
  const finiteRadius = finiteOr(radius, state.radius);
  state.radius = Math.min(2, Math.max(0, finiteRadius));
  state.revision += 1;
}

export function togglePlayback(state, force) {
  state.playing = typeof force === "boolean" ? force : !state.playing;
  state.revision += 1;
}

export function setDirection(state, direction) {
  state.direction = direction < 0 ? -1 : 1;
  state.revision += 1;
}

export function setSpeedMultiplier(state, multiplier) {
  const finiteMultiplier = finiteOr(multiplier, 1);
  state.speedMultiplier = Math.min(4, Math.max(0.05, finiteMultiplier));
  state.revision += 1;
}

export function setAngleUnit(state, unit) {
  state.angleUnit = unit === "degrees" ? "degrees" : "radians";
  state.revision += 1;
}

export function setSnapToExactAngles(state, enabled) {
  state.snapToExactAngles = Boolean(enabled);
  state.revision += 1;
}

export function setIdentityMode(state, mode) {
  state.identityMode = IDENTITY_MODE_IDS.has(mode) ? mode : "coordinates";
  syncAdditionComponents(state);
  state.revision += 1;
}

export function setIdentityAlpha(state, alpha) {
  if (!Number.isFinite(alpha)) return;
  state.alpha = alpha;
  if (state.identityMode === "addition") syncAdditionResult(state);
  state.revision += 1;
}

export function setIdentityBeta(state, beta) {
  if (!Number.isFinite(beta)) return;
  state.beta = beta;
  if (state.identityMode === "addition") syncAdditionResult(state);
  state.revision += 1;
}

export function setIdentityPower(state, power) {
  if (!Number.isFinite(power)) return;
  state.power = Math.min(6, Math.max(2, Math.round(power)));
  state.revision += 1;
}

export function beginAngleInteraction(state) {
  if (state.dragging) return;
  state.resumeAfterDrag = state.playing;
  state.dragging = true;
  state.playing = false;
  state.revision += 1;
}

export function endAngleInteraction(state) {
  if (!state.dragging) return;
  state.dragging = false;
  state.playing = state.resumeAfterDrag;
  state.resumeAfterDrag = false;
  state.revision += 1;
}

export function advanceAnimation(state, elapsedSeconds) {
  if (!state.playing || state.dragging || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return false;
  }

  const boundedElapsed = Math.min(elapsedSeconds, 0.1);
  state.unwrappedTheta += state.direction * BASE_ANGULAR_SPEED * state.speedMultiplier * boundedElapsed;
  state.plotEndpoint = null;
  state.principalEndpoint = null;
  syncAdditionComponents(state);
  state.revision += 1;
  return true;
}
