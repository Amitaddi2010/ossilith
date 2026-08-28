'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import {
  Home,
  Move,
  RotateCcw,
  Maximize2,
  Scissors,
  Split,
  Circle,
  Undo2,
  Redo2,
  Download,
  Eye,
  EyeOff,
  Sparkles,
  Plus,
  Loader2,
  Ruler,
  Activity,
  Box,
  Layers,
  Wrench,
  Camera,
  Scan,
  Grid3X3,
  Check,
  AlertTriangle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Triangle,
  Upload,
  Boxes,
  Magnet,
  Scale,
  Compass,
  Sliders,
  ChevronDown,
  Lock,
  Printer,
  RotateCw,
} from 'lucide-react';
import {
  useEditorStore,
  type EditorTool,
  type TransformSubmode,
  type ConnectorShape,
  type ConnectorOperation,
  type RenderMode,
  type CameraPreset,
} from '@/stores/editorStore';
import { useToast } from '@/components/Toast';

interface EditorRibbonBarProps {
  caseId: string;
  onOpenImplantLibrary: () => void;
  onImportSTL: () => void;
  onExportSTL: () => void;
  onOpenSendTo3DPrint: () => void;
  onSplitMesh: () => void;
  onExecutePlaneCut: () => void;
  onSmoothMesh: () => void;
  onRepairMesh: () => void;
  onDecimateMesh: () => void;
  onInvertNormals: () => void;
  onMirrorMesh: (axis: 'x' | 'y' | 'z') => void;
  onCenterPivot: () => void;
  onResetTransform: () => void;
  onApplyConnector: () => void;
  onRunNetfabb: () => void;
  onHealNetfabb: () => void;
  processingCSG?: boolean;
}

export default function EditorRibbonBar({
  caseId,
  onOpenImplantLibrary,
  onImportSTL,
  onExportSTL,
  onOpenSendTo3DPrint,
  onSplitMesh,
  onExecutePlaneCut,
  onSmoothMesh,
  onRepairMesh,
  onDecimateMesh,
  onInvertNormals,
  onMirrorMesh,
  onCenterPivot,
  onResetTransform,
  onApplyConnector,
  onRunNetfabb,
  onHealNetfabb,
  processingCSG = false,
}: EditorRibbonBarProps) {
  const router = useRouter();
  const { success, error: toastError, info } = useToast();

  const {
    ribbonTab,
    setRibbonTab,
    activeTool,
    setActiveTool,
    transformSubmode,
    setTransformSubmode,
    snappingEnabled,
    setSnappingEnabled,
    snapTranslation,
    setSnapTranslation,
    snapRotationDeg,
    setSnapRotationDeg,
    passthroughMode,
    setPassthroughMode,
    breachDetectionEnabled,
    setBreachDetectionEnabled,
    breachAlerts,
    tkrState,
    renderMode,
    setRenderMode,
    setCameraPreset,
    connectorShape,
    setConnectorShape,
    connectorOperation,
    setConnectorOperation,
    connectorRadiusMm,
    setConnectorRadiusMm,
    connectorPoints,
    clearConnectorPoints,
    undo,
    redo,
    undoStack,
    redoStack,
    selectedIds,
    objects,
    clearAllMeasurements,
    measurements,
  } = useEditorStore();

  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : null;

  // Close flyouts on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setOpenFlyout(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleFlyout = (id: string) => {
    setOpenFlyout(openFlyout === id ? null : id);
  };

  // 4 Streamlined Tabs (Snapping reclassified under Transform, Segmentation removed)
  const TABS = [
    { id: 'home', label: 'Home / View', icon: Home },
    { id: 'transform', label: 'Transform', icon: Sliders },
    { id: 'edit', label: 'Edit & Mesh', icon: Scissors },
    { id: 'planning', label: 'Planning Modules', icon: Activity },
  ] as const;

  return (
    <header
      ref={flyoutRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fff',
        borderBottom: '1px solid var(--color-border-mist)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
        zIndex: 30,
        userSelect: 'none',
      }}
    >
      {/* ── Top Ribbon Tab Header & Quick Access Toolbar ──── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 12px',
          borderBottom: '1px solid var(--color-border-mist)',
          backgroundColor: '#f8faf9',
          height: 38,
        }}
      >
        {/* Left: App Title & Quick Access (Undo/Redo/Save) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => router.push(caseId && caseId !== 'standalone' ? `/cases/${caseId}` : '/')}
            className="btn btn-ghost btn-icon"
            title="Return to Pipeline"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <Home size={14} color="var(--color-forest-ink)" />
          </button>

          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-forest-ink)',
              marginRight: 6,
            }}
          >
            Ossilith 3D
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              style={{
                background: 'none',
                border: 'none',
                cursor: undoStack.length > 0 ? 'pointer' : 'default',
                opacity: undoStack.length > 0 ? 1 : 0.35,
                padding: '4px 6px',
                borderRadius: 4,
              }}
            >
              <Undo2 size={13} color="var(--color-charcoal)" />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Shift+Z)"
              style={{
                background: 'none',
                border: 'none',
                cursor: redoStack.length > 0 ? 'pointer' : 'default',
                opacity: redoStack.length > 0 ? 1 : 0.35,
                padding: '4px 6px',
                borderRadius: 4,
              }}
            >
              <Redo2 size={13} color="var(--color-charcoal)" />
            </button>
          </div>

          <div style={{ width: 1, height: 16, backgroundColor: 'var(--color-border-mist)' }} />

          {/* Ribbon Tabs */}
          <nav style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
            {TABS.map(({ id, label, icon: TabIcon }) => {
              const isActive = ribbonTab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setRibbonTab(id);
                    if (id === 'transform') setActiveTool('transform');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 12px',
                    fontSize: 11.5,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--color-forest-ink)' : 'var(--color-charcoal-muted)',
                    backgroundColor: isActive ? '#fff' : 'transparent',
                    borderTop: isActive ? '2px solid var(--color-forest-ink)' : '2px solid transparent',
                    borderLeft: isActive ? '1px solid var(--color-border-mist)' : '1px solid transparent',
                    borderRight: isActive ? '1px solid var(--color-border-mist)' : '1px solid transparent',
                    borderBottom: isActive ? '1px solid #fff' : '1px solid transparent',
                    borderRadius: '4px 4px 0 0',
                    cursor: 'pointer',
                    transition: 'all 100ms ease',
                    marginBottom: -1,
                  }}
                >
                  <TabIcon size={12} color={isActive ? 'var(--color-forest-ink)' : 'var(--color-charcoal-muted)'} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: Hospital Badge, Send to 3D Print & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pill-badge-forest" style={{ fontSize: 9.5, padding: '2px 8px' }}>
            Hospital Isolated
          </span>

          <button
            onClick={onImportSTL}
            className="btn btn-ghost btn-sm"
            title="Import custom STL file"
            style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Upload size={12} />
            <span>Import</span>
          </button>

          <button
            onClick={onOpenSendTo3DPrint}
            className="btn btn-secondary btn-sm"
            title="Send to 3D Slicing software (Bambu Studio, FlashPrint, OrcaSlicer, Cura)"
            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Printer size={13} color="var(--color-forest-ink)" />
            <span>Send to 3D Print</span>
          </button>

          <button
            onClick={onExportSTL}
            disabled={!activeObj}
            className="btn btn-primary btn-sm"
            title="Export planned 3D STL file"
            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Download size={12} />
            <span>Export STL</span>
          </button>
        </div>
      </div>

      {/* ── Ribbon Toolbar Body with Group Dividers ───────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          padding: '6px 12px',
          backgroundColor: '#fff',
          minHeight: 74,
          overflow: 'visible',
          gap: 12,
        }}
      >

        {/* ══════════════ TAB 1: HOME / VIEW ══════════════ */}
        {ribbonTab === 'home' && (
          <>
            {/* Group: ORIENTATION */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {([
                  { id: 'anterior', label: 'Ant' },
                  { id: 'posterior', label: 'Post' },
                  { id: 'left', label: 'Left' },
                  { id: 'right', label: 'Right' },
                  { id: 'superior', label: 'Sup' },
                  { id: 'inferior', label: 'Inf' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setCameraPreset(id)}
                    title={`Align Camera to ${label}`}
                    style={{
                      padding: '4px 7px',
                      fontSize: 10.5,
                      fontFamily: 'var(--font-sans)',
                      borderRadius: 4,
                      border: '1px solid var(--color-border-mist)',
                      backgroundColor: '#f8faf9',
                      color: 'var(--color-charcoal)',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}

                <button
                  onClick={() => setCameraPreset('free')}
                  title="Reset to 3D Isometric View"
                  style={{
                    padding: '4px 7px',
                    fontSize: 10.5,
                    borderRadius: 4,
                    border: '1px solid var(--color-forest-ink)',
                    backgroundColor: 'var(--color-keylime-wash)',
                    color: 'var(--color-forest-ink)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Iso 3D
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                ORIENTATION
              </span>
            </div>

            {/* Group: SHADING & RENDER */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {([
                  { id: 'solid' as RenderMode, label: 'Solid', icon: Box },
                  { id: 'wireframe' as RenderMode, label: 'Wire', icon: Grid3X3 },
                  { id: 'xray' as RenderMode, label: 'X-Ray', icon: Scan },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setRenderMode(id)}
                    title={`Switch shading to ${label}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      padding: '4px 8px',
                      fontSize: 10,
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: renderMode === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                      backgroundColor: renderMode === id ? 'var(--color-keylime-wash)' : '#fff',
                      color: renderMode === id ? 'var(--color-forest-ink)' : 'var(--color-charcoal)',
                      fontWeight: renderMode === id ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                RENDER MODE
              </span>
            </div>

            {/* Group: INTERNAL INSPECTION (PASSTHROUGH) */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setPassthroughMode(!passthroughMode)}
                  title="Toggle see-through internal structure inspection"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: passthroughMode ? '#0284c7' : 'var(--color-border-mist)',
                    backgroundColor: passthroughMode ? '#e0f2fe' : '#fff',
                    color: passthroughMode ? '#0369a1' : 'var(--color-charcoal)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: 11,
                  }}
                >
                  <Scan size={15} color={passthroughMode ? '#0284c7' : 'var(--color-charcoal)'} />
                  <div style={{ textAlign: 'left' }}>
                    <div>Passthrough</div>
                    <div style={{ fontSize: 9, color: passthroughMode ? '#0284c7' : 'var(--color-muted)' }}>
                      {passthroughMode ? 'ACTIVE (See-through)' : 'OFF'}
                    </div>
                  </div>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                INSPECTION
              </span>
            </div>

            {/* Group: MEASUREMENT TOOLS */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setActiveTool('measure-distance')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '4px 8px',
                    fontSize: 10,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'measure-distance' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'measure-distance' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: 'pointer',
                  }}
                >
                  <Ruler size={14} />
                  <span>3D Ruler</span>
                </button>

                <button
                  onClick={() => setActiveTool('measure-angle')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '4px 8px',
                    fontSize: 10,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'measure-angle' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'measure-angle' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: 'pointer',
                  }}
                >
                  <Compass size={14} />
                  <span>3D Angle</span>
                </button>

                {measurements.length > 0 && (
                  <button
                    onClick={clearAllMeasurements}
                    title="Clear all 3D measurements"
                    style={{
                      padding: '4px 6px',
                      fontSize: 10,
                      borderRadius: 4,
                      border: '1px solid var(--color-border-mist)',
                      backgroundColor: '#fff',
                      color: 'var(--color-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear ({measurements.length})
                  </button>
                )}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                METRICS
              </span>
            </div>
          </>
        )}

        {/* ══════════════ TAB 2: TRANSFORM (WITH INTEGRATED SNAPPING) ══════════════ */}
        {ribbonTab === 'transform' && (
          <>
            {/* Group: UNIFIED TRANSFORM SUBMODES */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {([
                  { id: 'translate' as TransformSubmode, label: 'Translate', icon: Move, key: 'G' },
                  { id: 'rotate' as TransformSubmode, label: 'Rotate', icon: RotateCcw, key: 'R' },
                  { id: 'scaleUniform' as TransformSubmode, label: 'Uniform Scale', icon: Maximize2, key: 'S' },
                  { id: 'scaleNonUniform' as TransformSubmode, label: 'Non-Uniform', icon: Scale, key: 'Alt+S' },
                ] as const).map(({ id, label, icon: Icon, key }) => {
                  const isSubActive = activeTool === 'transform' && transformSubmode === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveTool('transform');
                        setTransformSubmode(id);
                      }}
                      title={`${label} Shortcut: ${key}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        padding: '4px 9px',
                        fontSize: 10,
                        borderRadius: 6,
                        border: '1px solid',
                        borderColor: isSubActive ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                        backgroundColor: isSubActive ? 'var(--color-forest-ink)' : '#fff',
                        color: isSubActive ? '#fff' : 'var(--color-charcoal)',
                        fontWeight: isSubActive ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={14} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                TRANSFORM MODES
              </span>
            </div>

            {/* Group: RECLASSIFIED SNAPPING SETTINGS */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setSnappingEnabled(!snappingEnabled)}
                  title="Toggle Snap-to-Grid & Angular Detents"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: snappingEnabled ? '#16a34a' : 'var(--color-border-mist)',
                    backgroundColor: snappingEnabled ? '#f0fdf4' : '#fff',
                    color: snappingEnabled ? '#15803d' : 'var(--color-charcoal)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 10.5,
                  }}
                >
                  <Magnet size={14} color={snappingEnabled ? '#16a34a' : 'var(--color-charcoal)'} />
                  <span>{snappingEnabled ? 'Snap: ON' : 'Snap: OFF'}</span>
                </button>

                {/* Linear Grid Step */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {[0.5, 1.0, 2.0, 5.0, 10.0].map((step) => (
                    <button
                      key={step}
                      onClick={() => {
                        setSnapTranslation(step);
                        setSnappingEnabled(true);
                      }}
                      title={`Linear Grid Snap: ${step}mm`}
                      style={{
                        padding: '3px 5px',
                        fontSize: 9.5,
                        fontFamily: 'var(--font-mono)',
                        borderRadius: 4,
                        border: '1px solid',
                        borderColor: snappingEnabled && snapTranslation === step ? '#16a34a' : 'var(--color-border-mist)',
                        backgroundColor: snappingEnabled && snapTranslation === step ? '#dcfce7' : '#fff',
                        color: snappingEnabled && snapTranslation === step ? '#15803d' : 'var(--color-charcoal)',
                        fontWeight: snappingEnabled && snapTranslation === step ? 700 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {step}mm
                    </button>
                  ))}
                </div>

                {/* Angular Detent */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {[5.0, 15.0, 45.0, 90.0].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => {
                        setSnapRotationDeg(deg);
                        setSnappingEnabled(true);
                      }}
                      title={`Rotational Detent: ${deg}°`}
                      style={{
                        padding: '3px 5px',
                        fontSize: 9.5,
                        fontFamily: 'var(--font-mono)',
                        borderRadius: 4,
                        border: '1px solid',
                        borderColor: snappingEnabled && snapRotationDeg === deg ? '#16a34a' : 'var(--color-border-mist)',
                        backgroundColor: snappingEnabled && snapRotationDeg === deg ? '#dcfce7' : '#fff',
                        color: snappingEnabled && snapRotationDeg === deg ? '#15803d' : 'var(--color-charcoal)',
                        fontWeight: snappingEnabled && snapRotationDeg === deg ? 700 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                SNAPPING & TOLERANCE
              </span>
            </div>

            {/* Group: RESET & REVERT OPTION */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={onResetTransform}
                  disabled={!activeObj}
                  title="Reset Position to (0,0,0), Rotation to (0,0,0) and Scale to (1,1,1)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: '#dc2626',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  <RotateCw size={13} color="#dc2626" />
                  <span>Reset Transform</span>
                </button>

                <button
                  onClick={onCenterPivot}
                  disabled={!activeObj}
                  title="Center model centroid to world origin"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-forest-ink)',
                    fontSize: 11,
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  <Box size={13} />
                  <span>Center Pivot</span>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                REVERT & ALIGNMENT
              </span>
            </div>
          </>
        )}

        {/* ══════════════ TAB 3: EDIT & MESH ══════════════ */}
        {ribbonTab === 'edit' && (
          <>
            {/* Group: OSTEOTOMY & SPLIT */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setActiveTool('split')}
                  disabled={!activeObj}
                  title="Separate disconnected shells with exact zero positional drift (Shortcut: X)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '4px 10px',
                    fontSize: 10,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'split' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'split' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  <Split size={14} />
                  <span>Split Mesh</span>
                </button>

                <button
                  onClick={() => setActiveTool('plane-cut')}
                  disabled={!activeObj}
                  title="Perform planar osteotomy cutting plane (Shortcut: C)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '4px 10px',
                    fontSize: 10,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'plane-cut' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'plane-cut' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  <Scissors size={14} />
                  <span>Plane Cut</span>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                OSTEOTOMY / SPLIT
              </span>
            </div>

            {/* Group: EXPANDED 2-POINT MULTI-SHAPE CONNECTORS */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)', position: 'relative', zIndex: 100 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => {
                    setActiveTool('connector');
                    setOpenFlyout(null);
                  }}
                  disabled={!activeObj}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'connector' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'connector' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                    fontWeight: 600,
                  }}
                >
                  <Circle size={13} color="var(--color-forest-ink)" />
                  <span>Add Connector</span>
                </button>

                <button
                  onClick={() => toggleFlyout('connector')}
                  title="Configure Connector Shape & Boolean Operation"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    fontSize: 10.5,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ textTransform: 'capitalize' }}>
                    {connectorShape} ({connectorOperation})
                  </span>
                  <ChevronDown size={11} />
                </button>

                {/* Execute Connector Button if points defined */}
                {connectorPoints.source && connectorPoints.target && (
                  <button
                    onClick={onApplyConnector}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 10.5, padding: '4px 8px' }}
                  >
                    Apply {connectorOperation}
                  </button>
                )}

                {openFlyout === 'connector' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 48,
                      left: 0,
                      backgroundColor: '#fff',
                      border: '1px solid var(--color-border-mist)',
                      borderRadius: 10,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                      padding: 14,
                      zIndex: 9999,
                      width: 280,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >

                    {/* Select Shape */}
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
                        1. SELECT CONNECTOR SHAPE
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                        {(['cylinder', 'cuboid', 'torus', 'sphere', 'cone'] as ConnectorShape[]).map((shape) => (
                          <button
                            key={shape}
                            onClick={() => setConnectorShape(shape)}
                            style={{
                              padding: '4px 0',
                              fontSize: 10,
                              textTransform: 'capitalize',
                              borderRadius: 4,
                              border: '1px solid',
                              borderColor: connectorShape === shape ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                              backgroundColor: connectorShape === shape ? 'var(--color-keylime-wash)' : '#fff',
                              color: 'var(--color-forest-ink)',
                              fontWeight: connectorShape === shape ? 700 : 400,
                              cursor: 'pointer',
                            }}
                          >
                            {shape}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Select Operation */}
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
                        2. BOOLEAN OPERATION
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                        {([
                          { id: 'join' as ConnectorOperation, label: 'Join' },
                          { id: 'subtract' as ConnectorOperation, label: 'Subtract' },
                          { id: 'intersection' as ConnectorOperation, label: 'Intersect' },
                        ] as const).map(({ id, label }) => (
                          <button
                            key={id}
                            onClick={() => setConnectorOperation(id)}
                            style={{
                              padding: '4px 0',
                              fontSize: 10,
                              borderRadius: 4,
                              border: '1px solid',
                              borderColor: connectorOperation === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                              backgroundColor: connectorOperation === id ? 'var(--color-forest-ink)' : '#fff',
                              color: connectorOperation === id ? '#fff' : 'var(--color-charcoal)',
                              fontWeight: connectorOperation === id ? 700 : 400,
                              cursor: 'pointer',
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Radius Slider */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                        <span style={{ color: 'var(--color-charcoal-muted)' }}>Radius / Size:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{connectorRadiusMm} mm</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={15}
                        step={0.5}
                        value={connectorRadiusMm}
                        onChange={(e) => setConnectorRadiusMm(Number(e.target.value))}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                2-POINT CONNECTORS
              </span>
            </div>

            {/* Group: TOPOLOGY OPERATIONS */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={onSmoothMesh}
                  disabled={!activeObj}
                  title="Laplacian surface smoothing"
                  style={{
                    padding: '4px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  Smooth
                </button>

                <button
                  onClick={onRepairMesh}
                  disabled={!activeObj}
                  title="Weld cracks & purge zero-area faces"
                  style={{
                    padding: '4px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  Weld & Repair
                </button>

                <button
                  onClick={onDecimateMesh}
                  disabled={!activeObj}
                  title="Simplify polygon count to 50K faces"
                  style={{
                    padding: '4px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  Decimate
                </button>

                <button
                  onClick={onInvertNormals}
                  disabled={!activeObj}
                  title="Invert surface normal orientation"
                  style={{
                    padding: '4px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  Invert Normals
                </button>

                <button
                  onClick={() => toggleFlyout('mirror')}
                  disabled={!activeObj}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '4px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                  }}
                >
                  <span>Mirror</span>
                  <ChevronDown size={10} />
                </button>

                {openFlyout === 'mirror' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 42,
                      left: 260,
                      backgroundColor: '#fff',
                      border: '1px solid var(--color-border-mist)',
                      borderRadius: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      padding: 6,
                      zIndex: 100,
                      width: 140,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <button
                      onClick={() => {
                        onMirrorMesh('x');
                        setOpenFlyout(null);
                      }}
                      style={{ padding: '4px 6px', fontSize: 11, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      Sagittal (X-Axis)
                    </button>
                    <button
                      onClick={() => {
                        onMirrorMesh('y');
                        setOpenFlyout(null);
                      }}
                      style={{ padding: '4px 6px', fontSize: 11, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      Coronal (Y-Axis)
                    </button>
                    <button
                      onClick={() => {
                        onMirrorMesh('z');
                        setOpenFlyout(null);
                      }}
                      style={{ padding: '4px 6px', fontSize: 11, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      Axial (Z-Axis)
                    </button>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                MESH TOPOLOGY
              </span>
            </div>
          </>
        )}

        {/* ══════════════ TAB 4: PLANNING MODULES ══════════════ */}
        {ribbonTab === 'planning' && (
          <>
            {/* Group: LOCKED TKR MODULE */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  disabled
                  title="Total Knee Replacement Module is locked in this build"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#f1f5f9',
                    color: 'var(--color-muted)',
                    cursor: 'not-allowed',
                    fontWeight: 500,
                    fontSize: 11,
                    opacity: 0.75,
                  }}
                >
                  <Lock size={14} color="var(--color-muted)" />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>TKR Arthroplasty</span>
                      <span className="pill-badge" style={{ fontSize: 8.5, padding: '1px 4px' }}>
                        Locked
                      </span>
                    </div>
                    <div style={{ fontSize: 8.5, color: 'var(--color-muted)' }}>
                      Total Knee Arthroplasty (v2.5)
                    </div>
                  </div>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                PROCEDURE MODULES
              </span>
            </div>

            {/* Group: CORTICAL BREACH DETECTION */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setBreachDetectionEnabled(!breachDetectionEnabled)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: breachDetectionEnabled
                      ? breachAlerts.length > 0
                        ? '#dc2626'
                        : '#22c55e'
                      : 'var(--color-border-mist)',
                    backgroundColor: breachDetectionEnabled
                      ? breachAlerts.length > 0
                        ? '#fef2f2'
                        : '#f0fdf4'
                      : '#fff',
                    color: breachDetectionEnabled
                      ? breachAlerts.length > 0
                        ? '#dc2626'
                        : '#15803d'
                      : 'var(--color-charcoal)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  <ShieldAlert
                    size={15}
                    color={
                      breachDetectionEnabled
                        ? breachAlerts.length > 0
                          ? '#dc2626'
                          : '#22c55e'
                        : 'var(--color-charcoal)'
                    }
                  />
                  <div>
                    <div>Breach Detector</div>
                    <div style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                      {breachDetectionEnabled
                        ? `${breachAlerts.length} breach(es) flagged`
                        : 'DISABLED'}
                    </div>
                  </div>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                SAFETY VERIFICATION
              </span>
            </div>

            {/* Group: IMPLANT HARDWARE */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={onOpenImplantLibrary}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  <Boxes size={15} color="var(--color-forest-ink)" />
                  <div>
                    <div>Implant Library</div>
                    <div style={{ fontSize: 9, color: 'var(--color-muted)' }}>Titanium Plates, Screws & Cages</div>
                  </div>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                HARDWARE CATALOG
              </span>
            </div>

            {/* Group: NETFABB QC */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={onRunNetfabb}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: 'pointer',
                  }}
                >
                  <ShieldCheck size={13} color="var(--color-forest-ink)" />
                  <span>ASTM F3001 Audit</span>
                </button>

                <button
                  onClick={onHealNetfabb}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 8px',
                    fontSize: 10.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: 'var(--color-keylime-wash)',
                    color: 'var(--color-forest-ink)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Sparkles size={13} />
                  <span>Auto-Heal</span>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                NETFABB PRINT QC
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
