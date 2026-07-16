export const PRESETS = {
  projection: {
    label: "Clear projection",
    x: [-1, 0, 1],
    y: [0.2, 2.8, 1.1],
    h: [0.75, -0.5]
  },
  perfect: {
    label: "Perfect fit",
    x: [-1, 0, 1],
    y: [-1, 1, 3],
    h: [0.7, -0.45]
  },
  outlier: {
    label: "One outlier",
    x: [-1, 0, 1],
    y: [-0.5, 3.8, 1.8],
    h: [-0.65, 0.7]
  },
  uncentered: {
    label: "Uncentered x",
    x: [0, 1, 2],
    y: [0.3, 2.6, 1.4],
    h: [0.8, -0.55]
  },
  rankDeficient: {
    label: "Rank deficient",
    x: [1, 1, 1],
    y: [-0.5, 2.8, 1.2],
    h: [1.2, -1.2]
  }
};

function copyPreset(preset) {
  return {
    x: [...preset.x],
    y: [...preset.y],
    h: [...preset.h]
  };
}

export function createState() {
  return {
    ...copyPreset(PRESETS.projection),
    preset: "projection",
    step: 0,
    revision: 0
  };
}

export function applyPreset(state, name) {
  const preset = PRESETS[name] || PRESETS.projection;
  const values = copyPreset(preset);
  state.x = values.x;
  state.y = values.y;
  state.h = values.h;
  state.preset = name in PRESETS ? name : "projection";
  state.revision += 1;
}

export function markCustom(state) {
  state.preset = "custom";
  state.revision += 1;
}
