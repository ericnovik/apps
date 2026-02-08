const MAX_N = 128;
const M = 1024;
const TWO_PI = Math.PI * 2;

const state = {
  N: 32,
  a0: 0,
  a: new Float32Array(MAX_N + 1),
  b: new Float32Array(MAX_N + 1),
  t0: 0,
  showPartial: false,
  Npartial: 8,
  showLadder: false,
  editMode: "ab",
  selectedHarmonic: 1,
  normalizeRMS: false,
  autoScalePlot: true,
  derivativeView: false,
  buildWaveTermMode: "ab",
  audio: {
    enabled: false,
    f0: 220,
    volume: 0.3,
    removeDC: true
  }
};

let audioCtx = null;
let osc = null;
let gainNode = null;
let pendingRender = false;
let lastSamples = null;
let currentPreset = "none";
let harmonicFilterSnapshot = null;
let phasorTrail = [];
let buildWaveK = 1;
let buildWaveLastAdvance = 0;
const PHASOR_TRAIL_LEN = 120;
const PHASOR_PERIOD_SEC = 2;
const BUILD_WAVE_INTERVAL_MS = 380;
const SESSION_STORAGE_KEY = "fourier-app-state";
const HASH_PREFIX = "f=";
let hashUpdateTimer = null;

const els = {};

function init() {
  cacheElements();
  bindEvents();
  buildHarmonicOptions();
  renderSpectrumLegend();
  let restored = restoreStateFromHash();
  if (!restored) restored = restoreStateFromSession();
  if (restored) {
    updatePartialMax();
    buildHarmonicOptions();
    if (els.presetSelect) els.presetSelect.value = currentPreset;
  } else {
    applyPreset("none");
  }
  updateUIFromState();
  scheduleRender();
  if (els.phasorCanvas) startPhasorAnimation();
  if (els.buildWaveCanvas) startBuildWaveAnimation();
}

function getStatePayload() {
  return {
    N: state.N,
    a0: state.a0,
    a: Array.from(state.a),
    b: Array.from(state.b),
    t0: state.t0,
    showPartial: state.showPartial,
    Npartial: state.Npartial,
    showLadder: state.showLadder,
    editMode: state.editMode,
    selectedHarmonic: state.selectedHarmonic,
    normalizeRMS: state.normalizeRMS,
    autoScalePlot: state.autoScalePlot,
    derivativeView: state.derivativeView,
    buildWaveTermMode: state.buildWaveTermMode,
    audio: { ...state.audio },
    currentPreset
  };
}

function applyStatePayload(payload) {
  state.N = Math.min(MAX_N, Math.max(1, payload.N | 0));
  state.a0 = Number(payload.a0) || 0;
  state.t0 = Number(payload.t0) || 0;
  state.showPartial = !!payload.showPartial;
  state.Npartial = Math.min(state.N, Math.max(1, payload.Npartial | 0));
  state.showLadder = !!payload.showLadder;
  state.editMode = payload.editMode === "Aphi" ? "Aphi" : "ab";
  state.selectedHarmonic = Math.min(state.N, Math.max(1, payload.selectedHarmonic | 0));
  state.normalizeRMS = !!payload.normalizeRMS;
  state.autoScalePlot = payload.autoScalePlot !== false;
  state.derivativeView = !!payload.derivativeView;
  state.buildWaveTermMode = (payload.buildWaveTermMode === "aphi" || payload.buildWaveTermMode === "complex") ? payload.buildWaveTermMode : "ab";
  if (payload.audio && typeof payload.audio === "object") {
    state.audio.f0 = Number(payload.audio.f0) || 220;
    const vol = Number(payload.audio.volume);
    state.audio.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.3;
    state.audio.removeDC = payload.audio.removeDC !== false;
  }
  if (Array.isArray(payload.a) && payload.a.length) {
    for (let i = 0; i <= MAX_N; i++) state.a[i] = i < payload.a.length ? Number(payload.a[i]) || 0 : 0;
  }
  if (Array.isArray(payload.b) && payload.b.length) {
    for (let i = 0; i <= MAX_N; i++) state.b[i] = i < payload.b.length ? Number(payload.b[i]) || 0 : 0;
  }
  currentPreset = typeof payload.currentPreset === "string" ? payload.currentPreset : "none";
}

function saveStateToSession() {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(getStatePayload()));
  } catch (e) {
    /* ignore */
  }
}

function restoreStateFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    applyStatePayload(JSON.parse(raw));
    return true;
  } catch (e) {
    return false;
  }
}

function compressStateToHash() {
  if (typeof window.LZString === "undefined") return "";
  try {
    const json = JSON.stringify(getStatePayload());
    return window.LZString.compressToEncodedURIComponent(json);
  } catch (e) {
    return "";
  }
}

function saveStateToHash() {
  const encoded = compressStateToHash();
  if (!encoded) return;
  const hash = "#" + HASH_PREFIX + encoded;
  const url = location.pathname + location.search + hash;
  try {
    history.replaceState(null, "", url);
  } catch (e) {
    /* ignore */
  }
}

function restoreStateFromHash() {
  try {
    const hash = location.hash;
    if (!hash || hash.indexOf("#" + HASH_PREFIX) !== 0) return false;
    const encoded = hash.slice(1 + HASH_PREFIX.length);
    if (!encoded) return false;
    if (typeof window.LZString === "undefined") return false;
    const json = window.LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return false;
    applyStatePayload(JSON.parse(json));
    return true;
  } catch (e) {
    return false;
  }
}

function scheduleHashUpdate() {
  if (hashUpdateTimer) clearTimeout(hashUpdateTimer);
  hashUpdateTimer = setTimeout(() => {
    hashUpdateTimer = null;
    saveStateToHash();
  }, 500);
}

function renderSpectrumLegend() {
  const nodes = document.querySelectorAll(".legend-tex[data-tex]");
  if (!window.katex || typeof window.katex.render !== "function") return;
  nodes.forEach((node) => {
    const tex = node.getAttribute("data-tex");
    if (tex) window.katex.render(tex, node, { throwOnError: false, displayMode: false });
  });
}

function updateBuildWaveTerms() {
  if (!window.katex || typeof window.katex.render !== "function") return;
  if (!els.buildWaveTerms) return;
  const { aUse, bUse } = getEffectiveCoeffs();
  const { aShift, bShift } = applyTimeShift(aUse, bUse, state.N, state.t0);
  const absFmt = (x) => Math.abs(Number(x)).toFixed(2);
  const lines = [];
  const mode = state.buildWaveTermMode || "ab";
  const ns = [1, 2, 3];
  if (state.N > 3) ns.push(state.N);

  ns.forEach((n) => {
    const a = Number(aShift[n]);
    const b = Number(bShift[n]);
    if (mode === "ab") {
      const aStr = a >= 0 ? a.toFixed(2) : "- " + absFmt(a);
      const signB = b >= 0 ? "+" : "-";
      const bStr = absFmt(b);
      lines.push("n=" + n + ":&\\quad&" + aStr + "&\\cos(2\\pi " + n + " t)&" + signB + "&" + bStr + "&\\sin(2\\pi " + n + " t)");
    } else if (mode === "aphi") {
      const A = Math.sqrt(a * a + b * b);
      const phi = Math.atan2(a, b);
      const AStr = A.toFixed(2);
      const phiStr = phi >= 0 ? phi.toFixed(2) : "- " + absFmt(phi);
      lines.push("n=" + n + ":&\\quad&" + AStr + "&\\sin(2\\pi " + n + " t + " + phiStr + ")");
    } else {
      const re = (a / 2).toFixed(2);
      const im = Math.abs(b / 2).toFixed(2);
      const c_n_imSign = b >= 0 ? "-" : "+";
      const c_neg_imSign = b >= 0 ? "+" : "-";
      const c_n = "(" + re + " " + c_n_imSign + " " + im + "\\,\\mathrm{i})";
      const c_neg = "(" + re + " " + c_neg_imSign + " " + im + "\\,\\mathrm{i})";
      lines.push("n=" + n + ":&\\quad&" + c_n + "&\\mathrm{e}^{\\mathrm{i}2\\pi " + n + " t}&+&" + c_neg + "\\,\\mathrm{e}^{-\\mathrm{i}2\\pi " + n + " t}");
    }
  });
  const tex = "\\begin{aligned}" + lines.join("\\\\") + "\\end{aligned}";
  try {
    window.katex.render(tex, els.buildWaveTerms, { throwOnError: false, displayMode: true });
  } catch (e) {
    els.buildWaveTerms.textContent = "n=1: … n=2: … n=3: …";
  }
}

function cacheElements() {
  els.presetSelect = document.getElementById("presetSelect");
  els.copyUrlBtn = document.getElementById("copyUrlBtn");
  els.resetBtn = document.getElementById("resetBtn");
  els.explainerLink = document.getElementById("explainerLink");
  els.normalizeRms = document.getElementById("normalizeRms");
  els.harmonicsSlider = document.getElementById("harmonicsSlider");
  els.harmonicsValue = document.getElementById("harmonicsValue");
  els.a0Slider = document.getElementById("a0Slider");
  els.a0Value = document.getElementById("a0Value");
  els.t0Slider = document.getElementById("t0Slider");
  els.t0Value = document.getElementById("t0Value");
  els.evenOnly = document.getElementById("evenOnly");
  els.oddOnly = document.getElementById("oddOnly");
  els.autoScalePlot = document.getElementById("autoScalePlot");
  els.derivativeToggle = document.getElementById("derivativeToggle");

  els.showPartial = document.getElementById("showPartial");
  els.partialSlider = document.getElementById("partialSlider");
  els.partialValue = document.getElementById("partialValue");
  els.showLadder = document.getElementById("showLadder");

  els.modeAb = document.getElementById("modeAb");
  els.modeAphi = document.getElementById("modeAphi");
  els.harmonicSelect = document.getElementById("harmonicSelect");
  els.abControls = document.getElementById("abControls");
  els.aphiControls = document.getElementById("aphiControls");
  els.aSlider = document.getElementById("aSlider");
  els.aValue = document.getElementById("aValue");
  els.bSlider = document.getElementById("bSlider");
  els.bValue = document.getElementById("bValue");
  els.ampSlider = document.getElementById("ampSlider");
  els.ampValue = document.getElementById("ampValue");
  els.phiSlider = document.getElementById("phiSlider");
  els.phiValue = document.getElementById("phiValue");

  els.decaySlider = document.getElementById("decaySlider");
  els.decayValue = document.getElementById("decayValue");
  els.applyDecayBtn = document.getElementById("applyDecayBtn");
  els.randomPhaseBtn = document.getElementById("randomPhaseBtn");
  els.lowPassBtn = document.getElementById("lowPassBtn");
  els.bandPassBtn = document.getElementById("bandPassBtn");
  els.highPassBtn = document.getElementById("highPassBtn");

  els.waveformCanvas = document.getElementById("waveformCanvas");
  els.spectrumCanvas = document.getElementById("spectrumCanvas");
  els.phasorCanvas = document.getElementById("phasorCanvas");
  els.buildWaveCanvas = document.getElementById("buildWaveCanvas");
  els.buildWaveTerms = document.getElementById("buildWaveTerms");
  els.buildWaveTermModeAphi = document.querySelector('input[name="buildWaveTermMode"][value="aphi"]');
  els.buildWaveTermModeAb = document.querySelector('input[name="buildWaveTermMode"][value="ab"]');
  els.buildWaveTermModeComplex = document.querySelector('input[name="buildWaveTermMode"][value="complex"]');
  els.waveformReadout = document.getElementById("waveformReadout");
  els.spectrumReadout = document.getElementById("spectrumReadout");

  els.audioToggle = document.getElementById("audioToggle");
  els.freqSlider = document.getElementById("freqSlider");
  els.freqValue = document.getElementById("freqValue");
  els.volumeSlider = document.getElementById("volumeSlider");
  els.volumeValue = document.getElementById("volumeValue");
  els.removeDc = document.getElementById("removeDc");
}

function bindEvents() {
  if (els.copyUrlBtn) {
    els.copyUrlBtn.addEventListener("click", () => {
      saveStateToHash();
      const url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          const label = els.copyUrlBtn.textContent;
          els.copyUrlBtn.textContent = "Copied!";
          setTimeout(() => { els.copyUrlBtn.textContent = label; }, 1500);
        });
      }
    });
  }
  if (els.explainerLink) {
    els.explainerLink.addEventListener("click", (e) => {
      e.preventDefault();
      saveStateToSession();
      window.location.href = "explainer.html";
    });
  }
  els.presetSelect.addEventListener("change", () => {
    applyPreset(els.presetSelect.value);
  });
  els.resetBtn.addEventListener("click", () => {
    resetState();
  });
  els.normalizeRms.addEventListener("change", () => {
    state.normalizeRMS = els.normalizeRms.checked;
    scheduleRender();
  });

  els.harmonicsSlider.addEventListener("input", () => {
    state.N = parseInt(els.harmonicsSlider.value, 10);
    els.harmonicsValue.textContent = state.N;
    if (state.selectedHarmonic > state.N) {
      state.selectedHarmonic = state.N;
    }
    updatePartialMax();
    buildHarmonicOptions();
    currentPreset = "none";
    scheduleRender();
  });

  els.a0Slider.addEventListener("input", () => {
    state.a0 = parseFloat(els.a0Slider.value);
    els.a0Value.textContent = state.a0.toFixed(3);
    currentPreset = "none";
    scheduleRender();
  });

  els.t0Slider.addEventListener("input", () => {
    state.t0 = parseFloat(els.t0Slider.value);
    els.t0Value.textContent = state.t0.toFixed(3);
    currentPreset = "none";
    scheduleRender();
  });

  els.evenOnly.addEventListener("change", () => {
    if (els.evenOnly.checked) {
      els.oddOnly.checked = false;
      applyHarmonicFilter("even");
    }
    if (!els.evenOnly.checked) {
      restoreHarmonics();
    }
    currentPreset = "none";
    scheduleRender();
  });
  els.oddOnly.addEventListener("change", () => {
    if (els.oddOnly.checked) {
      els.evenOnly.checked = false;
      applyHarmonicFilter("odd");
    }
    if (!els.oddOnly.checked) {
      restoreHarmonics();
    }
    currentPreset = "none";
    scheduleRender();
  });
  els.autoScalePlot.addEventListener("change", () => {
    state.autoScalePlot = els.autoScalePlot.checked;
    scheduleRender();
  });
  els.derivativeToggle.addEventListener("change", () => {
    state.derivativeView = els.derivativeToggle.checked;
    scheduleRender();
  });

  els.showPartial.addEventListener("change", () => {
    state.showPartial = els.showPartial.checked;
    scheduleRender();
  });
  els.partialSlider.addEventListener("input", () => {
    state.Npartial = parseInt(els.partialSlider.value, 10);
    els.partialValue.textContent = state.Npartial;
    scheduleRender();
  });
  els.showLadder.addEventListener("change", () => {
    state.showLadder = els.showLadder.checked;
    scheduleRender();
  });
  if (els.buildWaveTermModeAb) {
    els.buildWaveTermModeAb.addEventListener("change", () => { state.buildWaveTermMode = "ab"; scheduleRender(); });
  }
  if (els.buildWaveTermModeAphi) {
    els.buildWaveTermModeAphi.addEventListener("change", () => { state.buildWaveTermMode = "aphi"; scheduleRender(); });
  }
  if (els.buildWaveTermModeComplex) {
    els.buildWaveTermModeComplex.addEventListener("change", () => { state.buildWaveTermMode = "complex"; scheduleRender(); });
  }

  els.modeAb.addEventListener("click", () => switchMode("ab"));
  els.modeAphi.addEventListener("click", () => switchMode("Aphi"));

  els.harmonicSelect.addEventListener("change", () => {
    state.selectedHarmonic = parseInt(els.harmonicSelect.value, 10);
    updateHarmonicSliders();
    currentPreset = "none";
  });

  els.aSlider.addEventListener("input", () => {
    const n = state.selectedHarmonic;
    state.a[n] = parseFloat(els.aSlider.value);
    els.aValue.textContent = state.a[n].toFixed(3);
    updateAphiFromAB();
    currentPreset = "none";
    scheduleRender();
  });
  els.bSlider.addEventListener("input", () => {
    const n = state.selectedHarmonic;
    state.b[n] = parseFloat(els.bSlider.value);
    els.bValue.textContent = state.b[n].toFixed(3);
    updateAphiFromAB();
    currentPreset = "none";
    scheduleRender();
  });
  els.ampSlider.addEventListener("input", () => {
    const n = state.selectedHarmonic;
    const A = Math.max(0, parseFloat(els.ampSlider.value));
    const phi = parseFloat(els.phiSlider.value);
    setFromAphi(n, A, phi);
    updateABFromState();
    currentPreset = "none";
    scheduleRender();
  });
  els.phiSlider.addEventListener("input", () => {
    const n = state.selectedHarmonic;
    const A = Math.max(0, parseFloat(els.ampSlider.value));
    const phi = parseFloat(els.phiSlider.value);
    setFromAphi(n, A, phi);
    updateABFromState();
    currentPreset = "none";
    scheduleRender();
  });

  els.decaySlider.addEventListener("input", () => {
    els.decayValue.textContent = parseFloat(els.decaySlider.value).toFixed(1);
  });
  els.applyDecayBtn.addEventListener("click", () => {
    applyDecay(parseFloat(els.decaySlider.value));
    currentPreset = "none";
  });
  els.randomPhaseBtn.addEventListener("click", () => {
    randomizePhases();
    currentPreset = "none";
  });
  els.lowPassBtn.addEventListener("click", () => applyFilter("low"));
  els.bandPassBtn.addEventListener("click", () => applyFilter("band"));
  els.highPassBtn.addEventListener("click", () => applyFilter("high"));

  els.audioToggle.addEventListener("click", toggleAudio);
  els.freqSlider.addEventListener("input", () => {
    state.audio.f0 = parseFloat(els.freqSlider.value);
    els.freqValue.textContent = state.audio.f0.toFixed(0);
    if (osc) osc.frequency.value = state.audio.f0;
  });
  els.volumeSlider.addEventListener("input", () => {
    state.audio.volume = parseFloat(els.volumeSlider.value);
    els.volumeValue.textContent = state.audio.volume.toFixed(2);
    if (gainNode) gainNode.gain.value = state.audio.volume;
  });
  els.removeDc.addEventListener("change", () => {
    state.audio.removeDC = els.removeDc.checked;
    if (osc) updateAudioWave();
  });

  els.waveformCanvas.addEventListener("mousemove", handleWaveformHover);
  els.waveformCanvas.addEventListener("mouseleave", () => {
    els.waveformReadout.classList.add("hidden");
  });
  els.spectrumCanvas.addEventListener("mousemove", handleSpectrumHover);
  els.spectrumCanvas.addEventListener("mouseleave", () => {
    els.spectrumReadout.classList.add("hidden");
  });
  els.spectrumCanvas.addEventListener("click", handleSpectrumClick);
}

function switchMode(mode) {
  state.editMode = mode;
  els.modeAb.classList.toggle("active", mode === "ab");
  els.modeAphi.classList.toggle("active", mode === "Aphi");
  els.abControls.classList.toggle("hidden", mode !== "ab");
  els.aphiControls.classList.toggle("hidden", mode !== "Aphi");
  updateHarmonicSliders();
}

function buildHarmonicOptions() {
  els.harmonicSelect.innerHTML = "";
  for (let n = 1; n <= state.N; n++) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = `n=${n}`;
    els.harmonicSelect.appendChild(opt);
  }
  els.harmonicSelect.value = state.selectedHarmonic;
}

function updatePartialMax() {
  els.partialSlider.max = state.N;
  if (state.Npartial > state.N) {
    state.Npartial = state.N;
    els.partialSlider.value = state.Npartial;
    els.partialValue.textContent = state.Npartial;
  }
}

function updateUIFromState() {
  els.harmonicsSlider.value = state.N;
  els.harmonicsValue.textContent = state.N;
  els.a0Slider.value = state.a0;
  els.a0Value.textContent = state.a0.toFixed(3);
  els.t0Slider.value = state.t0;
  els.t0Value.textContent = state.t0.toFixed(3);
  els.showPartial.checked = state.showPartial;
  els.partialSlider.value = state.Npartial;
  els.partialValue.textContent = state.Npartial;
  els.showLadder.checked = state.showLadder;
  els.normalizeRms.checked = state.normalizeRMS;
  els.autoScalePlot.checked = state.autoScalePlot;
  els.derivativeToggle.checked = state.derivativeView;
  els.freqSlider.value = state.audio.f0;
  els.freqValue.textContent = state.audio.f0.toFixed(0);
  els.volumeSlider.value = state.audio.volume;
  els.volumeValue.textContent = state.audio.volume.toFixed(2);
  els.removeDc.checked = state.audio.removeDC;
  if (els.buildWaveTermModeAb) els.buildWaveTermModeAb.checked = state.buildWaveTermMode === "ab";
  if (els.buildWaveTermModeAphi) els.buildWaveTermModeAphi.checked = state.buildWaveTermMode === "aphi";
  if (els.buildWaveTermModeComplex) els.buildWaveTermModeComplex.checked = state.buildWaveTermMode === "complex";
  updateHarmonicSliders();
}

function updateHarmonicSliders() {
  const n = state.selectedHarmonic;
  els.harmonicSelect.value = n;
  els.aSlider.value = state.a[n];
  els.aValue.textContent = state.a[n].toFixed(3);
  els.bSlider.value = state.b[n];
  els.bValue.textContent = state.b[n].toFixed(3);
  const { A, phi } = computeAphi(n);
  els.ampSlider.value = A;
  els.ampValue.textContent = A.toFixed(3);
  els.phiSlider.value = phi;
  els.phiValue.textContent = phi.toFixed(3);
}

function updateABFromState() {
  const n = state.selectedHarmonic;
  els.aSlider.value = state.a[n];
  els.aValue.textContent = state.a[n].toFixed(3);
  els.bSlider.value = state.b[n];
  els.bValue.textContent = state.b[n].toFixed(3);
  const { A, phi } = computeAphi(n);
  els.ampSlider.value = A;
  els.ampValue.textContent = A.toFixed(3);
  els.phiSlider.value = phi;
  els.phiValue.textContent = phi.toFixed(3);
}

function updateAphiFromAB() {
  const { A, phi } = computeAphi(state.selectedHarmonic);
  els.ampSlider.value = A;
  els.ampValue.textContent = A.toFixed(3);
  els.phiSlider.value = phi;
  els.phiValue.textContent = phi.toFixed(3);
}

function computeAphi(n) {
  const a = state.a[n];
  const b = state.b[n];
  const A = Math.sqrt(a * a + b * b);
  const phi = Math.atan2(a, b);
  return { A, phi };
}

function setFromAphi(n, A, phi) {
  state.a[n] = A * Math.sin(phi);
  state.b[n] = A * Math.cos(phi);
}

function applyTimeShift(a, b, N, t0) {
  const aShift = new Float32Array(N + 1);
  const bShift = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    const angle = TWO_PI * n * t0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    aShift[n] = c * a[n] - s * b[n];
    bShift[n] = s * a[n] + c * b[n];
  }
  return { aShift, bShift };
}

function evaluateWaveform(a0, a, b, N, M, t0) {
  const samples = new Float32Array(M);
  const { aShift, bShift } = applyTimeShift(a, b, N, t0);
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    let sum = a0 / 2;
    for (let n = 1; n <= N; n++) {
      const angle = TWO_PI * n * t;
      sum += aShift[n] * Math.cos(angle) + bShift[n] * Math.sin(angle);
    }
    samples[i] = sum;
  }
  return samples;
}

function computeRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function scheduleRender() {
  scheduleHashUpdate();
  if (pendingRender) return;
  pendingRender = true;
  requestAnimationFrame(() => {
    pendingRender = false;
    render();
  });
}

function render() {
  const { aUse, bUse, a0Use } = getEffectiveCoeffs();
  const samples = evaluateWaveform(a0Use, aUse, bUse, state.N, M, state.t0);
  const scaledSamples = samples;
  lastSamples = scaledSamples;

  drawWaveform(scaledSamples);
  drawSpectrum();
  updateBuildWaveTerms();
  if (osc) updateAudioWave();
}

function drawWaveform(samples) {
  const ctx = els.waveformCanvas.getContext("2d");
  const w = els.waveformCanvas.width;
  const h = els.waveformCanvas.height;
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  drawZeroLine(ctx, w, h);

  const padding = h * 0.12;
  const usableHeight = h - padding * 2;
  let sharedScale = null;
  if ((state.showPartial || state.showLadder) && state.autoScalePlot) {
    let maxAbs = 0.0001;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > maxAbs) maxAbs = v;
    }
    if (state.showPartial) {
      const Np = state.Npartial;
      const { aUse, bUse, a0Use } = getEffectiveCoeffs();
      const partialSamples = evaluateWaveform(a0Use, aUse, bUse, Np, M, state.t0);
      const rms = computeRMS(partialSamples);
      const rmsScale = state.normalizeRMS && rms > 0 ? 0.7 / rms : 1;
      for (let i = 0; i < partialSamples.length; i++) {
        const v = Math.abs(partialSamples[i] * rmsScale);
        if (v > maxAbs) maxAbs = v;
      }
    }
    if (state.showLadder) {
      const targets = [5, 10, 20, state.N].filter(n => n <= state.N);
      targets.forEach((n) => {
        const { aUse, bUse, a0Use } = getEffectiveCoeffs();
        const partial = evaluateWaveform(a0Use, aUse, bUse, n, M, state.t0);
        const rms = computeRMS(partial);
        const rmsScale = state.normalizeRMS && rms > 0 ? 0.7 / rms : 1;
        for (let i = 0; i < partial.length; i++) {
          const v = Math.abs(partial[i] * rmsScale);
          if (v > maxAbs) maxAbs = v;
        }
      });
    }
    sharedScale = (usableHeight * 0.5) / (maxAbs * 1.05);
  }

  const mainColor = "#2c3e50";
  drawSeries(ctx, samples, w, h, mainColor, [], state.autoScalePlot, sharedScale);

  if (state.showPartial) {
    const Np = state.Npartial;
    const { aUse, bUse, a0Use } = getEffectiveCoeffs();
    const partialSamples = evaluateWaveform(a0Use, aUse, bUse, Np, M, state.t0);
    const rms = computeRMS(partialSamples);
    const rmsScale = state.normalizeRMS && rms > 0 ? 0.7 / rms : 1;
    const scaled = partialSamples.map(v => v * rmsScale);
    drawSeries(ctx, scaled, w, h, "#e67e22", [6, 4], false, sharedScale);
  }

  if (state.showLadder) {
    const targets = [5, 10, 20, state.N].filter(n => n <= state.N);
    targets.forEach((n, idx) => {
      const { aUse, bUse, a0Use } = getEffectiveCoeffs();
      const partial = evaluateWaveform(a0Use, aUse, bUse, n, M, state.t0);
      const rms = computeRMS(partial);
      const rmsScale = state.normalizeRMS && rms > 0 ? 0.7 / rms : 1;
      const scaled = partial.map(v => v * rmsScale);
      const alpha = 0.2 + idx * 0.15;
      drawSeries(ctx, scaled, w, h, `rgba(52, 152, 219, ${alpha})`, [4, 4], false, sharedScale);
    });
  }

  if (currentPreset === "square") {
    drawGibbsMarkers(ctx, w, h);
  }
}

function drawSpectrum() {
  const ctx = els.spectrumCanvas.getContext("2d");
  const w = els.spectrumCanvas.width;
  const h = els.spectrumCanvas.height;
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  drawZeroLine(ctx, w, h);

  const { aUse, bUse } = getEffectiveCoeffs();
  const { aShift, bShift } = applyTimeShift(aUse, bUse, state.N, state.t0);
  const magnitudes = [];
  const phases = [];
  for (let n = 1; n <= state.N; n++) {
    const A = Math.sqrt(aShift[n] * aShift[n] + bShift[n] * bShift[n]);
    magnitudes.push(A);
    phases.push(Math.atan2(aShift[n], bShift[n]));
  }

  /* Amplitude bars in top portion; phase band at bottom (overlaid in same plot). */
  const phaseBandRatio = 0.22;
  const phaseBandTop = h * (1 - phaseBandRatio);
  const barAreaHeight = phaseBandTop - 10;
  const refMagnitude = 1.0;
  const barWidth = w / state.N;
  const MAG_COLOR = "#4ade80";
  for (let i = 0; i < state.N; i++) {
    const A = Math.min(magnitudes[i] / refMagnitude, 1);
    const barHeight = A * barAreaHeight;
    const x = i * barWidth;
    const y = phaseBandTop - barHeight;
    ctx.fillStyle = MAG_COLOR;
    ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
  }

  /* Phase bars in bottom band, scaled to fit; alpha 1/2. */
  const PHI_COLOR = "rgba(168, 85, 247, 0.5)";
  const phaseBandH = h - phaseBandTop;
  const phaseCenterY = phaseBandTop + phaseBandH / 2;
  const phaseBarRange = (phaseBandH / 2) * 0.85;
  for (let i = 0; i < state.N; i++) {
    const phi = phases[i];
    const len = (phi / Math.PI) * phaseBarRange;
    const x = i * barWidth;
    const barHeight = Math.abs(len);
    if (barHeight < 1) {
      ctx.fillStyle = PHI_COLOR;
      ctx.fillRect(x + 2, phaseCenterY - 2, barWidth - 4, 4);
    } else if (len >= 0) {
      ctx.fillStyle = PHI_COLOR;
      ctx.fillRect(x + 2, phaseCenterY - len, barWidth - 4, barHeight);
    } else {
      ctx.fillStyle = PHI_COLOR;
      ctx.fillRect(x + 2, phaseCenterY, barWidth - 4, barHeight);
    }
  }
}

function drawBuildWave(k) {
  if (!els.buildWaveCanvas) return;
  const ctx = els.buildWaveCanvas.getContext("2d");
  const w = els.buildWaveCanvas.width;
  const h = els.buildWaveCanvas.height;
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  drawZeroLine(ctx, w, h);
  const Nk = Math.min(Math.max(1, k), state.N);
  const { aUse, bUse, a0Use } = getEffectiveCoeffs();
  const partialSamples = evaluateWaveform(a0Use, aUse, bUse, Nk, M, state.t0);
  drawSeries(ctx, partialSamples, w, h, "#2c3e50", [], true);
}

function startBuildWaveAnimation() {
  function loop() {
    if (els.buildWaveCanvas) {
      drawBuildWave(buildWaveK);
      const now = performance.now();
      if (now - buildWaveLastAdvance >= BUILD_WAVE_INTERVAL_MS) {
        buildWaveLastAdvance = now;
        buildWaveK = buildWaveK >= state.N ? 1 : buildWaveK + 1;
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function drawPhasor(t) {
  if (!els.phasorCanvas) return;
  const ctx = els.phasorCanvas.getContext("2d");
  const w = els.phasorCanvas.width;
  const h = els.phasorCanvas.height;
  ctx.clearRect(0, 0, w, h);

  const { aUse, bUse, a0Use } = getEffectiveCoeffs();
  const { aShift, bShift } = applyTimeShift(aUse, bUse, state.N, state.t0);
  const dc = a0Use / 2;
  const amps = [];
  const phases = [];
  let totalRadius = Math.abs(dc);
  for (let n = 1; n <= state.N; n++) {
    const A = Math.sqrt(aShift[n] * aShift[n] + bShift[n] * bShift[n]);
    const phi = Math.atan2(aShift[n], bShift[n]);
    amps.push(A);
    phases.push(phi);
    totalRadius += A;
  }
  const diagramW = w * 0.45;
  const diagramH = h * 0.9;
  const cx = diagramW * 0.5;
  const cy = h / 2;
  const scale = Math.min((diagramW * 0.4) / Math.max(totalRadius, 0.01), (diagramH * 0.4) / Math.max(totalRadius, 0.01));

  function toScreen(x, y) {
    return { x: cx + x * scale, y: cy - y * scale };
  }

  let px = 0;
  let py = dc;
  const points = [toScreen(px, py)];

  for (let n = 0; n < amps.length; n++) {
    const A = amps[n];
    const phi = phases[n];
    const angle = TWO_PI * (n + 1) * t + phi;
    const dx = A * Math.cos(angle);
    const dy = A * Math.sin(angle);
    px += dx;
    py += dy;
    points.push(toScreen(px, py));
  }

  const tipScreen = points[points.length - 1];
  phasorTrail.push({ x: tipScreen.x, y: tipScreen.y });
  if (phasorTrail.length > PHASOR_TRAIL_LEN) phasorTrail.shift();

  ctx.strokeStyle = "rgba(42, 157, 143, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  phasorTrail.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  const hueStep = 280 / Math.max(state.N, 1);
  for (let n = 0; n < points.length - 1; n++) {
    const from = points[n];
    const to = points[n + 1];
    const hue = (200 + n * hueStep) % 360;
    ctx.strokeStyle = `hsl(${hue}, 65%, 45%)`;
    ctx.lineWidth = n === points.length - 2 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const ax = to.x - from.x;
    const ay = to.y - from.y;
    const len = Math.sqrt(ax * ax + ay * ay) || 1;
    const arrLen = Math.min(12, len * 0.35);
    const ux = ax / len;
    const uy = ay / len;
    const perpX = -uy;
    const perpY = ux;
    ctx.fillStyle = `hsl(${hue}, 65%, 45%)`;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ux * arrLen + perpX * arrLen * 0.4, to.y - uy * arrLen + perpY * arrLen * 0.4);
    ctx.lineTo(to.x - ux * arrLen - perpX * arrLen * 0.4, to.y - uy * arrLen - perpY * arrLen * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#1a1a2e";
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === points.length - 1 ? 5 : 3, 0, TWO_PI);
    ctx.fill();
  });

  const waveLeft = diagramW + 20;
  const waveW = w - waveLeft - 20;
  const waveTop = 20;
  const waveH = h - 40;
  const M = 200;
  const samples = evaluateWaveform(a0Use, aUse, bUse, state.N, M, state.t0);
  let maxAbs = 0.0001;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > maxAbs) maxAbs = Math.abs(samples[i]);
  }
  const waveScale = (waveH * 0.45) / maxAbs;
  const waveMidY = waveTop + waveH / 2;
  ctx.strokeStyle = "#2c3e50";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const x = waveLeft + (i / (M - 1)) * waveW;
    const y = waveMidY - samples[i] * waveScale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const cursorX = waveLeft + t * waveW;
  ctx.strokeStyle = "#e74c3c";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cursorX, waveTop);
  ctx.lineTo(cursorX, waveTop + waveH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#e74c3c";
  ctx.beginPath();
  ctx.arc(cursorX, waveMidY - samples[Math.round(t * (M - 1))] * waveScale, 4, 0, TWO_PI);
  ctx.fill();
}

function startPhasorAnimation() {
  function loop() {
    const t = ((performance.now() / 1000) / PHASOR_PERIOD_SEC) % 1;
    drawPhasor(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  const rows = 4;
  const cols = 8;
  for (let i = 1; i < rows; i++) {
    const y = (i / rows) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = 1; i < cols; i++) {
    const x = (i / cols) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

function drawZeroLine(ctx, w, h) {
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function drawSeries(ctx, samples, w, h, color, dash, autoScale, explicitScale) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const padding = h * 0.12;
  const usableHeight = h - padding * 2;
  let scale;
  if (explicitScale != null && typeof explicitScale === "number") {
    scale = explicitScale;
  } else {
    scale = usableHeight * 0.4;
    if (autoScale) {
      let maxAbs = 0.0001;
      for (let i = 0; i < samples.length; i++) {
        const v = Math.abs(samples[i]);
        if (v > maxAbs) maxAbs = v;
      }
      scale = (usableHeight * 0.5) / (maxAbs * 1.05);
    }
  }
  for (let i = 0; i < samples.length; i++) {
    const x = (i / (samples.length - 1)) * w;
    const y = h / 2 - samples[i] * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function applyPreset(name) {
  currentPreset = name;
  resetCoeffs();
  const N = state.N;
  switch (name) {
    case "pure": {
      const k = state.selectedHarmonic;
      state.b[k] = 1;
      break;
    }
    case "square": {
      for (let n = 1; n <= N; n += 2) {
        state.b[n] = 4 / (Math.PI * n);
      }
      break;
    }
    case "sawtooth": {
      for (let n = 1; n <= N; n++) {
        state.b[n] = (2 / Math.PI) * ((n % 2 === 0) ? -1 : 1) / n;
      }
      break;
    }
    case "triangle": {
      for (let n = 1; n <= N; n += 2) {
        const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
        state.b[n] = (8 / (Math.PI * Math.PI)) * sign / (n * n);
      }
      break;
    }
    case "spike": {
      for (let n = 1; n <= N; n++) {
        state.b[n] = 1;
      }
      break;
    }
    case "randomDecay":
      randomizePhases();
      break;
    default:
      break;
  }
  updateHarmonicSliders();
  scheduleRender();
}

function resetCoeffs() {
  state.a.fill(0);
  state.b.fill(0);
  state.a0 = 0;
  els.a0Slider.value = 0;
  els.a0Value.textContent = "0.000";
}

function resetState() {
  state.N = 32;
  state.selectedHarmonic = 1;
  state.t0 = 0;
  state.showPartial = false;
  state.Npartial = 8;
  state.showLadder = false;
  state.normalizeRMS = false;
  state.derivativeView = false;
  currentPreset = "none";
  state.audio.f0 = 220;
  state.audio.volume = 0.3;
  state.audio.removeDC = true;
  resetCoeffs();
  harmonicFilterSnapshot = null;
  if (els.evenOnly) els.evenOnly.checked = false;
  if (els.oddOnly) els.oddOnly.checked = false;
  if (els.presetSelect) {
    els.presetSelect.value = "none";
  }
  updateUIFromState();
  scheduleRender();
}

function applyDecay(p) {
  for (let n = 1; n <= state.N; n++) {
    const { phi } = computeAphi(n);
    const A = 1 / Math.pow(n, p);
    setFromAphi(n, A, phi);
  }
  updateHarmonicSliders();
  scheduleRender();
}

function randomizePhases() {
  const p = parseFloat(els.decaySlider.value);
  for (let n = 1; n <= state.N; n++) {
    const A = 1 / Math.pow(n, p);
    const phi = (Math.random() * 2 - 1) * Math.PI;
    setFromAphi(n, A, phi);
  }
  updateHarmonicSliders();
  scheduleRender();
}

function applyFilter(type) {
  const N = state.N;
  const low = Math.floor(N / 3);
  const high = Math.floor((2 * N) / 3);
  for (let n = 1; n <= N; n++) {
    const keep =
      (type === "low" && n <= low) ||
      (type === "band" && n > low && n <= high) ||
      (type === "high" && n > high);
    if (!keep) {
      state.a[n] = 0;
      state.b[n] = 0;
    }
  }
  updateHarmonicSliders();
  scheduleRender();
}

function applyHarmonicFilter(mode) {
  if (!harmonicFilterSnapshot) {
    harmonicFilterSnapshot = {
      a: Float32Array.from(state.a),
      b: Float32Array.from(state.b)
    };
  }
  for (let n = 1; n <= state.N; n++) {
    const keepEven = n % 2 === 0;
    const keep = mode === "even" ? keepEven : !keepEven;
    if (!keep) {
      state.a[n] = 0;
      state.b[n] = 0;
    }
  }
}

function restoreHarmonics() {
  if (!harmonicFilterSnapshot) return;
  state.a = Float32Array.from(harmonicFilterSnapshot.a);
  state.b = Float32Array.from(harmonicFilterSnapshot.b);
  harmonicFilterSnapshot = null;
  updateHarmonicSliders();
}

function getEffectiveCoeffs() {
  if (!state.derivativeView) {
    return { aUse: state.a, bUse: state.b, a0Use: state.a0 };
  }
  const aDer = new Float32Array(state.N + 1);
  const bDer = new Float32Array(state.N + 1);
  for (let n = 1; n <= state.N; n++) {
    aDer[n] = TWO_PI * n * state.b[n];
    bDer[n] = -TWO_PI * n * state.a[n];
  }
  return { aUse: aDer, bUse: bDer, a0Use: 0 };
}

function handleWaveformHover(event) {
  if (!lastSamples) return;
  const rect = els.waveformCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const t = Math.min(Math.max(x / rect.width, 0), 1);
  const idx = Math.round(t * (lastSamples.length - 1));
  const y = lastSamples[idx] || 0;
  els.waveformReadout.textContent = `t=${t.toFixed(3)}, y=${y.toFixed(3)}`;
  els.waveformReadout.classList.remove("hidden");
}

function handleSpectrumHover(event) {
  const rect = els.spectrumCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const n = Math.min(
    state.N,
    Math.max(1, Math.floor((x / rect.width) * state.N) + 1)
  );
  const { aUse, bUse } = getEffectiveCoeffs();
  const { aShift, bShift } = applyTimeShift(aUse, bUse, state.N, state.t0);
  const an = aShift[n];
  const bn = bShift[n];
  const An = Math.sqrt(an * an + bn * bn);
  const phi = Math.atan2(an, bn);
  const phiDeg = (phi * 180 / Math.PI).toFixed(1);
  els.spectrumReadout.innerHTML =
    `n=${n}: A<sub>n</sub>=${An.toFixed(2)}, φ<sub>n</sub>=${phi.toFixed(2)} (${phiDeg}°), a<sub>n</sub>=${an.toFixed(2)}, b<sub>n</sub>=${bn.toFixed(2)}`;
  els.spectrumReadout.classList.remove("hidden");
}

function harmonicFromSpectrumClick(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  return Math.min(
    state.N,
    Math.max(1, Math.floor((x / rect.width) * state.N) + 1)
  );
}

function handleSpectrumClick(event) {
  state.selectedHarmonic = harmonicFromSpectrumClick(event, els.spectrumCanvas);
  updateHarmonicSliders();
}

function drawGibbsMarkers(ctx, w, h) {
  const positions = [0, 0.5, 1];
  ctx.save();
  ctx.strokeStyle = "#c0392b";
  ctx.fillStyle = "#c0392b";
  positions.forEach(t => {
    const x = t * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, h * 0.2, 4, 0, TWO_PI);
    ctx.fill();
  });
  ctx.restore();
}

async function toggleAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (state.audio.enabled) {
    osc.stop();
    osc.disconnect();
    gainNode.disconnect();
    osc = null;
    gainNode = null;
    state.audio.enabled = false;
    els.audioToggle.textContent = "Play";
  } else {
    osc = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = state.audio.volume;
    osc.frequency.value = state.audio.f0;
    updateAudioWave();
    osc.connect(gainNode).connect(audioCtx.destination);
    osc.start();
    state.audio.enabled = true;
    els.audioToggle.textContent = "Stop";
  }
}

function updateAudioWave() {
  if (!audioCtx || !osc) return;
  const { aUse, bUse, a0Use } = getEffectiveCoeffs();
  const { aShift, bShift } = applyTimeShift(aUse, bUse, state.N, state.t0);
  const samples = evaluateWaveform(a0Use, aUse, bUse, state.N, M, state.t0);
  const rms = computeRMS(samples);
  const targetRMS = 0.2;
  const scale = state.normalizeRMS && rms > 0 ? targetRMS / rms : 1;

  const real = new Float32Array(state.N + 1);
  const imag = new Float32Array(state.N + 1);
  real[0] = state.audio.removeDC ? 0 : (a0Use / 2) * scale;
  for (let n = 1; n <= state.N; n++) {
    real[n] = aShift[n] * scale;
    imag[n] = bShift[n] * scale;
  }

  const wave = audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });
  osc.setPeriodicWave(wave);
}

document.addEventListener("DOMContentLoaded", init);
