'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Center, Bounds } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { Loader2, Box, Layers as LayersIcon, Check, RotateCw, Sparkles } from 'lucide-react';
import { API_BASE } from '@/lib/api';

export interface Layer3DInfo {
  id: string;
  name: string;
  color: string;
  opacity?: number;
  visible?: boolean;
}

interface Volume3DPreviewProps {
  caseId: string;
  refreshKey?: number | string;
  layerId?: string | null;
  layers?: Layer3DInfo[];
  activeLayerId?: string | null;
}

interface SingleMeshProps {
  url: string;
  color: string;
  opacity: number;
  onLoaded: () => void;
  onError?: () => void;
}

function LayerMesh({ url, color, opacity, onLoaded, onError }: SingleMeshProps) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const abortCtrl = new AbortController();
    let currentGeo: THREE.BufferGeometry | null = null;
    let finished = false;

    const safetyTimer = setTimeout(() => {
      if (!finished) {
        finished = true;
        onLoaded();
      }
    }, 2000);

    const loadMesh = async () => {
      try {
        const res = await fetch(url, { signal: abortCtrl.signal, cache: 'default' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (abortCtrl.signal.aborted) return;

        if (buffer.byteLength <= 84) {
          // Empty mesh (0 triangles)
          if (!finished) {
            finished = true;
            clearTimeout(safetyTimer);
            onLoaded();
          }
          return;
        }

        const loader = new STLLoader();
        const geo = loader.parse(buffer);
        geo.computeVertexNormals();
        currentGeo = geo;
        setGeometry(geo);
        if (!finished) {
          finished = true;
          clearTimeout(safetyTimer);
          onLoaded();
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn(`Mesh load warning (${url}):`, err.message);
          onError?.();
          if (!finished) {
            finished = true;
            clearTimeout(safetyTimer);
            onLoaded();
          }
        }
      }
    };

    loadMesh();

    return () => {
      abortCtrl.abort();
      clearTimeout(safetyTimer);
      if (currentGeo) {
        currentGeo.dispose();
      }
    };
  }, [url, onLoaded, onError]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={color}
        roughness={0.35}
        metalness={0.06}
        clearcoat={0.35}
        clearcoatRoughness={0.25}
        transparent={opacity < 0.98}
        opacity={Math.max(0.2, Math.min(1.0, opacity))}
        envMapIntensity={0.65}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SceneRotator({ active, children }: { active: boolean; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (active && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

export default function Volume3DPreview({
  caseId,
  refreshKey = 0,
  layers = [],
  activeLayerId = null,
}: Volume3DPreviewProps) {
  // Enabled layer IDs for 3D display
  const [active3DLayerIds, setActive3DLayerIds] = useState<string[]>([]);
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  // Available layers list
  const availableLayers = useMemo(() => {
    return layers && layers.length > 0
      ? layers
      : activeLayerId
        ? [{ id: activeLayerId, name: 'Active Layer', color: '#00FFAA', opacity: 0.85, visible: true }]
        : [];
  }, [layers, activeLayerId]);

  // Sync initial selection to all visible layers
  useEffect(() => {
    if (availableLayers.length > 0) {
      const visibleIds = availableLayers.filter((l) => l.visible !== false).map((l) => l.id);
      setActive3DLayerIds((prev) => {
        // If previously empty, default to all visible layers
        if (prev.length === 0) return visibleIds;
        // Keep valid existing selections, plus any new visible layers
        const valid = prev.filter((id) => availableLayers.some((al) => al.id === id));
        return valid.length > 0 ? valid : visibleIds;
      });
    }
  }, [availableLayers]);

  const targetLayers = useMemo(() => {
    if (availableLayers.length === 0) return [];
    return availableLayers.filter((l) => active3DLayerIds.includes(l.id));
  }, [availableLayers, active3DLayerIds]);

  const isAllSelected =
    availableLayers.length > 0 &&
    availableLayers.filter((l) => l.visible !== false).every((l) => active3DLayerIds.includes(l.id));

  const totalToLoad = Math.max(1, targetLayers.length);
  const isUpdating = loadedCount < totalToLoad;

  const handleMeshLoaded = useCallback(() => {
    setLoadedCount((prev) => prev + 1);
  }, []);

  const handleMeshError = useCallback(() => {
    setLoadedCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    setLoadedCount(0);
  }, [targetLayers, refreshKey]);

  // Toggle single layer on/off in 3D
  const toggleLayer = (layerId: string) => {
    setActive3DLayerIds((prev) => {
      if (prev.includes(layerId)) {
        const next = prev.filter((id) => id !== layerId);
        return next.length > 0 ? next : [layerId]; // Keep at least one selected
      } else {
        return [...prev, layerId];
      }
    });
  };

  // Select all visible layers
  const selectAll = () => {
    const visibleIds = availableLayers.filter((l) => l.visible !== false).map((l) => l.id);
    setActive3DLayerIds(visibleIds);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'radial-gradient(ellipse at 50% 40%, #0e1610 0%, #070a07 100%)',
        borderRadius: 'var(--radius-cards)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Header Controls & Layer Pills ── */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          right: 12,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
          pointerEvents: 'auto',
        }}
      >
        {/* Left: 3D CAD Badge & Layer Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', maxWidth: '82%' }}>
          <span
            style={{
              fontSize: 10.5,
              padding: '3px 9px',
              backgroundColor: 'rgba(20, 48, 25, 0.95)',
              color: '#d1fae5',
              fontWeight: 600,
              borderRadius: 'var(--radius-badges)',
              fontFamily: 'var(--font-sans)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: '1px solid rgba(52, 211, 153, 0.25)',
              backdropFilter: 'blur(6px)',
              letterSpacing: '0.02em',
            }}
          >
            <Box size={11} color="#34d399" />
            3D CAD Scene
          </span>

          {/* All Visible Toggle Button */}
          {availableLayers.length > 1 && (
            <button
              onClick={selectAll}
              style={{
                fontSize: 10.5,
                padding: '3px 10px',
                borderRadius: 14,
                border: '1px solid',
                borderColor: isAllSelected ? '#00FFAA' : 'rgba(255,255,255,0.18)',
                backgroundColor: isAllSelected ? 'rgba(0, 255, 170, 0.16)' : 'rgba(0,0,0,0.5)',
                color: isAllSelected ? '#00FFAA' : '#94a3b8',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: isAllSelected ? 700 : 500,
                transition: 'all 0.15s ease',
                backdropFilter: 'blur(4px)',
              }}
              title="Show all available segmented layers in 3D"
            >
              <LayersIcon size={11} />
              All Visible ({availableLayers.length})
            </button>
          )}

          {/* Layer Chips */}
          {availableLayers.map((l) => {
            const isSelected = active3DLayerIds.includes(l.id);
            const layerColor = l.color || '#00FFAA';
            return (
              <button
                key={l.id}
                onClick={() => toggleLayer(l.id)}
                style={{
                  fontSize: 10.5,
                  padding: '3px 10px',
                  borderRadius: 14,
                  border: '1px solid',
                  borderColor: isSelected ? layerColor : 'rgba(255,255,255,0.12)',
                  backgroundColor: isSelected ? `${layerColor}24` : 'rgba(0,0,0,0.45)',
                  color: isSelected ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: isSelected ? 600 : 400,
                  transition: 'all 0.15s ease',
                  backdropFilter: 'blur(4px)',
                }}
                title={`Toggle ${l.name} in 3D scene`}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: layerColor,
                    display: 'inline-block',
                    boxShadow: isSelected ? `0 0 8px ${layerColor}` : 'none',
                  }}
                />
                <span>{l.name}</span>
                {isSelected && <Check size={10} color={layerColor} strokeWidth={3} />}
              </button>
            );
          })}
        </div>

        {/* Right: Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setAutoRotate((r) => !r)}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              backgroundColor: autoRotate ? 'rgba(56, 189, 248, 0.16)' : 'rgba(0,0,0,0.45)',
              color: autoRotate ? '#38bdf8' : '#64748b',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500,
            }}
            title="Toggle continuous auto-rotation"
          >
            <RotateCw size={10} className={autoRotate ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
            {autoRotate ? 'Rotating' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Non-blocking bottom-right loading indicator */}
      {isUpdating && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(10, 18, 12, 0.9)',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 14,
            padding: '4px 10px',
            zIndex: 15,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Loader2 size={12} className="animate-spin" color="#34d399" />
          <span
            style={{
              fontSize: 10,
              color: '#a7f3d0',
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Building 3D Mesh ({loadedCount}/{totalToLoad})...
          </span>
        </div>
      )}

      {/* Three.js 3D Viewport */}
      <Canvas
        camera={{ position: [0, -220, 130], fov: 36 }}
        gl={{
          antialias: true,
          powerPreference: 'default',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3,
        }}
      >
        <ambientLight intensity={0.7} color="#f0fdf4" />
        <hemisphereLight args={['#e0f2fe', '#064e3b', 0.5]} />
        <directionalLight position={[150, 160, 200]} intensity={1.4} color="#ffffff" />
        <directionalLight position={[-120, -100, -140]} intensity={0.5} color="#bae6fd" />
        <directionalLight position={[0, 220, 0]} intensity={0.6} />

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />

        <Grid
          infiniteGrid
          cellSize={14}
          sectionSize={70}
          fadeDistance={420}
          cellColor="#1e3a1f"
          sectionColor="#2f5a32"
        />

        <Bounds fit clip observe margin={1.2}>
          <SceneRotator active={autoRotate}>
            <group position={[0, 0, 0]}>
              {targetLayers.length > 0 ? (
                targetLayers.map((l) => {
                  const meshUrl = `${API_BASE}/api/cases/${caseId}/volume/mesh?layer_id=${l.id}&v=${refreshKey}`;
                  return (
                    <LayerMesh
                      key={`${l.id}-${refreshKey}`}
                      url={meshUrl}
                      color={l.color || '#00FFAA'}
                      opacity={l.opacity ?? 0.85}
                      onLoaded={handleMeshLoaded}
                      onError={handleMeshError}
                    />
                  );
                })
              ) : (
                <LayerMesh
                  url={`${API_BASE}/api/cases/${caseId}/volume/mesh?v=${refreshKey}`}
                  color="#e2d5c3"
                  opacity={0.9}
                  onLoaded={handleMeshLoaded}
                  onError={handleMeshError}
                />
              )}
            </group>
          </SceneRotator>
        </Bounds>
      </Canvas>
    </div>
  );
}
