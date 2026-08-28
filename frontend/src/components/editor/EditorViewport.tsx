'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, ContactShadows, Html, Edges } from '@react-three/drei';
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
} from '@/stores/editorStore';
import { generateConnectorShapeGeometry, computeConnectorOrientation } from '@/lib/csg';
import MeasurementTools3D from './MeasurementTools3D';

interface EditorViewportProps {
  caseId: string;
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
}: {
  object: STLObject;
  isSelected: boolean;
  renderMode: RenderMode;
  passthroughMode: boolean;
  hasBreach: boolean;
  onSelect: (multi: boolean) => void;
  onSurfaceClick: (point: THREE.Vector3) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const handleClick = (e: any) => {
    e.stopPropagation();
    const { activeTool } = useEditorStore.getState();

    if (activeTool === 'measure-distance' || activeTool === 'measure-angle' || activeTool === 'connector') {
      if (e.point) {
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

  const baseColor = isImplant ? '#cbd5e1' : object.color || '#e8dcc8';
  const effectiveOpacity = passthroughMode ? 0.35 : object.opacity ?? 1.0;

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={object.geometry}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        visible={object.visible}
        onClick={handleClick}
        castShadow={!passthroughMode}
        receiveShadow={!passthroughMode}
      >
        {renderMode === 'solid' && !passthroughMode && (
          <meshPhysicalMaterial
            color={hasBreach ? '#fca5a5' : isSelected ? '#c8d5c0' : baseColor}
            roughness={isImplant ? 0.25 : 0.55}
            metalness={isImplant ? 0.75 : 0.02}
            clearcoat={isImplant ? 0.5 : isSelected ? 0.3 : 0.1}
            clearcoatRoughness={0.3}
            envMapIntensity={0.8}
            emissive={hasBreach ? '#ef4444' : isSelected ? '#1a4d24' : '#000000'}
            emissiveIntensity={hasBreach ? 0.35 : isSelected ? 0.15 : 0}
            transparent={effectiveOpacity < 1}
            opacity={effectiveOpacity}
            side={THREE.DoubleSide}
          />
        )}

        {(renderMode === 'wireframe' || (renderMode === 'solid' && passthroughMode)) && (
          <meshPhysicalMaterial
            color={hasBreach ? '#ef4444' : isSelected ? '#38bdf8' : isImplant ? '#e2e8f0' : '#88a898'}
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
            color={isSelected ? '#a7c4bc' : baseColor}
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

      {/* Selection outline glow */}
      {isSelected && renderMode === 'solid' && !passthroughMode && object.visible && (
        <mesh
          geometry={object.geometry}
          position={object.position}
          rotation={object.rotation}
          scale={object.scale.map((s) => s * 1.002) as [number, number, number]}
        >
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.15}
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
  const { cameraPreset, cameraPresetTrigger } = useEditorStore();
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

/* ── Axis Indicator ────────────────────────────────────── */

function AxisIndicator() {
  return (
    <group position={[-110, -70, -110]} scale={[8, 8, 8]}>
      <arrowHelper args={[new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 3, 0xef4444, 0.6, 0.3]} />
      <arrowHelper args={[new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 3, 0x22c55e, 0.6, 0.3]} />
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 3, 0x3b82f6, 0.6, 0.3]} />
      <Html position={[3.5, 0, 0]} center><span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700 }}>X</span></Html>
      <Html position={[0, 3.5, 0]} center><span style={{ color: '#22c55e', fontSize: 9, fontWeight: 700 }}>Y</span></Html>
      <Html position={[0, 0, 3.5]} center><span style={{ color: '#3b82f6', fontSize: 9, fontWeight: 700 }}>Z</span></Html>
    </group>
  );
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
  } = useEditorStore();

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : null;

  const breachedObjectIds = useMemo(() => {
    return new Set(breachAlerts.map((b) => b.objectId));
  }, [breachAlerts]);

  const handleSurfaceClick = (point: THREE.Vector3) => {
    const tool = useEditorStore.getState().activeTool;

    if (tool === 'connector') {
      const { source, target } = useEditorStore.getState().connectorPoints;
      if (!source) {
        setConnectorPoints({ source: point, target: null });
      } else if (!target) {
        setConnectorPoints({ source, target: point });
      } else {
        // Reset and pick new source
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
    }
  };

  return (
    <>
      <ambientLight intensity={0.5} color="#f0f0e8" />
      <hemisphereLight args={['#e8f0e8', '#d0c8b8', 0.6]} />
      <directionalLight position={[80, 120, 100]} intensity={1.2} castShadow color="#fff" />
      <directionalLight position={[-60, 80, -80]} intensity={0.5} color="#e8f0ff" />
      <directionalLight position={[0, -50, 60]} intensity={0.25} color="#ffe8d0" />

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <CameraController />

      <ContactShadows
        position={[0, -80, 0]}
        opacity={0.15}
        scale={300}
        blur={2}
        far={200}
      />

      <Grid
        infiniteGrid
        cellSize={snappingEnabled ? snapTranslation * 5 : 10}
        sectionSize={50}
        fadeDistance={500}
        cellColor={snappingEnabled ? '#a7c4bc' : '#d7e4d8'}
        sectionColor="#b6ced5"
        position={[0, -80, 0]}
      />

      <AxisIndicator />

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
        />
      ))}

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

/* ── Main Exported Viewport ────────────────────────────── */

export default function EditorViewport({ caseId }: EditorViewportProps) {
  const { deselectAll } = useEditorStore();

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'linear-gradient(180deg, #e8ede8 0%, #dde4dd 40%, #d0d8d0 100%)',
      }}
    >
      <Canvas
        shadows
        camera={{ position: [120, 80, 160], fov: 40 }}
        onPointerMissed={() => deselectAll()}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      >
        <SceneContent caseId={caseId} />
      </Canvas>
    </div>
  );
}
