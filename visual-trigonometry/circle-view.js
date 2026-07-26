const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const VIEWBOX_SIZE = 600;
const CENTER = VIEWBOX_SIZE / 2;
const UNIT_RADIUS = 130;
const PLOT_RADIUS = 2;
const ANGLE_ARC_RADIUS = 48;
const TAU = Math.PI * 2;
const SMALL_ANGLE_STEP = Math.PI / 180;
const LARGE_ANGLE_STEP = Math.PI / 12;
const DEFAULT_POLAR_EPSILON = 0.02;
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

const COLORS = {
  ink: "var(--vt-ink, #334155)",
  muted: "var(--vt-muted, #64748b)",
  grid: "var(--vt-grid, #94a3b8)",
  cosine: "var(--vt-cosine, #2563eb)",
  sine: "var(--vt-sine, #ef6a5b)",
  unit: "var(--vt-unit, #7c3aed)",
  polar: "var(--vt-polar, #0f9388)",
  angle: "var(--vt-angle, #d97706)",
  surface: "var(--vt-surface, transparent)",
  handleOutline: "var(--vt-handle-outline, #ffffff)",
};

let nextViewId = 0;

function setAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, String(value));
    }
  }

  return element;
}

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function principalAngle(angle) {
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Object.is(normalized, -0) ? 0 : normalized;
}

function arcAngle(angle) {
  if (Math.abs(angle) <= TAU) {
    return angle;
  }

  const reduced = angle % TAU;
  if (Math.abs(reduced) < 1e-10) {
    return angle < 0 ? -TAU : TAU;
  }

  return reduced;
}

function svgCoordinate(value) {
  return Number(value.toFixed(3));
}

function angleArcPath(angle) {
  const magnitude = Math.abs(angle);
  if (magnitude < 1e-6) {
    return "";
  }

  const sweep = angle < 0 ? 1 : 0;
  const startX = CENTER + ANGLE_ARC_RADIUS;
  const startY = CENTER;

  if (Math.abs(magnitude - TAU) < 1e-6) {
    const oppositeX = CENTER - ANGLE_ARC_RADIUS;
    return [
      `M ${startX} ${startY}`,
      `A ${ANGLE_ARC_RADIUS} ${ANGLE_ARC_RADIUS} 0 0 ${sweep} ${oppositeX} ${CENTER}`,
      `A ${ANGLE_ARC_RADIUS} ${ANGLE_ARC_RADIUS} 0 0 ${sweep} ${startX} ${startY}`,
    ].join(" ");
  }

  const endX = CENTER + ANGLE_ARC_RADIUS * Math.cos(angle);
  const endY = CENTER - ANGLE_ARC_RADIUS * Math.sin(angle);
  const largeArc = magnitude > Math.PI ? 1 : 0;

  return [
    `M ${startX} ${startY}`,
    `A ${ANGLE_ARC_RADIUS} ${ANGLE_ARC_RADIUS} 0 ${largeArc} ${sweep}`,
    `${svgCoordinate(endX)} ${svgCoordinate(endY)}`,
  ].join(" ");
}

function formatNumber(value, precision, unicodeMinus = true) {
  const zeroThreshold = 0.5 * 10 ** -precision;
  const normalized = Math.abs(value) < zeroThreshold ? 0 : value;
  let text = normalized.toFixed(precision);

  if (precision > 0) {
    text = text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  return unicodeMinus ? text.replace("-", "−") : text;
}

function setLine(line, x1, y1, x2, y2) {
  setAttributes(line, {
    x1: svgCoordinate(x1),
    y1: svgCoordinate(y1),
    x2: svgCoordinate(x2),
    y2: svgCoordinate(y2),
  });
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function midpoint(start, end, ratio = 0.5) {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

function unitVector(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);

  return length > 1e-9
    ? { x: deltaX / length, y: deltaY / length }
    : { x: 0, y: 0 };
}

function outsideSegmentLabel(start, end, insidePoint, ratio = 0.7, offset = 15) {
  const point = midpoint(start, end, ratio);
  const direction = unitVector(start, end);
  let normalX = -direction.y;
  let normalY = direction.x;
  const insideX = insidePoint.x - point.x;
  const insideY = insidePoint.y - point.y;

  if (normalX * insideX + normalY * insideY > 0) {
    normalX *= -1;
    normalY *= -1;
  }

  return {
    x: point.x + normalX * offset,
    y: point.y + normalY * offset,
  };
}

function rightAnglePathAt(vertex, firstEnd, secondEnd, size) {
  const firstDirection = unitVector(vertex, firstEnd);
  const secondDirection = unitVector(vertex, secondEnd);
  const firstPoint = {
    x: vertex.x + firstDirection.x * size,
    y: vertex.y + firstDirection.y * size,
  };
  const corner = {
    x: firstPoint.x + secondDirection.x * size,
    y: firstPoint.y + secondDirection.y * size,
  };
  const secondPoint = {
    x: vertex.x + secondDirection.x * size,
    y: vertex.y + secondDirection.y * size,
  };

  return [
    `M ${svgCoordinate(firstPoint.x)} ${svgCoordinate(firstPoint.y)}`,
    `L ${svgCoordinate(corner.x)} ${svgCoordinate(corner.y)}`,
    `L ${svgCoordinate(secondPoint.x)} ${svgCoordinate(secondPoint.y)}`,
  ].join(" ");
}

/**
 * Creates the interactive complex-plane and unit-circle SVG.
 *
 * @param {Element} container Element that will own the SVG.
 * @param {object} callbacks Optional interaction callbacks.
 * @returns {{ render(model: object, options?: object): void, destroy(): void }}
 */
export function createCircleView(container, callbacks = {}) {
  if (!container || typeof container.appendChild !== "function") {
    throw new TypeError("createCircleView requires a DOM container element");
  }

  const document = container.ownerDocument;
  if (!document || typeof document.createElementNS !== "function") {
    throw new TypeError("createCircleView requires a container with an owner document");
  }

  const handlers = callbacks && typeof callbacks === "object" ? callbacks : {};
  const viewId = `vt-circle-view-${++nextViewId}`;
  const titleId = `${viewId}-title`;
  const descriptionId = `${viewId}-description`;
  const angleArrowId = `${viewId}-angle-arrow`;
  const listeners = [];

  let destroyed = false;
  let drag = null;
  let lastRenderedPrincipalAngle = 0;

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  setAttributes(svg, {
    class: "visual-trigonometry-circle-view",
    viewBox: `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`,
    preserveAspectRatio: "xMidYMid meet",
    width: "100%",
    role: "group",
    "aria-labelledby": `${titleId} ${descriptionId}`,
    style:
      "display:block;width:100%;height:auto;aspect-ratio:1 / 1;overflow:visible;" +
      "font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;",
  });

  function add(parent, tagName, attributes = {}, text = null) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    setAttributes(element, attributes);
    if (text !== null) {
      element.textContent = text;
    }
    parent.appendChild(element);
    return element;
  }

  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  }

  function invoke(name, ...args) {
    const callback = handlers[name];
    if (typeof callback === "function") {
      callback(...args);
    }
  }

  const title = add(svg, "title", { id: titleId }, "Interactive unit circle and complex plane");
  const description = add(
    svg,
    "desc",
    { id: descriptionId },
    "Drag the unit point around the circle, or focus it and use the arrow keys to change the angle.",
  );

  const definitions = add(svg, "defs");
  const angleArrow = add(definitions, "marker", {
    id: angleArrowId,
    viewBox: "0 0 8 8",
    markerWidth: 8,
    markerHeight: 8,
    refX: 7,
    refY: 4,
    orient: "auto",
    markerUnits: "userSpaceOnUse",
  });
  add(angleArrow, "path", {
    d: "M 0 0 L 8 4 L 0 8 z",
    fill: COLORS.angle,
  });

  add(svg, "rect", {
    x: 0,
    y: 0,
    width: VIEWBOX_SIZE,
    height: VIEWBOX_SIZE,
    fill: COLORS.surface,
    "pointer-events": "none",
  });

  const grid = add(svg, "g", {
    class: "vt-circle-grid",
    stroke: COLORS.grid,
    "stroke-width": 1,
    opacity: 0.18,
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  for (const value of [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2]) {
    const offset = value * UNIT_RADIUS;
    add(grid, "line", {
      x1: CENTER + offset,
      y1: CENTER - PLOT_RADIUS * UNIT_RADIUS,
      x2: CENTER + offset,
      y2: CENTER + PLOT_RADIUS * UNIT_RADIUS,
    });
    add(grid, "line", {
      x1: CENTER - PLOT_RADIUS * UNIT_RADIUS,
      y1: CENTER - offset,
      x2: CENTER + PLOT_RADIUS * UNIT_RADIUS,
      y2: CENTER - offset,
    });
  }

  const rings = add(svg, "g", {
    class: "vt-circle-rings",
    fill: "none",
    stroke: COLORS.grid,
    "stroke-width": 1.25,
    "stroke-dasharray": "3 6",
    opacity: 0.32,
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  for (const radius of [0.5, 1, 1.5, 2]) {
    add(rings, "circle", {
      class: "vt-radius-ring",
      "data-radius": radius,
      cx: CENTER,
      cy: CENTER,
      r: radius * UNIT_RADIUS,
    });
  }

  add(svg, "circle", {
    class: "vt-unit-circle",
    "data-part": "unit-circle",
    cx: CENTER,
    cy: CENTER,
    r: UNIT_RADIUS,
    fill: "none",
    stroke: COLORS.ink,
    "stroke-width": 2.5,
    opacity: 0.72,
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  const axes = add(svg, "g", {
    class: "vt-circle-axes",
    stroke: COLORS.ink,
    fill: COLORS.ink,
    "pointer-events": "none",
    "aria-hidden": "true",
  });
  add(axes, "line", {
    x1: 34,
    y1: CENTER,
    x2: 566,
    y2: CENTER,
    "stroke-width": 1.75,
    opacity: 0.78,
  });
  add(axes, "path", {
    d: `M 554 ${CENTER - 6} L 570 ${CENTER} L 554 ${CENTER + 6} z`,
    stroke: "none",
    opacity: 0.78,
  });
  add(axes, "line", {
    x1: CENTER,
    y1: 566,
    x2: CENTER,
    y2: 34,
    "stroke-width": 1.75,
    opacity: 0.78,
  });
  add(axes, "path", {
    d: `M ${CENTER - 6} 46 L ${CENTER} 30 L ${CENTER + 6} 46 z`,
    stroke: "none",
    opacity: 0.78,
  });

  const ticks = add(axes, "g", { "stroke-width": 1.25, opacity: 0.58 });
  for (const value of [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2]) {
    const offset = value * UNIT_RADIUS;
    add(ticks, "line", {
      x1: CENTER + offset,
      y1: CENTER - 5,
      x2: CENTER + offset,
      y2: CENTER + 5,
    });
    add(ticks, "line", {
      x1: CENTER - 5,
      y1: CENTER - offset,
      x2: CENTER + 5,
      y2: CENTER - offset,
    });
  }

  const exactGuides = add(svg, "g", {
    class: "vt-exact-guides",
    "data-part": "exact-angle-guides",
    "data-snap-enabled": "false",
    "pointer-events": "none",
    "aria-hidden": "true",
  });
  const exactGuideEntries = STANDARD_ANGLE_DEGREES.map((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    const directionX = Math.cos(angle);
    const directionY = -Math.sin(angle);
    const guide = add(exactGuides, "g", {
      class: "vt-exact-guide",
      "data-angle-degrees": degrees,
      "data-angle-radians": svgCoordinate(angle),
      "data-guide-family":
        degrees % 90 === 0 ? "30-and-45" : degrees % 30 === 0 ? "30" : "45",
      "data-active": "false",
    });
    const ray = add(guide, "line", {
      class: "vt-exact-guide-ray",
      x1: CENTER,
      y1: CENTER,
      x2: svgCoordinate(CENTER + directionX * UNIT_RADIUS),
      y2: svgCoordinate(CENTER + directionY * UNIT_RADIUS),
      stroke: COLORS.grid,
      "stroke-width": 1,
      "stroke-linecap": "round",
      opacity: 0.07,
      "vector-effect": "non-scaling-stroke",
    });
    const tick = add(guide, "line", {
      class: "vt-exact-guide-tick",
      x1: svgCoordinate(CENTER + directionX * (UNIT_RADIUS - 7)),
      y1: svgCoordinate(CENTER + directionY * (UNIT_RADIUS - 7)),
      x2: svgCoordinate(CENTER + directionX * (UNIT_RADIUS + 8)),
      y2: svgCoordinate(CENTER + directionY * (UNIT_RADIUS + 8)),
      stroke: COLORS.grid,
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      opacity: 0.38,
      "vector-effect": "non-scaling-stroke",
    });

    return { angle, guide, ray, tick };
  });

  const staticLabels = add(svg, "g", {
    class: "vt-circle-static-labels",
    fill: COLORS.muted,
    "font-size": 16,
    "font-weight": 600,
    "pointer-events": "none",
    "user-select": "none",
    "aria-hidden": "true",
  });
  add(staticLabels, "text", { x: 568, y: 282, "text-anchor": "end" }, "Re / x");
  add(staticLabels, "text", { x: 314, y: 39, "text-anchor": "start" }, "Im / y");
  add(staticLabels, "text", { x: 288, y: 320, "text-anchor": "end", "font-size": 14 }, "0");

  const polarGroup = add(svg, "g", {
    class: "vt-polar-construction",
    "data-part": "polar-construction",
    "pointer-events": "none",
    "aria-hidden": "true",
  });
  const radiusSegment = add(polarGroup, "line", {
    class: "vt-radius-segment",
    "data-part": "radius-segment",
    stroke: COLORS.polar,
    "stroke-width": 5,
    "stroke-linecap": "round",
    opacity: 0.5,
  });
  const radiusLabel = add(
    polarGroup,
    "text",
    {
      class: "vt-radius-label",
      fill: COLORS.polar,
      "font-size": 16,
      "font-style": "italic",
      "font-weight": 650,
    },
    "r",
  );
  const polarPoint = add(polarGroup, "circle", {
    class: "vt-polar-point",
    "data-part": "polar-point",
    r: 8,
    fill: COLORS.polar,
    stroke: COLORS.handleOutline,
    "stroke-width": 3,
  });
  const polarLabel = add(
    polarGroup,
    "text",
    {
      class: "vt-polar-label",
      fill: COLORS.polar,
      "font-size": 16,
      "font-weight": 650,
    },
    "z",
  );

  const angleRay = add(svg, "line", {
    class: "vt-angle-ray",
    "data-part": "angle-ray",
    stroke: COLORS.angle,
    "stroke-width": 2,
    "stroke-linecap": "round",
    opacity: 0.88,
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  const construction = add(svg, "g", {
    class: "vt-coordinate-construction",
    "pointer-events": "none",
    "aria-hidden": "true",
  });
  const cosineSegment = add(construction, "line", {
    class: "vt-cosine-segment",
    "data-part": "cosine-segment",
    stroke: COLORS.cosine,
    "stroke-width": 5,
    "stroke-linecap": "round",
    opacity: 0.9,
  });
  const sineSegment = add(construction, "line", {
    class: "vt-sine-segment",
    "data-part": "sine-segment",
    stroke: COLORS.sine,
    "stroke-width": 5,
    "stroke-linecap": "round",
    opacity: 0.9,
  });
  const horizontalProjection = add(construction, "line", {
    class: "vt-projection vt-horizontal-projection",
    "data-part": "horizontal-projection",
    stroke: COLORS.cosine,
    "stroke-width": 1.75,
    "stroke-dasharray": "7 6",
    opacity: 0.76,
  });
  const verticalProjection = add(construction, "line", {
    class: "vt-projection vt-vertical-projection",
    "data-part": "vertical-projection",
    stroke: COLORS.sine,
    "stroke-width": 1.75,
    "stroke-dasharray": "7 6",
    opacity: 0.82,
  });
  const rightAngle = add(construction, "path", {
    class: "vt-right-angle",
    "data-part": "right-angle",
    fill: "none",
    stroke: COLORS.muted,
    "stroke-width": 1.75,
    "stroke-linecap": "square",
    "stroke-linejoin": "miter",
  });

  const exactConstruction = add(svg, "g", {
    class: "vt-exact-construction",
    "data-part": "exact-angle-construction",
    visibility: "hidden",
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  function addExactGeometryLabel(parent, className, fill = COLORS.ink) {
    return add(parent, "text", {
      class: className,
      fill,
      stroke: COLORS.handleOutline,
      "stroke-width": 5,
      "stroke-linejoin": "round",
      "paint-order": "stroke fill",
      "font-size": 15,
      "font-weight": 700,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });
  }

  const exactHalfEquilateral = add(exactConstruction, "g", {
    class: "vt-exact-half-equilateral",
    visibility: "hidden",
  });
  const exactSecondUnitSide = add(exactHalfEquilateral, "line", {
    class: "vt-exact-second-unit-side",
    stroke: COLORS.unit,
    "stroke-width": 2.25,
    "stroke-linecap": "round",
    opacity: 0.42,
    "vector-effect": "non-scaling-stroke",
  });
  const exactClosingSide = add(exactHalfEquilateral, "line", {
    class: "vt-exact-closing-side",
    stroke: COLORS.unit,
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-dasharray": "6 5",
    opacity: 0.38,
    "vector-effect": "non-scaling-stroke",
  });
  const exactLongLeg = add(exactHalfEquilateral, "line", {
    class: "vt-exact-long-leg",
    "stroke-width": 3,
    "stroke-linecap": "round",
    opacity: 0.66,
    "vector-effect": "non-scaling-stroke",
  });
  const exactShortLeg = add(exactHalfEquilateral, "line", {
    class: "vt-exact-short-leg",
    "stroke-width": 3,
    "stroke-linecap": "round",
    opacity: 0.72,
    "vector-effect": "non-scaling-stroke",
  });
  const exactHalfRightAngle = add(exactHalfEquilateral, "path", {
    class: "vt-exact-right-angle",
    fill: "none",
    stroke: COLORS.muted,
    "stroke-width": 1.75,
    "stroke-linecap": "square",
    "stroke-linejoin": "miter",
    opacity: 0.9,
    "vector-effect": "non-scaling-stroke",
  });
  const exactReflectedPoint = add(exactHalfEquilateral, "circle", {
    class: "vt-exact-reflected-point",
    r: 4.5,
    fill: COLORS.unit,
    stroke: COLORS.handleOutline,
    "stroke-width": 2,
    opacity: 0.58,
    "vector-effect": "non-scaling-stroke",
  });
  const exactLongMagnitudeLabel = addExactGeometryLabel(
    exactHalfEquilateral,
    "vt-exact-magnitude-label vt-exact-long-leg-label",
  );
  const exactShortMagnitudeLabel = addExactGeometryLabel(
    exactHalfEquilateral,
    "vt-exact-magnitude-label vt-exact-short-leg-label",
  );

  const exactIsosceles = add(exactConstruction, "g", {
    class: "vt-exact-isosceles-right",
    visibility: "hidden",
  });
  const exactCosineLegTick = add(exactIsosceles, "line", {
    class: "vt-exact-isosceles-tick vt-exact-cosine-leg-tick",
    stroke: COLORS.ink,
    "stroke-width": 2.75,
    "stroke-linecap": "round",
    opacity: 0.9,
    "vector-effect": "non-scaling-stroke",
  });
  const exactSineLegTick = add(exactIsosceles, "line", {
    class: "vt-exact-isosceles-tick vt-exact-sine-leg-tick",
    stroke: COLORS.ink,
    "stroke-width": 2.75,
    "stroke-linecap": "round",
    opacity: 0.9,
    "vector-effect": "non-scaling-stroke",
  });

  const exactQuadrantal = add(exactConstruction, "g", {
    class: "vt-exact-quadrantal",
    visibility: "hidden",
  });
  const exactAxisEmphasis = add(exactQuadrantal, "line", {
    class: "vt-exact-axis-emphasis",
    stroke: COLORS.angle,
    "stroke-width": 9,
    "stroke-linecap": "round",
    opacity: 0.15,
    "vector-effect": "non-scaling-stroke",
  });
  const exactAxisRay = add(exactQuadrantal, "line", {
    class: "vt-exact-axis-ray",
    stroke: COLORS.angle,
    "stroke-width": 3.25,
    "stroke-linecap": "round",
    opacity: 0.62,
    "vector-effect": "non-scaling-stroke",
  });
  const exactZeroLeader = add(exactQuadrantal, "line", {
    class: "vt-exact-zero-leader",
    stroke: COLORS.muted,
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    "stroke-dasharray": "3 3",
    opacity: 0.75,
    "vector-effect": "non-scaling-stroke",
  });
  const exactZeroLabel = addExactGeometryLabel(
    exactQuadrantal,
    "vt-exact-zero-coordinate-label",
    COLORS.angle,
  );

  const exactUnitSideLabel = addExactGeometryLabel(
    exactConstruction,
    "vt-exact-unit-side-label",
    COLORS.unit,
  );
  exactUnitSideLabel.textContent = "1";
  exactUnitSideLabel.setAttribute("visibility", "hidden");

  const angleArc = add(svg, "path", {
    class: "vt-angle-arc",
    "data-part": "angle-arc",
    fill: "none",
    stroke: COLORS.angle,
    "stroke-width": 3.5,
    "stroke-linecap": "round",
    "marker-end": `url(#${angleArrowId})`,
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  const dynamicLabels = add(svg, "g", {
    class: "vt-circle-dynamic-labels",
    "font-size": 16,
    "pointer-events": "none",
    "user-select": "none",
    "aria-hidden": "true",
  });
  const angleLabel = add(
    dynamicLabels,
    "text",
    {
      class: "vt-angle-label",
      fill: COLORS.angle,
      "font-size": 19,
      "font-style": "italic",
      "font-weight": 700,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    },
    "θ",
  );
  const cosineLabel = add(
    dynamicLabels,
    "text",
    {
      class: "vt-cosine-label",
      fill: COLORS.cosine,
      "font-weight": 650,
      "text-anchor": "middle",
    },
    "cos θ",
  );
  const sineLabel = add(
    dynamicLabels,
    "text",
    {
      class: "vt-sine-label",
      fill: COLORS.sine,
      "font-weight": 650,
      "dominant-baseline": "middle",
    },
    "sin θ",
  );
  const unitLabel = add(
    dynamicLabels,
    "text",
    {
      class: "vt-unit-label",
      fill: COLORS.unit,
      "font-size": 15,
      "font-weight": 650,
    },
    "u",
  );

  const hitRing = add(svg, "circle", {
    class: "vt-circle-hit-ring",
    "data-part": "angle-hit-ring",
    cx: CENTER,
    cy: CENTER,
    r: UNIT_RADIUS,
    fill: "none",
    stroke: "transparent",
    "stroke-width": 30,
    "pointer-events": "stroke",
    "touch-action": "none",
    cursor: "crosshair",
    "aria-hidden": "true",
  });

  const focusHalo = add(svg, "circle", {
    class: "vt-unit-focus-halo",
    cx: CENTER + UNIT_RADIUS,
    cy: CENTER,
    r: 16,
    fill: "none",
    stroke: COLORS.angle,
    "stroke-width": 4,
    opacity: 0,
    "pointer-events": "none",
    "aria-hidden": "true",
  });

  const unitHandle = add(svg, "circle", {
    class: "vt-unit-handle",
    "data-part": "unit-handle",
    cx: CENTER + UNIT_RADIUS,
    cy: CENTER,
    r: 10,
    fill: COLORS.unit,
    stroke: COLORS.handleOutline,
    "stroke-width": 3,
    tabindex: 0,
    focusable: "true",
    role: "slider",
    "aria-label": "Angle θ on the unit circle",
    "aria-describedby": descriptionId,
    "aria-valuemin": -Math.PI,
    "aria-valuemax": Math.PI,
    "aria-valuenow": 0,
    "aria-valuetext": "0 radians; cosine 1; sine 0",
    "aria-keyshortcuts": "ArrowLeft ArrowRight ArrowUp ArrowDown Home Space",
    "touch-action": "none",
    cursor: "grab",
  });

  function eventPoint(event) {
    const clientX = finiteNumber(event.clientX, NaN);
    const clientY = finiteNumber(event.clientY, NaN);

    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      try {
        const matrix = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
        if (matrix && typeof matrix.inverse === "function" && typeof svg.createSVGPoint === "function") {
          const point = svg.createSVGPoint();
          point.x = clientX;
          point.y = clientY;
          const transformed = point.matrixTransform(matrix.inverse());
          if (Number.isFinite(transformed.x) && Number.isFinite(transformed.y)) {
            return transformed;
          }
        }
      } catch {
        // Fall through to the viewBox-aware bounding-box conversion.
      }

      const bounds = typeof svg.getBoundingClientRect === "function" ? svg.getBoundingClientRect() : null;
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const scale = Math.min(bounds.width / VIEWBOX_SIZE, bounds.height / VIEWBOX_SIZE);
        const insetX = (bounds.width - VIEWBOX_SIZE * scale) / 2;
        const insetY = (bounds.height - VIEWBOX_SIZE * scale) / 2;
        return {
          x: (clientX - bounds.left - insetX) / scale,
          y: (clientY - bounds.top - insetY) / scale,
        };
      }
    }

    const offsetX = finiteNumber(event.offsetX, NaN);
    const offsetY = finiteNumber(event.offsetY, NaN);
    return Number.isFinite(offsetX) && Number.isFinite(offsetY)
      ? { x: offsetX, y: offsetY }
      : null;
  }

  function eventAngle(event) {
    const point = eventPoint(event);
    if (!point) {
      return null;
    }

    const x = point.x - CENTER;
    const y = CENTER - point.y;
    if (Math.hypot(x, y) < 1e-6) {
      return drag ? drag.lastAngle : lastRenderedPrincipalAngle;
    }

    const angle = Math.atan2(y, x);
    return Object.is(angle, -0) ? 0 : angle;
  }

  function focusHandle() {
    if (typeof unitHandle.focus !== "function") {
      return;
    }

    try {
      unitHandle.focus({ preventScroll: true });
    } catch {
      unitHandle.focus();
    }
  }

  function acceptsPointerDown(event) {
    if (drag || event.isPrimary === false) {
      return false;
    }

    return event.pointerType !== "mouse" || event.button === 0;
  }

  function pointerMatchesDrag(event) {
    return Boolean(
      drag &&
        (drag.pointerId === null ||
          event.pointerId === undefined ||
          event.pointerId === drag.pointerId),
    );
  }

  function onPointerDown(event) {
    if (!acceptsPointerDown(event)) {
      return;
    }

    const angle = eventAngle(event);
    if (angle === null) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    focusHandle();

    const captureTarget = event.currentTarget;
    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    drag = { pointerId, captureTarget, lastAngle: angle };
    svg.setAttribute("data-dragging", "true");
    unitHandle.setAttribute("cursor", "grabbing");

    if (pointerId !== null && typeof captureTarget.setPointerCapture === "function") {
      try {
        captureTarget.setPointerCapture(pointerId);
      } catch {
        // Pointer capture can fail if the pointer became inactive during a callback boundary.
      }
    }

    invoke("onAngleStart", angle);
    invoke("onAngleChange", angle);
  }

  function onPointerMove(event) {
    if (!pointerMatchesDrag(event)) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const angle = eventAngle(event);
    if (angle === null) {
      return;
    }

    drag.lastAngle = angle;
    invoke("onAngleChange", angle);
  }

  function finishDrag(angle, releaseCapture) {
    if (!drag) {
      return;
    }

    const completedDrag = drag;
    drag = null;
    svg.removeAttribute("data-dragging");
    unitHandle.setAttribute("cursor", "grab");

    if (
      releaseCapture &&
      completedDrag.pointerId !== null &&
      typeof completedDrag.captureTarget.releasePointerCapture === "function"
    ) {
      try {
        completedDrag.captureTarget.releasePointerCapture(completedDrag.pointerId);
      } catch {
        // Capture may already have been released by the browser.
      }
    }

    invoke("onAngleEnd", angle);
  }

  function onPointerUp(event) {
    if (!pointerMatchesDrag(event)) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const angle = eventAngle(event) ?? drag.lastAngle;
    if (angle !== drag.lastAngle) {
      drag.lastAngle = angle;
      invoke("onAngleChange", angle);
    }
    finishDrag(angle, true);
  }

  function onPointerCancel(event) {
    if (!pointerMatchesDrag(event)) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    finishDrag(drag.lastAngle, false);
  }

  function onLostPointerCapture(event) {
    if (pointerMatchesDrag(event)) {
      finishDrag(drag.lastAngle, false);
    }
  }

  function onHandleKeyDown(event) {
    let callbackName = null;
    let callbackArgument;
    const step = event.shiftKey ? LARGE_ANGLE_STEP : SMALL_ANGLE_STEP;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        callbackName = "onAngleStep";
        callbackArgument = -step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        callbackName = "onAngleStep";
        callbackArgument = step;
        break;
      case "Home":
        callbackName = "onAngleHome";
        break;
      case " ":
      case "Space":
      case "Spacebar":
        callbackName = "onTogglePlay";
        break;
      default:
        return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    if (callbackArgument === undefined) {
      invoke(callbackName);
    } else {
      invoke(callbackName, callbackArgument);
    }
  }

  listen(hitRing, "pointerdown", onPointerDown, { passive: false });
  listen(unitHandle, "pointerdown", onPointerDown, { passive: false });
  listen(svg, "pointermove", onPointerMove, { passive: false });
  listen(svg, "pointerup", onPointerUp, { passive: false });
  listen(svg, "pointercancel", onPointerCancel, { passive: false });
  listen(hitRing, "lostpointercapture", onLostPointerCapture);
  listen(unitHandle, "lostpointercapture", onLostPointerCapture);
  listen(unitHandle, "keydown", onHandleKeyDown);
  listen(unitHandle, "focus", () => focusHalo.setAttribute("opacity", "0.55"));
  listen(unitHandle, "blur", () => focusHalo.setAttribute("opacity", "0"));

  function updateExactGuides(exactAngle, snapEnabled) {
    const activeAngle = finiteNumber(exactAngle?.angle?.value, NaN);
    const activeAnglePlain = exactAngle
      ? textOr(exactAngle.angle?.plain, formatNumber(activeAngle, 3))
      : null;

    setAttributes(exactGuides, {
      "data-snap-enabled": snapEnabled ? "true" : "false",
      "data-active-angle": activeAnglePlain,
    });

    for (const entry of exactGuideEntries) {
      const active =
        Number.isFinite(activeAngle) &&
        Math.abs(principalAngle(activeAngle - entry.angle)) < 1e-7;

      setAttributes(entry.guide, {
        class: active ? "vt-exact-guide vt-exact-guide-active" : "vt-exact-guide",
        "data-active": active ? "true" : "false",
      });
      setAttributes(entry.ray, {
        stroke: active ? COLORS.angle : COLORS.grid,
        "stroke-width": active ? 3.5 : snapEnabled ? 1.35 : 1,
        opacity: active ? 0.9 : snapEnabled ? 0.2 : 0.07,
      });
      setAttributes(entry.tick, {
        stroke: active ? COLORS.angle : COLORS.grid,
        "stroke-width": active ? 4 : snapEnabled ? 1.8 : 1.5,
        opacity: active ? 1 : snapEnabled ? 0.58 : 0.38,
      });
    }
  }

  function renderExactConstruction(exactAngle, geometry) {
    const constructionType = textOr(exactAngle?.construction?.type, "");
    const showQuadrantal = constructionType === "quadrantal";
    const showIsosceles = constructionType === "isosceles-right";
    const showHalfEquilateral = constructionType === "half-equilateral";

    setAttributes(exactConstruction, {
      class: constructionType
        ? `vt-exact-construction vt-exact-construction-${constructionType}`
        : "vt-exact-construction",
      visibility: exactAngle ? "visible" : "hidden",
      "data-construction-type": constructionType || null,
      "data-angle": exactAngle?.angle?.plain ?? null,
      "data-quadrant": exactAngle?.quadrant?.label ?? null,
    });
    exactQuadrantal.setAttribute("visibility", showQuadrantal ? "visible" : "hidden");
    exactIsosceles.setAttribute("visibility", showIsosceles ? "visible" : "hidden");
    exactHalfEquilateral.setAttribute(
      "visibility",
      showHalfEquilateral ? "visible" : "hidden",
    );
    exactUnitSideLabel.setAttribute(
      "visibility",
      showIsosceles || showHalfEquilateral ? "visible" : "hidden",
    );

    if (!exactAngle) {
      return;
    }

    const { origin, unitPoint, projectionFoot, cosine, sine } = geometry;

    if (showQuadrantal) {
      const exactCosine = finiteNumber(exactAngle.cos?.value, cosine);
      const exactSine = finiteNumber(exactAngle.sin?.value, sine);
      const zeroCoordinate =
        Math.abs(exactCosine) <= Math.abs(exactSine) ? "cos" : "sin";
      const horizontalAxis = zeroCoordinate === "sin";
      const zeroMetadata = exactAngle[zeroCoordinate];
      const zeroPlain = textOr(zeroMetadata?.plain, "0");

      setAttributes(exactQuadrantal, {
        "data-axis": exactAngle.quadrant?.axis ?? null,
        "data-zero-coordinate": zeroCoordinate,
      });
      if (horizontalAxis) {
        setLine(
          exactAxisEmphasis,
          CENTER - UNIT_RADIUS,
          CENTER,
          CENTER + UNIT_RADIUS,
          CENTER,
        );
        setLine(
          exactZeroLeader,
          unitPoint.x,
          unitPoint.y + 12,
          unitPoint.x,
          unitPoint.y + 30,
        );
        setAttributes(exactZeroLabel, {
          x: svgCoordinate(unitPoint.x),
          y: svgCoordinate(unitPoint.y + 46),
          "text-anchor": "middle",
        });
      } else {
        setLine(
          exactAxisEmphasis,
          CENTER,
          CENTER - UNIT_RADIUS,
          CENTER,
          CENTER + UNIT_RADIUS,
        );
        setLine(
          exactZeroLeader,
          unitPoint.x - 12,
          unitPoint.y,
          unitPoint.x - 30,
          unitPoint.y,
        );
        setAttributes(exactZeroLabel, {
          x: svgCoordinate(unitPoint.x - 38),
          y: svgCoordinate(unitPoint.y),
          "text-anchor": "end",
        });
      }
      setLine(exactAxisRay, origin.x, origin.y, unitPoint.x, unitPoint.y);
      exactZeroLabel.textContent = `${zeroCoordinate} θ = ${zeroPlain}`;
    }

    if (showIsosceles) {
      const horizontalMidpoint = midpoint(origin, projectionFoot);
      const verticalMidpoint = midpoint(projectionFoot, unitPoint);
      const tickHalfLength = 6;

      setLine(
        exactCosineLegTick,
        horizontalMidpoint.x,
        horizontalMidpoint.y - tickHalfLength,
        horizontalMidpoint.x,
        horizontalMidpoint.y + tickHalfLength,
      );
      setLine(
        exactSineLegTick,
        verticalMidpoint.x - tickHalfLength,
        verticalMidpoint.y,
        verticalMidpoint.x + tickHalfLength,
        verticalMidpoint.y,
      );
      setAttributes(exactCosineLegTick, {
        "data-coordinate": "cos",
        "data-magnitude": exactAngle.cos?.magnitudePlain ?? null,
      });
      setAttributes(exactSineLegTick, {
        "data-coordinate": "sin",
        "data-magnitude": exactAngle.sin?.magnitudePlain ?? null,
      });

      const unitSidePosition = outsideSegmentLabel(
        origin,
        unitPoint,
        projectionFoot,
        0.7,
        16,
      );
      setAttributes(exactUnitSideLabel, {
        x: svgCoordinate(unitSidePosition.x),
        y: svgCoordinate(unitSidePosition.y),
        "data-role": "hypotenuse",
      });
    }

    if (showHalfEquilateral) {
      const requestedShortCoordinate =
        exactAngle.construction?.shortCoordinate ?? exactAngle.construction?.shortLeg;
      const shortCoordinate =
        requestedShortCoordinate === "cos" || requestedShortCoordinate === "sin"
          ? requestedShortCoordinate
          : Math.abs(cosine) <= Math.abs(sine)
            ? "cos"
            : "sin";
      const longCoordinate = shortCoordinate === "cos" ? "sin" : "cos";
      const reflectedPoint =
        shortCoordinate === "cos"
          ? { x: 2 * CENTER - unitPoint.x, y: unitPoint.y }
          : { x: unitPoint.x, y: 2 * CENTER - unitPoint.y };
      const longAxisFoot =
        shortCoordinate === "cos"
          ? { x: CENTER, y: unitPoint.y }
          : { x: unitPoint.x, y: CENTER };
      const shortColor = shortCoordinate === "cos" ? COLORS.cosine : COLORS.sine;
      const longColor = longCoordinate === "cos" ? COLORS.cosine : COLORS.sine;
      const shortMagnitude = textOr(
        exactAngle[shortCoordinate]?.magnitudePlain,
        formatNumber(Math.abs(shortCoordinate === "cos" ? cosine : sine), 3),
      );
      const longMagnitude = textOr(
        exactAngle[longCoordinate]?.magnitudePlain,
        formatNumber(Math.abs(longCoordinate === "cos" ? cosine : sine), 3),
      );

      setAttributes(exactHalfEquilateral, {
        "data-short-coordinate": shortCoordinate,
        "data-long-coordinate": longCoordinate,
      });
      setLine(
        exactSecondUnitSide,
        origin.x,
        origin.y,
        reflectedPoint.x,
        reflectedPoint.y,
      );
      setLine(
        exactClosingSide,
        unitPoint.x,
        unitPoint.y,
        reflectedPoint.x,
        reflectedPoint.y,
      );
      setLine(exactLongLeg, origin.x, origin.y, longAxisFoot.x, longAxisFoot.y);
      setLine(exactShortLeg, longAxisFoot.x, longAxisFoot.y, unitPoint.x, unitPoint.y);
      setAttributes(exactLongLeg, {
        stroke: longColor,
        "data-coordinate": longCoordinate,
        "data-magnitude": longMagnitude,
      });
      setAttributes(exactShortLeg, {
        stroke: shortColor,
        "data-coordinate": shortCoordinate,
        "data-magnitude": shortMagnitude,
      });
      exactHalfRightAngle.setAttribute(
        "d",
        rightAnglePathAt(longAxisFoot, origin, unitPoint, 10),
      );
      setAttributes(exactReflectedPoint, {
        cx: svgCoordinate(reflectedPoint.x),
        cy: svgCoordinate(reflectedPoint.y),
        "data-reflected-across": `${longCoordinate}-axis`,
      });

      const towardShortSide = unitVector(longAxisFoot, unitPoint);
      const towardOrigin = unitVector(longAxisFoot, origin);
      const longLabelPosition = midpoint(origin, longAxisFoot);
      const shortLabelPosition = midpoint(longAxisFoot, unitPoint);
      setAttributes(exactLongMagnitudeLabel, {
        x: svgCoordinate(longLabelPosition.x + towardShortSide.x * 15),
        y: svgCoordinate(longLabelPosition.y + towardShortSide.y * 15),
        fill: longColor,
        "data-coordinate": longCoordinate,
      });
      setAttributes(exactShortMagnitudeLabel, {
        x: svgCoordinate(shortLabelPosition.x + towardOrigin.x * 15),
        y: svgCoordinate(shortLabelPosition.y + towardOrigin.y * 15),
        fill: shortColor,
        "data-coordinate": shortCoordinate,
      });
      exactLongMagnitudeLabel.textContent = longMagnitude;
      exactShortMagnitudeLabel.textContent = shortMagnitude;

      const unitSidePosition = outsideSegmentLabel(
        origin,
        unitPoint,
        longAxisFoot,
        0.7,
        16,
      );
      setAttributes(exactUnitSideLabel, {
        x: svgCoordinate(unitSidePosition.x),
        y: svgCoordinate(unitSidePosition.y),
        "data-role": "hypotenuse-full-side",
      });

      rightAngle.setAttribute("visibility", "hidden");
    }
  }

  function render(model, options = {}) {
    if (destroyed) {
      return;
    }

    const data = model && typeof model === "object" ? model : {};
    const renderOptions = options && typeof options === "object" ? options : {};
    const exactAngle =
      data.exactAngle && typeof data.exactAngle === "object" ? data.exactAngle : null;
    const snapEnabled = renderOptions.snapEnabled === true;
    const theta = finiteNumber(data.normalizedTheta, 0);
    const currentPrincipalAngle = finiteNumber(data.displayTheta, principalAngle(theta));
    const cosine = clamp(finiteNumber(data.cosTheta, Math.cos(theta)), -1, 1);
    const sine = clamp(finiteNumber(data.sinTheta, Math.sin(theta)), -1, 1);
    const radius = finiteNumber(data.radius, 1);

    const suppliedUnitX = finiteNumber(data.unitPoint?.x, cosine);
    const suppliedUnitY = finiteNumber(data.unitPoint?.y, sine);
    const suppliedUnitLength = Math.hypot(suppliedUnitX, suppliedUnitY);
    const unitX = suppliedUnitLength > 1e-9 ? suppliedUnitX / suppliedUnitLength : Math.cos(theta);
    const unitY = suppliedUnitLength > 1e-9 ? suppliedUnitY / suppliedUnitLength : Math.sin(theta);

    const suppliedPolarX = finiteNumber(data.polarPoint?.x, radius * unitX);
    const suppliedPolarY = finiteNumber(data.polarPoint?.y, radius * unitY);
    const precision = Number.isInteger(renderOptions.precision)
      ? clamp(renderOptions.precision, 0, 4)
      : 2;
    const polarEpsilon = Number.isFinite(renderOptions.polarEpsilon)
      ? Math.max(0, renderOptions.polarEpsilon)
      : DEFAULT_POLAR_EPSILON;
    const showPolarPoint = Math.abs(radius - 1) > polarEpsilon;

    updateExactGuides(exactAngle, snapEnabled);

    const unitScreenX = CENTER + unitX * UNIT_RADIUS;
    const unitScreenY = CENTER - unitY * UNIT_RADIUS;
    const projectionScreenX = CENTER + cosine * UNIT_RADIUS;
    const projectionScreenY = CENTER - sine * UNIT_RADIUS;
    const polarScreenX = CENTER + suppliedPolarX * UNIT_RADIUS;
    const polarScreenY = CENTER - suppliedPolarY * UNIT_RADIUS;

    setLine(angleRay, CENTER, CENTER, unitScreenX, unitScreenY);
    setLine(cosineSegment, CENTER, CENTER, projectionScreenX, CENTER);
    setLine(sineSegment, projectionScreenX, CENTER, projectionScreenX, projectionScreenY);
    setLine(
      horizontalProjection,
      CENTER,
      projectionScreenY,
      projectionScreenX,
      projectionScreenY,
    );
    setLine(
      verticalProjection,
      projectionScreenX,
      CENTER,
      projectionScreenX,
      projectionScreenY,
    );

    const markerSize = 12;
    if (Math.abs(cosine) > 0.09 && Math.abs(sine) > 0.09) {
      const towardOriginX = cosine < 0 ? 1 : -1;
      const towardUnitY = sine < 0 ? 1 : -1;
      rightAngle.setAttribute(
        "d",
        [
          `M ${svgCoordinate(projectionScreenX + towardOriginX * markerSize)} ${CENTER}`,
          `L ${svgCoordinate(projectionScreenX + towardOriginX * markerSize)} ${svgCoordinate(
            CENTER + towardUnitY * markerSize,
          )}`,
          `L ${svgCoordinate(projectionScreenX)} ${svgCoordinate(CENTER + towardUnitY * markerSize)}`,
        ].join(" "),
      );
      rightAngle.setAttribute("visibility", "visible");
    } else {
      rightAngle.setAttribute("visibility", "hidden");
    }

    renderExactConstruction(exactAngle, {
      origin: { x: CENTER, y: CENTER },
      unitPoint: { x: unitScreenX, y: unitScreenY },
      projectionFoot: { x: projectionScreenX, y: CENTER },
      cosine,
      sine,
    });

    const displayedArcAngle = arcAngle(theta);
    const arcPath = angleArcPath(displayedArcAngle);
    angleArc.setAttribute("d", arcPath);
    angleArc.setAttribute("visibility", arcPath ? "visible" : "hidden");

    const halfAngle =
      Math.abs(displayedArcAngle) < 0.08
        ? displayedArcAngle < 0
          ? -0.12
          : 0.12
        : displayedArcAngle / 2;
    setAttributes(angleLabel, {
      x: svgCoordinate(CENTER + (ANGLE_ARC_RADIUS + 25) * Math.cos(halfAngle)),
      y: svgCoordinate(CENTER - (ANGLE_ARC_RADIUS + 25) * Math.sin(halfAngle)),
    });

    setAttributes(cosineLabel, {
      x: svgCoordinate((CENTER + projectionScreenX) / 2),
      y: svgCoordinate(CENTER + (sine >= 0 ? 25 : -14)),
    });
    setAttributes(sineLabel, {
      x: svgCoordinate(projectionScreenX + (cosine >= 0 ? 14 : -14)),
      y: svgCoordinate((CENTER + projectionScreenY) / 2),
      "text-anchor": cosine >= 0 ? "start" : "end",
    });

    const exactCosinePlain = exactAngle
      ? textOr(exactAngle.cos?.plain, formatNumber(cosine, precision))
      : null;
    const exactSinePlain = exactAngle
      ? textOr(exactAngle.sin?.plain, formatNumber(sine, precision))
      : null;
    cosineLabel.textContent = exactAngle ? `cos θ = ${exactCosinePlain}` : "cos θ";
    sineLabel.textContent = exactAngle ? `sin θ = ${exactSinePlain}` : "sin θ";
    setAttributes(cosineLabel, {
      "data-exact-value": exactCosinePlain,
      "data-sign": exactAngle?.cos?.sign ?? null,
    });
    setAttributes(sineLabel, {
      "data-exact-value": exactSinePlain,
      "data-sign": exactAngle?.sin?.sign ?? null,
    });

    const unitLabelXOffset = unitX >= 0 ? 15 : -15;
    const unitLabelYOffset = unitY >= 0 ? -16 : 24;
    setAttributes(unitLabel, {
      x: svgCoordinate(unitScreenX + unitLabelXOffset),
      y: svgCoordinate(unitScreenY + unitLabelYOffset),
      "text-anchor": unitX >= 0 ? "start" : "end",
    });
    unitLabel.textContent = exactAngle
      ? `u = (${exactCosinePlain}, ${exactSinePlain})`
      : `u = (${formatNumber(cosine, precision)}, ${formatNumber(sine, precision)})`;

    setAttributes(unitHandle, {
      cx: svgCoordinate(unitScreenX),
      cy: svgCoordinate(unitScreenY),
    });
    setAttributes(focusHalo, {
      cx: svgCoordinate(unitScreenX),
      cy: svgCoordinate(unitScreenY),
    });

    setLine(radiusSegment, CENTER, CENTER, polarScreenX, polarScreenY);
    setAttributes(polarPoint, {
      cx: svgCoordinate(polarScreenX),
      cy: svgCoordinate(polarScreenY),
    });

    const polarDirectionX = suppliedPolarX === 0 && suppliedPolarY === 0 ? unitX : suppliedPolarX;
    const polarDirectionY = suppliedPolarX === 0 && suppliedPolarY === 0 ? unitY : suppliedPolarY;
    setAttributes(polarLabel, {
      x: svgCoordinate(polarScreenX + (polarDirectionX >= 0 ? 15 : -15)),
      y: svgCoordinate(polarScreenY + (polarDirectionY >= 0 ? -15 : 23)),
      "text-anchor": polarDirectionX >= 0 ? "start" : "end",
    });
    polarLabel.textContent = `z = (${formatNumber(suppliedPolarX, precision)}, ${formatNumber(
      suppliedPolarY,
      precision,
    )})`;

    const radiusDeltaX = polarScreenX - CENTER;
    const radiusDeltaY = polarScreenY - CENTER;
    const radiusLength = Math.hypot(radiusDeltaX, radiusDeltaY);
    const radiusNormalX = radiusLength > 1e-6 ? -radiusDeltaY / radiusLength : 1;
    const radiusNormalY = radiusLength > 1e-6 ? radiusDeltaX / radiusLength : -1;
    setAttributes(radiusLabel, {
      x: svgCoordinate((CENTER + polarScreenX) / 2 + radiusNormalX * 13),
      y: svgCoordinate((CENTER + polarScreenY) / 2 + radiusNormalY * 13),
      "text-anchor": "middle",
    });
    radiusLabel.textContent = `r = ${formatNumber(radius, precision)}`;
    polarGroup.setAttribute("visibility", showPolarPoint ? "visible" : "hidden");
    svg.setAttribute("data-polar-visible", showPolarPoint ? "true" : "false");

    const angleUnit = renderOptions.angleUnit;
    const useDegrees = angleUnit === "degrees" || angleUnit === "degree" || angleUnit === "deg";
    const radiansText = formatNumber(currentPrincipalAngle, 3, false);
    const degreesText = formatNumber((currentPrincipalAngle * 180) / Math.PI, 1, false);
    const cosineText = formatNumber(cosine, precision, false);
    const sineText = formatNumber(sine, precision, false);
    const accessibleAngle = useDegrees
      ? `${degreesText} degrees (${radiansText} radians)`
      : `${radiansText} radians (${degreesText} degrees)`;
    const exactAnglePlain = exactAngle
      ? textOr(renderOptions.angleLabel, textOr(exactAngle.angle?.plain, `${radiansText} radians`))
      : null;
    const exactConstructionTitle = exactAngle
      ? textOr(exactAngle.construction?.title, "Exact-angle")
      : null;
    const exactConstructionType = exactAngle
      ? textOr(exactAngle.construction?.type, "")
      : null;
    const accessibleCosine = exactAngle ? exactCosinePlain : cosineText;
    const accessibleSine = exactAngle ? exactSinePlain : sineText;
    const exactValueText = exactAngle
      ? `; active exact angle ${exactAnglePlain}; construction: ${exactConstructionTitle}`
      : "";

    setAttributes(unitHandle, {
      "aria-valuemin": -Math.PI,
      "aria-valuemax": Math.PI,
      "aria-valuenow": currentPrincipalAngle,
      "aria-valuetext":
        `${accessibleAngle}; cos theta ${accessibleCosine}; sin theta ${accessibleSine}` +
        exactValueText,
      "data-exact-angle": exactAnglePlain,
    });

    const polarDescription = showPolarPoint
      ? ` The polar point z is (${formatNumber(suppliedPolarX, precision, false)}, ${formatNumber(
          suppliedPolarY,
          precision,
          false,
        )}) with radius ${formatNumber(radius, precision, false)}.`
      : " The polar point z coincides with u at radius 1.";
    const exactQuadrant = exactAngle ? textOr(exactAngle.quadrant?.label, "") : "";
    const exactEquation = exactAngle
      ? textOr(exactAngle.construction?.equationPlain, "")
      : "";
    const exactExplanation = exactAngle
      ? textOr(exactAngle.construction?.explanation, "").replace(/[.!?]+$/, "")
      : "";
    const exactDescription = exactAngle
      ? ` Active exact angle ${exactAnglePlain}${exactQuadrant ? ` in ${exactQuadrant}` : ""}. ` +
        `Its exact coordinates are (${exactCosinePlain}, ${exactSinePlain}). ` +
        `Construction: ${exactConstructionTitle}` +
        `${exactEquation ? `; ${exactEquation}` : ""}` +
        `${exactExplanation ? `; ${exactExplanation}` : ""}.`
      : "";
    description.textContent =
      `Complex plane and unit circle. Angle ${accessibleAngle}. ` +
      `The unit point u is (${cosineText}, ${sineText}).${exactDescription}${polarDescription} ` +
      "Drag u around the circle; with u focused, use arrow keys, Home, or Space.";

    setAttributes(svg, {
      "data-principal-angle": formatNumber(currentPrincipalAngle, 6, false),
      "data-snap-enabled": snapEnabled ? "true" : "false",
      "data-exact-angle": exactAnglePlain,
      "data-exact-angle-degrees": exactAngle?.angle?.degrees ?? null,
      "data-exact-construction": exactConstructionType || null,
    });
    lastRenderedPrincipalAngle = currentPrincipalAngle;
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    const activeDrag = drag;
    drag = null;
    if (
      activeDrag &&
      activeDrag.pointerId !== null &&
      typeof activeDrag.captureTarget.releasePointerCapture === "function"
    ) {
      try {
        activeDrag.captureTarget.releasePointerCapture(activeDrag.pointerId);
      } catch {
        // The pointer may no longer be active.
      }
    }

    for (const removeListener of listeners.splice(0)) {
      removeListener();
    }

    if (svg.parentNode) {
      svg.parentNode.removeChild(svg);
    }
  }

  container.appendChild(svg);
  render({
    normalizedTheta: 0,
    cosTheta: 1,
    sinTheta: 0,
    radius: 1,
    unitPoint: { x: 1, y: 0 },
    polarPoint: { x: 1, y: 0 },
  });

  return { render, destroy };
}
