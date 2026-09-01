'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useEditorStore, Measurement3D } from '@/stores/editorStore';
import { Html, Edges } from '@react-three/drei';

/**
 * 3D Measurement & Orthopedic Planning visualization tool for Ossilith.
 * Supports:
 * 1. Distance (2-point)
 * 2. Angle (3-point)
 * 3. Mechanical Axis (3-click HKA, MPTA, mLDFA with instant varus/valgus classification)
 * 4. Screw Length (2-click trajectory with cortical breach check)
 * 5. Ghost Mirror Overlay (1-click contralateral symmetry visualization)
 */

function MeasurementBadge({
  position,
  text,
  subtext,
  color,
  hasBreach,
}: {
  position: THREE.Vector3;
  text: string;
  subtext?: string;
  color: string;
  hasBreach?: boolean;
}) {
  return (
    <Html position={position} center distanceFactor={220} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: hasBreach ? 'rgba(153, 27, 27, 0.95)' : 'rgba(15, 23, 42, 0.92)',
          border: `1.5px solid ${hasBreach ? '#ef4444' : color}`,
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          color: '#ffffff',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)',
          boxShadow: hasBreach ? '0 4px 16px rgba(239, 68, 68, 0.4)' : '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {hasBreach && <span>⚠️</span>}
          <span>{text}</span>
        </div>
        {subtext && (
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: hasBreach ? '#fca5a5' : '#94a3b8',
            }}
          >
            {subtext}
          </div>
        )}
      </div>
    </Html>
  );
}

function MeasurementLine({
  points,
  color,
}: {
  points: THREE.Vector3[];
  color: string;
}) {
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    return new THREE.Line(geo, mat);
  }, [points, color]);

  return <primitive object={lineObj} />;
}

function MeasurementEndpoint({
  position,
  color,
  label,
  size = 2.0,
}: {
  position: THREE.Vector3;
  color: string;
  label?: string;
  size?: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {label && (
        <Html position={[0, size + 3, 0]} center distanceFactor={220} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 9,
              color: '#f8fafc',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function ScrewCylinder({
  p1,
  p2,
  radius = 1.8,
  hasBreach,
}: {
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  radius?: number;
  hasBreach?: boolean;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    return { position: mid, quaternion: quat, length: len };
  }, [p1, p2]);

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <meshPhysicalMaterial
        color={hasBreach ? '#ef4444' : '#94a3b8'}
        metalness={0.9}
        roughness={0.2}
        clearcoat={0.5}
        emissive={hasBreach ? '#ef4444' : '#000000'}
        emissiveIntensity={hasBreach ? 0.4 : 0}
      />
    </mesh>
  );
}

function CompletedMeasurement({ measurement }: { measurement: Measurement3D }) {
  if (measurement.type === 'distance' && measurement.points.length === 2) {
    const midpoint = new THREE.Vector3()
      .addVectors(measurement.points[0], measurement.points[1])
      .multiplyScalar(0.5);

    return (
      <group>
        <MeasurementLine points={measurement.points} color="#38bdf8" />
        <MeasurementEndpoint position={measurement.points[0]} color="#38bdf8" />
        <MeasurementEndpoint position={measurement.points[1]} color="#38bdf8" />
        <MeasurementBadge position={midpoint} text={measurement.label} color="#38bdf8" />
      </group>
    );
  }

  if (measurement.type === 'angle' && measurement.points.length === 3) {
    return (
      <group>
        <MeasurementLine points={[measurement.points[0], measurement.points[1]]} color="#ec4899" />
        <MeasurementLine points={[measurement.points[1], measurement.points[2]]} color="#ec4899" />
        <MeasurementEndpoint position={measurement.points[0]} color="#ec4899" label="Point 1" />
        <MeasurementEndpoint position={measurement.points[1]} color="#ec4899" label="Vertex" size={2.5} />
        <MeasurementEndpoint position={measurement.points[2]} color="#ec4899" label="Point 2" />
        <MeasurementBadge position={measurement.points[1]} text={measurement.label} color="#ec4899" />
      </group>
    );
  }

  if (measurement.type === 'mechanical-axis' && measurement.points.length === 3) {
    const [hip, knee, ankle] = measurement.points;

    return (
      <group>
        {/* Femoral Mechanical Axis (Hip -> Knee) */}
        <MeasurementLine points={[hip, knee]} color="#f59e0b" />
        {/* Tibial Mechanical Axis (Knee -> Ankle) */}
        <MeasurementLine points={[knee, ankle]} color="#10b981" />

        <MeasurementEndpoint position={hip} color="#f59e0b" label="Hip Center" size={3} />
        <MeasurementEndpoint position={knee} color="#38bdf8" label="Knee Center" size={3.5} />
        <MeasurementEndpoint position={ankle} color="#10b981" label="Ankle Center" size={3} />

        <MeasurementBadge
          position={knee}
          text={measurement.label}
          subtext={measurement.classification}
          color="#38bdf8"
        />
      </group>
    );
  }

  if (measurement.type === 'screw' && measurement.points.length === 2) {
    const [p1, p2] = measurement.points;
    const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

    return (
      <group>
        <ScrewCylinder p1={p1} p2={p2} radius={1.8} hasBreach={measurement.hasBreach} />
        <MeasurementEndpoint position={p1} color="#60a5fa" label="Entry Cortex" size={2.5} />
        <MeasurementEndpoint position={p2} color="#f59e0b" label="Target Cortex" size={2.5} />
        <MeasurementBadge
          position={midpoint}
          text={measurement.label}
          subtext={measurement.classification}
          color={measurement.hasBreach ? '#ef4444' : '#60a5fa'}
          hasBreach={measurement.hasBreach}
        />
      </group>
    );
  }

  return null;
}

function DraftMeasurement() {
  const { measurementDraftPoints, activeTool, mechanicalAxisSubmode } = useEditorStore();

  const labels = useMemo(() => {
    if (activeTool === 'mechanical-axis') {
      if (mechanicalAxisSubmode === 'hka') return ['Hip Center', 'Knee Center', 'Ankle Center'];
      if (mechanicalAxisSubmode === 'mpta') return ['Medial Plateau', 'Lateral Plateau', 'Ankle Center'];
      return ['Hip Center', 'Lateral Condyle', 'Medial Condyle'];
    }
    if (activeTool === 'screw-picker') return ['Entry Point', 'Target Point'];
    if (activeTool === 'measure-angle') return ['Point 1', 'Vertex', 'Point 2'];
    return ['Start', 'End'];
  }, [activeTool, mechanicalAxisSubmode]);

  if (measurementDraftPoints.length === 0) return null;

  let color = '#fbbf24';
  if (activeTool === 'measure-angle') color = '#f472b6';
  else if (activeTool === 'mechanical-axis') color = '#38bdf8';
  else if (activeTool === 'screw-picker') color = '#60a5fa';

  return (
    <group>
      {measurementDraftPoints.map((pt, i) => (
        <MeasurementEndpoint key={i} position={pt} color={color} label={labels[i] || `Point ${i + 1}`} size={2.5} />
      ))}

      {measurementDraftPoints.length >= 2 && (
        <MeasurementLine
          points={
            activeTool === 'measure-distance' || activeTool === 'screw-picker'
              ? [measurementDraftPoints[0], measurementDraftPoints[1]]
              : measurementDraftPoints.slice(0, measurementDraftPoints.length)
          }
          color={color}
        />
      )}

      {/* Guide badge showing next click prompt */}
      {measurementDraftPoints.length > 0 && (
        <Html
          position={measurementDraftPoints[measurementDraftPoints.length - 1]}
          center
          distanceFactor={220}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(2, 132, 199, 0.95)',
              color: '#ffffff',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 10.5,
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
              transform: 'translateY(-24px)',
            }}
          >
            {activeTool === 'mechanical-axis' && measurementDraftPoints.length === 1 && '👉 Click Knee Center'}
            {activeTool === 'mechanical-axis' && measurementDraftPoints.length === 2 && '👉 Click Ankle Center'}
            {activeTool === 'screw-picker' && measurementDraftPoints.length === 1 && '👉 Click Far Cortex / Target'}
            {activeTool === 'measure-distance' && measurementDraftPoints.length === 1 && '👉 Click Second Point'}
            {activeTool === 'measure-angle' && measurementDraftPoints.length === 1 && '👉 Click Apex Vertex'}
            {activeTool === 'measure-angle' && measurementDraftPoints.length === 2 && '👉 Click End Point'}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * 1-Click Ghost Mirror Overlay Component (Contralateral Symmetry Comparison)
 */
function GhostMirrorOverlayView() {
  const ghostOverlay = useEditorStore((s) => s.ghostOverlay);

  if (!ghostOverlay || !ghostOverlay.visible || !ghostOverlay.geometry) {
    return null;
  }

  return (
    <group
      position={ghostOverlay.position}
      rotation={ghostOverlay.rotation}
      scale={ghostOverlay.scale}
    >
      <mesh geometry={ghostOverlay.geometry}>
        <meshPhysicalMaterial
          color="#38bdf8"
          transparent
          opacity={0.35}
          roughness={0.2}
          metalness={0.1}
          clearcoat={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          emissive="#0284c7"
          emissiveIntensity={0.2}
        />
        <Edges threshold={20} color="#0284c7" />
      </mesh>

      <Html position={[0, 40, 0]} center distanceFactor={220} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            background: 'rgba(2, 132, 199, 0.9)',
            border: '1px solid #38bdf8',
            borderRadius: 6,
            padding: '3px 8px',
            color: '#fff',
            fontSize: 10.5,
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          🪞 Contralateral Mirror Ghost (Sagittal Flip)
        </div>
      </Html>
    </group>
  );
}

/**
 * Main 3D Planning & Measurement Module Component
 */
export default function MeasurementTools3D() {
  const { measurements } = useEditorStore();

  return (
    <group>
      {measurements.map((m) => (
        <CompletedMeasurement key={m.id} measurement={m} />
      ))}
      <DraftMeasurement />
      <GhostMirrorOverlayView />
    </group>
  );
}
