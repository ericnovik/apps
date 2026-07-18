import * as THREE from "three";
import { ArcballControls } from "three/addons/controls/ArcballControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

const COLORS = {
  ink: 0x172033,
  axis: 0x6f7b8d,
  ghost: 0xb8c0cc,
  grid: 0xaab5c2,
  flat: 0x58bca7,
  flatSurface: 0xbfe3dc,
  query: 0x315efb,
  projection: 0x159a7d,
  normal: 0xe76551,
  generated: 0x168ea3,
  transformed: 0xd89524,
  eigen: 0x7656c5,
  white: 0xffffff
};

const ORIGIN = new THREE.Vector3(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const VIEW_SIZE = 9.5;
const AXIS_EXTENT = 4.15;
const FLAT_EXTENT = 3.65;
const EPSILON = 1e-7;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function ambientDimension(value) {
  return THREE.MathUtils.clamp(Math.round(finiteNumber(value, 3)), 1, 3);
}

function toVector3(value, n = 3) {
  if (value?.isVector3) {
    const result = value.clone();
    if (n < 3) result.z = 0;
    if (n < 2) result.y = 0;
    if (![result.x, result.y, result.z].every(Number.isFinite)) return new THREE.Vector3();
    return result;
  }

  let x = 0;
  let y = 0;
  let z = 0;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    x = finiteNumber(value[0]);
    y = finiteNumber(value[1]);
    z = finiteNumber(value[2]);
  } else if (value && typeof value === "object") {
    x = finiteNumber(value.x ?? value[0]);
    y = finiteNumber(value.y ?? value[1]);
    z = finiteNumber(value.z ?? value[2]);
  }

  return new THREE.Vector3(x, n >= 2 ? y : 0, n >= 3 ? z : 0);
}

function coordinateDirection(index) {
  return new THREE.Vector3(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0);
}

function vectorList(value, n) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toVector3(entry, n));
}

function nonzeroDirections(value, n) {
  return vectorList(value, n).filter((direction) => direction.lengthSq() > EPSILON * EPSILON);
}

function unitDirections(value, n) {
  return nonzeroDirections(value, n).map((direction) => direction.normalize());
}

function formatNumber(value) {
  const numeric = finiteNumber(value);
  const cleaned = Math.abs(numeric) < 1e-10 ? 0 : numeric;
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

function makeLine(points, color, { opacity = 1, dashed = false, loop = false } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      dashSize: 0.14,
      gapSize: 0.1,
      depthWrite: opacity >= 1
    })
    : new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1
    });
  const line = loop ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function makeLineSegments(points, color, { opacity = 1, dashed = false } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      dashSize: 0.14,
      gapSize: 0.1,
      depthWrite: opacity >= 1
    })
    : new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1
    });
  const segments = new THREE.LineSegments(geometry, material);
  if (dashed) segments.computeLineDistances();
  return segments;
}

function makeCylinderBetween(start, end, radius, color, opacity = 1) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < EPSILON) return new THREE.Group();

  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 14, 1, false),
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1
    })
  );
  cylinder.position.copy(start).addScaledVector(direction, 0.5);
  cylinder.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return cylinder;
}

function makeArrow(start, end, color, {
  radius = 0.014,
  opacity = 1,
  label = "",
  labelClass = "scene-label--vector",
  labelAt = 1,
  labelOffset = 0.16
} = {}) {
  const group = new THREE.Group();
  const displacement = end.clone().sub(start);
  const length = displacement.length();

  if (length < 0.035) {
    const zeroMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(Math.max(0.045, radius * 2.4)),
      new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    );
    zeroMarker.position.copy(end);
    group.add(zeroMarker);
  } else {
    const direction = displacement.clone().normalize();
    const headLength = Math.min(0.24, Math.max(0.1, length * 0.16));
    const shaftEnd = end.clone().addScaledVector(direction, -headLength);
    group.add(makeCylinderBetween(start, shaftEnd, radius, color, opacity));

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 2.8, headLength, 18),
      new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    );
    cone.position.copy(end).addScaledVector(direction, -headLength * 0.5);
    cone.quaternion.setFromUnitVectors(Y_AXIS, direction);
    group.add(cone);
  }

  if (label) {
    const labelPosition = start.clone().lerp(end, THREE.MathUtils.clamp(labelAt, 0, 1));
    if (length >= 0.035 && labelOffset) {
      labelPosition.addScaledVector(displacement.clone().normalize(), labelOffset);
    } else if (length < 0.035) {
      labelPosition.add(new THREE.Vector3(0.15, 0.15, 0.12));
    }
    group.add(makeLabel(label, labelClass, labelPosition));
  }

  return group;
}

function makePoint(position, color, {
  radius = 0.075,
  label = "",
  labelClass = "scene-label--point",
  shape = "sphere",
  outlined = false,
  labelOffset = new THREE.Vector3(0.16, 0.16, 0.14)
} = {}) {
  const group = new THREE.Group();
  const geometry = shape === "diamond"
    ? new THREE.OctahedronGeometry(radius * 1.18)
    : new THREE.SphereGeometry(radius, 20, 14);
  const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
  marker.position.copy(position);
  group.add(marker);

  if (outlined) {
    const outline = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.35, 16, 12),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 })
    );
    outline.position.copy(position);
    group.add(outline);
  }

  if (label) group.add(makeLabel(label, labelClass, position.clone().add(labelOffset)));
  return group;
}

function planeGeometry(center, first, second, halfSize) {
  const corners = [
    center.clone().addScaledVector(first, -halfSize).addScaledVector(second, -halfSize),
    center.clone().addScaledVector(first, halfSize).addScaledVector(second, -halfSize),
    center.clone().addScaledVector(first, halfSize).addScaledVector(second, halfSize),
    center.clone().addScaledVector(first, -halfSize).addScaledVector(second, halfSize)
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(corners);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return { geometry, corners };
}

function addPlanePatch(group, center, firstDirection, secondDirection, {
  halfSize = FLAT_EXTENT,
  color = COLORS.flatSurface,
  lineColor = COLORS.flat,
  opacity = 0.18,
  gridOpacity = 0.2,
  outlineDashed = false,
  label = "",
  labelClass = "scene-label--flat"
} = {}) {
  const first = firstDirection.clone().normalize();
  const second = secondDirection.clone().normalize();
  if (first.lengthSq() < EPSILON || second.lengthSq() < EPSILON) return;

  const { geometry, corners } = planeGeometry(center, first, second, halfSize);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  mesh.renderOrder = -3;
  group.add(mesh);
  group.add(makeLine(corners, lineColor, { opacity: Math.min(1, gridOpacity + 0.18), dashed: outlineDashed, loop: true }));

  const gridPoints = [];
  for (let step = -2; step <= 2; step += 1) {
    const offset = step * halfSize / 2;
    gridPoints.push(
      center.clone().addScaledVector(first, -halfSize).addScaledVector(second, offset),
      center.clone().addScaledVector(first, halfSize).addScaledVector(second, offset),
      center.clone().addScaledVector(second, -halfSize).addScaledVector(first, offset),
      center.clone().addScaledVector(second, halfSize).addScaledVector(first, offset)
    );
  }
  group.add(makeLineSegments(gridPoints, lineColor, { opacity: gridOpacity }));

  if (label) {
    group.add(makeLabel(
      label,
      labelClass,
      center.clone().addScaledVector(first, halfSize * 0.7).addScaledVector(second, halfSize * 0.72)
    ));
  }
}

function addSpaceLattice(group, center) {
  const points = [];
  const extent = 2.7;
  for (let level = -2; level <= 2; level += 1) {
    const offset = level * 0.9;
    points.push(
      new THREE.Vector3(-extent, offset, -extent), new THREE.Vector3(extent, offset, -extent),
      new THREE.Vector3(-extent, offset, extent), new THREE.Vector3(extent, offset, extent),
      new THREE.Vector3(offset, -extent, -extent), new THREE.Vector3(offset, extent, -extent),
      new THREE.Vector3(offset, -extent, extent), new THREE.Vector3(offset, extent, extent),
      new THREE.Vector3(-extent, -extent, offset), new THREE.Vector3(extent, -extent, offset),
      new THREE.Vector3(-extent, extent, offset), new THREE.Vector3(extent, extent, offset)
    );
  }
  group.add(makeLineSegments(points, COLORS.flat, { opacity: 0.14 }));
  group.add(makeLabel("all of ℝ³ · unbounded", "scene-label--flat scene-label--space", center.clone().add(new THREE.Vector3(2.3, 2.2, 2.15))));
}

function flatName(dimension, n) {
  if (dimension <= 0) return "point";
  if (dimension === 1) return n === 1 ? "line · all of ℝ¹" : "line";
  if (dimension === 2) return n === 2 ? "plane · all of ℝ²" : "plane";
  return "3-space · all of ℝ³";
}

function flatData(model, n) {
  const anchor = toVector3(model.anchor, n);
  const directions = unitDirections(model.basis, n);
  const statedRank = Number.isFinite(Number(model.rank))
    ? Math.round(Number(model.rank))
    : Math.round(finiteNumber(model.k, directions.length));
  const dimension = THREE.MathUtils.clamp(Math.min(statedRank, directions.length), 0, n);
  return { anchor, directions: directions.slice(0, dimension), dimension };
}

function addFlat(group, model, n, { opacity = 0.25, label = true } = {}) {
  const data = flatData(model, n);
  const { anchor, directions, dimension } = data;

  if (dimension === 0) {
    if (label) group.add(makeLabel("0D point", "scene-label--flat", anchor.clone().add(new THREE.Vector3(0.25, -0.2, 0.2))));
    return data;
  }

  if (dimension === 1) {
    const direction = directions[0];
    const start = anchor.clone().addScaledVector(direction, -AXIS_EXTENT);
    const end = anchor.clone().addScaledVector(direction, AXIS_EXTENT);
    group.add(makeCylinderBetween(start, end, 0.018, COLORS.flat, Math.min(0.62, opacity + 0.3)));
    group.add(makeLine([start, end], COLORS.ink, { opacity: 0.34, dashed: true }));
    if (label) group.add(makeLabel(flatName(dimension, n), "scene-label--flat scene-label--line", anchor.clone().addScaledVector(direction, 2.8)));
    return data;
  }

  if (dimension === 2) {
    addPlanePatch(group, anchor, directions[0], directions[1], {
      opacity,
      label: label ? flatName(dimension, n) : ""
    });
    return data;
  }

  addSpaceLattice(group, anchor);
  return data;
}

function addAnchor(group, anchor) {
  group.add(makePoint(anchor, COLORS.ink, {
    radius: 0.065,
    label: "p",
    labelClass: "scene-label--anchor",
    shape: "diamond"
  }));
}

function addBasis(group, anchor, directions, { prefix = "q", color = COLORS.flat, opacity = 0.92 } = {}) {
  directions.forEach((direction, index) => {
    const end = anchor.clone().addScaledVector(direction, 1.35);
    group.add(makeArrow(anchor, end, color, {
      radius: 0.013,
      opacity,
      label: `${prefix}${index + 1}`,
      labelClass: "scene-label--basis"
    }));
  });
}

function addAxes(group, n) {
  const names = ["x", "y", "z"];
  for (let index = 0; index < 3; index += 1) {
    const direction = coordinateDirection(index);
    const start = direction.clone().multiplyScalar(-AXIS_EXTENT);
    const end = direction.clone().multiplyScalar(AXIS_EXTENT);
    const active = index < n;
    const color = active ? COLORS.axis : COLORS.ghost;
    const opacity = active ? 0.68 : 0.2;

    group.add(makeLine([start, ORIGIN], color, { opacity: opacity * 0.7, dashed: true }));
    group.add(makeArrow(ORIGIN, end, color, {
      radius: active ? 0.007 : 0.005,
      opacity,
      label: active ? names[index] : `${names[index]} · unavailable`,
      labelClass: active
        ? "scene-label--axis"
        : "scene-label--axis scene-label--axis-ghost",
      labelOffset: 0.08
    }));
  }

  if (n >= 2) {
    const grid = new THREE.GridHelper(7.2, 8, COLORS.grid, COLORS.grid);
    grid.rotation.x = Math.PI / 2;
    grid.material.transparent = true;
    grid.material.opacity = n === 2 ? 0.16 : 0.08;
    grid.material.depthWrite = false;
    grid.renderOrder = -5;
    group.add(grid);
  } else {
    const ticks = [];
    for (let value = -4; value <= 4; value += 1) {
      if (value === 0) continue;
      ticks.push(new THREE.Vector3(value, -0.08, 0), new THREE.Vector3(value, 0.08, 0));
    }
    group.add(makeLineSegments(ticks, COLORS.grid, { opacity: 0.38 }));
  }

  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 14, 10),
    new THREE.MeshBasicMaterial({ color: COLORS.ink })
  );
  group.add(origin);
  group.add(makeLabel("0", "scene-label--origin", new THREE.Vector3(-0.14, -0.14, -0.1)));
}

function orthogonalPlaneDirections(normal, preferredDirections = []) {
  const unitNormal = normal.clone().normalize();
  let first = preferredDirections.find((direction) => {
    const unit = direction.clone().normalize();
    return Math.abs(unit.dot(unitNormal)) < 1e-4;
  })?.clone().normalize();

  if (!first) {
    const seed = Math.abs(unitNormal.x) < 0.75
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    first = new THREE.Vector3().crossVectors(unitNormal, seed).normalize();
  }
  const second = new THREE.Vector3().crossVectors(unitNormal, first).normalize();
  return [first, second];
}

function addConstraintLevels(group, model, n, flat) {
  const normals = unitDirections(model.normalBasis, n);
  normals.forEach((normal, index) => {
    const arrowEnd = flat.anchor.clone().addScaledVector(normal, 1.45);
    group.add(makeArrow(flat.anchor, arrowEnd, COLORS.normal, {
      radius: 0.014,
      label: `n${index + 1}`,
      labelClass: "scene-label--normal"
    }));

    const offsets = index === 0 ? [-1.1, 0, 1.1] : [0];
    offsets.forEach((offset) => {
      const center = flat.anchor.clone().addScaledVector(normal, offset);
      const isTarget = Math.abs(offset) < EPSILON;
      if (n === 1) {
        group.add(makePoint(center, COLORS.normal, {
          radius: isTarget ? 0.075 : 0.05,
          shape: "diamond"
        }));
      } else if (n === 2) {
        const tangent = new THREE.Vector3(-normal.y, normal.x, 0).normalize();
        group.add(makeLine([
          center.clone().addScaledVector(tangent, -FLAT_EXTENT),
          center.clone().addScaledVector(tangent, FLAT_EXTENT)
        ], COLORS.normal, { opacity: isTarget ? 0.5 : 0.2, dashed: !isTarget }));
      } else {
        const [first, second] = orthogonalPlaneDirections(normal, flat.directions);
        addPlanePatch(group, center, first, second, {
          halfSize: isTarget ? 3.25 : 2.75,
          color: COLORS.normal,
          lineColor: COLORS.normal,
          opacity: isTarget ? 0.075 : 0.035,
          gridOpacity: isTarget ? 0.17 : 0.08,
          outlineDashed: !isTarget
        });
      }
    });

    const labelPosition = flat.anchor.clone().addScaledVector(normal, index === 0 ? -1.25 : 1.8);
    group.add(makeLabel(
      index === 0 ? `constraint ${index + 1} · parallel level sets` : `constraint ${index + 1}`,
      "scene-label--constraint",
      labelPosition
    ));
  });

  if (!normals.length) {
    group.add(makeLabel("no independent constraints", "scene-label--constraint scene-label--status", new THREE.Vector3(1.8, 1.8, 1.2)));
  }
}

function addRightAngle(group, corner, residual, tangent) {
  if (residual.lengthSq() < EPSILON || tangent.lengthSq() < EPSILON) return;
  const residualDirection = residual.clone().normalize();
  const tangentDirection = tangent.clone().normalize();
  const size = 0.27;
  const first = corner.clone().addScaledVector(tangentDirection, size);
  const diagonal = first.clone().addScaledVector(residualDirection, size);
  const second = corner.clone().addScaledVector(residualDirection, size);
  group.add(makeLine([first, diagonal, second], COLORS.normal, { opacity: 0.95 }));
}

function addProjectionGeometry(group, model, n, { showFlat = true, showBasis = false } = {}) {
  const flat = showFlat ? addFlat(group, model, n, { opacity: 0.14, label: false }) : flatData(model, n);
  const query = toVector3(model.queryPoint, n);
  const projected = toVector3(model.projectedPoint, n);
  const residual = query.clone().sub(projected);

  addAnchor(group, flat.anchor);
  if (showBasis) addBasis(group, flat.anchor, flat.directions);

  group.add(makeLine([flat.anchor, query], COLORS.query, { opacity: 0.25, dashed: true }));
  group.add(makeArrow(flat.anchor, projected, COLORS.projection, {
    radius: 0.014,
    label: "x∥",
    labelClass: "scene-label--projection",
    labelAt: 0.58,
    labelOffset: 0
  }));
  group.add(makeArrow(projected, query, COLORS.normal, {
    radius: 0.015,
    label: "x⊥",
    labelClass: "scene-label--residual",
    labelAt: 0.55,
    labelOffset: 0
  }));
  group.add(makePoint(query, COLORS.query, {
    label: "x",
    labelClass: "scene-label--query"
  }));
  group.add(makePoint(projected, COLORS.projection, {
    label: "x̂",
    labelClass: "scene-label--projection",
    outlined: true
  }));

  if (flat.directions.length) addRightAngle(group, projected, residual, flat.directions[0]);

  return flat;
}

function matrixEntry(matrix, row, column, n) {
  if (matrix?.isMatrix3 && n <= 3) return finiteNumber(matrix.elements[row + column * 3], NaN);
  if (matrix?.isMatrix4 && n <= 3) return finiteNumber(matrix.elements[row + column * 4], NaN);
  if (Array.isArray(matrix) && (Array.isArray(matrix[row]) || ArrayBuffer.isView(matrix[row]))) {
    return finiteNumber(matrix[row][column], NaN);
  }
  if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) {
    return finiteNumber(matrix[row * n + column], NaN);
  }
  return NaN;
}

function validMatrix(matrix, n) {
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      if (!Number.isFinite(matrixEntry(matrix, row, column, n))) return false;
    }
  }
  return true;
}

function linearMapFor(model, n) {
  const matrix = model.transformationMatrix;
  let columns;

  if (validMatrix(matrix, n)) {
    columns = Array.from({ length: n }, (_, column) => {
      const result = new THREE.Vector3();
      for (let row = 0; row < n; row += 1) {
        result.setComponent(row, matrixEntry(matrix, row, column, n));
      }
      return result;
    });
  } else {
    const supplied = vectorList(model.transformedBasis, n);
    columns = Array.from({ length: n }, (_, index) => supplied[index] ?? coordinateDirection(index));
  }

  return {
    columns,
    apply(vector) {
      const result = new THREE.Vector3();
      for (let index = 0; index < n; index += 1) {
        result.addScaledVector(columns[index], vector.getComponent(index));
      }
      return result;
    }
  };
}

function centroid(points) {
  if (!points.length) return new THREE.Vector3();
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
}

function cellMeasure(columns, n) {
  if (n === 1) return columns[0]?.length() ?? 0;
  if (n === 2) return new THREE.Vector3().crossVectors(columns[0], columns[1]).length();
  if (n === 3) return Math.abs(columns[0].dot(new THREE.Vector3().crossVectors(columns[1], columns[2])));
  return 0;
}

function addSquareCell(group, columns, {
  color,
  fillColor = color,
  opacity = 0.15,
  dashed = false,
  label = "",
  labelClass = "scene-label--cell"
}) {
  const vertices = [
    ORIGIN.clone(),
    columns[0].clone(),
    columns[0].clone().add(columns[1]),
    columns[1].clone()
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  }));
  mesh.renderOrder = -2;
  group.add(mesh);
  group.add(makeLine(vertices, color, { opacity: Math.min(1, opacity + 0.62), dashed, loop: true }));
  if (label) group.add(makeLabel(label, labelClass, centroid(vertices).add(new THREE.Vector3(0.08, 0.08, 0.1))));
  return vertices;
}

const CUBE_EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
];

const CUBE_FACES = [
  0, 1, 3, 0, 3, 2,
  4, 6, 7, 4, 7, 5,
  0, 4, 5, 0, 5, 1,
  2, 3, 7, 2, 7, 6,
  0, 2, 6, 0, 6, 4,
  1, 5, 7, 1, 7, 3
];

function cubeVertices(columns, origin = ORIGIN) {
  const vertices = [];
  for (let mask = 0; mask < 8; mask += 1) {
    const point = origin.clone();
    for (let index = 0; index < 3; index += 1) {
      if (mask & (1 << index)) point.add(columns[index]);
    }
    vertices.push(point);
  }
  return vertices;
}

function edgePoints(vertices, edges = CUBE_EDGES) {
  return edges.flatMap(([first, second]) => [vertices[first], vertices[second]]);
}

function addCubeCell(group, columns, {
  color,
  fillColor = color,
  opacity = 0.1,
  dashed = false,
  label = "",
  labelClass = "scene-label--cell"
}) {
  const vertices = cubeVertices(columns);
  const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
  geometry.setIndex(CUBE_FACES);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  }));
  mesh.renderOrder = -2;
  group.add(mesh);
  group.add(makeLineSegments(edgePoints(vertices), color, { opacity: Math.min(1, opacity + 0.68), dashed }));
  if (label) group.add(makeLabel(label, labelClass, centroid(vertices).add(new THREE.Vector3(0.12, 0.12, 0.15))));
  return vertices;
}

function addTransformedBasis(group, columns, n, { includeOriginal = true } = {}) {
  for (let index = 0; index < n; index += 1) {
    if (includeOriginal) {
      group.add(makeArrow(ORIGIN, coordinateDirection(index), COLORS.axis, {
        radius: 0.014,
        opacity: 0.42,
        label: `e${index + 1}`,
        labelClass: "scene-label--basis"
      }));
    }
    group.add(makeArrow(ORIGIN, columns[index], COLORS.transformed, {
      radius: 0.013,
      label: `Ae${index + 1}`,
      labelClass: "scene-label--transformed"
    }));
  }
}

function addDeterminantScene(group, model, n) {
  const map = linearMapFor(model, n);
  const identityColumns = Array.from({ length: n }, (_, index) => coordinateDirection(index));
  let transformedVertices = [];

  if (n === 1) {
    group.add(makeLine([ORIGIN, identityColumns[0]], COLORS.axis, { opacity: 0.62, dashed: true }));
    group.add(makeArrow(ORIGIN, map.columns[0], COLORS.transformed, {
      radius: 0.015,
      label: "A[0,1]",
      labelClass: "scene-label--transformed"
    }));
    transformedVertices = [ORIGIN.clone(), map.columns[0].clone()];
    group.add(makeLabel("unit segment", "scene-label--cell", identityColumns[0].clone().add(new THREE.Vector3(0.1, 0.12, 0))));
  } else if (n === 2) {
    addSquareCell(group, identityColumns, {
      color: COLORS.axis,
      fillColor: COLORS.ghost,
      opacity: 0.08,
      dashed: true,
      label: "",
      labelClass: "scene-label--cell scene-label--unit-cell"
    });
    transformedVertices = addSquareCell(group, map.columns, {
      color: COLORS.transformed,
      opacity: 0.22,
      label: "",
      labelClass: "scene-label--transformed scene-label--cell"
    });
    addTransformedBasis(group, map.columns, n, { includeOriginal: false });
  } else {
    addCubeCell(group, identityColumns, {
      color: COLORS.axis,
      fillColor: COLORS.ghost,
      opacity: 0.045,
      dashed: true,
      label: "",
      labelClass: "scene-label--cell scene-label--unit-cell"
    });
    transformedVertices = addCubeCell(group, map.columns, {
      color: COLORS.transformed,
      opacity: 0.14,
      label: "",
      labelClass: "scene-label--transformed scene-label--cell"
    });
    addTransformedBasis(group, map.columns, n, { includeOriginal: false });
  }

  const determinant = finiteNumber(model.determinant);
  const labelPosition = centroid(transformedVertices).add(new THREE.Vector3(0.28, -0.28, 0.32));
  const collapsed = Math.abs(determinant) < EPSILON || cellMeasure(map.columns, n) < EPSILON;
  if (collapsed) {
    const collapsePosition = labelPosition.clone().add(new THREE.Vector3(0, -0.42, 0.18));
    group.add(makePoint(centroid(transformedVertices), COLORS.normal, { radius: 0.07, shape: "diamond" }));
    group.add(makeLabel("collapsed dimension · zero area/volume", "scene-label--collapse scene-label--status", collapsePosition));
  }
}

function eigenPairData(pair, n) {
  if (!pair) return null;
  let vector;
  let value;
  if (Array.isArray(pair) && pair.length === 2 && (Array.isArray(pair[1]) || ArrayBuffer.isView(pair[1]) || pair[1]?.isVector3)) {
    value = pair[0];
    vector = pair[1];
  } else {
    value = pair.value ?? pair.lambda ?? pair.eigenvalue ?? pair.λ;
    vector = pair.vector ?? pair.direction ?? pair.eigenvector ?? pair.v;
  }
  const direction = toVector3(vector, n);
  if (direction.lengthSq() < EPSILON) return null;
  return { direction: direction.normalize(), value: Number(value) };
}

function validEigenPairs(model, n, map) {
  const pairs = Array.isArray(model.eigen?.pairs) ? model.eigen.pairs : [];
  const valid = [];

  pairs.forEach((pair) => {
    const data = eigenPairData(pair, n);
    if (!data) return;
    const transformed = map.apply(data.direction);
    const inferredValue = transformed.dot(data.direction);
    const value = Number.isFinite(data.value) ? data.value : inferredValue;
    const error = transformed.clone().sub(data.direction.clone().multiplyScalar(value)).length();
    const tolerance = 2e-4 * (1 + transformed.length() + Math.abs(value));
    if (error > tolerance) return;
    if (valid.some((entry) => Math.abs(entry.direction.dot(data.direction)) > 0.9999)) return;
    valid.push({ direction: data.direction, value, transformed });
  });

  return valid;
}

function addEigenDirections(group, pairs, { extent = 3.35 } = {}) {
  pairs.forEach((pair, index) => {
    const lineStart = pair.direction.clone().multiplyScalar(-extent);
    const lineEnd = pair.direction.clone().multiplyScalar(extent);
    group.add(makeLine([lineStart, lineEnd], COLORS.eigen, { opacity: 0.42, dashed: true }));
    group.add(makeArrow(ORIGIN, pair.transformed, COLORS.eigen, { radius: 0.014 }));

    const labelSide = index % 2 === 0 ? 1 : -1;
    const labelDistance = Math.min(extent * 0.7, 1.65 + index * 0.18);
    const labelPosition = pair.direction.clone().multiplyScalar(labelSide * labelDistance);
    group.add(makeLabel(`λ=${formatNumber(pair.value)}`, "scene-label--eigen", labelPosition));
  });
}

function addCircleAndFan(group, map) {
  const circle = [];
  const transformedCircle = [];
  const sourceRays = [];
  const transformedRays = [];
  const samples = 72;

  for (let index = 0; index <= samples; index += 1) {
    const angle = index / samples * Math.PI * 2;
    const point = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    circle.push(point);
    transformedCircle.push(map.apply(point));
  }

  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    const point = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    sourceRays.push(ORIGIN, point);
    transformedRays.push(ORIGIN, map.apply(point));
  }

  group.add(makeLine(circle, COLORS.axis, { opacity: 0.5, dashed: true }));
  group.add(makeLine(transformedCircle, COLORS.transformed, { opacity: 0.92 }));
  group.add(makeLineSegments(sourceRays, COLORS.axis, { opacity: 0.2, dashed: true }));
  group.add(makeLineSegments(transformedRays, COLORS.transformed, { opacity: 0.5 }));

}

function addEigenScene(group, model, n) {
  const map = linearMapFor(model, n);
  const pairs = validEigenPairs(model, n, map);

  if (n === 2) {
    addCircleAndFan(group, map);
  } else {
    addTransformedBasis(group, map.columns, n);
  }

  addEigenDirections(group, pairs);
  if (!pairs.length) {
    const kind = String(model.eigen?.kind ?? "").toLowerCase();
    const text = kind.includes("complex") || kind.includes("none")
      ? "no real eigen-directions"
      : "no supplied real eigen-directions";
    group.add(makeLabel(text, "scene-label--eigen scene-label--status", new THREE.Vector3(1.65, 1.65, n === 3 ? 1.5 : 0.18)));
  }
}

function orthonormalize(directions) {
  const result = [];
  directions.forEach((input) => {
    const direction = input.clone();
    result.forEach((basisDirection) => direction.addScaledVector(basisDirection, -direction.dot(basisDirection)));
    if (direction.lengthSq() > EPSILON * EPSILON) result.push(direction.normalize());
  });
  return result;
}

function projectPointToFlat(point, anchor, directions) {
  const basis = orthonormalize(directions);
  const displacement = point.clone().sub(anchor);
  const result = anchor.clone();
  basis.forEach((direction) => result.addScaledVector(direction, displacement.dot(direction)));
  return result;
}

function centeredCubeVertices(center, halfSize) {
  const vertices = [];
  for (let mask = 0; mask < 8; mask += 1) {
    vertices.push(center.clone().add(new THREE.Vector3(
      mask & 1 ? halfSize : -halfSize,
      mask & 2 ? halfSize : -halfSize,
      mask & 4 ? halfSize : -halfSize
    )));
  }
  return vertices;
}

function addProjectedWireCell(group, flat, n) {
  if (n === 3) {
    const normalDirections = orthonormalize(unitDirections(flat.modelNormalBasis, n));
    const lift = normalDirections[0] ?? new THREE.Vector3(0, 0, 1);
    const center = flat.anchor.clone().addScaledVector(lift, 1.35);
    const source = centeredCubeVertices(center, 0.58);
    const projected = source.map((point) => projectPointToFlat(point, flat.anchor, flat.directions));
    group.add(makeLineSegments(edgePoints(source), COLORS.axis, { opacity: 0.3, dashed: true }));
    group.add(makeLineSegments(edgePoints(projected), COLORS.projection, { opacity: 0.62 }));
    const guides = [0, 3, 5, 6].flatMap((index) => [source[index], projected[index]]);
    group.add(makeLineSegments(guides, COLORS.normal, { opacity: 0.16, dashed: true }));
    return;
  }

  if (n === 2) {
    const normal = unitDirections(flat.modelNormalBasis, n)[0] ?? new THREE.Vector3(-flat.directions[0]?.y || 0, flat.directions[0]?.x || 1, 0).normalize();
    const center = flat.anchor.clone().addScaledVector(normal, 1.2);
    const source = [
      center.clone().add(new THREE.Vector3(-0.65, -0.65, 0)),
      center.clone().add(new THREE.Vector3(0.65, -0.65, 0)),
      center.clone().add(new THREE.Vector3(0.65, 0.65, 0)),
      center.clone().add(new THREE.Vector3(-0.65, 0.65, 0))
    ];
    const projected = source.map((point) => projectPointToFlat(point, flat.anchor, flat.directions));
    group.add(makeLine(source, COLORS.axis, { opacity: 0.48, dashed: true, loop: true }));
    group.add(makeLine(projected, COLORS.projection, { opacity: 0.9, loop: true }));
    const guides = source.flatMap((point, index) => [point, projected[index]]);
    group.add(makeLineSegments(guides, COLORS.normal, { opacity: 0.22, dashed: true }));
  }
}

function addDimensionScene(group, model, n) {
  const flat = addFlat(group, model, n, { opacity: 0.25 });
  addAnchor(group, flat.anchor);
  addBasis(group, flat.anchor, flat.directions);
  const requested = THREE.MathUtils.clamp(Math.round(finiteNumber(model.requestedK, model.k)), 0, n);
  group.add(makeLabel(
    `${flat.dimension}D ${flatName(flat.dimension, n)} in ℝ${n}${requested !== flat.dimension ? ` · requested ${requested}D` : ""}`,
    "scene-label--dimension scene-label--status",
    new THREE.Vector3(-2.9, 3.3, n === 3 ? 2.2 : 0.2)
  ));
}

function addSpanScene(group, model, n) {
  const flat = addFlat(group, model, n, { opacity: 0.22 });
  addAnchor(group, flat.anchor);

  vectorList(model.rawGenerators, n).forEach((generator, index) => {
    group.add(makeArrow(flat.anchor, flat.anchor.clone().add(generator), COLORS.generated, {
      radius: 0.013,
      opacity: 0.82,
      label: `v${index + 1}`,
      labelClass: "scene-label--generator"
    }));
  });

  const generatedPoint = toVector3(model.generatedPoint, n);
  group.add(makeLine([flat.anchor, generatedPoint], COLORS.generated, { opacity: 0.36, dashed: true }));
  group.add(makePoint(generatedPoint, COLORS.generated, {
    radius: 0.08,
    label: "p + Vc",
    labelClass: "scene-label--generated-point",
    shape: "diamond"
  }));

  const requested = Math.max(0, Math.round(finiteNumber(model.requestedK, vectorList(model.rawGenerators, n).length)));
  const rank = Math.max(0, Math.round(finiteNumber(model.rank, flat.dimension)));
  const status = requested > rank ? `rank ${rank} · dependent generators` : `rank ${rank}`;
  group.add(makeLabel(status, "scene-label--rank scene-label--status", new THREE.Vector3(-2.8, 3.25, n === 3 ? 2 : 0.18)));
}

function addConstraintScene(group, model, n) {
  const flat = addFlat(group, model, n, { opacity: 0.2 });
  addAnchor(group, flat.anchor);
  addBasis(group, flat.anchor, flat.directions, { opacity: 0.58 });
  addConstraintLevels(group, model, n, flat);
}

function addSynthesisScene(group, model, n) {
  const flat = addProjectionGeometry(group, model, n, { showFlat: true, showBasis: false });
  flat.modelNormalBasis = model.normalBasis;
  addProjectedWireCell(group, flat, n);

  const map = linearMapFor(model, n);
  const pairs = validEigenPairs(model, n, map);
  addEigenDirections(group, pairs, { extent: 3.05 });
}

function canonicalCamera(camera, controls, n) {
  camera.zoom = 1;
  if (n === 1) {
    camera.position.set(0.25, -9.5, 4.2);
    camera.up.set(0, 0, 1);
  } else if (n === 2) {
    camera.position.set(4.8, -6.8, 8.4);
    camera.up.set(0, 0, 1);
  } else {
    camera.position.set(7.4, -7.8, 6.3);
    camera.up.set(0, 0, 1);
  }
  controls.target.set(0, 0, 0);
  camera.lookAt(controls.target);
  camera.updateMatrix();
  camera.updateProjectionMatrix();
  controls.update();
  controls.setGizmosVisible(false);
  controls.saveState();
}

export function createGeometryScene(container) {
  if (!container) throw new TypeError("createGeometryScene requires a container element.");

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "scene-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "scene-label-layer";
  labelRenderer.domElement.setAttribute("aria-hidden", "true");
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  const controls = new ArcballControls(camera, renderer.domElement, scene);
  controls.enablePan = false;
  controls.enableAnimations = false;
  controls.enableGrid = false;
  controls.rotateSpeed = 0.9;
  controls.scaleFactor = 1.08;
  controls.minZoom = 0.65;
  controls.maxZoom = 2.5;
  controls.setGizmosVisible(false);

  const axesGroup = new THREE.Group();
  const dynamicGroup = new THREE.Group();
  scene.add(axesGroup, dynamicGroup);

  let currentN = 3;
  let destroyed = false;

  function draw() {
    if (destroyed) return;
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function resize() {
    if (destroyed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;

    if (aspect >= 1) {
      camera.left = -VIEW_SIZE * aspect / 2;
      camera.right = VIEW_SIZE * aspect / 2;
      camera.top = VIEW_SIZE / 2;
      camera.bottom = -VIEW_SIZE / 2;
    } else {
      camera.left = -VIEW_SIZE / 2;
      camera.right = VIEW_SIZE / 2;
      camera.top = VIEW_SIZE / aspect / 2;
      camera.bottom = -VIEW_SIZE / aspect / 2;
    }

    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
    controls.update();
    draw();
  }

  function resetCamera() {
    if (destroyed) return;
    canonicalCamera(camera, controls, currentN);
    draw();
  }

  function render(model, options = {}) {
    if (destroyed || !model || typeof model !== "object") return;
    const n = ambientDimension(model.n);
    const chapter = THREE.MathUtils.clamp(Math.round(finiteNumber(options.chapter, 0)), 0, 6);

    clearGroup(axesGroup);
    clearGroup(dynamicGroup);
    addAxes(axesGroup, n);

    if (n !== currentN) {
      currentN = n;
      canonicalCamera(camera, controls, currentN);
    }

    if (chapter === 0) addDimensionScene(dynamicGroup, model, n);
    else if (chapter === 1) addSpanScene(dynamicGroup, model, n);
    else if (chapter === 2) addConstraintScene(dynamicGroup, model, n);
    else if (chapter === 3) addProjectionGeometry(dynamicGroup, model, n, { showFlat: true, showBasis: false });
    else if (chapter === 4) addDeterminantScene(dynamicGroup, model, n);
    else if (chapter === 5) addEigenScene(dynamicGroup, model, n);
    else addSynthesisScene(dynamicGroup, model, n);

    draw();
  }

  controls.addEventListener("change", draw);
  canonicalCamera(camera, controls, currentN);

  let resizeObserver = null;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener("resize", resize);
    controls.removeEventListener("change", draw);
    controls.dispose();
    clearGroup(dynamicGroup);
    clearGroup(axesGroup);
    renderer.dispose();
    renderer.domElement.remove();
    labelRenderer.domElement.remove();
  }

  return { render, resetCamera, destroy };
}
