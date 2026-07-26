const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const DEGREE = Math.PI / 180;

const VIEWBOX = Object.freeze({ width: 760, height: 250 });
const PLOT = Object.freeze({
  left: 48,
  right: 740,
  top: 20,
  bottom: 212,
});

const ANGLE_TICKS = Object.freeze([
  Object.freeze({ value: 0, label: "0", degrees: 0 }),
  Object.freeze({ value: Math.PI / 2, label: "π/2", degrees: 90 }),
  Object.freeze({ value: Math.PI, label: "π", degrees: 180 }),
  Object.freeze({ value: (3 * Math.PI) / 2, label: "3π/2", degrees: 270 }),
  Object.freeze({ value: TAU, label: "2π", degrees: 360 }),
]);
const STANDARD_ANGLE_DEGREES = Object.freeze([
  0,
  30,
  45,
  60,
  90,
  120,
  135,
  150,
  180,
  210,
  225,
  240,
  270,
  300,
  315,
  330,
]);
const Y_TICKS = Object.freeze([-1, 0, 1]);
const IDENTITY_COLORS = Object.freeze({
  reference: "var(--reference-slate, #4f5b63)",
  derived: "var(--derived-emerald, #216b55)",
  surface: "var(--paper-strong, #ffffff)",
});
const VISIBLE_IDENTITY_MODES = new Set([
  "addition",
  "powers",
  "conjugate",
  "quarter-turn",
]);

const plotWidth = PLOT.right - PLOT.left;
const plotHeight = PLOT.bottom - PLOT.top;

function xForAngle(angle) {
  return PLOT.left + (angle / TAU) * plotWidth;
}

function yForValue(value) {
  return PLOT.top + ((1 - value) / 2) * plotHeight;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function angularDistance(firstAngle, secondAngle) {
  const distance = Math.abs(firstAngle - secondAngle) % TAU;
  return Math.min(distance, TAU - distance);
}

function normalizedPlotAngle(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  let normalized = value % TAU;
  if (normalized < 0) {
    normalized += TAU;
  }

  return normalized === 0 || Object.is(normalized, -0) ? 0 : normalized;
}

function canonicalIdentityMode(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const token = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  switch (token) {
    case "coordinate":
    case "coordinates":
    case "euler":
      return "coordinates";
    case "norm":
    case "pythagorean":
      return "norm";
    case "addition":
    case "angle-addition":
      return "addition";
    case "power":
    case "powers":
    case "de-moivre":
    case "double-angle":
      return "powers";
    case "conjugate":
    case "conjugation":
      return "conjugate";
    case "quarterturn":
    case "quarter-turn":
    case "phase-shift":
      return "quarter-turn";
    default:
      return token;
  }
}

function identityClassToken(value, fallback = "marker") {
  if (typeof value !== "string") {
    return fallback;
  }

  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readableList(values) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function svgNumber(value) {
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function createSvgElement(document, name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);

  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }

  return element;
}

function setAttributes(element, attributes) {
  for (const [attribute, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) {
      element.removeAttribute(attribute);
    } else {
      element.setAttribute(attribute, String(value));
    }
  }
}

function appendText(document, parent, text, attributes = {}) {
  const element = createSvgElement(document, "text", attributes);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function waveValue(kind, angle) {
  return kind === "cos" ? Math.cos(angle) : Math.sin(angle);
}

function waveDerivative(kind, angle) {
  return kind === "cos" ? -Math.sin(angle) : Math.cos(angle);
}

/**
 * Builds a C1-continuous cubic path using the function's exact value and
 * derivative at each endpoint. Shifted variants are rebuilt only when their
 * phase shift changes.
 */
function buildWavePath(kind, phaseShift = 0) {
  const segmentCount = 32;
  const angleStep = TAU / segmentCount;
  const xDerivative = plotWidth / TAU;
  let angle0 = 0;
  let x0 = xForAngle(angle0);
  let y0 = yForValue(waveValue(kind, angle0 + phaseShift));
  let path = `M ${svgNumber(x0)} ${svgNumber(y0)}`;

  for (let segment = 1; segment <= segmentCount; segment += 1) {
    const angle1 = segment * angleStep;
    const x1 = xForAngle(angle1);
    const y1 = yForValue(waveValue(kind, angle1 + phaseShift));
    const deltaX = x1 - x0;
    const slope0 =
      (-(plotHeight / 2) * waveDerivative(kind, angle0 + phaseShift)) /
      xDerivative;
    const slope1 =
      (-(plotHeight / 2) * waveDerivative(kind, angle1 + phaseShift)) /
      xDerivative;
    const controlX0 = x0 + deltaX / 3;
    const controlY0 = y0 + (slope0 * deltaX) / 3;
    const controlX1 = x1 - deltaX / 3;
    const controlY1 = y1 - (slope1 * deltaX) / 3;

    path +=
      ` C ${svgNumber(controlX0)} ${svgNumber(controlY0)}` +
      ` ${svgNumber(controlX1)} ${svgNumber(controlY1)}` +
      ` ${svgNumber(x1)} ${svgNumber(y1)}`;

    angle0 = angle1;
    x0 = x1;
    y0 = y1;
  }

  return path;
}

function formatValue(value) {
  const normalizedValue = Math.abs(value) < 5e-10 ? 0 : value;
  const nearestInteger = Math.round(normalizedValue);

  if (Math.abs(normalizedValue - nearestInteger) < 5e-10) {
    return String(nearestInteger);
  }

  return normalizedValue.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function describeAngle(angle) {
  const exactTick = ANGLE_TICKS.find(
    (tick) => Math.abs(tick.value - angle) < 1e-9,
  );

  if (exactTick) {
    return `${exactTick.degrees} degrees (${exactTick.label} radians)`;
  }

  const degrees = (angle / TAU) * 360;
  return `${degrees.toFixed(1)} degrees (${angle.toFixed(3)} radians)`;
}

function readCallback(options, name) {
  const callback = options[name];

  if (callback == null) {
    return null;
  }

  if (typeof callback !== "function") {
    throw new TypeError(`${name} must be a function when provided.`);
  }

  return callback;
}

/**
 * Creates a controlled, interactive sine or cosine plot.
 *
 * @param {Element} container Element that will own the SVG.
 * @param {object} options Plot kind and optional interaction callbacks.
 * @returns {{ render(model: object, renderOptions?: object): void, destroy(): void }}
 */
export function createWaveView(container, options = {}) {
  if (!container || typeof container.appendChild !== "function") {
    throw new TypeError("createWaveView requires a DOM container element.");
  }

  if (!options || typeof options !== "object") {
    throw new TypeError("createWaveView options must be an object.");
  }

  const { kind } = options;
  if (kind !== "cos" && kind !== "sin") {
    throw new TypeError('createWaveView option "kind" must be exactly "cos" or "sin".');
  }

  const document = container.ownerDocument;
  if (!document || typeof document.createElementNS !== "function") {
    throw new TypeError("The container must belong to an SVG-capable document.");
  }

  const callbacks = {
    onAngleStart: readCallback(options, "onAngleStart"),
    onAngleChange: readCallback(options, "onAngleChange"),
    onAngleEnd: readCallback(options, "onAngleEnd"),
    onAngleStep: readCallback(options, "onAngleStep"),
    onAngleHome: readCallback(options, "onAngleHome"),
    onTogglePlay: readCallback(options, "onTogglePlay"),
  };

  const cssKind = kind === "cos" ? "cosine" : "sine";
  const functionName = cssKind;
  const valueKey = kind === "cos" ? "cosTheta" : "sinTheta";
  const initialValue = kind === "cos" ? 1 : 0;

  const svg = createSvgElement(document, "svg", {
    class: `wave-view wave-plot ${cssKind}`,
    viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
    width: VIEWBOX.width,
    height: VIEWBOX.height,
    preserveAspectRatio: "xMidYMid meet",
    role: "group",
    "aria-label": `Interactive ${functionName} plot`,
    "data-wave-kind": kind,
    "data-snap-enabled": "false",
    "data-has-exact-angle": "false",
    "data-identity-mode": "none",
    "data-identity-active": "false",
    "data-identity-marker-count": 0,
    "data-identity-comparison-active": "false",
  });
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "100%";

  const title = createSvgElement(document, "title");
  title.textContent = `${functionName[0].toUpperCase()}${functionName.slice(1)} wave`;
  svg.appendChild(title);

  const description = createSvgElement(document, "desc");
  const baseDescription =
    `One period of the ${functionName} function. ` +
    "Drag horizontally or use the arrow keys to change the angle.";
  description.textContent = baseDescription;
  svg.appendChild(description);

  const grid = createSvgElement(document, "g", {
    class: "wave-grid plot-grid",
    "aria-hidden": "true",
  });

  for (const tick of ANGLE_TICKS) {
    const x = xForAngle(tick.value);
    grid.appendChild(
      createSvgElement(document, "line", {
        class: "wave-grid-line grid-line vertical",
        x1: svgNumber(x),
        y1: PLOT.top,
        x2: svgNumber(x),
        y2: PLOT.bottom,
        "vector-effect": "non-scaling-stroke",
      }),
    );
  }

  for (const value of Y_TICKS) {
    const y = yForValue(value);
    grid.appendChild(
      createSvgElement(document, "line", {
        class: "wave-grid-line grid-line horizontal",
        x1: PLOT.left,
        y1: svgNumber(y),
        x2: PLOT.right,
        y2: svgNumber(y),
        "vector-effect": "non-scaling-stroke",
      }),
    );
  }
  svg.appendChild(grid);

  const exactGuides = createSvgElement(document, "g", {
    class: "wave-exact-guides",
    "data-part": "exact-angle-guides",
    "data-snap-enabled": "false",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });
  const exactGuideEntries = STANDARD_ANGLE_DEGREES.map((degrees) => {
    const angle = degrees * DEGREE;
    const x = xForAngle(angle);
    const guide = createSvgElement(document, "g", {
      class: "wave-exact-guide",
      "data-angle-degrees": degrees,
      "data-angle-radians": svgNumber(angle),
      "data-guide-family":
        degrees % 90 === 0 ? "30-and-45" : degrees % 30 === 0 ? "30" : "45",
      "data-active": "false",
    });
    const line = createSvgElement(document, "line", {
      class: "wave-exact-guide-line",
      x1: svgNumber(x),
      y1: PLOT.top,
      x2: svgNumber(x),
      y2: PLOT.bottom,
      fill: "none",
      stroke: "var(--reference-slate, #69747b)",
      "stroke-width": 0.75,
      "stroke-dasharray": "2 5",
      opacity: 0.09,
      "vector-effect": "non-scaling-stroke",
      "data-active": "false",
    });
    const tick = createSvgElement(document, "line", {
      class: "wave-exact-guide-tick",
      x1: svgNumber(x),
      y1: svgNumber(yForValue(0) - 5),
      x2: svgNumber(x),
      y2: svgNumber(yForValue(0) + 5),
      stroke: "var(--reference-slate, #69747b)",
      "stroke-width": 1.25,
      "stroke-linecap": "round",
      opacity: 0.34,
      "vector-effect": "non-scaling-stroke",
      "data-active": "false",
    });

    guide.appendChild(line);
    guide.appendChild(tick);
    exactGuides.appendChild(guide);
    return { angle, guide, line, tick };
  });
  svg.appendChild(exactGuides);

  const axes = createSvgElement(document, "g", {
    class: "wave-axes plot-axes",
    "aria-hidden": "true",
  });
  axes.appendChild(
    createSvgElement(document, "line", {
      class: "wave-axis axis x-axis",
      x1: PLOT.left,
      y1: yForValue(0),
      x2: PLOT.right,
      y2: yForValue(0),
      "vector-effect": "non-scaling-stroke",
    }),
  );
  axes.appendChild(
    createSvgElement(document, "line", {
      class: "wave-axis axis y-axis",
      x1: PLOT.left,
      y1: PLOT.top,
      x2: PLOT.left,
      y2: PLOT.bottom,
      "vector-effect": "non-scaling-stroke",
    }),
  );
  svg.appendChild(axes);

  const xTicks = createSvgElement(document, "g", {
    class: "wave-ticks wave-x-ticks x-ticks",
    "aria-hidden": "true",
  });
  const zeroY = yForValue(0);
  for (const tick of ANGLE_TICKS) {
    const x = xForAngle(tick.value);
    xTicks.appendChild(
      createSvgElement(document, "line", {
        class: "wave-tick-mark tick-mark x-tick-mark",
        x1: svgNumber(x),
        y1: zeroY - 4,
        x2: svgNumber(x),
        y2: zeroY + 4,
        "vector-effect": "non-scaling-stroke",
      }),
    );
    appendText(document, xTicks, tick.label, {
      class: "wave-tick-label tick-label x-tick-label",
      x: svgNumber(x),
      y: PLOT.bottom + 25,
      "text-anchor": "middle",
    });
  }
  svg.appendChild(xTicks);

  const yTicks = createSvgElement(document, "g", {
    class: "wave-ticks wave-y-ticks y-ticks",
    "aria-hidden": "true",
  });
  for (const value of Y_TICKS) {
    const y = yForValue(value);
    yTicks.appendChild(
      createSvgElement(document, "line", {
        class: "wave-tick-mark tick-mark y-tick-mark",
        x1: PLOT.left - 4,
        y1: svgNumber(y),
        x2: PLOT.left + 4,
        y2: svgNumber(y),
        "vector-effect": "non-scaling-stroke",
      }),
    );
    appendText(document, yTicks, String(value), {
      class: "wave-tick-label tick-label y-tick-label",
      x: PLOT.left - 10,
      y: svgNumber(y),
      "text-anchor": "end",
      "dominant-baseline": "middle",
    });
  }
  svg.appendChild(yTicks);

  const path = createSvgElement(document, "path", {
    class: `wave-path ${cssKind}`,
    d: buildWavePath(kind),
    fill: "none",
    "vector-effect": "non-scaling-stroke",
    "aria-hidden": "true",
  });
  svg.appendChild(path);

  const identityOverlay = createSvgElement(document, "g", {
    class: "wave-identity-overlay",
    "data-part": "identity-overlay",
    "data-wave-kind": kind,
    "data-identity-mode": "none",
    "data-identity-active": "false",
    "data-identity-marker-count": 0,
    "data-identity-comparison-active": "false",
    "data-mode": "none",
    "data-active": "false",
    display: "none",
    visibility: "hidden",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });
  identityOverlay.style.pointerEvents = "none";

  const identityComparisonCurve = createSvgElement(document, "path", {
    class:
      "wave-identity-comparison-curve wave-identity-comparison-curve-derived",
    "data-part": "identity-comparison-curve",
    "data-identity-active": "false",
    "data-identity-tone": "derived",
    "data-wave-kind": kind,
    d: "",
    fill: "none",
    stroke: IDENTITY_COLORS.derived,
    "stroke-width": 1.45,
    "stroke-dasharray": "12 5 2 5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: 0.7,
    visibility: "hidden",
    "vector-effect": "non-scaling-stroke",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });
  identityOverlay.appendChild(identityComparisonCurve);

  const identityComparisonLabel = appendText(document, identityOverlay, "", {
    class: "wave-identity-comparison-label",
    "data-part": "identity-comparison-label",
    "data-identity-active": "false",
    "data-identity-tone": "derived",
    "data-wave-kind": kind,
    x: PLOT.right - 6,
    y: PLOT.top + 13,
    fill: IDENTITY_COLORS.derived,
    stroke: IDENTITY_COLORS.surface,
    "stroke-width": 3,
    "stroke-linejoin": "round",
    "paint-order": "stroke fill",
    "font-family": "ui-sans-serif, system-ui, sans-serif",
    "font-size": 9.5,
    "font-weight": 700,
    "text-anchor": "end",
    opacity: 0.88,
    visibility: "hidden",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });

  const identityRelation = createSvgElement(document, "path", {
    class: "wave-identity-relation",
    "data-part": "identity-relation",
    "data-identity-active": "false",
    d: "",
    fill: "none",
    stroke: IDENTITY_COLORS.reference,
    "stroke-width": 1.15,
    "stroke-dasharray": "3 4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: 0.7,
    visibility: "hidden",
    "vector-effect": "non-scaling-stroke",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });
  identityOverlay.appendChild(identityRelation);

  const identityReflectionTick = createSvgElement(document, "line", {
    class: "wave-identity-reflection-tick",
    "data-part": "identity-reflection-tick",
    "data-identity-active": "false",
    stroke: IDENTITY_COLORS.reference,
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    opacity: 0.72,
    visibility: "hidden",
    "vector-effect": "non-scaling-stroke",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });
  identityOverlay.appendChild(identityReflectionTick);

  const identityRelationLabel = appendText(document, identityOverlay, "", {
    class: "wave-identity-relation-label",
    "data-part": "identity-relation-label",
    "data-identity-active": "false",
    fill: IDENTITY_COLORS.reference,
    stroke: IDENTITY_COLORS.surface,
    "stroke-width": 3,
    "stroke-linejoin": "round",
    "paint-order": "stroke fill",
    "font-family": "ui-sans-serif, system-ui, sans-serif",
    "font-size": 9.5,
    "font-weight": 700,
    "text-anchor": "middle",
    opacity: 0.88,
    visibility: "hidden",
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });

  const identityMarkerLayer = createSvgElement(document, "g", {
    class: "wave-identity-markers",
    "data-part": "identity-markers",
    "data-identity-active": "false",
    "data-identity-marker-count": 0,
    "pointer-events": "none",
    focusable: "false",
    "aria-hidden": "true",
  });
  identityOverlay.appendChild(identityMarkerLayer);
  svg.appendChild(identityOverlay);

  const identityMarkerEntries = [];

  function createIdentityMarkerEntry() {
    const marker = createSvgElement(document, "g", {
      class: "wave-identity-marker",
      "data-identity-active": "false",
      visibility: "hidden",
      "pointer-events": "none",
      focusable: "false",
      "aria-hidden": "true",
    });
    const markerCursor = createSvgElement(document, "line", {
      class: "wave-identity-cursor",
      "data-part": "identity-marker-cursor",
      "data-identity-active": "false",
      x1: PLOT.left,
      y1: PLOT.top,
      x2: PLOT.left,
      y2: PLOT.bottom,
      fill: "none",
      "vector-effect": "non-scaling-stroke",
      "pointer-events": "none",
      focusable: "false",
      "aria-hidden": "true",
    });
    const markerPoint = createSvgElement(document, "circle", {
      class: "wave-identity-point",
      "data-part": "identity-marker-point",
      "data-identity-active": "false",
      cx: PLOT.left,
      cy: yForValue(initialValue),
      r: 4.5,
      "vector-effect": "non-scaling-stroke",
      "pointer-events": "none",
      focusable: "false",
      "aria-hidden": "true",
    });
    const markerLabel = appendText(document, marker, "", {
      class: "wave-identity-label",
      "data-part": "identity-marker-label",
      "data-identity-active": "false",
      x: PLOT.left + 7,
      y: yForValue(initialValue) - 10,
      fill: IDENTITY_COLORS.reference,
      stroke: IDENTITY_COLORS.surface,
      "stroke-width": 3.25,
      "stroke-linejoin": "round",
      "paint-order": "stroke fill",
      "font-family": "ui-sans-serif, system-ui, sans-serif",
      "font-size": 10.5,
      "font-weight": 750,
      opacity: 0.94,
      "pointer-events": "none",
      focusable: "false",
      "aria-hidden": "true",
    });

    marker.insertBefore(markerCursor, markerLabel);
    marker.insertBefore(markerPoint, markerLabel);
    identityMarkerLayer.appendChild(marker);

    const entry = {
      marker,
      cursor: markerCursor,
      point: markerPoint,
      label: markerLabel,
    };
    identityMarkerEntries.push(entry);
    return entry;
  }

  const cursor = createSvgElement(document, "line", {
    class: "wave-cursor",
    x1: PLOT.left,
    y1: PLOT.top,
    x2: PLOT.left,
    y2: PLOT.bottom,
    "vector-effect": "non-scaling-stroke",
    "aria-hidden": "true",
  });
  svg.appendChild(cursor);

  const exactPointHalo = createSvgElement(document, "circle", {
    class: "wave-exact-point-halo wave-exact-halo",
    "data-part": "exact-angle-point-halo",
    "data-active": "false",
    cx: PLOT.left,
    cy: yForValue(initialValue),
    r: 11,
    fill: "none",
    stroke: "var(--angle-amber, #bc7a1e)",
    "stroke-width": 2.25,
    "stroke-dasharray": "3 2",
    opacity: 0.92,
    visibility: "hidden",
    "pointer-events": "none",
    focusable: "false",
    "vector-effect": "non-scaling-stroke",
    "aria-hidden": "true",
  });
  svg.appendChild(exactPointHalo);

  const point = createSvgElement(document, "circle", {
    class: `wave-point ${cssKind}`,
    cx: PLOT.left,
    cy: yForValue(initialValue),
    r: 6,
    "vector-effect": "non-scaling-stroke",
    "aria-hidden": "true",
  });
  const pointTitle = createSvgElement(document, "title");
  point.appendChild(pointTitle);
  svg.appendChild(point);

  const valueLabel = createSvgElement(document, "g", {
    class: `wave-current-value current-value ${cssKind}`,
    "aria-hidden": "true",
  });
  const valueBackground = createSvgElement(document, "rect", {
    class: "wave-value-background current-value-background",
    x: 0,
    y: 0,
    width: 96,
    height: 24,
    rx: 5,
    ry: 5,
  });
  const valueText = appendText(document, valueLabel, "", {
    class: "wave-value-label current-value-label",
    x: 8,
    y: 16,
  });
  valueLabel.insertBefore(valueBackground, valueText);
  svg.appendChild(valueLabel);

  const hitArea = createSvgElement(document, "rect", {
    class: "plot-hit-area",
    x: PLOT.left,
    y: PLOT.top,
    width: plotWidth,
    height: plotHeight,
    fill: "transparent",
    "pointer-events": "all",
    tabindex: 0,
    focusable: "true",
    role: "slider",
    "aria-label": `${functionName} phase angle`,
    "aria-orientation": "horizontal",
    "aria-valuemin": 0,
    "aria-valuemax": TAU,
    "aria-valuenow": 0,
    "aria-valuetext": `Angle ${describeAngle(0)}; ${functionName} equals ${initialValue}`,
  });
  hitArea.style.touchAction = "none";
  svg.appendChild(hitArea);

  let destroyed = false;
  let dragging = false;
  let activePointerId = null;
  let lastPointerAngle = 0;

  function svgXFromPointer(event) {
    if (
      typeof svg.createSVGPoint === "function" &&
      typeof svg.getScreenCTM === "function"
    ) {
      try {
        const matrix = svg.getScreenCTM();
        if (matrix && typeof matrix.inverse === "function") {
          const screenPoint = svg.createSVGPoint();
          screenPoint.x = event.clientX;
          screenPoint.y = event.clientY;
          const svgPoint = screenPoint.matrixTransform(matrix.inverse());
          if (Number.isFinite(svgPoint.x)) {
            return svgPoint.x;
          }
        }
      } catch {
        // A detached or not-yet-laid-out SVG can have no invertible screen CTM.
      }
    }

    if (typeof hitArea.getBoundingClientRect === "function") {
      const bounds = hitArea.getBoundingClientRect();
      if (bounds && bounds.width > 0) {
        const proportion = (event.clientX - bounds.left) / bounds.width;
        return PLOT.left + proportion * plotWidth;
      }
    }

    if (typeof svg.getBoundingClientRect === "function") {
      const bounds = svg.getBoundingClientRect();
      if (bounds && bounds.width > 0) {
        if (bounds.height > 0) {
          const scale = Math.min(
            bounds.width / VIEWBOX.width,
            bounds.height / VIEWBOX.height,
          );
          const renderedWidth = VIEWBOX.width * scale;
          const horizontalInset = (bounds.width - renderedWidth) / 2;
          return (event.clientX - bounds.left - horizontalInset) / scale;
        }

        return ((event.clientX - bounds.left) / bounds.width) * VIEWBOX.width;
      }
    }

    // This final fallback also makes synthetic, layout-free DOM tests usable.
    return Number.isFinite(event.clientX) ? event.clientX : PLOT.left;
  }

  function angleFromPointer(event) {
    const svgX = svgXFromPointer(event);
    const proportion = clamp((svgX - PLOT.left) / plotWidth, 0, 1);
    return proportion * TAU;
  }

  function pointerIdFor(event) {
    return Number.isFinite(event.pointerId) ? event.pointerId : 0;
  }

  function handlePointerDown(event) {
    if (destroyed || dragging || event.isPrimary === false || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const pointerId = pointerIdFor(event);
    const angle = angleFromPointer(event);
    dragging = true;
    activePointerId = pointerId;
    lastPointerAngle = angle;
    svg.classList.add("is-dragging");
    hitArea.classList.add("is-dragging");

    if (typeof hitArea.focus === "function") {
      try {
        hitArea.focus({ preventScroll: true });
      } catch {
        hitArea.focus();
      }
    }

    if (typeof hitArea.setPointerCapture === "function") {
      hitArea.setPointerCapture(pointerId);
    }

    if (callbacks.onAngleStart) {
      callbacks.onAngleStart(angle);
    }
    if (callbacks.onAngleChange) {
      callbacks.onAngleChange(angle);
    }
  }

  function handlePointerMove(event) {
    if (
      destroyed ||
      !dragging ||
      pointerIdFor(event) !== activePointerId
    ) {
      return;
    }

    event.preventDefault();
    lastPointerAngle = angleFromPointer(event);
    if (callbacks.onAngleChange) {
      callbacks.onAngleChange(lastPointerAngle);
    }
  }

  function finishPointer(event, useEventPosition) {
    if (
      destroyed ||
      !dragging ||
      pointerIdFor(event) !== activePointerId
    ) {
      return;
    }

    event.preventDefault();
    const pointerId = activePointerId;
    const finalAngle = useEventPosition
      ? angleFromPointer(event)
      : lastPointerAngle;

    if (useEventPosition && finalAngle !== lastPointerAngle) {
      lastPointerAngle = finalAngle;
      if (callbacks.onAngleChange) {
        callbacks.onAngleChange(finalAngle);
      }
    }

    dragging = false;
    activePointerId = null;
    svg.classList.remove("is-dragging");
    hitArea.classList.remove("is-dragging");

    if (
      useEventPosition &&
      typeof hitArea.hasPointerCapture === "function" &&
      typeof hitArea.releasePointerCapture === "function" &&
      hitArea.hasPointerCapture(pointerId)
    ) {
      hitArea.releasePointerCapture(pointerId);
    }

    if (callbacks.onAngleEnd) {
      callbacks.onAngleEnd(finalAngle);
    }
  }

  function handlePointerUp(event) {
    finishPointer(event, true);
  }

  function handlePointerCancel(event) {
    finishPointer(event, false);
  }

  function handleLostPointerCapture(event) {
    finishPointer(event, false);
  }

  function handleKeyDown(event) {
    if (destroyed) {
      return;
    }

    const step = (event.shiftKey ? 15 : 1) * DEGREE;
    let delta = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      delta = -step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      delta = step;
    }

    if (delta !== null) {
      event.preventDefault();
      if (callbacks.onAngleStep) {
        callbacks.onAngleStep(delta);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (callbacks.onAngleHome) {
        callbacks.onAngleHome();
      }
      return;
    }

    if (
      event.key === " " ||
      event.key === "Spacebar" ||
      event.code === "Space"
    ) {
      event.preventDefault();
      if (!event.repeat && callbacks.onTogglePlay) {
        callbacks.onTogglePlay();
      }
    }
  }

  hitArea.addEventListener("pointerdown", handlePointerDown);
  hitArea.addEventListener("pointermove", handlePointerMove);
  hitArea.addEventListener("pointerup", handlePointerUp);
  hitArea.addEventListener("pointercancel", handlePointerCancel);
  hitArea.addEventListener("lostpointercapture", handleLostPointerCapture);
  hitArea.addEventListener("keydown", handleKeyDown);

  function updateExactVisualization(
    exactAngle,
    snapEnabled,
    angle,
    value,
    displayAngleLabel = null,
  ) {
    const exactAngleValue = Number(exactAngle?.angle?.value);
    const hasExactAngle = Number.isFinite(exactAngleValue);
    const atTurnEnd = Math.abs(angle - TAU) < 1e-9;
    const exactDegrees = hasExactAngle
      ? atTurnEnd ? 360 : Math.round(exactAngleValue / DEGREE)
      : null;
    const exactAngleLabel = hasExactAngle
      ? typeof displayAngleLabel === "string" && displayAngleLabel.trim()
        ? displayAngleLabel
        : typeof exactAngle.angle?.plain === "string" && exactAngle.angle.plain.trim()
          ? exactAngle.angle.plain
          : svgNumber(exactAngleValue)
      : null;
    const exactDescriptor = hasExactAngle ? exactAngle[kind] : null;
    const exactValueLabel =
      exactDescriptor && typeof exactDescriptor.plain === "string"
        ? exactDescriptor.plain
        : null;
    const exactValueTex =
      exactDescriptor && typeof exactDescriptor.tex === "string"
        ? exactDescriptor.tex
        : null;
    const exactValue = Number(exactDescriptor?.value);
    const exactAngleRadians = hasExactAngle ? svgNumber(exactAngleValue) : null;

    setAttributes(svg, {
      "data-snap-enabled": snapEnabled ? "true" : "false",
      "data-has-exact-angle": hasExactAngle ? "true" : "false",
      "data-exact-angle": exactAngleLabel,
      "data-exact-angle-radians": exactAngleRadians,
      "data-exact-angle-degrees": exactDegrees,
    });
    setAttributes(exactGuides, {
      class: snapEnabled
        ? "wave-exact-guides wave-exact-guides-snap-enabled"
        : "wave-exact-guides",
      "data-snap-enabled": snapEnabled ? "true" : "false",
      "data-active-angle": exactAngleLabel,
      "data-active-angle-radians": exactAngleRadians,
      "data-active-angle-degrees": exactDegrees,
    });

    for (const entry of exactGuideEntries) {
      const active =
        hasExactAngle
        && !atTurnEnd
        && angularDistance(exactAngleValue, entry.angle) < 1e-7;
      const guideStroke = active
        ? "var(--angle-amber, #bc7a1e)"
        : "var(--reference-slate, #69747b)";

      setAttributes(entry.guide, {
        class: active
          ? "wave-exact-guide wave-exact-guide-active"
          : "wave-exact-guide",
        "data-active": active ? "true" : "false",
      });
      setAttributes(entry.line, {
        stroke: guideStroke,
        "stroke-width": active ? 2.4 : snapEnabled ? 1.2 : 0.75,
        "stroke-dasharray": active ? "none" : "2 5",
        opacity: active ? 0.92 : snapEnabled ? 0.25 : 0.09,
        "data-active": active ? "true" : "false",
      });
      setAttributes(entry.tick, {
        stroke: guideStroke,
        "stroke-width": active ? 3 : snapEnabled ? 1.8 : 1.25,
        opacity: active ? 1 : snapEnabled ? 0.62 : 0.34,
        "data-active": active ? "true" : "false",
      });
    }

    const exactStateAttributes = {
      "data-exact-angle": exactAngleLabel,
      "data-exact-angle-radians": exactAngleRadians,
      "data-exact-angle-degrees": exactDegrees,
      "data-exact-value": exactValueLabel,
      "data-exact-value-tex": exactValueTex,
      "data-exact-value-number": Number.isFinite(exactValue)
        ? svgNumber(exactValue)
        : null,
    };

    setAttributes(exactPointHalo, {
      ...exactStateAttributes,
      class: hasExactAngle
        ? "wave-exact-point-halo wave-exact-halo wave-exact-point-halo-active wave-exact-halo-active"
        : "wave-exact-point-halo wave-exact-halo",
      cx: svgNumber(xForAngle(angle)),
      cy: svgNumber(yForValue(value)),
      visibility: hasExactAngle ? "visible" : "hidden",
      "data-active": hasExactAngle ? "true" : "false",
      "data-wave-kind": kind,
    });
    setAttributes(point, {
      ...exactStateAttributes,
      "data-exact-active": hasExactAngle ? "true" : "false",
    });
  }

  let comparisonPathPhase = null;

  function identityToneFor(mode, requestedTone) {
    if (mode === "addition") {
      return "reference";
    }
    if (mode === "powers" || mode === "quarter-turn") {
      return "derived";
    }

    return requestedTone === "derived" ? "derived" : "reference";
  }

  function identityMarkerFallbackLabel(identity, mode, role, index) {
    const roleToken = String(role).toLowerCase();

    if (mode === "addition") {
      if (roleToken.includes("alpha")) {
        return "α";
      }
      if (roleToken.includes("beta")) {
        return "β";
      }
      return index === 0 ? "α" : index === 1 ? "β" : role;
    }
    if (mode === "powers") {
      const power = identity?.parameters?.power;
      return Number.isInteger(power) ? `${power}θ` : "nθ";
    }
    if (mode === "conjugate") {
      return "−θ";
    }
    if (mode === "quarter-turn") {
      return "θ + π/2";
    }

    return role;
  }

  function referenceCursorDash(role, index) {
    const roleToken = String(role).toLowerCase();
    if (roleToken.includes("alpha")) {
      return "3 5";
    }
    if (roleToken.includes("beta")) {
      return "8 4";
    }

    return index % 2 === 0 ? "3 5" : "8 4";
  }

  function clearIdentityMarkerEntry(entry) {
    const clearedState = {
      "data-identity-active": "false",
      "data-identity-role": null,
      "data-identity-tone": null,
      "data-identity-angle": null,
      "data-identity-normalized-angle": null,
      "data-identity-value": null,
      "data-identity-label": null,
      "data-active": "false",
      "data-role": null,
      "data-tone": null,
      "data-angle": null,
      "data-normalized-angle": null,
      "data-value": null,
      "data-label": null,
    };

    setAttributes(entry.marker, {
      ...clearedState,
      class: "wave-identity-marker",
      visibility: "hidden",
    });
    setAttributes(entry.cursor, {
      ...clearedState,
      class: "wave-identity-cursor",
    });
    setAttributes(entry.point, {
      ...clearedState,
      class: "wave-identity-point",
    });
    setAttributes(entry.label, {
      ...clearedState,
      class: "wave-identity-label",
    });
    entry.label.textContent = "";
  }

  function updateIdentityMarker(
    entry,
    markerModel,
    identity,
    mode,
    sourceIndex,
    visibleIndex,
    normalizedAngle,
    primaryValue,
  ) {
    const role = textOr(markerModel.role, `marker-${sourceIndex + 1}`);
    const roleClass = identityClassToken(role, `marker-${sourceIndex + 1}`);
    const tone = identityToneFor(mode, markerModel.tone);
    const color = IDENTITY_COLORS[tone];
    const label = textOr(
      markerModel.label,
      identityMarkerFallbackLabel(identity, mode, role, sourceIndex),
    );
    const rawAngle =
      typeof markerModel.angle === "number" ? markerModel.angle : NaN;
    const markerValue = mode === "conjugate"
      ? kind === "cos" ? primaryValue : -primaryValue
      : waveValue(kind, normalizedAngle);
    const x = xForAngle(normalizedAngle);
    const y = yForValue(markerValue);
    const cursorDash = tone === "derived"
      ? "9 3 2 3"
      : referenceCursorDash(role, visibleIndex);
    const labelLaneOffset = (visibleIndex % 2) * 11;
    const labelBelowPoint = y < PLOT.top + 28;
    const labelY = clamp(
      labelBelowPoint ? y + 16 + labelLaneOffset : y - 10 - labelLaneOffset,
      PLOT.top + 10,
      PLOT.bottom - 3,
    );
    const labelOnLeft = x > PLOT.right - 74;
    const markerState = {
      "data-identity-active": "true",
      "data-identity-role": role,
      "data-identity-tone": tone,
      "data-identity-angle": Number.isFinite(rawAngle) ? String(rawAngle) : null,
      "data-identity-normalized-angle": String(normalizedAngle),
      "data-identity-value": String(Object.is(markerValue, -0) ? 0 : markerValue),
      "data-identity-label": label,
      "data-active": "true",
      "data-role": role,
      "data-tone": tone,
      "data-angle": Number.isFinite(rawAngle) ? String(rawAngle) : null,
      "data-normalized-angle": String(normalizedAngle),
      "data-value": String(Object.is(markerValue, -0) ? 0 : markerValue),
      "data-label": label,
      "data-wave-kind": kind,
    };

    setAttributes(entry.marker, {
      ...markerState,
      class:
        `wave-identity-marker wave-identity-marker-${tone} ` +
        `wave-identity-role-${roleClass}`,
      visibility: "visible",
    });
    setAttributes(entry.cursor, {
      ...markerState,
      class:
        `wave-identity-cursor wave-identity-cursor-${tone} ` +
        `wave-identity-role-${roleClass}`,
      x1: svgNumber(x),
      y1: PLOT.top,
      x2: svgNumber(x),
      y2: PLOT.bottom,
      stroke: color,
      "stroke-width": tone === "derived" ? 1.35 : 1.15,
      "stroke-dasharray": cursorDash,
      "stroke-linecap": "round",
      opacity: 0.7,
    });
    setAttributes(entry.point, {
      ...markerState,
      class:
        `wave-identity-point wave-identity-point-${tone} ` +
        `wave-identity-role-${roleClass}`,
      cx: svgNumber(x),
      cy: svgNumber(y),
      r: tone === "derived" ? 5 : 4.5,
      fill: tone === "derived" ? color : IDENTITY_COLORS.surface,
      stroke: tone === "derived" ? IDENTITY_COLORS.surface : color,
      "stroke-width": tone === "derived" ? 2 : 1.8,
      "stroke-dasharray": tone === "derived" ? null : "2 2",
      opacity: tone === "derived" ? 0.92 : 0.84,
    });
    setAttributes(entry.label, {
      ...markerState,
      class:
        `wave-identity-label wave-identity-label-${tone} ` +
        `wave-identity-role-${roleClass}`,
      x: svgNumber(x + (labelOnLeft ? -7 : 7)),
      y: svgNumber(labelY),
      fill: color,
      "text-anchor": labelOnLeft ? "end" : "start",
    });
    entry.label.textContent = label;

    return {
      role,
      tone,
      label,
      normalizedAngle,
      value: markerValue,
      x,
      y,
    };
  }

  function hideIdentityComparison() {
    comparisonPathPhase = null;
    setAttributes(identityComparisonCurve, {
      class:
        "wave-identity-comparison-curve wave-identity-comparison-curve-derived",
      d: "",
      visibility: "hidden",
      "data-identity-active": "false",
      "data-identity-mode": null,
      "data-identity-label": null,
      "data-identity-phase-shift": null,
      "data-identity-normalized-phase-shift": null,
      "data-active": "false",
      "data-label": null,
      "data-phase-shift": null,
    });
    setAttributes(identityComparisonLabel, {
      visibility: "hidden",
      "data-identity-active": "false",
      "data-identity-label": null,
      "data-active": "false",
      "data-label": null,
    });
    identityComparisonLabel.textContent = "";
  }

  function updateIdentityComparison(identity, mode) {
    const comparison = identity?.comparisonCurve;
    const phaseShift = comparison?.phaseShift;

    if (
      mode !== "quarter-turn" ||
      !comparison ||
      typeof comparison !== "object" ||
      typeof phaseShift !== "number" ||
      !Number.isFinite(phaseShift)
    ) {
      hideIdentityComparison();
      return null;
    }

    const normalizedPhaseShift = normalizedPlotAngle(phaseShift);
    const label = textOr(
      comparison.label,
      `${functionName} shifted by π/2`,
    );

    if (comparisonPathPhase !== normalizedPhaseShift) {
      identityComparisonCurve.setAttribute(
        "d",
        buildWavePath(kind, normalizedPhaseShift),
      );
      comparisonPathPhase = normalizedPhaseShift;
    }

    setAttributes(identityComparisonCurve, {
      class:
        "wave-identity-comparison-curve wave-identity-comparison-curve-derived " +
        "wave-identity-comparison-curve-active",
      visibility: "visible",
      "data-identity-active": "true",
      "data-identity-mode": mode,
      "data-identity-label": label,
      "data-identity-phase-shift": String(phaseShift),
      "data-identity-normalized-phase-shift": String(normalizedPhaseShift),
      "data-active": "true",
      "data-label": label,
      "data-phase-shift": String(phaseShift),
    });
    setAttributes(identityComparisonLabel, {
      visibility: "visible",
      "data-identity-active": "true",
      "data-identity-label": label,
      "data-active": "true",
      "data-label": label,
    });
    identityComparisonLabel.textContent = label;

    return { label, phaseShift, normalizedPhaseShift };
  }

  function hideIdentityRelation() {
    setAttributes(identityRelation, {
      class: "wave-identity-relation",
      d: "",
      visibility: "hidden",
      "data-identity-active": "false",
      "data-identity-relation": null,
    });
    setAttributes(identityReflectionTick, {
      visibility: "hidden",
      "data-identity-active": "false",
      "data-identity-relation": null,
    });
    setAttributes(identityRelationLabel, {
      visibility: "hidden",
      "data-identity-active": "false",
      "data-identity-relation": null,
    });
    identityRelationLabel.textContent = "";
  }

  function updateConjugateRelation(mode, markers, primaryAngle, primaryValue) {
    if (mode !== "conjugate" || markers.length === 0) {
      hideIdentityRelation();
      return null;
    }

    const mirroredMarker =
      markers.find((marker) =>
        /conjugate|mirror|negative/.test(marker.role.toLowerCase()),
      ) ?? markers[0];
    const primaryX = xForAngle(primaryAngle);
    const primaryY = yForValue(primaryValue);
    const relation = kind === "cos" ? "equal-value" : "sign-reflection";
    const relationText = kind === "cos"
      ? "cos(−θ) = cos θ"
      : "sin(−θ) = −sin θ";
    const relationPath = kind === "cos"
      ? `M ${svgNumber(primaryX)} ${svgNumber(primaryY)} ` +
        `L ${svgNumber(mirroredMarker.x)} ${svgNumber(mirroredMarker.y)}`
      : `M ${svgNumber(primaryX)} ${svgNumber(primaryY)} ` +
        `L ${svgNumber(mirroredMarker.x)} ${svgNumber(primaryY)} ` +
        `L ${svgNumber(mirroredMarker.x)} ${svgNumber(mirroredMarker.y)}`;
    const relationLabelY = kind === "cos"
      ? clamp(
          primaryY < PLOT.top + 24 ? primaryY + 15 : primaryY - 8,
          PLOT.top + 10,
          PLOT.bottom - 4,
        )
      : yForValue(0) - 8;

    setAttributes(identityRelation, {
      class:
        `wave-identity-relation wave-identity-relation-${relation} ` +
        "wave-identity-relation-active",
      d: relationPath,
      visibility: "visible",
      "data-identity-active": "true",
      "data-identity-relation": relation,
    });
    setAttributes(identityRelationLabel, {
      x: svgNumber((primaryX + mirroredMarker.x) / 2),
      y: svgNumber(relationLabelY),
      visibility: "visible",
      "data-identity-active": "true",
      "data-identity-relation": relation,
    });
    identityRelationLabel.textContent = relationText;

    if (kind === "sin") {
      const zeroY = yForValue(0);
      setAttributes(identityReflectionTick, {
        x1: svgNumber(mirroredMarker.x - 5),
        y1: svgNumber(zeroY),
        x2: svgNumber(mirroredMarker.x + 5),
        y2: svgNumber(zeroY),
        visibility: "visible",
        "data-identity-active": "true",
        "data-identity-relation": relation,
      });
    } else {
      setAttributes(identityReflectionTick, {
        visibility: "hidden",
        "data-identity-active": "false",
        "data-identity-relation": null,
      });
    }

    return relation;
  }

  function identityAccessibilitySummary(mode, markers, comparison) {
    if (mode === "addition") {
      const labels = markers.slice(0, 2).map((marker) => marker.label);
      const referenceLabels = readableList(labels.length ? labels : ["α", "β"]);
      return `Addition comparison: reference markers ${referenceLabels}; the result stays on the primary cursor.`;
    }
    if (mode === "powers") {
      const label = markers[0]?.label ?? "nθ";
      return `Powers comparison: derived ${label} marker.`;
    }
    if (mode === "conjugate") {
      return kind === "cos"
        ? "Conjugate comparison: cosine at −θ equals cosine at θ."
        : "Conjugate comparison: sine at −θ is the sign-reflected value at θ.";
    }
    if (mode === "quarter-turn") {
      const markerLabel = markers[0]?.label ?? "θ + π/2";
      const curveLabel = comparison?.label ?? `shifted ${functionName} curve`;
      return `Quarter-turn comparison: derived ${markerLabel} marker and ${curveLabel}.`;
    }

    return "";
  }

  function updateIdentityDescription(summary) {
    const nextDescription = summary
      ? `${baseDescription} ${summary}`
      : baseDescription;

    if (description.textContent !== nextDescription) {
      description.textContent = nextDescription;
    }
  }

  function updateIdentityOverlay(identityModel, primaryAngle, primaryValue) {
    const identity =
      identityModel && typeof identityModel === "object" ? identityModel : null;
    const mode = canonicalIdentityMode(identity?.mode);
    const inspectableMode = mode ?? "none";
    const active = VISIBLE_IDENTITY_MODES.has(mode);
    const markers = [];

    if (active) {
      const markerModels = Array.isArray(identity.waveMarkers)
        ? identity.waveMarkers
        : [];

      for (let sourceIndex = 0; sourceIndex < markerModels.length; sourceIndex += 1) {
        const markerModel = markerModels[sourceIndex];
        if (!markerModel || typeof markerModel !== "object") {
          continue;
        }

        const normalizedAngle = normalizedPlotAngle(markerModel.normalizedAngle);
        if (normalizedAngle === null) {
          continue;
        }

        const entry =
          identityMarkerEntries[markers.length] ?? createIdentityMarkerEntry();
        markers.push(
          updateIdentityMarker(
            entry,
            markerModel,
            identity,
            mode,
            sourceIndex,
            markers.length,
            normalizedAngle,
            primaryValue,
          ),
        );
      }
    }

    for (let index = markers.length; index < identityMarkerEntries.length; index += 1) {
      clearIdentityMarkerEntry(identityMarkerEntries[index]);
    }

    let comparison = null;
    let relation = null;
    if (active) {
      comparison = updateIdentityComparison(identity, mode);
      relation = updateConjugateRelation(
        mode,
        markers,
        primaryAngle,
        primaryValue,
      );
    } else {
      hideIdentityComparison();
      hideIdentityRelation();
    }
    const summary = active
      ? identityAccessibilitySummary(mode, markers, comparison)
      : "";
    const modeClass = identityClassToken(inspectableMode, "none");
    const stateAttributes = {
      "data-identity-mode": inspectableMode,
      "data-identity-active": active ? "true" : "false",
      "data-identity-marker-count": markers.length,
      "data-identity-comparison-active": comparison ? "true" : "false",
      "data-identity-comparison-label": comparison?.label ?? null,
      "data-identity-phase-shift": comparison
        ? String(comparison.phaseShift)
        : null,
      "data-identity-relation": relation,
    };

    setAttributes(svg, stateAttributes);
    setAttributes(identityOverlay, {
      ...stateAttributes,
      class: active
        ? `wave-identity-overlay wave-identity-overlay-${modeClass} wave-identity-overlay-active`
        : `wave-identity-overlay wave-identity-overlay-${modeClass}`,
      "data-mode": inspectableMode,
      "data-active": active ? "true" : "false",
      display: active ? "inline" : "none",
      visibility: active ? "visible" : "hidden",
    });
    setAttributes(identityMarkerLayer, {
      "data-identity-active": active && markers.length ? "true" : "false",
      "data-identity-mode": inspectableMode,
      "data-identity-marker-count": markers.length,
      visibility: active && markers.length ? "visible" : "hidden",
    });
    updateIdentityDescription(summary);

    return summary.replace(/[.\s]+$/, "");
  }

  function updateDynamicElements(
    angle,
    value,
    renderOptions,
    identityValueText = "",
  ) {
    const x = xForAngle(angle);
    const y = yForValue(value);
    const defaultValueText = formatValue(value);
    const displayValue =
      renderOptions && typeof renderOptions.valueLabel === "string"
        ? renderOptions.valueLabel
        : defaultValueText;
    const displayAngle =
      renderOptions && typeof renderOptions.angleLabel === "string"
        ? renderOptions.angleLabel
        : describeAngle(angle);
    const label = `${kind} θ = ${displayValue}`;
    const labelWidth = clamp(18 + label.length * 7, 88, 148);
    const labelHeight = 24;
    let labelX = x + 10;
    let labelY = y - labelHeight - 8;

    if (labelX + labelWidth > PLOT.right) {
      labelX = x - labelWidth - 10;
    }
    if (labelX < PLOT.left) {
      labelX = PLOT.left;
    }
    if (labelY < PLOT.top) {
      labelY = y + 8;
    }
    if (labelY + labelHeight > PLOT.bottom) {
      labelY = PLOT.bottom - labelHeight;
    }

    cursor.setAttribute("x1", String(x));
    cursor.setAttribute("x2", String(x));
    cursor.setAttribute("data-angle", String(angle));
    point.setAttribute("cx", String(x));
    point.setAttribute("cy", String(y));
    point.setAttribute("data-angle", String(angle));
    point.setAttribute("data-value", String(value));
    pointTitle.textContent = `${kind}(${angle.toFixed(3)}) = ${defaultValueText}`;
    valueText.textContent = label;
    valueBackground.setAttribute("width", svgNumber(labelWidth));
    valueLabel.setAttribute(
      "transform",
      `translate(${svgNumber(labelX)} ${svgNumber(labelY)})`,
    );
    hitArea.setAttribute("aria-valuenow", String(angle));
    const identityValueSuffix = identityValueText
      ? `; ${identityValueText}`
      : "";
    hitArea.setAttribute(
      "aria-valuetext",
      `Angle ${displayAngle}; ${functionName} equals ${displayValue}` +
        identityValueSuffix,
    );
  }

  function render(model, renderOptions = {}) {
    if (destroyed) {
      return;
    }

    if (!model || typeof model !== "object") {
      throw new TypeError("waveView.render requires a model object.");
    }

    const angle = Number(model.plotTheta ?? model.normalizedTheta);
    const value = Number(model[valueKey]);

    if (!Number.isFinite(angle)) {
      throw new TypeError("model.normalizedTheta must be a finite number.");
    }
    if (angle < 0 || angle > TAU) {
      throw new RangeError("model.normalizedTheta must be between 0 and 2π.");
    }
    if (!Number.isFinite(value)) {
      throw new TypeError(`model.${valueKey} must be a finite number.`);
    }

    const exactAngle =
      model.exactAngle && typeof model.exactAngle === "object"
        ? model.exactAngle
        : null;
    const snapEnabled =
      renderOptions &&
      typeof renderOptions === "object" &&
      renderOptions.snapEnabled === true;

    const identityValueText = updateIdentityOverlay(
      model.identity,
      angle,
      value,
    );
    updateDynamicElements(angle, value, renderOptions, identityValueText);
    updateExactVisualization(
      exactAngle,
      snapEnabled,
      angle,
      value,
      renderOptions.angleLabel,
    );
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    dragging = false;
    activePointerId = null;

    hitArea.removeEventListener("pointerdown", handlePointerDown);
    hitArea.removeEventListener("pointermove", handlePointerMove);
    hitArea.removeEventListener("pointerup", handlePointerUp);
    hitArea.removeEventListener("pointercancel", handlePointerCancel);
    hitArea.removeEventListener("lostpointercapture", handleLostPointerCapture);
    hitArea.removeEventListener("keydown", handleKeyDown);

    if (svg.parentNode) {
      svg.parentNode.removeChild(svg);
    }
  }

  const initialIdentityValueText = updateIdentityOverlay(
    null,
    0,
    initialValue,
  );
  updateDynamicElements(0, initialValue, {}, initialIdentityValueText);
  updateExactVisualization(null, false, 0, initialValue);
  container.appendChild(svg);

  return { render, destroy };
}
