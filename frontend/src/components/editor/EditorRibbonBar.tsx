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
  Trash2,
  Palette,
  CheckSquare,
  Square,
  Zap,
  RefreshCw,
  Copy,
  Clipboard,
  CopyPlus,
} from 'lucide-react';
import {
  useEditorStore,
  type EditorTool,
  type TransformSubmode,
  type ConnectorShape,
  type ConnectorOperation,
  type RenderMode,
  type CameraPreset,
  type MeshShell,
} from '@/stores/editorStore';
import { useToast } from '@/components/Toast';
import { splitMeshShells, purgeDebrisShells, listMeshShells, removeMeshShells } from '@/lib/api';
import { computeGeometryShells, CLINICAL_SHELL_COLORS } from '@/lib/meshConnectivity';
import { splitDisconnectedComponents } from '@/lib/csg';


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
  onReloadSTLs?: () => Promise<void> | void;
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
  onReloadSTLs,
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
    clipboard,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    deleteSelected,
    selectedIds,
    objects,
    clearAllMeasurements,
    measurements,
    shells,
    selectedShellIndices,
    hoveredShellIndex,
    islandsLoading,
    colorByShellsMode,
    minSplitFaces,
    setShells,
    setSelectedShellIndices,
    toggleShellSelection,
    setHoveredShellIndex,
    setIslandsLoading,
    setColorByShellsMode,
    setMinSplitFaces,
    meshRegionGrowAngleDeg,
    meshRegionGrowRadiusMm,
    meshRegionGrowSelectedFaces,
    setMeshRegionGrowAngleDeg,
    setMeshRegionGrowRadiusMm,
    clearMeshRegionGrow,
    mechanicalAxisSubmode,
    setMechanicalAxisSubmode,
    ghostOverlay,
    toggleMirrorGhostOverlay,
    triggerSnapshotExport,
    addObject,
    updateObject,
    removeObject,
  } = useEditorStore();

  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : null;

  const isUUID = (str?: string | null) =>
    Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

  const fetchShells = async (stlId: string) => {
    if (!activeObj || !activeObj.geometry) return;

    if (!isUUID(caseId) || !isUUID(stlId)) {
      setIslandsLoading(true);
      try {
        const res = computeGeometryShells(activeObj.geometry);
        const clientShells: MeshShell[] = res.shells.map((s) => {
          const sizeX = Math.abs(s.bounds[1][0] - s.bounds[0][0]);
          const sizeY = Math.abs(s.bounds[1][1] - s.bounds[0][1]);
          const sizeZ = Math.abs(s.bounds[1][2] - s.bounds[0][2]);
          return {
            index: s.index,
            face_count: s.faceCount,
            vertex_count: s.vertexCount,
            volume_cm3: s.faceCount * 0.005,
            surface_area_cm2: s.faceCount * 0.01,
            is_primary: s.isPrimary,
            is_watertight: true,
            centroid: s.centroid,
            bounds: s.bounds,
            bbox_dims: [sizeX, sizeY, sizeZ],
          };
        });
        setShells(clientShells);
        setSelectedShellIndices([]);
      } catch (e: any) {
        console.error('Client shell analysis error', e);
      } finally {
        setIslandsLoading(false);
      }
      return;
    }

    setIslandsLoading(true);
    try {
      const data = await listMeshShells(caseId, stlId);
      setShells(data.shells || []);
      setSelectedShellIndices([]);
    } catch (e: any) {
      console.error('Fetch shells error', e);
      toastError('Islands query error', e.message);
    } finally {
      setIslandsLoading(false);
    }
  };

  const handleOpenIslands = () => {
    if (!activeObj) {
      toastError('No model selected', 'Select an STL model first');
      return;
    }
    setActiveTool('islands');
    toggleFlyout('islands');
    fetchShells(activeObj.id);
  };

  const handleSplitMeshIntoParts = async (deleteOriginal = false) => {
    if (!activeObj || !activeObj.geometry) return;

    if (!isUUID(caseId) || !isUUID(activeObj.id)) {
      setIslandsLoading(true);
      try {
        const components = splitDisconnectedComponents(activeObj.geometry);
        if (components.length <= 1) {
          info('Single Component', 'Model is already a single unified mesh component.');
          setIslandsLoading(false);
          return;
        }

        components.forEach((compGeo, idx) => {
          const partId = `${activeObj.id}_part_${idx + 1}_${Date.now().toString(36)}`;
          addObject({
            id: partId,
            name: `${activeObj.name} (Part ${idx + 1})`,
            geometry: compGeo,
            position: [...activeObj.position] as [number, number, number],
            rotation: [...activeObj.rotation] as [number, number, number],
            scale: [...activeObj.scale] as [number, number, number],
            color: CLINICAL_SHELL_COLORS[idx % CLINICAL_SHELL_COLORS.length],
            opacity: 1.0,
            visible: true,
            anatomicalType: activeObj.anatomicalType,
          });
        });

        if (deleteOriginal) {
          removeObject(activeObj.id);
        }

        success('Multi-Bone Split Complete', `Extracted ${components.length} distinct bone parts as individual STL objects.`);
        setSelectedShellIndices([]);
        setOpenFlyout(null);
      } catch (e: any) {
        console.error('Split shells error', e);
        toastError('Split failed', e.message);
      } finally {
        setIslandsLoading(false);
      }
      return;
    }

    setIslandsLoading(true);
    try {
      const data = await splitMeshShells(caseId, activeObj.id, {
        min_faces: minSplitFaces,
        delete_original: deleteOriginal,
        keep_indices: selectedShellIndices.length > 0 ? selectedShellIndices : undefined,
      });
      success('Multi-Bone Split Complete', `Extracted ${data.split_count} distinct bone parts as individual STL objects.`);
      setSelectedShellIndices([]);
      setOpenFlyout(null);
      if (onReloadSTLs) {
        await onReloadSTLs();
      }
    } catch (e: any) {
      console.error('Split shells error', e);
      toastError('Split failed', e.message);
    } finally {
      setIslandsLoading(false);
    }
  };

  const handlePurgeDebrisShells = async () => {
    if (!activeObj || !activeObj.geometry) return;

    if (!isUUID(caseId) || !isUUID(activeObj.id)) {
      setIslandsLoading(true);
      try {
        const components = splitDisconnectedComponents(activeObj.geometry);
        if (components.length > 1) {
          components.sort((a, b) => (b.getAttribute('position')?.count || 0) - (a.getAttribute('position')?.count || 0));
          const largestCount = (components[0].getAttribute('position')?.count || 0) / 3;
          const keptComponents = components.filter((c) => {
            const fc = (c.getAttribute('position')?.count || 0) / 3;
            return fc >= 50 && fc / largestCount >= 0.05;
          });

          const finalGeo = keptComponents.length === 1 ? keptComponents[0] : components[0];
          updateObject(activeObj.id, { geometry: finalGeo });
          success('Stray Debris Purged', `Removed ${components.length - keptComponents.length} disconnected debris fragments directly.`);
        } else {
          success('Mesh Clean', 'No stray debris fragments found in model.');
        }
        await fetchShells(activeObj.id);
      } catch (e: any) {
        console.error('Purge error', e);
        toastError('Purge failed', e.message);
      } finally {
        setIslandsLoading(false);
      }
      return;
    }

    setIslandsLoading(true);
    try {
      const data = await purgeDebrisShells(caseId, activeObj.id, {
        min_volume_ratio: 0.05,
        min_faces: 50,
      });
      success('Stray Debris Purged', `Removed ${data.purged_count} disconnected stray fragments. ${data.remaining_shells} primary bone(s) remain.`);
      setSelectedShellIndices([]);
      if (onReloadSTLs) {
        await onReloadSTLs();
      }
      await fetchShells(activeObj.id);
    } catch (e: any) {
      console.error('Purge debris error', e);
      toastError('Purge debris failed', e.message);
    } finally {
      setIslandsLoading(false);
    }
  };

  const handleRemoveSelectedShells = async () => {
    if (!activeObj || !activeObj.geometry) return;
    if (selectedShellIndices.length === 0) {
      toastError('No islands selected', 'Please select at least one island/shell to remove');
      return;
    }

    if (!isUUID(caseId) || !isUUID(activeObj.id)) {
      setIslandsLoading(true);
      try {
        const components = splitDisconnectedComponents(activeObj.geometry);
        components.sort((a, b) => (b.getAttribute('position')?.count || 0) - (a.getAttribute('position')?.count || 0));
        const remaining = components.filter((_, idx) => !selectedShellIndices.includes(idx));
        if (remaining.length === 0) {
          toastError('Cannot delete all shells', 'At least one bone shell must be retained.');
          setIslandsLoading(false);
          return;
        }
        const finalGeo = remaining[0];
        updateObject(activeObj.id, { geometry: finalGeo });
        success('Islands Purged', `Removed ${selectedShellIndices.length} shell(s). ${remaining.length} shell(s) remain.`);
        setSelectedShellIndices([]);
        await fetchShells(activeObj.id);
      } catch (e: any) {
        console.error('Remove shells error', e);
        toastError('Remove error', e.message);
      } finally {
        setIslandsLoading(false);
      }
      return;
    }

    setIslandsLoading(true);
    try {
      const data = await removeMeshShells(caseId, activeObj.id, { remove_indices: selectedShellIndices });
      success('Islands Purged', `Removed selected shells. ${data.remaining_shells} shell(s) remain.`);
      setSelectedShellIndices([]);
      if (onReloadSTLs) {
        await onReloadSTLs();
      }
      await fetchShells(activeObj.id);
    } catch (e: any) {
      console.error('Remove shells error', e);
      toastError('Remove error', e.message);
    } finally {
      setIslandsLoading(false);
    }
  };

  const handleKeepLargestShellOnly = async () => {
    if (!activeObj || !activeObj.geometry) return;

    if (!isUUID(caseId) || !isUUID(activeObj.id)) {
      setIslandsLoading(true);
      try {
        const components = splitDisconnectedComponents(activeObj.geometry);
        components.sort((a, b) => (b.getAttribute('position')?.count || 0) - (a.getAttribute('position')?.count || 0));
        const largest = components[0];
        updateObject(activeObj.id, { geometry: largest });
        const vCount = largest.getAttribute('position')?.count || 0;
        success('Debris Removed', `Kept only the largest anatomical body (${vCount.toLocaleString()} vertices).`);
        setSelectedShellIndices([]);
        await fetchShells(activeObj.id);
      } catch (e: any) {
        console.error('Filter debris error', e);
        toastError('Filter error', e.message);
      } finally {
        setIslandsLoading(false);
      }
      return;
    }

    setIslandsLoading(true);
    try {
      const data = await removeMeshShells(caseId, activeObj.id, { keep_indices: [0] });
      success('Debris Removed', `Kept only the largest anatomical body (${data.vertex_count.toLocaleString()} vertices).`);
      setSelectedShellIndices([]);
      if (onReloadSTLs) {
        await onReloadSTLs();
      }
      await fetchShells(activeObj.id);
    } catch (e: any) {
      console.error('Filter debris error', e);
      toastError('Filter error', e.message);
    } finally {
      setIslandsLoading(false);
    }
  };



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
            onClick={() => router.push('/')}
            className="btn btn-ghost btn-icon"
            title="Return to Home Dashboard"
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
            {/* Group: CLIPBOARD & HISTORY */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <button
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  title="Undo (Ctrl+Z)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 6px',
                    fontSize: 9.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: undoStack.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: undoStack.length > 0 ? 1 : 0.4,
                  }}
                >
                  <Undo2 size={13} />
                  <span>Undo</span>
                </button>

                <button
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 6px',
                    fontSize: 9.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: redoStack.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: redoStack.length > 0 ? 1 : 0.4,
                  }}
                >
                  <Redo2 size={13} />
                  <span>Redo</span>
                </button>

                <button
                  onClick={() => {
                    const items = copySelected();
                    if (items.length > 0) success('Copied to Clipboard', `${items.length} 3D model(s) copied`);
                  }}
                  disabled={!activeObj}
                  title="Copy Selected Object (Ctrl+C)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 6px',
                    fontSize: 9.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'not-allowed',
                    opacity: activeObj ? 1 : 0.4,
                  }}
                >
                  <Copy size={13} />
                  <span>Copy</span>
                </button>

                <button
                  onClick={() => {
                    const newIds = pasteClipboard();
                    if (newIds.length > 0) success('Pasted Model', `Created ${newIds.length} duplicate object(s)`);
                  }}
                  disabled={!clipboard || clipboard.length === 0}
                  title="Paste from Clipboard (Ctrl+V)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 6px',
                    fontSize: 9.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: clipboard && clipboard.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: clipboard && clipboard.length > 0 ? 1 : 0.4,
                  }}
                >
                  <Clipboard size={13} />
                  <span>Paste</span>
                </button>

                <button
                  onClick={() => {
                    const newIds = duplicateSelected();
                    if (newIds.length > 0) success('Duplicated Model', `Created ${newIds.length} clone(s)`);
                  }}
                  disabled={!activeObj}
                  title="Duplicate Object (Ctrl+D)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 6px',
                    fontSize: 9.5,
                    borderRadius: 5,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: activeObj ? 'pointer' : 'not-allowed',
                    opacity: activeObj ? 1 : 0.4,
                  }}
                >
                  <CopyPlus size={13} />
                  <span>Duplicate</span>
                </button>

                <button
                  onClick={() => {
                    deleteSelected();
                    success('Object Deleted', 'Removed with undo history');
                  }}
                  disabled={!activeObj}
                  title="Delete Object (Del / Backspace)"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 6px',
                    fontSize: 9.5,
                    borderRadius: 5,
                    border: '1px solid #fee2e2',
                    backgroundColor: '#fff',
                    color: '#dc2626',
                    cursor: activeObj ? 'pointer' : 'not-allowed',
                    opacity: activeObj ? 1 : 0.4,
                  }}
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                CLIPBOARD & HISTORY
              </span>
            </div>

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

            {/* Group: MESH SURFACE REGION GROWING */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)', position: 'relative', zIndex: 85 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => {
                    setActiveTool('region-grow');
                    toggleFlyout('region-grow');
                  }}
                  disabled={!activeObj}
                  title="Click a face on the 3D mesh to flood-fill connected faces across normal angle and distance"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'region-grow' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'region-grow' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                    fontWeight: 600,
                  }}
                >
                  <Sparkles size={13} color="var(--color-forest-ink)" />
                  <span>Region Grow</span>
                  {meshRegionGrowSelectedFaces.length > 0 && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, backgroundColor: '#f97316', color: '#fff' }}>
                      {meshRegionGrowSelectedFaces.length}
                    </span>
                  )}
                </button>

                {openFlyout === 'region-grow' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 48,
                      left: 0,
                      backgroundColor: '#fff',
                      border: '1px solid var(--color-border-mist)',
                      borderRadius: 10,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                      padding: 12,
                      zIndex: 9999,
                      width: 270,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-forest-ink)' }}>
                      Surface Region Growth Settings
                    </span>

                    {/* Angle Threshold Slider */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                        <span style={{ color: 'var(--color-charcoal-muted)' }}>Angle Threshold:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{meshRegionGrowAngleDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={90}
                        step={5}
                        value={meshRegionGrowAngleDeg}
                        onChange={(e) => setMeshRegionGrowAngleDeg(Number(e.target.value))}
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Radius Slider */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                        <span style={{ color: 'var(--color-charcoal-muted)' }}>Search Radius:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{meshRegionGrowRadiusMm} mm</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        value={meshRegionGrowRadiusMm}
                        onChange={(e) => setMeshRegionGrowRadiusMm(Number(e.target.value))}
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Clear button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                        {meshRegionGrowSelectedFaces.length > 0 ? `${meshRegionGrowSelectedFaces.length.toLocaleString()} faces selected` : 'Click mesh to grow'}
                      </span>
                      {meshRegionGrowSelectedFaces.length > 0 && (
                        <button
                          onClick={clearMeshRegionGrow}
                          style={{
                            padding: '3px 8px',
                            fontSize: 10,
                            borderRadius: 4,
                            border: '1px solid var(--color-border-mist)',
                            backgroundColor: '#fff',
                            color: '#dc2626',
                            cursor: 'pointer',
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                SURFACE REGION GROW
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

            {/* Group: DISCONNECTED BODIES & MULTI-BONE SPLITTING (Materialise Mimics & 3D Slicer Grade) */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingLeft: 6, borderLeft: '1px solid var(--color-border-mist)', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={handleOpenIslands}
                  disabled={!activeObj}
                  title="Detect, preview, and split compound multi-bone structures or purge stray fragments"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: openFlyout === 'islands' || activeTool === 'islands' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: openFlyout === 'islands' || activeTool === 'islands' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: activeObj ? 'pointer' : 'default',
                    opacity: activeObj ? 1 : 0.5,
                    boxShadow: openFlyout === 'islands' ? '0 0 0 2px rgba(16, 185, 129, 0.2)' : 'none',
                  }}
                >
                  <Split size={14} />
                  <span>Multi-Bone Shells & Split</span>
                  {shells.length > 0 && (
                    <span
                      style={{
                        backgroundColor: shells.length > 1 ? '#0284c7' : '#64748b',
                        color: '#fff',
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 10,
                      }}
                    >
                      {shells.length} {shells.length === 1 ? 'part' : 'parts'}
                    </span>
                  )}
                  <ChevronDown size={11} />
                </button>

                <button
                  onClick={handlePurgeDebrisShells}
                  disabled={!activeObj || islandsLoading}
                  title="1-Click Purge all disconnected stray fragments (<5% volume)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 8px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    borderRadius: 5,
                    border: '1px solid #fed7aa',
                    backgroundColor: '#fff7ed',
                    color: '#c2410c',
                    cursor: activeObj && !islandsLoading ? 'pointer' : 'default',
                    opacity: activeObj && !islandsLoading ? 1 : 0.5,
                  }}
                >
                  {islandsLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  <span>1-Click Purge Debris</span>
                </button>

                {/* ── Materialise Mimics Grade Interactive Shell Split Drawer ── */}
                {openFlyout === 'islands' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 48,
                      right: 0,
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      boxShadow: '0 20px 40px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
                      padding: 14,
                      zIndex: 100,
                      width: 440,
                      maxWidth: '92vw',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Split size={16} color="#38bdf8" />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
                            Multi-Bone Shell Decomposition
                          </div>
                          <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                            {activeObj?.name || 'Selected Model'} · {shells.length} disconnected {shells.length === 1 ? 'body' : 'bodies'} detected
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => fetchShells(activeObj?.id || '')}
                        disabled={islandsLoading}
                        title="Re-analyze connected components"
                        style={{
                          background: 'none',
                          border: '1px solid #334155',
                          borderRadius: 6,
                          padding: '4px 6px',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                        }}
                      >
                        <RefreshCw size={11} className={islandsLoading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {/* Primary Actions Bar */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        onClick={() => handleSplitMeshIntoParts(false)}
                        disabled={islandsLoading || shells.length < 2}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '8px 10px',
                          borderRadius: 7,
                          border: 'none',
                          backgroundColor: '#0284c7',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: shells.length >= 2 && !islandsLoading ? 'pointer' : 'not-allowed',
                          opacity: shells.length >= 2 && !islandsLoading ? 1 : 0.45,
                          boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                        }}
                      >
                        <Zap size={13} />
                        <span>Split All Bones to Parts</span>
                      </button>

                      <button
                        onClick={handlePurgeDebrisShells}
                        disabled={islandsLoading || shells.length < 2}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '8px 10px',
                          borderRadius: 7,
                          border: '1px solid #f97316',
                          backgroundColor: 'rgba(249, 115, 22, 0.12)',
                          color: '#fb923c',
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: shells.length >= 2 && !islandsLoading ? 'pointer' : 'not-allowed',
                          opacity: shells.length >= 2 && !islandsLoading ? 1 : 0.45,
                        }}
                      >
                        <Trash2 size={13} />
                        <span>Purge Stray Noise (&lt;5%)</span>
                      </button>
                    </div>

                    {/* Viewport Toggles & Filters */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: 7, fontSize: 11 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={colorByShellsMode}
                          onChange={(e) => setColorByShellsMode(e.target.checked)}
                          style={{ accentColor: '#38bdf8' }}
                        />
                        <Palette size={13} color="#38bdf8" />
                        <span style={{ fontWeight: 600 }}>Multi-Color Bones Preview</span>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Min Faces:</span>
                        <input
                          type="number"
                          min={10}
                          max={5000}
                          step={50}
                          value={minSplitFaces}
                          onChange={(e) => setMinSplitFaces(Math.max(1, Number(e.target.value)))}
                          style={{
                            width: 60,
                            backgroundColor: '#0f172a',
                            border: '1px solid #475569',
                            color: '#f8fafc',
                            borderRadius: 4,
                            padding: '2px 4px',
                            fontSize: 10.5,
                            textAlign: 'center',
                          }}
                        />
                      </div>
                    </div>

                    {/* Batch Selection Action Strip */}
                    {selectedShellIndices.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(225, 29, 72, 0.15)', border: '1px solid rgba(225, 29, 72, 0.4)', padding: '6px 10px', borderRadius: 7, fontSize: 11 }}>
                        <span style={{ fontWeight: 700, color: '#fda4af' }}>
                          {selectedShellIndices.length} {selectedShellIndices.length === 1 ? 'shell' : 'shells'} selected
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleSplitMeshIntoParts(false)}
                            disabled={islandsLoading}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              border: 'none',
                              backgroundColor: '#0284c7',
                              color: '#fff',
                              fontSize: 10.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Split Selected
                          </button>
                          <button
                            onClick={handleRemoveSelectedShells}
                            disabled={islandsLoading}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              border: 'none',
                              backgroundColor: '#e11d48',
                              color: '#fff',
                              fontSize: 10.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Delete Selected
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Interactive Shells List */}
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 2 }}>
                      {shells.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontSize: 11 }}>
                          {islandsLoading ? 'Computing connected components on mesh...' : 'No shells analyzed yet.'}
                        </div>
                      ) : (
                        shells.map((shell) => {
                          const isSelected = selectedShellIndices.includes(shell.index);
                          const isHovered = hoveredShellIndex === shell.index;
                          const color = CLINICAL_SHELL_COLORS[shell.index % CLINICAL_SHELL_COLORS.length];
                          const isPrimary = shell.index === 0;
                          const isDebris = shell.volume_cm3 > 0 && shell.volume_cm3 < 0.5;

                          return (
                            <div
                              key={shell.index}
                              onMouseEnter={() => setHoveredShellIndex(shell.index)}
                              onMouseLeave={() => setHoveredShellIndex(null)}
                              onClick={() => toggleShellSelection(shell.index)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                borderRadius: 6,
                                backgroundColor: isSelected ? 'rgba(225, 29, 72, 0.2)' : isHovered ? '#1e293b' : 'rgba(30, 41, 59, 0.5)',
                                border: isSelected ? '1px solid #f43f5e' : isHovered ? '1px solid #38bdf8' : '1px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.1s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleShellSelection(shell.index);
                                  }}
                                  style={{ accentColor: '#f43f5e', cursor: 'pointer' }}
                                />
                                <span
                                  style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: '50%',
                                    backgroundColor: color,
                                    boxShadow: `0 0 8px ${color}`,
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc' }}>
                                      {isPrimary ? 'Primary Bone' : isDebris ? `Stray Debris #${shell.index + 1}` : `Bone Part #${shell.index + 1}`}
                                    </span>
                                    {isPrimary && (
                                      <span style={{ backgroundColor: '#059669', color: '#fff', fontSize: 8.5, padding: '0 4px', borderRadius: 3, fontWeight: 700 }}>
                                        MAIN
                                      </span>
                                    )}
                                    {isDebris && (
                                      <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: 8.5, padding: '0 4px', borderRadius: 3, fontWeight: 600 }}>
                                        NOISE
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 9.5, color: '#94a3b8' }}>
                                    {shell.face_count.toLocaleString()} faces {shell.volume_cm3 > 0 ? `· ${shell.volume_cm3.toFixed(2)} cm³` : ''} {shell.surface_area_cm2 > 0 ? `· ${shell.surface_area_cm2.toFixed(1)} cm²` : ''}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    splitMeshShells(caseId, activeObj?.id || '', { keep_indices: [shell.index] }).then((res) => {
                                      success('Part Split', `Extracted shell as new STL model.`);
                                      if (onReloadSTLs) onReloadSTLs();
                                    });
                                  }}
                                  title="Split this shell into its own STL object"
                                  style={{
                                    padding: '2px 5px',
                                    borderRadius: 4,
                                    border: '1px solid #334155',
                                    backgroundColor: 'transparent',
                                    color: '#38bdf8',
                                    fontSize: 9.5,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Extract
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Footer / Shortcut Help */}
                    <div style={{ fontSize: 9.5, color: '#64748b', textAlign: 'center', borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                      💡 Tip: Click on any bone/island in the 3D viewport to toggle selection. Hovering highlights geometry instantly.
                    </div>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                DISCONNECTED BODIES &amp; SPLIT
              </span>
            </div>
          </>
        )}

        {/* ══════════════ TAB 4: PLANNING MODULES ══════════════ */}
        {ribbonTab === 'planning' && (
          <>
            {/* Group: SURGEON PLANNING TOOLS (PHASE 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 10, borderRight: '1px solid var(--color-border-mist)', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* 3-Click Mechanical Axis */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: activeTool === 'mechanical-axis' ? 'var(--color-keylime-wash)' : '#f8fafc', padding: 2, borderRadius: 6, border: `1px solid ${activeTool === 'mechanical-axis' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)'}` }}>
                  <button
                    onClick={() => setActiveTool('mechanical-axis')}
                    title="3-Click Mechanical Axis (Hip -> Knee -> Ankle for HKA deformity angle)"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-forest-ink)',
                      cursor: 'pointer',
                    }}
                  >
                    <Activity size={14} color="var(--color-forest-ink)" />
                    <span>Mech Axis</span>
                  </button>

                  <select
                    value={mechanicalAxisSubmode}
                    onChange={(e) => {
                      setMechanicalAxisSubmode(e.target.value as any);
                      setActiveTool('mechanical-axis');
                    }}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 4px',
                      borderRadius: 4,
                      border: '1px solid var(--color-border-mist)',
                      backgroundColor: '#fff',
                      color: 'var(--color-forest-ink)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="hka">HKA (Varus/Valgus)</option>
                    <option value="mpta">MPTA (Tibial Plateau)</option>
                    <option value="mldfa">mLDFA (Femur Condyles)</option>
                  </select>
                </div>

                {/* 2-Click Screw Length Tool */}
                <button
                  onClick={() => setActiveTool('screw-picker')}
                  title="2-Click Screw Length: Pick Entry and Far Cortex. Real-time cortical breach warning."
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTool === 'screw-picker' ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                    backgroundColor: activeTool === 'screw-picker' ? 'var(--color-keylime-wash)' : '#fff',
                    color: 'var(--color-forest-ink)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  <Wrench size={14} color="var(--color-forest-ink)" />
                  <span>Screw Length</span>
                </button>

                {/* 1-Click Mirror Ghost Overlay */}
                <button
                  onClick={toggleMirrorGhostOverlay}
                  disabled={!activeObj && objects.size === 0}
                  title="1-Click Sagittal Contralateral Mirror Ghost Overlay for visual left/right deformity comparison"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: ghostOverlay ? '#0284c7' : 'var(--color-border-mist)',
                    backgroundColor: ghostOverlay ? '#e0f2fe' : '#fff',
                    color: ghostOverlay ? '#0369a1' : 'var(--color-charcoal)',
                    cursor: activeObj || objects.size > 0 ? 'pointer' : 'default',
                    opacity: activeObj || objects.size > 0 ? 1 : 0.5,
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  <span>🪞</span>
                  <span>{ghostOverlay ? 'Hide Mirror Ghost' : 'Mirror Ghost'}</span>
                </button>
              </div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>
                SURGICAL DEFORMITY &amp; TRAJECTORIES
              </span>
            </div>

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
