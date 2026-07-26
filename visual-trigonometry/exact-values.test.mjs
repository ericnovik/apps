import assert from "node:assert/strict";

import {
  EXACT_ANGLE_TOLERANCE,
  SNAP_ANGLE_TOLERANCE,
  EXACT_ANGLE_CHIPS,
  STANDARD_ANGLES,
  recognizeExactAngle,
  snapToExactAngle
} from "./exact-values.js";

const TAU = 2 * Math.PI;
const EPSILON = 1e-12;
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

function assertDeeplyFrozen(value) {
  if (value === null || typeof value !== "object") {
    return;
  }

  assert.ok(Object.isFrozen(value), "Expected every metadata object to be frozen");
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child);
  }
}

const EXPECTED_VALUES = [
  [0, "1", "0"],
  [30, "√3/2", "1/2"],
  [45, "√2/2", "√2/2"],
  [60, "1/2", "√3/2"],
  [90, "0", "1"],
  [120, "-1/2", "√3/2"],
  [135, "-√2/2", "√2/2"],
  [150, "-√3/2", "1/2"],
  [180, "-1", "0"],
  [210, "-√3/2", "-1/2"],
  [225, "-√2/2", "-√2/2"],
  [240, "-1/2", "-√3/2"],
  [270, "0", "-1"],
  [300, "1/2", "-√3/2"],
  [315, "√2/2", "-√2/2"],
  [330, "√3/2", "-1/2"]
];

test("tolerances are small and snapping is four degrees", () => {
  assert.ok(EXACT_ANGLE_TOLERANCE > 0);
  assert.ok(EXACT_ANGLE_TOLERANCE < 1e-6);
  closeTo(SNAP_ANGLE_TOLERANCE, 4 * Math.PI / 180);
});

test("angle chips contain exactly the requested choices and labels", () => {
  const expectedAngles = [
    0,
    Math.PI / 6,
    Math.PI / 4,
    Math.PI / 3,
    Math.PI / 2,
    Math.PI,
    3 * Math.PI / 2,
    TAU
  ];
  const expectedPlain = ["0", "π/6", "π/4", "π/3", "π/2", "π", "3π/2", "2π"];
  const expectedDegrees = [0, 30, 45, 60, 90, 180, 270, 360];

  assert.equal(EXACT_ANGLE_CHIPS.length, expectedAngles.length);
  for (let index = 0; index < EXACT_ANGLE_CHIPS.length; index += 1) {
    const chip = EXACT_ANGLE_CHIPS[index];
    closeTo(chip.angle, expectedAngles[index]);
    assert.equal(chip.value, expectedAngles[index]);
    assert.equal(chip.plain, expectedPlain[index]);
    assert.equal(chip.radiansPlain, expectedPlain[index]);
    assert.equal(chip.radiansTex, chip.tex);
    assert.equal(chip.degrees, expectedDegrees[index]);
    assert.equal(chip.degreeLabel, `${expectedDegrees[index]}°`);
  }
});

test("standard angles are the union of 30-degree and 45-degree multiples", () => {
  assert.deepEqual(
    STANDARD_ANGLES.map(({ angle }) => angle.degrees),
    EXPECTED_VALUES.map(([degrees]) => degrees)
  );
  assert.equal(STANDARD_ANGLES.length, 16);
});

test("every standard angle has numerically and symbolically exact coordinates", () => {
  for (let index = 0; index < STANDARD_ANGLES.length; index += 1) {
    const exact = STANDARD_ANGLES[index];
    const [degrees, expectedCos, expectedSin] = EXPECTED_VALUES[index];

    assert.equal(exact.angle.degrees, degrees);
    assert.equal(exact.angle.degreeLabel, `${degrees}°`);
    assert.equal(exact.cos.plain, expectedCos);
    assert.equal(exact.sin.plain, expectedSin);
    closeTo(exact.cos.value, Math.cos(exact.angle.value));
    closeTo(exact.sin.value, Math.sin(exact.angle.value));
    assert.equal(exact.cos.value, exact.cos.sign * exact.cos.magnitudeValue);
    assert.equal(exact.sin.value, exact.sin.sign * exact.sin.magnitudeValue);
    assert.ok(!exact.cos.tex.includes("√"));
    assert.ok(!exact.sin.tex.includes("√"));
  }
});

test("quadrant metadata covers all four sign patterns", () => {
  const representatives = [
    [30, 1, "Quadrant I", 1, 1],
    [120, 2, "Quadrant II", -1, 1],
    [210, 3, "Quadrant III", -1, -1],
    [300, 4, "Quadrant IV", 1, -1]
  ];

  for (const [degrees, number, label, cosSign, sinSign] of representatives) {
    const exact = recognizeExactAngle(degrees * Math.PI / 180);
    assert.equal(exact.quadrant.number, number);
    assert.equal(exact.quadrant.label, label);
    assert.equal(exact.quadrant.axis, null);
    assert.deepEqual(exact.signs, { cos: cosSign, sin: sinSign });
    assert.equal(exact.cos.sign, cosSign);
    assert.equal(exact.sin.sign, sinSign);
  }
});

test("quadrantal entries identify their axes and zero coordinates", () => {
  const expected = [
    [0, "x", "positive", 1, 0],
    [90, "y", "positive", 0, 1],
    [180, "x", "negative", -1, 0],
    [270, "y", "negative", 0, -1]
  ];

  for (const [degrees, axis, direction, cosSign, sinSign] of expected) {
    const exact = recognizeExactAngle(degrees * Math.PI / 180);
    assert.equal(exact.quadrant.number, null);
    assert.equal(exact.quadrant.axis, axis);
    assert.equal(exact.quadrant.direction, direction);
    assert.deepEqual(exact.signs, { cos: cosSign, sin: sinSign });
    assert.equal(exact.construction.type, "quadrantal");
  }
});

test("reference-angle labels reduce every non-quadrantal family", () => {
  const expectedReferences = new Map([
    [30, 30], [45, 45], [60, 60],
    [120, 60], [135, 45], [150, 30],
    [210, 30], [225, 45], [240, 60],
    [300, 60], [315, 45], [330, 30]
  ]);

  for (const [degrees, referenceDegrees] of expectedReferences) {
    const exact = recognizeExactAngle(degrees * Math.PI / 180);
    assert.equal(exact.referenceAngle.degrees, referenceDegrees);
    assert.equal(exact.referenceAngle.degreeLabel, `${referenceDegrees}°`);
    closeTo(exact.referenceAngle.value, referenceDegrees * Math.PI / 180);
  }
});

test("30, 45, and 60-degree reference families expose their constructions", () => {
  const thirty = recognizeExactAngle(Math.PI / 6).construction;
  const fortyFive = recognizeExactAngle(Math.PI / 4).construction;
  const sixty = recognizeExactAngle(Math.PI / 3).construction;

  assert.equal(thirty.type, "half-equilateral");
  assert.equal(thirty.shortCoordinate, "sin");
  assert.equal(thirty.longCoordinate, "cos");
  assert.equal(thirty.referenceValues.sin.plain, "1/2");
  assert.equal(thirty.referenceValues.cos.plain, "√3/2");

  assert.equal(fortyFive.type, "isosceles-right");
  assert.equal(fortyFive.referenceValues.cos.plain, "√2/2");
  assert.equal(fortyFive.referenceValues.sin.plain, "√2/2");

  assert.equal(sixty.type, "half-equilateral");
  assert.equal(sixty.shortCoordinate, "cos");
  assert.equal(sixty.longCoordinate, "sin");
  assert.equal(sixty.referenceValues.cos.plain, "1/2");
  assert.equal(sixty.referenceValues.sin.plain, "√3/2");

  for (const construction of [thirty, fortyFive, sixty]) {
    assert.ok(construction.title.length > 0);
    assert.ok(construction.equationPlain.length > 0);
    assert.ok(construction.equationTex.length > 0);
    assert.ok(construction.explanation.length > 0);
  }
});

test("reference geometry stays unsigned when quadrant values are negative", () => {
  const quadrantTwo = recognizeExactAngle(5 * Math.PI / 6);
  const quadrantThree = recognizeExactAngle(4 * Math.PI / 3);

  assert.equal(quadrantTwo.cos.plain, "-√3/2");
  assert.equal(quadrantTwo.construction.referenceValues.cos.plain, "√3/2");
  assert.equal(quadrantThree.sin.plain, "-√3/2");
  assert.equal(quadrantThree.construction.referenceValues.sin.plain, "√3/2");
});

test("recognition handles aliases, negative angles, and multiple turns", () => {
  const cases = [
    [TAU, 0],
    [-TAU, 0],
    [-Math.PI / 6, 330],
    [7 * TAU + 3 * Math.PI / 4, 135],
    [-5 * TAU + Math.PI / 3, 60],
    [-3 * TAU - 5 * Math.PI / 4, 135]
  ];

  for (const [theta, expectedDegrees] of cases) {
    const exact = recognizeExactAngle(theta);
    assert.notEqual(exact, null);
    assert.equal(exact.angle.degrees, expectedDegrees);
    assert.ok(exact.angle.value >= 0 && exact.angle.value < TAU);
  }
});

test("recognition rejects arbitrary and non-finite values", () => {
  assert.equal(recognizeExactAngle(0.37), null);
  assert.equal(recognizeExactAngle(Math.PI / 5), null);
  assert.equal(recognizeExactAngle(Number.NaN), null);
  assert.equal(recognizeExactAngle(Number.POSITIVE_INFINITY), null);
});

test("recognition tolerance has a sharp configurable threshold", () => {
  const tolerance = 1e-6;
  const guide = Math.PI / 4;

  assert.notEqual(recognizeExactAngle(guide + 0.99 * tolerance, tolerance), null);
  assert.equal(recognizeExactAngle(guide + 1.01 * tolerance, tolerance), null);
  assert.notEqual(
    recognizeExactAngle(guide + 0.5 * EXACT_ANGLE_TOLERANCE),
    null
  );
  assert.equal(
    recognizeExactAngle(guide + 2 * EXACT_ANGLE_TOLERANCE),
    null
  );
});

test("snapping obeys its threshold and reports the selected exact angle", () => {
  const tolerance = 0.05;
  const guide = 2 * Math.PI / 3;
  const inside = snapToExactAngle(guide + 0.049, { tolerance });
  const outsideInput = guide + 0.051;
  const outside = snapToExactAngle(outsideInput, { tolerance });

  assert.equal(inside.snapped, true);
  closeTo(inside.angle, guide);
  closeTo(inside.distance, 0.049);
  assert.equal(inside.exactAngle.angle.degrees, 120);

  assert.equal(outside.snapped, false);
  assert.equal(outside.angle, outsideInput);
  closeTo(outside.distance, 0.051);
  assert.equal(outside.exactAngle, null);
});

test("disabled snapping preserves the exact input angle", () => {
  const input = Math.PI / 3 + SNAP_ANGLE_TOLERANCE / 2;
  const result = snapToExactAngle(input, { enabled: false });
  const negativeZero = snapToExactAngle(-0, { enabled: false });

  assert.equal(result.snapped, false);
  assert.equal(result.angle, input);
  assert.equal(result.exactAngle, null);
  assert.equal(Object.is(negativeZero.angle, -0), true);
});

test("snapping preserves multi-turn continuity across zero and two pi", () => {
  const offset = SNAP_ANGLE_TOLERANCE / 2;
  const cases = [
    [-TAU - offset, -TAU],
    [-offset, 0],
    [TAU - offset, TAU],
    [TAU + offset, TAU],
    [5 * TAU - offset, 5 * TAU],
    [-4 * TAU + offset, -4 * TAU]
  ];

  for (const [input, expected] of cases) {
    const result = snapToExactAngle(input);
    assert.equal(result.snapped, true);
    closeTo(result.angle, expected);
    closeTo(result.distance, offset);
    assert.equal(result.exactAngle.angle.degrees, 0);
  }
});

test("exported metadata and returned objects are deeply immutable", () => {
  assertDeeplyFrozen(EXACT_ANGLE_CHIPS);
  assertDeeplyFrozen(STANDARD_ANGLES);
  assertDeeplyFrozen(recognizeExactAngle(5 * Math.PI / 4));
  assertDeeplyFrozen(snapToExactAngle(Math.PI / 4 + 0.01));
  assertDeeplyFrozen(snapToExactAngle(0.37));

  assert.throws(() => {
    STANDARD_ANGLES[0].angle.value = 42;
  }, TypeError);
  assert.throws(() => {
    STANDARD_ANGLES[1].construction.referenceValues.sin.plain = "changed";
  }, TypeError);
  assert.throws(() => {
    EXACT_ANGLE_CHIPS.push({});
  }, TypeError);
});

console.log(`\n${passed} tests passed.`);
