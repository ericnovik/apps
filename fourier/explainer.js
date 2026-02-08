function ensureKaTeX() {
  if (window.katex && typeof window.katex.render === "function") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-katex-loader="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const link = document.querySelector('link[href*="katex.min.css"]');
    if (!link) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css";
      document.head.appendChild(css);
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js";
    script.async = true;
    script.dataset.katexLoader = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function renderExplainerMath() {
  const nodes = document.querySelectorAll(".tex[data-tex]");
  if (!nodes.length) return;
  nodes.forEach(node => {
    const tex = node.getAttribute("data-tex");
    if (!tex || !window.katex || typeof window.katex.render !== "function") return;
    const displayMode = node.classList.contains("tex-block");
    window.katex.render(tex, node, { throwOnError: false, displayMode });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ensureKaTeX()
    .then(renderExplainerMath)
    .catch(() => {
      // Leave raw TeX if KaTeX fails to load.
    });
});
