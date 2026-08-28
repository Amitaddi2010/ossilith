/**
 * Client-side Constructive Solid Geometry (CSG) operations via three-bvh-csg.
 * Plane cutting, connector union, mesh splitting, and binary STL export.
 *
 * Key fix: STLLoader geometries are non-indexed and may lack required attributes.
 * We normalize all geometries before passing to Brush to prevent crashes.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';

const evaluator = new Evaluator();
evaluator.useGroups = false;

/**
 * Prepare a geometry for CSG operations:
 * - Ensure it has an index buffer
 * - Merge duplicate vertices
 * - Compute normals
 * - Remove NaN or degenerate triangles
 */
function prepareGeometryForCSG(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = geometry.clone();

  // Ensure position attribute exists
  const posAttr = geo.getAttribute('position');
  if (!posAttr) {
    throw new Error('Geometry has no position attribute');
  }

  // If geometry has an index, convert to non-indexed first for clean processing
  if (geo.index) {
    geo = geo.toNonIndexed();
  }

  // Remove any non-standard attributes that could confuse CSG
  const validAttrs = ['position', 'normal', 'uv'];
  const attrNames = Object.keys(geo.attributes);
  for (const name of attrNames) {
    if (!validAttrs.includes(name)) {
      geo.deleteAttribute(name);
    }
  }

  // Ensure we have normals
  geo.computeVertexNormals();

  // Add UVs if missing (CSG sometimes needs them)
  if (!geo.getAttribute('uv')) {
    const pos = geo.getAttribute('position');
    const uvs = new Float32Array((pos.count) * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = 0;
      uvs[i * 2 + 1] = 0;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  // Merge vertices to create a proper indexed geometry
  try {
    geo = mergeVertices(geo, 1e-4);
  } catch {
    // If mergeVertices fails, manually create an index
    const count = geo.getAttribute('position').count;
    const indices = [];
    for (let i = 0; i < count; i++) {
      indices.push(i);
    }
    geo.setIndex(indices);
  }

  geo.computeVertexNormals();
  geo.computeBoundingBox();

  return geo;
}

/**
 * Cut a mesh along a plane (normal + position) into two separate capped meshes.
 */
export function performPlaneCut(
  sourceGeometry: THREE.BufferGeometry,
  planeNormal = new THREE.Vector3(0, 0, 1),
  planePoint = new THREE.Vector3(0, 0, 0),
  cutBoxSize = 500
): { partA: THREE.BufferGeometry; partB: THREE.BufferGeometry } {
  const preparedSource = prepareGeometryForCSG(sourceGeometry);

  const sourceBrush = new Brush(preparedSource);
  sourceBrush.updateMatrixWorld();

  // Create a half-space cutter box aligned with the cutting plane
  const boxGeo = new THREE.BoxGeometry(cutBoxSize, cutBoxSize, cutBoxSize);
  const preparedBox = prepareGeometryForCSG(boxGeo);
  const boxBrush = new Brush(preparedBox);

  // Position box on the positive side of the cutting plane
  const normalizedNormal = planeNormal.clone().normalize();
  const boxCenter = planePoint.clone().add(normalizedNormal.clone().multiplyScalar(cutBoxSize / 2));
  boxBrush.position.copy(boxCenter);
  boxBrush.lookAt(boxCenter.clone().add(normalizedNormal));
  boxBrush.updateMatrixWorld();

  // Part A: Subtract the positive half-space
  const resultA = evaluator.evaluate(sourceBrush, boxBrush, SUBTRACTION);
  resultA.geometry.computeVertexNormals();

  // Part B: Intersect with the positive half-space
  const resultB = evaluator.evaluate(sourceBrush, boxBrush, INTERSECTION);
  resultB.geometry.computeVertexNormals();

  return {
    partA: resultA.geometry,
    partB: resultB.geometry,
  };
}

/**
 * General Boolean Operation (Join/Union, Subtract/Difference, Intersection)
 * between a base geometry and a tool/connector geometry.
 */
export function performBooleanOperation(
  targetGeometry: THREE.BufferGeometry,
  toolGeometry: THREE.BufferGeometry,
  toolMatrix: THREE.Matrix4,
  operation: 'join' | 'subtract' | 'intersection' = 'join'
): THREE.BufferGeometry {
  const preparedTarget = prepareGeometryForCSG(targetGeometry);
  const preparedTool = prepareGeometryForCSG(toolGeometry);

  const targetBrush = new Brush(preparedTarget);
  targetBrush.updateMatrixWorld();

  const toolBrush = new Brush(preparedTool);
  toolBrush.applyMatrix4(toolMatrix);
  toolBrush.updateMatrixWorld();

  const csgOp =
    operation === 'subtract'
      ? SUBTRACTION
      : operation === 'intersection'
      ? INTERSECTION
      : ADDITION;

  const result = evaluator.evaluate(targetBrush, toolBrush, csgOp);
  result.geometry.computeVertexNormals();
  return result.geometry;
}

/**
 * Backward compatibility alias for performBooleanUnion
 */
export function performBooleanUnion(
  targetGeometry: THREE.BufferGeometry,
  connectorGeometry: THREE.BufferGeometry,
  connectorMatrix: THREE.Matrix4
): THREE.BufferGeometry {
  return performBooleanOperation(targetGeometry, connectorGeometry, connectorMatrix, 'join');
}

/**
 * Generate 3D connector geometry based on selected shape.
 */
export function generateConnectorShapeGeometry(
  shape: 'cylinder' | 'cuboid' | 'torus' | 'sphere' | 'cone',
  radiusMm = 4,
  lengthMm = 30
): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;

  switch (shape) {
    case 'cuboid':
      geo = new THREE.BoxGeometry(radiusMm * 2, lengthMm, radiusMm * 2);
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(radiusMm * 2, radiusMm * 0.6, 16, 32);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(radiusMm * 1.5, 24, 24);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(radiusMm * 1.5, lengthMm, 24);
      break;
    case 'cylinder':
    default:
      geo = new THREE.CylinderGeometry(radiusMm, radiusMm, lengthMm, 32);
      break;
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Compute position, rotation quaternion, and span length for a connector between two points.
 */
export function computeConnectorOrientation(
  source: THREE.Vector3,
  target: THREE.Vector3
): { position: THREE.Vector3; quaternion: THREE.Quaternion; length: number; matrix: THREE.Matrix4 } {
  const midPoint = new THREE.Vector3().addVectors(source, target).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(target, source);
  const length = Math.max(1, dir.length());

  const up = new THREE.Vector3(0, 1, 0); // Default Three.js cylinder axis is Y
  const normalizedDir = dir.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalizedDir);

  const matrix = new THREE.Matrix4().compose(
    midPoint,
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );

  return { position: midPoint, quaternion, length, matrix };
}


/**
 * Generate a binary STL ArrayBuffer from a Three.js BufferGeometry.
 */
export function exportGeometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const geo = geometry.clone();
  geo.computeVertexNormals();

  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const indexAttr = geo.getIndex();

  const triangleCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
  const bufferSize = 84 + triangleCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer);

  // 80-byte header
  const header = 'Ossilith Surgical Planning STL Export';
  for (let i = 0; i < 80; i++) {
    dataView.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // 4-byte triangle count
  dataView.setUint32(80, triangleCount, true);

  let offset = 84;
  const getIndex = (i: number) => (indexAttr ? indexAttr.getX(i) : i);

  for (let i = 0; i < triangleCount; i++) {
    const i0 = getIndex(i * 3);
    const i1 = getIndex(i * 3 + 1);
    const i2 = getIndex(i * 3 + 2);

    // Normal vector
    const nx = normAttr ? normAttr.getX(i0) : 0;
    const ny = normAttr ? normAttr.getY(i0) : 0;
    const nz = normAttr ? normAttr.getZ(i0) : 1;
    dataView.setFloat32(offset, nx, true);
    dataView.setFloat32(offset + 4, ny, true);
    dataView.setFloat32(offset + 8, nz, true);
    offset += 12;

    // 3 Vertices
    for (const idx of [i0, i1, i2]) {
      dataView.setFloat32(offset, posAttr.getX(idx), true);
      dataView.setFloat32(offset + 4, posAttr.getY(idx), true);
      dataView.setFloat32(offset + 8, posAttr.getZ(idx), true);
      offset += 12;
    }

    // 2-byte attribute byte count
    dataView.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Discovers and extracts distinct connected topological components (shells/islands) from a BufferGeometry.
 * Uses BFS adjacency traversal across shared triangle edges.
 */
export function splitDisconnectedComponents(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry[] {
  let geo = geometry.clone();
  if (geo.index) {
    geo = geo.toNonIndexed();
  }

  const posAttr = geo.getAttribute('position');
  if (!posAttr || posAttr.count === 0) {
    return [geometry];
  }

  const triangleCount = Math.floor(posAttr.count / 3);
  if (triangleCount <= 1) {
    return [geometry];
  }

  // 1. Build vertex unification map (cluster vertices within 0.05mm tolerance)
  const precision = 20; // 0.05mm
  const hash = (x: number, y: number, z: number) =>
    `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;

  // Map each unique vertex hash to the list of triangles that contain it
  const vertexToTriangles = new Map<string, number[]>();

  for (let tri = 0; tri < triangleCount; tri++) {
    const v0 = hash(posAttr.getX(tri * 3), posAttr.getY(tri * 3), posAttr.getZ(tri * 3));
    const v1 = hash(posAttr.getX(tri * 3 + 1), posAttr.getY(tri * 3 + 1), posAttr.getZ(tri * 3 + 1));
    const v2 = hash(posAttr.getX(tri * 3 + 2), posAttr.getY(tri * 3 + 2), posAttr.getZ(tri * 3 + 2));

    for (const vKey of [v0, v1, v2]) {
      const list = vertexToTriangles.get(vKey) || [];
      list.push(tri);
      vertexToTriangles.set(vKey, list);
    }
  }

  // 2. Discover connected components via BFS flood fill
  const visited = new Uint8Array(triangleCount);
  const components: number[][] = [];

  for (let startTri = 0; startTri < triangleCount; startTri++) {
    if (visited[startTri]) continue;

    const componentTriangles: number[] = [];
    const queue: number[] = [startTri];
    visited[startTri] = 1;

    let head = 0;
    while (head < queue.length) {
      const currentTri = queue[head++];
      componentTriangles.push(currentTri);

      const v0 = hash(posAttr.getX(currentTri * 3), posAttr.getY(currentTri * 3), posAttr.getZ(currentTri * 3));
      const v1 = hash(posAttr.getX(currentTri * 3 + 1), posAttr.getY(currentTri * 3 + 1), posAttr.getZ(currentTri * 3 + 1));
      const v2 = hash(posAttr.getX(currentTri * 3 + 2), posAttr.getY(currentTri * 3 + 2), posAttr.getZ(currentTri * 3 + 2));

      for (const vKey of [v0, v1, v2]) {
        const neighbors = vertexToTriangles.get(vKey);
        if (neighbors) {
          for (let n = 0; n < neighbors.length; n++) {
            const neighborTri = neighbors[n];
            if (!visited[neighborTri]) {
              visited[neighborTri] = 1;
              queue.push(neighborTri);
            }
          }
        }
      }
    }

    if (componentTriangles.length >= 4) {
      components.push(componentTriangles);
    }
  }

  // If no multiple components found, return the single geometry
  if (components.length <= 1) {
    return [geometry];
  }

  // 3. Build a BufferGeometry for each component
  const normAttr = geo.getAttribute('normal');
  const results: THREE.BufferGeometry[] = [];

  for (const triList of components) {
    const positions: number[] = [];
    const normals: number[] = [];

    for (const tri of triList) {
      for (let v = 0; v < 3; v++) {
        const idx = tri * 3 + v;
        positions.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
        if (normAttr) {
          normals.push(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));
        }
      }
    }

    const compGeo = new THREE.BufferGeometry();
    compGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      compGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      compGeo.computeVertexNormals();
    }
    compGeo.computeBoundingBox();
    results.push(compGeo);
  }

  return results;
}

