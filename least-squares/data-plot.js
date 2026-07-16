import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const BASE_WIDTH = 720;
const BASE_HEIGHT = 250;
const MARGIN = { top: 16, right: 30, bottom: 40, left: 58 };
const Y_MIN = -4;
const Y_MAX = 4;
const Y_STEP = 0.05;

const COLORS = {
  ink: "#172033",
  blue: "#315EFB",
  green: "#159A7D",
  coral: "#E76551",
  amber: "#D89524",
  slate: "#687386",
  grid: "#DDE2E5",
  paper: "#FBFAF7"
};

let nextPlotId = 0;

function clampAndRoundY(value) {
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, value));
  return Number((Math.round(clamped / Y_STEP) * Y_STEP).toFixed(2));
}

function formatValue(value) {
  const cleaned = Math.abs(value) < 1e-12 ? 0 : value;
  return cleaned.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function fittedEquation(beta) {
  const intercept = formatValue(beta[0]).replace("-", "−");
  const slope = Math.abs(beta[1]) < 1e-12 ? 0 : beta[1];
  const slopeSign = slope < 0 ? "−" : "+";
  return `ŷ = ${intercept} ${slopeSign} ${formatValue(Math.abs(slope))}x`;
}

function xDomain(values) {
  const [minimum, maximum] = d3.extent(values);
  const span = maximum - minimum;

  if (!Number.isFinite(span) || span < 1e-9) {
    const center = Number.isFinite(minimum) ? minimum : 0;
    return [center - 2, center + 2];
  }

  const padding = Math.max(0.6, span * 0.3);
  return [minimum - padding, maximum + padding];
}

export function createDataPlot(container, callbacks) {
  const containerElement = typeof container === "string"
    ? document.querySelector(container)
    : container;

  if (!containerElement) {
    throw new TypeError("createDataPlot requires a valid container element.");
  }
  if (!callbacks || typeof callbacks.onYChange !== "function") {
    throw new TypeError("createDataPlot requires an onYChange(index, value) callback.");
  }

  const plotId = ++nextPlotId;
  const titleId = `least-squares-data-plot-title-${plotId}`;
  const descriptionId = `least-squares-data-plot-description-${plotId}`;
  const clipId = `least-squares-data-plot-clip-${plotId}`;
  let width = BASE_WIDTH;
  let height = BASE_HEIGHT;
  let innerWidth = width - MARGIN.left - MARGIN.right;
  let innerHeight = height - MARGIN.top - MARGIN.bottom;

  const svg = d3.select(containerElement)
    .append("svg")
    .attr("class", "least-squares-data-plot")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("width", "100%")
    .attr("role", "group")
    .attr("aria-labelledby", `${titleId} ${descriptionId}`)
    .style("display", "block")
    .style("width", "100%")
    .style("height", "auto")
    .style("font-family", '"DM Sans", system-ui, sans-serif');

  svg.append("title")
    .attr("id", titleId)
    .text("Interactive least-squares data plot");

  const description = svg.append("desc")
    .attr("id", descriptionId);

  const clipRect = svg.append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight);

  const plot = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const plotBackground = plot.append("rect")
    .attr("class", "plot-background")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .attr("stroke", COLORS.grid)
    .attr("stroke-width", 1);

  const xGrid = plot.append("g")
    .attr("class", "grid grid-x")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(0,${innerHeight})`);

  const yGrid = plot.append("g")
    .attr("class", "grid grid-y")
    .attr("aria-hidden", "true");

  const xAxis = plot.append("g")
    .attr("class", "axis axis-x")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(0,${innerHeight})`);

  const yAxis = plot.append("g")
    .attr("class", "axis axis-y")
    .attr("aria-hidden", "true");

  const xZeroAxis = plot.append("line")
    .attr("class", "x-zero-axis")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("stroke", COLORS.slate)
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.85)
    .attr("vector-effect", "non-scaling-stroke")
    .attr("aria-hidden", "true");

  const xAxisLabel = plot.append("text")
    .attr("class", "axis-label axis-label-x")
    .attr("x", innerWidth)
    .attr("y", innerHeight + 34)
    .attr("text-anchor", "end")
    .attr("fill", COLORS.slate)
    .attr("font-size", 13)
    .attr("font-weight", 600)
    .text("x");

  const yAxisLabel = plot.append("text")
    .attr("class", "axis-label axis-label-y")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -43)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.slate)
    .attr("font-size", 13)
    .attr("font-weight", 600)
    .text("response y");

  const clippedLayer = plot.append("g")
    .attr("clip-path", `url(#${clipId})`);

  const alternativeLayer = clippedLayer.append("g")
    .attr("class", "rank-deficient-alternatives")
    .attr("aria-hidden", "true");

  const candidateLine = clippedLayer.append("path")
    .attr("class", "candidate-line")
    .attr("fill", "none")
    .attr("stroke", COLORS.amber)
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "10 7")
    .attr("stroke-linecap", "round")
    .attr("vector-effect", "non-scaling-stroke")
    .attr("aria-hidden", "true");

  const residualLayer = clippedLayer.append("g")
    .attr("class", "residual-segments")
    .attr("aria-hidden", "true");

  const fitLine = clippedLayer.append("path")
    .attr("class", "least-squares-line")
    .attr("fill", "none")
    .attr("stroke", COLORS.green)
    .attr("stroke-width", 4)
    .attr("stroke-linecap", "round")
    .attr("vector-effect", "non-scaling-stroke")
    .attr("aria-hidden", "true");

  const fittedPointLayer = clippedLayer.append("g")
    .attr("class", "fitted-points")
    .attr("aria-hidden", "true");

  const lineLabel = plot.append("text")
    .attr("class", "least-squares-line-label")
    .attr("fill", COLORS.green)
    .attr("stroke", COLORS.paper)
    .attr("stroke-width", 5)
    .attr("stroke-linejoin", "round")
    .attr("font-family", '"Newsreader", Georgia, serif')
    .attr("font-size", 14)
    .attr("font-style", "italic")
    .attr("font-weight", 600)
    .attr("pointer-events", "none")
    .style("paint-order", "stroke");

  const observedPointLayer = plot.append("g")
    .attr("class", "observed-points");

  const xScale = d3.scaleLinear().range([0, innerWidth]);
  const yScale = d3.scaleLinear().domain([Y_MIN, Y_MAX]).range([innerHeight, 0]);
  const lineGenerator = d3.line()
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.y));

  let interactiveY = [];
  let highlightedObservation = null;
  let destroyed = false;
  let lastModel = null;
  let lastOptions = {};
  let resizeFrame = 0;

  function updateDimensions() {
    const desktopLayout = window.matchMedia("(min-width: 1081px)").matches;
    const styles = window.getComputedStyle(containerElement);
    const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
    const nextWidth = desktopLayout
      ? Math.max(320, Math.round(containerElement.clientWidth - horizontalPadding))
      : BASE_WIDTH;
    const nextHeight = desktopLayout
      ? Math.max(180, containerElement.clientHeight)
      : BASE_HEIGHT;

    if (nextWidth === width && nextHeight === height) {
      return;
    }

    width = nextWidth;
    height = nextHeight;
    innerWidth = width - MARGIN.left - MARGIN.right;
    innerHeight = height - MARGIN.top - MARGIN.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    clipRect
      .attr("width", innerWidth)
      .attr("height", innerHeight);
    plotBackground
      .attr("width", innerWidth)
      .attr("height", innerHeight);
    xGrid.attr("transform", `translate(0,${innerHeight})`);
    xAxis.attr("transform", `translate(0,${innerHeight})`);
    xZeroAxis.attr("x2", innerWidth);
    xAxisLabel
      .attr("x", innerWidth)
      .attr("y", innerHeight + 34);
    yAxisLabel.attr("x", -innerHeight / 2);
    xScale.range([0, innerWidth]);
    yScale.range([innerHeight, 0]);
  }

  function linePath(beta) {
    const domain = xScale.domain();
    return lineGenerator([
      { x: domain[0], y: beta[0] + beta[1] * domain[0] },
      { x: domain[1], y: beta[0] + beta[1] * domain[1] }
    ]);
  }

  function updatePointImmediately(index, value) {
    observedPointLayer.selectAll("g.observed-point")
      .filter((point) => point.index === index)
      .attr("transform", (point) => `translate(${xScale(point.x)},${yScale(value)})`)
      .attr("aria-valuenow", value)
      .attr("aria-valuetext", formatValue(value))
      .attr("aria-label", (point) => `Observation ${point.index + 1}: x ${formatValue(point.x)}, y ${formatValue(value)}`)
      .select("title")
      .text(`Observation ${index + 1}, y = ${formatValue(value)}. Drag vertically or use the arrow keys.`);
  }

  function changeY(index, rawValue) {
    const value = clampAndRoundY(rawValue);
    if (value === interactiveY[index]) {
      return false;
    }

    interactiveY[index] = value;
    updatePointImmediately(index, value);
    callbacks.onYChange(index, value);
    return true;
  }

  function finishInteraction() {
    if (typeof callbacks.onInteractionEnd === "function") {
      callbacks.onInteractionEnd();
    }
  }

  function highlightObservation(index) {
    highlightedObservation = Number.isInteger(index) && index >= 0 && index < 3
      ? index
      : null;
    observedPointLayer.selectAll("g.observed-point")
      .classed("is-observation-highlighted", (point) => point.index === highlightedObservation);
  }

  function notifyObservationHighlight(index) {
    highlightObservation(index);
    if (typeof callbacks.onObservationHighlight === "function") {
      callbacks.onObservationHighlight(highlightedObservation);
    }
  }

  const dragBehavior = d3.drag()
    .container(() => plot.node())
    .subject((event, point) => ({
      x: xScale(point.x),
      y: yScale(interactiveY[point.index] ?? point.y)
    }))
    .clickDistance(2)
    .on("start", function (event, point) {
      if (typeof this.focus === "function") {
        this.focus({ preventScroll: true });
      }
      notifyObservationHighlight(point.index);
      d3.select(this)
        .classed("is-dragging", true)
        .select(".point-focus-ring")
        .attr("opacity", 1);
    })
    .on("drag", (event, point) => {
      changeY(point.index, yScale.invert(event.y));
    })
    .on("end", function () {
      const focused = this === document.activeElement;
      const hovered = this.matches(":hover");
      d3.select(this)
        .classed("is-dragging", false)
        .select(".point-focus-ring")
        .attr("opacity", focused ? 1 : 0);
      if (!focused && !hovered) notifyObservationHighlight(null);
      finishInteraction();
    });

  function handleKeyDown(event, point) {
    const currentValue = interactiveY[point.index] ?? point.y;
    let nextValue;

    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        nextValue = currentValue + Y_STEP;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nextValue = currentValue - Y_STEP;
        break;
      case "Home":
        nextValue = Y_MIN;
        break;
      case "End":
        nextValue = Y_MAX;
        break;
      default:
        return;
    }

    event.preventDefault();
    changeY(point.index, nextValue);
    finishInteraction();
  }

  function styleGrid(grid) {
    grid.select(".domain").remove();
    grid.selectAll(".tick line")
      .attr("stroke", COLORS.grid)
      .attr("stroke-opacity", 0.78)
      .attr("vector-effect", "non-scaling-stroke");
  }

  function styleAxis(axis) {
    axis.select(".domain")
      .attr("stroke", COLORS.slate)
      .attr("stroke-opacity", 0.7)
      .attr("vector-effect", "non-scaling-stroke");
    axis.selectAll(".tick line")
      .attr("stroke", COLORS.slate)
      .attr("stroke-opacity", 0.55)
      .attr("vector-effect", "non-scaling-stroke");
    axis.selectAll(".tick text")
      .attr("fill", COLORS.slate)
      .attr("font-size", 11);
  }

  function setLineLabelPosition(model) {
    const equation = fittedEquation(model.beta);

    if (model.isRankDeficient) {
      const observedX = d3.mean(model.x);
      const fittedY = model.beta[0] + model.beta[1] * observedX;
      const placeBelow = fittedY > 3.25;

      lineLabel
        .attr("x", xScale(observedX) + 14)
        .attr("y", yScale(fittedY) + (placeBelow ? 20 : -12))
        .attr("text-anchor", "start")
        .text(equation);
      return;
    }

    const domain = xScale.domain();
    const span = domain[1] - domain[0];
    let labelX = domain[1] - span * 0.04;
    let labelY = model.beta[0] + model.beta[1] * labelX;

    for (let step = 4; step <= 96 && (labelY < -3.65 || labelY > 3.65); step += 4) {
      labelX = domain[1] - span * (step / 100);
      labelY = model.beta[0] + model.beta[1] * labelX;
    }

    labelY = Math.max(-3.65, Math.min(3.65, labelY));
    lineLabel
      .attr("x", xScale(labelX) - 8)
      .attr("y", yScale(labelY) - 9)
      .attr("text-anchor", "end")
      .text(equation);
  }

  function render(model, options = {}) {
    if (destroyed) {
      return;
    }

    lastModel = model;
    lastOptions = { ...options };
    updateDimensions();
    interactiveY = model.y.map(clampAndRoundY);
    xScale.domain(xDomain(model.x));
    xZeroAxis
      .attr("y1", yScale(0))
      .attr("y2", yScale(0));

    const observations = model.x.map((x, index) => ({
      index,
      x,
      y: model.y[index],
      yHat: model.yHat[index],
      residual: model.residual[index]
    }));

    const showCandidate = Boolean(options.showCandidate);
    const rankDescription = model.isRankDeficient
      ? " Because the design is rank deficient, two faint alternative lines meet the minimum-norm line at the observed x value but differ away from it."
      : "";
    const candidateDescription = showCandidate ? " A dashed amber candidate line is also shown." : "";
    description.text(`Three draggable observations, their green least-squares line ${fittedEquation(model.beta)}, small fitted points, and coral vertical residuals.${candidateDescription}${rankDescription} Focus an observation and use the arrow keys to change its y value.`);

    xGrid.call(
      d3.axisBottom(xScale)
        .ticks(7)
        .tickSize(-innerHeight)
        .tickFormat("")
    );
    yGrid.call(
      d3.axisLeft(yScale)
        .tickValues([-4, -2, 0, 2, 4])
        .tickSize(-innerWidth)
        .tickFormat("")
    );
    styleGrid(xGrid);
    styleGrid(yGrid);

    xAxis.call(
      d3.axisBottom(xScale)
        .ticks(7)
        .tickSize(5)
        .tickPadding(8)
        .tickFormat(d3.format("~g"))
    );
    yAxis.call(
      d3.axisLeft(yScale)
        .tickValues([-4, -2, 0, 2, 4])
        .tickSize(5)
        .tickPadding(8)
    );
    styleAxis(xAxis);
    styleAxis(yAxis);

    const alternativeBetas = model.isRankDeficient
      ? [-1.1, 1.1].map((slopeOffset) => {
        const observedX = d3.mean(model.x);
        return [
          model.beta[0] - observedX * slopeOffset,
          model.beta[1] + slopeOffset
        ];
      })
      : [];

    alternativeLayer.selectAll("path.rank-alternative-line")
      .data(alternativeBetas)
      .join(
        (enter) => enter.append("path")
          .attr("class", "rank-alternative-line")
          .attr("fill", "none")
          .attr("stroke", COLORS.green)
          .attr("stroke-width", 2.25)
          .attr("stroke-linecap", "round")
          .attr("vector-effect", "non-scaling-stroke"),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("d", linePath)
      .attr("stroke-dasharray", (beta, index) => index === 0 ? "3 6" : "9 7")
      .attr("stroke-opacity", 0.3);

    candidateLine
      .attr("d", linePath(model.candidateBeta))
      .attr("display", showCandidate ? null : "none");

    residualLayer.selectAll("line.residual-segment")
      .data(observations, (point) => point.index)
      .join("line")
      .attr("class", "residual-segment")
      .attr("x1", (point) => xScale(point.x))
      .attr("x2", (point) => xScale(point.x))
      .attr("y1", (point) => yScale(point.y))
      .attr("y2", (point) => yScale(point.yHat))
      .attr("stroke", COLORS.coral)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("vector-effect", "non-scaling-stroke");

    fitLine.attr("d", linePath(model.beta));

    fittedPointLayer.selectAll("circle.fitted-point")
      .data(observations, (point) => point.index)
      .join("circle")
      .attr("class", "fitted-point")
      .attr("cx", (point) => xScale(point.x))
      .attr("cy", (point) => yScale(point.yHat))
      .attr("r", 4.5)
      .attr("fill", COLORS.paper)
      .attr("stroke", COLORS.green)
      .attr("stroke-width", 2.5)
      .attr("vector-effect", "non-scaling-stroke");

    setLineLabelPosition(model);

    const observedPoints = observedPointLayer.selectAll("g.observed-point")
      .data(observations, (point) => point.index)
      .join(
        (enter) => {
          const point = enter.append("g")
            .attr("class", "observed-point")
            .attr("role", "slider")
            .attr("tabindex", 0)
            .attr("focusable", "true")
            .attr("aria-orientation", "vertical")
            .attr("aria-valuemin", Y_MIN)
            .attr("aria-valuemax", Y_MAX)
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight Home End")
            .style("cursor", "ns-resize")
            .style("touch-action", "none");

          point.append("title");
          point.append("circle")
            .attr("class", "point-focus-ring")
            .attr("r", 16)
            .attr("fill", "none")
            .attr("stroke", COLORS.blue)
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "3 3")
            .attr("opacity", 0)
            .attr("pointer-events", "none")
            .attr("vector-effect", "non-scaling-stroke");
          point.append("circle")
            .attr("class", "observed-point-marker")
            .attr("r", 11.5)
            .attr("fill", COLORS.blue)
            .attr("stroke", COLORS.paper)
            .attr("stroke-width", 3)
            .attr("vector-effect", "non-scaling-stroke");
          point.append("text")
            .attr("class", "observed-point-label")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", "#FFFFFF")
            .attr("font-size", 11)
            .attr("font-weight", 700)
            .attr("pointer-events", "none");
          return point;
        },
        (update) => update,
        (exit) => exit.remove()
      );

    observedPoints
      .attr("transform", (point) => `translate(${xScale(point.x)},${yScale(point.y)})`)
      .attr("aria-valuenow", (point) => clampAndRoundY(point.y))
      .attr("aria-valuetext", (point) => formatValue(clampAndRoundY(point.y)))
      .attr("aria-label", (point) => `Observation ${point.index + 1}: x ${formatValue(point.x)}, y ${formatValue(point.y)}`)
      .on("keydown.dataPlot", handleKeyDown)
      .on("pointerenter.dataPlot", (event, point) => {
        notifyObservationHighlight(point.index);
      })
      .on("pointerleave.dataPlot", function () {
        if (this !== document.activeElement) notifyObservationHighlight(null);
      })
      .on("focus.dataPlot", function (event, point) {
        d3.select(this).select(".point-focus-ring").attr("opacity", 1);
        notifyObservationHighlight(point.index);
      })
      .on("blur.dataPlot", function () {
        d3.select(this).select(".point-focus-ring").attr("opacity", 0);
        if (!this.matches(":hover")) notifyObservationHighlight(null);
      })
      .call(dragBehavior);

    highlightObservation(highlightedObservation);

    observedPoints.select("title")
      .text((point) => `Observation ${point.index + 1}, y = ${formatValue(point.y)}. Drag vertically or use the arrow keys.`);

    observedPoints.select(".observed-point-label")
      .text((point) => point.index + 1);
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    resizeObserver?.disconnect();
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame);
    }
    observedPointLayer.selectAll("g.observed-point")
      .on(".drag", null)
      .on(".dataPlot", null);
    svg.remove();
    interactiveY = [];
    lastModel = null;
  }

  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => {
      if (destroyed || !lastModel) {
        return;
      }
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        render(lastModel, lastOptions);
      });
    });
  resizeObserver?.observe(containerElement);

  return { render, highlightObservation, destroy };
}
