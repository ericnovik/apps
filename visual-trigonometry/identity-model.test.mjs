import assert from "node:assert/strict";

import {
  IDENTITY_MODES,
  multiplyComplex,
  conjugateComplex,
  complexPower,
  computeIdentityModel
} from "./identity-model.js";

const TAU = 2 * Math.PI;
const EPSILON = 1e-11;
let passed = 0;

function closeTo(actual, expected, tolerance = EPSILON, message = undefined) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function closeComplex(actual, expected, tolerance = EPSILON) {
  closeTo(actual.real, expected.real, tolerance);
  closeTo(actual.imaginary, expected.imaginary, tolerance);
}

function normalizeAngle(angle) {
  let normalized = angle % TAU;
  if (normalized < 0) normalized += TAU;
  return Math.abs(normalized) <= EPSILON || Math.abs(normalized - TAU) <= EPSILON
    ? 0
    : normalized;
}

function createRandom(seed = 0x1d3f71a5) {
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

  assert.ok(Object.isFrozen(value), "Expected every nested model value to be frozen");
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child);
  }
}

function assertZeroChecks(model, tolerance = 0) {
  assert.ok(Object.keys(model.checks).length > 0);
  for (const [name, residual] of Object.entries(model.checks)) {
    assert.equal(typeof residual, "number", `${model.mode}.${name} must be numeric`);
    assert.ok(Number.isFinite(residual), `${model.mode}.${name} must be finite`);
    assert.ok(
      Math.abs(residual) <= tolerance,
      `${model.mode}.${name} was ${residual}, expected at most ${tolerance}`
    );
  }
}

function assertIdentityContract(model) {
  assert.deepEqual(Object.keys(model), [
    "mode",
    "title",
    "shortTitle",
    "geometryText",
    "complexTex",
    "trigTex",
    "detailTex",
    "parameters",
    "base",
    "derivedPoints",
    "waveMarkers",
    "comparisonCurve",
    "construction",
    "values",
    "checks"
  ]);
  assert.equal(typeof model.mode, "string");
  assert.equal(typeof model.title, "string");
  assert.equal(typeof model.shortTitle, "string");
  assert.equal(typeof model.geometryText, "string");
  assert.equal(typeof model.complexTex, "string");
  assert.equal(typeof model.trigTex, "string");
  assert.equal(typeof model.detailTex, "string");
  assert.deepEqual(Object.keys(model.parameters), ["alpha", "beta", "power"]);
  assert.deepEqual(Object.keys(model.base), [
    "angle",
    "normalizedAngle",
    "point",
    "complex"
  ]);
  assert.deepEqual(Object.keys(model.base.point), ["x", "y"]);
  assert.deepEqual(Object.keys(model.base.complex), ["real", "imaginary"]);
  closeTo(model.base.point.x, model.base.complex.real, 0);
  closeTo(model.base.point.y, model.base.complex.imaginary, 0);
  closeTo(model.base.point.x ** 2 + model.base.point.y ** 2, 1);
  assert.ok(model.base.normalizedAngle >= 0 && model.base.normalizedAngle < TAU);
  assert.ok(Array.isArray(model.derivedPoints));
  assert.ok(Array.isArray(model.waveMarkers));
  assert.equal(typeof model.construction, "object");
  assert.equal(typeof model.values, "object");
  assert.equal(typeof model.checks, "object");

  for (const point of model.derivedPoints) {
    assert.deepEqual(Object.keys(point), [
      "role",
      "angle",
      "normalizedAngle",
      "point",
      "label",
      "tone"
    ]);
    assert.deepEqual(Object.keys(point.point), ["x", "y"]);
    assert.ok(point.tone === "reference" || point.tone === "derived");
    assert.ok(point.normalizedAngle >= 0 && point.normalizedAngle < TAU);
    closeTo(point.point.x, Math.cos(point.angle));
    closeTo(point.point.y, Math.sin(point.angle));
  }

  for (const marker of model.waveMarkers) {
    assert.deepEqual(Object.keys(marker), [
      "role",
      "angle",
      "normalizedAngle",
      "label",
      "tone"
    ]);
    assert.ok(marker.tone === "reference" || marker.tone === "derived");
    assert.ok(marker.normalizedAngle >= 0 && marker.normalizedAngle < TAU);
  }

  for (const [name, value] of Object.entries(model.values)) {
    assert.equal(typeof value, "number", `${model.mode}.values.${name} must be numeric`);
    assert.ok(Number.isFinite(value), `${model.mode}.values.${name} must be finite`);
  }

  for (const [name, value] of Object.entries(model.checks)) {
    assert.equal(typeof value, "number", `${model.mode}.checks.${name} must be numeric`);
    assert.ok(Number.isFinite(value), `${model.mode}.checks.${name} must be finite`);
  }
}

function test(name, callback) {
  callback();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("IDENTITY_MODES has the required order, readable labels, and deep immutability", () => {
  assert.deepEqual(
    IDENTITY_MODES.map((mode) => mode.id),
    ["coordinates", "norm", "addition", "powers", "conjugate", "quarter-turn"]
  );

  for (const mode of IDENTITY_MODES) {
    assert.ok(mode.label.length >= mode.shortLabel.length);
    assert.ok(mode.label.trim().length > 0);
    assert.ok(mode.shortLabel.trim().length > 0);
  }

  assertDeeplyFrozen(IDENTITY_MODES);
  assert.throws(() => IDENTITY_MODES.push({ id: "other" }), TypeError);
  assert.throws(() => {
    IDENTITY_MODES[0].label = "Changed";
  }, TypeError);
});

test("multiplyComplex handles representative, random, partial, and invalid values", () => {
  assert.deepEqual(
    multiplyComplex({ real: 2, imaginary: 3 }, { real: -4, imaginary: 5 }),
    { real: -23, imaginary: -2 }
  );
  assert.deepEqual(
    multiplyComplex({ real: 0, imaginary: 1 }, { real: 3, imaginary: -2 }),
    { real: 2, imaginary: 3 }
  );
  assert.deepEqual(
    multiplyComplex({ real: Number.NaN, imaginary: 2 }, {
      real: 3,
      imaginary: Number.POSITIVE_INFINITY
    }),
    { real: 0, imaginary: 6 }
  );
  assert.deepEqual(multiplyComplex(null, undefined), { real: 0, imaginary: 0 });
  assert.deepEqual(
    multiplyComplex({ real: 4 }, { imaginary: -2 }),
    { real: 0, imaginary: -8 }
  );

  const random = createRandom();
  for (let index = 0; index < 300; index += 1) {
    const a = {
      real: random() * 20 - 10,
      imaginary: random() * 20 - 10
    };
    const b = {
      real: random() * 20 - 10,
      imaginary: random() * 20 - 10
    };
    const product = multiplyComplex(a, b);
    closeTo(product.real, a.real * b.real - a.imaginary * b.imaginary, 1e-12);
    closeTo(
      product.imaginary,
      a.real * b.imaginary + a.imaginary * b.real,
      1e-12
    );
  }
});

test("conjugateComplex negates the imaginary part and is an involution", () => {
  const values = [
    { real: 3, imaginary: 4 },
    { real: -2.5, imaginary: 0 },
    { real: 0, imaginary: -7.25 },
    { real: 1e-14, imaginary: -1e-14 }
  ];

  for (const value of values) {
    const conjugate = conjugateComplex(value);
    assert.equal(conjugate.real, value.real);
    assert.equal(
      conjugate.imaginary,
      value.imaginary === 0 ? 0 : -value.imaginary
    );
    assert.deepEqual(conjugateComplex(conjugate), value);
  }

  assert.deepEqual(
    conjugateComplex({ real: "3", imaginary: Number.NaN }),
    { real: 0, imaginary: 0 }
  );
  assert.deepEqual(conjugateComplex(null), { real: 0, imaginary: 0 });
});

test("complexPower is robust for zero, positive, negative, and sanitized powers", () => {
  const z = { real: 2, imaginary: -3 };
  assert.deepEqual(complexPower(z, 0), { real: 1, imaginary: 0 });
  assert.deepEqual(complexPower(z, 1), z);
  assert.deepEqual(complexPower(z, 2), { real: -5, imaginary: -12 });
  assert.deepEqual(complexPower({ real: 0, imaginary: 1 }, 4), {
    real: 1,
    imaginary: 0
  });
  assert.deepEqual(complexPower({ real: 0, imaginary: 0 }, 5), {
    real: 0,
    imaginary: 0
  });
  assert.deepEqual(complexPower(null, 3), { real: 0, imaginary: 0 });
  assert.deepEqual(complexPower(z, Number.NaN), { real: 1, imaginary: 0 });
  assert.deepEqual(complexPower(z, 2.9), complexPower(z, 2));

  const positive = complexPower(z, 5);
  const negative = complexPower(z, -5);
  closeComplex(multiplyComplex(positive, negative), { real: 1, imaginary: 0 });

  const random = createRandom(0xdecafbad);
  for (let index = 0; index < 200; index += 1) {
    const value = {
      real: random() * 4 - 2,
      imaginary: random() * 4 - 2
    };
    for (let power = 2; power <= 6; power += 1) {
      let repeated = { real: 1, imaginary: 0 };
      for (let count = 0; count < power; count += 1) {
        repeated = multiplyComplex(repeated, value);
      }
      closeComplex(complexPower(value, power), repeated, 1e-10);
    }
  }
});

test("every identity mode returns the complete stable contract", () => {
  for (const { id, label, shortLabel } of IDENTITY_MODES) {
    const input = {
      mode: id,
      theta: Math.PI / 5,
      radius: 1.25,
      alpha: Math.PI / 7,
      beta: Math.PI / 9,
      power: 4
    };
    if (id === "addition") input.theta = input.alpha + input.beta;

    const model = computeIdentityModel(input);
    assertIdentityContract(model);
    assert.equal(model.mode, id);
    assert.equal(model.title, label);
    assert.equal(model.shortTitle, shortLabel);
    assert.equal(model.parameters.alpha, input.alpha);
    assert.equal(model.parameters.beta, input.beta);
    assert.equal(model.parameters.power, input.power);
    assert.equal(model.comparisonCurve === null, id !== "quarter-turn");
    assertZeroChecks(model);
  }
});

test("coordinates models the Euler and arbitrary-radius polar relationships", () => {
  const theta = Math.PI / 3;
  const radius = 1.5;
  const model = computeIdentityModel({
    mode: "coordinates",
    theta,
    radius,
    alpha: 0.2,
    beta: 0.4,
    power: 3
  });

  assert.equal(model.derivedPoints.length, 0);
  assert.equal(model.waveMarkers.length, 0);
  assert.equal(model.comparisonCurve, null);
  assert.equal(model.construction.type, "coordinate-projections");
  assert.equal(model.complexTex, "e^{i\\theta}=\\cos\\theta+i\\sin\\theta");
  assert.match(model.trigTex, /x=r\\cos\\theta/);
  assert.match(model.detailTex, /z=re\^\{i\\theta\}/);
  closeTo(model.base.point.x, Math.cos(theta));
  closeTo(model.base.point.y, Math.sin(theta));
  closeTo(model.values.x, radius * Math.cos(theta));
  closeTo(model.values.y, radius * Math.sin(theta));
  closeTo(model.values.real, model.values.x, 0);
  closeTo(model.values.imaginary, model.values.y, 0);
  closeTo(Math.hypot(model.values.x, model.values.y), radius);
  assertZeroChecks(model);
});

test("norm provides unit and radius identities plus coordinate-leg square metadata", () => {
  const samples = [
    { theta: 0, radius: 0 },
    { theta: Math.PI / 6, radius: 0.5 },
    { theta: -7 * Math.PI / 4, radius: 1 },
    { theta: 19.37, radius: 1.7 },
    { theta: 8 * TAU + Math.PI / 2, radius: 2 }
  ];

  for (const sample of samples) {
    const model = computeIdentityModel({ mode: "norm", ...sample });
    assert.equal(model.derivedPoints.length, 0);
    assert.equal(model.waveMarkers.length, 0);
    assert.equal(model.construction.type, "coordinate-leg-squares");
    assert.equal(model.values.unitNorm, 1);
    assert.equal(model.values.unitNormSquared, 1);
    closeTo(
      model.values.xSquared + model.values.ySquared,
      model.values.radiusSquared
    );
    closeTo(model.values.coordinateNormSquared, model.values.radiusSquared, 0);
    closeTo(
      model.construction.squares.horizontal
        + model.construction.squares.vertical,
      model.construction.squares.hypotenuse
    );
    assert.match(model.complexTex, /e\^\{i\\theta\}e\^\{-i\\theta\}=1/);
    assert.equal(model.trigTex, "\\cos^2\\theta+\\sin^2\\theta=1");
    assert.equal(model.detailTex, "x^2+y^2=r^2");
    assertZeroChecks(model);
  }
});

test("addition exposes reference/result geometry and both addition expansions", () => {
  const alpha = 5 * TAU + 0.73;
  const beta = -3 * TAU - 0.21;
  const theta = alpha + beta;
  const model = computeIdentityModel({
    mode: "addition",
    theta,
    radius: 2,
    alpha,
    beta,
    power: 6
  });

  assert.deepEqual(
    model.derivedPoints.map(({ role, tone }) => ({ role, tone })),
    [
      { role: "alpha", tone: "reference" },
      { role: "beta", tone: "reference" },
      { role: "result", tone: "derived" }
    ]
  );
  assert.deepEqual(
    model.waveMarkers.map(({ role, tone }) => ({ role, tone })),
    [
      { role: "alpha", tone: "reference" },
      { role: "beta", tone: "reference" }
    ]
  );
  assert.equal(model.construction.type, "complex-rotation");
  assert.equal(model.construction.startAngle, alpha);
  assert.equal(model.construction.rotationAngle, beta);
  assert.equal(model.construction.resultAngle, theta);
  assert.equal(model.derivedPoints[0].angle, alpha);
  assert.equal(model.derivedPoints[1].angle, beta);
  assert.equal(model.derivedPoints[2].angle, theta);
  closeTo(model.derivedPoints[2].normalizedAngle, normalizeAngle(theta));
  closeTo(
    model.values.realExpansion,
    Math.cos(alpha) * Math.cos(beta) - Math.sin(alpha) * Math.sin(beta)
  );
  closeTo(
    model.values.imaginaryExpansion,
    Math.sin(alpha) * Math.cos(beta) + Math.cos(alpha) * Math.sin(beta)
  );
  closeTo(model.values.productReal, Math.cos(theta));
  closeTo(model.values.productImaginary, Math.sin(theta));
  closeTo(model.values.resultReal, model.derivedPoints[2].point.x, 0);
  closeTo(model.values.resultImaginary, model.derivedPoints[2].point.y, 0);
  assert.match(model.complexTex, /e\^\{i\(\\alpha\+\\beta\)\}/);
  assert.match(model.trigTex, /\\cos\(\\alpha\+\\beta\)/);
  assert.match(model.trigTex, /\\sin\(\\alpha\+\\beta\)/);
  assert.match(model.detailTex, /\\cos\\alpha\\cos\\beta-\\sin\\alpha\\sin\\beta/);
  assertZeroChecks(model);
});

test("addition's angle check is periodic and detects a genuinely stale theta", () => {
  const alpha = 0.4;
  const beta = 0.7;
  const equivalent = computeIdentityModel({
    mode: "addition",
    alpha,
    beta,
    theta: alpha + beta + 6 * TAU
  });
  const stale = computeIdentityModel({
    mode: "addition",
    alpha,
    beta,
    theta: alpha + beta + 0.25
  });

  assert.equal(equivalent.checks.resultAngleResidual, 0);
  closeTo(Math.abs(stale.checks.resultAngleResidual), 0.25);
  assert.equal(stale.checks.productRealResidual, 0);
  assert.equal(stale.checks.productImaginaryResidual, 0);
});

test("power two includes double-angle values, equations, geometry, and residuals", () => {
  const theta = -3 * TAU + 0.83;
  const model = computeIdentityModel({ mode: "powers", theta, power: 2 });
  const result = model.derivedPoints[0];

  assert.equal(model.construction.type, "angle-multiplication");
  assert.equal(model.construction.multiplier, 2);
  assert.equal(result.role, "result");
  assert.equal(result.tone, "derived");
  assert.equal(result.angle, 2 * theta);
  closeTo(result.normalizedAngle, normalizeAngle(2 * theta));
  assert.equal(model.waveMarkers[0].angle, 2 * theta);
  closeTo(
    model.values.doubleAngleCosExpansion,
    Math.cos(theta) ** 2 - Math.sin(theta) ** 2
  );
  closeTo(
    model.values.doubleAngleSinExpansion,
    2 * Math.sin(theta) * Math.cos(theta)
  );
  closeTo(model.values.powerReal, Math.cos(2 * theta));
  closeTo(model.values.powerImaginary, Math.sin(2 * theta));
  assert.match(model.complexTex, /\^n=e\^\{in\\theta\}/);
  assert.match(model.trigTex, /\\cos\(n\\theta\)\+i\\sin\(n\\theta\)/);
  assert.match(model.detailTex, /\\cos\(2\\theta\)=\\cos\^2\\theta-\\sin\^2\\theta/);
  assert.match(model.detailTex, /\\sin\(2\\theta\)=2\\sin\\theta\\cos\\theta/);
  assertZeroChecks(model);
});

test("powers two through six satisfy De Moivre over representative and random angles", () => {
  const random = createRandom(0x6de0017e);
  const angles = [
    -4 * Math.PI,
    -Math.PI,
    -Math.PI / 2,
    0,
    Math.PI / 6,
    Math.PI / 4,
    Math.PI / 2,
    Math.PI,
    17 * Math.PI / 7,
    ...Array.from({ length: 120 }, () => (random() * 40 - 20) * TAU)
  ];

  for (let power = 2; power <= 6; power += 1) {
    for (const theta of angles) {
      const model = computeIdentityModel({ mode: "powers", theta, power });
      const directPower = complexPower(model.base.complex, power);
      const result = model.derivedPoints[0];

      assert.equal(model.parameters.power, power);
      assert.equal(result.angle, theta * power);
      closeTo(result.normalizedAngle, normalizeAngle(theta * power), 1e-10);
      closeTo(result.point.x, Math.cos(theta * power), 1e-10);
      closeTo(result.point.y, Math.sin(theta * power), 1e-10);
      closeTo(model.values.powerReal, directPower.real, 1e-10);
      closeTo(model.values.powerImaginary, directPower.imaginary, 1e-10);
      closeTo(model.values.powerReal, result.point.x, 1e-10);
      closeTo(model.values.powerImaginary, result.point.y, 1e-10);
      assert.equal(model.detailTex === "", power !== 2);
      assertZeroChecks(model);
    }
  }
});

test("conjugate models real-axis reflection and exact cosine/sine parity", () => {
  const angles = [
    -8 * TAU - Math.PI / 3,
    -Math.PI / 2,
    0,
    Math.PI / 7,
    Math.PI,
    13 * TAU + 0.42
  ];

  for (const theta of angles) {
    const model = computeIdentityModel({ mode: "conjugate", theta });
    const reflected = model.derivedPoints[0];

    assert.equal(model.construction.type, "real-axis-reflection");
    assert.equal(model.construction.axis, "real");
    assert.equal(reflected.angle, -theta || 0);
    closeTo(reflected.normalizedAngle, normalizeAngle(-theta));
    closeTo(reflected.point.x, model.base.point.x);
    closeTo(reflected.point.y, -model.base.point.y);
    assert.equal(model.values.cosNegativeTheta, model.values.cosTheta);
    assert.equal(model.values.sinNegativeTheta, -model.values.sinTheta || 0);
    assert.equal(model.values.conjugateReal, model.values.reflectedReal);
    assert.equal(model.values.conjugateImaginary, model.values.reflectedImaginary);
    assert.match(model.complexTex, /\\overline\{u\}=e\^\{-i\\theta\}/);
    assert.match(model.trigTex, /\\cos\(-\\theta\)=\\cos\\theta/);
    assert.match(model.trigTex, /\\sin\(-\\theta\)=-\\sin\\theta/);
    assertZeroChecks(model);
  }
});

test("quarter turn multiplies by i and supplies phase-shift comparison data", () => {
  const angles = [
    -5 * TAU - Math.PI / 6,
    -Math.PI,
    0,
    Math.PI / 4,
    Math.PI / 2,
    9 * TAU + 0.33
  ];

  for (const theta of angles) {
    const model = computeIdentityModel({ mode: "quarter-turn", theta });
    const result = model.derivedPoints[0];
    const product = multiplyComplex(
      { real: 0, imaginary: 1 },
      model.base.complex
    );

    assert.equal(model.construction.type, "quarter-turn-rotation");
    assert.equal(model.construction.direction, "counterclockwise");
    assert.equal(model.construction.rotationAngle, Math.PI / 2);
    assert.deepEqual(model.comparisonCurve, {
      phaseShift: Math.PI / 2,
      label: "π/2 phase shift"
    });
    assert.equal(result.angle, theta + Math.PI / 2);
    closeTo(result.normalizedAngle, normalizeAngle(theta + Math.PI / 2));
    assert.equal(model.waveMarkers[0].angle, result.angle);
    closeTo(model.values.productReal, product.real);
    closeTo(model.values.productImaginary, product.imaginary);
    closeTo(result.point.x, -model.base.point.y);
    closeTo(result.point.y, model.base.point.x);
    closeTo(model.values.shiftedSin, model.values.cosTheta);
    closeTo(model.values.shiftedCos, -model.values.sinTheta);
    assert.equal(model.complexTex, "i e^{i\\theta}=e^{i(\\theta+\\pi/2)}");
    assert.match(model.trigTex, /\\sin\\left\(\\theta\+\\frac\{\\pi\}\{2\}\\right\)=\\cos\\theta/);
    assert.match(model.trigTex, /\\cos\\left\(\\theta\+\\frac\{\\pi\}\{2\}\\right\)=-\\sin\\theta/);
    assertZeroChecks(model);
  }
});

test("invalid inputs fall back safely while radius and integer power clamp", () => {
  const fallback = computeIdentityModel(null);
  assert.equal(fallback.mode, "coordinates");
  assert.equal(fallback.base.angle, 0);
  assert.equal(fallback.values.radius, 1);
  assert.deepEqual(fallback.parameters, { alpha: 0, beta: 0, power: 2 });

  const invalid = computeIdentityModel({
    mode: "not-a-mode",
    theta: Number.NaN,
    radius: -50,
    alpha: Number.POSITIVE_INFINITY,
    beta: "0.5",
    power: -100
  });
  assert.equal(invalid.mode, "coordinates");
  assert.equal(invalid.base.angle, 0);
  assert.equal(invalid.values.radius, 0);
  assert.deepEqual(invalid.parameters, { alpha: 0, beta: 0, power: 2 });
  assertZeroChecks(invalid);

  const upper = computeIdentityModel({
    mode: "norm",
    theta: 0.5,
    radius: 99,
    power: 99
  });
  assert.equal(upper.values.radius, 2);
  assert.equal(upper.parameters.power, 6);
  assertZeroChecks(upper);

  const roundedPower = computeIdentityModel({
    mode: "powers",
    theta: 0.4,
    power: 4.6,
    radius: Number.NaN
  });
  assert.equal(roundedPower.parameters.power, 5);
  assert.equal(roundedPower.values.power, 5);
  assertZeroChecks(roundedPower);
});

test("raw angles are preserved while display angles are normalized", () => {
  const theta = -11 * TAU - 0.37;
  const alpha = 9 * TAU + 0.2;
  const beta = -4 * TAU - 0.9;
  const addition = computeIdentityModel({
    mode: "addition",
    theta: alpha + beta,
    alpha,
    beta,
    power: 3
  });

  assert.equal(addition.base.angle, alpha + beta);
  closeTo(addition.base.normalizedAngle, normalizeAngle(alpha + beta));
  assert.equal(addition.derivedPoints[0].angle, alpha);
  assert.equal(addition.derivedPoints[1].angle, beta);
  assert.equal(addition.derivedPoints[2].angle, alpha + beta);
  closeTo(addition.derivedPoints[0].normalizedAngle, normalizeAngle(alpha));
  closeTo(addition.derivedPoints[1].normalizedAngle, normalizeAngle(beta));
  closeTo(addition.derivedPoints[2].normalizedAngle, normalizeAngle(alpha + beta));

  const power = computeIdentityModel({ mode: "powers", theta, power: 6 });
  assert.equal(power.base.angle, theta);
  assert.equal(power.derivedPoints[0].angle, theta * 6);
  closeTo(power.base.normalizedAngle, normalizeAngle(theta));
  closeTo(power.derivedPoints[0].normalizedAngle, normalizeAngle(theta * 6));

  const quarterTurn = computeIdentityModel({ mode: "quarter-turn", theta });
  assert.equal(quarterTurn.derivedPoints[0].angle, theta + Math.PI / 2);
  closeTo(
    quarterTurn.derivedPoints[0].normalizedAngle,
    normalizeAngle(theta + Math.PI / 2)
  );
});

test("cardinal and random identity residuals clean floating-point noise to zero", () => {
  const random = createRandom(0xc1ea0123);
  const angles = [
    -4 * TAU,
    -Math.PI,
    -Math.PI / 2,
    0,
    Math.PI / 2,
    Math.PI,
    4 * TAU,
    ...Array.from({ length: 150 }, () => (random() * 60 - 30) * TAU)
  ];

  for (const theta of angles) {
    const common = { theta, radius: random() * 2 };
    assertZeroChecks(computeIdentityModel({ mode: "coordinates", ...common }));
    assertZeroChecks(computeIdentityModel({ mode: "norm", ...common }));
    assertZeroChecks(computeIdentityModel({
      mode: "addition",
      ...common,
      alpha: theta * 0.35,
      beta: theta * 0.65
    }));
    assertZeroChecks(computeIdentityModel({ mode: "conjugate", ...common }));
    assertZeroChecks(computeIdentityModel({ mode: "quarter-turn", ...common }));

    for (let power = 2; power <= 6; power += 1) {
      assertZeroChecks(computeIdentityModel({
        mode: "powers",
        ...common,
        power
      }));
    }
  }
});

test("every returned identity is deeply immutable", () => {
  for (const { id } of IDENTITY_MODES) {
    const alpha = 0.3;
    const beta = 0.8;
    const model = computeIdentityModel({
      mode: id,
      theta: id === "addition" ? alpha + beta : 0.9,
      radius: 1.4,
      alpha,
      beta,
      power: 5
    });

    assertDeeplyFrozen(model);
    assert.throws(() => {
      model.mode = "coordinates";
    }, TypeError);
    assert.throws(() => {
      model.base.point.x = 99;
    }, TypeError);
    assert.throws(() => {
      model.parameters.power = 2;
    }, TypeError);
    assert.throws(() => {
      model.derivedPoints.push({});
    }, TypeError);
    assert.throws(() => {
      model.construction.type = "changed";
    }, TypeError);
  }
});

console.log(`\n${passed} identity-model tests passed.`);
