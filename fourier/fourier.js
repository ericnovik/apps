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

const els = {};

function init() {
  cacheElements();
  bindEvents();
  buildHarmonicOptions();
  applyPreset("none");
  updateUIFromState();
  scheduleRender();
}

function cacheElements() {
  els.presetSelect = document.getElementById("presetSelect");
  els.resetBtn = document.getElementById("resetBtn");
  els.randomizeBtn = document.getElementById("randomizeBtn");
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
  els.waveformReadout = document.getElementById("waveformReadout");

  els.audioToggle = document.getElementById("audioToggle");
  els.freqSlider = document.getElementById("freqSlider");
  els.freqValue = document.getElementById("freqValue");
  els.volumeSlider = document.getElementById("volumeSlider");
  els.volumeValue = document.getElementById("volumeValue");
  els.removeDc = document.getElementById("removeDc");
}

function bindEvents() {
  els.presetSelect.addEventListener("change", () => {
    applyPreset(els.presetSelect.value);
  });
  els.resetBtn.addEventListener("click", () => {
    resetState();
  });
  els.randomizeBtn.addEventListener("click", () => {
    randomizeCoefficients();
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
  if (osc) updateAudioWave();
}

function drawWaveform(samples) {
  const ctx = els.waveformCanvas.getContext("2d");
  const w = els.waveformCanvas.width;
  const h = els.waveformCanvas.height;
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  drawZeroLine(ctx, w, h);

  const mainColor = "#2c3e50";
  drawSeries(ctx, samples, w, h, mainColor, [], state.autoScalePlot);

  if (state.showPartial) {
    const Np = state.Npartial;
    const { aUse, bUse, a0Use } = getEffectiveCoeffs();
    const partialSamples = evaluateWaveform(a0Use, aUse, bUse, Np, M, state.t0);
    const rms = computeRMS(partialSamples);
    const scale = state.normalizeRMS && rms > 0 ? 0.7 / rms : 1;
    const scaled = partialSamples.map(v => v * scale);
    drawSeries(ctx, scaled, w, h, "#e67e22", [6, 4], false);
  }

  if (state.showLadder) {
    const targets = [5, 10, 20, state.N].filter(n => n <= state.N);
    targets.forEach((n, idx) => {
      const { aUse, bUse, a0Use } = getEffectiveCoeffs();
      const partial = evaluateWaveform(a0Use, aUse, bUse, n, M, state.t0);
      const rms = computeRMS(partial);
      const scale = state.normalizeRMS && rms > 0 ? 0.7 / rms : 1;
      const scaled = partial.map(v => v * scale);
      const alpha = 0.2 + idx * 0.15;
      drawSeries(ctx, scaled, w, h, `rgba(52, 152, 219, ${alpha})`, [4, 4], false);
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
  let maxMag = 0.0001;
  for (let n = 1; n <= state.N; n++) {
    const A = Math.sqrt(aShift[n] * aShift[n] + bShift[n] * bShift[n]);
    const phi = Math.atan2(aShift[n], bShift[n]);
    magnitudes.push(A);
    phases.push(phi);
    if (A > maxMag) maxMag = A;
  }

  const barWidth = w / state.N;
  for (let i = 0; i < state.N; i++) {
    const A = magnitudes[i] / maxMag;
    const barHeight = A * (h * 0.6);
    const x = i * barWidth;
    const y = h - barHeight - 20;
    ctx.fillStyle = "#667eea";
    ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

    const phase = phases[i];
    const phaseBand = h * 0.25;
    const phaseCenter = h - 10;
    const phaseY = phaseCenter - (phase / Math.PI) * (phaseBand / 2);
    ctx.fillStyle = "#e67e22";
    ctx.beginPath();
    ctx.arc(x + barWidth / 2, phaseY, 2, 0, TWO_PI);
    ctx.fill();
  }
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

function drawSeries(ctx, samples, w, h, color, dash, autoScale) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const padding = h * 0.12;
  const usableHeight = h - padding * 2;
  let scale = usableHeight * 0.4;
  if (autoScale) {
    let maxAbs = 0.0001;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > maxAbs) maxAbs = v;
    }
    scale = (usableHeight * 0.5) / (maxAbs * 1.05);
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
    case "randomDecay": {
      const p = parseFloat(els.decaySlider.value);
      for (let n = 1; n <= N; n++) {
        const A = 1 / Math.pow(n, p);
        const phi = (Math.random() * 2 - 1) * Math.PI;
        state.a[n] = A * Math.sin(phi);
        state.b[n] = A * Math.cos(phi);
      }
      break;
    }
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

function randomizeCoefficients() {
  const p = parseFloat(els.decaySlider.value);
  for (let n = 1; n <= state.N; n++) {
    const A = 1 / Math.pow(n, p);
    const phi = (Math.random() * 2 - 1) * Math.PI;
    state.a[n] = A * Math.sin(phi);
    state.b[n] = A * Math.cos(phi);
  }
  updateHarmonicSliders();
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
  for (let n = 1; n <= state.N; n++) {
    const { A } = computeAphi(n);
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

function handleSpectrumClick(event) {
  const rect = els.spectrumCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const n = Math.min(
    state.N,
    Math.max(1, Math.floor((x / rect.width) * state.N) + 1)
  );
  state.selectedHarmonic = n;
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
