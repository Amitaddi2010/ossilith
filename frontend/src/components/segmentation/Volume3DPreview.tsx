'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Center, Bounds, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { Loader2, Box } from 'lucide-react';

interface Volume3DPreviewProps {
  caseId: string;
  refreshKey?: number | string;
  layerId?: string | null;
}

import { API_BASE } from '@/lib/api';

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
          console.warn('Volume 3D Preview load failed (retrying in 3s):', err.message);
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

  // Gentle auto-rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  if (!geometry) return null;

  return (
    <Center>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#e2d5c3"
          roughness={0.5}
          metalness={0.02}
          clearcoat={0.15}
          clearcoatRoughness={0.5}
          envMapIntensity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </Center>
  );
}

export default function Volume3DPreview({ caseId, refreshKey = 0, layerId = null }: Volume3DPreviewProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const queryParams = new URLSearchParams();
  if (refreshKey) queryParams.set('v', String(refreshKey));
  if (layerId) queryParams.set('layer_id', layerId);
  const queryString = queryParams.toString();
  const meshUrl = `${API_BASE}/api/cases/${caseId}/volume/mesh${queryString ? `?${queryString}` : ''}`;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'linear-gradient(180deg, #0d120d 0%, #0a0d0a 100%)',
        borderRadius: 'var(--radius-cards)',
        overflow: 'hidden',
      }}
    >
      {/* Badge Header */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 10,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            backgroundColor: 'rgba(27, 59, 30, 0.9)',
            color: '#e1f4df',
            fontWeight: 600,
            borderRadius: 'var(--radius-badges)',
            fontFamily: 'var(--font-sans)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Box size={10} />
          3D Bone Preview
        </span>
      </div>

      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(10, 13, 10, 0.9)',
            zIndex: 5,
            gap: 10,
          }}
        >
          <Loader2 size={24} className="animate-spin" color="#b1dbb8" />
          <span
            style={{
              fontSize: 12,
              color: '#b1dbb8',
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Reconstructing 3D anatomy...
          </span>
        </div>
      )}

      <Canvas
        camera={{ position: [0, -200, 120], fov: 40 }}
        gl={{
          antialias: true,
          powerPreference: 'default',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
      >
        <ambientLight intensity={0.6} color="#e8f0e8" />
        <hemisphereLight args={['#c8dcc8', '#a0b8a0', 0.4]} />
        <directionalLight position={[120, 120, 160]} intensity={1.2} color="#fff" />
        <directionalLight position={[-80, -60, -100]} intensity={0.4} color="#e0e8ff" />
        <directionalLight position={[0, 200, 0]} intensity={0.5} />

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />

        <Grid
          infiniteGrid
          cellSize={12}
          sectionSize={60}
          fadeDistance={350}
          cellColor="#1e3a1f"
          sectionColor="#2f5a32"
        />

        <Bounds fit clip observe margin={1.3}>
          <BoneMesh url={meshUrl} onLoaded={() => setLoading(false)} />
        </Bounds>
      </Canvas>
    </div>
  );
}

