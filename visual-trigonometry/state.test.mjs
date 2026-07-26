import assert from "node:assert/strict";

import { computeTrigModel, TAU } from "./model.js";
import {
  advanceAnimation,
  createState,
  selectExactAngle,
  setIdentityAlpha,
  setIdentityBeta,
  setIdentityMode,
  setIdentityPower,
  setPrincipalAngle,
  setSnapToExactAngles,
  setWaveAngle
} from "./state.js";

const EPSILON = 1e-11;
let passed = 0;

function closeTo(actual, expected, tolerance = EPSILON, message = undefined) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function test(name, callback) {
  callback();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("snap toggling never changes the current angle", () => {
  const state = createState();
  state.unwrappedTheta = 0.37;

  setSnapToExactAngles(state, true);
  assert.equal(state.snapToExactAngles, true);
  assert.equal(state.unwrappedTheta, 0.37);

  setSnapToExactAngles(state, false);
  assert.equal(state.snapToExactAngles, false);
  assert.equal(state.unwrappedTheta, 0.37);
});

test("ordinary exact chips choose the nearest equivalent without discarding turns", () => {
  const state = createState();
  state.unwrappedTheta = 5 * TAU + 0.2;

  selectExactAngle(state, Math.PI / 3);
  closeTo(state.unwrappedTheta, 5 * TAU + Math.PI / 3);
  assert.equal(state.plotEndpoint, null);

  state.unwrappedTheta = 0.2;
  selectExactAngle(state, 3 * Math.PI / 2);
  closeTo(state.unwrappedTheta, -Math.PI / 2);
});

test("the two-pi chip selects and retains the current cycle end", () => {
  const state = createState();
  state.unwrappedTheta = Math.PI / 4;

  selectExactAngle(state, TAU);
  closeTo(state.unwrappedTheta, TAU);
  assert.equal(state.plotEndpoint, "end");
  assert.equal(computeTrigModel(state).plotTheta, TAU);

  selectExactAngle(state, TAU);
  closeTo(state.unwrappedTheta, TAU);

  state.unwrappedTheta = 5 * TAU + 0.2;
  state.plotEndpoint = null;
  selectExactAngle(state, TAU);
  closeTo(state.unwrappedTheta, 6 * TAU);
  assert.equal(state.plotEndpoint, "end");
});

test("wave angles stay in the current cycle and preserve the right endpoint", () => {
  const state = createState();
  state.unwrappedTheta = 5 * TAU + 0.2;

  setWaveAngle(state, 11 * Math.PI / 6);
  closeTo(state.unwrappedTheta, 5 * TAU + 11 * Math.PI / 6);
  assert.equal(state.plotEndpoint, null);

  setWaveAngle(state, TAU);
  closeTo(state.unwrappedTheta, 6 * TAU);
  assert.equal(state.plotEndpoint, "end");
  assert.equal(computeTrigModel(state).plotTheta, TAU);

  setWaveAngle(state, 0);
  closeTo(state.unwrappedTheta, 5 * TAU);
  assert.equal(state.plotEndpoint, null);
  assert.equal(computeTrigModel(state).plotTheta, 0);
});

test("positive and negative pi endpoints retain their chosen control side", () => {
  const state = createState();
  state.unwrappedTheta = -170 * Math.PI / 180;

  setPrincipalAngle(state, Math.PI);
  assert.equal(state.principalEndpoint, "positive");
  assert.equal(computeTrigModel(state).displayTheta, Math.PI);

  setPrincipalAngle(state, -Math.PI);
  assert.equal(state.principalEndpoint, "negative");
  assert.equal(computeTrigModel(state).displayTheta, -Math.PI);
});

test("the pi chip deliberately selects the positive principal endpoint", () => {
  const state = createState();
  state.unwrappedTheta = -170 * Math.PI / 180;

  selectExactAngle(state, Math.PI);
  assert.equal(state.principalEndpoint, "positive");
  assert.equal(computeTrigModel(state).displayTheta, Math.PI);
});

test("identity lens switches preserve the instrument and align addition components", () => {
  const state = createState();
  state.unwrappedTheta = 3 * TAU + 0.9;
  state.radius = 1.7;
  state.playing = true;
  state.speedMultiplier = 2;
  state.alpha = 0.35;
  state.beta = -1.2;

  setIdentityMode(state, "norm");
  assert.equal(state.unwrappedTheta, 3 * TAU + 0.9);
  assert.equal(state.radius, 1.7);
  assert.equal(state.playing, true);
  assert.equal(state.speedMultiplier, 2);

  setIdentityMode(state, "addition");
  closeTo(
    Math.atan2(
      Math.sin(state.alpha + state.beta - state.unwrappedTheta),
      Math.cos(state.alpha + state.beta - state.unwrappedTheta)
    ),
    0
  );
  assert.equal(state.unwrappedTheta, 3 * TAU + 0.9);
  assert.equal(state.playing, true);
});

test("editing alpha and beta drives the primary addition result angle", () => {
  const state = createState();
  setIdentityMode(state, "addition");

  setIdentityAlpha(state, Math.PI / 3);
  closeTo(
    Math.atan2(
      Math.sin(state.unwrappedTheta - state.alpha - state.beta),
      Math.cos(state.unwrappedTheta - state.alpha - state.beta)
    ),
    0
  );

  setIdentityBeta(state, -Math.PI / 6);
  closeTo(
    Math.atan2(
      Math.sin(state.unwrappedTheta - Math.PI / 6),
      Math.cos(state.unwrappedTheta - Math.PI / 6)
    ),
    0
  );
  assert.equal(computeTrigModel(state).identity.checks.resultAngleResidual, 0);
});

test("direct angle changes and animation keep beta synchronized in addition mode", () => {
  const state = createState();
  setIdentityMode(state, "addition");
  const alpha = state.alpha;

  setPrincipalAngle(state, -Math.PI / 2);
  closeTo(
    Math.atan2(
      Math.sin(alpha + state.beta - state.unwrappedTheta),
      Math.cos(alpha + state.beta - state.unwrappedTheta)
    ),
    0
  );

  state.playing = true;
  assert.equal(advanceAnimation(state, 0.05), true);
  closeTo(
    Math.atan2(
      Math.sin(alpha + state.beta - state.unwrappedTheta),
      Math.cos(alpha + state.beta - state.unwrappedTheta)
    ),
    0
  );
  assert.equal(computeTrigModel(state).identity.checks.resultAngleResidual, 0);
});

test("power controls clamp independently without resetting angle or playback", () => {
  const state = createState();
  const theta = state.unwrappedTheta;
  state.playing = true;
  setIdentityMode(state, "powers");

  setIdentityPower(state, 99);
  assert.equal(state.power, 6);
  assert.equal(state.unwrappedTheta, theta);
  assert.equal(state.playing, true);

  setIdentityPower(state, 3.4);
  assert.equal(state.power, 3);
  assert.equal(state.unwrappedTheta, theta);
});

test("animation clears endpoint display hints before advancing", () => {
  const state = createState();
  state.unwrappedTheta = TAU;
  state.plotEndpoint = "end";
  state.principalEndpoint = "positive";
  state.playing = true;

  assert.equal(advanceAnimation(state, 0.01), true);
  assert.equal(state.plotEndpoint, null);
  assert.equal(state.principalEndpoint, null);
  assert.ok(state.unwrappedTheta > TAU);
});

console.log(`\n${passed} tests passed.`);
