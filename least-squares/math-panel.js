import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs";
import { formatNumber } from "./model.js";

function renderMath(element, expression, displayMode = true) {
  katex.render(expression, element, {
    displayMode,
    throwOnError: false
  });
}

function matrix(values, highlightedRow = -1) {
  const rows = values
    .map((row, rowIndex) => row.map((value) => {
      const formatted = formatNumber(value);
      return rowIndex === highlightedRow
        ? `\\color{#315efb}{\\mathbf{${formatted}}}`
        : formatted;
    }).join(" & "))
    .join(" \\\\ ");
  return `\\begin{bmatrix}${rows}\\end{bmatrix}`;
}

function columnVector(values, highlightedRow = -1) {
  return matrix(values.map((value) => [value]), highlightedRow);
}

function vectorText(values) {
  return `(${values.map((value) => formatNumber(value)).join(", ")})`;
}

function setDistanceBar(bar, value, maximum) {
  const nonnegativeValue = Math.max(0, value);
  const width = maximum > 0 ? (nonnegativeValue / maximum) * 100 : 0;
  bar.style.width = `${Math.min(100, width)}%`;
}

function renderObservationTable(model, tableBody) {
  const document = tableBody.ownerDocument;
  const rows = document.createDocumentFragment();

  model.x.forEach((xValue, index) => {
    const row = document.createElement("tr");
    row.dataset.observationIndex = String(index);
    row.tabIndex = 0;
    const rowHeader = document.createElement("th");
    rowHeader.scope = "row";
    rowHeader.textContent = `Observation ${index + 1}`;
    row.appendChild(rowHeader);

    [xValue, model.y[index], model.yHat[index], model.residual[index]].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = formatNumber(value);
      row.appendChild(cell);
    });

    rows.appendChild(row);
  });

  tableBody.replaceChildren(rows);
}

export function renderInputsMath(model, element, highlightedObservation = null) {
  const highlightedRow = Number.isInteger(highlightedObservation)
    ? highlightedObservation
    : -1;
  renderMath(
    element,
    `X=${matrix(model.x.map((value) => [1, value]), highlightedRow)},\\qquad y=${columnVector(model.y, highlightedRow)}`
  );
}

export function renderMathPanel(model, elements) {
  const isRankDeficient = model.rank < 2;
  const zeroVector = columnVector([0, 0]);
  const betaExpression = isRankDeficient
    ? `\\hat\\beta=X^+y=${columnVector(model.beta)}`
    : `\\hat\\beta=${columnVector(model.beta)}`;

  renderInputsMath(model, elements.inputsMath);

  const reducedSpace = isRankDeficient ? "=\\operatorname{span}\\{\\mathbf 1\\}" : "";
  renderMath(
    elements.spaceMath,
    `\\mathcal C(X)=\\operatorname{span}\\{\\mathbf 1,x\\}${reducedSpace},\\qquad \\operatorname{rank}(X)=${model.rank}`
  );

  renderMath(
    elements.fitMath,
    `\\begin{aligned}
      ${betaExpression}\\\\
      \\hat y&=X\\hat\\beta=${columnVector(model.yHat)}\\\\
      r&=y-\\hat y=${columnVector(model.residual)}
    \\end{aligned}`
  );

  renderMath(
    elements.normalMath,
    `\\begin{aligned}
      X^\\top r&=${columnVector(model.xtResidual)}\\approx${zeroVector}\\\\
      X^\\top X\\hat\\beta&=X^\\top y,\\qquad
      ${matrix(model.gram)}\\hat\\beta\\approx${columnVector(model.normalRhs)}
    \\end{aligned}`
  );

  renderMath(
    elements.sumResidualCheck,
    `\\mathbf 1^\\top r=\\sum_{i=1}^{3}r_i=${formatNumber(model.xtResidual[0])}`,
    false
  );
  renderMath(
    elements.weightedResidualCheck,
    `x^\\top r=\\sum_{i=1}^{3}x_i r_i=${formatNumber(model.xtResidual[1])}`,
    false
  );

  renderMath(
    elements.perturbationMath,
    `\\begin{aligned}
      \\beta&=\\hat\\beta+h
      =${columnVector(model.beta)}+${columnVector(model.h)}
      =${columnVector(model.candidateBeta)}\\\\
      Xh&=X\\beta-\\hat y=${columnVector(model.inPlaneMovement)}
    \\end{aligned}`
  );

  renderMath(
    elements.identityMath,
    `\\begin{aligned}
      \\lVert y-X\\beta\\rVert^2
      &=\\lVert y-\\hat y\\rVert^2+\\lVert X\\beta-\\hat y\\rVert^2\\\\
      ${formatNumber(model.candidateErrorSquared)}
      &\\approx ${formatNumber(model.minimumErrorSquared)}+${formatNumber(model.extraDistanceSquared)}
    \\end{aligned}`
  );

  elements.candidateErrorValue.textContent = formatNumber(model.candidateErrorSquared);
  elements.minimumErrorValue.textContent = formatNumber(model.minimumErrorSquared);
  elements.extraDistanceValue.textContent = formatNumber(model.extraDistanceSquared);

  const distances = [
    Math.max(0, model.candidateErrorSquared),
    Math.max(0, model.minimumErrorSquared),
    Math.max(0, model.extraDistanceSquared)
  ];
  const maximumDistance = Math.max(...distances);
  setDistanceBar(elements.candidateErrorBar, distances[0], maximumDistance);
  setDistanceBar(elements.minimumErrorBar, distances[1], maximumDistance);
  setDistanceBar(elements.extraDistanceBar, distances[2], maximumDistance);

  if (isRankDeficient) {
    elements.rankNote.textContent = "Rank deficient: the least-squares fitted vector ŷ is unique, but its coefficients are not. The displayed β̂ is the minimum-norm representative; other coefficient pairs can produce the same fitted vector.";
    elements.rankBadge.textContent = `rank(X) = ${model.rank} · line`;
  } else {
    elements.rankNote.textContent = "Full column rank: the columns 1 and x are independent, so both the least-squares fitted vector ŷ and the coefficient vector β̂ are unique.";
    elements.rankBadge.textContent = `rank(X) = ${model.rank} · plane`;
  }

  elements.fitStatus.textContent = model.minimumErrorSquared === 0 ? "exact fit" : "projected";

  const modelShape = isRankDeficient ? "line" : "plane";
  elements.sceneSummary.textContent = `In observation space, the data vector y is ${vectorText(model.y)}. Its least-squares projection ŷ is ${vectorText(model.yHat)} on the model ${modelShape} C(X). The residual vector r is ${vectorText(model.residual)}, running from ŷ to y. It is orthogonal to the model space: 1 transpose r is ${formatNumber(model.xtResidual[0])}, and x transpose r is ${formatNumber(model.xtResidual[1])}. The candidate fitted vector X beta is ${vectorText(model.candidate)}, with in-model movement X h equal to ${vectorText(model.inPlaneMovement)}.`;

  renderObservationTable(model, elements.observationTableBody);
}
