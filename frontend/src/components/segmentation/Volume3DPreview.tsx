'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  RotateCcw,
  Move,
  ZoomIn,
  Eye,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  Box,
  Palette,
  Crosshair,
  Compass,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

interface Volume3DPreviewProps {
  caseId: string;
  refreshKey?: number | string;
  layerId?: string | null;
}

function BoneMesh({ url, onLoaded }: { url: string; onLoaded: () => void }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const abortCtrl = new AbortController();
    let currentGeo: THREE.BufferGeometry | null = null;

    const loadMesh = async () => {
      try {
        const res = await fetch(url, { signal: abortCtrl.signal, cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (abortCtrl.signal.aborted) return;

        const loader = new STLLoader();
        const geo = loader.parse(buffer);
        geo.computeVertexNormals();
        geo.center();
        currentGeo = geo;
        setGeometry(geo);
        onLoaded();
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Volume 3D Preview load failed:', err.message);
        }
      }
    };

    loadMesh();

    return () => {
      abortCtrl.abort();
      if (currentGeo) {
        currentGeo.dispose();
      }
    };
  }, [url, onLoaded]);

  if (!geometry) return null;

  return (
    <Center>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#dcd7cb"
          roughness={0.4}
          metalness={0.05}
          clearcoat={0.15}
          clearcoatRoughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </Center>
  );
}

// 3D Orientation Triad (N, X, Y, Z)
function OrientationAxes() {
  return (
    <group position={[-25, -20, 0]}>
      {/* X Axis - Red */}
      <arrowHelper args={[new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 12, 0xdc2626, 3, 2]} />
      {/* Y Axis - Green */}
      <arrowHelper args={[new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 12, 0x16a34a, 3, 2]} />
      {/* Z Axis - Blue */}
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 12, 0x2563eb, 3, 2]} />
    </group>
  );
}

export default function Volume3DPreview({ caseId, refreshKey = 0, layerId = null }: Volume3DPreviewProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode3d, setViewMode3d] = useState<'solid' | 'transparent' | 'wireframe'>('solid');
  const controlsRef = useRef<any>(null);

  const queryParams = new URLSearchParams();
  if (refreshKey) queryParams.set('v', String(refreshKey));
  if (layerId) queryParams.set('layer_id', layerId);
  const queryString = queryParams.toString();
  const meshUrl = `${API_BASE}/api/cases/${caseId}/volume/mesh${queryString ? `?${queryString}` : ''}`;

  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <Canvas
        camera={{ position: [0, -100, 140], fov: 40 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[100, 100, 150]} intensity={1.4} castShadow />
        <directionalLight position={[-100, -100, -100]} intensity={0.6} />
        <pointLight position={[0, 0, 200]} intensity={0.8} />

        <BoneMesh url={meshUrl} onLoaded={() => setLoading(false)} />
        <OrientationAxes />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.8}
          zoomSpeed={1.0}
          panSpeed={0.8}
        />
      </Canvas>

      {/* Floating Vertical 3D Tool Pallet on Right Edge */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: '#f8fafc',
          padding: 3,
          borderRadius: 4,
          border: '1px solid #cbd5e1',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          zIndex: 10,
        }}
      >
        <button
          onClick={handleResetCamera}
          title="Reset 3D View / Center Part"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <RotateCcw size={14} />
        </button>

        <button
          title="Pan 3D View"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Move size={14} />
        </button>

        <button
          title="Zoom 3D"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <ZoomIn size={14} />
        </button>

        <button
          title="Align Normal"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Compass size={14} />
        </button>

        <button
          title="Shading / Contours"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Layers size={14} />
        </button>

        <button
          title="Part Color & Transparency"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Palette size={14} />
        </button>
      </div>

      {/* Top Left Label */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          fontSize: 11,
          fontWeight: 700,
          color: '#334155',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <span style={{ color: '#0284c7' }}>3D</span> 3D Viewport
      </div>
    </div>
  );
}
