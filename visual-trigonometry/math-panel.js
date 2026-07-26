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

function greatestCommonDivisor(first, second) {
  let a = Math.abs(first);
  let b = Math.abs(second);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function piNotation(degrees) {
  if (degrees === 0) return { plain: "0", tex: "0" };

  const rawNumerator = Math.round(degrees / 15);
  const divisor = greatestCommonDivisor(rawNumerator, 12);
  const numerator = rawNumerator / divisor;
  const denominator = 12 / divisor;
  const sign = numerator < 0 ? "-" : "";
  const magnitude = Math.abs(numerator);
  const coefficient = magnitude === 1 ? "" : String(magnitude);

  if (denominator === 1) {
    return {
      plain: `${sign}${coefficient}π`,
      tex: `${sign}${coefficient}\\pi`
    };
  }

  return {
    plain: `${sign}${coefficient}π/${denominator}`,
    tex: `${sign}\\frac{${coefficient}\\pi}{${denominator}}`
  };
}

function exactDisplayDegrees(model) {
  if (model.plotTheta === 2 * Math.PI) return 360;

  let degrees = model.exactAngle.angle.degrees;
  if (degrees > 180) degrees -= 360;
  if (degrees === 180 && model.displayTheta < 0) degrees = -180;
  return degrees;
}

function angleParts(model, angleUnit) {
  const exactAngle = model.exactAngle;
  const exactDegrees = exactAngle ? exactDisplayDegrees(model) : null;

  if (angleUnit === "degrees") {
    const value = exactAngle
      ? exactDegrees
      : model.displayTheta * 180 / Math.PI;
    return {
      plain: `${formatNumber(value, exactAngle ? 0 : 1)}°`,
      math: `${formatNumber(value, exactAngle ? 0 : 1)}^{\\circ}`,
      input: value,
      shortUnit: "degrees",
      exact: Boolean(exactAngle)
    };
  }

  if (exactAngle) {
    const notation = piNotation(exactDegrees);
    return {
      plain: notation.plain,
      math: notation.tex,
      input: model.displayTheta,
      shortUnit: "radians",
      exact: true
    };
  }

  return {
    plain: `${formatNumber(model.displayTheta, 3)} rad`,
    math: `${formatNumber(model.displayTheta, 3)}\\,\\mathrm{rad}`,
    input: model.displayTheta,
    shortUnit: "radians",
    exact: false
  };
}

function signLabel(sign) {
  if (sign < 0) return "−";
  if (sign > 0) return "+";
  return "0";
}

function identityBadge(identity) {
  if (identity.mode === "addition") return "α + β";
  if (identity.mode === "powers") return `n = ${identity.parameters.power}`;
  if (identity.mode === "conjugate") return "θ ↔ −θ";
  if (identity.mode === "quarter-turn") return "+π/2";
  if (identity.mode === "norm") return "|u| = 1";
  return "foundation";
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
  const exactAngle = model.exactAngle;
  const identity = model.identity;

  renderMath(elements.polarMath, `(r,\\theta)=(${r},${angle.math})`);
  renderMath(elements.cartesianMath, `(x,y)=(${x},${y})`);
  renderMath(elements.complexMath, `z=${complexExpression}`);
  renderMath(elements.exponentialMath, `z=${r}e^{i(${angle.math})}`);

  elements.identityPanel.dataset.identityMode = identity.mode;
  elements.identityTitle.textContent = identity.title;
  elements.identityBadge.textContent = identityBadge(identity);
  elements.identityGeometryText.textContent = identity.geometryText;
  renderMath(elements.identityComplexMath, identity.complexTex);
  renderMath(elements.identityTrigMath, identity.trigTex);
  const hasDetail = Boolean(identity.detailTex);
  elements.identityAlgebra.hidden = !hasDetail;
  if (!hasDetail) elements.identityAlgebra.open = false;
  if (hasDetail) renderMath(elements.identityDetailMath, identity.detailTex);
  elements.identitySummary.textContent =
    "The geometry, complex form, and trigonometric result use the same shared point.";

  elements.thetaReadout.textContent = angle.plain;
  if (exactAngle) {
    renderMath(elements.cosReadout, exactAngle.cos.tex);
    renderMath(elements.sinReadout, exactAngle.sin.tex);
    elements.cosReadout.title = `Approximately ${cosine}`;
    elements.sinReadout.title = `Approximately ${sine}`;
  } else {
    elements.cosReadout.textContent = cosine;
    elements.sinReadout.textContent = sine;
    elements.cosReadout.removeAttribute("title");
    elements.sinReadout.removeAttribute("title");
  }
  elements.cosReadout.closest(".readout").classList.toggle("is-exact", Boolean(exactAngle));
  elements.sinReadout.closest(".readout").classList.toggle("is-exact", Boolean(exactAngle));
  elements.revolutionReadout.textContent = String(model.revolutions);

  elements.exactDerivation.hidden = !exactAngle;
  if (exactAngle) {
    const construction = exactAngle.construction;
    elements.exactDerivation.dataset.exact = "true";
    elements.exactConstructionTitle.textContent = construction.title;
    elements.exactQuadrantBadge.textContent = `${exactAngle.quadrant.label} · signs (${signLabel(exactAngle.cos.sign)}, ${signLabel(exactAngle.sin.sign)})`;
    renderMath(elements.exactEquationMath, construction.equationTex);
    renderMath(
      elements.exactValuesMath,
      `\\cos\\theta=${exactAngle.cos.tex}\\quad\\sin\\theta=${exactAngle.sin.tex}`
    );
    elements.exactApproximation.textContent = `≈ (${cosine}, ${sine})`;
    elements.exactConstructionExplanation.textContent = construction.explanation;
  }

  const exactSummary = exactAngle
    ? ` This is the exact angle ${angle.plain} in ${exactAngle.quadrant.label}; cosine is ${exactAngle.cos.plain} and sine is ${exactAngle.sin.plain}. ${exactAngle.construction.explanation}`
    : " This is an arbitrary angle, so its trigonometric coordinates are shown as rounded decimals.";
  elements.circleSummary.textContent = `At angle ${angle.plain}, the unit point u has horizontal coordinate cosine ${exactAngle?.cos.plain ?? cosine} and vertical coordinate sine ${exactAngle?.sin.plain ?? sine}. The polar point z has radius ${r} and Cartesian coordinates ${x}, ${y}. Active identity: ${identity.geometryText}.${exactSummary}`;
  elements.cosineSummary.textContent = `The cosine graph marks angle ${angle.plain} at value ${exactAngle?.cos.plain ?? cosine}, matching the horizontal coordinate of the unit-circle point. Active identity lens: ${identity.title}.`;
  elements.sineSummary.textContent = `The sine graph marks angle ${angle.plain} at value ${exactAngle?.sin.plain ?? sine}, matching the vertical coordinate of the unit-circle point. Active identity lens: ${identity.title}.`;
  elements.valuesTableBody.replaceChildren(replaceTableRow(model, angle));

  return angle;
}
