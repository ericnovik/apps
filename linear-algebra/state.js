export const CHAPTER_DEFAULTS = [
  {
    ambientDimension: 3,
    intrinsicDimension: 1,
    orientation: 35,
    tilt: 18,
    offset: 0.5,
    dependence: 0,
    coefficients: [1, 0.5, -0.4],
    transformPreset: "scale",
    transformProgress: 0
  },
  {
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 28,
    tilt: 24,
    offset: 0.35,
    dependence: 0.18,
    coefficients: [1.2, 0.7, -0.4]
  },
  {
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 32,
    tilt: 30,
    offset: 1.1,
    dependence: 0,
    coefficients: [0.8, -0.6, 0]
  },
  {
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 24,
    tilt: 26,
    offset: 0.65,
    dependence: 0,
    queryPoint: [2.2, -1.1, 2.4]
  },
  {
    ambientDimension: 2,
    intrinsicDimension: 2,
    offset: 0,
    dependence: 0,
    transformPreset: "shear",
    transformProgress: 1
  },
  {
    ambientDimension: 2,
    intrinsicDimension: 1,
    orientation: 28,
    offset: 0,
    dependence: 0,
    transformPreset: "symmetric",
    transformProgress: 1
  },
  {
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 22,
    tilt: 30,
    offset: 0,
    dependence: 0,
    queryPoint: [1.8, 1.4, 2.5],
    transformPreset: "projection",
    transformProgress: 1
  }
];

export const CHAPTER_REPRESENTATIONS = [
  "geometry",
  "build",
  "cut",
  "geometry",
  "matrix",
  "matrix",
  "matrix"
];

const BASE_STATE = {
  chapter: 0,
  ambientDimension: 3,
  intrinsicDimension: 1,
  representation: "geometry",
  orientation: 35,
  tilt: 18,
  offset: 0.5,
  dependence: 0,
  coefficients: [1, 0.5, -0.4],
  queryPoint: [1.8, 1.2, 2.2],
  transformPreset: "scale",
  transformProgress: 0,
  revision: 0
};

function copyValues(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    Array.isArray(value) ? [...value] : value
  ]));
}

export function createState() {
  return {
    ...copyValues(BASE_STATE),
    visitedChapters: new Set([0])
  };
}

export function enterChapter(state, chapter, { forceDefaults = false } = {}) {
  const nextChapter = Math.max(0, Math.min(CHAPTER_DEFAULTS.length - 1, Math.round(chapter)));
  const isFirstVisit = !state.visitedChapters.has(nextChapter);

  if (forceDefaults || isFirstVisit || nextChapter === CHAPTER_DEFAULTS.length - 1) {
    Object.assign(state, copyValues(CHAPTER_DEFAULTS[nextChapter]));
  }

  state.chapter = nextChapter;
  state.representation = CHAPTER_REPRESENTATIONS[nextChapter];
  state.visitedChapters.add(nextChapter);
  state.revision += 1;
}

export function setDimension(state, ambientDimension, intrinsicDimension) {
  const n = Math.max(1, Math.min(3, Math.round(ambientDimension)));
  const k = Math.max(0, Math.min(n, Math.round(intrinsicDimension)));
  state.ambientDimension = n;
  state.intrinsicDimension = k;
  state.revision += 1;
}
