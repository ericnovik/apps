export const HEIGHT = 100;
export const TOWER_HEIGHT = HEIGHT;
export const MARK_STEP = 5;
export const MARK_COUNT = 20;
export const MIN_OBSERVATIONS = 5;
export const MIN_OBSERVATION_COUNT = MIN_OBSERVATIONS;

const CURVE_SEGMENTS = 80;

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen);
  }

  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export const WORLD_CATALOG = deepFreeze([
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

const WORLD_BY_ID = new Map(WORLD_CATALOG.map((world) => [world.id, world]));
const WORLD_BY_NORMALIZED_NAME = new Map();

export function normalizeWorldName(value) {
  if (value === null || value === undefined) {
    return "";
  }

  try {
    return String(value)
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[‘’ʼ]/gu, "'")
      .replace(/\s+/gu, " ");
  } catch {
    return "";
  }
}

for (const world of WORLD_CATALOG) {
  for (const candidate of [world.id, world.name, ...world.aliases]) {
    const normalized = normalizeWorldName(candidate);
    const existing = WORLD_BY_NORMALIZED_NAME.get(normalized);

    if (existing !== undefined && existing.id !== world.id) {
      throw new Error(`World alias collision: ${candidate}`);
    }

    WORLD_BY_NORMALIZED_NAME.set(normalized, world);
  }
}

export function findWorldByGuess(value) {
  const normalized = normalizeWorldName(value);
  return normalized === "" ? null : WORLD_BY_NORMALIZED_NAME.get(normalized) ?? null;
}

export function selectRandomWorld(rng = Math.random) {
  if (typeof rng !== "function") {
    throw new TypeError("rng must be a function");
  }

  const sample = rng();
  if (
    typeof sample !== "number"
    || !Number.isFinite(sample)
    || sample < 0
    || sample > 1
  ) {
    throw new RangeError("rng must return a finite number from 0 through 1");
  }

  const index = Math.min(Math.floor(sample * WORLD_CATALOG.length), WORLD_CATALOG.length - 1);
  return WORLD_CATALOG[index];
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function trueTimeAt(distance, gravity) {
  if (!isFiniteNumber(distance) || distance < 0 || !isFiniteNumber(gravity) || gravity <= 0) {
    return null;
  }

  const time = Math.sqrt((2 * distance) / gravity);
  return Number.isFinite(time) ? (time === 0 ? 0 : time) : null;
}

export function distanceAtTime(time, gravity) {
  if (!isFiniteNumber(time) || time < 0 || !isFiniteNumber(gravity) || gravity <= 0) {
    return null;
  }

  const distance = 0.5 * gravity * time * time;
  return Number.isFinite(distance) ? (distance === 0 ? 0 : distance) : null;
}

export function makeCurve(gravity, height = HEIGHT, segments = CURVE_SEGMENTS) {
  if (
    !isFiniteNumber(gravity)
    || gravity <= 0
    || !isFiniteNumber(height)
    || height <= 0
    || !Number.isInteger(segments)
    || segments <= 0
  ) {
    return deepFreeze([]);
  }

  const curve = [];
  for (let index = 0; index <= segments; index += 1) {
    const distance = (height * index) / segments;
    const time = trueTimeAt(distance, gravity);

    if (time === null) {
      return deepFreeze([]);
    }

    curve.push({ x: time, y: distance });
  }

  return deepFreeze(curve);
}

function copyObservation(record) {
  if (record === null || typeof record !== "object") {
    return null;
  }

  try {
    const { x, tObs } = record;
    if (!isFiniteNumber(x) || x < 0 || !isFiniteNumber(tObs) || tObs < 0) {
      return null;
    }

    return {
      x: x === 0 ? 0 : x,
      tObs: tObs === 0 ? 0 : tObs
    };
  } catch {
    return null;
  }
}

function copyObservations(records) {
  if (!Array.isArray(records)) {
    return null;
  }

  const observations = [];
  for (const record of records) {
    const observation = copyObservation(record);
    if (observation === null) {
      return null;
    }
    observations.push(observation);
  }

  return observations;
}

export function estimateGravity(records, includeDelay = false) {
  const observations = copyObservations(records);
  if (observations === null || observations.length < MIN_OBSERVATIONS) {
    return null;
  }

  const predictors = observations.map(({ x }) => Math.sqrt(x));
  const fitsDelay = includeDelay === true;
  let slopeNumerator = 0;
  let slopeDenominator = 0;
  let delay = 0;
  let maximumPredictor = 0;

  for (const predictor of predictors) {
    maximumPredictor = Math.max(maximumPredictor, predictor);
  }

  if (fitsDelay) {
    const predictorMean = predictors.reduce((sum, predictor) => sum + predictor, 0)
      / observations.length;
    const timeMean = observations.reduce((sum, { tObs }) => sum + tObs, 0)
      / observations.length;
    if (!Number.isFinite(predictorMean) || !Number.isFinite(timeMean)) {
      return null;
    }

    for (let index = 0; index < observations.length; index += 1) {
      const predictorDelta = predictors[index] - predictorMean;
      slopeNumerator += predictorDelta * (observations[index].tObs - timeMean);
      slopeDenominator += predictorDelta * predictorDelta;
    }

  } else {
    for (let index = 0; index < observations.length; index += 1) {
      slopeNumerator += predictors[index] * observations[index].tObs;
      slopeDenominator += predictors[index] * predictors[index];
    }
  }

  const varianceTolerance = Number.EPSILON
    * Math.max(1, maximumPredictor * maximumPredictor)
    * observations.length;
  if (!Number.isFinite(slopeDenominator) || slopeDenominator <= varianceTolerance) {
    return null;
  }

  const slope = slopeNumerator / slopeDenominator;
  if (fitsDelay) {
    const predictorMean = predictors.reduce((sum, predictor) => sum + predictor, 0)
      / observations.length;
    const timeMean = observations.reduce((sum, { tObs }) => sum + tObs, 0)
      / observations.length;
    delay = timeMean - slope * predictorMean;
  }

  const gravity = 2 / (slope * slope);
  if (
    !Number.isFinite(slope)
    || slope <= 0
    || !Number.isFinite(delay)
    || !Number.isFinite(gravity)
    || gravity <= 0
  ) {
    return null;
  }

  const residualSumSquares = observations.reduce((sum, { tObs }, index) => {
    const residual = tObs - delay - slope * predictors[index];
    return sum + residual * residual;
  }, 0);
  const residualDegreesOfFreedom = observations.length - (fitsDelay ? 2 : 1);
  const residualVariance = residualSumSquares / residualDegreesOfFreedom;
  const slopeStandardError = Math.sqrt(residualVariance / slopeDenominator);
  const standardError = 4 * slopeStandardError / (slope * slope * slope);
  if (!Number.isFinite(standardError) || standardError < 0) {
    return null;
  }

  const margin = 2 * standardError;
  return deepFreeze({
    gravity,
    delay,
    standardError,
    twoStandardErrorRange: {
      lower: gravity - margin,
      upper: gravity + margin
    },
    slope,
    observationCount: observations.length
  });
}

function recordsFromTrial(trial) {
  if (Array.isArray(trial)) {
    return trial;
  }

  if (trial === null || typeof trial !== "object") {
    return null;
  }

  try {
    if (Array.isArray(trial.observations)) {
      return trial.observations;
    }
    if (Array.isArray(trial.records)) {
      return trial.records;
    }
  } catch {
    return null;
  }

  return null;
}

export function aggregateObservations(completedTrials) {
  if (!Array.isArray(completedTrials)) {
    return null;
  }

  const aggregate = [];
  for (const trial of completedTrials) {
    const observations = copyObservations(recordsFromTrial(trial));
    if (observations === null) {
      return null;
    }
    aggregate.push(...observations);
  }

  return deepFreeze(aggregate);
}

export function estimateGravityFromTrials(completedTrials, includeDelay = false) {
  const observations = aggregateObservations(completedTrials);
  return observations === null ? null : estimateGravity(observations, includeDelay);
}

export const MISSION_PHASES = deepFreeze({
  ACTIVE: "active",
  LAUNCHING_INCORRECT: "launching-incorrect",
  CRASHED: "crashed",
  LAUNCHING_CORRECT: "launching-correct",
  COMPLETE: "complete"
});

export const PHASES = MISSION_PHASES;

const MISSION_PHASE_VALUES = new Set(Object.values(MISSION_PHASES));

function makeCompletedTrial(records) {
  const observations = copyObservations(records);
  if (observations === null) {
    return null;
  }

  return deepFreeze({
    observations,
    observationCount: observations.length,
    estimate: estimateGravity(observations)
  });
}

function makeMissionState({
  worldId,
  phase,
  completedTrials,
  incorrectGuesses,
  truthRevealed
}) {
  return deepFreeze({
    worldId,
    phase,
    completedTrials: [...completedTrials],
    estimate: estimateGravityFromTrials(completedTrials),
    incorrectGuesses: [...incorrectGuesses],
    truthRevealed
  });
}

function isObservation(value) {
  return value !== null
    && typeof value === "object"
    && isFiniteNumber(value.x)
    && value.x >= 0
    && isFiniteNumber(value.tObs)
    && value.tObs >= 0;
}

function isEstimate(value) {
  return value !== null
    && typeof value === "object"
    && isFiniteNumber(value.gravity)
    && value.gravity > 0
    && isFiniteNumber(value.delay)
    && isFiniteNumber(value.standardError)
    && value.standardError >= 0
    && value.twoStandardErrorRange !== null
    && typeof value.twoStandardErrorRange === "object"
    && isFiniteNumber(value.twoStandardErrorRange.lower)
    && isFiniteNumber(value.twoStandardErrorRange.upper)
    && value.twoStandardErrorRange.lower <= value.gravity
    && value.twoStandardErrorRange.upper >= value.gravity
    && isFiniteNumber(value.slope)
    && value.slope > 0
    && Number.isInteger(value.observationCount)
    && value.observationCount >= MIN_OBSERVATIONS;
}

function isCompletedTrial(value) {
  return value !== null
    && typeof value === "object"
    && Array.isArray(value.observations)
    && value.observations.every(isObservation)
    && value.observationCount === value.observations.length
    && (value.estimate === null || isEstimate(value.estimate));
}

function isMissionState(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  try {
    const revealingPhase = value.phase === MISSION_PHASES.LAUNCHING_CORRECT
      || value.phase === MISSION_PHASES.COMPLETE;
    const estimateRequired = value.phase !== MISSION_PHASES.ACTIVE;

    return WORLD_BY_ID.has(value.worldId)
      && MISSION_PHASE_VALUES.has(value.phase)
      && Array.isArray(value.completedTrials)
      && value.completedTrials.every(isCompletedTrial)
      && (value.estimate === null || isEstimate(value.estimate))
      && (!estimateRequired || isEstimate(value.estimate))
      && Array.isArray(value.incorrectGuesses)
      && value.incorrectGuesses.every((worldId) => (
        WORLD_BY_ID.has(worldId) && worldId !== value.worldId
      ))
      && typeof value.truthRevealed === "boolean"
      && value.truthRevealed === revealingPhase;
  } catch {
    return false;
  }
}

function isDeeplyFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }

  seen.add(value);
  return Reflect.ownKeys(value).every((key) => isDeeplyFrozen(value[key], seen));
}

function ensureMissionState(value) {
  if (!isMissionState(value)) {
    return null;
  }

  try {
    if (isDeeplyFrozen(value)) {
      return value;
    }

    const completedTrials = value.completedTrials.map((trial) => (
      makeCompletedTrial(trial.observations)
    ));

    return makeMissionState({
      worldId: value.worldId,
      phase: value.phase,
      completedTrials,
      incorrectGuesses: value.incorrectGuesses,
      truthRevealed: value.truthRevealed
    });
  } catch {
    return null;
  }
}

export function newMission(rng = Math.random) {
  const world = selectRandomWorld(rng);
  return makeMissionState({
    worldId: world.id,
    phase: MISSION_PHASES.ACTIVE,
    completedTrials: [],
    incorrectGuesses: [],
    truthRevealed: false
  });
}

// In-progress clicks belong to the experiment controller. They enter mission
// history only through completeTrial, so resetting either trial control is a
// deliberate immutable no-op at this model boundary.
export function resetTrial(state) {
  return ensureMissionState(state);
}

export function startAdditionalTrial(state) {
  return ensureMissionState(state);
}

export function completeTrial(state, records) {
  const mission = ensureMissionState(state);
  if (mission === null) {
    return null;
  }

  if (
    mission.phase !== MISSION_PHASES.ACTIVE
    && mission.phase !== MISSION_PHASES.CRASHED
  ) {
    return mission;
  }

  const trial = makeCompletedTrial(records);
  if (trial === null) {
    return mission;
  }

  return makeMissionState({
    ...mission,
    completedTrials: [...mission.completedTrials, trial]
  });
}

export function submitGuess(state, guess) {
  const mission = ensureMissionState(state);
  if (mission === null) {
    return null;
  }

  if (mission.phase !== MISSION_PHASES.ACTIVE || mission.estimate === null) {
    return mission;
  }

  const guessedWorld = findWorldByGuess(guess);
  if (guessedWorld === null) {
    return mission;
  }

  if (guessedWorld.id === mission.worldId) {
    return makeMissionState({
      ...mission,
      phase: MISSION_PHASES.LAUNCHING_CORRECT,
      truthRevealed: true
    });
  }

  return makeMissionState({
    ...mission,
    phase: MISSION_PHASES.LAUNCHING_INCORRECT,
    incorrectGuesses: [...mission.incorrectGuesses, guessedWorld.id],
    truthRevealed: false
  });
}

export function completeLaunchAnimation(state) {
  const mission = ensureMissionState(state);
  if (mission === null) {
    return null;
  }

  if (mission.phase === MISSION_PHASES.LAUNCHING_INCORRECT) {
    return makeMissionState({
      ...mission,
      phase: MISSION_PHASES.CRASHED,
      truthRevealed: false
    });
  }

  if (mission.phase === MISSION_PHASES.LAUNCHING_CORRECT) {
    return makeMissionState({
      ...mission,
      phase: MISSION_PHASES.COMPLETE,
      truthRevealed: true
    });
  }

  return mission;
}

export function repairMission(state) {
  const mission = ensureMissionState(state);
  if (mission === null) {
    return null;
  }

  if (mission.phase !== MISSION_PHASES.CRASHED) {
    return mission;
  }

  return makeMissionState({
    ...mission,
    phase: MISSION_PHASES.ACTIVE,
    truthRevealed: false
  });
}

export function getMissionViewModel(state) {
  const mission = ensureMissionState(state);
  if (mission === null) {
    return null;
  }

  const incorrectGuesses = mission.incorrectGuesses.map((worldId) => {
    const world = WORLD_BY_ID.get(worldId);
    return { id: world.id, name: world.name };
  });
  const observationCount = mission.completedTrials.reduce(
    (total, trial) => total + trial.observationCount,
    0
  );
  const base = {
    phase: mission.phase,
    truthRevealed: mission.truthRevealed,
    completedTrialCount: mission.completedTrials.length,
    observationCount,
    estimate: mission.estimate,
    incorrectGuesses,
    canSubmitGuess: mission.phase === MISSION_PHASES.ACTIVE && mission.estimate !== null,
    canRepair: mission.phase === MISSION_PHASES.CRASHED
  };

  if (!mission.truthRevealed) {
    return deepFreeze({ ...base, reveal: null });
  }

  const world = WORLD_BY_ID.get(mission.worldId);
  const absoluteError = Math.abs(mission.estimate.gravity - world.gravity);

  return deepFreeze({
    ...base,
    reveal: {
      world: {
        id: world.id,
        name: world.name,
        classification: world.classification
      },
      trueGravity: world.gravity,
      trueCurve: makeCurve(world.gravity),
      absoluteError,
      percentageError: (absoluteError / world.gravity) * 100
    }
  });
}
