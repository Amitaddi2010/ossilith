'use client';

import React, { useState } from 'react';
import {
  Focus,
  Move,
  Rotate3d,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Compass,
  ChevronUp,
  ChevronDown,
  Eye,
} from 'lucide-react';
import { useEditorStore, CameraPreset } from '@/stores/editorStore';

interface TouchNavigationHUDProps {
  onZoomStep?: (delta: number) => void;
}

export default function TouchNavigationHUD({ onZoomStep }: TouchNavigationHUDProps) {
  const {
    touchGestureMode,
    setTouchGestureMode,
    triggerZoomToFit,
    setCameraPreset,
    cameraPreset,
  } = useEditorStore();

  const [expanded, setExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (onZoomStep) {
      onZoomStep(direction === 'in' ? -15 : 15);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        bottom: 24,
        zIndex: 35,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      {/* Expanded Orientation Dial (Mobile View Cube) */}
      {expanded && (
        <div
          className="animate-fade-in"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--color-border-mist)',
            borderRadius: 12,
            padding: 8,
            boxShadow: '0 8px 24px rgba(18, 53, 36, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 4,
            minWidth: 140,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottom: '1px solid var(--color-border-mist)' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', letterSpacing: 0.5 }}>
              3D View Presets
            </span>
            <Compass size={12} color="var(--color-forest-ink)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {([
              { id: 'anterior' as CameraPreset, label: 'Front (Ant)' },
              { id: 'posterior' as CameraPreset, label: 'Back (Post)' },
              { id: 'right' as CameraPreset, label: 'Right' },
              { id: 'left' as CameraPreset, label: 'Left' },
              { id: 'superior' as CameraPreset, label: 'Top (Sup)' },
              { id: 'inferior' as CameraPreset, label: 'Bottom (Inf)' },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  setCameraPreset(id);
                }}
                style={{
                  padding: '5px 4px',
                  fontSize: 10,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: cameraPreset === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                  backgroundColor: cameraPreset === id ? 'var(--color-keylime-wash)' : '#fff',
                  color: 'var(--color-forest-ink)',
                  fontWeight: cameraPreset === id ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCameraPreset('free')}
            style={{
              marginTop: 2,
              padding: '5px 0',
              fontSize: 10,
              borderRadius: 6,
              border: '1px solid var(--color-border-mist)',
              backgroundColor: '#fff',
              color: 'var(--color-forest-ink)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Isometric 3D View
          </button>
        </div>
      )}

      {/* Floating Glassmorphic Touch Action Dock */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--color-border-mist)',
          borderRadius: 30,
          padding: '4px 6px',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* 1-Finger Gesture Mode Toggle (Rotate vs Pan) */}
        <button
          onClick={() => setTouchGestureMode(touchGestureMode === 'rotate' ? 'pan' : 'rotate')}
          title={touchGestureMode === 'rotate' ? '1-Finger Mode: Orbit / Rotate (Tap to switch to Pan)' : '1-Finger Mode: Pan / Translate (Tap to switch to Orbit)'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 20,
            border: '1px solid',
            borderColor: touchGestureMode === 'pan' ? '#2563eb' : 'var(--color-forest-ink)',
            backgroundColor: touchGestureMode === 'pan' ? '#eff6ff' : 'var(--color-keylime-wash)',
            color: touchGestureMode === 'pan' ? '#1d4ed8' : 'var(--color-forest-ink)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 11,
            transition: 'all 150ms ease',
          }}
        >
          {touchGestureMode === 'rotate' ? (
            <>
              <Rotate3d size={14} />
              <span style={{ display: 'inline-block' }}>1-Touch: Orbit</span>
            </>
          ) : (
            <>
              <Move size={14} />
              <span style={{ display: 'inline-block' }}>1-Touch: Pan</span>
            </>
          )}
        </button>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border-mist)' }} />

        {/* 🎯 Focus / Center Model (Zoom to Fit) */}
        <button
          onClick={triggerZoomToFit}
          title="Focus & Frame Model in View (Zoom to Fit)"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--color-border-mist)',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-forest-ink)',
            cursor: 'pointer',
          }}
        >
          <Focus size={14} />
        </button>

        {/* ➕ Zoom In */}
        <button
          onClick={() => handleZoom('in')}
          title="Zoom In"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--color-border-mist)',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-forest-ink)',
            cursor: 'pointer',
          }}
        >
          <ZoomIn size={14} />
        </button>

        {/* ➖ Zoom Out */}
        <button
          onClick={() => handleZoom('out')}
          title="Zoom Out"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--color-border-mist)',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-forest-ink)',
            cursor: 'pointer',
          }}
        >
          <ZoomOut size={14} />
        </button>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border-mist)' }} />

        {/* 🧭 View Presets Toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          title="Toggle 3D View Presets"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: expanded ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
            backgroundColor: expanded ? 'var(--color-keylime-wash)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-forest-ink)',
            cursor: 'pointer',
          }}
        >
          <Compass size={14} />
        </button>

        {/* ⛶ Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--color-border-mist)',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-forest-ink)',
            cursor: 'pointer',
          }}
        >
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>
      </div>
    </div>
  );
}
