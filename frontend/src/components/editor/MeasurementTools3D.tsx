'use client';

import React, { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, Measurement3D } from '@/stores/editorStore';
import { Html } from '@react-three/drei';

/**
 * 3D Measurement visualization and raycasting tool for the surgical planning editor.
 * Supports distance (2-point) and angle (3-point) measurements with surface snapping.
 */

function MeasurementBadge({ position, text, color }: { position: THREE.Vector3; text: string; color: string }) {
  return (
    <Html position={position} center distanceFactor={200} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: `1px solid ${color}`,
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          color: '#ffffff',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

function MeasurementLine({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    return new THREE.Line(geo, mat);
  }, [points, color]);

  return <primitive object={lineObj} />;
}

function MeasurementEndpoint({ position, color }: { position: THREE.Vector3; color: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[1.5, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function CompletedMeasurement({ measurement }: { measurement: Measurement3D }) {
  const color = measurement.type === 'distance' ? '#38bdf8' : '#ec4899';

  if (measurement.type === 'distance' && measurement.points.length === 2) {
    const midpoint = new THREE.Vector3()
      .addVectors(measurement.points[0], measurement.points[1])
      .multiplyScalar(0.5);

    return (
      <group>
        <MeasurementLine points={measurement.points} color={color} />
        <MeasurementEndpoint position={measurement.points[0]} color={color} />
        <MeasurementEndpoint position={measurement.points[1]} color={color} />
        <MeasurementBadge position={midpoint} text={measurement.label} color={color} />
      </group>
    );
  }

  if (measurement.type === 'angle' && measurement.points.length === 3) {
    return (
      <group>
        <MeasurementLine points={[measurement.points[0], measurement.points[1]]} color={color} />
        <MeasurementLine points={[measurement.points[1], measurement.points[2]]} color={color} />
        <MeasurementEndpoint position={measurement.points[0]} color={color} />
        <MeasurementEndpoint position={measurement.points[1]} color={color} />
        <MeasurementEndpoint position={measurement.points[2]} color={color} />
        <MeasurementBadge position={measurement.points[1]} text={measurement.label} color={color} />
      </group>
    );
  }

  return null;
}

function DraftMeasurement() {
  const { measurementDraftPoints, activeTool } = useEditorStore();
  const color =
    activeTool === 'measure-distance' ? '#fbbf24' : '#f472b6';

  if (measurementDraftPoints.length === 0) return null;

  return (
    <group>
      {measurementDraftPoints.map((pt, i) => (
        <MeasurementEndpoint key={i} position={pt} color={color} />
      ))}
      {measurementDraftPoints.length >= 2 && (
        <MeasurementLine
          points={
            activeTool === 'measure-distance'
              ? [measurementDraftPoints[0], measurementDraftPoints[1]]
              : measurementDraftPoints.slice(0, measurementDraftPoints.length)
          }
          color={color}
        />
      )}
      {measurementDraftPoints.length === 2 && activeTool === 'measure-angle' && (
        <MeasurementLine
          points={[measurementDraftPoints[0], measurementDraftPoints[1]]}
          color={color}
        />
      )}
    </group>
  );
}

/**
 * Raycast click handler for measurement tools.
 * Clicks on mesh surfaces to place measurement points.
 */
export function MeasurementClickHandler() {
  const { camera, raycaster, scene } = useThree();
  const {
    activeTool,
    measurementDraftPoints,
    addMeasurementDraftPoint,
    commitMeasurement,
    clearMeasurementDraft,
    objects,
  } = useEditorStore();

  const isMeasureTool = activeTool === 'measure-distance' || activeTool === 'measure-angle';

  // Find all mesh objects in scene for raycasting
  const getMeshes = (): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.visible) {
        meshes.push(child as THREE.Mesh);
      }
    });
    return meshes;
  };

  const handleClick = (event: THREE.Event) => {
    if (!isMeasureTool) return;

    const meshes = getMeshes();
    if (meshes.length === 0) return;

    // The event from R3F already has intersection data if we click on a mesh
    const intersection = (event as any).point as THREE.Vector3 | undefined;
    if (!intersection) return;

    const point = intersection.clone();
    const updatedDraft = [...measurementDraftPoints, point];

    if (activeTool === 'measure-distance') {
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
    } else if (activeTool === 'measure-angle') {
      if (updatedDraft.length < 3) {
        addMeasurementDraftPoint(point);
      }
      if (updatedDraft.length >= 3) {
        // Calculate angle at the center point (index 1)
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

  return { handleClick, isMeasureTool };
}

/**
 * Renders all completed and in-progress measurements in the 3D scene.
 */
export default function MeasurementTools3D() {
  const { measurements } = useEditorStore();

  return (
    <group>
      {measurements.map((m) => (
        <CompletedMeasurement key={m.id} measurement={m} />
      ))}
      <DraftMeasurement />
    </group>
  );
}
