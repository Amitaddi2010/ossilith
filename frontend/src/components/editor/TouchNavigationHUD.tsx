'use client';

import React, { useState, useEffect } from 'react';
import {
  Focus,
  Move,
  Rotate3d,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Compass,
  ChevronRight,
  ChevronDown,
  X,
  Sliders,
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

  const [isOpen, setIsOpen] = useState(false);
  const [expandedPresets, setExpandedPresets] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync fullscreen state seamlessly with browser events (ESC key, F11, etc.)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

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
        top: 14,
        right: 14,
        zIndex: 50,
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
      {/* ── Collapsed Floating Trigger (Click to Open) ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Open 3D Navigation & Viewport Controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--color-border-mist)',
            borderRadius: 24,
            padding: '7px 14px',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
            color: 'var(--color-forest-ink)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(18, 53, 36, 0.16)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.94)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12)';
          }}
        >
          <Compass size={15} color="var(--color-forest-ink)" />
          <span>3D Controls</span>
          <ChevronDown size={13} style={{ opacity: 0.7 }} />
        </button>
      )}

      {/* ── Floating Expanded Glassmorphic Palette ── */}
      {isOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(14px)',
            border: '1px solid var(--color-border-mist)',
            borderRadius: 30,
            padding: '4px 8px',
            boxShadow: '0 8px 24px rgba(18, 53, 36, 0.14)',
            transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* 1-Finger Gesture Mode Toggle (Rotate vs Pan) */}
          <button
            onClick={() => setTouchGestureMode(touchGestureMode === 'rotate' ? 'pan' : 'rotate')}
            title={touchGestureMode === 'rotate' ? '1-Finger Mode: Orbit / Rotate (Click to switch to Pan)' : '1-Finger Mode: Pan / Translate (Click to switch to Orbit)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
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
                <span>1-Touch: Orbit</span>
              </>
            ) : (
              <>
                <Move size={14} />
                <span>1-Touch: Pan</span>
              </>
            )}
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'var(--color-border-mist)' }} />

          {/* 🎯 Focus / Center Model (Zoom to Fit) */}
          <button
            onClick={triggerZoomToFit}
            title="Focus & Frame Model in View (Zoom to Fit)"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid var(--color-border-mist)',
              backgroundColor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-ink)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-keylime-wash)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            <Focus size={14} />
          </button>

          {/* ➕ Zoom In */}
          <button
            onClick={() => handleZoom('in')}
            title="Zoom In"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid var(--color-border-mist)',
              backgroundColor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-ink)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-keylime-wash)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            <ZoomIn size={14} />
          </button>

          {/* ➖ Zoom Out */}
          <button
            onClick={() => handleZoom('out')}
            title="Zoom Out"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid var(--color-border-mist)',
              backgroundColor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-ink)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-keylime-wash)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            <ZoomOut size={14} />
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'var(--color-border-mist)' }} />

          {/* 🧭 View Presets Toggle */}
          <button
            onClick={() => setExpandedPresets(!expandedPresets)}
            title="Toggle 3D Orientation View Presets"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid',
              borderColor: expandedPresets ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
              backgroundColor: expandedPresets ? 'var(--color-keylime-wash)' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-ink)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <Compass size={14} />
          </button>

          {/* ⛶ Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid',
              borderColor: isFullscreen ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
              backgroundColor: isFullscreen ? 'var(--color-keylime-wash)' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-ink)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'var(--color-border-mist)' }} />

          {/* ✕ Close / Collapse Palette Button */}
          <button
            onClick={() => {
              setIsOpen(false);
              setExpandedPresets(false);
            }}
            title="Close / Minimize 3D Controls Palette"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = 'var(--color-forest-ink)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--color-muted)';
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 3D View Presets Popover Dropdown (Opens below the top bar) ── */}
      {isOpen && expandedPresets && (
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(14px)',
            border: '1px solid var(--color-border-mist)',
            borderRadius: 12,
            padding: 10,
            boxShadow: '0 10px 28px rgba(18, 53, 36, 0.16)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 160,
            marginTop: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 4,
              borderBottom: '1px solid var(--color-border-mist)',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--color-forest-ink)',
                letterSpacing: 0.5,
              }}
            >
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
                  padding: '6px 4px',
                  fontSize: 10.5,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: cameraPreset === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                  backgroundColor: cameraPreset === id ? 'var(--color-keylime-wash)' : '#fff',
                  color: 'var(--color-forest-ink)',
                  fontWeight: cameraPreset === id ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 120ms ease',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCameraPreset('free')}
            style={{
              marginTop: 3,
              padding: '6px 0',
              fontSize: 10.5,
              borderRadius: 6,
              border: '1px solid var(--color-border-mist)',
              backgroundColor: '#fff',
              color: 'var(--color-forest-ink)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-keylime-wash)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            Isometric 3D View
          </button>
        </div>
      )}
    </div>
  );
}
