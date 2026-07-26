import { recognizeExactAngle } from "./exact-values.js";
import { computeIdentityModel } from "./identity-model.js";

export const TAU = 2 * Math.PI;

const DEFAULT_THETA = Math.PI / 4;
const DEFAULT_RADIUS = 1;
const MAX_RADIUS = 2;
const ZERO_TOLERANCE = 1e-12;
const MAX_ANGLE_BOUNDARY_TOLERANCE = 1e-9;

function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanZero(value, tolerance = ZERO_TOLERANCE) {
  return Math.abs(value) < tolerance || Object.is(value, -0) ? 0 : value;
}

function cleanUnitValue(value) {
  return cleanZero(value);
}

function angleBoundaryTolerance(theta) {
  const scaledTolerance = 4 * Number.EPSILON * Math.max(1, Math.abs(theta));
  return Math.min(MAX_ANGLE_BOUNDARY_TOLERANCE, scaledTolerance);
}

function completedRevolutions(theta) {
  const rawTurns = theta / TAU;
  const nearestInteger = Math.round(rawTurns);
  const turnTolerance = angleBoundaryTolerance(theta) / TAU;
  const stableTurns = Math.abs(rawTurns - nearestInteger) <= turnTolerance
    ? nearestInteger
    : Math.trunc(rawTurns);
  return stableTurns === 0 ? 0 : stableTurns;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function normalizeAngle(theta) {
  const finiteTheta = finiteOr(theta, 0);
  let normalized = finiteTheta % TAU;

  if (normalized < 0) {
    normalized += TAU;
  }

  const boundaryTolerance = angleBoundaryTolerance(finiteTheta);

  // Modulo arithmetic can leave an ulp-sized remainder at an exact turn.
  if (
    normalized >= TAU
    || normalized <= boundaryTolerance
    || TAU - normalized <= boundaryTolerance
    || Object.is(normalized, -0)
  ) {
    return 0;
  }

  return normalized;
}

export function principalAngle(theta) {
  const finiteTheta = finiteOr(theta, 0);
  const normalized = normalizeAngle(finiteTheta);

  if (Math.abs(normalized - Math.PI) <= angleBoundaryTolerance(finiteTheta)) {
    return -Math.PI;
  }

  const principal = normalized >= Math.PI ? normalized - TAU : normalized;
  return Object.is(principal, -0) ? 0 : principal;
}

export function unwrapAngle(previousUnwrapped, nextAngle) {
  const previous = finiteOr(previousUnwrapped, 0);

  if (typeof nextAngle !== "number" || !Number.isFinite(nextAngle)) {
    return Object.is(previous, -0) ? 0 : previous;
  }

  const previousPhase = principalAngle(previous);
  const nextPhase = principalAngle(nextAngle);
  const delta = principalAngle(nextPhase - previousPhase);
  const unwrapped = previous + delta;
  return Object.is(unwrapped, -0) ? 0 : unwrapped;
}

export function polarToCartesian(radius, theta) {
  const safeRadius = finiteOr(radius, 0);
  const safeTheta = finiteOr(theta, 0);
  const cosine = cleanUnitValue(Math.cos(safeTheta));
  const sine = cleanUnitValue(Math.sin(safeTheta));

  return {
    x: cleanZero(safeRadius * cosine, 0),
    y: cleanZero(safeRadius * sine, 0)
  };
}

export function cartesianToPolar(x, y, fallbackTheta = 0) {
  const safeX = finiteOr(x, 0);
  const safeY = finiteOr(y, 0);
  const radius = Math.hypot(safeX, safeY);

  if (radius === 0) {
    return {
      radius: 0,
      theta: normalizeAngle(fallbackTheta)
    };
  }

  return {
    radius,
    theta: normalizeAngle(Math.atan2(safeY, safeX))
  };
}

export function computeTrigModel(state) {
  const source = state !== null && typeof state === "object" ? state : {};
  const unwrappedTheta = finiteOr(source.unwrappedTheta, DEFAULT_THETA);
  const inputRadius = finiteOr(source.radius, DEFAULT_RADIUS);
  const clampedRadius = Math.min(MAX_RADIUS, Math.max(0, inputRadius));
  const radius = Object.is(clampedRadius, -0) ? 0 : clampedRadius;

  const normalizedTheta = normalizeAngle(unwrappedTheta);
  const principalTheta = principalAngle(unwrappedTheta);
  const displayTheta = principalTheta === -Math.PI
    && (source.principalEndpoint === "positive" || (
      source.principalEndpoint !== "negative" && unwrappedTheta > 0
    ))
    ? Math.PI
    : principalTheta;
  const plotTheta = normalizedTheta === 0 && source.plotEndpoint === "end"
    ? TAU
    : normalizedTheta;
  const cosTheta = cleanUnitValue(Math.cos(unwrappedTheta));
  const sinTheta = cleanUnitValue(Math.sin(unwrappedTheta));
  const unitPoint = { x: cosTheta, y: sinTheta };
  const polarPoint = {
    x: cleanZero(radius * cosTheta, 0),
    y: cleanZero(radius * sinTheta, 0)
  };
  const rawUnitNormSquared = cosTheta * cosTheta + sinTheta * sinTheta;
  const rawPythagoreanResidual = rawUnitNormSquared - 1;
  const pythagoreanResidual = cleanZero(rawPythagoreanResidual);
  const unitNormSquared = pythagoreanResidual === 0 ? 1 : rawUnitNormSquared;
  const polarRadiusResidual = cleanZero(Math.hypot(polarPoint.x, polarPoint.y) - radius);
  const revolutions = completedRevolutions(unwrappedTheta);
  const exactAngle = recognizeExactAngle(unwrappedTheta);
  const identity = computeIdentityModel({
    mode: source.identityMode,
    theta: unwrappedTheta,
    radius,
    alpha: source.alpha,
    beta: source.beta,
    power: source.power
  });

  return deepFreeze({
    theta: unwrappedTheta,
    unwrappedTheta,
    normalizedTheta,
    principalTheta,
    displayTheta,
    plotTheta,
    revolutions,
    radius,
    cosTheta,
    sinTheta,
    exactAngle,
    exactCos: exactAngle?.cos ?? null,
    exactSin: exactAngle?.sin ?? null,
    identity,
    identityConstruction: identity,
    degrees: unwrappedTheta * (180 / Math.PI),
    unitPoint,
    polarPoint,
    complex: {
      real: polarPoint.x,
      imaginary: polarPoint.y,
      modulus: radius,
      argument: unwrappedTheta
    },
    checks: {
      unitNormSquared,
      pythagoreanResidual,
      polarRadiusResidual
    }
  });
}

export function formatNumber(value, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }

  const precision = typeof digits === "number" && Number.isFinite(digits)
    ? Math.min(100, Math.max(0, Math.trunc(digits)))
    : 3;
  const zeroThreshold = 0.5 * 10 ** -precision;
  const cleaned = Math.abs(value) < zeroThreshold || Object.is(value, -0) ? 0 : value;
  const formatted = cleaned.toFixed(precision);

  if (!formatted.includes(".")) {
    return formatted;
  }

  return formatted
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}
