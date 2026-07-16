const EPSILON = 1e-10;

export function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function add(a, b) {
  return a.map((value, index) => value + b[index]);
}

export function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

export function scale(vector, scalar) {
  return vector.map((value) => value * scalar);
}

export function squaredNorm(vector) {
  return dot(vector, vector);
}

export function norm(vector) {
  return Math.sqrt(squaredNorm(vector));
}

export function normalize(vector) {
  const length = norm(vector);
  return length > EPSILON ? scale(vector, 1 / length) : vector.map(() => 0);
}

export function multiplyDesign(x, beta) {
  return x.map((value) => beta[0] + value * beta[1]);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clean(value, tolerance = 1e-12) {
  return Math.abs(value) < tolerance ? 0 : value;
}

export function computeLeastSquares(x, y, h = [0, 0]) {
  if (x.length !== 3 || y.length !== 3 || h.length !== 2) {
    throw new Error("This experience requires three x values, three y values, and a two-dimensional perturbation.");
  }

  const ones = [1, 1, 1];
  const q1 = normalize(ones);
  const xAlongQ1 = scale(q1, dot(q1, x));
  const xOrthogonal = subtract(x, xAlongQ1);
  const xOrthogonalNorm = norm(xOrthogonal);
  const rankTolerance = EPSILON * Math.max(1, norm(x));
  const rank = xOrthogonalNorm > rankTolerance ? 2 : 1;
  const q2 = rank === 2 ? scale(xOrthogonal, 1 / xOrthogonalNorm) : [0, 0, 0];

  let yHat = scale(q1, dot(q1, y));
  if (rank === 2) {
    yHat = add(yHat, scale(q2, dot(q2, y)));
  }
  yHat = yHat.map((value) => clean(value));

  const xMean = mean(x);
  const yMean = mean(y);
  let beta;

  if (rank === 2) {
    const centeredX = x.map((value) => value - xMean);
    const centeredY = y.map((value) => value - yMean);
    const slope = dot(centeredX, centeredY) / squaredNorm(centeredX);
    beta = [yMean - slope * xMean, slope];
  } else {
    const denominator = 1 + xMean * xMean;
    beta = [yMean / denominator, (xMean * yMean) / denominator];
  }
  beta = beta.map((value) => clean(value));

  const fittedFromBeta = multiplyDesign(x, beta).map((value) => clean(value));
  const residual = subtract(y, yHat).map((value) => clean(value));
  const candidateBeta = add(beta, h).map((value) => clean(value));
  const candidate = multiplyDesign(x, candidateBeta).map((value) => clean(value));
  const candidateResidual = subtract(y, candidate).map((value) => clean(value));
  const inPlaneMovement = subtract(candidate, yHat).map((value) => clean(value));

  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumXX = squaredNorm(x);
  const sumY = y.reduce((sum, value) => sum + value, 0);
  const sumXY = dot(x, y);
  const gram = [[3, sumX], [sumX, sumXX]];
  const normalRhs = [sumY, sumXY];
  const xtResidual = [dot(ones, residual), dot(x, residual)].map((value) => clean(value));
  const determinant = clean(3 * sumXX - sumX * sumX);

  const minimumErrorSquared = clean(squaredNorm(residual));
  const extraDistanceSquared = clean(squaredNorm(inPlaneMovement));
  const candidateErrorSquared = clean(squaredNorm(candidateResidual));
  const pythagoreanGap = clean(candidateErrorSquared - minimumErrorSquared - extraDistanceSquared, 1e-10);

  return {
    x: [...x],
    y: [...y],
    h: [...h],
    rank,
    isRankDeficient: rank < 2,
    columns: { ones, x: [...x] },
    orthonormalBasis: rank === 2 ? [q1, q2] : [q1],
    beta,
    yHat,
    fittedFromBeta,
    residual,
    candidateBeta,
    candidate,
    candidateResidual,
    inPlaneMovement,
    gram,
    normalRhs,
    xtResidual,
    determinant,
    minimumErrorSquared,
    extraDistanceSquared,
    candidateErrorSquared,
    pythagoreanGap,
    residualOrthogonality: clean(dot(residual, inPlaneMovement)),
    xMean,
    yMean
  };
}

export function formatNumber(value, digits = 2) {
  const cleaned = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return cleaned.toFixed(digits).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
