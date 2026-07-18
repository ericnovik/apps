export const LESSON_STEPS = [
  {
    title: "The same object can live in more room",
    copy: "Dimension belongs to the object. Coordinates tell us how much ambient space surrounds it.",
    insight: "A line stays one-dimensional even when each point needs three coordinates."
  },
  {
    title: "Build a flat from directions",
    copy: "An anchor chooses where the object sits. Each independent direction adds one degree of freedom.",
    insight: "Move dependence to 1. Two arrows remain, but their span collapses because they point along the same line."
  },
  {
    title: "Cut space with equations",
    copy: "A scalar equation removes one degree of freedom. Its coefficients form a normal vector.",
    insight: "In ℝ³, ax + by + cz = d leaves two freedoms, so its solutions form a plane."
  },
  {
    title: "Drop a perpendicular",
    copy: "Projection keeps the component inside a flat and removes the component normal to it.",
    insight: "The projected point is the same whether the target is described by directions or constraints."
  },
  {
    title: "Measure area, volume, and collapse",
    copy: "A determinant is the signed scale factor for length, area, or volume under a linear transformation.",
    insight: "Choose Dimension collapse. Determinant zero is visible as lost dimension, not just a failed inverse."
  },
  {
    title: "Find directions that do not turn",
    copy: "Most vectors change direction under a matrix. An eigenvector remains on its own line.",
    insight: "Try the quarter turn: a real plane rotation can have no real eigenline."
  },
  {
    title: "Projection is a transformation",
    copy: "Projection unifies spans, constraints, orthogonality, determinants, rank, and eigenvectors.",
    insight: "Directions in the target have eigenvalue 1; normal directions have eigenvalue 0, so volume collapses."
  }
];

export function updateLessonUI(chapter, elements) {
  const bounded = Math.max(0, Math.min(LESSON_STEPS.length - 1, chapter));
  const step = LESSON_STEPS[bounded];

  elements.stepCounter.textContent = `Chapter ${bounded + 1} of ${LESSON_STEPS.length}`;
  elements.stepTitle.textContent = step.title;
  elements.stepCopy.textContent = step.copy;
  elements.stepInsightText.textContent = step.insight;
  elements.previousStep.disabled = bounded === 0;
  elements.nextStep.disabled = bounded === LESSON_STEPS.length - 1;
  elements.nextStep.innerHTML = bounded === LESSON_STEPS.length - 1
    ? "Sequence complete"
    : "Next idea <span aria-hidden=\"true\">→</span>";

  elements.lessonTabs.forEach((tab, index) => {
    const active = index === bounded;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-current", active ? "step" : "false");
  });

  elements.activeChip.textContent = `chapter ${bounded + 1}`;
  document.body.dataset.chapter = String(bounded);
}
