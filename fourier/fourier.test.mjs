import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = new vm.Script(readFileSync(new URL("./fourier.js", import.meta.url), "utf8"));
const markup = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const presetButtons = Array.from(
  markup.matchAll(/<button\b[^>]*\bdata-preset\s*=\s*(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/button>/g),
  ([, , preset, content]) => ({ preset, label: content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() })
);

function canvasContext() {
  const stack = [];
  return {
    paints: [], clears: 0, globalAlpha: 1,
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    clearRect() { this.clears++; this.paints = []; },
    paint(kind, color, args = []) { this.paints.push({ kind, color, alpha: this.globalAlpha, args }); },
    fillRect(...args) { this.paint("fillRect", this.fillStyle, args); },
    strokeRect(...args) { this.paint("strokeRect", this.strokeStyle, args); },
    fill() { this.paint("fill", this.fillStyle); },
    stroke() { this.paint("stroke", this.strokeStyle); },
    save() {
      stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha, lineWidth: this.lineWidth });
    },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, setLineDash() {}
  };
}

class Element {
  constructor(id = "") {
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.checked = false;
    this.hidden = false;
    this.style = {};
    this.value = id === "decaySlider" ? "1" : "";
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
    };
    if (id.endsWith("Canvas")) {
      this.width = 800;
      this.height = id === "phasorCanvas" ? 320 : 300;
      this.context = canvasContext();
    }
  }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text || ""; }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html || ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); }
  getContext(kind) { assert.equal(kind, "2d"); return this.context; }
  getBoundingClientRect() { return { left: 20, width: 400 }; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  emit(type, properties = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    event.results = (this.listeners.get(type) || []).map((listener) => listener(event));
    return event;
  }
}

function createApp({ reducedMotion = true, hashState, sessionState, missing = [], withKatex = false } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (id === "presetSelect" || missing.includes(id)) return null;
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const chips = presetButtons.map(({ preset, label }) => {
    const button = new Element();
    button.dataset.preset = preset;
    button.textContent = label;
    return button;
  });
  const document = new Element();
  document.getElementById = element;
  document.createElement = () => new Element();
  document.querySelectorAll = (selector) => selector === "[data-preset]" ? chips : [];
  document.querySelector = (selector) => selector === "#presetSelect" ? null : element(selector);

  let now = 0;
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  const storage = new Map(sessionState ? [["fourier-app-state", JSON.stringify(sessionState)]] : []);
  const hash = hashState ? "#f=" + encodeURIComponent(JSON.stringify(hashState)) : "";
  const location = { pathname: "/fourier/index.html", search: "", hash, href: "https://example.test/fourier/index.html" + hash };
  const replacedUrls = [];
  const katexRenders = [];
  const katex = withKatex ? {
    render(tex, element, options) {
      katexRenders.push({ tex, element, options: { ...options } });
      element.textContent = tex;
    }
  } : undefined;
  const audio = { contexts: 0, starts: 0, stops: 0, waves: [] };
  class AudioContext {
    constructor() { audio.contexts++; this.destination = {}; }
    createOscillator() {
      audio.oscillator = {
        frequency: { value: 0 },
        connect: (node) => node, disconnect() {},
        start() { audio.starts++; }, stop() { audio.stops++; },
        setPeriodicWave(wave) { this.wave = wave; }
      };
      return audio.oscillator;
    }
    createGain() {
      audio.gain = { gain: { value: 0 }, connect: (node) => node, disconnect() {} };
      return audio.gain;
    }
    createPeriodicWave(real, imag, options) {
      const wave = { real: Array.from(real), imag: Array.from(imag), options };
      audio.waves.push(wave);
      return wave;
    }
  }
  const context = vm.createContext({
    document, location, AudioContext,
    window: {
      location, katex,
      matchMedia(query) { assert.equal(query, "(prefers-reduced-motion: reduce)"); return { matches: reducedMotion }; },
      // Exercise the existing transport without loading the external compression library.
      LZString: { compressToEncodedURIComponent: encodeURIComponent, decompressFromEncodedURIComponent: decodeURIComponent }
    },
    history: { replaceState(_state, _unused, url) { replacedUrls.push(url); location.hash = url.slice(url.indexOf("#")); } },
    navigator: {},
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => now },
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback) { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  script.runInContext(context);
  document.emit("DOMContentLoaded");
  return {
    element, chips, audio, replacedUrls, storage, katexRenders,
    run: (code) => vm.runInContext(code, context),
    state: () => JSON.parse(vm.runInContext("JSON.stringify(getStatePayload())", context)),
    chip: (name) => chips.find((button) => button.dataset.preset === name),
    pendingFrames: () => frames.size,
    frame(ms = 0) {
      now += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    }
  };
}

function change(app, id, value, type = "input") {
  const element = app.element(id);
  if (typeof value === "boolean") element.checked = value;
  else element.value = value;
  element.emit(type);
}

function assertPreset(app, name) {
  assert.equal(app.state().currentPreset, name);
  for (const button of app.chips) {
    assert.equal(button.getAttribute("aria-pressed"), String(button.dataset.preset === name));
    assert.equal(button.classList.contains("is-active"), button.dataset.preset === name);
  }
}

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
}

function sampledRms(fn) {
  const values = Array.from({ length: 1024 }, (_, i) => fn(i / 1023));
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

test("markup exposes all seven preset buttons, including Custom, with no preset dropdown", () => {
  assert.deepEqual(presetButtons.map(({ preset }) => preset).sort(),
    ["none", "pure", "square", "sawtooth", "triangle", "spike", "randomDecay"].sort());
  assert.equal(presetButtons.find(({ preset }) => preset === "none").label, "Custom");
  assert.doesNotMatch(markup, /\bid\s*=\s*(["'])presetSelect\1/);
});

test("startup and reset retain the blank Custom preset and coefficient defaults", () => {
  const app = createApp();
  assert.equal(app.element("presetSelect"), null);
  assert.equal(app.run('document.querySelector("#presetSelect")'), null);
  app.frame();
  const initial = app.state();
  assertPreset(app, "none");
  assert.equal(initial.N, 32);
  assert.equal(initial.Npartial, 8);
  assert.equal(initial.selectedHarmonic, 1);
  assert.equal(initial.a0, 0);
  assert.ok(initial.a.every((value) => value === 0));
  assert.ok(initial.b.every((value) => value === 0));
  assert.equal(app.element("summaryHarmonics").textContent, "32");
  assert.equal(app.element("summaryActive").textContent, "0");
  assert.equal(app.element("summaryRms").textContent, "0.000");
  assert.equal(app.element("buildWaveProgress").textContent, "1 / 32");
  app.chip("square").emit("click");
  app.element("resetBtn").emit("click");
  app.frame();
  assertPreset(app, "none");
  assert.deepEqual(app.state(), initial);
});

test("preset buttons preserve existing coefficients, including the selected pure harmonic", () => {
  const app = createApp();
  const formulas = {
    square: (n) => n % 2 ? 4 / (Math.PI * n) : 0,
    sawtooth: (n) => (2 / Math.PI) * (n % 2 ? 1 : -1) / n,
    triangle: (n) => n % 2 ? (8 / Math.PI ** 2) * (((n - 1) / 2) % 2 ? -1 : 1) / n ** 2 : 0
  };
  for (const [name, coefficient] of Object.entries(formulas)) {
    app.chip(name).emit("click");
    assertPreset(app, name);
    const state = app.state();
    assert.ok(state.a.every((value) => value === 0));
    for (let n = 1; n <= state.N; n++) assert.equal(state.b[n], Math.fround(coefficient(n)));
  }
  change(app, "harmonicSelect", 7, "change");
  app.chip("pure").emit("click");
  assertPreset(app, "pure");
  assert.deepEqual(app.state().b.map((value, n) => value ? n : 0).filter(Boolean), [7]);
  assert.equal(app.state().b[7], 1);
  app.chip("spike").emit("click");
  assertPreset(app, "spike");
  assert.ok(app.state().b.slice(1, 33).every((value) => value === 1));
  app.chip("randomDecay").emit("click");
  assertPreset(app, "randomDecay");
  for (let n = 1; n <= 32; n++) near(app.run(`computeAphi(${n}).A`), 1 / n);
});

test("Custom reflects edits and restores without clearing coefficients until its button is clicked", () => {
  const app = createApp();
  app.chip("square").emit("click");
  change(app, "a0Slider", 0.5);
  change(app, "aSlider", 0.75);
  change(app, "bSlider", -0.25);
  app.frame();
  assertPreset(app, "none");
  const edited = app.state();
  assert.equal(edited.a0, 0.5);
  assert.equal(edited.a[1], 0.75);
  assert.equal(edited.b[1], -0.25);
  assert.equal(edited.b[3], Math.fround(4 / (3 * Math.PI)));
  for (const source of ["sessionState", "hashState"]) {
    const restored = createApp({ [source]: edited });
    restored.frame();
    assertPreset(restored, "none");
    assert.deepEqual(restored.state(), edited, source);
  }
  app.chip("none").emit("click");
  app.frame();
  assertPreset(app, "none");
  const cleared = app.state();
  assert.equal(cleared.a0, 0);
  assert.ok(cleared.a.every((value) => value === 0));
  assert.ok(cleared.b.every((value) => value === 0));
  assert.ok(Array.from(app.run("lastSamples")).every((value) => value === 0));
});

test("coefficient edits and existing filter actions select the Custom preset button", () => {
  const app = createApp();
  const actions = [
    () => change(app, "a0Slider", 0.2),
    () => change(app, "t0Slider", 0.1),
    () => change(app, "aSlider", 0.3),
    () => change(app, "bSlider", 0.4),
    () => change(app, "ampSlider", 0.8),
    () => change(app, "phiSlider", 0.5),
    () => change(app, "harmonicsSlider", 16),
    () => change(app, "evenOnly", true, "change"),
    () => change(app, "evenOnly", false, "change"),
    () => change(app, "oddOnly", true, "change"),
    ...["applyDecayBtn", "randomPhaseBtn", "lowPassBtn", "bandPassBtn", "highPassBtn"].map((id) => () => app.element(id).emit("click"))
  ];
  for (const action of actions) {
    app.chip("square").emit("click");
    action();
    assertPreset(app, "none");
  }
});

test("summary reports effective nonzero harmonics and the displayed waveform RMS", () => {
  const app = createApp();
  change(app, "a0Slider", 2);
  change(app, "aSlider", 0.75);
  change(app, "bSlider", 0.5);
  change(app, "harmonicSelect", 2, "change");
  change(app, "bSlider", 0.25);
  app.run("state.b[40] = 10");
  app.frame();
  const expected = sampledRms((t) => 1 + 0.75 * Math.cos(2 * Math.PI * t) + 0.5 * Math.sin(2 * Math.PI * t) + 0.25 * Math.sin(4 * Math.PI * t));
  assert.equal(app.element("summaryActive").textContent, "2");
  assert.equal(app.element("summaryRms").textContent, expected.toFixed(3));
  assert.equal(app.element("waveformLabel").textContent, "f(t)");
  change(app, "normalizeRms", true, "change");
  change(app, "autoScalePlot", false, "change");
  app.frame();
  // The existing main waveform is unnormalized; this readout must not alter that behavior.
  near(app.run("computeRMS(lastSamples)"), expected);
  assert.equal(app.element("summaryRms").textContent, expected.toFixed(3));
  change(app, "derivativeToggle", true, "change");
  app.frame();
  const derivativeRms = sampledRms((t) => -1.5 * Math.PI * Math.sin(2 * Math.PI * t) + Math.PI * Math.cos(2 * Math.PI * t) + Math.PI * Math.cos(4 * Math.PI * t));
  assert.equal(app.element("summaryRms").textContent, derivativeRms.toFixed(3));
  assert.equal(app.element("summaryActive").textContent, "2");
  assert.equal(app.element("waveformLabel").textContent, "f′(t)");
  change(app, "harmonicsSlider", 1);
  app.frame();
  assert.equal(app.element("summaryHarmonics").textContent, "1");
  assert.equal(app.element("summaryActive").textContent, "1");
});

test("all plot paints use the muted palette without changing logical dimensions", () => {
  const app = createApp();
  app.chip("square").emit("click");
  change(app, "showPartial", true, "change");
  change(app, "showLadder", true, "change");
  app.frame();
  const palette = new Set(app.run("Object.values(PALETTE)"));
  for (const id of ["waveformCanvas", "spectrumCanvas", "phasorCanvas", "buildWaveCanvas"]) {
    const canvas = app.element(id);
    assert.equal(canvas.width, 800);
    assert.equal(canvas.height, id === "phasorCanvas" ? 320 : 300);
    assert.equal(canvas.context.paints[0].color, "#fffdf8");
    assert.ok(canvas.context.paints.every(({ color }) => palette.has(color)), id);
  }
  const colors = (id) => new Set(app.element(id).context.paints.map(({ color }) => color));
  assert.ok(colors("waveformCanvas").has("#245d8f"));
  assert.ok(colors("waveformCanvas").has("#cf6158"));
  assert.ok(colors("spectrumCanvas").has("#187b77"));
  assert.ok(colors("spectrumCanvas").has("#7256a4"));
  assert.ok(colors("phasorCanvas").has("#7256a4"));
  assert.ok(colors("phasorCanvas").has("#bc7a1e"));
  assert.ok(colors("buildWaveCanvas").has("#cf6158"));
});

test("spectrum selection repaints via scaled pointer, dropdown, and arrow keys", () => {
  const app = createApp();
  app.frame();
  const canvas = app.element("spectrumCanvas");
  const initialDraws = canvas.context.clears;
  canvas.emit("click", { clientX: 20 + 400 * (4.5 / 32) });
  app.frame();
  assert.equal(app.state().selectedHarmonic, 5);
  assert.equal(app.element("harmonicSelect").value, "5");
  assert.equal(canvas.context.clears, initialDraws + 1);
  const highlight = canvas.context.paints.find(({ kind, color }) => kind === "strokeRect" && color === "#bc7a1e");
  assert.equal(highlight.args[0], 100.5);
  assert.ok(highlight.alpha < 1);
  const right = canvas.emit("keydown", { key: "ArrowRight" });
  assert.equal(right.defaultPrevented, true);
  assert.equal(app.state().selectedHarmonic, 6);
  canvas.emit("keydown", { key: "ArrowLeft" });
  assert.equal(app.state().selectedHarmonic, 5);
  change(app, "harmonicSelect", 32, "change");
  canvas.emit("keydown", { key: "ArrowRight" });
  assert.equal(app.state().selectedHarmonic, 32);
  change(app, "harmonicSelect", 1, "change");
  canvas.emit("keydown", { key: "ArrowLeft" });
  assert.equal(app.state().selectedHarmonic, 1);
  assert.equal(canvas.emit("keydown", { key: "ArrowRight", ctrlKey: true }).defaultPrevented, false);
  assert.equal(canvas.emit("keydown", { key: "Tab" }).defaultPrevented, false);
  app.frame();
  assert.equal(canvas.context.clears, initialDraws + 2);
});

test("pause freezes both animations, edits redraw, and resume preserves elapsed time", () => {
  const app = createApp({ reducedMotion: false });
  const button = app.element("animationToggle");
  const build = app.element("buildWaveCanvas").context;
  const phasor = app.element("phasorCanvas").context;
  assert.equal(button.textContent, "Play motion");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  button.emit("click");
  assert.equal(button.textContent, "Pause motion");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.match(button.getAttribute("aria-label"), /^Pause /);
  app.frame();
  const initialBuilds = build.clears;
  app.frame(100);
  assert.equal(build.clears, initialBuilds);
  app.frame(280);
  assert.equal(build.clears, initialBuilds + 1);
  assert.equal(app.element("buildWaveProgress").textContent, "2 / 32");
  app.frame(90);
  button.emit("click");
  assert.equal(button.textContent, "Play motion");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.match(button.getAttribute("aria-label"), /^Play /);
  const frozenPhasors = phasor.clears;
  app.frame(5000);
  assert.equal(app.run("motionElapsedMs"), 470);
  assert.equal(phasor.clears, frozenPhasors);
  assert.equal(build.clears, initialBuilds + 1);
  change(app, "aSlider", 0.5);
  app.frame();
  assert.equal(phasor.clears, frozenPhasors + 1);
  assert.equal(build.clears, initialBuilds + 2);
  assert.equal(app.run("motionElapsedMs"), 470);
  assert.equal(app.pendingFrames(), 0);
  button.emit("click");
  app.frame(200);
  assert.equal(app.run("motionElapsedMs"), 670);
  assert.equal(build.clears, initialBuilds + 2);
  app.frame(90);
  assert.equal(app.run("motionElapsedMs"), 760);
  assert.equal(app.element("buildWaveProgress").textContent, "3 / 32");
  assert.equal(build.clears, initialBuilds + 3);
  assert.equal(app.pendingFrames(), 1);
  assert.equal(app.audio.contexts, 0);
});

test("reduced motion starts static, and build progress clamps and wraps with N", () => {
  const app = createApp({ reducedMotion: true });
  app.frame();
  assert.equal(app.element("animationToggle").getAttribute("aria-pressed"), "false");
  assert.equal(app.pendingFrames(), 0);
  change(app, "harmonicsSlider", 3);
  app.frame();
  app.element("animationToggle").emit("click");
  app.frame(380);
  app.frame(380);
  assert.equal(app.element("buildWaveProgress").textContent, "3 / 3");
  app.frame(380);
  assert.equal(app.element("buildWaveProgress").textContent, "1 / 3");
  app.frame(380);
  app.element("animationToggle").emit("click");
  change(app, "harmonicsSlider", 1);
  app.frame();
  assert.equal(app.run("buildWaveK"), 1);
  assert.equal(app.element("buildWaveProgress").textContent, "1 / 1");
  const draws = app.element("buildWaveCanvas").context.clears;
  app.element("animationToggle").emit("click");
  app.frame(380);
  assert.equal(app.element("buildWaveCanvas").context.clears, draws);
});

test("both motion preferences start paused on fresh and legacy restores until Play is clicked", () => {
  const payload = {
    N: 4, a0: 0.5, a: [0, 0.75], b: [0, -0.5, 0.25], t0: 0.125,
    Npartial: 2, selectedHarmonic: 1, buildWaveTermMode: "complex",
    audio: { enabled: true, f0: 330, volume: 0.4, removeDC: false }
  };
  const starts = [
    ["fresh", {}],
    ["session", { sessionState: { ...payload, currentPreset: "spike" } }],
    ["hash", { hashState: { ...payload, currentPreset: "randomDecay" }, sessionState: { ...payload, currentPreset: "spike" } }]
  ];
  for (const reducedMotion of [false, true]) {
    for (const [source, options] of starts) {
      const label = `${source}, reducedMotion=${reducedMotion}`;
      const app = createApp({ ...options, reducedMotion });
      const button = app.element("animationToggle");
      assert.equal(button.textContent, "Play motion", label);
      assert.equal(button.getAttribute("aria-pressed"), "false", label);
      assert.match(button.getAttribute("aria-label"), /^Play /, label);
      app.frame();
      assertPreset(app, options.hashState?.currentPreset ?? options.sessionState?.currentPreset ?? "none");
      assert.equal(app.pendingFrames(), 0, label);
      const drawCounts = () => ["phasorCanvas", "buildWaveCanvas"].map((id) => app.element(id).context.clears);
      const initialDraws = drawCounts();
      const initialWave = waveformSnapshot(app);
      app.frame(5000);
      assert.deepEqual(drawCounts(), initialDraws, label);
      assert.deepEqual(waveformSnapshot(app), initialWave, label);
      assert.equal(app.run("motionElapsedMs"), 0, label);
      assert.equal(app.run("buildWaveK"), 1, label);
      assert.equal(app.state().audio.enabled, false, label);
      assert.equal(app.audio.contexts, 0, label);

      button.emit("click");
      assert.equal(button.textContent, "Pause motion", label);
      assert.equal(button.getAttribute("aria-pressed"), "true", label);
      assert.equal(app.pendingFrames(), 1, label);
      app.frame(380);
      assert.equal(app.run("motionElapsedMs"), 380, label);
      assert.deepEqual(drawCounts(), initialDraws.map((count) => count + 1), label);
      assert.equal(app.element("buildWaveProgress").textContent, `2 / ${app.state().N}`, label);
      button.emit("click");
      assert.equal(button.textContent, "Play motion", label);
      assert.equal(button.getAttribute("aria-pressed"), "false", label);
      assert.equal(app.pendingFrames(), 0, label);
      const pausedDraws = drawCounts();
      app.frame(5000);
      assert.deepEqual(drawCounts(), pausedDraws, label);
      assert.equal(app.run("motionElapsedMs"), 380, label);
      assert.equal(app.state().audio.enabled, false, label);
      assert.equal(app.audio.contexts, 0, label);
      assert.equal(app.audio.starts, 0, label);
    }
  }
});

test("session/hash restores synchronize preset and coefficient modes without autoplay", () => {
  const payload = {
    N: 8, a0: 0.2, a: [0, 0.5], b: [0, 1, 0.25], t0: 0.125,
    Npartial: 4, showPartial: true, showLadder: true, selectedHarmonic: 2,
    editMode: "Aphi", buildWaveTermMode: "complex", currentPreset: "triangle",
    audio: { enabled: true, f0: 330, volume: 0.4, removeDC: false }
  };
  const app = createApp({ sessionState: payload });
  app.frame();
  assertPreset(app, "triangle");
  assert.equal(app.element("modeAb").getAttribute("aria-pressed"), "false");
  assert.equal(app.element("modeAphi").getAttribute("aria-pressed"), "true");
  assert.equal(app.element("modeAphi").classList.contains("active"), true);
  assert.equal(app.element("abControls").classList.contains("hidden"), true);
  assert.equal(app.element("aphiControls").classList.contains("hidden"), false);
  assert.equal(app.state().audio.enabled, false);
  assert.equal(app.audio.contexts, 0);
  assert.equal(app.element("audioToggle").textContent, "Play sound");
  app.element("modeAb").emit("click");
  assert.equal(app.element("modeAb").getAttribute("aria-pressed"), "true");
  assert.equal(app.element("modeAphi").getAttribute("aria-pressed"), "false");
  app.run("saveStateToSession()");
  assert.deepEqual(JSON.parse(app.storage.get("fourier-app-state")), app.state());
  app.flushTimers();
  assert.equal(app.replacedUrls.length, 1);
  const encoded = app.replacedUrls[0].split("#f=")[1];
  assert.deepEqual(JSON.parse(decodeURIComponent(encoded)), app.state());
  const hashApp = createApp({ hashState: { ...payload, currentPreset: "square" }, sessionState: payload });
  hashApp.frame();
  assertPreset(hashApp, "square");
  assert.equal(hashApp.state().t0, payload.t0);
  assert.equal(hashApp.element("harmonicSelect").value, "2");
  assert.equal(hashApp.audio.contexts, 0);
});

test("sound control remains opt-in and retains oscillator/coefficient semantics", async () => {
  const app = createApp();
  app.chip("pure").emit("click");
  app.frame();
  const button = app.element("audioToggle");
  assert.equal(app.audio.contexts, 0);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  await Promise.all(button.emit("click").results);
  assert.equal(button.textContent, "Stop sound");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-label"), "Stop sound");
  assert.equal(app.audio.starts, 1);
  assert.equal(app.audio.oscillator.frequency.value, 220);
  assert.equal(app.audio.gain.gain.value, 0.3);
  assert.equal(app.audio.oscillator.wave.imag[1], 1);
  assert.equal(app.audio.oscillator.wave.options.disableNormalization, true);
  change(app, "freqSlider", 440);
  change(app, "volumeSlider", 0.2);
  assert.equal(app.audio.oscillator.frequency.value, 440);
  assert.equal(app.audio.gain.gain.value, 0.2);
  change(app, "a0Slider", 2);
  change(app, "removeDc", false, "change");
  app.frame();
  assert.equal(app.audio.oscillator.wave.real[0], 1);
  await Promise.all(button.emit("click").results);
  assert.equal(button.textContent, "Play sound");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(app.audio.stops, 1);
});

test("amplitude/phase conversion, time shift, DC, and derivative math regressions", () => {
  const app = createApp();
  app.run("state.N = 3; state.a0 = 2; setFromAphi(2, 1.25, 0.7)");
  near(app.run("computeAphi(2).A"), 1.25);
  near(app.run("computeAphi(2).phi"), 0.7);
  app.run("state.a.fill(0); state.b.fill(0); state.b[1] = 1; state.t0 = 0.25");
  const samples = Array.from(app.run("evaluateWaveform(state.a0, state.a, state.b, state.N, 5, state.t0)"));
  [0, 1, 2, 1, 0].forEach((expected, i) => near(samples[i], expected));
  assert.equal(app.run("computeRMS(new Float32Array([3, -3]))"), 3);
  app.run("state.derivativeView = true; state.a[2] = 0.5");
  const derivative = app.run("getEffectiveCoeffs()");
  assert.equal(derivative.a0Use, 0);
  near(derivative.aUse[1], 2 * Math.PI);
  near(derivative.bUse[2], -2 * Math.PI);
  assert.equal(app.state().a0, 2);
  assert.equal(app.state().a[2], 0.5);
});

test("new optional outputs and motion button may be absent from older markup", () => {
  const app = createApp({ missing: ["animationToggle", "summaryHarmonics", "summaryActive", "summaryRms", "buildWaveProgress", "waveformLabel"] });
  app.frame();
  app.chip("pure").emit("click");
  app.frame();
  assertPreset(app, "pure");
});

const notationOutputs = {
  ab: "buildWaveTermsAb",
  aphi: "buildWaveTermsAphi",
  complex: "buildWaveTermsComplex"
};
const legacyNotationElements = [
  "buildWaveTerms",
  ...["ab", "aphi", "complex"].map((mode) => `input[name="buildWaveTermMode"][value="${mode}"]`)
];

function compactTex(tex) {
  return tex.replace(/\\(?:left|right|qquad|quad|[,;:! ])/g, "")
    .replace(/[\s&]/g, "")
    .replace(/\\mathrm\{([ie])\}/g, "$1");
}

function renderedTerms(app, harmonics) {
  const terms = {};
  for (const [format, id] of Object.entries(notationOutputs)) {
    const element = app.element(id);
    if (!element) continue;
    const captures = app.katexRenders.filter((capture) => capture.element === element);
    assert.ok(captures.length, `${id} must render on this update`);
    for (const { options } of captures) assert.equal(options.displayMode, true, id);
    assert.equal(element.hidden, false, id);
    assert.equal(element.getAttribute("hidden"), null, id);
    assert.notEqual(element.getAttribute("aria-hidden"), "true", id);
    assert.equal(element.classList.contains("hidden"), false, id);
    assert.notEqual(element.style.display, "none", id);
    assert.notEqual(element.style.visibility, "hidden", id);
    const tex = compactTex(captures.at(-1).tex);
    assert.doesNotMatch(tex, /NaN|Infinity|\+\-/, id);
    const aligned = tex.match(/^\\begin\{aligned\}(.+)\\end\{aligned\}$/);
    assert.ok(aligned, `${id}: expected aligned rows, got ${tex}`);
    const rows = aligned[1].split(/\\\\(?:\[[^\]]*\])?/).map((row) => {
      const match = row.match(/^n=(\d+):(.+)$/);
      assert.ok(match, `${id}: missing harmonic label in ${row}`);
      return [Number(match[1]), match[2]];
    });
    assert.deepEqual(rows.map(([n]) => n), harmonics, `${id}: harmonic rows`);
    terms[format] = new Map(rows);
  }
  return terms;
}

function assertNotationHarmonic(terms, n, a, b) {
  // Ignore layout and compare numeric values to the existing two-decimal display precision.
  const number = String.raw`\d+(?:\.\d+)?`;
  const signed = `[+-]?${number}`;
  const angle = String.raw`2\\pi${n === 1 ? "1?" : n}t`;
  const check = (actual, expected) => near(Number(actual), expected, 0.0051);
  const ab = terms.ab.get(n);
  const abMatch = ab.match(new RegExp(String.raw`^(${signed})\\cos\(${angle}\)([+-]${number})\\sin\(${angle}\)$`));
  assert.ok(abMatch, `n=${n}: expected a*cos + b*sin, got ${ab}`);
  check(abMatch[1], a);
  check(abMatch[2], b);
  const aphi = terms.aphi.get(n);
  const aphiMatch = aphi.match(new RegExp(String.raw`^(${number})\\sin\(${angle}([+-]${number})\)$`));
  assert.ok(aphiMatch, `n=${n}: expected A*sin(angle +/- phi), got ${aphi}`);
  check(aphiMatch[1], Math.hypot(a, b));
  check(aphiMatch[2], Math.atan2(a, b));
  const complex = terms.complex.get(n);
  const complexMatch = complex.match(new RegExp(String.raw`^\((${signed})([+-]${number})i\)e\^\{\+?i${angle}\}\+\((${signed})([+-]${number})i\)e\^\{-i${angle}\}$`));
  assert.ok(complexMatch, `n=${n}: expected conjugate coefficients and opposite exponents, got ${complex}`);
  [a / 2, -b / 2, a / 2, b / 2].forEach((expected, i) => check(complexMatch[i + 1], expected));
}

function waveformSnapshot(app) {
  return { state: app.state(), samples: Array.from(app.run("lastSamples")) };
}

test("all three notations render together and refresh after preset and coefficient edits without radios", () => {
  const app = createApp({ withKatex: true, missing: legacyNotationElements });
  const harmonics = [1, 2, 3, 32];
  app.frame();
  let terms = renderedTerms(app, harmonics);
  for (const n of harmonics) assertNotationHarmonic(terms, n, 0, 0);
  const initial = waveformSnapshot(app);
  app.katexRenders.length = 0;
  app.run("updateBuildWaveTerms()");
  renderedTerms(app, harmonics);
  assert.equal(app.katexRenders.length, 3);
  assert.deepEqual(waveformSnapshot(app), initial);

  const updates = [
    [() => app.chip("square").emit("click"), (n) => [0, n % 2 ? 4 / (Math.PI * n) : 0]],
    [() => app.chip("sawtooth").emit("click"), (n) => [0, (2 / Math.PI) * (n % 2 ? 1 : -1) / n]],
    [() => { change(app, "aSlider", -0.75); change(app, "bSlider", 1); }, () => [-0.75, 1]],
    [() => { change(app, "ampSlider", 1.25); change(app, "phiSlider", -0.7); }, () => [1.25 * Math.sin(-0.7), 1.25 * Math.cos(-0.7)]]
  ];
  for (const [i, [update, coefficients]] of updates.entries()) {
    app.katexRenders.length = 0;
    update();
    app.frame();
    terms = renderedTerms(app, harmonics);
    for (const n of i < 2 ? harmonics : [1]) assertNotationHarmonic(terms, n, ...coefficients(n));
  }
});

test("notation preserves negative coefficients, phase quadrants, and conjugate signs", () => {
  const app = createApp({ withKatex: true });
  const coefficients = [[1, -0.75, 1], [2, -0.75, -1], [3, 0.75, -1], [5, 0.75, 1]];
  change(app, "harmonicsSlider", 5);
  for (const [n, a, b] of coefficients) {
    change(app, "harmonicSelect", n, "change");
    change(app, "aSlider", a);
    change(app, "bSlider", b);
  }
  app.frame();
  const terms = renderedTerms(app, [1, 2, 3, 5]);
  for (const [n, a, b] of coefficients) assertNotationHarmonic(terms, n, a, b);
});

test("notation uses time-shifted effective coefficients, including derivatives, without mutating the wave", () => {
  const app = createApp({ withKatex: true });
  const coefficients = [[1, 0.75, -0.5], [2, -0.25, 1], [3, 0, 0], [4, 0.5, 0.25]];
  change(app, "harmonicsSlider", 4);
  change(app, "a0Slider", 2);
  for (const [n, a, b] of coefficients) {
    change(app, "harmonicSelect", n, "change");
    change(app, "aSlider", a);
    change(app, "bSlider", b);
  }
  change(app, "normalizeRms", true, "change");
  change(app, "autoScalePlot", false, "change");
  for (const [t0, derivative] of [[0.125, false], [0.125, true], [0.25, true], [0, false]]) {
    app.katexRenders.length = 0;
    change(app, "t0Slider", t0);
    change(app, "derivativeToggle", derivative, "change");
    app.frame();
    const terms = renderedTerms(app, [1, 2, 3, 4]);
    const samples = Array.from(app.run("lastSamples"));
    const expectedSamples = [0, 341, 1023].map(() => derivative ? 0 : 1);
    for (const [n, a, b] of coefficients) {
      const omega = 2 * Math.PI * n;
      const aUse = derivative ? omega * b : a;
      const bUse = derivative ? -omega * a : b;
      const c = Math.cos(omega * t0);
      const s = Math.sin(omega * t0);
      assertNotationHarmonic(terms, n, c * aUse - s * bUse, s * aUse + c * bUse);
      for (const [i, index] of [0, 341, 1023].entries()) {
        const angle = omega * (index / 1023 - t0);
        expectedSamples[i] += aUse * Math.cos(angle) + bUse * Math.sin(angle);
      }
      assert.equal(app.state().a[n], a);
      assert.equal(app.state().b[n], b);
    }
    [0, 341, 1023].forEach((index, i) => near(samples[index], expectedSamples[i], 1e-5));
    assert.equal(app.state().a0, 2);
  }
});

test("notation limits rows to n=1..min(3,N) and the final harmonic as N grows and shrinks", () => {
  const app = createApp({ withKatex: true });
  app.run("state.a.fill(0.5); state.b.fill(-0.25)");
  for (const derivative of [false, true]) {
    change(app, "derivativeToggle", derivative, "change");
    for (const N of [1, 2, 3, 4, 8, 128, 2, 1]) {
      app.katexRenders.length = 0;
      change(app, "harmonicsSlider", N);
      app.frame();
      const harmonics = Array.from({ length: Math.min(3, N) }, (_, i) => i + 1);
      if (N > 3) harmonics.push(N);
      const terms = renderedTerms(app, harmonics);
      for (const n of harmonics) {
        assertNotationHarmonic(terms, n, derivative ? -0.5 * Math.PI * n : 0.5, derivative ? -Math.PI * n : -0.25);
      }
    }
  }
});

test("legacy hash and session notation modes restore other settings without hiding any format", () => {
  for (const source of ["hashState", "sessionState"]) {
    for (const buildWaveTermMode of ["ab", "aphi", "complex"]) {
      const payload = {
        N: 5, a0: 0.5, a: [0, 0.75, -0.5], b: [0, -1, 0.25], t0: 0.25,
        Npartial: 2, showPartial: true, showLadder: true, selectedHarmonic: 2,
        editMode: "Aphi", normalizeRMS: true, autoScalePlot: false, derivativeView: true,
        currentPreset: "triangle", buildWaveTermMode,
        audio: { enabled: true, f0: 330, volume: 0.4, removeDC: false }
      };
      const app = createApp({ withKatex: true, missing: legacyNotationElements, [source]: payload });
      app.frame();
      const restored = app.state();
      for (const [key, value] of Object.entries(payload)) {
        if (["a", "b", "audio", "buildWaveTermMode"].includes(key)) continue;
        assert.deepEqual(restored[key], value, `${source}/${buildWaveTermMode}: ${key}`);
      }
      assert.deepEqual(restored.a.slice(0, payload.a.length), payload.a);
      assert.deepEqual(restored.b.slice(0, payload.b.length), payload.b);
      assert.deepEqual(restored.audio, { ...payload.audio, enabled: false });
      assert.equal(app.audio.contexts, 0);
      assertPreset(app, "triangle");
      const terms = renderedTerms(app, [1, 2, 3, 5]);
      assertNotationHarmonic(terms, 1, 1.5 * Math.PI, -2 * Math.PI);
      app.katexRenders.length = 0;
      change(app, "aSlider", -0.25);
      app.frame();
      renderedTerms(app, [1, 2, 3, 5]);
    }
  }
});

test("missing notation outputs or KaTeX leave waveform state and samples unchanged", () => {
  const sessionState = {
    N: 2, a0: 2, a: [0, 0.75, -0.25], b: [0, -0.5, 1], t0: 0.125,
    Npartial: 2, selectedHarmonic: 1, currentPreset: "none"
  };
  const updates = [
    () => {},
    (app) => { change(app, "bSlider", 0.25); change(app, "derivativeToggle", true, "change"); }
  ];
  const reference = createApp({ withKatex: true, sessionState });
  const snapshots = updates.map((update) => {
    update(reference);
    reference.frame();
    renderedTerms(reference, [1, 2]);
    return waveformSnapshot(reference);
  });
  const ids = Object.values(notationOutputs);
  const cases = [
    ...ids.map((id) => ({ withKatex: true, missing: [id] })),
    { withKatex: true, missing: ids },
    { withKatex: false },
    { withKatex: false, missing: ids },
    { withKatex: true, missingRenderer: true }
  ];
  for (const options of cases) {
    const app = createApp({ ...options, sessionState });
    if (options.missingRenderer) app.run("window.katex = {}");
    const label = JSON.stringify(options);
    for (const [i, update] of updates.entries()) {
      app.katexRenders.length = 0;
      update(app);
      assert.doesNotThrow(() => app.frame(), label);
      assert.deepEqual(waveformSnapshot(app), snapshots[i], label);
      if (options.withKatex && !options.missingRenderer) {
        const terms = renderedTerms(app, [1, 2]);
        assert.equal(app.katexRenders.length, Object.keys(terms).length, label);
      } else {
        assert.equal(app.katexRenders.length, 0, label);
      }
    }
  }
});
