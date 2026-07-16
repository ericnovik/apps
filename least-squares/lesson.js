export const LESSON_STEPS = [
  {
    title: "Three observations become one vector",
    copy: "The three vertical measurements are the coordinates of one point in observation space.",
    insight: "Drag any point below. Only its matching coordinate of y moves in ℝ³."
  },
  {
    title: "Every possible line lives in one model space",
    copy: "The intercept direction 1 and slope direction x span every fitted vector Xβ.",
    insight: "Drag the amber β in coefficient space. Its image Xβ moves inside C(X), while the matching candidate line moves above."
  },
  {
    title: "Least squares chooses the closest point",
    copy: "The fitted vector ŷ is the point in C(X) nearest to the observed vector y.",
    insight: "The coral gap is the residual r = y − ŷ. In the plot, its coordinates are the three vertical errors."
  },
  {
    title: "The residual is perpendicular to the model",
    copy: "At the closest point, no movement along either model direction can shorten the residual.",
    insight: "That geometric right angle is exactly Xᵀr = 0, which gives the normal equations."
  },
  {
    title: "Every other fit is farther",
    copy: "Perturbing β by h moves the fitted vector inside C(X) by Xh.",
    insight: "The residual and the in-plane movement form perpendicular legs, so their squared lengths add."
  }
];

export function updateLessonUI(step, elements) {
  const boundedStep = Math.max(0, Math.min(LESSON_STEPS.length - 1, step));
  const lesson = LESSON_STEPS[boundedStep];

  elements.stepCounter.textContent = `Step ${boundedStep + 1} of ${LESSON_STEPS.length}`;
  elements.stepTitle.textContent = lesson.title;
  elements.stepCopy.textContent = lesson.copy;
  elements.stepInsight.textContent = lesson.insight;
  elements.previousStep.disabled = boundedStep === 0;
  elements.nextStep.disabled = boundedStep === LESSON_STEPS.length - 1;
  elements.nextStep.innerHTML = boundedStep === LESSON_STEPS.length - 1
    ? "Complete"
    : "Next idea <span aria-hidden=\"true\">→</span>";

  elements.lessonTabs.forEach((tab, index) => {
    const active = index === boundedStep;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-current", active ? "step" : "false");
  });

  elements.mathRows.forEach((row) => {
    row.classList.toggle("is-active", Number(row.dataset.mathStep) === Math.min(boundedStep, 3));
  });

  document.body.dataset.lessonStep = String(boundedStep);
}
