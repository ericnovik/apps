const TAU = 2 * Math.PI;

export const EXACT_ANGLE_TOLERANCE = 1e-10;
export const SNAP_ANGLE_TOLERANCE = 4 * Math.PI / 180;

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function createAngleMetadata(value, plain, tex, degrees) {
  return {
    value,
    plain,
    tex,
    degrees,
    degreeLabel: `${degrees}°`
  };
}

const ANGLE_SPECS = [
  { value: 0, plain: "0", tex: "0", degrees: 0, referenceDegrees: 0, cos: "one", sin: "zero" },
  { value: Math.PI / 6, plain: "π/6", tex: "\\frac{\\pi}{6}", degrees: 30, referenceDegrees: 30, cos: "rootThreeHalf", sin: "half" },
  { value: Math.PI / 4, plain: "π/4", tex: "\\frac{\\pi}{4}", degrees: 45, referenceDegrees: 45, cos: "rootTwoHalf", sin: "rootTwoHalf" },
  { value: Math.PI / 3, plain: "π/3", tex: "\\frac{\\pi}{3}", degrees: 60, referenceDegrees: 60, cos: "half", sin: "rootThreeHalf" },
  { value: Math.PI / 2, plain: "π/2", tex: "\\frac{\\pi}{2}", degrees: 90, referenceDegrees: 90, cos: "zero", sin: "one" },
  { value: 2 * Math.PI / 3, plain: "2π/3", tex: "\\frac{2\\pi}{3}", degrees: 120, referenceDegrees: 60, cos: "half", sin: "rootThreeHalf" },
  { value: 3 * Math.PI / 4, plain: "3π/4", tex: "\\frac{3\\pi}{4}", degrees: 135, referenceDegrees: 45, cos: "rootTwoHalf", sin: "rootTwoHalf" },
  { value: 5 * Math.PI / 6, plain: "5π/6", tex: "\\frac{5\\pi}{6}", degrees: 150, referenceDegrees: 30, cos: "rootThreeHalf", sin: "half" },
  { value: Math.PI, plain: "π", tex: "\\pi", degrees: 180, referenceDegrees: 0, cos: "one", sin: "zero" },
  { value: 7 * Math.PI / 6, plain: "7π/6", tex: "\\frac{7\\pi}{6}", degrees: 210, referenceDegrees: 30, cos: "rootThreeHalf", sin: "half" },
  { value: 5 * Math.PI / 4, plain: "5π/4", tex: "\\frac{5\\pi}{4}", degrees: 225, referenceDegrees: 45, cos: "rootTwoHalf", sin: "rootTwoHalf" },
  { value: 4 * Math.PI / 3, plain: "4π/3", tex: "\\frac{4\\pi}{3}", degrees: 240, referenceDegrees: 60, cos: "half", sin: "rootThreeHalf" },
  { value: 3 * Math.PI / 2, plain: "3π/2", tex: "\\frac{3\\pi}{2}", degrees: 270, referenceDegrees: 90, cos: "zero", sin: "one" },
  { value: 5 * Math.PI / 3, plain: "5π/3", tex: "\\frac{5\\pi}{3}", degrees: 300, referenceDegrees: 60, cos: "half", sin: "rootThreeHalf" },
  { value: 7 * Math.PI / 4, plain: "7π/4", tex: "\\frac{7\\pi}{4}", degrees: 315, referenceDegrees: 45, cos: "rootTwoHalf", sin: "rootTwoHalf" },
  { value: 11 * Math.PI / 6, plain: "11π/6", tex: "\\frac{11\\pi}{6}", degrees: 330, referenceDegrees: 30, cos: "rootThreeHalf", sin: "half" }
];

const REFERENCE_LABELS = {
  0: { value: 0, plain: "0", tex: "0", degrees: 0 },
  30: { value: Math.PI / 6, plain: "π/6", tex: "\\frac{\\pi}{6}", degrees: 30 },
  45: { value: Math.PI / 4, plain: "π/4", tex: "\\frac{\\pi}{4}", degrees: 45 },
  60: { value: Math.PI / 3, plain: "π/3", tex: "\\frac{\\pi}{3}", degrees: 60 },
  90: { value: Math.PI / 2, plain: "π/2", tex: "\\frac{\\pi}{2}", degrees: 90 }
};

const MAGNITUDES = {
  zero: { value: 0, plain: "0", tex: "0" },
  half: { value: 1 / 2, plain: "1/2", tex: "\\frac{1}{2}" },
  rootTwoHalf: { value: Math.SQRT1_2, plain: "√2/2", tex: "\\frac{\\sqrt{2}}{2}" },
  rootThreeHalf: { value: Math.sqrt(3) / 2, plain: "√3/2", tex: "\\frac{\\sqrt{3}}{2}" },
  one: { value: 1, plain: "1", tex: "1" }
};

function coordinateSigns(degrees) {
  if (degrees === 0) return { cos: 1, sin: 0 };
  if (degrees === 90) return { cos: 0, sin: 1 };
  if (degrees === 180) return { cos: -1, sin: 0 };
  if (degrees === 270) return { cos: 0, sin: -1 };
  if (degrees < 90) return { cos: 1, sin: 1 };
  if (degrees < 180) return { cos: -1, sin: 1 };
  if (degrees < 270) return { cos: -1, sin: -1 };
  return { cos: 1, sin: -1 };
}

function createQuadrantMetadata(degrees) {
  const axes = {
    0: { label: "Positive x-axis", axis: "x", direction: "positive" },
    90: { label: "Positive y-axis", axis: "y", direction: "positive" },
    180: { label: "Negative x-axis", axis: "x", direction: "negative" },
    270: { label: "Negative y-axis", axis: "y", direction: "negative" }
  };
  const axis = axes[degrees];

  if (axis) {
    return {
      number: null,
      label: axis.label,
      axis: axis.axis,
      direction: axis.direction
    };
  }

  const number = degrees < 90 ? 1 : degrees < 180 ? 2 : degrees < 270 ? 3 : 4;
  const romanNumerals = ["I", "II", "III", "IV"];
  return {
    number,
    label: `Quadrant ${romanNumerals[number - 1]}`,
    axis: null,
    direction: null
  };
}

function createExactDescriptor(magnitudeKey, sign) {
  const magnitude = MAGNITUDES[magnitudeKey];
  const numericSign = magnitude.value === 0 ? 0 : sign;
  const prefix = numericSign < 0 ? "-" : "";

  return {
    value: numericSign === 0 ? 0 : numericSign * magnitude.value,
    plain: `${prefix}${magnitude.plain}`,
    tex: `${prefix}${magnitude.tex}`,
    magnitudePlain: magnitude.plain,
    magnitudeTex: magnitude.tex,
    magnitudeValue: magnitude.value,
    sign: numericSign
  };
}

function createReferenceValue(magnitudeKey) {
  const magnitude = MAGNITUDES[magnitudeKey];
  return {
    value: magnitude.value,
    plain: magnitude.plain,
    tex: magnitude.tex
  };
}

const TRIANGLE_CONSTRUCTIONS = {
  30: {
    type: "half-equilateral",
    title: "30° half-equilateral reference triangle",
    equationPlain: "x² + (1/2)² = 1 → x = √3/2",
    equationTex: "x^2 + \\left(\\frac{1}{2}\\right)^2 = 1 \\Longrightarrow x = \\frac{\\sqrt{3}}{2}",
    explanation: "Halving an equilateral triangle gives hypotenuse 1, short leg 1/2, and long leg √3/2. At a 30° reference angle, sin is the short leg; quadrant signs are applied separately.",
    shortCoordinate: "sin",
    longCoordinate: "cos",
    referenceValues: {
      cos: createReferenceValue("rootThreeHalf"),
      sin: createReferenceValue("half")
    }
  },
  45: {
    type: "isosceles-right",
    title: "45° isosceles-right reference triangle",
    equationPlain: "a² + a² = 1 → a = √2/2",
    equationTex: "a^2 + a^2 = 1 \\Longrightarrow a = \\frac{\\sqrt{2}}{2}",
    explanation: "The two legs are equal, so the unit hypotenuse gives both reference-coordinate magnitudes as √2/2. Quadrant signs are applied separately.",
    referenceValues: {
      cos: createReferenceValue("rootTwoHalf"),
      sin: createReferenceValue("rootTwoHalf")
    }
  },
  60: {
    type: "half-equilateral",
    title: "60° half-equilateral reference triangle",
    equationPlain: "x² + (1/2)² = 1 → x = √3/2",
    equationTex: "x^2 + \\left(\\frac{1}{2}\\right)^2 = 1 \\Longrightarrow x = \\frac{\\sqrt{3}}{2}",
    explanation: "Halving an equilateral triangle gives hypotenuse 1, short leg 1/2, and long leg √3/2. At a 60° reference angle, cos is the short leg; quadrant signs are applied separately.",
    shortCoordinate: "cos",
    longCoordinate: "sin",
    referenceValues: {
      cos: createReferenceValue("half"),
      sin: createReferenceValue("rootThreeHalf")
    }
  }
};

function createQuadrantalConstruction(spec) {
  const onXAxis = spec.degrees === 0 || spec.degrees === 180;
  const referenceValues = onXAxis
    ? { cos: createReferenceValue("one"), sin: createReferenceValue("zero") }
    : { cos: createReferenceValue("zero"), sin: createReferenceValue("one") };

  return {
    type: "quadrantal",
    title: "Quadrantal axis coordinates",
    equationPlain: onXAxis
      ? "cos² θ + 0² = 1 → |cos θ| = 1"
      : "0² + sin² θ = 1 → |sin θ| = 1",
    equationTex: onXAxis
      ? "\\cos^2\\theta + 0^2 = 1 \\Longrightarrow |\\cos\\theta| = 1"
      : "0^2 + \\sin^2\\theta = 1 \\Longrightarrow |\\sin\\theta| = 1",
    explanation: "The terminal point lies on an axis, so one coordinate has magnitude 1 and the perpendicular coordinate is 0. Axis direction determines the sign separately.",
    axisCoordinate: onXAxis ? "cos" : "sin",
    zeroCoordinate: onXAxis ? "sin" : "cos",
    referenceValues
  };
}

function createStandardAngle(spec) {
  const signs = coordinateSigns(spec.degrees);
  const referenceSpec = REFERENCE_LABELS[spec.referenceDegrees];
  const construction = TRIANGLE_CONSTRUCTIONS[spec.referenceDegrees]
    ?? createQuadrantalConstruction(spec);

  return {
    angle: createAngleMetadata(spec.value, spec.plain, spec.tex, spec.degrees),
    referenceAngle: createAngleMetadata(
      referenceSpec.value,
      referenceSpec.plain,
      referenceSpec.tex,
      referenceSpec.degrees
    ),
    quadrant: createQuadrantMetadata(spec.degrees),
    signs,
    cos: createExactDescriptor(spec.cos, signs.cos),
    sin: createExactDescriptor(spec.sin, signs.sin),
    construction
  };
}

const CHIP_SPECS = [
  ANGLE_SPECS[0],
  ANGLE_SPECS[1],
  ANGLE_SPECS[2],
  ANGLE_SPECS[3],
  ANGLE_SPECS[4],
  ANGLE_SPECS[8],
  ANGLE_SPECS[12],
  { value: TAU, plain: "2π", tex: "2\\pi", degrees: 360 }
];

export const EXACT_ANGLE_CHIPS = deepFreeze(CHIP_SPECS.map((spec) => ({
  angle: spec.value,
  value: spec.value,
  plain: spec.plain,
  tex: spec.tex,
  radiansPlain: spec.plain,
  radiansTex: spec.tex,
  degrees: spec.degrees,
  degreeLabel: `${spec.degrees}°`
})));

export const STANDARD_ANGLES = deepFreeze(ANGLE_SPECS.map(createStandardAngle));

function resolveTolerance(tolerance, fallback) {
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance)) {
    return fallback;
  }

  return Math.max(0, tolerance);
}

function nearestStandardAngle(theta) {
  if (typeof theta !== "number" || !Number.isFinite(theta)) {
    return null;
  }

  let nearest = null;

  for (const exactAngle of STANDARD_ANGLES) {
    const canonicalAngle = exactAngle.angle.value;
    const revolutions = Math.round((theta - canonicalAngle) / TAU);
    const equivalentAngle = canonicalAngle + revolutions * TAU;
    const distance = Math.abs(theta - equivalentAngle);

    if (nearest === null || distance < nearest.distance) {
      nearest = {
        angle: equivalentAngle,
        distance,
        exactAngle
      };
    }
  }

  return nearest;
}

export function recognizeExactAngle(theta, tolerance = EXACT_ANGLE_TOLERANCE) {
  const nearest = nearestStandardAngle(theta);
  if (nearest === null) return null;

  const recognitionTolerance = resolveTolerance(tolerance, EXACT_ANGLE_TOLERANCE);
  return nearest.distance <= recognitionTolerance ? nearest.exactAngle : null;
}

export function snapToExactAngle(
  theta,
  { enabled = true, tolerance = SNAP_ANGLE_TOLERANCE } = {}
) {
  const nearest = nearestStandardAngle(theta);
  const snapTolerance = resolveTolerance(tolerance, SNAP_ANGLE_TOLERANCE);
  const shouldSnap = Boolean(enabled)
    && nearest !== null
    && nearest.distance <= snapTolerance;

  return deepFreeze({
    angle: shouldSnap ? nearest.angle : theta,
    snapped: shouldSnap,
    distance: nearest?.distance ?? Number.POSITIVE_INFINITY,
    exactAngle: shouldSnap ? nearest.exactAngle : null
  });
}
