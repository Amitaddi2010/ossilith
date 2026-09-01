'use client';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, ContactShadows, Html, Edges, Environment, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import {
  useEditorStore,
  STLObject,
  EditorTool,
  TransformSubmode,
  ConnectorShape,
  ConnectorOperation,
  RenderMode,
  CAMERA_PRESETS,
  BreachAlert,
  MeshShell,
} from '@/stores/editorStore';
import { generateConnectorShapeGeometry, computeConnectorOrientation } from '@/lib/csg';
import { computeGeometryShells, CLINICAL_SHELL_COLORS } from '@/lib/meshConnectivity';
import MeasurementTools3D from './MeasurementTools3D';
import TouchNavigationHUD from './TouchNavigationHUD';


interface EditorViewportProps {
  caseId: string;
}

/* ── Surface Region Growing Algorithm (BFS Flood-Fill) ─────── */

function performSurfaceRegionGrow(
  geometry: THREE.BufferGeometry,
  seedFaceIdx: number,
  seedNormal: THREE.Vector3,
  seedPoint: THREE.Vector3,
  angleLimitDeg: number,
  radiusMm: number
): number[] {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return [seedFaceIdx];

  const totalFaces = geometry.index ? geometry.index.count / 3 : posAttr.count / 3;
  if (totalFaces === 0 || seedFaceIdx >= totalFaces) return [seedFaceIdx];

  const angleLimitCos = Math.cos((angleLimitDeg * Math.PI) / 180);
  const radiusSq = radiusMm * radiusMm;

  // Build vertex-to-face adjacency for fast BFS
  const vertexToFaces = new Map<number, number[]>();
  const getVertexIndices = (faceIdx: number): [number, number, number] => {
    if (geometry.index) {
      return [
        geometry.index.getX(faceIdx * 3),
        geometry.index.getX(faceIdx * 3 + 1),
        geometry.index.getX(faceIdx * 3 + 2),
      ];
    }
    return [faceIdx * 3, faceIdx * 3 + 1, faceIdx * 3 + 2];
  };

  const getFaceCentroid = (v0: number, v1: number, v2: number, out: THREE.Vector3) => {
    out.set(
      (posAttr.getX(v0) + posAttr.getX(v1) + posAttr.getX(v2)) / 3,
      (posAttr.getY(v0) + posAttr.getY(v1) + posAttr.getY(v2)) / 3,
      (posAttr.getZ(v0) + posAttr.getZ(v1) + posAttr.getZ(v2)) / 3
    );
  };

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const getFaceNormal = (v0: number, v1: number, v2: number, out: THREE.Vector3) => {
    vA.set(posAttr.getX(v0), posAttr.getY(v0), posAttr.getZ(v0));
    vB.set(posAttr.getX(v1), posAttr.getY(v1), posAttr.getZ(v1));
    vC.set(posAttr.getX(v2), posAttr.getY(v2), posAttr.getZ(v2));
    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab).normalize();
    out.copy(cb);
  };

  // Limit adjacency build to max 60,000 faces for instant response
  const maxSearchFaces = Math.min(totalFaces, 60000);
  for (let f = 0; f < maxSearchFaces; f++) {
    const [v0, v1, v2] = getVertexIndices(f);
    if (!vertexToFaces.has(v0)) vertexToFaces.set(v0, []);
    if (!vertexToFaces.has(v1)) vertexToFaces.set(v1, []);
    if (!vertexToFaces.has(v2)) vertexToFaces.set(v2, []);
    vertexToFaces.get(v0)!.push(f);
    vertexToFaces.get(v1)!.push(f);
    vertexToFaces.get(v2)!.push(f);
  }

  const visited = new Set<number>();
  const selectedFaces: number[] = [];
  const queue: number[] = [seedFaceIdx];
  visited.add(seedFaceIdx);

  const centroid = new THREE.Vector3();
  const normal = new THREE.Vector3();

  while (queue.length > 0) {
    const currentFace = queue.shift()!;
    const [v0, v1, v2] = getVertexIndices(currentFace);

    getFaceCentroid(v0, v1, v2, centroid);
    if (centroid.distanceToSquared(seedPoint) > radiusSq) {
      continue;
    }

    getFaceNormal(v0, v1, v2, normal);
    const dot = normal.dot(seedNormal);
    if (dot < angleLimitCos) {
      continue;
    }

    selectedFaces.push(currentFace);

    // Add neighboring faces sharing any vertex
    for (const vert of [v0, v1, v2]) {
      const neighbors = vertexToFaces.get(vert);
      if (neighbors) {
        for (const nFace of neighbors) {
          if (!visited.has(nFace)) {
            visited.add(nFace);
            queue.push(nFace);
          }
        }
      }
    }
  }

  return selectedFaces;
}

/* ── Region Grow Highlight Overlay ─────────────────────────── */

function RegionGrowOverlay({
  object,
  selectedFaces,
}: {
  object: STLObject;
  selectedFaces: number[];
}) {
  const overlayGeometry = useMemo(() => {
    if (!object || selectedFaces.length === 0 || !object.geometry) return null;
    const geo = object.geometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr) return null;

    const vertices: number[] = [];
    for (const faceIdx of selectedFaces) {
      let v0 = faceIdx * 3;
      let v1 = faceIdx * 3 + 1;
      let v2 = faceIdx * 3 + 2;
      if (geo.index) {
        v0 = geo.index.getX(faceIdx * 3);
        v1 = geo.index.getX(faceIdx * 3 + 1);
        v2 = geo.index.getX(faceIdx * 3 + 2);
      }
      vertices.push(
        posAttr.getX(v0), posAttr.getY(v0), posAttr.getZ(v0),
        posAttr.getX(v1), posAttr.getY(v1), posAttr.getZ(v1),
        posAttr.getX(v2), posAttr.getY(v2), posAttr.getZ(v2),
      );
    }

    const subGeo = new THREE.BufferGeometry();
    subGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    subGeo.computeVertexNormals();
    return subGeo;
  }, [object, selectedFaces]);

  if (!overlayGeometry) return null;

  return (
    <mesh
      geometry={overlayGeometry}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale.map((s) => s * 1.002) as [number, number, number]}
    >
      <meshBasicMaterial color="#f97316" side={THREE.DoubleSide} transparent opacity={0.85} />
    </mesh>
  );
}

/* ── Islands & Disconnected Shells 3D Highlighting ─────────── */

function IslandsOverlay({
  object,
  shells,
  selectedIndices,
  hoveredIndex,
}: {
  object: STLObject;
  shells: MeshShell[];
  selectedIndices: number[];
  hoveredIndex: number | null;
}) {
  if (!shells || shells.length <= 1 || !object) return null;

  return (
    <group position={object.position} rotation={object.rotation} scale={object.scale}>
      {shells.map((shell) => {
        const isSelected = selectedIndices.includes(shell.index);
        const isHovered = hoveredIndex === shell.index;
        const color = CLINICAL_SHELL_COLORS[shell.index % CLINICAL_SHELL_COLORS.length];

        const [minB, maxB] = shell.bounds;
        const sizeX = Math.max(1, maxB[0] - minB[0]);
        const sizeY = Math.max(1, maxB[1] - minB[1]);
        const sizeZ = Math.max(1, maxB[2] - minB[2]);
        const posX = (minB[0] + maxB[0]) / 2;
        const posY = (minB[1] + maxB[1]) / 2;
        const posZ = (minB[2] + maxB[2]) / 2;

        const isPrimary = shell.index === 0;
        const isDebris = shell.volume_cm3 > 0 && shell.volume_cm3 < 0.5;

        // Only draw bounding box for hovered or non-primary selected shells
        const showBox = isHovered || (isSelected && !isPrimary);

        return (
          <group key={shell.index} position={[posX, posY, posZ]}>
            {showBox && (
              <mesh>
                <boxGeometry args={[sizeX * 1.02, sizeY * 1.02, sizeZ * 1.02]} />
                <meshBasicMaterial
                  color={isSelected ? '#f43f5e' : isHovered ? '#38bdf8' : color}
                  wireframe
                  transparent
                  opacity={isHovered ? 0.95 : 0.75}
                />
              </mesh>
            )}

            {(isHovered || (isSelected && !isPrimary)) && (
              <Html center distanceFactor={280} position={[0, sizeY / 2 + 5, 0]}>
                <div
                  className={`pointer-events-none px-2.5 py-1.5 rounded-md text-xs font-mono shadow-2xl backdrop-blur-md border transition-all ${
                    isSelected
                      ? 'bg-rose-950/90 text-rose-200 border-rose-500/80 shadow-rose-950/50 scale-105 ring-1 ring-rose-400'
                      : isHovered
                      ? 'bg-sky-950/90 text-sky-200 border-sky-400/80 shadow-sky-950/50 scale-105 ring-1 ring-sky-300'
                      : 'bg-slate-900/90 text-slate-200 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span>
                      {isPrimary ? 'Primary Bone' : isDebris ? `Debris Fragment #${shell.index + 1}` : `Bone Part #${shell.index + 1}`}
                    </span>
                    {isSelected && (
                      <span className="bg-rose-500 text-white text-[9px] px-1 rounded font-sans uppercase tracking-wider">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-300/90 mt-0.5 flex gap-2">
                    <span>{shell.face_count.toLocaleString()} faces</span>
                    {shell.volume_cm3 > 0 && <span>· {shell.volume_cm3.toFixed(2)} cm³</span>}
                  </div>
                  <div className="text-[9px] text-slate-400 italic mt-0.5">
                    {isSelected ? 'Click mesh to deselect' : 'Click mesh to select for split/delete'}
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ── Mesh Object Component with Passthrough & Render Modes ─── */

function MeshItem({
  object,
  isSelected,
  renderMode,
  passthroughMode,
  hasBreach,
  onSelect,
  onSurfaceClick,
  onRegionGrowClick,
}: {
  object: STLObject;
  isSelected: boolean;
  renderMode: RenderMode;
  passthroughMode: boolean;
  hasBreach: boolean;
  onSelect: (multi: boolean) => void;
  onSurfaceClick?: (point: THREE.Vector3) => void;
  onRegionGrowClick?: (obj: STLObject, faceIdx: number, face: any, point: THREE.Vector3) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const activeTool = useEditorStore((s) => s.activeTool);
  const colorByShellsMode = useEditorStore((s) => s.colorByShellsMode);
  const setHoveredShellIndex = useEditorStore((s) => s.setHoveredShellIndex);
  const toggleShellSelection = useEditorStore((s) => s.toggleShellSelection);
  const setFaceToShellMap = useEditorStore((s) => s.setFaceToShellMap);

  // Fast client-side connected-components decomposition (<10ms)
  const connectivity = useMemo(() => {
    if (!object.geometry) return null;
    return computeGeometryShells(object.geometry);
  }, [object.geometry]);

  useEffect(() => {
    if (connectivity) {
      setFaceToShellMap(object.id, connectivity.faceToShell);
    }
  }, [connectivity, object.id, setFaceToShellMap]);

  // Generate multi-color geometry with distinct clinical bone shades
  const coloredGeometry = useMemo(() => {
    if (!object.geometry || !connectivity || activeTool !== 'islands' || !colorByShellsMode) {
      return null;
    }
    const geom = object.geometry.clone();
    const posAttr = geom.getAttribute('position');
    const indexAttr = geom.getIndex();
    const faceCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

    const colors = new Float32Array(posAttr.count * 3);
    const threeColors = CLINICAL_SHELL_COLORS.map((c) => new THREE.Color(c));

    for (let f = 0; f < faceCount; f++) {
      const shellIdx = connectivity.faceToShell[f] ?? 0;
      const c = threeColors[shellIdx % threeColors.length];

      const v0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const v1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const v2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      colors[v0 * 3] = c.r;
      colors[v0 * 3 + 1] = c.g;
      colors[v0 * 3 + 2] = c.b;

      colors[v1 * 3] = c.r;
      colors[v1 * 3 + 1] = c.g;
      colors[v1 * 3 + 2] = c.b;

      colors[v2 * 3] = c.r;
      colors[v2 * 3 + 1] = c.g;
      colors[v2 * 3 + 2] = c.b;
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [object.geometry, connectivity, activeTool, colorByShellsMode]);

  useEffect(() => {
    return () => {
      if (coloredGeometry) {
        coloredGeometry.dispose();
      }
    };
  }, [coloredGeometry]);

  const handlePointerMove = (e: any) => {
    if (activeTool === 'islands' && connectivity && e.faceIndex !== undefined) {
      e.stopPropagation();
      const shellIdx = connectivity.faceToShell[e.faceIndex];
      if (shellIdx !== undefined) {

        setHoveredShellIndex(shellIdx);
      }
    }
  };

  const handlePointerLeave = () => {
    if (activeTool === 'islands') {
      setHoveredShellIndex(null);
    }
  };

  const handleClick = (e: any) => {
    e.stopPropagation();

    if (activeTool === 'islands' && connectivity && e.faceIndex !== undefined) {
      const shellIdx = connectivity.faceToShell[e.faceIndex];
      if (shellIdx !== undefined) {
        toggleShellSelection(shellIdx);
        return;
      }
    }

    if (activeTool === 'region-grow') {
      if (e.face && e.faceIndex !== undefined && e.point && typeof onRegionGrowClick === 'function') {
        onRegionGrowClick(object, e.faceIndex, e.face, e.point);
      }
      return;
    }

    if (
      activeTool === 'measure-distance' ||
      activeTool === 'measure-angle' ||
      activeTool === 'mechanical-axis' ||
      activeTool === 'screw-picker' ||
      activeTool === 'connector'
    ) {
      if (e.point && typeof onSurfaceClick === 'function') {
        onSurfaceClick(e.point.clone());
      }
      return;
    }
    onSelect(e.shiftKey);
  };

  const isImplant =
    object.isImplant ||
    object.name.toLowerCase().includes('implant') ||
    object.name.toLowerCase().includes('plate') ||
    object.name.toLowerCase().includes('screw') ||
    object.name.toLowerCase().includes('tray');

  const hoveredObjectId = useEditorStore((s) => s.hoveredObjectId);
  const setHoveredObjectId = useEditorStore((s) => s.setHoveredObjectId);
  const isHovered = hoveredObjectId === object.id && !isSelected;

  // Cortical bone clinical ivory tone vs titanium implant metal
  const boneIvory = object.color && object.color !== '#e8dcc8' ? object.color : '#f3ede2';
  const baseColor = isImplant ? '#cbd5e1' : boneIvory;
  const effectiveOpacity = passthroughMode ? 0.35 : object.opacity ?? 1.0;
  const isMultiColor = activeTool === 'islands' && colorByShellsMode && coloredGeometry !== null;
  const displayGeometry = isMultiColor ? coloredGeometry : object.geometry;

  const handleMeshPointerEnter = (e: any) => {
    e.stopPropagation();
    if (activeTool === 'transform' || activeTool === 'islands' || activeTool === 'plane-cut') {
      setHoveredObjectId(object.id);
    }
  };

  const handleMeshPointerLeave = () => {
    if (activeTool === 'islands') {
      setHoveredShellIndex(null);
    }
    setHoveredObjectId(null);
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={displayGeometry}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        visible={object.visible}
        onClick={handleClick}
        onPointerEnter={handleMeshPointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handleMeshPointerLeave}
        castShadow={!passthroughMode}
        receiveShadow={!passthroughMode}
      >
        {renderMode === 'solid' && !passthroughMode && (
          <meshPhysicalMaterial
            vertexColors={isMultiColor}
            color={
              isMultiColor
                ? undefined
                : hasBreach
                ? '#fca5a5'
                : isSelected
                ? '#d5e8d4'
                : isHovered
                ? '#fdfbf7'
                : baseColor
            }
            roughness={isImplant ? 0.22 : 0.42}
            metalness={isImplant ? 0.85 : 0.02}
            clearcoat={isImplant ? 0.4 : isSelected ? 0.25 : 0.15}
            clearcoatRoughness={0.25}
            envMapIntensity={isImplant ? 1.4 : 0.9}
            emissive={
              hasBreach
                ? '#ef4444'
                : isSelected
                ? '#166534'
                : isHovered
                ? '#38bdf8'
                : '#000000'
            }
            emissiveIntensity={
              hasBreach ? 0.4 : isSelected ? 0.22 : isHovered ? 0.12 : 0
            }
            transparent={effectiveOpacity < 1}
            opacity={effectiveOpacity}
            side={THREE.DoubleSide}
          />
        )}

        {(renderMode === 'wireframe' || (renderMode === 'solid' && passthroughMode)) && (
          <meshPhysicalMaterial
            vertexColors={isMultiColor}
            color={
              isMultiColor
                ? undefined
                : hasBreach
                ? '#ef4444'
                : isSelected
                ? '#38bdf8'
                : isHovered
                ? '#93c5fd'
                : isImplant
                ? '#e2e8f0'
                : '#88a898'
            }
            transparent
            opacity={renderMode === 'wireframe' ? 0.85 : 0.35}
            roughness={0.3}
            metalness={isImplant ? 0.6 : 0.05}
            wireframe={renderMode === 'wireframe'}
            side={THREE.DoubleSide}
            depthWrite={!passthroughMode}
          />
        )}

        {renderMode === 'xray' && (
          <meshPhysicalMaterial
            vertexColors={isMultiColor}
            color={isMultiColor ? undefined : isSelected ? '#a7c4bc' : baseColor}
            transparent
            opacity={0.25}
            roughness={0.8}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        )}
      </mesh>

      {/* Passthrough / X-Ray Edges */}
      {(passthroughMode || renderMode === 'xray') && object.visible && (
        <mesh
          geometry={object.geometry}
          position={object.position}
          rotation={object.rotation}
          scale={object.scale}
        >
          <meshBasicMaterial visible={false} />
          <Edges
            threshold={22}
            color={hasBreach ? '#ef4444' : isSelected ? '#38bdf8' : '#4a7c59'}
            scale={1}
          />
        </mesh>
      )}

      {/* Selection outline glow & hover contour */}
      {(isSelected || isHovered) && renderMode === 'solid' && !passthroughMode && object.visible && (
        <mesh
          geometry={object.geometry}
          position={object.position}
          rotation={object.rotation}
          scale={object.scale.map((s) => s * (isSelected ? 1.003 : 1.0015)) as [number, number, number]}
        >
          <meshBasicMaterial
            color={isSelected ? '#38bdf8' : '#67e8f9'}
            transparent
            opacity={isSelected ? 0.18 : 0.08}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ── Active Transform Gizmo with Uniform/Non-Uniform Scaling Fix ── */

function ActiveGizmo({
  activeObject,
  activeTool,
  transformSubmode,
  snappingEnabled,
  snapTranslation,
  snapRotationDeg,
  onTransformChange,
}: {
  activeObject: STLObject | null;
  activeTool: EditorTool;
  transformSubmode: TransformSubmode;
  snappingEnabled: boolean;
  snapTranslation: number;
  snapRotationDeg: number;
  onTransformChange: (
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number]
  ) => void;
}) {
  const transformRef = useRef<any>(null);

  // Map submode to TransformControls mode
  let mode: 'translate' | 'rotate' | 'scale' = 'translate';
  if (activeTool === 'rotate' || (activeTool === 'transform' && transformSubmode === 'rotate')) {
    mode = 'rotate';
  } else if (
    activeTool === 'scale' ||
    (activeTool === 'transform' && (transformSubmode === 'scaleUniform' || transformSubmode === 'scaleNonUniform'))
  ) {
    mode = 'scale';
  } else {
    mode = 'translate';
  }

  const isTransformActive =
    activeTool === 'transform' || activeTool === 'translate' || activeTool === 'rotate' || activeTool === 'scale';

  if (!activeObject || !isTransformActive) {
    return null;
  }

  return (
    <TransformControls
      ref={transformRef}
      mode={mode}
      size={0.85}
      translationSnap={snappingEnabled ? snapTranslation : null}
      rotationSnap={snappingEnabled ? THREE.MathUtils.degToRad(snapRotationDeg) : null}
      scaleSnap={snappingEnabled ? 0.1 : null}
      position={activeObject.position}
      rotation={activeObject.rotation}
      scale={activeObject.scale}
      onMouseUp={() => {
        if (transformRef.current?.object) {
          const o = transformRef.current.object;

          if (mode === 'scale') {
            if (transformSubmode === 'scaleUniform') {
              // Calculate uniform scaling delta
              const prev = activeObject.scale;
              let factor = 1.0;
              if (Math.abs(o.scale.x - prev[0]) > 0.001) factor = o.scale.x / (prev[0] || 1);
              else if (Math.abs(o.scale.y - prev[1]) > 0.001) factor = o.scale.y / (prev[1] || 1);
              else if (Math.abs(o.scale.z - prev[2]) > 0.001) factor = o.scale.z / (prev[2] || 1);
              else factor = o.scale.x;

              const uniform = Math.max(0.01, (prev[0] || 1) * factor);
              onTransformChange(
                [o.position.x, o.position.y, o.position.z],
                [o.rotation.x, o.rotation.y, o.rotation.z],
                [uniform, uniform, uniform]
              );
              return;
            } else {
              // Non-uniform independent scale
              onTransformChange(
                [o.position.x, o.position.y, o.position.z],
                [o.rotation.x, o.rotation.y, o.rotation.z],
                [Math.max(0.01, o.scale.x), Math.max(0.01, o.scale.y), Math.max(0.01, o.scale.z)]
              );
              return;
            }
          }

          onTransformChange(
            [o.position.x, o.position.y, o.position.z],
            [o.rotation.x, o.rotation.y, o.rotation.z],
            [o.scale.x, o.scale.y, o.scale.z]
          );
        }
      }}
    />
  );
}

/* ── Interactive Cut Plane Gizmo ───────────────────────── */

function InteractiveCutPlane({
  visible,
  onPositionChange,
  onRotationChange,
}: {
  visible: boolean;
  onPositionChange: (pos: [number, number, number]) => void;
  onRotationChange: (rot: [number, number, number]) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { cutPlane } = useEditorStore();

  if (!visible) return null;

  return (
    <group>
      <TransformControls
        mode="translate"
        size={0.8}
        position={cutPlane.position}
        onMouseUp={() => {
          if (groupRef.current) {
            const p = groupRef.current.position;
            onPositionChange([p.x, p.y, p.z]);
          }
        }}
      >
        <group ref={groupRef} rotation={cutPlane.rotation}>
          <mesh>
            <planeGeometry args={[180, 180]} />
            <meshStandardMaterial
              color="#0f3e17"
              transparent
              opacity={0.12}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>

          <AnimatedRing />

          <arrowHelper
            args={[
              new THREE.Vector3(0, 0, 1),
              new THREE.Vector3(0, 0, 0),
              35,
              0x0f3e17,
              6,
              3,
            ]}
          />

          <Html position={[0, 95, 0]} center>
            <div
              style={{
                background: 'rgba(15, 62, 23, 0.92)',
                color: '#e1f4df',
                padding: '4px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontFamily: 'var(--font-sans, sans-serif)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              ✂️ Osteotomy Plane — Drag to position
            </div>
          </Html>
        </group>
      </TransformControls>
    </group>
  );
}

function AnimatedRing() {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.3;
    }
  });

  return (
    <mesh ref={ringRef}>
      <ringGeometry args={[60, 80, 64]} />
      <meshStandardMaterial
        color="#0f3e17"
        transparent
        opacity={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ── Two-Point Multi-Shape Connector Gizmo ─────────────── */

function TwoPointConnectorGizmo() {
  const { connectorPoints, connectorShape, connectorRadiusMm, activeTool } = useEditorStore();
  const { source, target } = connectorPoints;

  // Compute preview geometry if both source and target points are defined (Hooks must be unconditional)
  const preview = useMemo(() => {
    if (activeTool !== 'connector' || !source || !target) return null;
    const { position, quaternion, length } = computeConnectorOrientation(source, target);
    const geo = generateConnectorShapeGeometry(connectorShape, connectorRadiusMm, length);
    return { position, quaternion, geometry: geo };
  }, [activeTool, source, target, connectorShape, connectorRadiusMm]);

  if (activeTool !== 'connector') return null;


  return (
    <group>
      {/* Source Point Marker A */}
      {source && (
        <group position={source}>
          <mesh>
            <sphereGeometry args={[2.5, 16, 16]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>
          <Html position={[0, 6, 0]} center>
            <div
              style={{
                background: '#0284c7',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Point A (Source)
            </div>
          </Html>
        </group>
      )}

      {/* Target Point Marker B */}
      {target && (
        <group position={target}>
          <mesh>
            <sphereGeometry args={[2.5, 16, 16]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
          <Html position={[0, 6, 0]} center>
            <div
              style={{
                background: '#f59e0b',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Point B (Target)
            </div>
          </Html>
        </group>
      )}

      {/* Connector Body Spanning Between Point A and B */}
      {preview && (
        <mesh
          geometry={preview.geometry}
          position={preview.position}
          quaternion={preview.quaternion}
        >
          <meshPhysicalMaterial
            color="#10b981"
            transparent
            opacity={0.65}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>
      )}
    </group>
  );
}

/* ── Breach Warning Visualizer ─────────────────────────── */

function BreachVisualizer({ alerts }: { alerts: BreachAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <group>
      {alerts.map((alert) => (
        <group key={alert.id} position={alert.location}>
          <mesh>
            <sphereGeometry args={[3.5, 16, 16]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.85} />
          </mesh>

          <Html position={[0, 8, 0]} center>
            <div
              style={{
                background: 'rgba(220, 38, 38, 0.95)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>⚠️</span>
              <span>Cortical Breach: {alert.depthMm} mm</span>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/* ── Camera Controller with Preset Animations ──────────── */

function CameraController() {
  const { camera } = useThree();
  const cameraPreset = useEditorStore((s) => s.cameraPreset);
  const cameraPresetTrigger = useEditorStore((s) => s.cameraPresetTrigger);
  const targetPos = useRef(new THREE.Vector3(120, 80, 160));
  const targetUp = useRef(new THREE.Vector3(0, 1, 0));
  const isAnimating = useRef(false);
  const animProgress = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const startUp = useRef(new THREE.Vector3());

  useEffect(() => {
    if (cameraPreset === 'free') return;
    const preset = CAMERA_PRESETS[cameraPreset];
    if (!preset) return;

    startPos.current.copy(camera.position);
    startUp.current.copy(camera.up);
    targetPos.current.set(...preset.position);
    targetUp.current.set(...preset.up);
    animProgress.current = 0;
    isAnimating.current = true;
  }, [cameraPresetTrigger]);

  useFrame((_, delta) => {
    if (!isAnimating.current) return;

    animProgress.current = Math.min(1, animProgress.current + delta * 3.0);
    const t = 1 - Math.pow(1 - animProgress.current, 3);

    camera.position.lerpVectors(startPos.current, targetPos.current, t);
    camera.up.lerpVectors(startUp.current, targetUp.current, t);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    if (animProgress.current >= 1) {
      isAnimating.current = false;
    }
  });

  return null;
}

/* ── 🎯 Zoom-To-Fit / Focus Model Controller ──────────────── */

function ZoomToFitController() {
  const { camera, controls } = useThree();
  const zoomToFitTrigger = useEditorStore((s) => s.zoomToFitTrigger);
  const objects = useEditorStore((s) => s.objects);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const isFitting = useRef(false);
  const fitProgress = useRef(0);
  const targetCamPos = useRef(new THREE.Vector3());
  const startCamPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const startLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (zoomToFitTrigger === 0 && objects.size === 0) return;

    // Compute bounding box of selected object, or all objects
    const box = new THREE.Box3();
    const sel = Array.from(selectedIds);
    let count = 0;

    objects.forEach((obj) => {
      if ((sel.length === 0 || sel.includes(obj.id)) && obj.visible && obj.geometry) {
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          const meshBox = obj.geometry.boundingBox.clone();
          const meshMatrix = new THREE.Matrix4().compose(
            new THREE.Vector3(...obj.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...obj.rotation)),
            new THREE.Vector3(...obj.scale)
          );
          meshBox.applyMatrix4(meshMatrix);
          box.union(meshBox);
          count++;
        }
      }
    });

    if (count === 0 || box.isEmpty()) {
      box.set(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50));
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 20);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.35;
    cameraDistance = Math.max(60, Math.min(cameraDistance, 1500));

    // Direction vector from center to current camera
    const dir = camera.position.clone().sub(center).normalize();
    if (dir.lengthSq() < 0.001) dir.set(1, 0.75, 1.2).normalize();

    startCamPos.current.copy(camera.position);
    targetCamPos.current.copy(center).add(dir.multiplyScalar(cameraDistance));

    // Orbit controls target pivot
    const orbitControls = controls as any;
    if (orbitControls && orbitControls.target) {
      startLookAt.current.copy(orbitControls.target);
    } else {
      startLookAt.current.set(0, 0, 0);
    }
    targetLookAt.current.copy(center);

    fitProgress.current = 0;
    isFitting.current = true;
  }, [zoomToFitTrigger, objects.size]);

  useFrame((_, delta) => {
    if (!isFitting.current) return;

    fitProgress.current = Math.min(1, fitProgress.current + delta * 3.5);
    const t = 1 - Math.pow(1 - fitProgress.current, 3);

    camera.position.lerpVectors(startCamPos.current, targetCamPos.current, t);
    camera.updateProjectionMatrix();

    const orbitControls = controls as any;
    if (orbitControls && orbitControls.target) {
      orbitControls.target.lerpVectors(startLookAt.current, targetLookAt.current, t);
      orbitControls.update();
    }

    if (fitProgress.current >= 1) {
      isFitting.current = false;
    }
  });

  return null;
}

/* ── WebGL Context Loss & Restoration Guardian ────────────── */

function WebGLContextGuardian() {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[Ossilith WebGL] Context lost. Preventing default and waiting for restoration...');
    };

    const handleContextRestored = () => {
      console.info('[Ossilith WebGL] Context restored successfully! Re-rendering scene...');
      gl.renderLists.dispose();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl]);

  return null;
}

/* ── Scene Component ───────────────────────────────────── */

function SceneContent({ caseId }: { caseId: string }) {
  const {
    objects,
    selectedIds,
    activeTool,
    transformSubmode,
    snappingEnabled,
    snapTranslation,
    snapRotationDeg,
    passthroughMode,
    breachDetectionEnabled,
    breachAlerts,
    selectObject,
    setTransform,
    renderMode,
    setCutPlanePosition,
    setCutPlaneRotation,
    addMeasurementDraftPoint,
    measurementDraftPoints,
    commitMeasurement,
    connectorPoints,
    setConnectorPoints,
    touchGestureMode,
    shells,
    selectedShellIndices,
    hoveredShellIndex,
    meshRegionGrowAngleDeg,
    meshRegionGrowRadiusMm,
    meshRegionGrowSelectedFaces,
    setMeshRegionGrowSelectedFaces,
    setMeshRegionGrowSeedFace,
  } = useEditorStore();

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : null;

  const breachedObjectIds = useMemo(() => {
    return new Set(breachAlerts.map((b) => b.objectId));
  }, [breachAlerts]);

  // Compute bounding box & floor height of scene objects for grounded shadows & grid
  const sceneFloor = useMemo(() => {
    const box = new THREE.Box3();
    let count = 0;
    objects.forEach((obj) => {
      if (obj.visible && obj.geometry) {
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          const meshBox = obj.geometry.boundingBox.clone();
          const meshMatrix = new THREE.Matrix4().compose(
            new THREE.Vector3(...obj.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...obj.rotation)),
            new THREE.Vector3(...obj.scale)
          );
          meshBox.applyMatrix4(meshMatrix);
          box.union(meshBox);
          count++;
        }
      }
    });

    if (count === 0 || box.isEmpty()) {
      return { floorY: -75, centerX: 0, centerZ: 0, size: 250 };
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 50);

    return {
      floorY: box.min.y - 1.0,
      centerX: center.x,
      centerZ: center.z,
      size: maxDim,
    };
  }, [objects]);

  const handleRegionGrowClick = (obj: STLObject, faceIdx: number, face: any, point: THREE.Vector3) => {
    if (!obj.geometry || !face) return;
    const seedNormal = face.normal ? face.normal.clone() : new THREE.Vector3(0, 1, 0);
    const selectedFaces = performSurfaceRegionGrow(
      obj.geometry,
      faceIdx,
      seedNormal,
      point,
      meshRegionGrowAngleDeg,
      meshRegionGrowRadiusMm
    );
    setMeshRegionGrowSeedFace(faceIdx);
    setMeshRegionGrowSelectedFaces(selectedFaces);
  };

  const handleSurfaceClick = (point: THREE.Vector3) => {
    const tool = useEditorStore.getState().activeTool;

    if (tool === 'connector') {
      const { source, target } = useEditorStore.getState().connectorPoints;
      if (!source) {
        setConnectorPoints({ source: point, target: null });
      } else if (!target) {
        setConnectorPoints({ source, target: point });
      } else {
        setConnectorPoints({ source: point, target: null });
      }
      return;
    }

    const draft = useEditorStore.getState().measurementDraftPoints;
    const updatedDraft = [...draft, point];

    if (tool === 'measure-distance') {
      if (updatedDraft.length === 1) {
        addMeasurementDraftPoint(point);
      } else if (updatedDraft.length >= 2) {
        addMeasurementDraftPoint(point);
        const dist = updatedDraft[0].distanceTo(updatedDraft[1]);
        commitMeasurement({
          id: Math.random().toString(36).slice(2),
          type: 'distance',
          points: [updatedDraft[0].clone(), updatedDraft[1].clone()],
          value: dist,
          label: `${dist.toFixed(1)} mm`,
        });
      }
    } else if (tool === 'measure-angle') {
      addMeasurementDraftPoint(point);
      if (updatedDraft.length >= 3) {
        const v1 = new THREE.Vector3().subVectors(updatedDraft[0], updatedDraft[1]).normalize();
        const v2 = new THREE.Vector3().subVectors(updatedDraft[2], updatedDraft[1]).normalize();
        const angleDeg = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, v1.dot(v2)))));
        commitMeasurement({
          id: Math.random().toString(36).slice(2),
          type: 'angle',
          points: [updatedDraft[0].clone(), updatedDraft[1].clone(), updatedDraft[2].clone()],
          value: angleDeg,
          label: `${angleDeg.toFixed(1)}°`,
        });
      }
    } else if (tool === 'mechanical-axis') {
      addMeasurementDraftPoint(point);
      if (updatedDraft.length >= 3) {
        const submode = useEditorStore.getState().mechanicalAxisSubmode;
        const p1 = updatedDraft[0];
        const p2 = updatedDraft[1];
        const p3 = updatedDraft[2];
        const v1 = new THREE.Vector3().subVectors(p1, p2).normalize();
        const v2 = new THREE.Vector3().subVectors(p3, p2).normalize();
        const angleDeg = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, v1.dot(v2)))));

        let label = `HKA: ${angleDeg.toFixed(1)}°`;
        let classification = '';
        if (submode === 'hka') {
          if (angleDeg < 179.5) {
            classification = `${(180 - angleDeg).toFixed(1)}° Varus Deformity`;
          } else if (angleDeg > 180.5) {
            classification = `${(angleDeg - 180).toFixed(1)}° Valgus Deformity`;
          } else {
            classification = 'Neutral Alignment (180°)';
          }
        } else if (submode === 'mpta') {
          label = `MPTA: ${angleDeg.toFixed(1)}°`;
          classification = angleDeg < 85 ? 'Medial Slope Varus (<87°)' : angleDeg > 90 ? 'Valgus (>87°)' : 'Normal MPTA (87° ± 3°)';
        } else if (submode === 'mldfa') {
          label = `mLDFA: ${angleDeg.toFixed(1)}°`;
          classification = angleDeg < 85 ? 'Lateral Valgus (<88°)' : angleDeg > 90 ? 'Varus (>88°)' : 'Normal mLDFA (88° ± 3°)';
        }

        commitMeasurement({
          id: Math.random().toString(36).slice(2),
          type: 'mechanical-axis',
          subtype: submode,
          points: [p1.clone(), p2.clone(), p3.clone()],
          value: angleDeg,
          label,
          classification,
        });
      }
    } else if (tool === 'screw-picker') {
      addMeasurementDraftPoint(point);
      if (updatedDraft.length >= 2) {
        const p1 = updatedDraft[0];
        const p2 = updatedDraft[1];
        const dist = p1.distanceTo(p2);
        const alerts = useEditorStore.getState().breachAlerts;
        const hasBreach = alerts.length > 0;

        commitMeasurement({
          id: Math.random().toString(36).slice(2),
          type: 'screw',
          points: [p1.clone(), p2.clone()],
          value: dist,
          label: `Screw: ${dist.toFixed(1)} mm`,
          classification: hasBreach ? '⚠️ Cortical Breach Detected' : '✅ Within Cortical Safe Margin',
          hasBreach,
        });
      }
    }
  };

  return (
    <>
      <WebGLContextGuardian />

      {/* ── Realistic Clinical 3-Point Light Rig (Self-Contained / Offline Safe) ── */}
      <ambientLight intensity={0.55} color="#ffffff" />
      <hemisphereLight args={['#f8fafc', '#1e293b', 0.65]} />
      <directionalLight
        position={[100, 160, 110]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
        color="#fffbf2"
      />
      <directionalLight
        position={[-110, 70, -80]}
        intensity={0.9}
        color="#94a3b8"
      />
      <directionalLight
        position={[0, -60, 60]}
        intensity={0.4}
        color="#cbd5e1"
      />
      <directionalLight
        position={[0, 180, 0]}
        intensity={0.6}
        color="#ffffff"
      />

      {/* Touch-Optimized OrbitControls with 1-Finger Mode Switching */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.75}
        panSpeed={0.8}
        zoomSpeed={0.9}
        touches={{
          ONE: touchGestureMode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
      <CameraController />
      <ZoomToFitController />

      {/* Dynamic Ground Contact Shadows */}
      <ContactShadows
        position={[sceneFloor.centerX, sceneFloor.floorY, sceneFloor.centerZ]}
        opacity={0.38}
        scale={Math.max(250, sceneFloor.size * 2.4)}
        blur={2.5}
        far={Math.max(150, sceneFloor.size * 1.5)}
        frames={1}
      />

      {/* Clinical Grid on Floor */}
      <Grid
        infiniteGrid
        cellSize={snappingEnabled ? snapTranslation * 5 : 10}
        sectionSize={50}
        fadeDistance={Math.max(600, sceneFloor.size * 5)}
        cellColor={snappingEnabled ? '#1e3a40' : '#1e2530'}
        sectionColor="#334155"
        position={[sceneFloor.centerX, sceneFloor.floorY, sceneFloor.centerZ]}
      />

      {/* Corner Orientation Gizmo (Clickable for orthogonal view snap) */}
      <GizmoHelper alignment="bottom-right" margin={[75, 75]}>
        <GizmoViewport
          axisColors={['#ef4444', '#22c55e', '#3b82f6']}
          labelColor="#ffffff"
          hideNegativeAxes={false}
        />
      </GizmoHelper>

      {/* Meshes */}
      {Array.from(objects.values()).map((obj) => (
        <MeshItem
          key={obj.id}
          object={obj}
          isSelected={selectedIds.has(obj.id)}
          renderMode={renderMode}
          passthroughMode={passthroughMode}
          hasBreach={breachDetectionEnabled && breachedObjectIds.has(obj.id)}
          onSelect={(multi) => selectObject(obj.id, multi)}
          onSurfaceClick={handleSurfaceClick}
          onRegionGrowClick={handleRegionGrowClick}
        />
      ))}

      {/* Islands / Disconnected Shells 3D Highlighting */}
      {activeTool === 'islands' && activeObj && shells.length > 0 && (
        <IslandsOverlay
          object={activeObj}
          shells={shells}
          selectedIndices={selectedShellIndices}
          hoveredIndex={hoveredShellIndex}
        />
      )}

      {/* Surface Region Grow Highlight Overlay */}
      {activeTool === 'region-grow' && activeObj && meshRegionGrowSelectedFaces.length > 0 && (
        <RegionGrowOverlay
          object={activeObj}
          selectedFaces={meshRegionGrowSelectedFaces}
        />
      )}

      {/* Transform Gizmo */}
      <ActiveGizmo
        activeObject={activeObj}
        activeTool={activeTool}
        transformSubmode={transformSubmode}
        snappingEnabled={snappingEnabled}
        snapTranslation={snapTranslation}
        snapRotationDeg={snapRotationDeg}
        onTransformChange={(pos, rot, scale) => {
          if (activeObj) {
            setTransform(activeObj.id, pos, rot, scale);
          }
        }}
      />

      {/* Interactive Cut Plane */}
      <InteractiveCutPlane
        visible={activeTool === 'plane-cut'}
        onPositionChange={setCutPlanePosition}
        onRotationChange={setCutPlaneRotation}
      />

      {/* Two-Point Multi-Shape Connector Gizmo */}
      <TwoPointConnectorGizmo />

      {/* Breach Visualizer */}
      {breachDetectionEnabled && <BreachVisualizer alerts={breachAlerts} />}

      {/* 3D Measurements */}
      <MeasurementTools3D />
    </>
  );
}

/* ── Persistent Measurement Log & Snapshot Export Panel ──── */

function PersistentMeasurementLogPanel({ caseId }: { caseId: string }) {
  const measurements = useEditorStore((s) => s.measurements);
  const removeMeasurement = useEditorStore((s) => s.removeMeasurement);
  const clearAllMeasurements = useEditorStore((s) => s.clearAllMeasurements);
  const showMeasurementLog = useEditorStore((s) => s.showMeasurementLog);
  const setShowMeasurementLog = useEditorStore((s) => s.setShowMeasurementLog);

  const handleExportSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `ossilith-plan-snapshot-${caseId || 'case'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Snapshot export failed', e);
    }
  };

  if (!showMeasurementLog) {
    return (
      <button
        onClick={() => setShowMeasurementLog(true)}
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(51, 65, 85, 0.7)',
          borderRadius: 6,
          padding: '5px 10px',
          color: '#38bdf8',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        📋 Measurements ({measurements.length})
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: 14,
        width: 270,
        maxHeight: '75vh',
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(51, 65, 85, 0.8)',
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        color: '#f8fafc',
        fontFamily: 'var(--font-sans, sans-serif)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(51, 65, 85, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
          <span>📋 Surgical Log</span>
          <span
            style={{
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 10,
            }}
          >
            {measurements.length}
          </span>
        </div>
        <button
          onClick={() => setShowMeasurementLog(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Measurement List */}
      <div
        style={{
          padding: 8,
          maxHeight: 280,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {measurements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 8px', color: '#64748b', fontSize: 11 }}>
            No measurements recorded yet. Click points on anatomy to measure distances, angles, HKA axis, or screw lengths.
          </div>
        ) : (
          measurements.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                background: 'rgba(30, 41, 59, 0.6)',
                border: `1px solid ${m.hasBreach ? '#ef4444' : 'rgba(51, 65, 85, 0.6)'}`,
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 11,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#e2e8f0' }}>
                  <span>
                    {m.type === 'mechanical-axis'
                      ? '🦵'
                      : m.type === 'screw'
                      ? '🔩'
                      : m.type === 'angle'
                      ? '📐'
                      : '📏'}
                  </span>
                  <span>{m.label}</span>
                </div>
                {m.classification && (
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: m.hasBreach ? '#f87171' : '#38bdf8',
                      marginTop: 2,
                    }}
                  >
                    {m.classification}
                  </div>
                )}
              </div>
              <button
                onClick={() => removeMeasurement(m.id)}
                title="Remove measurement"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '2px 4px',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Actions Footer */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 10px',
          borderTop: '1px solid rgba(51, 65, 85, 0.6)',
          background: 'rgba(15, 23, 42, 0.95)',
          borderRadius: '0 0 10px 10px',
        }}
      >
        <button
          onClick={handleExportSnapshot}
          title="Export single snapshot image of current 3D view"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '6px 8px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: '#0284c7',
            color: '#fff',
            fontSize: 10.5,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
          }}
        >
          <span>📸 Export Snapshot</span>
        </button>

        {measurements.length > 0 && (
          <button
            onClick={() => clearAllMeasurements()}
            title="Clear all measurements"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid #475569',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Persistent Calibrated Scale Bar Overlay ──────────────── */

function ScaleBarOverlay() {
  const snappingEnabled = useEditorStore((s) => s.snappingEnabled);
  const snapTranslation = useEditorStore((s) => s.snapTranslation);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 58,
        left: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: 6,
          padding: '4px 10px',
          color: '#cbd5e1',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            width: 50,
            height: 4,
            background: 'linear-gradient(90deg, #38bdf8 0%, #38bdf8 100%)',
            borderRadius: 2,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -3,
              left: 0,
              width: 2,
              height: 10,
              background: '#38bdf8',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -3,
              right: 0,
              width: 2,
              height: 10,
              background: '#38bdf8',
            }}
          />
        </div>
        <span>50 mm (Grid: 10 mm)</span>
        {snappingEnabled && (
          <span
            style={{
              color: '#34d399',
              fontSize: 10,
              borderLeft: '1px solid #475569',
              paddingLeft: 6,
            }}
          >
            Snap: {snapTranslation} mm
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Main Exported Viewport ────────────────────────────── */

export default function EditorViewport({ caseId }: EditorViewportProps) {
  const { deselectAll } = useEditorStore();

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 35%, #1c202a 0%, #11141c 60%, #090b0e 100%)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.5)]}
        camera={{ position: [120, 80, 160], fov: 40, near: 0.5, far: 10000 }}
        onPointerMissed={() => deselectAll()}
        gl={{
          antialias: true,
          powerPreference: 'default',
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
      >
        <React.Suspense fallback={null}>
          <SceneContent caseId={caseId} />
        </React.Suspense>
      </Canvas>

      {/* Persistent Measurement Log + 1-Click Snapshot Export (Left Side) */}
      <PersistentMeasurementLogPanel caseId={caseId} />

      {/* Persistent Millimeter Scale Bar Overlay */}
      <ScaleBarOverlay />

      {/* Mobile & Tablet CAD Touch Navigation HUD (Right Side) */}
      <TouchNavigationHUD />
    </div>
  );
}


