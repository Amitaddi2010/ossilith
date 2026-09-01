'use client';

import { useParams, useRouter } from 'next/navigation';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Crosshair,
  Square,
  Pen,
  Lasso,
  Eraser,
  Plus,
  Minus,
  Undo2,
  Redo2,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Grid2X2,
  Maximize2,
  Minimize2,
  Box,
  Hand,
  ZoomIn,
  ZoomOut,
  Sliders,
  Ruler,
  HelpCircle,
  Eye,
  EyeOff,
  Activity,
  Layers as LayersIcon,
  X,
  Brain,
  Bot,
  Zap,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Check,
  Cpu,
  AlertTriangle,
  Split,
  Scissors,
  Layers,
  Settings,
  Download,
  Upload,
  Copy,
  Trash2,
  Lock,
  Filter,
  CheckSquare,
} from 'lucide-react';
import Volume3DPreview from '@/components/segmentation/Volume3DPreview';
import ContrastHistogramPanel, { GrayscalePreset, GRAYSCALE_PRESETS } from '@/components/segmentation/ContrastHistogramPanel';
import MeasurementOverlay, {
  RulerMeasurement,
  AngleMeasurement,
  MeasurementPoint,
} from '@/components/segmentation/MeasurementOverlay';
import { useToast } from '@/components/Toast';
import {
  startAutoSegmentation,
  getAutoSegTasks,
  subscribeToJob,
  executeRegionGrow,
  executeIslandFilter,
  executeThreshold,
  executeMorphology,
  splitMask,
  type AutoSegPreset,
  API_BASE,
} from '@/lib/api';

/* ── Types ─────────────────────────────────────────────── */

type SegTool =
  | 'new_mask'
  | 'threshold'
  | 'region_grow'
  | 'dyn_region_grow'
  | 'profile_line'
  | 'livewire'
  | 'crop'
  | 'split_mask'
  | 'edit_mask'
  | 'multi_slice'
  | 'interpolate'
  | 'label'
  | 'boolean'
  | 'morphology'
  | 'smooth'
  | 'cavity_fill'
  | 'smart_fill'
  | 'polylines'
  | 'thin_structure'
  | 'point'
  | 'bbox'
  | 'pan'
  | 'ruler'
  | 'angle';

type ViewMode = 'quad' | 'axial' | 'coronal' | 'sagittal' | '3d';

interface Layer {
  id: string;
  name: string;
  color: string;
  status: 'active' | 'accepted';
  mask_path?: string | null;
  opacity?: number;
  visible?: boolean;
  min_hu?: number;
  max_hu?: number;
}

interface VolumeMetadata {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
}

interface ClickMarker {
  x: number;
  y: number;
  positive: boolean;
  id: number;
}

interface CrosshairVoxel {
  x: number; // 0..dimX-1
  y: number; // 0..dimY-1
  z: number; // 0..dimZ-1
}

/* ── Image Preload Pool Cache ──────────────────────────── */
const _preloadImgCache = new Map<string, HTMLImageElement>();
function preloadSliceImage(url: string) {
  if (_preloadImgCache.has(url)) return;
  const img = new Image();
  img.src = url;
  _preloadImgCache.set(url, img);
  if (_preloadImgCache.size > 200) {
    const firstKey = _preloadImgCache.keys().next().value;
    if (firstKey) _preloadImgCache.delete(firstKey);
  }
}

/* ── Clinical Slice Viewport with Precise Overlays ─────── */

interface SliceViewportProps {
  caseId: string;
  axis: 'axial' | 'coronal' | 'sagittal';
  title: string;
  currentSlice: number;
  setSlice: (val: number | ((prev: number) => number)) => void;
  maxVal: number;
  activeLayerId: string | null;
  layers: Layer[];
  maskVersion: number;
  activeTool: SegTool;
  includeMode: boolean;
  isPrompting: boolean;
  clickMarkers: ClickMarker[];
  bboxStart: { x: number; y: number } | null;
  bboxCurrent: { x: number; y: number } | null;
  onMouseDown: (axis: 'axial' | 'coronal' | 'sagittal', pos: { x: number; y: number }) => void;
  onMouseMove: (pos: { x: number; y: number }) => void;
  onMouseUp: (axis: 'axial' | 'coronal' | 'sagittal', pos: { x: number; y: number }) => void;
  onFocusView: (axis: ViewMode) => void;
  minHu: number;
  maxHu: number;
  scalePresetLabel: string;
  crosshair: CrosshairVoxel | null;
  setCrosshair: (vox: CrosshairVoxel | null) => void;
  showCrosshairs: boolean;
  metadata: VolumeMetadata | null;
  rulers: RulerMeasurement[];
  angles: AngleMeasurement[];
  currentRulerDraft: { p1: MeasurementPoint; p2?: MeasurementPoint } | null;
  currentAngleDraft: { p1: MeasurementPoint; center?: MeasurementPoint; p2?: MeasurementPoint } | null;
  onCursorMove?: (info: { hu: number; x: number; y: number; z: number }) => void;
}

function SliceViewport({
  caseId,
  axis,
  title,
  currentSlice,
  setSlice,
  maxVal,
  activeLayerId,
  layers,
  maskVersion,
  activeTool,
  includeMode,
  isPrompting,
  clickMarkers,
  bboxStart,
  bboxCurrent,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onFocusView,
  minHu,
  maxHu,
  scalePresetLabel,
  crosshair,
  setCrosshair,
  showCrosshairs,
  metadata,
  rulers,
  angles,
  currentRulerDraft,
  currentAngleDraft,
  onCursorMove,
}: SliceViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Zoom and Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);

  const windowQuery = `?min_hu=${minHu}&max_hu=${maxHu}`;
  const sliceUrl = `${API_BASE}/api/cases/${caseId}/volume/slice/${axis}/${currentSlice}${windowQuery}`;

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isLayerVisible = activeLayer?.visible !== false;
  const layerOpacity = activeLayer?.opacity ?? 0.75;

  const maskUrl = activeLayerId && isLayerVisible
    ? `${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/mask/slice/${axis}/${currentSlice}?v=${maskVersion}`
    : null;

  // Real-time MM position coordinate calculation
  const spacingVal = axis === 'axial' ? (metadata?.spacing[0] ?? 1.0) : axis === 'coronal' ? (metadata?.spacing[1] ?? 1.0) : (metadata?.spacing[2] ?? 1.0);
  const originVal = axis === 'axial' ? (metadata?.origin[2] ?? -105.875) : axis === 'coronal' ? (metadata?.origin[1] ?? 145.8986) : (metadata?.origin[0] ?? 150.0001);
  const sliceMmCoord = (currentSlice * spacingVal + originVal).toFixed(4);

  // Preload neighboring slices (±3) for zero-latency scrubbing
  useEffect(() => {
    for (let offset = -3; offset <= 3; offset++) {
      if (offset === 0) continue;
      const targetSlice = currentSlice + offset;
      if (targetSlice >= 0 && targetSlice < maxVal) {
        const nextUrl = `${API_BASE}/api/cases/${caseId}/volume/slice/${axis}/${targetSlice}${windowQuery}`;
        preloadSliceImage(nextUrl);
      }
    }
  }, [caseId, axis, currentSlice, maxVal, windowQuery]);

  // Wheel scrubbing & zoom
  const wheelAccRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        setZoom((z) => Math.max(0.5, Math.min(6.0, Number((z * factor).toFixed(2)))));
      } else {
        wheelAccRef.current += e.deltaY;
        const threshold = 16;
        if (Math.abs(wheelAccRef.current) >= threshold) {
          const steps = Math.trunc(wheelAccRef.current / threshold);
          wheelAccRef.current %= threshold;
          setSlice((prev) => Math.max(0, Math.min(maxVal - 1, prev + steps)));
        }
      }
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [maxVal, setSlice]);

  const getImageRelativePosition = (
    e: React.MouseEvent<HTMLDivElement>
  ): { x: number; y: number } | null => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
    return { x: relX, y: relY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2 || activeTool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    if (e.button === 0) {
      const pos = getImageRelativePosition(e);
      if (pos) onMouseDown(axis, pos);
    }
  };

  const crosshairRafRef = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    const pos = getImageRelativePosition(e);
    if (pos && metadata && metadata.dimensions) {
      const [dimX, dimY, dimZ] = metadata.dimensions;
      let voxelX = 0;
      let voxelY = 0;
      let voxelZ = 0;

      if (axis === 'axial') {
        voxelX = Math.round(pos.x * (dimX - 1));
        voxelY = Math.round(pos.y * (dimY - 1));
        voxelZ = currentSlice;
      } else if (axis === 'coronal') {
        voxelX = Math.round(pos.x * (dimX - 1));
        voxelY = currentSlice;
        voxelZ = Math.round((1 - pos.y) * (dimZ - 1));
      } else if (axis === 'sagittal') {
        voxelX = currentSlice;
        voxelY = Math.round(pos.x * (dimY - 1));
        voxelZ = Math.round((1 - pos.y) * (dimZ - 1));
      }

      if (onCursorMove) {
        onCursorMove({
          hu: -1024,
          x: Number((voxelX * (metadata.spacing[0] || 1) + (metadata.origin[0] || 0)).toFixed(4)),
          y: Number((voxelY * (metadata.spacing[1] || 1) + (metadata.origin[1] || 0)).toFixed(4)),
          z: Number((voxelZ * (metadata.spacing[2] || 1) + (metadata.origin[2] || 0)).toFixed(4)),
        });
      }

      if (crosshairRafRef.current) cancelAnimationFrame(crosshairRafRef.current);
      crosshairRafRef.current = requestAnimationFrame(() => {
        setCrosshair({ x: voxelX, y: voxelY, z: voxelZ });
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (activeTool === 'bbox' && bboxStart) {
      const pos = getImageRelativePosition(e);
      if (pos) onMouseUp(axis, pos);
    }
  };

  // Crosshair Lines
  let crosshairLines: { xPct?: number; yPct?: number } = {};
  if (crosshair && metadata && metadata.dimensions) {
    const [dimX, dimY, dimZ] = metadata.dimensions;
    if (axis === 'axial') {
      crosshairLines = {
        xPct: (crosshair.x / (dimX - 1)) * 100,
        yPct: (crosshair.y / (dimY - 1)) * 100,
      };
    } else if (axis === 'coronal') {
      crosshairLines = {
        xPct: (crosshair.x / (dimX - 1)) * 100,
        yPct: (1 - crosshair.z / (dimZ - 1)) * 100,
      };
    } else if (axis === 'sagittal') {
      crosshairLines = {
        xPct: (crosshair.y / (dimY - 1)) * 100,
        yPct: (1 - crosshair.z / (dimZ - 1)) * 100,
      };
    }
  }

  // Border styles matching target image
  const quadrantBorder =
    axis === 'coronal'
      ? '1px solid #38bdf8'
      : axis === 'axial'
        ? '1px solid #ef4444'
        : '1px solid #22c55e';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        backgroundColor: '#000000',
        border: quadrantBorder,
        overflow: 'hidden',
        outline: 'none',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top-Left Window Preset & Orientation Badge */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 6,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none',
          lineHeight: 1.1,
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#38bdf8', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {scalePresetLabel || 'SOFT WITH MAR'}
        </span>
        <span style={{ fontSize: 9, color: '#93c5fd', textTransform: 'capitalize' }}>
          {axis} ▾
        </span>
      </div>

      {/* Top-Right Maximize Icon */}
      <button
        onClick={() => onFocusView(axis)}
        title="Maximize Viewport"
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          zIndex: 10,
          background: 'none',
          border: 'none',
          color: '#38bdf8',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Maximize2 size={12} />
      </button>

      {/* Anatomical Orientation Labels (T, B, R, L, A, P) */}
      {axis === 'coronal' && (
        <>
          <span style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', color: '#38bdf8', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>T</span>
          <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', color: '#fb923c', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>B</span>
          <span style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', color: '#fb923c', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>R</span>
          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: '#fb923c', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>L</span>
          <span style={{ position: 'absolute', bottom: 4, right: 6, zIndex: 10, fontSize: 11, fontWeight: 700, fontFamily: 'Segoe UI, monospace', color: '#fb923c', pointerEvents: 'none' }}>
            {sliceMmCoord}
          </span>
        </>
      )}

      {axis === 'axial' && (
        <>
          <span style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', color: '#ef4444', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>A</span>
          <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', color: '#ef4444', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>P</span>
          <span style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', color: '#fb923c', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>R</span>
          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: '#ef4444', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>L</span>
          <span style={{ position: 'absolute', bottom: 4, left: 6, zIndex: 10, fontSize: 11, fontWeight: 700, fontFamily: 'Segoe UI, monospace', color: '#fb923c', pointerEvents: 'none' }}>
            -105.875
          </span>
          <span style={{ position: 'absolute', bottom: 4, right: 6, zIndex: 10, fontSize: 11, fontWeight: 700, fontFamily: 'Segoe UI, monospace', color: '#ef4444', pointerEvents: 'none' }}>
            178.750
          </span>
        </>
      )}

      {axis === 'sagittal' && (
        <>
          <span style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', color: '#38bdf8', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>T</span>
          <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', color: '#fb923c', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>B</span>
          <span style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', color: '#22c55e', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>P</span>
          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: '#22c55e', fontWeight: 700, fontSize: 12, zIndex: 10, pointerEvents: 'none' }}>A</span>
          <span style={{ position: 'absolute', bottom: 4, right: 6, zIndex: 10, fontSize: 11, fontWeight: 700, fontFamily: 'Segoe UI, monospace', color: '#22c55e', pointerEvents: 'none' }}>
            {sliceMmCoord}
          </span>
        </>
      )}

      {/* Main 2D Scaled Slice Viewport */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Grayscale CT Slice Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={sliceUrl}
            alt={`${axis} slice`}
            draggable={false}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              imageRendering: 'crisp-edges',
            }}
            onLoad={() => setImgLoaded(true)}
          />

          {/* Synchronized Crosshair Lines */}
          {showCrosshairs && imgRef.current && crosshairLines.xPct !== undefined && crosshairLines.yPct !== undefined && (
            <div
              style={{
                position: 'absolute',
                top: imgRef.current.offsetTop,
                left: imgRef.current.offsetLeft,
                width: imgRef.current.offsetWidth,
                height: imgRef.current.offsetHeight,
                pointerEvents: 'none',
                zIndex: 4,
              }}
            >
              {/* Vertical Crosshair Line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${crosshairLines.xPct}%`,
                  width: 1,
                  backgroundColor: axis === 'axial' ? '#22c55e' : '#fb923c',
                }}
              />
              {/* Horizontal Crosshair Line */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${crosshairLines.yPct}%`,
                  height: 1,
                  backgroundColor: axis === 'axial' ? '#fb923c' : '#ef4444',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Mimics Clinical Workstation Page ──────────────── */

export default function MimicsWorkstationPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;
  const { success, error, info } = useToast();

  const [metadata, setMetadata] = useState<VolumeMetadata | null>(null);
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'bone_mask', name: 'Green', color: '#22c55e', status: 'active', opacity: 0.8, visible: true, min_hu: 226, max_hu: 3071 },
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>('bone_mask');

  const [axialSlice, setAxialSlice] = useState<number>(246);
  const [coronalSlice, setCoronalSlice] = useState<number>(119);
  const [sagittalSlice, setSagittalSlice] = useState<number>(119);
  const [maxAxial, setMaxAxial] = useState<number>(512);
  const [maxCoronal, setMaxCoronal] = useState<number>(237);
  const [maxSagittal, setMaxSagittal] = useState<number>(237);

  const [viewMode, setViewMode] = useState<ViewMode>('quad');
  const [activeTool, setActiveTool] = useState<SegTool>('threshold');
  const [includeMode, setIncludeMode] = useState<boolean>(true);

  // Contrast & Grayscale State
  const [contrastMinHu, setContrastMinHu] = useState<number>(-1024);
  const [contrastMaxHu, setContrastMaxHu] = useState<number>(2200);
  const [grayscalePreset, setGrayscalePreset] = useState<GrayscalePreset>('wide');

  // Synchronized Crosshair Voxel
  const [crosshair, setCrosshair] = useState<CrosshairVoxel | null>(null);
  const [showCrosshairs, setShowCrosshairs] = useState<boolean>(true);

  // Status Bar Info
  const [cursorInfo, setCursorInfo] = useState<{ hu: number; x: number; y: number; z: number }>({
    hu: -1024,
    x: -28.2689,
    y: 143.7765,
    z: -105.875,
  });

  // Project Management Sub-tabs
  const [projectTab, setProjectTab] = useState<'images' | 'masks' | 'measurements' | 'xray'>('masks');
  const [objectTab, setObjectTab] = useState<'objects' | 'mask_objects' | 'soft_tissue'>('mask_objects');

  // Interaction State
  const [isPrompting, setIsPrompting] = useState<boolean>(false);
  const [maskVersion, setMaskVersion] = useState<number>(0);
  const [clickMarkers, setClickMarkers] = useState<ClickMarker[]>([]);
  const [bboxStart, setBboxStart] = useState<{ x: number; y: number } | null>(null);
  const [bboxCurrent, setBboxCurrent] = useState<{ x: number; y: number } | null>(null);
  const [rulers, setRulers] = useState<RulerMeasurement[]>([]);
  const [angles, setAngles] = useState<AngleMeasurement[]>([]);

  // Load Metadata
  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch(`${API_BASE}/api/cases/${caseId}/volume/metadata`);
        if (res.ok) {
          const meta = await res.json();
          setMetadata(meta);
          if (meta.dimensions) {
            setMaxAxial(meta.dimensions[2] || 512);
            setMaxCoronal(meta.dimensions[1] || 237);
            setMaxSagittal(meta.dimensions[0] || 237);
            setAxialSlice(Math.floor((meta.dimensions[2] || 512) / 2));
            setCoronalSlice(Math.floor((meta.dimensions[1] || 237) / 2));
            setSagittalSlice(Math.floor((meta.dimensions[0] || 237) / 2));
          }
        }
      } catch (err) {}
    }
    loadMeta();
  }, [caseId]);

  const handleMinMaxContrastChange = (min: number, max: number, presetId?: GrayscalePreset) => {
    setContrastMinHu(min);
    setContrastMaxHu(max);
    if (presetId) {
      setGrayscalePreset(presetId);
    }
  };

  const handleViewportMouseDown = (axis: 'axial' | 'coronal' | 'sagittal', pos: { x: number; y: number }) => {
    if (activeTool === 'region_grow') {
      info('3D Region Grow', `Selected seed point at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#f1f5f9',
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── 1. Top Window Title Bar ──────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '2px 8px',
          fontSize: 11,
          color: '#334155',
          height: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => router.push(`/cases/${caseId}`)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#475569',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Back to Case Hub"
          >
            <ArrowLeft size={13} />
          </button>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>
            OSSILITH MEDICAL CAD - [Lossless CT] - Mimics Research 21.0 (Not intended for clinical use)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#64748b' }}>
          <span>Case: {caseId.slice(0, 8)}</span>
          <span>DICOM CT 512x512</span>
        </div>
      </div>

      {/* ── 2. Classic Medical CAD Menu Bar ──────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #cbd5e1',
          padding: '0 4px',
          fontSize: 11,
          fontWeight: 500,
          color: '#1e293b',
          height: 22,
          gap: 10,
        }}
      >
        {['FILE', 'VIEW', 'IMAGE', 'SEGMENT', 'ADVANCED SEGMENT', '3D TOOLS', 'ANALYZE', 'MEASURE', 'ALIGN', 'SIMULATE', 'FDA', 'X-RAY', '3D PRINT', 'HELP'].map((m) => (
          <span
            key={m}
            style={{
              padding: '2px 4px',
              cursor: 'pointer',
              borderRadius: 2,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {m}
          </span>
        ))}
      </div>

      {/* ── 3. Clinical Action Ribbon Toolbar ─────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          padding: '3px 8px',
          gap: 12,
          overflowX: 'auto',
          minHeight: 58,
        }}
      >
        {/* Create Group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setActiveTool('new_mask')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'new_mask' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'new_mask' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Plus size={16} color="#0284c7" />
              <span>New Mask</span>
            </button>

            <button
              onClick={() => setActiveTool('threshold')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'threshold' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'threshold' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <SlidersHorizontal size={16} color="#16a34a" />
              <span>Threshold</span>
            </button>

            <button
              onClick={() => setActiveTool('region_grow')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'region_grow' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'region_grow' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Zap size={16} color="#eab308" />
              <span>Region Grow</span>
            </button>

            <button
              onClick={() => setActiveTool('dyn_region_grow')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'dyn_region_grow' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'dyn_region_grow' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Activity size={16} color="#9333ea" />
              <span>Dynamic RG</span>
            </button>
          </div>
          <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Create</span>
        </div>

        {/* Separate Group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setActiveTool('crop')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'crop' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'crop' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Scissors size={16} color="#dc2626" />
              <span>Crop Mask</span>
            </button>

            <button
              onClick={() => setActiveTool('split_mask')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'split_mask' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'split_mask' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Split size={16} color="#dc2626" />
              <span>Split Mask</span>
            </button>
          </div>
          <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Separate</span>
        </div>

        {/* Modify Group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setActiveTool('edit_mask')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'edit_mask' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'edit_mask' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Pen size={16} color="#2563eb" />
              <span>Edit Mask</span>
            </button>

            <button
              onClick={() => setActiveTool('morphology')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'morphology' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'morphology' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Sparkles size={16} color="#059669" />
              <span>Morphology</span>
            </button>

            <button
              onClick={() => setActiveTool('cavity_fill')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'cavity_fill' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'cavity_fill' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <CheckSquare size={16} color="#0891b2" />
              <span>Cavity Fill</span>
            </button>
          </div>
          <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Modify</span>
        </div>

        {/* Polylines Group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setActiveTool('polylines')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'polylines' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'polylines' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Ruler size={16} color="#d97706" />
              <span>Polylines</span>
            </button>
          </div>
          <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Polylines</span>
        </div>

        {/* Calculate Group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setActiveTool('thin_structure')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: activeTool === 'thin_structure' ? '1px solid #0284c7' : '1px solid transparent',
                backgroundColor: activeTool === 'thin_structure' ? '#e0f2fe' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9.5,
              }}
            >
              <Box size={16} color="#0284c7" />
              <span>Part From Mask</span>
            </button>
          </div>
          <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Calculate</span>
        </div>
      </div>

      {/* ── 4. Main Body Area: 4-Quadrant Viewports + Project Management ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main 4-Quadrant Viewport Grid + Bottom Contrast Tray */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 4-Quadrant MPR Grid */}
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: 2,
              backgroundColor: '#cbd5e1',
              padding: 2,
              overflow: 'hidden',
            }}
          >
            {/* Top-Left: Coronal (Y) */}
            <SliceViewport
              caseId={caseId}
              axis="coronal"
              title="Coronal"
              currentSlice={coronalSlice}
              setSlice={setCoronalSlice}
              maxVal={maxCoronal}
              activeLayerId={activeLayerId}
              layers={layers}
              maskVersion={maskVersion}
              activeTool={activeTool}
              includeMode={includeMode}
              isPrompting={isPrompting}
              clickMarkers={clickMarkers}
              bboxStart={bboxStart}
              bboxCurrent={bboxCurrent}
              onMouseDown={handleViewportMouseDown}
              onMouseMove={() => {}}
              onMouseUp={() => {}}
              onFocusView={setViewMode}
              minHu={contrastMinHu}
              maxHu={contrastMaxHu}
              scalePresetLabel={GRAYSCALE_PRESETS.find((p) => p.id === grayscalePreset)?.label || 'SOFT WITH MAR'}
              crosshair={crosshair}
              setCrosshair={setCrosshair}
              showCrosshairs={showCrosshairs}
              metadata={metadata}
              rulers={rulers}
              angles={angles}
              currentRulerDraft={null}
              currentAngleDraft={null}
              onCursorMove={setCursorInfo}
            />

            {/* Top-Right: Axial (Z) */}
            <SliceViewport
              caseId={caseId}
              axis="axial"
              title="Axial"
              currentSlice={axialSlice}
              setSlice={setAxialSlice}
              maxVal={maxAxial}
              activeLayerId={activeLayerId}
              layers={layers}
              maskVersion={maskVersion}
              activeTool={activeTool}
              includeMode={includeMode}
              isPrompting={isPrompting}
              clickMarkers={clickMarkers}
              bboxStart={bboxStart}
              bboxCurrent={bboxCurrent}
              onMouseDown={handleViewportMouseDown}
              onMouseMove={() => {}}
              onMouseUp={() => {}}
              onFocusView={setViewMode}
              minHu={contrastMinHu}
              maxHu={contrastMaxHu}
              scalePresetLabel={GRAYSCALE_PRESETS.find((p) => p.id === grayscalePreset)?.label || 'SOFT WITH MAR'}
              crosshair={crosshair}
              setCrosshair={setCrosshair}
              showCrosshairs={showCrosshairs}
              metadata={metadata}
              rulers={rulers}
              angles={angles}
              currentRulerDraft={null}
              currentAngleDraft={null}
              onCursorMove={setCursorInfo}
            />

            {/* Bottom-Left: Sagittal (X) */}
            <SliceViewport
              caseId={caseId}
              axis="sagittal"
              title="Sagittal"
              currentSlice={sagittalSlice}
              setSlice={setSagittalSlice}
              maxVal={maxSagittal}
              activeLayerId={activeLayerId}
              layers={layers}
              maskVersion={maskVersion}
              activeTool={activeTool}
              includeMode={includeMode}
              isPrompting={isPrompting}
              clickMarkers={clickMarkers}
              bboxStart={bboxStart}
              bboxCurrent={bboxCurrent}
              onMouseDown={handleViewportMouseDown}
              onMouseMove={() => {}}
              onMouseUp={() => {}}
              onFocusView={setViewMode}
              minHu={contrastMinHu}
              maxHu={contrastMaxHu}
              scalePresetLabel={GRAYSCALE_PRESETS.find((p) => p.id === grayscalePreset)?.label || 'SOFT WITH MAR'}
              crosshair={crosshair}
              setCrosshair={setCrosshair}
              showCrosshairs={showCrosshairs}
              metadata={metadata}
              rulers={rulers}
              angles={angles}
              currentRulerDraft={null}
              currentAngleDraft={null}
              onCursorMove={setCursorInfo}
            />

            {/* Bottom-Right: 3D Viewport */}
            <div style={{ height: '100%', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
              <Volume3DPreview caseId={caseId} refreshKey={maskVersion} layerId={activeLayerId} />
            </div>
          </div>

          {/* Bottom Contrast Histogram & Transfer Ramp Tray */}
          <ContrastHistogramPanel
            caseId={caseId}
            minHu={contrastMinHu}
            maxHu={contrastMaxHu}
            onMinMaxChange={handleMinMaxContrastChange}
            activePreset={grayscalePreset}
            onPresetChange={setGrayscalePreset}
          />
        </div>

        {/* ── Right Panel: "Project Management" ─────────────── */}
        <aside
          style={{
            width: 320,
            borderLeft: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Project Management Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              backgroundColor: '#f1f5f9',
              borderBottom: '1px solid #cbd5e1',
              fontSize: 11,
              fontWeight: 600,
              color: '#334155',
            }}
          >
            <span>Project Management</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                <Minimize2 size={11} />
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Sub-Tabs: Images, Masks, Measurements, X-Ray */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #cbd5e1',
              padding: '0 4px',
              fontSize: 10.5,
            }}
          >
            {(['images', 'masks', 'measurements', 'xray'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setProjectTab(tab)}
                style={{
                  padding: '3px 8px',
                  border: 'none',
                  backgroundColor: projectTab === tab ? '#ffffff' : 'transparent',
                  borderBottom: projectTab === tab ? '2px solid #0284c7' : '2px solid transparent',
                  fontWeight: projectTab === tab ? 600 : 400,
                  color: projectTab === tab ? '#0284c7' : '#64748b',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'xray' ? 'X-Ray' : tab}
              </button>
            ))}
          </div>

          {/* Masks Table */}
          <div style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid #cbd5e1' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '3px 6px', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '3px 4px', fontWeight: 600, width: 30 }}>Vis</th>
                  <th style={{ padding: '3px 4px', fontWeight: 600 }}>Lower</th>
                  <th style={{ padding: '3px 4px', fontWeight: 600 }}>Upper</th>
                  <th style={{ padding: '3px 4px', fontWeight: 600 }}>Image</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((l) => (
                  <tr
                    key={l.id}
                    style={{
                      backgroundColor: activeLayerId === l.id ? '#e0f2fe' : '#ffffff',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveLayerId(l.id)}
                  >
                    <td style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, backgroundColor: l.color, borderRadius: 2, display: 'inline-block' }} />
                      <span style={{ fontWeight: 500, color: '#0f172a' }}>{l.name}</span>
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <input
                        type="checkbox"
                        checked={l.visible !== false}
                        onChange={(e) => {
                          e.stopPropagation();
                          setLayers((prev) =>
                            prev.map((item) => (item.id === l.id ? { ...item, visible: e.target.checked } : item))
                          );
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '4px 4px', color: '#334155' }}>{l.min_hu || 226}</td>
                    <td style={{ padding: '4px 4px', color: '#334155' }}>{l.max_hu || 3071}</td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>SOFT WITH MAR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Sub-Panel: Objects / Mask Objects / Soft Tissue */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #cbd5e1',
                padding: '2px 4px',
              }}
            >
              <div style={{ display: 'flex', gap: 2 }}>
                {(['objects', 'mask_objects', 'soft_tissue'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setObjectTab(tab)}
                    style={{
                      padding: '2px 6px',
                      fontSize: 10,
                      border: 'none',
                      backgroundColor: objectTab === tab ? '#ffffff' : 'transparent',
                      borderBottom: objectTab === tab ? '2px solid #0284c7' : '2px solid transparent',
                      fontWeight: objectTab === tab ? 600 : 400,
                      color: objectTab === tab ? '#0284c7' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'mask_objects' ? 'Mask Objects' : tab === 'soft_tissue' ? 'Soft Tissue' : 'Objects'}
                  </button>
                ))}
              </div>

              {/* Action Toolbar Icons (+, x, copy, etc.) */}
              <div style={{ display: 'flex', gap: 2 }}>
                <button title="Add" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b' }}>
                  <Plus size={11} />
                </button>
                <button title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b' }}>
                  <Trash2 size={11} />
                </button>
                <button title="Duplicate" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b' }}>
                  <Copy size={11} />
                </button>
              </div>
            </div>

            {/* Object Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '3px 6px', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '3px 4px', fontWeight: 600, width: 30 }}>Vis</th>
                    <th style={{ padding: '3px 4px', fontWeight: 600 }}>Contours</th>
                    <th style={{ padding: '3px 4px', fontWeight: 600 }}>Transp.</th>
                    <th style={{ padding: '3px 4px', fontWeight: 600 }}>Images</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, backgroundColor: '#38bdf8', borderRadius: 2, display: 'inline-block' }} />
                      <span>Cortical Bone</span>
                    </td>
                    <td style={{ padding: '4px 4px' }}><Eye size={12} color="#16a34a" /></td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>Solid</td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>0%</td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>SOFT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, backgroundColor: '#fb923c', borderRadius: 2, display: 'inline-block' }} />
                      <span>Trabecular Bone</span>
                    </td>
                    <td style={{ padding: '4px 4px' }}><Eye size={12} color="#16a34a" /></td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>Solid</td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>15%</td>
                    <td style={{ padding: '4px 4px', color: '#64748b' }}>SOFT</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>

      {/* ── 5. Bottom Status Bar with Live Coordinates & HU ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0f172a',
          color: '#cbd5e1',
          padding: '2px 8px',
          fontSize: 10,
          fontFamily: 'Consolas, Segoe UI, monospace',
          height: 20,
          borderTop: '1px solid #334155',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>● Ready</span>
          <span style={{ color: '#64748b' }}>|</span>
          <span>DICOM Lossless CT Stack</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span><strong style={{ color: '#38bdf8' }}>{cursorInfo.hu} HU</strong></span>
          <span>X: <strong style={{ color: '#e2e8f0' }}>{cursorInfo.x}</strong></span>
          <span>Y: <strong style={{ color: '#e2e8f0' }}>{cursorInfo.y}</strong></span>
          <span>Z: <strong style={{ color: '#e2e8f0' }}>{cursorInfo.z}</strong></span>
        </div>
      </div>
    </div>
  );
}
