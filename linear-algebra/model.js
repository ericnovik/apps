export const EPSILON = 1e-10;

const RANK_TOLERANCE = 1e-9;
const CLEAN_TOLERANCE = 1e-12;
const DEGREES_TO_RADIANS = Math.PI / 180;

export const TRANSFORM_PRESETS = Object.freeze({
  scale: "Scale",
  shear: "Shear",
  rotation: "Rotation",
  reflection: "Reflection",
  collapse: "Collapse",
  symmetric: "Symmetric stretch",
  quarterTurn: "Quarter turn",
  projection: "Projection"
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function clean(value, tolerance = CLEAN_TOLERANCE) {
  return Math.abs(value) < tolerance ? 0 : value;
}

export function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

export function add(a, b) {
  return a.map((value, index) => value + (b[index] ?? 0));
}

export function subtract(a, b) {
  return a.map((value, index) => value - (b[index] ?? 0));
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

export function padVector(vector, activeDimension = 3) {
  const result = [0, 0, 0];
  const values = Array.isArray(vector) ? vector : [];
  const n = clamp(Math.round(finiteNumber(activeDimension, 3)), 1, 3);

  for (let index = 0; index < n; index += 1) {
    result[index] = finiteNumber(values[index]);
  }

  return result;
}

function cleanVector(vector) {
  return vector.map((value) => clean(value));
}

function standardBasis(dimension) {
  return Array.from({ length: dimension }, (_, column) => {
    const vector = [0, 0, 0];
    vector[column] = 1;
    return vector;
  });
}

export function orthonormalize(vectors, activeDimension = 3, tolerance = RANK_TOLERANCE) {
  const n = clamp(Math.round(finiteNumber(activeDimension, 3)), 1, 3);
  const basis = [];

  for (const source of vectors) {
    let residual = padVector(source, n);
    const sourceLength = norm(residual);

    for (let pass = 0; pass < 2; pass += 1) {
      for (const direction of basis) {
        residual = subtract(residual, scale(direction, dot(direction, residual)));
      }
    }

    const residualLength = norm(residual);
    if (residualLength > tolerance * Math.max(1, sourceLength)) {
      basis.push(cleanVector(scale(residual, 1 / residualLength)));
    }
  }

  return basis;
}

function orthonormalComplement(basis, activeDimension, preferred = []) {
  const result = [];
  const candidates = [...preferred, ...standardBasis(activeDimension)];
  const needed = activeDimension - basis.length;

  for (const candidate of candidates) {
    if (result.length === needed) {
      break;
    }

    let residual = padVector(candidate, activeDimension);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const direction of [...basis, ...result]) {
        residual = subtract(residual, scale(direction, dot(direction, residual)));
      }
    }

    const length = norm(residual);
    if (length > RANK_TOLERANCE) {
      result.push(cleanVector(scale(residual, 1 / length)));
    }
  }

  return result;
}

export function identityMatrix(dimension) {
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => (row === column ? 1 : 0))
  );
}

export function multiplyMatrices(left, right) {
  const rows = left.length;
  const inner = right.length;
  const columns = right[0]?.length ?? 0;

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      let value = 0;
      for (let index = 0; index < inner; index += 1) {
        value += left[row][index] * right[index][column];
      }
      return clean(value);
    })
  );
}

export function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

export function determinant(matrix) {
  const n = matrix.length;

  if (n === 1) {
    return clean(matrix[0][0]);
  }

  if (n === 2) {
    return clean(matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]);
  }

  if (n === 3) {
    const [a, b, c] = matrix[0];
    const [d, e, f] = matrix[1];
    const [g, h, i] = matrix[2];
    return clean(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g));
  }

  throw new Error("Determinants are supported only for 1x1, 2x2, and 3x3 matrices.");
}

function maxAbsolute(values) {
  let maximum = 0;
  for (const value of values.flat(Infinity)) {
    maximum = Math.max(maximum, Math.abs(value));
  }
  return maximum;
}

function matrixDifferenceMaximum(left, right) {
  let maximum = 0;
  for (let row = 0; row < left.length; row += 1) {
    for (let column = 0; column < left[row].length; column += 1) {
      maximum = Math.max(maximum, Math.abs(left[row][column] - right[row][column]));
    }
  }
  return clean(maximum);
}

function canonicalFrame(n, requestedK, orientation, tilt) {
  if (n === 1) {
    return {
      frame: [[1, 0, 0]],
      preferredNormals: [[1, 0, 0]]
    };
  }

  const azimuth = orientation * DEGREES_TO_RADIANS;

  if (n === 2) {
    const direction = cleanVector([Math.cos(azimuth), Math.sin(azimuth), 0]);
    const perpendicular = cleanVector([-direction[1], direction[0], 0]);
    return {
      frame: [direction, perpendicular],
      preferredNormals: requestedK === 0 ? [direction, perpendicular] : [perpendicular]
    };
  }

  const elevation = tilt * DEGREES_TO_RADIANS;
  const direction = cleanVector([
    Math.cos(elevation) * Math.cos(azimuth),
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation)
  ]);
  const complement = orthonormalComplement([direction], 3);

  if (requestedK === 2) {
    return {
      frame: [complement[0], complement[1], direction],
      preferredNormals: [direction, complement[1]]
    };
  }

  return {
    frame: [direction, ...complement],
    preferredNormals: requestedK === 0 ? [direction, ...complement] : complement
  };
}

function rawGeneratorsFromFrame(frame, requestedK, dependence) {
  if (requestedK === 0) {
    return [];
  }

  const generators = [[...frame[0]]];
  for (let index = 1; index < requestedK; index += 1) {
    if (dependence === 1) {
      generators.push([...frame[0]]);
    } else {
      const independentPart = scale(frame[index], 1 - dependence);
      const dependentPart = scale(frame[0], dependence);
      generators.push(cleanVector(normalize(add(independentPart, dependentPart))));
    }
  }

  return generators;
}

function projectionFromBasis(basis, n) {
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, column) =>
      clean(basis.reduce((sum, direction) => sum + direction[row] * direction[column], 0))
    )
  );
}

function targetTransformationFor(preset, n, projectionMatrix) {
  const matrix = identityMatrix(n);

  if (preset === "projection") {
    return projectionMatrix.map((row) => [...row]);
  }

  if (preset === "scale") {
    const factors = [1.5, 0.75, 1.2];
    for (let index = 0; index < n; index += 1) {
      matrix[index][index] = factors[index];
    }
  } else if (preset === "shear") {
    if (n >= 2) {
      matrix[0][1] = 0.8;
    }
    if (n === 3) {
      matrix[1][2] = 0.45;
    }
  } else if (preset === "rotation" || preset === "quarterTurn") {
    if (n >= 2) {
      const angle = preset === "quarterTurn" ? Math.PI / 2 : Math.PI / 4;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      matrix[0][0] = cosine;
      matrix[0][1] = -sine;
      matrix[1][0] = sine;
      matrix[1][1] = cosine;
    }
  } else if (preset === "reflection") {
    matrix[0][0] = -1;
  } else if (preset === "collapse") {
    matrix[n - 1][n - 1] = 0;
  } else if (preset === "symmetric") {
    matrix[0][0] = 1.4;
    if (n >= 2) {
      matrix[0][1] = 0.45;
      matrix[1][0] = 0.45;
      matrix[1][1] = 0.8;
    }
    if (n === 3) {
      matrix[2][2] = 1.1;
    }
  }

  return matrix.map((row) => row.map((value) => clean(value)));
}

function interpolateMatrices(start, target, progress) {
  return start.map((row, rowIndex) =>
    row.map((value, columnIndex) => clean(value + progress * (target[rowIndex][columnIndex] - value)))
  );
}

function eigenvector2(matrix, eigenvalue) {
  const firstRow = [matrix[0][0] - eigenvalue, matrix[0][1]];
  const secondRow = [matrix[1][0], matrix[1][1] - eigenvalue];
  const row = squaredNorm(firstRow) >= squaredNorm(secondRow) ? firstRow : secondRow;
  return cleanVector(normalize([-row[1], row[0], 0]));
}

function classifyEigen2(matrix) {
  const [a, b] = matrix[0];
  const [c, d] = matrix[1];
  const matrixScale = Math.max(1, maxAbsolute(matrix));
  const matrixTolerance = EPSILON * matrixScale;

  if (Math.abs(b) <= matrixTolerance && Math.abs(c) <= matrixTolerance && Math.abs(a - d) <= matrixTolerance) {
    const value = clean((a + d) / 2);
    return {
      kind: "all",
      pairs: [
        { value, vector: [1, 0, 0] },
        { value, vector: [0, 1, 0] }
      ],
      message: `Every direction is an eigenvector with eigenvalue ${formatNumber(value)}.`
    };
  }

  const trace = a + d;
  const matrixDeterminant = a * d - b * c;
  const discriminant = trace * trace - 4 * matrixDeterminant;
  const discriminantTolerance = EPSILON * matrixScale * matrixScale * 4;

  if (discriminant < -discriminantTolerance) {
    return {
      kind: "complex",
      pairs: [],
      message: "This transformation has no real eigenline; its two eigenvalues form a complex-conjugate pair."
    };
  }

  if (Math.abs(discriminant) <= discriminantTolerance) {
    const value = clean(trace / 2);
    return {
      kind: "repeated",
      pairs: [{ value, vector: eigenvector2(matrix, value) }],
      message: "The repeated real eigenvalue has only one eigenline, so this transformation is defective."
    };
  }

  const root = Math.sqrt(Math.max(0, discriminant));
  const values = [clean((trace + root) / 2), clean((trace - root) / 2)];
  return {
    kind: "real",
    pairs: values.map((value) => ({ value, vector: eigenvector2(matrix, value) })),
    message: "This transformation has two real eigendirections."
  };
}

function allDirectionsEigen(matrix, n) {
  const value = clean(matrix.reduce((sum, row, index) => sum + row[index], 0) / n);
  return {
    kind: "all",
    pairs: standardBasis(n).map((vector) => ({ value, vector })),
    message: `Every direction is an eigenvector with eigenvalue ${formatNumber(value)}.`
  };
}

function isScalarMatrix(matrix) {
  const value = matrix[0][0];
  const matrixScale = Math.max(1, maxAbsolute(matrix));
  const tolerance = EPSILON * matrixScale;

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      const expected = row === column ? value : 0;
      if (Math.abs(matrix[row][column] - expected) > tolerance) {
        return false;
      }
    }
  }

  return true;
}

function classifyEigen3(matrix, preset, basis, normalBasis, progress) {
  if (isScalarMatrix(matrix)) {
    return allDirectionsEigen(matrix, 3);
  }

  if (preset === "projection") {
    return {
      kind: "real",
      pairs: [
        ...basis.map((vector) => ({ value: 1, vector: [...vector] })),
        ...normalBasis.map((vector) => ({ value: clean(1 - progress), vector: [...vector] }))
      ],
      message: progress === 1
        ? "Projection keeps directions in the flat at eigenvalue 1 and removes normal directions at eigenvalue 0."
        : "The interpolated projection keeps flat directions fixed and scales normal directions toward zero."
    };
  }

  if (["scale", "reflection", "collapse"].includes(preset)) {
    return {
      kind: "real",
      pairs: standardBasis(3).map((vector, index) => ({ value: clean(matrix[index][index]), vector })),
      message: "The coordinate axes are known eigendirections for this diagonal transformation."
    };
  }

  if (preset === "shear") {
    return {
      kind: "repeated",
      pairs: [{ value: 1, vector: [1, 0, 0] }],
      message: "This 3D shear has repeated eigenvalue 1 and one known real eigenline along the first coordinate axis."
    };
  }

  if (preset === "rotation" || preset === "quarterTurn") {
    return {
      kind: "complex",
      pairs: [{ value: 1, vector: [0, 0, 1] }],
      message: "The rotation axis is a real eigenline with eigenvalue 1; the rotating coordinate plane contributes a complex-conjugate pair."
    };
  }

  if (preset === "symmetric") {
    const planar = classifyEigen2([
      [matrix[0][0], matrix[0][1]],
      [matrix[1][0], matrix[1][1]]
    ]);
    return {
      kind: "real",
      pairs: [...planar.pairs, { value: clean(matrix[2][2]), vector: [0, 0, 1] }],
      message: "This selected symmetric preset has three real orthogonal eigendirections."
    };
  }

  return {
    kind: "real",
    pairs: [],
    message: "No general nonsymmetric 3D eigensolver is used for this transformation."
  };
}

function classifyEigen(matrix, preset, basis, normalBasis, progress) {
  if (matrix.length === 1) {
    return allDirectionsEigen(matrix, 1);
  }

  if (matrix.length === 2) {
    return classifyEigen2(matrix);
  }

  return classifyEigen3(matrix, preset, basis, normalBasis, progress);
}

function transformedStandardBasis(matrix, n) {
  return Array.from({ length: n }, (_, column) => {
    const vector = [0, 0, 0];
    for (let row = 0; row < n; row += 1) {
      vector[row] = clean(matrix[row][column]);
    }
    return vector;
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function computeGeometry(state = {}) {
  const n = clamp(Math.round(finiteNumber(state.ambientDimension, 3)), 1, 3);
  const requestedK = clamp(Math.round(finiteNumber(state.intrinsicDimension, Math.min(2, n))), 0, n);
  const orientation = clamp(finiteNumber(state.orientation), -180, 180);
  const tilt = clamp(finiteNumber(state.tilt), -80, 80);
  const offset = finiteNumber(state.offset);
  const dependence = clamp(finiteNumber(state.dependence), 0, 1);
  const coefficients = padVector(state.coefficients, 3);
  const queryPoint = padVector(state.queryPoint, n);
  const transformPreset = Object.hasOwn(TRANSFORM_PRESETS, state.transformPreset)
    ? state.transformPreset
    : "scale";
  const transformProgress = clamp(finiteNumber(state.transformProgress, 1), 0, 1);

  const { frame, preferredNormals } = canonicalFrame(n, requestedK, orientation, tilt);
  const rawGenerators = rawGeneratorsFromFrame(frame, requestedK, dependence);
  const basis = orthonormalize(rawGenerators, n);
  const rank = basis.length;
  const normalBasis = orthonormalComplement(basis, n, preferredNormals);
  const anchor = rank < n ? cleanVector(scale(normalBasis[0], offset)) : [0, 0, 0];
  const constraintRhs = normalBasis.map((normal) => clean(dot(normal, anchor)));

  let generatedPoint = [...anchor];
  for (let index = 0; index < rawGenerators.length; index += 1) {
    generatedPoint = add(generatedPoint, scale(rawGenerators[index], coefficients[index]));
  }
  generatedPoint = cleanVector(generatedPoint);

  const relativeQuery = subtract(queryPoint, anchor);
  let parallelComponent = [0, 0, 0];
  for (const direction of basis) {
    parallelComponent = add(parallelComponent, scale(direction, dot(direction, relativeQuery)));
  }
  parallelComponent = cleanVector(parallelComponent);
  const perpendicularComponent = cleanVector(subtract(relativeQuery, parallelComponent));
  const projectedPoint = cleanVector(add(anchor, parallelComponent));
  const distance = clean(norm(perpendicularComponent));

  const projectionMatrix = projectionFromBasis(basis, n);
  const projectionSquared = multiplyMatrices(projectionMatrix, projectionMatrix);
  const projectionTranspose = projectionMatrix.map((_, row) => projectionMatrix.map((column) => column[row]));
  let basisNormalMax = 0;
  for (const direction of basis) {
    for (const normal of normalBasis) {
      basisNormalMax = Math.max(basisNormalMax, Math.abs(dot(direction, normal)));
    }
  }
  const projectionResidualMax = basis.reduce(
    (maximum, direction) => Math.max(maximum, Math.abs(dot(direction, perpendicularComponent))),
    0
  );

  const targetTransformation = targetTransformationFor(transformPreset, n, projectionMatrix);
  const transformationMatrix = interpolateMatrices(identityMatrix(n), targetTransformation, transformProgress);
  const transformationDeterminant = determinant(transformationMatrix);
  const orientationSign = Math.abs(transformationDeterminant) <= EPSILON
    ? 0
    : Math.sign(transformationDeterminant);
  const transformedBasis = transformedStandardBasis(transformationMatrix, n);
  const eigen = classifyEigen(
    transformationMatrix,
    transformPreset,
    basis,
    normalBasis,
    transformProgress
  );

  return deepFreeze({
    n,
    requestedK,
    k: rank,
    rank,
    isDependent: rank < requestedK,
    anchor,
    rawGenerators,
    basis,
    normalBasis,
    constraintRhs,
    generatedPoint,
    queryPoint,
    projectedPoint,
    parallelComponent,
    perpendicularComponent,
    distance,
    projectionMatrix,
    transformPreset,
    transformProgress,
    transformationMatrix,
    targetTransformation,
    transformedBasis,
    determinant: transformationDeterminant,
    orientationSign,
    eigen,
    checks: {
      basisNormalMax: clean(basisNormalMax),
      projectionResidualMax: clean(projectionResidualMax),
      projectionIdempotenceMax: matrixDifferenceMaximum(projectionSquared, projectionMatrix),
      projectionSymmetryMax: matrixDifferenceMaximum(projectionTranspose, projectionMatrix)
    }
  });
}

export function formatNumber(value, digits = 2) {
  const cleaned = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return cleaned.toFixed(digits).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
