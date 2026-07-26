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
const Y_TICKS = Object.freeze([-1, 0, 1]);

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
 * derivative at each endpoint. The resulting path is computed only once.
 */
function buildWavePath(kind) {
  const segmentCount = 32;
  const angleStep = TAU / segmentCount;
  const xDerivative = plotWidth / TAU;
  let angle0 = 0;
  let x0 = xForAngle(angle0);
  let y0 = yForValue(waveValue(kind, angle0));
  let path = `M ${svgNumber(x0)} ${svgNumber(y0)}`;

  for (let segment = 1; segment <= segmentCount; segment += 1) {
    const angle1 = segment * angleStep;
    const x1 = xForAngle(angle1);
    const y1 = yForValue(waveValue(kind, angle1));
    const deltaX = x1 - x0;
    const slope0 =
      (-(plotHeight / 2) * waveDerivative(kind, angle0)) / xDerivative;
    const slope1 =
      (-(plotHeight / 2) * waveDerivative(kind, angle1)) / xDerivative;
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
  });
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "100%";

  const title = createSvgElement(document, "title");
  title.textContent = `${functionName[0].toUpperCase()}${functionName.slice(1)} wave`;
  svg.appendChild(title);

  const description = createSvgElement(document, "desc");
  description.textContent =
    `One period of the ${functionName} function. ` +
    "Drag horizontally or use the arrow keys to change the angle.";
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

  function updateDynamicElements(angle, value, renderOptions) {
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
    hitArea.setAttribute(
      "aria-valuetext",
      `Angle ${displayAngle}; ${functionName} equals ${displayValue}`,
    );
  }

  function render(model, renderOptions = {}) {
    if (destroyed) {
      return;
    }

    if (!model || typeof model !== "object") {
      throw new TypeError("waveView.render requires a model object.");
    }

    const angle = Number(model.normalizedTheta);
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

    updateDynamicElements(angle, value, renderOptions);
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

  updateDynamicElements(0, initialValue, {});
  container.appendChild(svg);

  return { render, destroy };
}
