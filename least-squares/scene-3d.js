import * as THREE from "three";
import { ArcballControls } from "three/addons/controls/ArcballControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

const COLORS = {
  ink: 0x172033,
  axis: 0x7c8797,
  grid: 0x79a8a0,
  plane: 0xbfe3dc,
  data: 0x315efb,
  fit: 0x159a7d,
  residual: 0xe76551,
  candidate: 0xd89524,
  white: 0xffffff
};

const ORIGIN = new THREE.Vector3(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const VIEW_SIZE = 9.5;

function toVector3(values) {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

function coordinateDirection(index) {
  return new THREE.Vector3(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0);
}

function formatCoordinate(value) {
  const cleaned = Math.abs(value) < 1e-12 ? 0 : value;
  return cleaned.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
    if (child.isCSS2DObject && child.element) child.element.remove();
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    disposeObject(child);
  }
}

function makeLabel(text, className, position) {
  const element = document.createElement("span");
  element.className = `scene-label ${className}`;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(position);
  return label;
}

function makeLine(points, color, { opacity = 1, dashed = false } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: opacity < 1, opacity, dashSize: 0.13, gapSize: 0.1 })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function makeCylinderBetween(start, end, radius, color, opacity = 1) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1e-8) return new THREE.Group();

  const geometry = new THREE.CylinderGeometry(radius, radius, length, 14, 1, false);
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.position.copy(start).addScaledVector(direction, 0.5);
  cylinder.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return cylinder;
}

function makeArrow(start, end, color, {
  radius = 0.035,
  opacity = 1,
  label,
  labelClass = "",
  labelAt = 1,
  labelOffset = 0.18
} = {}) {
  const group = new THREE.Group();
  const direction = end.clone().sub(start);
  const length = direction.length();

  if (length < 0.035) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 2.2, 18, 12),
      new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    );
    dot.position.copy(end);
    group.add(dot);
  } else {
    const unit = direction.clone().normalize();
    const headLength = Math.min(0.34, Math.max(0.16, length * 0.2));
    const shaftEnd = end.clone().addScaledVector(unit, -headLength);
    group.add(makeCylinderBetween(start, shaftEnd, radius, color, opacity));

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 2.45, headLength, 18),
      new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    );
    cone.position.copy(end).addScaledVector(unit, -headLength * 0.5);
    cone.quaternion.setFromUnitVectors(Y_AXIS, unit);
    group.add(cone);
  }

  if (label) {
    const labelPosition = start.clone().lerp(end, THREE.MathUtils.clamp(labelAt, 0, 1));
    if (length >= 0.035 && labelOffset !== 0) {
      labelPosition.addScaledVector(direction.normalize(), labelOffset);
    }
    group.add(makeLabel(label, labelClass, labelPosition));
  }

  return group;
}

function makePlaneGeometry(q1, q2, halfSize) {
  const corners = [
    q1.clone().multiplyScalar(-halfSize).addScaledVector(q2, -halfSize),
    q1.clone().multiplyScalar(halfSize).addScaledVector(q2, -halfSize),
    q1.clone().multiplyScalar(halfSize).addScaledVector(q2, halfSize),
    q1.clone().multiplyScalar(-halfSize).addScaledVector(q2, halfSize)
  ];
  const positions = corners.flatMap((corner) => [corner.x, corner.y, corner.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function addPlane(group, model, opacity) {
  const q1 = toVector3(model.orthonormalBasis[0]);
  const halfSize = 3.65;

  if (model.rank === 1) {
    const start = q1.clone().multiplyScalar(-4.15);
    const end = q1.clone().multiplyScalar(4.15);
    group.add(makeCylinderBetween(start, end, 0.045, COLORS.fit, 0.62));
    group.add(makeLine([start, end], COLORS.grid, { opacity: 0.8, dashed: true }));
    group.add(makeLabel("C(X) · rank 1", "plane-label", q1.clone().multiplyScalar(3.05)));
    return;
  }

  const q2 = toVector3(model.orthonormalBasis[1]);
  const mesh = new THREE.Mesh(
    makePlaneGeometry(q1, q2, halfSize),
    new THREE.MeshBasicMaterial({
      color: COLORS.plane,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  mesh.renderOrder = -2;
  group.add(mesh);

  const gridPoints = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    const distance = offset * (halfSize / 3);
    gridPoints.push(
      q1.clone().multiplyScalar(-halfSize).addScaledVector(q2, distance),
      q1.clone().multiplyScalar(halfSize).addScaledVector(q2, distance),
      q2.clone().multiplyScalar(-halfSize).addScaledVector(q1, distance),
      q2.clone().multiplyScalar(halfSize).addScaledVector(q1, distance)
    );
  }
  const gridGeometry = new THREE.BufferGeometry().setFromPoints(gridPoints);
  const grid = new THREE.LineSegments(
    gridGeometry,
    new THREE.LineBasicMaterial({ color: COLORS.grid, transparent: true, opacity: Math.min(0.5, opacity + 0.16) })
  );
  group.add(grid);
  group.add(makeLabel("C(X)", "plane-label", q1.clone().multiplyScalar(2.65).addScaledVector(q2, 2.55)));
}

function addBasis(group, model, strong) {
  const ones = toVector3(model.columns.ones);
  const x = toVector3(model.columns.x);
  const opacity = strong ? 0.82 : 0.42;
  group.add(makeArrow(ORIGIN, ones, COLORS.fit, {
    radius: 0.022,
    opacity,
    label: "1",
    labelClass: "basis-label"
  }));
  group.add(makeArrow(ORIGIN, x, COLORS.grid, {
    radius: 0.022,
    opacity,
    label: "x",
    labelClass: "basis-label"
  }));
}

function addRightAngle(group, model, useCandidateDirection) {
  const residual = toVector3(model.residual);
  if (residual.length() < 1e-5) return;

  const origin = toVector3(model.yHat);
  const residualDirection = residual.normalize();
  let planeDirection = useCandidateDirection ? toVector3(model.inPlaneMovement) : new THREE.Vector3();
  if (planeDirection.length() < 1e-5) planeDirection = toVector3(model.orthonormalBasis[0]);
  planeDirection.normalize();

  const size = 0.28;
  const first = origin.clone().addScaledVector(planeDirection, size);
  const corner = first.clone().addScaledVector(residualDirection, size);
  const second = origin.clone().addScaledVector(residualDirection, size);
  group.add(makeLine([first, corner, second], COLORS.residual, { opacity: 0.95 }));
}

function addAxes(group) {
  const labels = ["y₁", "y₂", "y₃"];
  const labelElements = [];

  labels.forEach((label, index) => {
    const direction = coordinateDirection(index);
    const negative = direction.clone().multiplyScalar(-4.15);
    const positive = direction.clone().multiplyScalar(4.15);
    const axisArrow = makeArrow(ORIGIN, positive, COLORS.axis, {
      radius: 0.012,
      opacity: 0.68,
      label,
      labelClass: "axis-label",
      labelOffset: 0.1
    });
    axisArrow.traverse((child) => {
      if (child.isCSS2DObject) labelElements[index] = child.element;
    });
    group.add(makeLine([negative, ORIGIN], COLORS.axis, { opacity: 0.28, dashed: true }));
    group.add(axisArrow);
  });

  const originDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 10),
    new THREE.MeshBasicMaterial({ color: COLORS.ink })
  );
  group.add(originDot);
  group.add(makeLabel("0", "origin-label", new THREE.Vector3(-0.16, -0.16, -0.12)));
  return labelElements;
}

function addObservationHighlight(group, model, index) {
  const labels = ["y₁", "y₂", "y₃"];
  const axisDirection = coordinateDirection(index);
  const coordinateValue = model.y[index];
  const coordinatePoint = axisDirection.clone().multiplyScalar(coordinateValue);
  const dataPoint = toVector3(model.y);

  if (Math.abs(coordinateValue) > 1e-5) {
    group.add(makeCylinderBetween(ORIGIN, coordinatePoint, 0.04, COLORS.data, 0.92));
  }

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 20, 14),
    new THREE.MeshBasicMaterial({ color: COLORS.data })
  );
  marker.position.copy(coordinatePoint);
  group.add(marker);

  if (coordinatePoint.distanceTo(dataPoint) > 1e-5) {
    group.add(makeLine([coordinatePoint, dataPoint], COLORS.data, { opacity: 0.3, dashed: true }));
  }

  const labelPosition = coordinatePoint.clone().addScaledVector(
    axisDirection,
    coordinateValue >= 0 ? 0.3 : -0.3
  );
  group.add(makeLabel(
    `${labels[index]} = ${formatCoordinate(coordinateValue)}`,
    "coordinate-highlight-label",
    labelPosition
  ));
}

export function createProjectionScene(container) {
  if (!container) throw new TypeError("createProjectionScene requires a container element.");

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(7.4, -7.8, 6.3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrix();
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "scene-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "scene-label-layer";
  labelRenderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(labelRenderer.domElement);

  const controls = new ArcballControls(camera, labelRenderer.domElement, scene);
  controls.enablePan = false;
  controls.enableAnimations = false;
  controls.enableGrid = false;
  controls.rotateSpeed = 0.9;
  controls.scaleFactor = 1.08;
  controls.minZoom = 0.75;
  controls.maxZoom = 2.1;
  controls.target.set(0, 0, 0);
  controls.update();
  controls.setGizmosVisible(false);
  controls.saveState();

  const axesGroup = new THREE.Group();
  const dynamicGroup = new THREE.Group();
  const observationHighlightGroup = new THREE.Group();
  scene.add(axesGroup, dynamicGroup, observationHighlightGroup);
  const axisLabelElements = addAxes(axesGroup);
  let lastModel = null;
  let highlightedObservation = null;

  function resetCamera() {
    controls.reset();
    controls.setGizmosVisible(false);
    draw();
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    camera.left = -(VIEW_SIZE * aspect) / 2;
    camera.right = (VIEW_SIZE * aspect) / 2;
    camera.top = VIEW_SIZE / 2;
    camera.bottom = -VIEW_SIZE / 2;
    camera.updateProjectionMatrix();
    controls.update();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
    draw();
  }

  function draw() {
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function updateObservationHighlight() {
    clearGroup(observationHighlightGroup);
    axisLabelElements.forEach((element, index) => {
      element?.classList.toggle("is-observation-highlighted", index === highlightedObservation);
    });

    if (lastModel && Number.isInteger(highlightedObservation)) {
      addObservationHighlight(observationHighlightGroup, lastModel, highlightedObservation);
    }
  }

  function highlightObservation(index) {
    highlightedObservation = Number.isInteger(index) && index >= 0 && index < 3
      ? index
      : null;
    updateObservationHighlight();
    draw();
  }

  function render(model, options = {}) {
    lastModel = model;
    clearGroup(dynamicGroup);
    const step = Number.isFinite(options.step) ? options.step : 4;
    const showCandidate = Boolean(options.showCandidate);

    addPlane(dynamicGroup, model, step >= 1 ? 0.34 : 0.12);
    if (step >= 1) addBasis(dynamicGroup, model, step === 1 || step === 3);

    const y = toVector3(model.y);
    const yHat = toVector3(model.yHat);
    dynamicGroup.add(makeArrow(ORIGIN, y, COLORS.data, {
      radius: 0.033,
      label: "y",
      labelClass: "data-label",
      labelOffset: 0.24
    }));

    if (step >= 2) {
      dynamicGroup.add(makeArrow(ORIGIN, yHat, COLORS.fit, {
        radius: 0.031,
        label: "ŷ",
        labelClass: "fit-label",
        labelOffset: 0.2
      }));
      dynamicGroup.add(makeArrow(yHat, y, COLORS.residual, {
        radius: 0.027,
        label: "r",
        labelClass: "residual-label",
        labelAt: 0.56,
        labelOffset: 0
      }));
    }

    if (step >= 3) addRightAngle(dynamicGroup, model, false);

    if (showCandidate) {
      const candidate = toVector3(model.candidate);
      dynamicGroup.add(makeArrow(ORIGIN, candidate, COLORS.candidate, {
        radius: 0.026,
        opacity: 0.86,
        label: "Xβ",
        labelClass: "candidate-label"
      }));
      if (step >= 2) {
        dynamicGroup.add(makeLine([yHat, candidate], COLORS.candidate, { opacity: 0.95, dashed: true }));
      }
      if (step >= 4) {
        dynamicGroup.add(makeLine([candidate, y], COLORS.ink, { opacity: 0.52, dashed: true }));
        addRightAngle(dynamicGroup, model, true);
      }
    }

    updateObservationHighlight();
    draw();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  controls.addEventListener("change", draw);
  resetCamera();
  resize();

  function destroy() {
    resizeObserver.disconnect();
    controls.removeEventListener("change", draw);
    controls.dispose();
    clearGroup(observationHighlightGroup);
    clearGroup(dynamicGroup);
    clearGroup(axesGroup);
    renderer.dispose();
    renderer.domElement.remove();
    labelRenderer.domElement.remove();
  }

  return { render, highlightObservation, resetCamera, destroy };
}
