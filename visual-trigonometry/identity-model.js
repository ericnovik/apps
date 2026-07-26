const TAU = 2 * Math.PI;
const DEFAULT_ANGLE = 0;
const DEFAULT_RADIUS = 1;
const DEFAULT_POWER = 2;
const MIN_RADIUS = 0;
const MAX_RADIUS = 2;
const MIN_POWER = 2;
const MAX_POWER = 6;
const ZERO_TOLERANCE = 1e-12;
const MAX_ANGLE_BOUNDARY_TOLERANCE = 1e-9;

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export const IDENTITY_MODES = deepFreeze([
  {
    id: "coordinates",
    label: "Coordinates / Euler",
    shortLabel: "Coordinates"
  },
  {
    id: "norm",
    label: "Norm / Pythagorean",
    shortLabel: "Norm"
  },
  {
    id: "addition",
    label: "Angle Addition",
    shortLabel: "Addition"
  },
  {
    id: "powers",
    label: "Powers / De Moivre",
    shortLabel: "Powers"
  },
  {
    id: "conjugate",
    label: "Conjugate Symmetry",
    shortLabel: "Conjugate"
  },
  {
    id: "quarter-turn",
    label: "Quarter Turn / Phase Shift",
    shortLabel: "Quarter Turn"
  }
]);

const MODE_BY_ID = Object.freeze(Object.fromEntries(
  IDENTITY_MODES.map((mode) => [mode.id, mode])
));

function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanSignedZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function cleanModelValue(value) {
  if (Math.abs(value) <= ZERO_TOLERANCE || Object.is(value, -0)) {
    return 0;
  }

  if (Math.abs(value - 1) <= ZERO_TOLERANCE) {
    return 1;
  }

  if (Math.abs(value + 1) <= ZERO_TOLERANCE) {
    return -1;
  }

  return value;
}

function cleanResidual(value, ...scaleValues) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const scale = scaleValues.reduce(
    (largest, candidate) => Number.isFinite(candidate)
      ? Math.max(largest, Math.abs(candidate))
      : largest,
    1
  );

  return Math.abs(value) <= ZERO_TOLERANCE * scale
    ? 0
    : cleanSignedZero(value);
}

function differenceResidual(actual, expected) {
  return cleanResidual(actual - expected, actual, expected);
}

function angleBoundaryTolerance(angle) {
  const scaledTolerance = 4 * Number.EPSILON * Math.max(1, Math.abs(angle));
  return Math.min(MAX_ANGLE_BOUNDARY_TOLERANCE, scaledTolerance);
}

function normalizeAngle(angle) {
  const safeAngle = finiteOr(angle, DEFAULT_ANGLE);
  let normalized = safeAngle % TAU;

  if (normalized < 0) {
    normalized += TAU;
  }

  const boundaryTolerance = angleBoundaryTolerance(safeAngle);
  if (
    normalized >= TAU
    || normalized <= boundaryTolerance
    || TAU - normalized <= boundaryTolerance
    || Object.is(normalized, -0)
  ) {
    return 0;
  }

  return normalized;
}

function periodicAngleResidual(actual, expected) {
  const difference = normalizeAngle(actual) - normalizeAngle(expected);
  return cleanResidual(Math.atan2(Math.sin(difference), Math.cos(difference)));
}

function safeAngleSum(first, second) {
  const sum = first + second;
  if (Number.isFinite(sum)) {
    return cleanSignedZero(sum);
  }

  return cleanSignedZero(normalizeAngle(first) + normalizeAngle(second));
}

function safeAngleProduct(angle, multiplier) {
  const product = angle * multiplier;
  if (Number.isFinite(product)) {
    return cleanSignedZero(product);
  }

  return cleanSignedZero(normalizeAngle(angle) * multiplier);
}

function sanitizeComplex(value) {
  const source = value !== null && typeof value === "object" ? value : {};
  return {
    real: cleanSignedZero(finiteOr(source.real, 0)),
    imaginary: cleanSignedZero(finiteOr(source.imaginary, 0))
  };
}

function multiplySanitizedComplex(left, right) {
  return {
    real: cleanSignedZero(
      left.real * right.real - left.imaginary * right.imaginary
    ),
    imaginary: cleanSignedZero(
      left.real * right.imaginary + left.imaginary * right.real
    )
  };
}

/**
 * Multiplies two complex values. Missing or non-finite components are treated
 * as zero so callers never need to pre-sanitize partially formed input.
 */
export function multiplyComplex(a, b) {
  return multiplySanitizedComplex(sanitizeComplex(a), sanitizeComplex(b));
}

/**
 * Returns the complex conjugate. Missing or non-finite components are zero.
 */
export function conjugateComplex(z) {
  const value = sanitizeComplex(z);
  return {
    real: value.real,
    imaginary: cleanSignedZero(-value.imaginary)
  };
}

function reciprocalComplex(z) {
  const scale = Math.max(Math.abs(z.real), Math.abs(z.imaginary));
  if (scale === 0) {
    return { real: 0, imaginary: 0 };
  }

  const scaledReal = z.real / scale;
  const scaledImaginary = z.imaginary / scale;
  const denominator = scaledReal * scaledReal + scaledImaginary * scaledImaginary;

  return {
    real: cleanSignedZero((scaledReal / denominator) / scale),
    imaginary: cleanSignedZero((-scaledImaginary / denominator) / scale)
  };
}

function sanitizeExponent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  const integer = Math.trunc(value);
  return Number.isSafeInteger(integer) ? integer : 0;
}

/**
 * Raises a complex value to an integer power using exponentiation by squaring.
 * Zero and negative integer powers are supported; an invalid exponent safely
 * falls back to zero. The reciprocal of zero is represented as zero rather
 * than leaking non-finite values into the identity model.
 */
export function complexPower(z, n) {
  let exponent = sanitizeExponent(n);
  let factor = sanitizeComplex(z);

  if (exponent === 0) {
    return { real: 1, imaginary: 0 };
  }

  if (exponent < 0) {
    factor = reciprocalComplex(factor);
    exponent = -exponent;
  }

  let result = { real: 1, imaginary: 0 };
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      result = multiplySanitizedComplex(result, factor);
    }

    exponent = Math.floor(exponent / 2);
    if (exponent > 0) {
      factor = multiplySanitizedComplex(factor, factor);
    }
  }

  return result;
}

function pointAt(angle) {
  return {
    x: cleanModelValue(Math.cos(angle)),
    y: cleanModelValue(Math.sin(angle))
  };
}

function complexFromPoint(point) {
  return {
    real: point.x,
    imaginary: point.y
  };
}

function cleanComplexForModel(value) {
  return {
    real: cleanModelValue(value.real),
    imaginary: cleanModelValue(value.imaginary)
  };
}

function createBase(angle) {
  const point = pointAt(angle);
  return {
    angle,
    normalizedAngle: normalizeAngle(angle),
    point,
    complex: complexFromPoint(point)
  };
}

function createDerivedPoint(role, angle, label, tone) {
  return {
    role,
    angle,
    normalizedAngle: normalizeAngle(angle),
    point: pointAt(angle),
    label,
    tone
  };
}

function createWaveMarker(role, angle, label, tone) {
  return {
    role,
    angle,
    normalizedAngle: normalizeAngle(angle),
    label,
    tone
  };
}

function clampRadius(value) {
  const radius = Math.min(MAX_RADIUS, Math.max(
    MIN_RADIUS,
    finiteOr(value, DEFAULT_RADIUS)
  ));
  return cleanSignedZero(radius);
}

function clampPower(value) {
  const rounded = Math.round(finiteOr(value, DEFAULT_POWER));
  return Math.min(MAX_POWER, Math.max(MIN_POWER, rounded));
}

function createIdentity(common, content) {
  const modeMetadata = MODE_BY_ID[common.mode];
  return {
    mode: common.mode,
    title: modeMetadata.label,
    shortTitle: modeMetadata.shortLabel,
    geometryText: content.geometryText,
    complexTex: content.complexTex,
    trigTex: content.trigTex,
    detailTex: content.detailTex,
    parameters: {
      alpha: common.alpha,
      beta: common.beta,
      power: common.power
    },
    base: common.base,
    derivedPoints: content.derivedPoints,
    waveMarkers: content.waveMarkers,
    comparisonCurve: content.comparisonCurve,
    construction: content.construction,
    values: content.values,
    checks: content.checks
  };
}

function polarValues(base, radius) {
  const x = cleanSignedZero(radius * base.complex.real);
  const y = cleanSignedZero(radius * base.complex.imaginary);
  return { x, y };
}

function buildCoordinates(common) {
  const { base, radius } = common;
  const { x, y } = polarValues(base, radius);
  const unitNorm = Math.hypot(base.point.x, base.point.y);
  const polarNorm = Math.hypot(x, y);

  return createIdentity(common, {
    geometryText: "Projections give the real and imaginary coordinates; radius r scales both.",
    complexTex: "e^{i\\theta}=\\cos\\theta+i\\sin\\theta",
    trigTex: "x=r\\cos\\theta,\\quad y=r\\sin\\theta",
    detailTex: "z=re^{i\\theta}=r\\cos\\theta+i\\,r\\sin\\theta=x+iy",
    derivedPoints: [],
    waveMarkers: [],
    comparisonCurve: null,
    construction: {
      type: "coordinate-projections",
      horizontalLeg: { label: "x = r cos θ", value: x },
      verticalLeg: { label: "y = r sin θ", value: y },
      radiusRay: { label: "r", value: radius }
    },
    values: {
      radius,
      cosTheta: base.complex.real,
      sinTheta: base.complex.imaginary,
      x,
      y,
      real: x,
      imaginary: y
    },
    checks: {
      unitNormResidual: differenceResidual(unitNorm, 1),
      polarRadiusResidual: differenceResidual(polarNorm, radius),
      realCoordinateResidual: differenceResidual(x, radius * base.complex.real),
      imaginaryCoordinateResidual: differenceResidual(y, radius * base.complex.imaginary)
    }
  });
}

function buildNorm(common) {
  const { base, radius } = common;
  const { x, y } = polarValues(base, radius);
  const xSquared = x * x;
  const ySquared = y * y;
  const radiusSquared = radius * radius;
  const rawUnitNormSquared = base.point.x * base.point.x + base.point.y * base.point.y;
  const rawCoordinateNormSquared = xSquared + ySquared;
  const unitNormResidual = differenceResidual(rawUnitNormSquared, 1);
  const coordinateRadiusResidual = differenceResidual(
    rawCoordinateNormSquared,
    radiusSquared
  );
  const unitNormSquared = unitNormResidual === 0 ? 1 : rawUnitNormSquared;
  const coordinateNormSquared = coordinateRadiusResidual === 0
    ? radiusSquared
    : rawCoordinateNormSquared;

  return createIdentity(common, {
    geometryText: "Squares on the coordinate legs add to the square on the radius; the unit point has norm one.",
    complexTex: "\\lvert e^{i\\theta}\\rvert^2=e^{i\\theta}e^{-i\\theta}=1",
    trigTex: "\\cos^2\\theta+\\sin^2\\theta=1",
    detailTex: "x^2+y^2=r^2",
    derivedPoints: [],
    waveMarkers: [],
    comparisonCurve: null,
    construction: {
      type: "coordinate-leg-squares",
      legs: {
        horizontal: x,
        vertical: y,
        hypotenuse: radius
      },
      squares: {
        horizontal: xSquared,
        vertical: ySquared,
        hypotenuse: radiusSquared
      }
    },
    values: {
      radius,
      cosTheta: base.complex.real,
      sinTheta: base.complex.imaginary,
      unitNorm: unitNormSquared === 1 ? 1 : Math.sqrt(unitNormSquared),
      unitNormSquared,
      x,
      y,
      xSquared,
      ySquared,
      coordinateNormSquared,
      radiusSquared
    },
    checks: {
      unitNormResidual,
      coordinateRadiusResidual
    }
  });
}

function buildAddition(common) {
  const { alpha, beta, theta } = common;
  const sumAngle = safeAngleSum(alpha, beta);
  const alphaPoint = pointAt(alpha);
  const betaPoint = pointAt(beta);
  const resultPoint = pointAt(sumAngle);
  const alphaComplex = complexFromPoint(alphaPoint);
  const betaComplex = complexFromPoint(betaPoint);
  const resultComplex = complexFromPoint(resultPoint);
  const product = cleanComplexForModel(multiplyComplex(alphaComplex, betaComplex));
  const realExpansion = cleanModelValue(
    alphaPoint.x * betaPoint.x - alphaPoint.y * betaPoint.y
  );
  const imaginaryExpansion = cleanModelValue(
    alphaPoint.y * betaPoint.x + alphaPoint.x * betaPoint.y
  );

  return createIdentity(common, {
    geometryText: "Multiplying the α direction by the β direction rotates it through β to α + β.",
    complexTex: "e^{i(\\alpha+\\beta)}=e^{i\\alpha}e^{i\\beta}",
    trigTex: "\\begin{aligned}\\cos(\\alpha+\\beta)&=\\cos\\alpha\\cos\\beta-\\sin\\alpha\\sin\\beta\\\\\\sin(\\alpha+\\beta)&=\\sin\\alpha\\cos\\beta+\\cos\\alpha\\sin\\beta\\end{aligned}",
    detailTex: "(\\cos\\alpha+i\\sin\\alpha)(\\cos\\beta+i\\sin\\beta)=(\\cos\\alpha\\cos\\beta-\\sin\\alpha\\sin\\beta)+i(\\sin\\alpha\\cos\\beta+\\cos\\alpha\\sin\\beta)",
    derivedPoints: [
      createDerivedPoint("alpha", alpha, "α", "reference"),
      createDerivedPoint("beta", beta, "β", "reference"),
      createDerivedPoint("result", sumAngle, "α + β", "derived")
    ],
    waveMarkers: [
      createWaveMarker("alpha", alpha, "α", "reference"),
      createWaveMarker("beta", beta, "β", "reference")
    ],
    comparisonCurve: null,
    construction: {
      type: "complex-rotation",
      startAngle: alpha,
      rotationAngle: beta,
      resultAngle: sumAngle
    },
    values: {
      cosAlpha: alphaPoint.x,
      sinAlpha: alphaPoint.y,
      cosBeta: betaPoint.x,
      sinBeta: betaPoint.y,
      sumAngle,
      cosSum: resultPoint.x,
      sinSum: resultPoint.y,
      realExpansion,
      imaginaryExpansion,
      productReal: product.real,
      productImaginary: product.imaginary,
      resultReal: resultComplex.real,
      resultImaginary: resultComplex.imaginary,
      thetaReal: common.base.complex.real,
      thetaImaginary: common.base.complex.imaginary
    },
    checks: {
      productRealResidual: differenceResidual(product.real, resultComplex.real),
      productImaginaryResidual: differenceResidual(
        product.imaginary,
        resultComplex.imaginary
      ),
      realExpansionResidual: differenceResidual(realExpansion, resultComplex.real),
      imaginaryExpansionResidual: differenceResidual(
        imaginaryExpansion,
        resultComplex.imaginary
      ),
      resultAngleResidual: periodicAngleResidual(sumAngle, theta)
    }
  });
}

function buildPowers(common) {
  const { base, power, theta } = common;
  const resultAngle = safeAngleProduct(theta, power);
  const resultPoint = pointAt(resultAngle);
  const powered = cleanComplexForModel(complexPower(base.complex, power));
  const values = {
    power,
    resultAngle,
    baseReal: base.complex.real,
    baseImaginary: base.complex.imaginary,
    powerReal: powered.real,
    powerImaginary: powered.imaginary,
    cosNTheta: resultPoint.x,
    sinNTheta: resultPoint.y
  };
  const checks = {
    deMoivreRealResidual: differenceResidual(powered.real, resultPoint.x),
    deMoivreImaginaryResidual: differenceResidual(powered.imaginary, resultPoint.y),
    resultAngleResidual: periodicAngleResidual(
      Math.atan2(powered.imaginary, powered.real),
      resultAngle
    )
  };

  if (power === 2) {
    const doubleAngleCosExpansion = cleanModelValue(
      base.point.x * base.point.x - base.point.y * base.point.y
    );
    const doubleAngleSinExpansion = cleanModelValue(
      2 * base.point.y * base.point.x
    );
    values.doubleAngleCosExpansion = doubleAngleCosExpansion;
    values.doubleAngleSinExpansion = doubleAngleSinExpansion;
    checks.doubleAngleCosResidual = differenceResidual(
      doubleAngleCosExpansion,
      resultPoint.x
    );
    checks.doubleAngleSinResidual = differenceResidual(
      doubleAngleSinExpansion,
      resultPoint.y
    );
  }

  return createIdentity(common, {
    geometryText: `Raising the unit complex number to power ${power} multiplies its angle by ${power}.`,
    complexTex: "(e^{i\\theta})^n=e^{in\\theta}",
    trigTex: "(\\cos\\theta+i\\sin\\theta)^n=\\cos(n\\theta)+i\\sin(n\\theta)",
    detailTex: power === 2
      ? "\\cos(2\\theta)=\\cos^2\\theta-\\sin^2\\theta,\\quad\\sin(2\\theta)=2\\sin\\theta\\cos\\theta"
      : "",
    derivedPoints: [
      createDerivedPoint("result", resultAngle, `${power}θ`, "derived")
    ],
    waveMarkers: [
      createWaveMarker("result", resultAngle, `${power}θ`, "derived")
    ],
    comparisonCurve: null,
    construction: {
      type: "angle-multiplication",
      baseAngle: theta,
      multiplier: power,
      resultAngle
    },
    values,
    checks
  });
}

function buildConjugate(common) {
  const { base, theta } = common;
  const reflectedAngle = cleanSignedZero(-theta);
  const reflectedPoint = pointAt(reflectedAngle);
  const conjugate = cleanComplexForModel(conjugateComplex(base.complex));
  const cosNegativeTheta = cleanModelValue(Math.cos(reflectedAngle));
  const sinNegativeTheta = cleanModelValue(Math.sin(reflectedAngle));

  return createIdentity(common, {
    geometryText: "Complex conjugation reflects the point across the real axis, sending θ to −θ.",
    complexTex: "\\overline{u}=e^{-i\\theta}=\\cos\\theta-i\\sin\\theta",
    trigTex: "\\cos(-\\theta)=\\cos\\theta,\\quad\\sin(-\\theta)=-\\sin\\theta",
    detailTex: "",
    derivedPoints: [
      createDerivedPoint("result", reflectedAngle, "−θ", "derived")
    ],
    waveMarkers: [
      createWaveMarker("result", reflectedAngle, "−θ", "derived")
    ],
    comparisonCurve: null,
    construction: {
      type: "real-axis-reflection",
      axis: "real",
      sourceAngle: theta,
      resultAngle: reflectedAngle
    },
    values: {
      cosTheta: base.point.x,
      sinTheta: base.point.y,
      cosNegativeTheta,
      sinNegativeTheta,
      conjugateReal: conjugate.real,
      conjugateImaginary: conjugate.imaginary,
      reflectedReal: reflectedPoint.x,
      reflectedImaginary: reflectedPoint.y
    },
    checks: {
      conjugateRealResidual: differenceResidual(
        conjugate.real,
        reflectedPoint.x
      ),
      conjugateImaginaryResidual: differenceResidual(
        conjugate.imaginary,
        reflectedPoint.y
      ),
      evenCosineResidual: differenceResidual(cosNegativeTheta, base.point.x),
      oddSineResidual: cleanResidual(
        sinNegativeTheta + base.point.y,
        sinNegativeTheta,
        base.point.y
      )
    }
  });
}

function buildQuarterTurn(common) {
  const { base, theta } = common;
  const phaseShift = Math.PI / 2;
  const resultAngle = safeAngleSum(theta, phaseShift);
  const resultPoint = pointAt(resultAngle);
  const product = cleanComplexForModel(multiplyComplex(
    { real: 0, imaginary: 1 },
    base.complex
  ));
  const shiftedCos = cleanModelValue(Math.cos(resultAngle));
  const shiftedSin = cleanModelValue(Math.sin(resultAngle));
  const negativeSinTheta = cleanModelValue(-base.point.y);

  return createIdentity(common, {
    geometryText: "Multiplication by i rotates the point π/2 counterclockwise, shifting its phase.",
    complexTex: "i e^{i\\theta}=e^{i(\\theta+\\pi/2)}",
    trigTex: "\\sin\\left(\\theta+\\frac{\\pi}{2}\\right)=\\cos\\theta,\\quad\\cos\\left(\\theta+\\frac{\\pi}{2}\\right)=-\\sin\\theta",
    detailTex: "",
    derivedPoints: [
      createDerivedPoint(
        "result",
        resultAngle,
        "θ + π/2",
        "derived"
      )
    ],
    waveMarkers: [
      createWaveMarker(
        "result",
        resultAngle,
        "θ + π/2",
        "derived"
      )
    ],
    comparisonCurve: {
      phaseShift,
      label: "π/2 phase shift"
    },
    construction: {
      type: "quarter-turn-rotation",
      startAngle: theta,
      rotationAngle: phaseShift,
      resultAngle,
      direction: "counterclockwise"
    },
    values: {
      phaseShift,
      cosTheta: base.point.x,
      sinTheta: base.point.y,
      shiftedCos,
      shiftedSin,
      negativeSinTheta,
      productReal: product.real,
      productImaginary: product.imaginary,
      resultReal: resultPoint.x,
      resultImaginary: resultPoint.y
    },
    checks: {
      productRealResidual: differenceResidual(product.real, resultPoint.x),
      productImaginaryResidual: differenceResidual(
        product.imaginary,
        resultPoint.y
      ),
      sineShiftResidual: differenceResidual(shiftedSin, base.point.x),
      cosineShiftResidual: differenceResidual(shiftedCos, negativeSinTheta),
      resultAngleResidual: periodicAngleResidual(
        Math.atan2(product.imaginary, product.real),
        resultAngle
      )
    }
  });
}

const MODE_BUILDERS = Object.freeze({
  coordinates: buildCoordinates,
  norm: buildNorm,
  addition: buildAddition,
  powers: buildPowers,
  conjugate: buildConjugate,
  "quarter-turn": buildQuarterTurn
});

/**
 * Computes all geometry, equations, numeric readouts, and residual checks for
 * the selected identity lens. The returned graph is recursively frozen.
 */
export function computeIdentityModel(input) {
  const source = input !== null && typeof input === "object" ? input : {};
  const requestedMode = typeof source.mode === "string" ? source.mode : "";
  const mode = Object.hasOwn(MODE_BY_ID, requestedMode)
    ? requestedMode
    : "coordinates";
  const theta = finiteOr(source.theta, DEFAULT_ANGLE);
  const alpha = finiteOr(source.alpha, DEFAULT_ANGLE);
  const beta = finiteOr(source.beta, DEFAULT_ANGLE);
  const power = clampPower(source.power);
  const radius = clampRadius(source.radius);
  const common = {
    mode,
    theta,
    radius,
    alpha,
    beta,
    power,
    base: createBase(theta)
  };

  return deepFreeze(MODE_BUILDERS[mode](common));
}
