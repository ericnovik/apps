import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs";
import { formatNumber } from "./model.js";

function renderMath(element, expression) {
  katex.render(expression, element, {
    displayMode: false,
    throwOnError: false,
    strict: false
  });
}

function signedImaginary(value, digits = 3) {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatNumber(Math.abs(value), digits)}i`;
}

function angleParts(model, angleUnit) {
  if (angleUnit === "degrees") {
    const value = model.principalTheta * 180 / Math.PI;
    return {
      plain: `${formatNumber(value, 1)}°`,
      math: `${formatNumber(value, 1)}^{\\circ}`,
      input: value,
      shortUnit: "degrees"
    };
  }

  return {
    plain: `${formatNumber(model.principalTheta, 3)} rad`,
    math: `${formatNumber(model.principalTheta, 3)}\\,\\mathrm{rad}`,
    input: model.principalTheta,
    shortUnit: "radians"
  };
}

function replaceTableRow(model, angle) {
  const document = window.document;
  const row = document.createElement("tr");
  const angleHeader = document.createElement("th");
  angleHeader.scope = "row";
  angleHeader.textContent = angle.plain;
  row.appendChild(angleHeader);

  const complexText = `${formatNumber(model.complex.real, 3)} ${model.complex.imaginary < 0 ? "−" : "+"} ${formatNumber(Math.abs(model.complex.imaginary), 3)}i`;
  [
    formatNumber(model.radius, 3),
    formatNumber(model.cosTheta, 3),
    formatNumber(model.sinTheta, 3),
    formatNumber(model.polarPoint.x, 3),
    formatNumber(model.polarPoint.y, 3),
    complexText
  ].forEach((text) => {
    const cell = document.createElement("td");
    cell.textContent = text;
    row.appendChild(cell);
  });

  return row;
}

export function formatAngleLabel(model, angleUnit) {
  return angleParts(model, angleUnit).plain;
}

export function renderMathPanel(model, state, elements) {
  const angle = angleParts(model, state.angleUnit);
  const r = formatNumber(model.radius, 3);
  const x = formatNumber(model.polarPoint.x, 3);
  const y = formatNumber(model.polarPoint.y, 3);
  const cosine = formatNumber(model.cosTheta, 3);
  const sine = formatNumber(model.sinTheta, 3);
  const complexExpression = `${x}${signedImaginary(model.polarPoint.y)}`;

  renderMath(elements.polarMath, `(r,\\theta)=(${r},${angle.math})`);
  renderMath(elements.cartesianMath, `(x,y)=(${x},${y})`);
  renderMath(elements.complexMath, `z=${complexExpression}`);
  renderMath(elements.exponentialMath, `z=${r}e^{i(${angle.math})}`);
  renderMath(
    elements.eulerMath,
    `e^{i\\theta}=\\cos\\theta+i\\sin\\theta=${cosine}${signedImaginary(model.sinTheta)}`
  );

  elements.thetaReadout.textContent = angle.plain;
  elements.cosReadout.textContent = cosine;
  elements.sinReadout.textContent = sine;
  elements.revolutionReadout.textContent = String(model.revolutions);

  elements.circleSummary.textContent = `At angle ${angle.plain}, the unit point u has horizontal coordinate cosine ${cosine} and vertical coordinate sine ${sine}. The polar point z has radius ${r} and Cartesian coordinates ${x}, ${y}.`;
  elements.cosineSummary.textContent = `The cosine graph marks angle ${angle.plain} at value ${cosine}, matching the horizontal coordinate of the unit-circle point.`;
  elements.sineSummary.textContent = `The sine graph marks angle ${angle.plain} at value ${sine}, matching the vertical coordinate of the unit-circle point.`;
  elements.valuesTableBody.replaceChildren(replaceTableRow(model, angle));

  return angle;
}
