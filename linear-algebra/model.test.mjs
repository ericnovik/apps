import assert from "node:assert/strict";
import {
  TRANSFORM_PRESETS,
  computeGeometry,
  determinant,
  dot,
  formatNumber,
  multiplyMatrices,
  norm,
  subtract
} from "./model.js";

const TOLERANCE = 1e-9;

function state(overrides = {}) {
  return {
    chapter: 0,
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 32,
    tilt: 21,
    offset: 0,
    dependence: 0,
    coefficients: [0.7, -1.1, 0.4],
    queryPoint: [2.5, -1.2, 3.1],
    transformPreset: "scale",
    transformProgress: 1,
    ...overrides
  };
}

function approximately(actual, expected, tolerance = TOLERANCE, message = "") {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function vectorApproximately(actual, expected, tolerance = TOLERANCE) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => approximately(value, expected[index], tolerance));
}

function matrixApproximately(actual, expected, tolerance = TOLERANCE) {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, index) => vectorApproximately(row, expected[index], tolerance));
}

function assertEigenpairs(model, tolerance = 1e-8) {
  for (const pair of model.eigen.pairs) {
    const activeVector = pair.vector.slice(0, model.n);
    const transformed = model.transformationMatrix.map((row) => dot(row, activeVector));
    const expected = activeVector.map((value) => value * pair.value);
    vectorApproximately(transformed, expected, tolerance);
  }
}

function testDimensionsAndRank() {
  for (let n = 1; n <= 3; n += 1) {
    for (let requestedK = 0; requestedK <= n; requestedK += 1) {
      const model = computeGeometry(state({
        ambientDimension: n,
        intrinsicDimension: requestedK,
        dependence: 0
      }));

      assert.equal(model.n, n);
      assert.equal(model.requestedK, requestedK);
      assert.equal(model.k, requestedK);
      assert.equal(model.rank, requestedK);
      assert.equal(model.isDependent, false);
      assert.equal(model.rawGenerators.length, requestedK);
      assert.equal(model.basis.length, requestedK);
      assert.equal(model.normalBasis.length, n - requestedK);
      assert.equal(model.projectionMatrix.length, n);
      model.projectionMatrix.forEach((row) => assert.equal(row.length, n));
      model.basis.forEach((vector) => assert.equal(vector.length, 3));
      model.normalBasis.forEach((vector) => assert.equal(vector.length, 3));
    }
  }

  const dependentPlane = computeGeometry(state({
    ambientDimension: 2,
    intrinsicDimension: 2,
    dependence: 1
  }));
  assert.equal(dependentPlane.requestedK, 2);
  assert.equal(dependentPlane.k, 1);
  assert.equal(dependentPlane.rank, 1);
  assert.equal(dependentPlane.isDependent, true);
  vectorApproximately(dependentPlane.rawGenerators[0], dependentPlane.rawGenerators[1]);

  const dependentSpace = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 3,
    dependence: 1
  }));
  assert.equal(dependentSpace.rank, 1);
  assert.equal(dependentSpace.normalBasis.length, 2);
  assert.equal(dependentSpace.isDependent, true);

  const nearlyDependent = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 3,
    dependence: 0.999999
  }));
  assert.equal(nearlyDependent.rank, 3);
  assert.equal(nearlyDependent.isDependent, false);
}

function testBuildAndCutRepresentations() {
  const model = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: -47,
    tilt: 36,
    offset: 1.75,
    dependence: 0.42,
    coefficients: [1.2, -0.8, 0]
  }));

  assert.equal(model.basis.length, 2);
  assert.equal(model.normalBasis.length, 1);
  assert.ok(model.checks.basisNormalMax <= TOLERANCE);
  approximately(norm(model.anchor), 1.75);
  approximately(dot(model.normalBasis[0], model.anchor), 1.75);

  model.normalBasis.forEach((normal, index) => {
    approximately(dot(normal, model.generatedPoint), model.constraintRhs[index]);
  });
  model.basis.forEach((basisVector) => {
    model.normalBasis.forEach((normal) => approximately(dot(basisVector, normal), 0));
  });
}

function testAffineProjection() {
  const model = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 18,
    tilt: -31,
    offset: 2.25,
    queryPoint: [3.2, -2.4, 1.1]
  }));

  vectorApproximately(
    model.projectedPoint,
    model.anchor.map((value, index) => value + model.parallelComponent[index])
  );
  vectorApproximately(
    subtract(model.queryPoint, model.anchor),
    model.parallelComponent.map((value, index) => value + model.perpendicularComponent[index])
  );
  approximately(model.distance, norm(model.perpendicularComponent));

  model.normalBasis.forEach((normal, index) => {
    approximately(dot(normal, model.projectedPoint), model.constraintRhs[index]);
  });
  model.basis.forEach((basisVector) => {
    approximately(dot(basisVector, model.perpendicularComponent), 0);
  });

  const line = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 1,
    offset: -1.4,
    queryPoint: [-2, 1.5, 3.7]
  }));
  line.normalBasis.forEach((normal, index) => {
    approximately(dot(normal, line.projectedPoint), line.constraintRhs[index]);
  });
}

function testProjectionMatrixChecks() {
  const model = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 2,
    orientation: 71,
    tilt: 43
  }));
  const squared = multiplyMatrices(model.projectionMatrix, model.projectionMatrix);
  const transpose = model.projectionMatrix.map((_, row) =>
    model.projectionMatrix.map((column) => column[row])
  );

  matrixApproximately(squared, model.projectionMatrix);
  matrixApproximately(transpose, model.projectionMatrix);
  assert.ok(model.checks.projectionIdempotenceMax <= TOLERANCE);
  assert.ok(model.checks.projectionSymmetryMax <= TOLERANCE);
  assert.ok(model.checks.projectionResidualMax <= TOLERANCE);
}

function transformation(preset, ambientDimension = 2, overrides = {}) {
  return computeGeometry(state({
    ambientDimension,
    intrinsicDimension: Math.min(1, ambientDimension),
    transformPreset: preset,
    transformProgress: 1,
    ...overrides
  }));
}

function testDeterminants() {
  const scale2 = transformation("scale");
  approximately(scale2.determinant, 1.5 * 0.75);
  approximately(scale2.determinant, determinant(scale2.targetTransformation));
  assert.equal(scale2.orientationSign, 1);

  const shear2 = transformation("shear");
  approximately(shear2.determinant, 1);
  assert.equal(shear2.orientationSign, 1);

  const reflection2 = transformation("reflection");
  approximately(reflection2.determinant, -1);
  assert.equal(reflection2.orientationSign, -1);

  const collapse2 = transformation("collapse");
  approximately(collapse2.determinant, 0);
  assert.equal(collapse2.orientationSign, 0);

  const scale3 = transformation("scale", 3);
  approximately(scale3.determinant, 1.5 * 0.75 * 1.2);

  const shear3 = transformation("shear", 3);
  approximately(shear3.determinant, 1);

  const collapse3 = transformation("collapse", 3);
  approximately(collapse3.determinant, 0);

  const start = computeGeometry(state({
    ambientDimension: 3,
    intrinsicDimension: 2,
    transformPreset: "reflection",
    transformProgress: 0
  }));
  matrixApproximately(start.transformationMatrix, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  approximately(start.determinant, 1);
}

function testEigenClassifications() {
  const identity = computeGeometry(state({
    ambientDimension: 2,
    transformPreset: "shear",
    transformProgress: 0
  }));
  assert.equal(identity.eigen.kind, "all");
  assert.equal(identity.eigen.pairs.length, 2);
  assertEigenpairs(identity);

  const scale = transformation("scale");
  assert.equal(scale.eigen.kind, "real");
  assert.equal(scale.eigen.pairs.length, 2);
  assertEigenpairs(scale);

  const shear = transformation("shear");
  assert.equal(shear.eigen.kind, "repeated");
  assert.equal(shear.eigen.pairs.length, 1);
  assertEigenpairs(shear);

  const quarterTurn = transformation("quarterTurn");
  assert.equal(quarterTurn.eigen.kind, "complex");
  assert.equal(quarterTurn.eigen.pairs.length, 0);

  const symmetric = transformation("symmetric");
  assert.equal(symmetric.eigen.kind, "real");
  assert.equal(symmetric.eigen.pairs.length, 2);
  approximately(dot(symmetric.eigen.pairs[0].vector, symmetric.eigen.pairs[1].vector), 0);
  assertEigenpairs(symmetric);

  const projection = transformation("projection", 3, {
    intrinsicDimension: 2,
    orientation: 24,
    tilt: 28
  });
  assert.equal(projection.eigen.kind, "real");
  assert.deepEqual(
    projection.eigen.pairs.map((pair) => pair.value).sort((a, b) => b - a),
    [1, 1, 0]
  );
  approximately(projection.determinant, 0);
  assertEigenpairs(projection);

  const rotation3 = transformation("quarterTurn", 3);
  assert.equal(rotation3.eigen.kind, "complex");
  assert.equal(rotation3.eigen.pairs.length, 1);
  assertEigenpairs(rotation3);
}

function testFormattingAndImmutability() {
  assert.equal(formatNumber(2), "2");
  assert.equal(formatNumber(1.234, 2), "1.23");
  assert.equal(formatNumber(-0.0001, 2), "0");
  assert.deepEqual(Object.keys(TRANSFORM_PRESETS), [
    "scale",
    "shear",
    "rotation",
    "reflection",
    "collapse",
    "symmetric",
    "quarterTurn",
    "projection"
  ]);

  const model = computeGeometry(state());
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.basis));
  assert.ok(Object.isFrozen(model.basis[0]));
  assert.ok(Object.isFrozen(model.eigen));
  assert.throws(() => {
    model.anchor[0] = 99;
  }, TypeError);
}

testDimensionsAndRank();
testBuildAndCutRepresentations();
testAffineProjection();
testProjectionMatrixChecks();
testDeterminants();
testEigenClassifications();
testFormattingAndImmutability();

console.log("linear-algebra model tests passed");
