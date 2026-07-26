import assert from "node:assert/strict";

import { recognizeExactAngle } from "./exact-values.js";
import {
  TAU,
  normalizeAngle,
  principalAngle,
  unwrapAngle,
  polarToCartesian,
  cartesianToPolar,
  computeTrigModel,
  formatNumber
} from "./model.js";

const EPSILON = 1e-11;
let passed = 0;

function closeTo(actual, expected, tolerance = EPSILON, message = undefined) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function anglesEquivalent(actual, expected, tolerance = EPSILON) {
  closeTo(principalAngle(actual - expected), 0, tolerance);
}

function test(name, callback) {
  callback();
  passed += 1;
  console.log(`✓ ${name}`);
}

function createRandom(seed = 0x5eed1234) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function assertDeeplyFrozen(value) {
  if (value === null || typeof value !== "object") {
    return;
  }

  assert.ok(Object.isFrozen(value), "Expected every model object to be frozen");
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child);
  }
}

test("TAU and angle normalization have stable boundaries", () => {
  assert.equal(TAU, 2 * Math.PI);
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(-0), 0);
  assert.equal(normalizeAngle(TAU), 0);
  assert.equal(normalizeAngle(-TAU), 0);
  assert.equal(normalizeAngle(4 * TAU), 0);
  assert.equal(normalizeAngle(-4 * TAU), 0);
  closeTo(normalizeAngle(-Math.PI / 2), 3 * Math.PI / 2);

  assert.equal(principalAngle(Math.PI), -Math.PI);
  assert.equal(principalAngle(-Math.PI), -Math.PI);
  assert.equal(principalAngle(3 * Math.PI), -Math.PI);
  assert.equal(principalAngle(-3 * Math.PI), -Math.PI);
  assert.ok(principalAngle(Math.PI - 1e-9) > 0);
  assert.ok(principalAngle(Math.PI + 1e-9) < 0);
});

test("normal and principal angles are periodic and stay in their ranges", () => {
  const samples = [-5.7, -Math.PI, -0.25, 0, 0.25, Math.PI, 8.9];

  for (const sample of samples) {
    const normalized = normalizeAngle(sample);
    const principal = principalAngle(sample);
    assert.ok(normalized >= 0 && normalized < TAU);
    assert.ok(principal >= -Math.PI && principal < Math.PI);

    for (let turns = -8; turns <= 8; turns += 1) {
      closeTo(normalizeAngle(sample + turns * TAU), normalized);
      closeTo(principalAngle(sample + turns * TAU), principal);
    }
  }
});

test("unwrapAngle is continuous in both branch-cut directions", () => {
  const offset = 0.04;
  closeTo(
    unwrapAngle(Math.PI - offset, -Math.PI + offset),
    Math.PI + offset
  );
  closeTo(
    unwrapAngle(-Math.PI + offset, Math.PI - offset),
    -Math.PI - offset
  );
});

test("unwrapAngle chooses the nearest equivalent phase across many turns", () => {
  closeTo(
    unwrapAngle(7 * TAU + 0.2, -0.1),
    7 * TAU - 0.1
  );
  closeTo(
    unwrapAngle(-6 * TAU - 0.2, 0.15),
    -6 * TAU + 0.15
  );
  closeTo(
    unwrapAngle(3 * TAU + 0.3, -9 * TAU + 0.4),
    3 * TAU + 0.4
  );
  assert.equal(unwrapAngle(0, Math.PI), -Math.PI);
  assert.equal(unwrapAngle(0, -Math.PI), -Math.PI);
});

test("polar and Cartesian conversions handle cardinal directions", () => {
  const cardinals = [
    [0, 2, 0],
    [Math.PI / 2, 0, 2],
    [Math.PI, -2, 0],
    [3 * Math.PI / 2, 0, -2]
  ];

  for (const [theta, expectedX, expectedY] of cardinals) {
    const point = polarToCartesian(2, theta);
    closeTo(point.x, expectedX);
    closeTo(point.y, expectedY);
  }

  const polarCardinals = [
    [1, 0, 0],
    [0, 1, Math.PI / 2],
    [-1, 0, Math.PI],
    [0, -1, 3 * Math.PI / 2]
  ];

  for (const [x, y, expectedTheta] of polarCardinals) {
    const polar = cartesianToPolar(x, y);
    closeTo(polar.radius, 1);
    closeTo(polar.theta, expectedTheta);
  }
});

test("polar and Cartesian conversions round-trip deterministic random samples", () => {
  const random = createRandom();

  for (let index = 0; index < 300; index += 1) {
    const radius = 0.01 + random() * 10;
    const theta = (random() * 40 - 20) * TAU;
    const point = polarToCartesian(radius, theta);
    const roundTrip = cartesianToPolar(point.x, point.y);

    closeTo(roundTrip.radius, radius, 1e-10);
    anglesEquivalent(roundTrip.theta, theta, 1e-10);
  }
});

test("Cartesian origin preserves a normalized fallback angle", () => {
  const negativeFallback = cartesianToPolar(0, 0, -Math.PI / 2);
  const multiTurnFallback = cartesianToPolar(-0, -0, 5 * TAU + Math.PI / 3);

  assert.equal(negativeFallback.radius, 0);
  closeTo(negativeFallback.theta, 3 * Math.PI / 2);
  assert.equal(multiTurnFallback.radius, 0);
  closeTo(multiTurnFallback.theta, Math.PI / 3);
});

test("representative and random unit points preserve the unit norm", () => {
  const representative = [
    -4 * Math.PI,
    -Math.PI,
    -Math.PI / 2,
    0,
    Math.PI / 6,
    Math.PI / 4,
    Math.PI / 2,
    Math.PI,
    9 * Math.PI / 2
  ];
  const random = createRandom(0xc1cc1e);
  const angles = [
    ...representative,
    ...Array.from({ length: 400 }, () => (random() * 200 - 100) * TAU)
  ];

  for (const unwrappedTheta of angles) {
    const model = computeTrigModel({ unwrappedTheta, radius: 1 });
    closeTo(model.unitPoint.x ** 2 + model.unitPoint.y ** 2, 1);
    closeTo(model.checks.unitNormSquared, 1);
    assert.equal(model.checks.pythagoreanResidual, 0);
  }
});

test("radius scales the polar point, supports zero, and clamps to 0 through 2", () => {
  const theta = Math.PI / 3;
  const unit = computeTrigModel({ unwrappedTheta: theta, radius: 1 });
  const doubled = computeTrigModel({ unwrappedTheta: theta, radius: 2 });
  const zero = computeTrigModel({ unwrappedTheta: theta, radius: 0 });
  const below = computeTrigModel({ unwrappedTheta: theta, radius: -3 });
  const above = computeTrigModel({ unwrappedTheta: theta, radius: 8 });

  closeTo(doubled.polarPoint.x, 2 * unit.unitPoint.x);
  closeTo(doubled.polarPoint.y, 2 * unit.unitPoint.y);
  assert.deepEqual(zero.polarPoint, { x: 0, y: 0 });
  assert.deepEqual(zero.complex, {
    real: 0,
    imaginary: 0,
    modulus: 0,
    argument: theta
  });
  assert.equal(below.radius, 0);
  assert.equal(above.radius, 2);
  assert.equal(below.checks.polarRadiusResidual, 0);
  assert.equal(above.checks.polarRadiusResidual, 0);
});

test("computeTrigModel keeps every representation consistent", () => {
  const unwrappedTheta = 5 * TAU + Math.PI / 3;
  const radius = 1.75;
  const model = computeTrigModel({
    unwrappedTheta,
    radius,
    ignored: "extra state does not enter the model"
  });

  assert.equal(model.theta, unwrappedTheta);
  assert.equal(model.unwrappedTheta, unwrappedTheta);
  closeTo(model.normalizedTheta, Math.PI / 3);
  closeTo(model.principalTheta, Math.PI / 3);
  closeTo(model.displayTheta, Math.PI / 3);
  closeTo(model.plotTheta, Math.PI / 3);
  assert.equal(model.revolutions, 5);
  assert.equal(model.radius, radius);
  closeTo(model.degrees, 5 * 360 + 60);
  assert.equal(model.exactAngle, recognizeExactAngle(unwrappedTheta));
  assert.equal(model.exactCos, model.exactAngle.cos);
  assert.equal(model.exactSin, model.exactAngle.sin);
  assert.deepEqual(model.unitPoint, { x: model.cosTheta, y: model.sinTheta });
  closeTo(model.polarPoint.x, radius * model.cosTheta);
  closeTo(model.polarPoint.y, radius * model.sinTheta);
  assert.deepEqual(model.complex, {
    real: model.polarPoint.x,
    imaginary: model.polarPoint.y,
    modulus: radius,
    argument: unwrappedTheta
  });
  assert.equal(model.checks.pythagoreanResidual, 0);
  assert.equal(model.checks.polarRadiusResidual, 0);
  assert.ok(!Object.hasOwn(model, "ignored"));
});

test("display and plot representatives preserve signed and endpoint intent", () => {
  const positivePi = computeTrigModel({ unwrappedTheta: Math.PI, radius: 1 });
  const negativePi = computeTrigModel({ unwrappedTheta: -Math.PI, radius: 1 });
  const positiveEndpoint = computeTrigModel({
    unwrappedTheta: -Math.PI,
    principalEndpoint: "positive",
    radius: 1
  });
  const endOfTurn = computeTrigModel({
    unwrappedTheta: TAU,
    plotEndpoint: "end",
    radius: 1
  });
  const startOfTurn = computeTrigModel({ unwrappedTheta: TAU, radius: 1 });

  assert.equal(positivePi.displayTheta, Math.PI);
  assert.equal(negativePi.displayTheta, -Math.PI);
  assert.equal(positiveEndpoint.displayTheta, Math.PI);
  assert.equal(endOfTurn.plotTheta, TAU);
  assert.equal(startOfTurn.plotTheta, 0);
});

test("arbitrary angles do not claim symbolic exact values", () => {
  const model = computeTrigModel({ unwrappedTheta: 0.37, radius: 1 });
  assert.equal(model.exactAngle, null);
  assert.equal(model.exactCos, null);
  assert.equal(model.exactSin, null);
});

test("invalid model state falls back safely", () => {
  const invalid = computeTrigModel({
    unwrappedTheta: Number.NaN,
    radius: Number.POSITIVE_INFINITY
  });
  const nonNumeric = computeTrigModel({ unwrappedTheta: "1", radius: "2" });
  const absent = computeTrigModel(null);

  for (const model of [invalid, nonNumeric, absent]) {
    assert.equal(model.theta, Math.PI / 4);
    assert.equal(model.radius, 1);
    closeTo(model.cosTheta, Math.SQRT1_2);
    closeTo(model.sinTheta, Math.SQRT1_2);
  }
});

test("revolution counts represent completed signed turns", () => {
  let steppedPositiveTurn = 0;
  let steppedNegativeTurn = 0;
  for (let step = 0; step < 24; step += 1) {
    steppedPositiveTurn += Math.PI / 12;
    steppedNegativeTurn -= Math.PI / 12;
  }

  assert.equal(computeTrigModel({ unwrappedTheta: steppedPositiveTurn, radius: 1 }).revolutions, 1);
  assert.equal(computeTrigModel({ unwrappedTheta: steppedNegativeTurn, radius: 1 }).revolutions, -1);
  assert.equal(computeTrigModel({ unwrappedTheta: -0.01, radius: 1 }).revolutions, 0);
  assert.ok(!Object.is(computeTrigModel({ unwrappedTheta: -0.01, radius: 1 }).revolutions, -0));
  assert.equal(computeTrigModel({ unwrappedTheta: -TAU + 0.01, radius: 1 }).revolutions, 0);
  assert.equal(computeTrigModel({ unwrappedTheta: -TAU, radius: 1 }).revolutions, -1);
  assert.equal(computeTrigModel({ unwrappedTheta: -2.4 * TAU, radius: 1 }).revolutions, -2);
  assert.equal(computeTrigModel({ unwrappedTheta: TAU - 0.01, radius: 1 }).revolutions, 0);
  assert.equal(computeTrigModel({ unwrappedTheta: TAU, radius: 1 }).revolutions, 1);
  assert.equal(computeTrigModel({ unwrappedTheta: 2.4 * TAU, radius: 1 }).revolutions, 2);
});

test("formatNumber rounds, trims, and removes negative zero", () => {
  assert.equal(formatNumber(Math.PI), "3.142");
  assert.equal(formatNumber(1), "1");
  assert.equal(formatNumber(1.2), "1.2");
  assert.equal(formatNumber(1.23456, 2), "1.23");
  assert.equal(formatNumber(1.6, 0), "2");
  assert.equal(formatNumber(-0), "0");
  assert.equal(formatNumber(-0.0004), "0");
  assert.equal(formatNumber(-0.0006), "-0.001");
  assert.equal(formatNumber(Number.NaN), "NaN");
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), "Infinity");
});

test("computed models are deeply immutable", () => {
  const model = computeTrigModel({ unwrappedTheta: 0.7, radius: 1.4 });
  assertDeeplyFrozen(model);

  assert.throws(() => {
    model.radius = 0;
  }, TypeError);
  assert.throws(() => {
    model.unitPoint.x = 99;
  }, TypeError);
  assert.throws(() => {
    model.complex.argument = 0;
  }, TypeError);
  assert.throws(() => {
    model.checks.pythagoreanResidual = 10;
  }, TypeError);
});

console.log(`\n${passed} tests passed.`);
