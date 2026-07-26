import assert from "node:assert/strict";

import { computeTrigModel, TAU } from "./model.js";
import {
  advanceAnimation,
  createState,
  selectExactAngle,
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
