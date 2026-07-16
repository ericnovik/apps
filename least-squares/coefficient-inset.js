const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX = { width: 220, height: 116, left: 29, right: 12, top: 10, bottom: 24 };
const H_MIN = -2;
const H_MAX = 2;
const H_STEP = 0.05;

let nextInsetId = 0;

function createSvgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([attribute, value]) => {
    element.setAttribute(attribute, String(value));
  });
  if (text) element.textContent = text;
  return element;
}

function formatValue(value) {
  const cleaned = Math.abs(value) < 1e-12 ? 0 : value;
  return cleaned.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundToStep(value) {
  return Math.round(value / H_STEP) * H_STEP;
}

function coefficientBound(model) {
  const reachable = [
    model.beta[0] - 2,
    model.beta[0] + 2,
    model.beta[1] - 2,
    model.beta[1] + 2,
    ...model.beta,
    ...model.candidateBeta
  ];
  return Math.max(2, Math.ceil(Math.max(...reachable.map((value) => Math.abs(value))) + 0.2));
}

export function createCoefficientInset(container, callbacks = {}) {
  if (!container) throw new TypeError("createCoefficientInset requires a container element.");

  const insetId = ++nextInsetId;
  const clipId = `coefficient-inset-clip-${insetId}`;
  const markerId = `coefficient-inset-arrow-${insetId}`;
  const shell = document.createElement("section");
  shell.className = "coefficient-inset";
  shell.setAttribute("aria-label", "Coefficient-space map");

  const heading = document.createElement("div");
  heading.className = "coefficient-inset-heading";
  const title = document.createElement("strong");
  title.textContent = "Coefficient space";
  const badge = document.createElement("span");
  badge.className = "coefficient-inset-badge";
  heading.append(title, badge);

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
    role: "group",
    "aria-label": "Coefficient plane with beta zero on the horizontal axis and beta one on the vertical axis"
  });
  const status = document.createElement("p");
  status.className = "coefficient-inset-status";
  shell.append(heading, svg, status);
  container.appendChild(shell);

  let lastModel = null;
  let showCandidate = false;
  let activePointer = false;

  function notifyHChange(nextH) {
    if (typeof callbacks.onHChange === "function") callbacks.onHChange(nextH);
  }

  function notifyInteractionEnd() {
    if (typeof callbacks.onInteractionEnd === "function") callbacks.onInteractionEnd();
  }

  function updateFromPointer(event) {
    if (!activePointer || !lastModel || !showCandidate) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    const bound = coefficientBound(lastModel);
    const innerWidth = VIEWBOX.width - VIEWBOX.left - VIEWBOX.right;
    const innerHeight = VIEWBOX.height - VIEWBOX.top - VIEWBOX.bottom;
    const beta0 = ((local.x - VIEWBOX.left) / innerWidth) * 2 * bound - bound;
    const beta1 = bound - ((local.y - VIEWBOX.top) / innerHeight) * 2 * bound;
    const nextH = [
      roundToStep(clamp(beta0 - lastModel.beta[0], H_MIN, H_MAX)),
      roundToStep(clamp(beta1 - lastModel.beta[1], H_MIN, H_MAX))
    ];

    if (nextH.some((value, index) => Math.abs(value - lastModel.h[index]) > 1e-12)) {
      notifyHChange(nextH);
    }
  }

  svg.addEventListener("pointerdown", (event) => {
    if (!showCandidate || !event.target.classList.contains("candidate-coefficient-point")) return;
    activePointer = true;
    shell.classList.add("is-dragging");
    event.preventDefault();
    updateFromPointer(event);
  });

  function handlePointerUp() {
    if (!activePointer) return;
    activePointer = false;
    shell.classList.remove("is-dragging");
    notifyInteractionEnd();
  }

  window.addEventListener("pointermove", updateFromPointer);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);

  svg.addEventListener("keydown", (event) => {
    if (!showCandidate || !event.target.classList.contains("candidate-coefficient-point") || !lastModel) return;
    const delta = event.shiftKey ? 0.25 : H_STEP;
    const nextH = [...lastModel.h];

    if (event.key === "ArrowLeft") nextH[0] -= delta;
    else if (event.key === "ArrowRight") nextH[0] += delta;
    else if (event.key === "ArrowDown") nextH[1] -= delta;
    else if (event.key === "ArrowUp") nextH[1] += delta;
    else return;

    event.preventDefault();
    nextH[0] = roundToStep(clamp(nextH[0], H_MIN, H_MAX));
    nextH[1] = roundToStep(clamp(nextH[1], H_MIN, H_MAX));
    notifyHChange(nextH);
    notifyInteractionEnd();
  });

  function render(model, options = {}) {
    const hadCandidateFocus = document.activeElement?.classList.contains("candidate-coefficient-point");
    lastModel = model;
    const step = Number.isFinite(options.step) ? options.step : 0;
    const exploringModelSpace = step === 1;
    const comparingFits = step === 4;
    const showOptimal = step >= 2;
    const showDisplacement = comparingFits;
    showCandidate = Boolean(options.showCandidate) && (exploringModelSpace || comparingFits);
    const visible = step >= 1;
    const emphasized = exploringModelSpace || comparingFits;
    shell.classList.toggle("is-visible", visible);
    shell.classList.toggle("is-emphasized", emphasized);
    shell.setAttribute("aria-hidden", String(!visible));

    badge.textContent = model.rank < 2
      ? "many β"
      : exploringModelSpace ? "β → Xβ" : comparingFits ? "β̂ + h" : "ℝ²";
    if (model.rank < 2) {
      status.textContent = exploringModelSpace
        ? "different β can map to the same Xβ"
        : "many β map to the same ŷ";
    } else if (exploringModelSpace) {
      status.textContent = "drag β · maps directly to Xβ";
    } else if (comparingFits) {
      status.textContent = "β = β̂ + h · compare fits";
    } else {
      status.textContent = "β̂ maps to the unique ŷ";
    }

    const bound = coefficientBound(model);
    const innerWidth = VIEWBOX.width - VIEWBOX.left - VIEWBOX.right;
    const innerHeight = VIEWBOX.height - VIEWBOX.top - VIEWBOX.bottom;
    const x = (value) => VIEWBOX.left + ((value + bound) / (2 * bound)) * innerWidth;
    const y = (value) => VIEWBOX.top + ((bound - value) / (2 * bound)) * innerHeight;
    const fragment = document.createDocumentFragment();

    const defs = createSvgElement("defs");
    const clipPath = createSvgElement("clipPath", { id: clipId });
    clipPath.appendChild(createSvgElement("rect", {
      x: VIEWBOX.left,
      y: VIEWBOX.top,
      width: innerWidth,
      height: innerHeight
    }));
    const marker = createSvgElement("marker", {
      id: markerId,
      markerWidth: 7,
      markerHeight: 7,
      refX: 6,
      refY: 3.5,
      orient: "auto"
    });
    marker.appendChild(createSvgElement("path", { d: "M0,0 L7,3.5 L0,7 Z", class: "coefficient-arrow-head" }));
    defs.append(clipPath, marker);
    fragment.appendChild(defs);

    fragment.appendChild(createSvgElement("rect", {
      x: VIEWBOX.left,
      y: VIEWBOX.top,
      width: innerWidth,
      height: innerHeight,
      class: "coefficient-plot-background"
    }));

    [-bound, 0, bound].forEach((tick) => {
      fragment.appendChild(createSvgElement("line", {
        x1: x(tick), y1: VIEWBOX.top, x2: x(tick), y2: VIEWBOX.top + innerHeight,
        class: tick === 0 ? "coefficient-axis" : "coefficient-grid"
      }));
      fragment.appendChild(createSvgElement("line", {
        x1: VIEWBOX.left, y1: y(tick), x2: VIEWBOX.left + innerWidth, y2: y(tick),
        class: tick === 0 ? "coefficient-axis" : "coefficient-grid"
      }));
    });

    [-bound, 0, bound].forEach((tick) => {
      fragment.appendChild(createSvgElement("text", {
        x: x(tick), y: VIEWBOX.height - 6, class: "coefficient-tick", "text-anchor": "middle"
      }, formatValue(tick)));
    });
    fragment.appendChild(createSvgElement("text", {
      x: VIEWBOX.width - 3, y: VIEWBOX.height - 6, class: "coefficient-axis-label", "text-anchor": "end"
    }, "β₀"));
    fragment.appendChild(createSvgElement("text", {
      x: VIEWBOX.left + 4, y: VIEWBOX.top + 10, class: "coefficient-axis-label"
    }, "β₁"));

    const clippedGroup = createSvgElement("g", { "clip-path": `url(#${clipId})` });
    if (model.rank < 2) {
      const constantX = model.x[0];
      const nullDirection = [-constantX, 1];
      const length = bound * 8;
      clippedGroup.appendChild(createSvgElement("line", {
        x1: x(model.beta[0] - nullDirection[0] * length),
        y1: y(model.beta[1] - nullDirection[1] * length),
        x2: x(model.beta[0] + nullDirection[0] * length),
        y2: y(model.beta[1] + nullDirection[1] * length),
        class: "equivalent-coefficient-line"
      }));
    }

    if (showDisplacement) {
      clippedGroup.appendChild(createSvgElement("line", {
        x1: x(model.beta[0]), y1: y(model.beta[1]),
        x2: x(model.candidateBeta[0]), y2: y(model.candidateBeta[1]),
        class: "coefficient-h-arrow",
        "marker-end": `url(#${markerId})`
      }));
    }
    fragment.appendChild(clippedGroup);

    if (showOptimal) {
      fragment.appendChild(createSvgElement("circle", {
        cx: x(model.beta[0]), cy: y(model.beta[1]), r: 5.5,
        class: "optimal-coefficient-point"
      }));
      fragment.appendChild(createSvgElement("text", {
        x: x(model.beta[0]) + 7, y: y(model.beta[1]) - 7,
        class: "optimal-coefficient-label"
      }, "β̂"));
    }

    if (showCandidate) {
      const candidatePoint = createSvgElement("circle", {
        cx: x(model.candidateBeta[0]), cy: y(model.candidateBeta[1]), r: 7,
        class: "candidate-coefficient-point",
        tabindex: 0,
        "aria-label": `Candidate coefficients beta zero ${formatValue(model.candidateBeta[0])}, beta one ${formatValue(model.candidateBeta[1])}. Use arrow keys to adjust.`
      });
      fragment.appendChild(candidatePoint);
      fragment.appendChild(createSvgElement("text", {
        x: x(model.candidateBeta[0]) + 8, y: y(model.candidateBeta[1]) + 13,
        class: "candidate-coefficient-label"
      }, "β"));
    }

    svg.replaceChildren(fragment);
    if (hadCandidateFocus && showCandidate) {
      svg.querySelector(".candidate-coefficient-point")?.focus({ preventScroll: true });
    }
  }

  function destroy() {
    activePointer = false;
    window.removeEventListener("pointermove", updateFromPointer);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
    shell.remove();
    lastModel = null;
  }

  return { render, destroy };
}
