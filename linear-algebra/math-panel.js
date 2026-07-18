import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs";
import { formatNumber } from "./model.js";

function renderMath(element, expression, displayMode = true) {
  katex.render(expression, element, {
    displayMode,
    throwOnError: false,
    strict: false
  });
}

function matrix(rows) {
  if (!rows.length) return "\\varnothing";
  return `\\begin{bmatrix}${rows.map((row) => row.map((value) => formatNumber(value)).join(" & ")).join(" \\\\ ")}\\end{bmatrix}`;
}

function column(values, n = values.length) {
  return matrix(values.slice(0, n).map((value) => [value]));
}

function columnsToRows(columns, n) {
  return Array.from({ length: n }, (_, row) => columns.map((vector) => vector[row] ?? 0));
}

function vectorTuple(values, n) {
  return `(${values.slice(0, n).map((value) => formatNumber(value)).join(", ")})`;
}

function objectName(k, n) {
  if (k === 0) return "point";
  if (k === 1) return n === 1 ? "all of ℝ¹" : "line";
  if (k === 2) return n === 2 ? "all of ℝ²" : "plane";
  return "3-space";
}

function planeEquation(model) {
  if (model.n !== 3 || model.normalBasis.length !== 1) return null;
  const normal = model.normalBasis[0];
  return `${formatNumber(normal[0])}x+(${formatNumber(normal[1])})y+(${formatNumber(normal[2])})z=${formatNumber(model.constraintRhs[0])}`;
}

function eigenvalueList(model) {
  if (!model.eigen.pairs.length) return "\\text{no real eigenline}";
  return model.eigen.pairs
    .map((pair, index) => `\\lambda_{${index + 1}}=${formatNumber(pair.value)}`)
    .join(",\\quad ");
}

function activeExpression(model, chapter) {
  if (chapter === 0) {
    return `\\dim(\\mathcal F)=${model.k},\\qquad \\mathcal F\\subseteq\\mathbb R^{${model.n}}`;
  }
  if (chapter === 1) {
    const collapse = model.isDependent ? ` < ${model.requestedK}` : "";
    return `\\dim(\\mathcal C(V))=\\operatorname{rank}(V)=${model.rank}${collapse}`;
  }
  if (chapter === 2) {
    return planeEquation(model) ?? `N^\\top x=N^\\top p,\\qquad ${model.n}-${model.k}=${model.normalBasis.length}\\text{ constraints}`;
  }
  if (chapter === 3) {
    return `\\hat x=p+QQ^\\top(x-p),\\qquad \\lVert x-\\hat x\\rVert=${formatNumber(model.distance)}`;
  }
  if (chapter === 4) {
    const measure = model.n === 1 ? "length" : model.n === 2 ? "area" : "volume";
    return `\\operatorname{${measure}}(A S)=|\\det A|\\,\\operatorname{${measure}}(S),\\qquad \\det A=${formatNumber(model.determinant)}`;
  }
  if (chapter === 5) {
    return `Av=\\lambda v,\\qquad ${eigenvalueList(model)}`;
  }
  return `P=QQ^\\top,\\qquad P^2=P,\\qquad P^\\top=P,\\qquad ${eigenvalueList(model)}`;
}

function matrixExpression(model, chapter) {
  if (chapter >= 4) {
    const symbol = chapter === 6 ? "P" : "A";
    return `${symbol}=${matrix(model.transformationMatrix)},\\qquad \\det(${symbol})=${formatNumber(model.determinant)}`;
  }

  if (!model.rawGenerators.length) {
    return `V=\\varnothing,\\qquad \\operatorname{rank}(V)=0`;
  }

  return `V=${matrix(columnsToRows(model.rawGenerators, model.n))},\\qquad \\operatorname{rank}(V)=${model.rank}`;
}

function setInvariants(model, chapter, list) {
  let items;
  if (chapter <= 2) {
    items = [
      `${model.k} object dimensions + ${model.normalBasis.length} independent constraints = ${model.n} ambient dimensions`,
      `rank(V) = ${model.rank}`,
      `Largest |normal · basis| check: ${formatNumber(model.checks.basisNormalMax, 4)}`
    ];
    if (model.isDependent) items[1] = `${model.requestedK} requested directions collapse to rank ${model.rank}`;
  } else if (chapter === 3) {
    items = [
      `The projected point remains on the ${objectName(model.k, model.n)}`,
      `Distance to the target: ${formatNumber(model.distance)}`,
      `Largest residual · basis check: ${formatNumber(model.checks.projectionResidualMax, 4)}`
    ];
  } else if (chapter === 4) {
    const orientation = model.orientationSign > 0 ? "preserved" : model.orientationSign < 0 ? "reversed" : "collapsed";
    items = [
      `Signed scale factor det(A) = ${formatNumber(model.determinant)}`,
      `Orientation is ${orientation}`,
      Math.abs(model.determinant) < 1e-10 ? "Dimension has collapsed" : "The transformed cell retains full dimension"
    ];
  } else if (chapter === 5) {
    items = [
      model.eigen.message,
      model.eigen.pairs.length ? `${model.eigen.pairs.length} displayed real eigendirection${model.eigen.pairs.length === 1 ? "" : "s"}` : "No real eigendirection is displayed",
      `det(A) = ${formatNumber(model.determinant)}`
    ];
  } else {
    items = [
      `Projection eigenvalues: ${model.eigen.pairs.map((pair) => formatNumber(pair.value)).join(", ") || "none displayed"}`,
      `Idempotence check |P² − P|: ${formatNumber(model.checks.projectionIdempotenceMax, 4)}`,
      `Symmetry check |Pᵀ − P|: ${formatNumber(model.checks.projectionSymmetryMax, 4)}`
    ];
  }

  const fragment = document.createDocumentFragment();
  items.forEach((text) => {
    const item = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = "check-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";
    const copy = document.createElement("span");
    copy.textContent = text;
    item.append(mark, copy);
    fragment.appendChild(item);
  });
  list.replaceChildren(fragment);
}

export function sceneSummary(model, chapter) {
  const requested = objectName(model.requestedK, model.n);
  const actual = objectName(model.k, model.n);
  let summary = `The scene shows a ${requested} in R ${model.n}. It currently has intrinsic dimension ${model.k} and ${model.normalBasis.length} independent normal constraints.`;

  if (model.isDependent) {
    summary += ` Dependent generators have collapsed the requested ${requested} to a ${actual}.`;
  }
  if (chapter === 3 || chapter === 6) {
    summary += ` The query point ${vectorTuple(model.queryPoint, model.n)} projects to ${vectorTuple(model.projectedPoint, model.n)} at distance ${formatNumber(model.distance)}.`;
  }
  if (chapter === 4) {
    summary += ` The current transformation has determinant ${formatNumber(model.determinant)}.`;
  }
  if (chapter === 5 || chapter === 6) {
    summary += ` ${model.eigen.message}`;
  }
  summary += " Orbiting the camera changes only the view, not the geometry.";
  return summary;
}

export function renderMathPanel(model, state, elements) {
  const constraints = model.normalBasis.length;
  renderMath(elements.dimensionMath, `${model.k}+${constraints}=${model.n}`);

  if (model.rawGenerators.length) {
    renderMath(
      elements.parametricMath,
      `\\begin{aligned}\\mathcal F&=\\{p+Vc:c\\in\\mathbb R^{${model.rawGenerators.length}}\\}\\\\p&=${column(model.anchor, model.n)},\\quad V=${matrix(columnsToRows(model.rawGenerators, model.n))}\\end{aligned}`
    );
  } else {
    renderMath(elements.parametricMath, `\\mathcal F=\\{p\\},\\qquad p=${column(model.anchor, model.n)}`);
  }

  if (model.normalBasis.length) {
    renderMath(
      elements.constraintMath,
      `N^\\top x=N^\\top p,\\qquad ${matrix(model.normalBasis.map((normal) => normal.slice(0, model.n)))}x=${column(model.constraintRhs)}`
    );
  } else {
    renderMath(elements.constraintMath, `\\mathcal F=\\mathbb R^{${model.n}},\\qquad \\text{no independent constraints}`);
  }

  renderMath(elements.activeMath, activeExpression(model, state.chapter));
  renderMath(elements.matrixMath, matrixExpression(model, state.chapter));
  setInvariants(model, state.chapter, elements.invariantList);
}

export { objectName };
