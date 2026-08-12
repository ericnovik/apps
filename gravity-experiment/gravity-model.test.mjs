import assert from "node:assert/strict";

import {
  HEIGHT,
  TOWER_HEIGHT,
  MARK_STEP,
  MARK_COUNT,
  MIN_OBSERVATIONS,
  MIN_OBSERVATION_COUNT,
  WORLD_CATALOG,
  MISSION_PHASES,
  PHASES,
  normalizeWorldName,
  findWorldByGuess,
  selectRandomWorld,
  trueTimeAt,
  distanceAtTime,
  makeCurve,
  estimateGravity,
  aggregateObservations,
  estimateGravityFromTrials,
  newMission,
  resetTrial,
  startAdditionalTrial,
  completeTrial,
  submitGuess,
  completeLaunchAnimation,
  repairMission,
  getMissionViewModel
} from "./gravity-model.js";

const EPSILON = 1e-10;
let passed = 0;

function closeTo(actual, expected, tolerance = EPSILON, message = undefined) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function assertEstimateShape(estimate) {
  assert.deepEqual(
    Object.keys(estimate).sort(),
    [
      "delay",
      "gravity",
      "observationCount",
      "slope",
      "standardError",
      "twoStandardErrorRange"
    ]
  );
  assert.deepEqual(
    Object.keys(estimate.twoStandardErrorRange).sort(),
    ["lower", "upper"]
  );
}

function assertDeeplyFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  assert.ok(Object.isFrozen(value), "Expected every nested public value to be frozen");
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child, seen);
  }
}

function test(name, callback) {
  callback();
  passed += 1;
  console.log(`✓ ${name}`);
}

function markDistances(count = MARK_COUNT) {
  return Array.from({ length: count }, (_, index) => (index + 1) * MARK_STEP);
}

function observationsFor(gravity, distances = markDistances()) {
  return distances.map((x) => ({
    x,
    tObs: trueTimeAt(x, gravity)
  }));
}

function catalogWorld(worldId) {
  return WORLD_CATALOG.find((world) => world.id === worldId);
}

function missionWithEstimate(randomValue = 0) {
  const mission = newMission(() => randomValue);
  const world = catalogWorld(mission.worldId);
  return completeTrial(mission, observationsFor(world.gravity));
}

function assertWorldPreserved(expectedWorldId, ...states) {
  for (const state of states) {
    assert.equal(state.worldId, expectedWorldId);
  }
}

test("experiment constants describe one hundred meters and twenty five-meter marks", () => {
  assert.equal(HEIGHT, 100);
  assert.equal(TOWER_HEIGHT, 100);
  assert.equal(MARK_STEP, 5);
  assert.equal(MARK_COUNT, 20);
  assert.equal(HEIGHT / MARK_STEP, MARK_COUNT);
  assert.equal(MIN_OBSERVATIONS, MIN_OBSERVATION_COUNT);
  assert.ok(MIN_OBSERVATIONS >= 5);
});

test("WORLD_CATALOG has exactly the approved order, values, aliases, and classifications", () => {
  assert.deepEqual(WORLD_CATALOG, [
    {
      id: "io",
      name: "Io",
      classification: "Moon of Jupiter",
      gravity: 1.8,
      aliases: ["io"]
    },
    {
      id: "earth-moon",
      name: "Earth’s Moon",
      classification: "Major Moon",
      gravity: 1.62,
      aliases: ["earth’s moon", "earth's moon", "earth moon", "moon", "the moon"]
    },
    {
      id: "ganymede",
      name: "Ganymede",
      classification: "Moon of Jupiter",
      gravity: 1.43,
      aliases: ["ganymede"]
    },
    {
      id: "europa",
      name: "Europa",
      classification: "Moon of Jupiter",
      gravity: 1.32,
      aliases: ["europa"]
    },
    {
      id: "callisto",
      name: "Callisto",
      classification: "Moon of Jupiter",
      gravity: 1.24,
      aliases: ["callisto"]
    }
  ]);

  assertDeeplyFrozen(WORLD_CATALOG);
  assert.throws(() => WORLD_CATALOG.push({}), TypeError);
  assert.throws(() => {
    WORLD_CATALOG[0].gravity = 99;
  }, TypeError);
  assert.throws(() => WORLD_CATALOG[1].aliases.push("luna"), TypeError);
});

test("world-name normalization accepts case, whitespace, apostrophes, IDs, and Moon aliases", () => {
  assert.equal(normalizeWorldName("  EARTH’S\t\nMOON  "), "earth's moon");
  assert.equal(normalizeWorldName("Earth‘s Moon"), "earth's moon");
  assert.equal(normalizeWorldName(" Earthʼs   Moon "), "earth's moon");

  const cases = [
    ["io", "io"],
    [" IO ", "io"],
    ["earth-moon", "earth-moon"],
    ["earth's moon", "earth-moon"],
    ["Earth’s Moon", "earth-moon"],
    ["Earth Moon", "earth-moon"],
    ["Moon", "earth-moon"],
    ["the   moon", "earth-moon"],
    [" GANYMEDE ", "ganymede"],
    ["\nEuropa\t", "europa"],
    ["callisto", "callisto"]
  ];

  for (const [guess, expectedWorldId] of cases) {
    const world = findWorldByGuess(guess);
    assert.equal(world.id, expectedWorldId);
    assertDeeplyFrozen(world);
  }
});

test("blank, unknown, and malformed world guesses do not resolve", () => {
  const explosive = {
    toString() {
      throw new Error("must be handled");
    }
  };
  const invalid = ["", " \t\n ", "Mars", "Jupiter", "Titan", null, undefined, explosive];

  for (const guess of invalid) {
    assert.equal(findWorldByGuess(guess), null);
  }
  assert.equal(normalizeWorldName(null), "");
  assert.equal(normalizeWorldName(explosive), "");
});

test("random selection has stable interval and endpoint behavior", () => {
  const cases = [
    [0, "io"],
    [0.2 - Number.EPSILON, "io"],
    [0.2, "earth-moon"],
    [0.4 - Number.EPSILON, "earth-moon"],
    [0.4, "ganymede"],
    [0.6 - Number.EPSILON, "ganymede"],
    [0.6, "europa"],
    [0.8 - Number.EPSILON, "europa"],
    [0.8, "callisto"],
    [1, "callisto"]
  ];

  for (const [sample, expectedWorldId] of cases) {
    const selected = selectRandomWorld(() => sample);
    assert.equal(selected.id, expectedWorldId, `Unexpected world for RNG sample ${sample}`);
    assert.equal(selected, catalogWorld(expectedWorldId));
  }
});

test("random selection calls its injected RNG once and rejects invalid RNG contracts", () => {
  let calls = 0;
  const selected = selectRandomWorld(() => {
    calls += 1;
    return 0.41;
  });

  assert.equal(selected.id, "ganymede");
  assert.equal(calls, 1);
  assert.throws(() => selectRandomWorld(null), TypeError);
  for (const sample of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "0.5"]) {
    assert.throws(() => selectRandomWorld(() => sample), RangeError);
  }
});

test("physics is invertible at every mark for all approved worlds", () => {
  const completionTimes = [];

  for (const world of WORLD_CATALOG) {
    for (let mark = 1; mark <= MARK_COUNT; mark += 1) {
      const distance = mark * MARK_STEP;
      const time = trueTimeAt(distance, world.gravity);
      assert.ok(Number.isFinite(time));
      closeTo(time, Math.sqrt((2 * distance) / world.gravity));
      closeTo(distanceAtTime(time, world.gravity), distance);
    }

    completionTimes.push(trueTimeAt(HEIGHT, world.gravity));
  }

  for (let index = 1; index < completionTimes.length; index += 1) {
    assert.ok(completionTimes[index] > completionTimes[index - 1]);
  }
});

test("makeCurve follows each world's physics and safely handles malformed inputs", () => {
  for (const world of WORLD_CATALOG) {
    const curve = makeCurve(world.gravity);
    assert.equal(curve.length, 81);
    assert.deepEqual(curve[0], { x: 0, y: 0 });
    assert.equal(curve.at(-1).y, HEIGHT);
    closeTo(curve.at(-1).x, trueTimeAt(HEIGHT, world.gravity));

    for (const point of curve) {
      closeTo(distanceAtTime(point.x, world.gravity), point.y);
    }
    assertDeeplyFrozen(curve);
  }

  for (const curve of [
    makeCurve(0),
    makeCurve(-1),
    makeCurve(Number.NaN),
    makeCurve(1.62, 0),
    makeCurve(1.62, HEIGHT, 0),
    makeCurve(1.62, HEIGHT, 2.5)
  ]) {
    assert.deepEqual(curve, []);
    assertDeeplyFrozen(curve);
  }

  assert.equal(trueTimeAt(-1, 1.62), null);
  assert.equal(trueTimeAt(5, 0), null);
  assert.equal(trueTimeAt("5", 1.62), null);
  assert.equal(distanceAtTime(-1, 1.62), null);
  assert.equal(distanceAtTime(1, Number.POSITIVE_INFINITY), null);
});

test("perfect observable records recover every approved gravity without reading true times", () => {
  for (const world of WORLD_CATALOG) {
    const observations = observationsFor(world.gravity);
    for (const observation of observations) {
      Object.defineProperty(observation, "tTrue", {
        enumerable: true,
        get() {
          throw new Error("hidden true time was read");
        }
      });
    }

    const estimate = estimateGravity(observations);
    assertEstimateShape(estimate);
    assert.deepEqual(estimateGravity(observations, false), estimate);
    closeTo(estimate.gravity, world.gravity, 1e-12);
    closeTo(estimate.delay, 0, 1e-12);
    closeTo(estimate.slope, Math.sqrt(2 / world.gravity), 1e-12);
    closeTo(estimate.standardError, 0, 1e-12);
    closeTo(estimate.twoStandardErrorRange.lower, estimate.gravity, 1e-12);
    closeTo(estimate.twoStandardErrorRange.upper, estimate.gravity, 1e-12);
    assert.equal(estimate.observationCount, MARK_COUNT);
    assertDeeplyFrozen(estimate);
  }
});

test("through-origin estimation follows deterministic zero-mean timing noise", () => {
  const gravity = 1.43;
  const distances = markDistances(6);
  const timingNoise = [-2.5, -3.5, -4.5, 3.5, 3.5, 3.5];
  const observations = observationsFor(gravity, distances).map((record, index) => ({
    ...record,
    tObs: record.tObs + timingNoise[index],
    tTrue: -9999,
    hiddenGravity: 9999
  }));
  const predictorSumSquares = observations.reduce((sum, { x }) => sum + x, 0);
  const expectedSlope = observations.reduce(
    (sum, { x, tObs }) => sum + Math.sqrt(x) * tObs,
    0
  ) / predictorSumSquares;
  const expectedGravity = 2 / (expectedSlope * expectedSlope);
  const residualSSE = observations.reduce((sum, { x, tObs }) => {
    const residual = tObs - expectedSlope * Math.sqrt(x);
    return sum + residual * residual;
  }, 0);
  const residualVariance = residualSSE / (observations.length - 1);
  const expectedSlopeStandardError = Math.sqrt(
    residualVariance / predictorSumSquares
  );
  const expectedStandardError = 4 * expectedSlopeStandardError
    / (expectedSlope * expectedSlope * expectedSlope);
  const expectedLower = expectedGravity - 2 * expectedStandardError;
  const expectedUpper = expectedGravity + 2 * expectedStandardError;
  const estimate = estimateGravity(observations);

  closeTo(timingNoise.reduce((sum, value) => sum + value, 0), 0);
  assert.ok(Math.abs(expectedGravity - gravity) > 1e-4);
  assert.ok(expectedLower < 0, "Expected this fixture to detect a clamped lower bound");
  assertEstimateShape(estimate);
  closeTo(estimate.slope, expectedSlope, 1e-12);
  closeTo(estimate.gravity, expectedGravity, 1e-12);
  closeTo(estimate.delay, 0, 1e-12);
  closeTo(estimate.standardError, expectedStandardError, 1e-12);
  closeTo(estimate.twoStandardErrorRange.lower, expectedLower, 1e-12);
  closeTo(estimate.twoStandardErrorRange.upper, expectedUpper, 1e-12);
  assert.equal(estimate.observationCount, observations.length);
  assertDeeplyFrozen(estimate);
});

test("delay mode recovers every approved gravity and a known constant delay", () => {
  const delays = [0.18, 0.37, 0.62, 1.05, 0.44];

  for (let index = 0; index < WORLD_CATALOG.length; index += 1) {
    const world = WORLD_CATALOG[index];
    const delay = delays[index];
    const observations = observationsFor(world.gravity).map((record) => ({
      ...record,
      tObs: record.tObs + delay,
      tTrue: -9999,
      hiddenGravity: 9999
    }));
    const estimate = estimateGravity(observations, true);

    assertEstimateShape(estimate);
    closeTo(estimate.gravity, world.gravity, 1e-12);
    closeTo(estimate.delay, delay, 1e-12);
    closeTo(estimate.slope, Math.sqrt(2 / world.gravity), 1e-12);
    closeTo(estimate.standardError, 0, 1e-12);
    closeTo(estimate.twoStandardErrorRange.lower, estimate.gravity, 1e-12);
    closeTo(estimate.twoStandardErrorRange.upper, estimate.gravity, 1e-12);
    assert.equal(estimate.observationCount, observations.length);
    assertDeeplyFrozen(estimate);
  }
});

test("delay-mode OLS uncertainty follows exact centered formulas with deterministic noise", () => {
  const gravity = 1.32;
  const delay = 0.45;
  const distances = [1, 4, 9, 16, 25, 36];
  const timingNoise = [0.08, -0.16, 0.08, -0.05, 0.1, -0.05];
  const observations = observationsFor(gravity, distances).map((record, index) => ({
    ...record,
    tObs: record.tObs + delay + timingNoise[index]
  }));
  const predictors = observations.map(({ x }) => Math.sqrt(x));
  const predictorMean = predictors.reduce((sum, value) => sum + value, 0)
    / observations.length;
  const timeMean = observations.reduce((sum, { tObs }) => sum + tObs, 0)
    / observations.length;
  let predictorSumSquares = 0;
  let covariance = 0;

  for (let index = 0; index < observations.length; index += 1) {
    const predictorDelta = predictors[index] - predictorMean;
    predictorSumSquares += predictorDelta * predictorDelta;
    covariance += predictorDelta * (observations[index].tObs - timeMean);
  }

  const expectedSlope = covariance / predictorSumSquares;
  const expectedDelay = timeMean - expectedSlope * predictorMean;
  const expectedGravity = 2 / (expectedSlope * expectedSlope);
  const residualSSE = observations.reduce((sum, { tObs }, index) => {
    const residual = tObs - expectedDelay - expectedSlope * predictors[index];
    return sum + residual * residual;
  }, 0);
  const residualVariance = residualSSE / (observations.length - 2);
  const expectedSlopeStandardError = Math.sqrt(
    residualVariance / predictorSumSquares
  );
  const expectedStandardError = 4 * expectedSlopeStandardError
    / (expectedSlope * expectedSlope * expectedSlope);
  const expectedLower = expectedGravity - 2 * expectedStandardError;
  const expectedUpper = expectedGravity + 2 * expectedStandardError;
  const estimate = estimateGravity(observations, true);

  closeTo(timingNoise.reduce((sum, value) => sum + value, 0), 0);
  closeTo(
    timingNoise.reduce((sum, value, index) => sum + value * predictors[index], 0),
    0
  );
  closeTo(expectedSlope, Math.sqrt(2 / gravity), 1e-12);
  closeTo(expectedDelay, delay, 1e-12);
  assert.ok(expectedStandardError > 0);
  assertEstimateShape(estimate);
  closeTo(estimate.gravity, expectedGravity, 1e-12);
  closeTo(estimate.delay, expectedDelay, 1e-12);
  closeTo(estimate.slope, expectedSlope, 1e-12);
  closeTo(estimate.standardError, expectedStandardError, 1e-12);
  closeTo(estimate.twoStandardErrorRange.lower, expectedLower, 1e-12);
  closeTo(estimate.twoStandardErrorRange.upper, expectedUpper, 1e-12);
  assert.equal(estimate.observationCount, observations.length);
  assertDeeplyFrozen(estimate);
});

test("estimation rejects insufficient, malformed, and degenerate observations", () => {
  const valid = observationsFor(1.43);
  const repeatedDistance = Array.from({ length: MIN_OBSERVATIONS }, () => ({
    x: 25,
    tObs: trueTimeAt(25, 1.43)
  }));

  const repeatedDistanceEstimate = estimateGravity(repeatedDistance);
  closeTo(repeatedDistanceEstimate.gravity, 1.43, 1e-12);
  closeTo(repeatedDistanceEstimate.delay, 0, 1e-12);
  assert.equal(estimateGravity(repeatedDistance, true), null);
  assert.equal(estimateGravity(valid.slice(0, MIN_OBSERVATIONS - 1)), null);
  assert.equal(estimateGravity(null), null);
  assert.equal(estimateGravity({ records: valid }), null);
  assert.equal(estimateGravity([...valid.slice(0, 5), { x: "30", tObs: 2 }]), null);
  assert.equal(estimateGravity(valid.map((record) => ({ ...record, tObs: -1 }))), null);
  assert.equal(
    estimateGravity(Array.from(
      { length: MIN_OBSERVATIONS },
      (_, index) => ({ x: 0, tObs: index + 1 })
    )),
    null
  );
  assert.equal(
    estimateGravity(markDistances(MIN_OBSERVATIONS).map((x) => ({ x, tObs: 0 }))),
    null
  );
});

test("completed-trial aggregation pools observable records under one through-origin fit", () => {
  const all = observationsFor(1.32, markDistances(6)).map((record) => ({
    ...record,
    tTrue: 123456
  }));
  const first = all.slice(0, 3);
  const second = all.slice(3);

  assert.equal(estimateGravity(first), null);
  assert.equal(estimateGravity(second), null);

  const aggregate = aggregateObservations([first, { records: second }]);
  assert.equal(aggregate.length, 6);
  assert.ok(aggregate.every((record) => Object.keys(record).join(",") === "x,tObs"));
  assertDeeplyFrozen(aggregate);

  const completedTrials = [
    { observations: first },
    { records: second }
  ];
  const estimate = estimateGravityFromTrials(completedTrials);
  assertEstimateShape(estimate);
  assert.deepEqual(estimateGravityFromTrials(completedTrials, false), estimate);
  closeTo(estimate.gravity, 1.32, 1e-12);
  closeTo(estimate.delay, 0, 1e-12);
  closeTo(estimate.slope, Math.sqrt(2 / 1.32), 1e-12);
  assert.equal(estimate.observationCount, 6);

  const empty = aggregateObservations([]);
  assert.deepEqual(empty, []);
  assertDeeplyFrozen(empty);
  assert.equal(aggregateObservations(null), null);
  assert.equal(aggregateObservations([{}]), null);
  assert.equal(estimateGravityFromTrials([{}]), null);
});

test("multi-trial fitting pools every observation under one through-origin model", () => {
  const gravity = 1.32;
  const firstDistances = markDistances(10);
  const secondDistances = Array.from({ length: 9 }, (_, index) => (index + 11) * MARK_STEP);
  const first = observationsFor(gravity, firstDistances).map((record) => ({
    ...record,
    tObs: record.tObs + 0.2
  }));
  const second = observationsFor(gravity, secondDistances).map((record) => ({
    ...record,
    tObs: record.tObs + 0.4
  }));
  const pooled = [...first, ...second];
  const expectedSlope = pooled.reduce(
    (sum, { x, tObs }) => sum + Math.sqrt(x) * tObs,
    0
  ) / pooled.reduce((sum, { x }) => sum + x, 0);
  const expectedGravity = 2 / (expectedSlope * expectedSlope);
  const flatEstimate = estimateGravity(pooled);
  const groupedEstimate = estimateGravityFromTrials([
    { observations: first },
    { observations: second }
  ]);

  assert.ok(Math.abs(expectedGravity - gravity) > 0.04);
  closeTo(flatEstimate.slope, expectedSlope, 1e-12);
  closeTo(flatEstimate.gravity, expectedGravity, 1e-12);
  closeTo(flatEstimate.delay, 0, 1e-12);
  assertEstimateShape(groupedEstimate);
  closeTo(groupedEstimate.slope, expectedSlope, 1e-12);
  closeTo(groupedEstimate.gravity, expectedGravity, 1e-12);
  closeTo(groupedEstimate.delay, 0, 1e-12);
  closeTo(groupedEstimate.standardError, flatEstimate.standardError, 1e-12);
  closeTo(
    groupedEstimate.twoStandardErrorRange.lower,
    flatEstimate.twoStandardErrorRange.lower,
    1e-12
  );
  closeTo(
    groupedEstimate.twoStandardErrorRange.upper,
    flatEstimate.twoStandardErrorRange.upper,
    1e-12
  );
  assert.equal(groupedEstimate.observationCount, pooled.length);
  assertDeeplyFrozen(groupedEstimate);
});

test("delay-mode multi-trial fitting uses one shared pooled intercept", () => {
  const gravity = 1.32;
  const firstDistances = markDistances(10);
  const secondDistances = Array.from({ length: 9 }, (_, index) => (index + 11) * MARK_STEP);
  const first = observationsFor(gravity, firstDistances).map((record) => ({
    ...record,
    tObs: record.tObs + 0.2
  }));
  const second = observationsFor(gravity, secondDistances).map((record) => ({
    ...record,
    tObs: record.tObs + 0.4
  }));
  const pooled = [...first, ...second];
  const flatEstimate = estimateGravity(pooled, true);
  const groupedEstimate = estimateGravityFromTrials([
    { observations: first },
    { observations: second }
  ], true);

  assert.ok(Math.abs(flatEstimate.gravity - gravity) > 1e-3);
  assertEstimateShape(flatEstimate);
  assertEstimateShape(groupedEstimate);
  closeTo(groupedEstimate.gravity, flatEstimate.gravity, 1e-12);
  closeTo(groupedEstimate.delay, flatEstimate.delay, 1e-12);
  closeTo(groupedEstimate.slope, flatEstimate.slope, 1e-12);
  closeTo(groupedEstimate.standardError, flatEstimate.standardError, 1e-12);
  closeTo(
    groupedEstimate.twoStandardErrorRange.lower,
    flatEstimate.twoStandardErrorRange.lower,
    1e-12
  );
  closeTo(
    groupedEstimate.twoStandardErrorRange.upper,
    flatEstimate.twoStandardErrorRange.upper,
    1e-12
  );
  assert.equal(groupedEstimate.observationCount, pooled.length);
  assertDeeplyFrozen(groupedEstimate);
});

test("singleton trials contribute to the pooled minimum observation count", () => {
  const gravity = 1.32;
  const observations = observationsFor(gravity, markDistances(MIN_OBSERVATIONS));
  const estimate = estimateGravityFromTrials(observations.map((observation) => ({
    observations: [observation]
  })));

  assertEstimateShape(estimate);
  closeTo(estimate.gravity, gravity, 1e-12);
  closeTo(estimate.delay, 0, 1e-12);
  closeTo(estimate.slope, Math.sqrt(2 / gravity), 1e-12);
  assert.equal(estimate.observationCount, MIN_OBSERVATIONS);
});

test("newMission injects selection and returns a deeply immutable initial state", () => {
  let calls = 0;
  const mission = newMission(() => {
    calls += 1;
    return 0.4;
  });

  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(mission), [
    "worldId",
    "phase",
    "completedTrials",
    "estimate",
    "incorrectGuesses",
    "truthRevealed"
  ]);
  assert.equal(mission.worldId, "ganymede");
  assert.equal(mission.phase, MISSION_PHASES.ACTIVE);
  assert.equal(mission.estimate, null);
  assert.deepEqual(mission.completedTrials, []);
  assert.deepEqual(mission.incorrectGuesses, []);
  assert.equal(mission.truthRevealed, false);
  assert.equal(PHASES, MISSION_PHASES);
  assertDeeplyFrozen(MISSION_PHASES);
  assertDeeplyFrozen(mission);
  assert.throws(() => {
    mission.worldId = "io";
  }, TypeError);
});

test("mission trial completion stores observable copies and computes an aggregate estimate", () => {
  const initial = newMission(() => 0);
  const worldId = initial.worldId;
  const observations = observationsFor(1.8, markDistances(6)).map((record) => ({
    ...record,
    tTrue: -1
  }));
  const first = completeTrial(initial, observations.slice(0, 3));
  const second = completeTrial(first, observations.slice(3));

  assert.equal(initial.completedTrials.length, 0);
  assert.equal(first.completedTrials.length, 1);
  assert.equal(first.estimate, null);
  assert.equal(second.completedTrials.length, 2);
  assertEstimateShape(second.estimate);
  closeTo(second.estimate.gravity, 1.8, 1e-12);
  closeTo(second.estimate.delay, 0, 1e-12);
  closeTo(second.estimate.slope, Math.sqrt(2 / 1.8), 1e-12);
  assert.equal(second.estimate.observationCount, 6);
  assert.ok(second.completedTrials.every((trial) => (
    trial.observations.every((record) => !Object.hasOwn(record, "tTrue"))
  )));
  assertWorldPreserved(worldId, first, second);
  assertDeeplyFrozen(second);
});

test("trial reset and additional-trial setup preserve the immutable mission snapshot", () => {
  const mission = missionWithEstimate(0.61);
  let unexpectedRngCalls = 0;
  const unexpectedRng = () => {
    unexpectedRngCalls += 1;
    return 0;
  };

  const reset = resetTrial(mission, unexpectedRng);
  const additional = startAdditionalTrial(reset, unexpectedRng);

  assert.equal(reset, mission);
  assert.equal(additional, mission);
  assert.equal(unexpectedRngCalls, 0);
  assertWorldPreserved(mission.worldId, reset, additional);
  assert.deepEqual(additional.completedTrials, mission.completedTrials);
  assert.equal(additional.estimate, mission.estimate);
});

test("guesses require an estimate and blank or unknown guesses never launch", () => {
  const withoutEstimate = newMission(() => 0);
  assert.equal(submitGuess(withoutEstimate, "Io"), withoutEstimate);

  const mission = missionWithEstimate(0);
  const invalidGuesses = ["", " \t ", "Mars", "Jupiter", "Titan", null, undefined, {}];
  for (const guess of invalidGuesses) {
    const result = submitGuess(mission, guess);
    assert.equal(result, mission);
    assert.equal(result.phase, MISSION_PHASES.ACTIVE);
    assert.equal(result.truthRevealed, false);
    assert.deepEqual(result.incorrectGuesses, []);
  }
});

test("an incorrect valid guess starts failure launch and records only the guessed world", () => {
  const mission = missionWithEstimate(0);
  const failedLaunch = submitGuess(mission, "  Earth’s   Moon ");

  assert.equal(mission.phase, MISSION_PHASES.ACTIVE);
  assert.equal(failedLaunch.phase, MISSION_PHASES.LAUNCHING_INCORRECT);
  assert.equal(failedLaunch.truthRevealed, false);
  assert.deepEqual(failedLaunch.incorrectGuesses, ["earth-moon"]);
  assert.equal(failedLaunch.worldId, mission.worldId);
  assert.deepEqual(failedLaunch.completedTrials, mission.completedTrials);
  assert.deepEqual(failedLaunch.estimate, mission.estimate);
  assert.equal(getMissionViewModel(failedLaunch).reveal, null);
  assertDeeplyFrozen(failedLaunch);
});

test("failure launch rejects duplicate submissions and completes in crashed phase", () => {
  const mission = missionWithEstimate(0);
  const failedLaunch = submitGuess(mission, "Europa");

  assert.equal(submitGuess(failedLaunch, "Callisto"), failedLaunch);
  assert.deepEqual(failedLaunch.incorrectGuesses, ["europa"]);

  const crashed = completeLaunchAnimation(failedLaunch);
  assert.equal(crashed.phase, MISSION_PHASES.CRASHED);
  assert.equal(crashed.truthRevealed, false);
  assert.equal(crashed.worldId, mission.worldId);
  assert.deepEqual(crashed.incorrectGuesses, ["europa"]);
  assert.equal(completeLaunchAnimation(crashed), crashed);
  assert.equal(submitGuess(crashed, "Io"), crashed);
  assert.equal(getMissionViewModel(crashed).reveal, null);
});

test("a crashed mission can collect another trial and repair without losing mission data", () => {
  const mission = missionWithEstimate(0.42);
  const failedLaunch = submitGuess(mission, "Io");
  const crashed = completeLaunchAnimation(failedLaunch);
  const extraRecords = observationsFor(1.43, markDistances(5));
  const withExtraTrial = completeTrial(crashed, extraRecords);
  const repaired = repairMission(withExtraTrial);

  assert.equal(withExtraTrial.phase, MISSION_PHASES.CRASHED);
  assert.equal(withExtraTrial.completedTrials.length, crashed.completedTrials.length + 1);
  assert.equal(repaired.phase, MISSION_PHASES.ACTIVE);
  assert.equal(repaired.truthRevealed, false);
  assertWorldPreserved(mission.worldId, crashed, withExtraTrial, repaired);
  assert.deepEqual(repaired.completedTrials, withExtraTrial.completedTrials);
  assert.deepEqual(repaired.estimate, withExtraTrial.estimate);
  assert.deepEqual(repaired.incorrectGuesses, ["io"]);
  assert.equal(repairMission(repaired), repaired);
});

test("every Earth Moon alias starts a correct launch and reveals truth immediately", () => {
  for (const alias of ["Earth’s Moon", "earth's moon", "Earth Moon", "Moon", "the moon"] ) {
    const mission = missionWithEstimate(0.2);
    const successfulLaunch = submitGuess(mission, alias);

    assert.equal(successfulLaunch.worldId, "earth-moon");
    assert.equal(successfulLaunch.phase, MISSION_PHASES.LAUNCHING_CORRECT);
    assert.equal(successfulLaunch.truthRevealed, true);
    assert.deepEqual(successfulLaunch.incorrectGuesses, []);
    assert.deepEqual(successfulLaunch.completedTrials, mission.completedTrials);
    assert.deepEqual(successfulLaunch.estimate, mission.estimate);
  }
});

test("success launch rejects duplicate submissions and completes without changing truth", () => {
  const mission = missionWithEstimate(0);
  const successfulLaunch = submitGuess(mission, "IO");

  assert.equal(submitGuess(successfulLaunch, "Europa"), successfulLaunch);
  assert.equal(successfulLaunch.phase, MISSION_PHASES.LAUNCHING_CORRECT);
  assert.equal(successfulLaunch.truthRevealed, true);

  const complete = completeLaunchAnimation(successfulLaunch);
  assert.equal(complete.phase, MISSION_PHASES.COMPLETE);
  assert.equal(complete.truthRevealed, true);
  assert.equal(complete.worldId, mission.worldId);
  assert.equal(completeLaunchAnimation(complete), complete);
  assert.equal(repairMission(complete), complete);
  assert.equal(submitGuess(complete, "Europa"), complete);
  assertDeeplyFrozen(complete);
});

test("the mission view gates selected-world details until a correct submission", () => {
  const mission = missionWithEstimate(0.42);
  const before = getMissionViewModel(mission);

  assert.equal(before.truthRevealed, false);
  assert.equal(before.reveal, null);
  assert.equal(Object.hasOwn(before, "worldId"), false);
  assert.equal(Object.hasOwn(before, "world"), false);
  assert.equal(Object.hasOwn(before, "trueGravity"), false);
  assert.equal(Object.hasOwn(before, "trueCurve"), false);
  assert.equal(before.canSubmitGuess, true);
  assertDeeplyFrozen(before);

  const failed = submitGuess(mission, "Europa");
  const crashed = completeLaunchAnimation(failed);
  const repaired = repairMission(crashed);
  for (const state of [failed, crashed, repaired]) {
    assert.equal(getMissionViewModel(state).reveal, null);
  }

  const successful = submitGuess(repaired, "Ganymede");
  const revealed = getMissionViewModel(successful);
  assert.equal(revealed.truthRevealed, true);
  assert.deepEqual(revealed.reveal.world, {
    id: "ganymede",
    name: "Ganymede",
    classification: "Moon of Jupiter"
  });
  assert.equal(revealed.reveal.trueGravity, 1.43);
  assert.equal(revealed.reveal.trueCurve.length, 81);
  closeTo(revealed.reveal.absoluteError, Math.abs(revealed.estimate.gravity - 1.43));
  closeTo(
    revealed.reveal.percentageError,
    (revealed.reveal.absoluteError / 1.43) * 100
  );
  assertDeeplyFrozen(revealed);
});

test("only newMission rerolls the world and it clears all prior mission data", () => {
  const initial = missionWithEstimate(0);
  const failed = submitGuess(initial, "Europa");
  const crashed = completeLaunchAnimation(failed);
  const repaired = repairMission(crashed);
  const successful = submitGuess(repaired, "Io");
  const complete = completeLaunchAnimation(successful);
  const oldWorldId = complete.worldId;
  let calls = 0;
  const fresh = newMission(() => {
    calls += 1;
    return 1;
  });

  assertWorldPreserved(oldWorldId, failed, crashed, repaired, successful, complete);
  assert.equal(calls, 1);
  assert.equal(fresh.worldId, "callisto");
  assert.notEqual(fresh.worldId, oldWorldId);
  assert.equal(fresh.phase, MISSION_PHASES.ACTIVE);
  assert.deepEqual(fresh.completedTrials, []);
  assert.equal(fresh.estimate, null);
  assert.deepEqual(fresh.incorrectGuesses, []);
  assert.equal(fresh.truthRevealed, false);
});

test("world identity survives every reset, trial, failure, crash, repair, and success transition", () => {
  const initial = newMission(() => 0.61);
  const worldId = initial.worldId;
  const reset = resetTrial(initial);
  const additional = startAdditionalTrial(reset);
  const measured = completeTrial(additional, observationsFor(1.32));
  const failed = submitGuess(measured, "Callisto");
  const crashed = completeLaunchAnimation(failed);
  const crashedWithTrial = completeTrial(crashed, observationsFor(1.32));
  const repaired = repairMission(crashedWithTrial);
  const successful = submitGuess(repaired, "Europa");
  const complete = completeLaunchAnimation(successful);

  assertWorldPreserved(
    worldId,
    reset,
    additional,
    measured,
    failed,
    crashed,
    crashedWithTrial,
    repaired,
    successful,
    complete
  );
  assert.equal(worldId, "europa");
});

test("mission functions safely reject malformed states and trial payloads", () => {
  assert.equal(resetTrial(null), null);
  assert.equal(startAdditionalTrial({}), null);
  assert.equal(completeTrial(null, []), null);
  assert.equal(submitGuess({}, "Io"), null);
  assert.equal(completeLaunchAnimation(undefined), null);
  assert.equal(repairMission({ phase: "crashed" }), null);
  assert.equal(getMissionViewModel(null), null);

  const mission = missionWithEstimate(0);
  assert.equal(completeTrial(mission, null), mission);
  assert.equal(completeTrial(mission, [{ x: "5", tObs: 2 }]), mission);

  const mutableClone = JSON.parse(JSON.stringify(mission));
  const normalized = resetTrial(mutableClone);
  assert.deepEqual(normalized, mission);
  assert.notEqual(normalized, mutableClone);
  assertDeeplyFrozen(normalized);

  const impossibleReveal = {
    ...newMission(() => 0),
    phase: MISSION_PHASES.LAUNCHING_CORRECT,
    truthRevealed: true
  };
  assert.equal(getMissionViewModel(impossibleReveal), null);
});

console.log(`\n${passed} tests passed.`);
