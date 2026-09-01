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
} from 'lucide-react';
import Volume3DPreview from '@/components/segmentation/Volume3DPreview';
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

type SegTool = 'region_grow' | 'point' | 'island' | 'split_mask' | 'bbox' | 'pan' | 'scribble' | 'lasso' | 'eraser' | 'ruler' | 'angle';
type ViewMode = 'quad' | 'axial' | 'coronal' | 'sagittal' | '3d';
type WindowPreset = 'default' | 'bone' | 'soft_tissue' | 'lung' | 'custom';

interface Layer {
  id: string;
  name: string;
  color: string;
  status: 'active' | 'accepted';
  mask_path?: string | null;
  opacity?: number;
  visible?: boolean;
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

const TOOLS: { id: SegTool; label: string; icon: any; shortcut: string; badge?: string }[] = [
  { id: 'region_grow', label: '3D Region Grow (HU)', icon: Zap, shortcut: 'G', badge: 'Bone' },
  { id: 'point', label: 'Point Click (MITK)', icon: Crosshair, shortcut: 'P' },
  { id: 'island', label: 'Island Filter (Isolate)', icon: LayersIcon, shortcut: 'I' },
  { id: 'split_mask', label: 'Split Mask (Islands/Plane)', icon: Split, shortcut: 'X', badge: 'New' },
  { id: 'bbox', label: 'Bounding Box', icon: Square, shortcut: 'B' },
  { id: 'scribble', label: 'Scribble Brush', icon: Pen, shortcut: 'S' },
  { id: 'lasso', label: 'Lasso Polygon', icon: Lasso, shortcut: 'L' },
  { id: 'eraser', label: 'Eraser (Background)', icon: Eraser, shortcut: 'E' },
  { id: 'pan', label: 'Pan / Zoom', icon: Hand, shortcut: 'H' },
  { id: 'ruler', label: 'Calibrated Ruler', icon: Ruler, shortcut: 'M' },
  { id: 'angle', label: 'Cobb Angle', icon: Activity, shortcut: 'N' },
];


const WINDOW_PRESETS: { id: WindowPreset; label: string; ww: number | null; wl: number | null }[] = [
  { id: 'default', label: 'Auto CT', ww: null, wl: null },
  { id: 'bone', label: 'Bone (W2000/L400)', ww: 2000, wl: 400 },
  { id: 'soft_tissue', label: 'Soft Tissue (W400/L50)', ww: 400, wl: 50 },
  { id: 'lung', label: 'Lung (W1500/L-600)', ww: 1500, wl: -600 },
  { id: 'custom', label: 'Custom W/L', ww: 1000, wl: 200 },
];

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

/* ── Independent Slice Viewport with Crosshairs & Overlays ──── */

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
  ww: number | null;
  wl: number | null;
  crosshair: CrosshairVoxel | null;
  setCrosshair: (vox: CrosshairVoxel | null) => void;
  showCrosshairs: boolean;
  metadata: VolumeMetadata | null;
  rulers: RulerMeasurement[];
  angles: AngleMeasurement[];
  currentRulerDraft: { p1: MeasurementPoint; p2?: MeasurementPoint } | null;
  currentAngleDraft: { p1: MeasurementPoint; center?: MeasurementPoint; p2?: MeasurementPoint } | null;
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
  ww,
  wl,
  crosshair,
  setCrosshair,
  showCrosshairs,
  metadata,
  rulers,
  angles,
  currentRulerDraft,
  currentAngleDraft,
}: SliceViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Zoom and Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);

  // Windowing params
  const windowQuery = ww !== null && wl !== null ? `?ww=${ww}&wl=${wl}` : '';
  const sliceUrl = `${API_BASE}/api/cases/${caseId}/volume/slice/${axis}/${currentSlice}${windowQuery}`;
  
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isLayerVisible = activeLayer?.visible !== false;
  const layerOpacity = activeLayer?.opacity ?? 0.75;

  const maskUrl = activeLayerId && isLayerVisible
    ? `${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/mask/slice/${axis}/${currentSlice}?v=${maskVersion}`
    : null;

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

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(6.0, Number((z * 1.25).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, Number((z / 1.25).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Attach native non-passive wheel listener for responsive slice scrolling & zoom
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
        const threshold = 18;
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

  // Keyboard arrow slice stepping

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === ']' || e.key === 'w') {
      e.preventDefault();
      setSlice((prev) => Math.min(maxVal - 1, prev + 1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '[' || e.key === 's') {
      e.preventDefault();
      setSlice((prev) => Math.max(0, prev - 1));
    }
  };

  // Map mouse coordinate to normalized [0, 1] relative to the 1:1 image square
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
    if (pos) {
      if (activeTool === 'bbox' && bboxStart) {
        onMouseMove(pos);
      }

      // Throttled 3D crosshair update to prevent excessive page-level re-renders
      if (metadata && metadata.dimensions) {
        if (crosshairRafRef.current) cancelAnimationFrame(crosshairRafRef.current);
        crosshairRafRef.current = requestAnimationFrame(() => {
          const [dimX, dimY, dimZ] = metadata.dimensions;
          if (axis === 'axial') {
            setCrosshair({
              x: Math.round(pos.x * (dimX - 1)),
              y: Math.round(pos.y * (dimY - 1)),
              z: currentSlice,
            });
          } else if (axis === 'coronal') {
            setCrosshair({
              x: Math.round(pos.x * (dimX - 1)),
              y: currentSlice,
              z: Math.round((1 - pos.y) * (dimZ - 1)),
            });
          } else if (axis === 'sagittal') {
            setCrosshair({
              x: currentSlice,
              y: Math.round(pos.x * (dimY - 1)),
              z: Math.round((1 - pos.y) * (dimZ - 1)),
            });
          }
        });
      }
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

  // Determine crosshair lines on current plane
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

  const axisColors: Record<string, string> = {
    axial: '#1b3b1e',
    coronal: '#1e2e3b',
    sagittal: '#3b2e1b',
  };

  // Compute pixel spacing for ruler calibration
  const pixelSpacing: [number, number] = metadata
    ? axis === 'axial'
      ? [metadata.spacing[0], metadata.spacing[1]]
      : axis === 'coronal'
        ? [metadata.spacing[0], metadata.spacing[2]]
        : [metadata.spacing[1], metadata.spacing[2]]
    : [1.0, 1.0];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="seg-viewport-dark"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        outline: 'none',
      }}
    >
      {/* Viewport Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 10px',
          backgroundColor: '#111511',
          borderBottom: '1px solid rgba(177,219,184,0.08)',
          zIndex: 10,
        }}
      >
        {/* Left Title & Slice Index */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              backgroundColor: axisColors[axis] || '#1b3b1e',
              color: '#e1f4df',
              borderRadius: 'var(--radius-badges)',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 11, color: '#6b8b6e', fontFamily: 'var(--font-mono)' }}>
            Slice {currentSlice + 1}/{maxVal}
          </span>
        </div>

        {/* Right Zoom & View Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              background: 'none',
              border: 'none',
              color: '#6b8b6e',
              cursor: 'pointer',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <ZoomOut size={13} />
          </button>

          <button
            onClick={handleResetZoom}
            title="Reset Zoom (Fit to Screen)"
            style={{
              background: zoom !== 1.0 ? 'rgba(177,219,184,0.15)' : 'none',
              border: 'none',
              color: zoom !== 1.0 ? '#b1dbb8' : '#6b8b6e',
              cursor: 'pointer',
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              borderRadius: 3,
            }}
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              background: 'none',
              border: 'none',
              color: '#6b8b6e',
              cursor: 'pointer',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <ZoomIn size={13} />
          </button>

          <div style={{ width: 1, height: 12, backgroundColor: 'rgba(177,219,184,0.15)', margin: '0 3px' }} />

          <button
            onClick={() => onFocusView(axis)}
            title="Maximize Viewport"
            style={{
              background: 'none',
              border: 'none',
              color: '#6b8b6e',
              cursor: 'pointer',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e1f4df')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b8b6e')}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* 2D Image Viewport with interactive click, zoom, and pan */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleResetZoom}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          cursor:
            isPanning || activeTool === 'pan'
              ? 'grab'
              : activeTool === 'region_grow'
                ? 'cell'
                : activeTool === 'island'
                  ? 'pointer'
                  : activeTool === 'point'
                    ? 'crosshair'
                    : activeTool === 'bbox'
                      ? 'cell'
                      : activeTool === 'ruler' || activeTool === 'angle'
                        ? 'crosshair'
                        : activeTool === 'eraser'
                          ? 'not-allowed'
                          : 'crosshair',
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Shimmer skeleton while image loads */}
        {!imgLoaded && (
          <div
            className="skeleton-shimmer"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
            }}
          />
        )}

        {/* Scaled / Panned Image Layer */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 100ms ease-out',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Square Aspect Ratio Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* DICOM Slice Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={sliceUrl}
              alt={`${title} Slice ${currentSlice}`}
              draggable={false}
              onLoad={() => setImgLoaded(true)}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
                pointerEvents: 'none',
              }}
            />

            {/* Multi-Layer Mask Overlays for all visible anatomical structures */}
            {imgRef.current &&
              layers
                .filter((l) => l.visible !== false)
                .map((l) => {
                  const isSelected = l.id === activeLayerId;
                  const layerMaskUrl = `${API_BASE}/api/cases/${caseId}/layers/${l.id}/mask/slice/${axis}/${currentSlice}?v=${maskVersion}`;
                  const layerOpacity = l.opacity ?? (isSelected ? 0.85 : 0.65);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={l.id}
                      src={layerMaskUrl}
                      alt={`Mask ${l.name}`}
                      draggable={false}
                      style={{
                        position: 'absolute',
                        top: imgRef.current?.offsetTop ?? 0,
                        left: imgRef.current?.offsetLeft ?? 0,
                        width: imgRef.current?.offsetWidth ?? '100%',
                        height: imgRef.current?.offsetHeight ?? '100%',
                        objectFit: 'contain',
                        opacity: layerOpacity,
                        pointerEvents: 'none',
                        transition: 'opacity 150ms ease',
                        zIndex: isSelected ? 3 : 2,
                      }}

                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                      onLoad={(e) => {
                        (e.target as HTMLElement).style.display = 'block';
                      }}
                    />
                  );
                })}

            {/* Crosshair synchronized lines */}
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
                {/* Vertical Line */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${crosshairLines.xPct}%`,
                    width: 1,
                    backgroundColor: 'rgba(56, 189, 248, 0.4)',
                    boxShadow: '0 0 4px rgba(56, 189, 248, 0.8)',
                  }}
                />
                {/* Horizontal Line */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${crosshairLines.yPct}%`,
                    height: 1,
                    backgroundColor: 'rgba(56, 189, 248, 0.4)',
                    boxShadow: '0 0 4px rgba(56, 189, 248, 0.8)',
                  }}
                />
              </div>
            )}

            {/* Calibrated Measurement Overlay (Ruler & Cobb Angle) */}
            {imgRef.current && (
              <div
                style={{
                  position: 'absolute',
                  top: imgRef.current.offsetTop,
                  left: imgRef.current.offsetLeft,
                  width: imgRef.current.offsetWidth,
                  height: imgRef.current.offsetHeight,
                  pointerEvents: 'none',
                }}
              >
                <MeasurementOverlay
                  rulers={rulers}
                  angles={angles}
                  currentRulerDraft={currentRulerDraft}
                  currentAngleDraft={currentAngleDraft}
                  pixelSpacing={pixelSpacing}
                  imageWidth={imgRef.current.naturalWidth || 512}
                  imageHeight={imgRef.current.naturalHeight || 512}
                />
              </div>
            )}

            {/* Click Markers */}
            {imgRef.current &&
              clickMarkers.map((marker) => (
                <div
                  key={marker.id}
                  style={{
                    position: 'absolute',
                    left: `${imgRef.current!.offsetLeft + marker.x * imgRef.current!.offsetWidth}px`,
                    top: `${imgRef.current!.offsetTop + marker.y * imgRef.current!.offsetHeight}px`,
                    transform: 'translate(-50%, -50%)',
                    width: Math.max(6, Math.min(14, 10 / zoom)),
                    height: Math.max(6, Math.min(14, 10 / zoom)),
                    borderRadius: '50%',
                    backgroundColor: marker.positive ? '#00e575' : '#f87171',
                    border: `${Math.max(1, 2 / zoom)}px solid #fff`,
                    boxShadow: `0 0 ${8 / zoom}px ${marker.positive ? 'rgba(0,229,117,0.9)' : 'rgba(248,113,113,0.9)'}`,
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                />
              ))}

            {/* Bbox Drawing Overlay */}
            {bboxStart && bboxCurrent && imgRef.current && (
              <div
                style={{
                  position: 'absolute',
                  left: `${imgRef.current.offsetLeft + Math.min(bboxStart.x, bboxCurrent.x) * imgRef.current.offsetWidth}px`,
                  top: `${imgRef.current.offsetTop + Math.min(bboxStart.y, bboxCurrent.y) * imgRef.current.offsetHeight}px`,
                  width: `${Math.abs(bboxCurrent.x - bboxStart.x) * imgRef.current.offsetWidth}px`,
                  height: `${Math.abs(bboxCurrent.y - bboxStart.y) * imgRef.current.offsetHeight}px`,
                  border: `${Math.max(1, 2 / zoom)}px dashed ${includeMode ? '#00e575' : '#f87171'}`,
                  backgroundColor: includeMode ? 'rgba(0,229,117,0.2)' : 'rgba(248,113,113,0.2)',
                  pointerEvents: 'none',
                  zIndex: 5,
                  borderRadius: 2,
                }}
              />
            )}
          </div>
        </div>

        {/* Prompting indicator */}
        {isPrompting && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(15,62,23,0.9)',
              color: '#e1f4df',
              padding: '4px 14px',
              borderRadius: 'var(--radius-badges)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-sans)',
              backdropFilter: 'blur(4px)',
              zIndex: 10,
            }}
          >
            <Loader2 size={12} className="animate-spin" />
            <span>nnInteractive: computing 3D connected component...</span>
          </div>
        )}
      </div>

      {/* Slice Scrubber & Step Controls Footer */}
      <div
        style={{
          padding: '4px 10px',
          backgroundColor: '#111511',
          borderTop: '1px solid rgba(177,219,184,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <button
          onClick={() => setSlice((s) => Math.max(0, s - 1))}
          title="Previous Slice (Down / [ )"
          style={{
            background: 'none',
            border: 'none',
            color: '#6b8b6e',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ChevronLeft size={14} />
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, maxVal - 1)}
          value={currentSlice}
          onChange={(e) => setSlice(Number(e.target.value))}
          style={{ flex: 1, cursor: 'pointer' }}
        />

        <button
          onClick={() => setSlice((s) => Math.min(maxVal - 1, s + 1))}
          title="Next Slice (Up / ] )"
          style={{
            background: 'none',
            border: 'none',
            color: '#6b8b6e',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ChevronRight size={14} />
        </button>

        <span
          style={{
            fontSize: 10,
            color: '#6b8b6e',
            minWidth: 44,
            textAlign: 'right',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {currentSlice + 1}/{maxVal}
        </span>
      </div>
    </div>
  );
}

/* ── Interactive Segmentation Page ──────────────────────── */

export default function SegmentPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;
  const { success, error, info } = useToast();

  const [activeTool, setActiveTool] = useState<SegTool>('point');
  const [includeMode, setIncludeMode] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>('quad');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VolumeMetadata | null>(null);

  // Independent slice indices for each axis
  const [axialSlice, setAxialSlice] = useState<number>(0);
  const [coronalSlice, setCoronalSlice] = useState<number>(0);
  const [sagittalSlice, setSagittalSlice] = useState<number>(0);

  const [maxAxial, setMaxAxial] = useState<number>(100);
  const [maxCoronal, setMaxCoronal] = useState<number>(100);
  const [maxSagittal, setMaxSagittal] = useState<number>(100);

  // Windowing state
  const [windowPreset, setWindowPreset] = useState<WindowPreset>('bone');
  const [windowWidth, setWindowWidth] = useState<number | null>(2000);
  const [windowLevel, setWindowLevel] = useState<number | null>(400);

  // Synchronized Crosshair Voxel
  const [crosshair, setCrosshair] = useState<CrosshairVoxel | null>(null);
  const [showCrosshairs, setShowCrosshairs] = useState<boolean>(true);

  // Measurements
  const [rulers, setRulers] = useState<RulerMeasurement[]>([]);
  const [angles, setAngles] = useState<AngleMeasurement[]>([]);
  const [currentRulerDraft, setCurrentRulerDraft] = useState<{ p1: MeasurementPoint; p2?: MeasurementPoint } | null>(null);
  const [currentAngleDraft, setCurrentAngleDraft] = useState<{ p1: MeasurementPoint; center?: MeasurementPoint; p2?: MeasurementPoint } | null>(null);

  // Interaction state
  const [isPrompting, setIsPrompting] = useState<boolean>(false);
  const [maskVersion, setMaskVersion] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Bbox drawing state
  const [bboxStart, setBboxStart] = useState<{ x: number; y: number } | null>(null);
  const [bboxCurrent, setBboxCurrent] = useState<{ x: number; y: number } | null>(null);

  // Click markers
  const [clickMarkers, setClickMarkers] = useState<ClickMarker[]>([]);
  const markerIdRef = useRef(0);

  // Surgical Planning Tool States (Region Grow, Islands, Threshold, Morphology)
  const [rgMinHU, setRgMinHU] = useState<number>(200);
  const [rgMaxHU, setRgMaxHU] = useState<number>(3000);
  const [rgRadius, setRgRadius] = useState<number>(60);
  const [rgFillHoles, setRgFillHoles] = useState<boolean>(true);

  const [islandMinSize, setIslandMinSize] = useState<number>(500);

  // Shortcuts cheat sheet modal
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // TotalSegmentator / MONAI Auto-Segmentation state
  const [showAutoSegModal, setShowAutoSegModal] = useState<boolean>(false);
  const [selectedModelEngine, setSelectedModelEngine] = useState<'totalsegmentator' | 'monai'>('totalsegmentator');

  const [autoSegPresets, setAutoSegPresets] = useState<AutoSegPreset[]>([
    {
      id: 'only_bones',
      name: 'Only Bones (Complete Unified Skeleton)',
      description: 'Dedicated orthopedic bone extraction: merges all skeletal structures (skull, spine, ribs, pelvis, extremities) into a single contiguous, solid 3D bone target.',
      structures_count: 1,
      category: 'Orthopedic (Recommended)',
      recommended_for: 'Primary bone segmentation, 3D printing, osteotomy & implant planning',
      engine: 'TotalSegmentator / Intensity',
    },
    {
      id: 'bones',
      name: 'Skeletal Framework & Bones (Individual)',
      description: 'Discrete multi-structure segmentation of spine (C/T/L/S vertebrae), ribs, pelvis, femurs, tibias, and shoulder girdle as separate layers.',
      structures_count: 42,
      category: 'Orthopedic',
      recommended_for: 'Osteotomies, joint arthroplasty, and complex trauma reconstruction',
      engine: 'TotalSegmentator',
    },
    {
      id: 'appendicular_bones',
      name: 'Extremity & Appendicular Bones',
      description: 'Focused segmentation of upper and lower extremities (femur, tibia, fibula, patella, humerus, radius, ulna).',
      structures_count: 16,
      category: 'Orthopedic',
      recommended_for: 'Limb deformity correction & limb-sparing surgery',
      engine: 'TotalSegmentator',
    },
    {
      id: 'monai_wholebody',
      name: 'MONAI WholeBody CT Auto3DSeg',
      description: 'Deep learning segmentation powered by Project MONAI SwinUNETR / SegResNet whole-body CT architecture (trained on 100+ anatomical targets).',
      structures_count: 104,
      category: 'MONAI Deep Learning',
      recommended_for: 'Comprehensive multi-organ and skeletal contouring with MONAI',
      engine: 'MONAI 1.6',
    },
    {
      id: 'monai_vista3d',
      name: 'MONAI VISTA-3D Foundation Model',
      description: 'NVIDIA & MONAI 3D foundation model for zero-shot and interactive multi-class anatomy segmentation directly from CT voxels.',
      structures_count: 120,
      category: 'MONAI Deep Learning',
      recommended_for: 'Next-generation 3D foundation model anatomy mapping',
      engine: 'MONAI 1.6',
    },
    {
      id: 'total',
      name: 'All 117+ Anatomical Structures (Total)',
      description: 'Comprehensive full-body AI segmentation of all major organs, skeletal framework, vascular structures, and key muscles.',
      structures_count: 117,
      category: 'Comprehensive',
      recommended_for: 'Full CT scans & multi-system surgical planning',
      engine: 'TotalSegmentator',
    },
    {
      id: 'organs',
      name: 'Abdominal & Thoracic Viscera',
      description: 'Precision contours for liver, spleen, kidneys, pancreas, lungs, heart, stomach, gallbladder, and urinary bladder.',
      structures_count: 24,
      category: 'Visceral',
      recommended_for: 'General surgery, tumor resection margins & organ volumetry',
      engine: 'TotalSegmentator',
    },
    {
      id: 'tissue_types',
      name: 'Tissue Classes (Bone, Muscle, Fat, Air)',
      description: 'Automated multi-compartment body composition segmentation into cortical bone, cancellous bone, skeletal muscle, subcutaneous fat, and aerated parenchyma.',
      structures_count: 6,
      category: 'Tissue Analysis',
      recommended_for: 'Density profiling, bone mineral assessment & soft tissue margins',
      engine: 'TotalSegmentator / Intensity',
    },
    {
      id: 'lung_vessels',
      name: 'Pulmonary Vasculature & Airways',
      description: 'Segmentation of trachea, main bronchi, pulmonary artery, and lobar vascular trees.',
      structures_count: 8,
      category: 'Thoracic',
      recommended_for: 'Thoracic oncology & airway stent planning',
      engine: 'TotalSegmentator',
    },
    {
      id: 'body',
      name: 'Full Body Outer Contour',
      description: 'Segment complete patient external surface envelope for 3D body reference.',
      structures_count: 1,
      category: 'Surface',
      recommended_for: 'Reference alignment & patient positioning',
      engine: 'TotalSegmentator',
    },
  ]);
  const [selectedPreset, setSelectedPreset] = useState<string>('only_bones');

  const [autoSegFast, setAutoSegFast] = useState<boolean>(false);
  const [autoSegGenerateSTLs, setAutoSegGenerateSTLs] = useState<boolean>(false);
  const [isAutoSegmenting, setIsAutoSegmenting] = useState<boolean>(false);
  const [autoSegProgress, setAutoSegProgress] = useState<number>(0);
  const [autoSegMessage, setAutoSegMessage] = useState<string>('');
  const [layerSearchQuery, setLayerSearchQuery] = useState<string>('');

  // Accepting & STL generation state
  const [isGeneratingSTL, setIsGeneratingSTL] = useState<boolean>(false);
  const [stlProgress, setStlProgress] = useState<number>(0);
  const [stlMessage, setStlMessage] = useState<string>('');

  // Clinical Safety Simulation Mode Flag
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(true);

  // Split Mask State & Modal
  const [splitMaskModalOpen, setSplitMaskModalOpen] = useState<boolean>(false);
  const [splitMaskTargetLayerId, setSplitMaskTargetLayerId] = useState<string | null>(null);
  const [splitMaskMode, setSplitMaskMode] = useState<'islands' | 'plane'>('islands');
  const [splitMaskMinSize, setSplitMaskMinSize] = useState<number>(200);
  const [splitMaskMaxComponents, setSplitMaskMaxComponents] = useState<number>(8);
  const [splitMaskPlaneAxis, setSplitMaskPlaneAxis] = useState<'axial' | 'coronal' | 'sagittal'>('axial');
  const [splitMaskPlaneSlice, setSplitMaskPlaneSlice] = useState<number>(0);
  const [splitMaskDeleteOriginal, setSplitMaskDeleteOriginal] = useState<boolean>(false);
  const [splitMaskPrefix, setSplitMaskPrefix] = useState<string>('');
  const [isSplittingMask, setIsSplittingMask] = useState<boolean>(false);

  const layerCreatedRef = useRef(false);


  /* ── Load initial metadata & layers ──────────────────── */

  const fetchLayers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers`);
      if (res.ok) {
        const data = await res.json();
        const existingLayers = (data.layers || []).map((l: any) => ({
          ...l,
          opacity: l.opacity ?? 0.75,
          visible: l.visible ?? true,
        }));
        setLayers(existingLayers);
        if (existingLayers.length > 0) {
          setActiveLayerId((prev) => {
            const exists = existingLayers.some((el: any) => el.id === prev);
            if (exists) return prev;
            const withMask = existingLayers.find((el: any) => el.mask_path);
            return withMask ? withMask.id : existingLayers[0].id;
          });
        } else if (!layerCreatedRef.current) {
          layerCreatedRef.current = true;
          createDefaultLayer();
        }
      }
    } catch (e) {
      console.error('Failed to load layers', e);
    }
  }, [caseId]);


  const createDefaultLayer = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bone Target', color: '#00e575' }),
      });
      if (res.ok) {
        const layer = await res.json();
        setLayers([{ ...layer, opacity: 0.75, visible: true }]);
        setActiveLayerId(layer.id);
      }
    } catch (e) {
      console.error('Failed to create default layer', e);
    }
  };

  const [isVolumeLoading, setIsVolumeLoading] = useState<boolean>(true);
  const [volumeNotFound, setVolumeNotFound] = useState<boolean>(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let cancelled = false;
    let retries = 0;

    const fetchMetadata = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/cases/${caseId}/volume/metadata`);
        if (res.ok) {
          const data: VolumeMetadata = await res.json();
          if (data && data.dimensions && !cancelled) {
            setMetadata(data);
            setIsVolumeLoading(false);
            setVolumeNotFound(false);
            const [dimX, dimY, dimZ] = data.dimensions;
            setMaxSagittal(dimX || 100);
            setMaxCoronal(dimY || 100);
            setMaxAxial(dimZ || 100);

            setSagittalSlice((prev) => (prev > 0 ? prev : Math.floor((dimX || 100) / 2)));
            setCoronalSlice((prev) => (prev > 0 ? prev : Math.floor((dimY || 100) / 2)));
            setAxialSlice((prev) => (prev > 0 ? prev : Math.floor((dimZ || 100) / 2)));
            return;
          }
        } else if (res.status === 400 || res.status === 404) {
          retries++;
          if (retries >= 2) {
            if (!cancelled) {
              setIsVolumeLoading(false);
              setVolumeNotFound(true);
            }
            return;
          }
        }
      } catch (err) {
        retries++;
        if (retries >= 3) {
          if (!cancelled) {
            setIsVolumeLoading(false);
            setVolumeNotFound(true);
          }
          return;
        }
      }

      if (!cancelled && retries < 3) {
        timer = setTimeout(fetchMetadata, 1500);
      }
    };

    fetchMetadata();
    fetchLayers();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [caseId, fetchLayers]);

  /* ── Keyboard shortcuts ──────────────────────────────── */

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === '?') {
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      // Undo shortcut (Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndoPrompt();
        return;
      }

      // Redo shortcut (Ctrl+Y or Ctrl+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        handleRedoPrompt();
        return;
      }

      // Crosshairs toggle ('c')
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        setShowCrosshairs((prev) => !prev);
        return;
      }

      const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool) setActiveTool(tool.id);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeLayerId]);

  /* ── Windowing preset handler ────────────────────────── */

  const applyWindowPreset = (preset: WindowPreset) => {
    setWindowPreset(preset);
    const p = WINDOW_PRESETS.find((w) => w.id === preset);
    if (p) {
      setWindowWidth(p.ww);
      setWindowLevel(p.wl);
    }
  };

  /* ── Add new segmentation layer ───────────────────────── */

  const handleAddLayer = async () => {
    const defaultColors = ['#00e575', '#38bdf8', '#fbbf24', '#f87171', '#a855f7', '#34d399'];
    const nextColor = defaultColors[layers.length % defaultColors.length];
    const newName = `Structure ${layers.length + 1}`;

    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, color: nextColor }),
      });
      if (res.ok) {
        const newLayer = await res.json();
        setLayers((prev) => [...prev, { ...newLayer, opacity: 0.75, visible: true }]);
        setActiveLayerId(newLayer.id);
        success(`Created ${newName}`);
      }
    } catch (e) {
      error('Failed to add layer');
    }
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: l.visible === false ? true : false } : l))
    );
  };

  const handleUpdateLayerOpacity = (layerId: string, opacity: number) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, opacity } : l)));
  };

  /* ── Interactive AI Prompts ───────────────────────────── */

  const sendPrompt = async (
    axis: 'axial' | 'coronal' | 'sagittal',
    sliceIdx: number,
    promptType: 'point' | 'bbox' | 'scribble' | 'lasso',
    data: any
  ) => {
    if (!activeLayerId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsPrompting(true);

    try {
      const payload = {
        prompt_type: promptType,
        axis: axis,
        slice_index: sliceIdx,
        positive: includeMode,
        ...data,
      };

      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      if (res.ok) {
        const json = await res.json();
        setMaskVersion((v) => v + 1);
        if (json.voxel_count) {
          info('Segment updated', `${json.voxel_count.toLocaleString()} voxels connected`);
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Prompt submission failed', e);
      }
    } finally {
      setIsPrompting(false);
      setBboxStart(null);
      setBboxCurrent(null);
    }
  };

  /* ── Surgical Planning Prompt Handlers ───────────────── */

  const sendRegionGrowPrompt = async (
    axis: 'axial' | 'coronal' | 'sagittal',
    sliceIdx: number,
    pos: { x: number; y: number }
  ) => {
    if (!activeLayerId) return;
    setIsPrompting(true);
    try {
      const res = await executeRegionGrow(caseId, activeLayerId, {
        axis,
        slice_index: sliceIdx,
        point: [pos.x, pos.y],
        min_hu: rgMinHU,
        max_hu: rgMaxHU,
        search_radius_mm: rgRadius,
        fill_holes: rgFillHoles,
        positive: includeMode,
      });
      setMaskVersion((v) => v + 1);
      success('3D Region Grown', `${res.voxel_count.toLocaleString()} bone voxels segmented`);
    } catch (e: any) {
      error('Region Grow Failed', e.message);
    } finally {
      setIsPrompting(false);
    }
  };

  const handleKeepSelectedIsland = async (
    axis: 'axial' | 'coronal' | 'sagittal',
    sliceIdx: number,
    pos: { x: number; y: number }
  ) => {
    if (!activeLayerId) return;
    setIsPrompting(true);
    try {
      const res = await executeIslandFilter(caseId, activeLayerId, {
        operation: 'keep_selected',
        axis,
        slice_index: sliceIdx,
        point: [pos.x, pos.y],
      });
      setMaskVersion((v) => v + 1);
      success('Island Isolated', `Retained selected anatomical structure (${res.voxel_count?.toLocaleString()} voxels)`);
    } catch (e: any) {
      error('Island Filter Failed', e.message);
    } finally {
      setIsPrompting(false);
    }
  };

  const handleKeepLargestIsland = async () => {
    if (!activeLayerId) return;
    setIsPrompting(true);
    try {
      const res = await executeIslandFilter(caseId, activeLayerId, {
        operation: 'keep_largest',
      });
      setMaskVersion((v) => v + 1);
      success('Purged Floating Debris', `Kept largest body (${res.voxel_count?.toLocaleString()} voxels)`);
    } catch (e: any) {
      error('Island Filter Failed', e.message);
    } finally {
      setIsPrompting(false);
    }
  };

  const handleRemoveSmallIslands = async (minSize = 500) => {
    if (!activeLayerId) return;
    setIsPrompting(true);
    try {
      const res = await executeIslandFilter(caseId, activeLayerId, {
        operation: 'remove_small',
        min_size_voxels: minSize,
      });
      setMaskVersion((v) => v + 1);
      success('Filtered Small Fragments', `Removed components < ${minSize} voxels`);
    } catch (e: any) {
      error('Island Filter Failed', e.message);
    } finally {
      setIsPrompting(false);
    }
  };

  const openSplitMaskModal = (layerId?: string) => {
    const lid = layerId || activeLayerId;
    if (!lid) {
      error('No Layer Selected', 'Please select a segmentation layer to split');
      return;
    }
    setSplitMaskTargetLayerId(lid);
    const targetLayer = layers.find((l) => l.id === lid);
    setSplitMaskPrefix(targetLayer ? targetLayer.name : '');
    setSplitMaskPlaneSlice(axialSlice);
    setSplitMaskModalOpen(true);
  };

  const handleExecuteSplitMask = async () => {
    const targetId = splitMaskTargetLayerId || activeLayerId;
    if (!targetId) return;

    setIsSplittingMask(true);
    try {
      const res = await splitMask(caseId, targetId, {
        mode: splitMaskMode,
        min_size_voxels: splitMaskMinSize,
        max_components: splitMaskMaxComponents,
        axis: splitMaskPlaneAxis,
        slice_index: splitMaskPlaneSlice,
        delete_original: splitMaskDeleteOriginal,
        prefix: splitMaskPrefix.trim() || undefined,
      });

      await fetchLayers();
      setMaskVersion((v) => v + 1);
      if (res.created_layers && res.created_layers.length > 0) {
        setActiveLayerId(res.created_layers[0].id);
      }
      setSplitMaskModalOpen(false);
      success('Mask Split Complete', `Generated ${res.components_count} independent segmentation layers`);
    } catch (e: any) {
      error('Split Mask Failed', e.message || 'Failed to split segmentation mask');
    } finally {
      setIsSplittingMask(false);
    }
  };

  const handleSplitIslandsToLayers = async (minSize = 300) => {
    openSplitMaskModal();
  };

  const handleApplyBoneThreshold = async (minHU = 200, maxHU = 3000) => {
    if (!activeLayerId) return;
    setIsPrompting(true);
    try {
      const res = await executeThreshold(caseId, activeLayerId, {
        min_hu: minHU,
        max_hu: maxHU,
        fill_holes: true,
        mode: 'replace',
      });
      setMaskVersion((v) => v + 1);
      success('Bone Envelope Extracted', `${res.voxel_count?.toLocaleString()} voxels (≥${minHU} HU)`);
    } catch (e: any) {
      error('Threshold Extraction Failed', e.message);
    } finally {
      setIsPrompting(false);
    }
  };

  const handleApplyMorphology = async (op: 'smooth' | 'fill_holes' | 'dilate' | 'erode') => {
    if (!activeLayerId) return;
    setIsPrompting(true);
    try {
      const res = await executeMorphology(caseId, activeLayerId, {
        operation: op,
        radius: 1,
      });
      setMaskVersion((v) => v + 1);
      success(`Applied ${op.replace('_', ' ')}`, `${res.voxel_count?.toLocaleString()} voxels`);
    } catch (e: any) {
      error('Morphology Failed', e.message);
    } finally {
      setIsPrompting(false);
    }
  };

  /* ── Mouse Interaction Handlers for Viewport ─────────── */

  const handleViewportMouseDown = (
    axis: 'axial' | 'coronal' | 'sagittal',
    pos: { x: number; y: number }
  ) => {
    const currentSlice =
      axis === 'axial' ? axialSlice : axis === 'coronal' ? coronalSlice : sagittalSlice;

    if (activeTool === 'region_grow') {
      const mid = ++markerIdRef.current;
      setClickMarkers((prev) => [
        ...prev,
        { x: pos.x, y: pos.y, positive: includeMode, id: mid },
      ]);
      sendRegionGrowPrompt(axis, currentSlice, pos);
    } else if (activeTool === 'island') {
      handleKeepSelectedIsland(axis, currentSlice, pos);
    } else if (activeTool === 'point') {
      const mid = ++markerIdRef.current;
      setClickMarkers((prev) => [
        ...prev,
        { x: pos.x, y: pos.y, positive: includeMode, id: mid },
      ]);
      sendPrompt(axis, currentSlice, 'point', { point: [pos.x, pos.y] });
    } else if (activeTool === 'bbox') {
      setBboxStart(pos);
      setBboxCurrent(pos);
    } else if (activeTool === 'ruler') {
      if (!currentRulerDraft) {
        setCurrentRulerDraft({ p1: pos });
      } else {
        setRulers((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), p1: currentRulerDraft.p1, p2: pos },
        ]);
        setCurrentRulerDraft(null);
      }
    } else if (activeTool === 'angle') {
      if (!currentAngleDraft) {
        setCurrentAngleDraft({ p1: pos });
      } else if (!currentAngleDraft.center) {
        setCurrentAngleDraft({ p1: currentAngleDraft.p1, center: pos });
      } else {
        setAngles((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2),
            p1: currentAngleDraft.p1,
            center: currentAngleDraft.center!,
            p2: pos,
          },
        ]);
        setCurrentAngleDraft(null);
      }
    }
  };


  const handleViewportMouseMove = (pos: { x: number; y: number }) => {
    if (activeTool === 'bbox' && bboxStart) {
      setBboxCurrent(pos);
    }
    if (activeTool === 'ruler' && currentRulerDraft) {
      setCurrentRulerDraft({ ...currentRulerDraft, p2: pos });
    }
  };

  const handleViewportMouseUp = (
    axis: 'axial' | 'coronal' | 'sagittal',
    pos: { x: number; y: number }
  ) => {
    const currentSlice =
      axis === 'axial' ? axialSlice : axis === 'coronal' ? coronalSlice : sagittalSlice;

    if (activeTool === 'bbox' && bboxStart && bboxCurrent) {
      sendPrompt(axis, currentSlice, 'bbox', {
        bbox: [
          [bboxStart.x, bboxStart.y],
          [pos.x, pos.y],
        ],
      });
      setBboxStart(null);
      setBboxCurrent(null);
    }
  };

  /* ── Undo / Redo Prompts ─────────────────────────────── */

  const handleUndoPrompt = async () => {
    if (!activeLayerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/undo`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'undone') {
          setMaskVersion((v) => v + 1);
          setClickMarkers((prev) => prev.slice(0, -1));
          info('Undone prompt');
        } else {
          info('Nothing to undo');
        }
      }
    } catch (e) {
      console.error('Undo failed', e);
    }
  };

  const handleRedoPrompt = async () => {
    if (!activeLayerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/redo`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'redone') {
          setMaskVersion((v) => v + 1);
          info('Redone prompt');
        } else {
          info('Nothing to redo');
        }
      }
    } catch (e) {
      console.error('Redo failed', e);
    }
  };

  /* ── Reset Layer ─────────────────────────────────────── */

  const handleResetLayer = async () => {
    if (!activeLayerId) return;
    try {
      await fetch(`${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/reset`, {
        method: 'POST',
      });
      setMaskVersion((v) => v + 1);
      setClickMarkers([]);
      info('Layer reset');
    } catch (e) {
      error('Reset failed');
    }
  };

  /* ── Clear Measurements ───────────────────────────────── */
  const handleClearMeasurements = () => {
    setRulers([]);
    setAngles([]);
    setCurrentRulerDraft(null);
    setCurrentAngleDraft(null);
    info('Cleared measurements');
  };

  /* ── TotalSegmentator Auto-Segmentation Trigger ─────── */

  useEffect(() => {
    // Load dynamic tasks from backend if available
    getAutoSegTasks()
      .then((tasks) => {
        if (tasks && tasks.length > 0) {
          setAutoSegPresets(tasks);
        }
      })
      .catch(() => {});
  }, []);

  const handleStartAutoSeg = async () => {
    try {
      const engineName = selectedModelEngine === 'monai' ? 'MONAI' : 'TotalSegmentator';
      setIsAutoSegmenting(true);
      setAutoSegProgress(5);
      setAutoSegMessage(`Initializing ${engineName} inference pipeline...`);
      setShowAutoSegModal(false);

      const res = await startAutoSegmentation(caseId, {
        task: selectedPreset,
        model_engine: selectedModelEngine,
        fast: autoSegFast,
        generate_stls: autoSegGenerateSTLs,
      });

      info(`${engineName} Auto-Segmentation Started`, `Task: ${selectedPreset}`);

      subscribeToJob(
        res.job_id,
        (job) => {
          setAutoSegProgress(job.progress);
          setAutoSegMessage(job.message);

          if (job.status === 'completed') {
            setIsAutoSegmenting(false);
            fetchLayers();
            setMaskVersion((v) => v + 1);
            const count = job.result_data?.structures_count || 'multiple';
            success(
              `${engineName} Segmentation Complete`,
              `Extracted ${count} anatomical structures with clinical coordinate accuracy.`
            );
            if (autoSegGenerateSTLs) {
              setTimeout(() => {
                router.push(`/cases/${caseId}/editor`);
              }, 1200);
            }
          } else if (job.status === 'failed') {
            setIsAutoSegmenting(false);
            error('Auto-segmentation failed', job.message || `Error executing ${engineName}`);
          }
        },
        () => {
          // SSE connection drop callback
        }
      );
    } catch (err: any) {
      setIsAutoSegmenting(false);
      error('Failed to start auto-segmentation', err.message);
    }
  };


  /* ── Batch Accept All Layers & Generate STLs ──────────── */

  const handleAcceptAllLayers = async () => {
    if (layers.length === 0) return;
    setIsGeneratingSTL(true);
    setStlProgress(10);
    setStlMessage(`Queuing 3D STL generation for all ${layers.length} layers...`);

    try {
      // Accept each layer
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        setStlProgress(Math.round(15 + (i / layers.length) * 75));
        setStlMessage(`Processing ${layer.name} (${i + 1}/${layers.length})...`);
        try {
          await fetch(`${API_BASE}/api/cases/${caseId}/layers/${layer.id}/accept`, {
            method: 'POST',
          });
        } catch (e) {}
      }

      setStlProgress(100);
      setStlMessage('All STL meshes generated!');
      success('All Anatomical STLs Generated', 'Loading 3D Surgical CAD Workspace...');
      setTimeout(() => {
        router.push(`/cases/${caseId}/editor`);
      }, 800);
    } catch (err: any) {
      setIsGeneratingSTL(false);
      error('Batch STL generation error', err.message);
    }
  };

  /* ── Accept Single Layer & Auto-generate STL ───────────── */

  const handleAcceptLayer = async () => {
    if (!activeLayerId) return;
    setIsGeneratingSTL(true);
    setStlProgress(5);
    setStlMessage('Locking layer and queuing STL generation...');

    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/layers/${activeLayerId}/accept`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        const jobId = data.job_id;

        const eventSource = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);

        eventSource.onmessage = (event) => {
          try {
            const jobData = JSON.parse(event.data);
            setStlProgress(jobData.progress || 0);
            setStlMessage(jobData.message || 'Processing mesh...');

            if (jobData.status === 'completed') {
              eventSource.close();
              success('STL Generated Successfully!');
              setTimeout(() => {
                router.push(`/cases/${caseId}/editor`);
              }, 600);
            } else if (jobData.status === 'failed') {
              eventSource.close();
              setIsGeneratingSTL(false);
              error('STL generation failed', jobData.error || 'Unknown error');
            }
          } catch (e) {
            console.error('Error parsing SSE event', e);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
        };
      } else {
        setIsGeneratingSTL(false);
        error('Failed to accept layer');
      }
    } catch (e) {
      console.error('Accept layer failed', e);
      setIsGeneratingSTL(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--color-cream-paper)',
      }}
    >
      {/* ── Top Header ───────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          borderBottom: '1px solid var(--color-border-mist)',
          backgroundColor: '#fff',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push(`/cases/${caseId}/import`)}
            className="btn btn-ghost btn-icon"
            style={{ width: 32, height: 32 }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 400,
                color: 'var(--color-forest-ink)',
                margin: 0,
                fontFamily: 'var(--font-serif)',
              }}
            >
              AI Segmentation & Multi-Planar Reconstruction
            </h2>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-charcoal-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Stage 3 of 5 — nnInteractive 3D Engine & Calibrated MPR Viewports
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Shortcuts Help Button */}
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, gap: 4 }}
          >
            <HelpCircle size={14} /> Shortcuts (?)
          </button>

          {/* View layout switcher */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--color-surface-sunken)',
              padding: 2,
              borderRadius: 'var(--radius-nav)',
              border: '1px solid var(--color-border-mist)',
              gap: 1,
            }}
          >
            {([
              { mode: 'quad' as ViewMode, label: '2×2', icon: Grid2X2 },
              { mode: 'axial' as ViewMode, label: 'Axial', icon: undefined },
              { mode: 'coronal' as ViewMode, label: 'Coronal', icon: undefined },
              { mode: 'sagittal' as ViewMode, label: 'Sagittal', icon: undefined },
              { mode: '3d' as ViewMode, label: '3D', icon: Box },
            ] as { mode: ViewMode; label: string; icon?: any }[]).map(({ mode, label, icon: Icon }) => {
              const isActive = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: isActive ? 600 : 400,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    border: 'none',
                    borderRadius: 5,
                    backgroundColor: isActive ? 'var(--color-forest-ink)' : 'transparent',
                    color: isActive ? 'var(--color-cream-paper)' : 'var(--color-forest-ink)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {Icon && <Icon size={12} />}
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border-mist)', margin: '0 2px' }} />

          {/* ✨ TotalSegmentator Auto-Segmentation Action Button */}
          <button
            onClick={() => setShowAutoSegModal(true)}
            disabled={isAutoSegmenting || isVolumeLoading}
            className="btn"
            style={{
              backgroundColor: '#ecfdf5',
              border: '1px solid #10b981',
              color: '#065f46',
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              gap: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 1px 3px rgba(16,185,129,0.15)',
              transition: 'all 150ms ease',
              cursor: isAutoSegmenting || isVolumeLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isAutoSegmenting ? (
              <>
                <Loader2 size={13} className="animate-spin" color="#10b981" />
                <span>Auto-Segmenting ({autoSegProgress}%)</span>
              </>
            ) : (
              <>
                <Sparkles size={13} color="#10b981" />
                <span>Auto-Segment (AI)</span>
                <span
                  style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 10,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  Bones & Total
                </span>
              </>
            )}
          </button>


          {/* Accept / Generate STL Button */}
          {layers.length > 1 ? (
            <button
              onClick={handleAcceptAllLayers}
              disabled={isGeneratingSTL || layers.length === 0}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: 12, gap: 6 }}
            >
              {isGeneratingSTL ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>{stlMessage || 'Processing...'}</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Generate All STLs ({layers.length})</span>
                  <ChevronRight size={13} />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleAcceptLayer}
              disabled={isGeneratingSTL || !activeLayerId}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: 12, gap: 6 }}
            >
              {isGeneratingSTL ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>{stlMessage || 'Processing...'}</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Generate 3D STL</span>
                  <ChevronRight size={13} />
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* ── Clinical Safety Simulation Fallback Warning Banner ── */}
      {isSimulatedMode && (
        <div
          style={{
            backgroundColor: '#7f1d1d',
            color: '#fef2f2',
            padding: '7px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            borderBottom: '1px solid #dc2626',
            boxShadow: '0 2px 8px rgba(220,38,38,0.25)',
            zIndex: 15,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={15} color="#fca5a5" />
            <span style={{ fontWeight: 700, letterSpacing: '0.03em' }}>
              CLINICAL WARNING: SIMULATION / HEURISTIC FALLBACK MODE ACTIVE
            </span>
            <span style={{ color: '#fecaca', fontSize: 11.5 }}>
              nnInteractive / TotalSegmentator neural inference server is offline. Segmentation & auto-seg are executing via heuristic intensity approximations. Always verify anatomical boundaries.
            </span>
          </div>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>
            SIMULATED FALLBACK
          </span>
        </div>
      )}

      {/* ── Auto-Segmentation Real-time Floating HUD Banner ── */}

      {isAutoSegmenting && (
        <div
          style={{
            backgroundColor: '#064e3b',
            color: '#ecfdf5',
            padding: '7px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            borderBottom: '1px solid rgba(16,185,129,0.3)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Loader2 size={14} className="animate-spin" color="#34d399" />
            <span style={{ fontWeight: 600 }}>TotalSegmentator Pipeline Active:</span>
            <span style={{ color: '#a7f3d0' }}>{autoSegMessage || 'Segmenting anatomical structures...'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 140, height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${autoSegProgress}%`,
                  backgroundColor: '#34d399',
                  borderRadius: 3,
                  transition: 'width 250ms ease-out',
                }}
              />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, minWidth: 32 }}>
              {autoSegProgress}%
            </span>
          </div>
        </div>
      )}

      {/* ── Main View Area ───────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Toolbar */}
        <aside
          className="animate-slide-in-left"
          style={{
            width: 230,
            borderRight: '1px solid var(--color-border-mist)',
            backgroundColor: 'var(--color-cream-paper)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflowY: 'auto',
          }}
        >
          {/* AI Tools */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--color-charcoal-muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Interactive Tools
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                const isSelected = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: isSelected ? 'var(--color-keylime-wash)' : 'transparent',
                      color: isSelected ? 'var(--color-forest-ink)' : 'var(--color-charcoal)',
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <Icon size={14} />
                    <span style={{ flex: 1 }}>{tool.label}</span>
                    <span
                      style={{
                        fontSize: 9,
                        color: 'var(--color-charcoal-muted)',
                        fontFamily: 'var(--font-mono)',
                        opacity: 0.6,
                      }}
                    >
                      {tool.shortcut}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Switcher (+ Target / - Background) */}
          <div
            style={{
              backgroundColor: '#fff',
              padding: 8,
              borderRadius: 8,
              border: '1px solid var(--color-border-mist)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-charcoal-muted)',
                marginBottom: 4,
                fontFamily: 'var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Target Mode
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setIncludeMode(true)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: includeMode ? '#0f3e17' : 'var(--color-border-mist)',
                  backgroundColor: includeMode ? '#e1f4df' : '#fff',
                  color: includeMode ? '#0f3e17' : 'var(--color-charcoal)',
                  fontWeight: includeMode ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 150ms ease',
                }}
              >
                + Target
              </button>
              <button
                onClick={() => setIncludeMode(false)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: !includeMode ? '#dc2626' : 'var(--color-border-mist)',
                  backgroundColor: !includeMode ? '#fee2e2' : '#fff',
                  color: !includeMode ? '#dc2626' : 'var(--color-charcoal)',
                  fontWeight: !includeMode ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 150ms ease',
                }}
              >
                − Background
              </button>
            </div>
          </div>

          {/* 🪄 3D Region Growing Config (when activeTool === 'region_grow') */}
          {activeTool === 'region_grow' && (
            <div
              style={{
                backgroundColor: '#fff',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #10b981',
                boxShadow: '0 1px 4px rgba(16,185,129,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Zap size={13} color="#10b981" /> 3D Region Grow (HU)
                </span>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => { setRgMinHU(400); setRgMaxHU(3000); }}
                  style={{
                    flex: 1,
                    fontSize: 9,
                    padding: '3px 0',
                    borderRadius: 4,
                    border: '1px solid #d1fae5',
                    backgroundColor: rgMinHU === 400 ? '#ecfdf5' : '#fff',
                    color: '#065f46',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cortical (≥400)
                </button>
                <button
                  onClick={() => { setRgMinHU(150); setRgMaxHU(3000); }}
                  style={{
                    flex: 1,
                    fontSize: 9,
                    padding: '3px 0',
                    borderRadius: 4,
                    border: '1px solid #d1fae5',
                    backgroundColor: rgMinHU === 150 ? '#ecfdf5' : '#fff',
                    color: '#065f46',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All Bone (≥150)
                </button>
                <button
                  onClick={() => { setRgMinHU(20); setRgMaxHU(120); }}
                  style={{
                    flex: 1,
                    fontSize: 9,
                    padding: '3px 0',
                    borderRadius: 4,
                    border: '1px solid #d1fae5',
                    backgroundColor: rgMinHU === 20 ? '#ecfdf5' : '#fff',
                    color: '#065f46',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Tissue (20-120)
                </button>
              </div>

              {/* Min HU Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-charcoal-muted)', marginBottom: 2 }}>
                  <span>Min HU</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-charcoal)' }}>{rgMinHU} HU</span>
                </div>
                <input
                  type="range"
                  min="-200"
                  max="1000"
                  step="10"
                  value={rgMinHU}
                  onChange={(e) => setRgMinHU(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#10b981', height: 4 }}
                />
              </div>

              {/* Max HU Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-charcoal-muted)', marginBottom: 2 }}>
                  <span>Max HU</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-charcoal)' }}>{rgMaxHU} HU</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  step="50"
                  value={rgMaxHU}
                  onChange={(e) => setRgMaxHU(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#10b981', height: 4 }}
                />
              </div>

              {/* Search Radius Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-charcoal-muted)', marginBottom: 2 }}>
                  <span>Search Radius</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-charcoal)' }}>{rgRadius >= 200 ? 'Full Volume' : `${rgRadius} mm`}</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={rgRadius}
                  onChange={(e) => setRgRadius(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#10b981', height: 4 }}
                />
              </div>

              {/* Hole Filling Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer', color: 'var(--color-charcoal)' }}>
                <input
                  type="checkbox"
                  checked={rgFillHoles}
                  onChange={(e) => setRgFillHoles(e.target.checked)}
                  style={{ accentColor: '#10b981' }}
                />
                <span>Fill Internal Bone Cavities (Watertight)</span>
              </label>
            </div>
          )}

          {/* 🏝️ 3D Slicer Island Tools (when activeTool === 'island') */}
          {activeTool === 'island' && (
            <div
              style={{
                backgroundColor: '#fff',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #38bdf8',
                boxShadow: '0 1px 4px rgba(56,189,248,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 4 }}>
                <LayersIcon size={13} color="#0284c7" /> Island Filter (3D Slicer)
              </span>
              <p style={{ fontSize: 9, color: 'var(--color-charcoal-muted)', margin: 0 }}>
                Click any bone in slice view to isolate it, or run 1-click filters:
              </p>

              <button
                onClick={handleKeepLargestIsland}
                disabled={isPrompting || !activeLayerId}
                className="btn"
                style={{
                  fontSize: 10,
                  padding: '5px 8px',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  color: '#0369a1',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  justifyContent: 'center',
                }}
              >
                👑 Keep Largest Island (Purge Table)
              </button>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => handleRemoveSmallIslands(islandMinSize)}
                  disabled={isPrompting || !activeLayerId}
                  className="btn"
                  style={{
                    flex: 1,
                    fontSize: 9,
                    padding: '4px 6px',
                    backgroundColor: '#fff',
                    border: '1px solid var(--color-border-mist)',
                    color: 'var(--color-charcoal)',
                    fontWeight: 500,
                  }}
                >
                  Purge &lt; {islandMinSize} vx
                </button>
                <button
                  onClick={() => openSplitMaskModal()}
                  disabled={isPrompting || !activeLayerId}
                  className="btn"
                  style={{
                    flex: 1,
                    fontSize: 9,
                    padding: '4px 6px',
                    backgroundColor: '#e0f2fe',
                    border: '1px solid #7dd3fc',
                    color: '#0369a1',
                    fontWeight: 600,
                  }}
                >
                  🗂️ Split to Layers
                </button>
              </div>
            </div>
          )}

          {/* ✂️ Split Mask Quick Tool (when activeTool === 'split_mask') */}
          {activeTool === 'split_mask' && (
            <div
              style={{
                backgroundColor: '#fff',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #0284c7',
                boxShadow: '0 1px 4px rgba(2,132,199,0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Split size={13} color="#0284c7" /> Split Mask Studio
              </span>
              <p style={{ fontSize: 9, color: 'var(--color-charcoal-muted)', margin: 0 }}>
                Partition the active segmentation mask into separate layers by disconnected islands or plane cut:
              </p>

              <button
                onClick={() => openSplitMaskModal()}
                disabled={isPrompting || !activeLayerId}
                className="btn"
                style={{
                  fontSize: 10,
                  padding: '6px 8px',
                  backgroundColor: '#0284c7',
                  border: '1px solid #0284c7',
                  color: '#fff',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                  borderRadius: 6,
                }}
              >
                <Split size={12} /> Configure & Split Mask
              </button>
            </div>
          )}

          {/* 🦴 Orthopedic Bone & Surgical Morphology Quick Tools */}
          <div
            style={{
              backgroundColor: '#fff',
              padding: 8,
              borderRadius: 8,
              border: '1px solid var(--color-border-mist)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--color-charcoal-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontFamily: 'var(--font-sans)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Cpu size={11} /> Surgical Bone Tools
            </span>

            <button
              onClick={() => handleApplyBoneThreshold(200, 3000)}
              disabled={isPrompting || !activeLayerId}
              className="btn"
              style={{
                fontSize: 10,
                padding: '4px 8px',
                backgroundColor: '#fefce8',
                border: '1px solid #fef08a',
                color: '#854d0e',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              🦴 Extract Bone Envelope (≥200 HU)
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button
                onClick={() => handleApplyMorphology('fill_holes')}
                disabled={isPrompting || !activeLayerId}
                style={{
                  padding: '3px 4px',
                  fontSize: 9,
                  borderRadius: 5,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                Fill Cavities
              </button>
              <button
                onClick={() => handleApplyMorphology('smooth')}
                disabled={isPrompting || !activeLayerId}
                style={{
                  padding: '3px 4px',
                  fontSize: 9,
                  borderRadius: 5,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                Smooth 3D
              </button>
              <button
                onClick={() => handleApplyMorphology('dilate')}
                disabled={isPrompting || !activeLayerId}
                style={{
                  padding: '3px 4px',
                  fontSize: 9,
                  borderRadius: 5,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                Dilate +1mm
              </button>
              <button
                onClick={() => handleApplyMorphology('erode')}
                disabled={isPrompting || !activeLayerId}
                style={{
                  padding: '3px 4px',
                  fontSize: 9,
                  borderRadius: 5,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                Erode -1mm
              </button>
            </div>
          </div>


          {/* CT Windowing Controls (HU WW/WL) */}
          <div
            style={{
              backgroundColor: '#fff',
              padding: 8,
              borderRadius: 8,
              border: '1px solid var(--color-border-mist)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--color-charcoal-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Sliders size={11} /> CT Windowing
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
              {WINDOW_PRESETS.map((p) => {
                const isSel = windowPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyWindowPreset(p.id)}
                    style={{
                      padding: '4px 6px',
                      fontSize: 10,
                      borderRadius: 5,
                      border: '1px solid',
                      borderColor: isSel ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                      backgroundColor: isSel ? 'var(--color-keylime-wash)' : '#fff',
                      color: isSel ? 'var(--color-forest-ink)' : 'var(--color-charcoal)',
                      fontWeight: isSel ? 600 : 400,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {p.label.split(' ')[0]}
                  </button>
                );
              })}
            </div>

            {windowPreset === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-muted)' }}>
                    <span>Width (WW)</span>
                    <span>{windowWidth} HU</span>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={3000}
                    step={50}
                    value={windowWidth || 1000}
                    onChange={(e) => setWindowWidth(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-muted)' }}>
                    <span>Level (WL)</span>
                    <span>{windowLevel} HU</span>
                  </div>
                  <input
                    type="range"
                    min={-800}
                    max={1000}
                    step={25}
                    value={windowLevel || 200}
                    onChange={(e) => setWindowLevel(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions (Undo / Redo / Reset / Clear) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={handleUndoPrompt}
                title="Undo prompt (Ctrl+Z)"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '5px 0',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  color: 'var(--color-charcoal)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <Undo2 size={12} /> Undo
              </button>
              <button
                onClick={handleRedoPrompt}
                title="Redo prompt (Ctrl+Y)"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '5px 0',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  color: 'var(--color-charcoal)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <Redo2 size={12} /> Redo
              </button>
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={handleResetLayer}
                disabled={!activeLayerId}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '5px 0',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid var(--color-border-mist)',
                  backgroundColor: '#fff',
                  color: 'var(--color-charcoal)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <RotateCcw size={12} /> Reset
              </button>
              {(rulers.length > 0 || angles.length > 0) && (
                <button
                  onClick={handleClearMeasurements}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    padding: '5px 0',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    color: 'var(--color-charcoal)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Clear Cal
                </button>
              )}
            </div>
          </div>

          {/* Segmentation Layers */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--color-charcoal-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <LayersIcon size={12} /> Layers ({layers.length})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {layers.length > 3 && (
                  <button
                    onClick={() => {
                      const anyHidden = layers.some((l) => l.visible === false);
                      setLayers((prev) => prev.map((l) => ({ ...l, visible: anyHidden })));
                    }}
                    title="Toggle all visibility"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-charcoal-muted)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                    }}
                  >
                    <Eye size={12} />
                  </button>
                )}
                <button
                  onClick={handleAddLayer}
                  title="Add new layer"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-forest-ink)',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Layer Search Filter (when more than 4 layers exist) */}
            {layers.length > 4 && (
              <div style={{ marginBottom: 6, position: 'relative' }}>
                <Search size={11} style={{ position: 'absolute', left: 7, top: 7, color: 'var(--color-charcoal-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter structures..."
                  value={layerSearchQuery}
                  onChange={(e) => setLayerSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 6px 4px 22px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {layers
                .filter((l) => !layerSearchQuery || l.name.toLowerCase().includes(layerSearchQuery.toLowerCase()))
                .map((l) => {
                const isActive = activeLayerId === l.id;
                const isVis = l.visible !== false;
                return (
                  <div
                    key={l.id}
                    onClick={() => setActiveLayerId(l.id)}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: isActive ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                      backgroundColor: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 120ms ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: l.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontWeight: isActive ? 600 : 400,
                            color: 'var(--color-charcoal)',
                          }}
                        >
                          {l.name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openSplitMaskModal(l.id);
                          }}
                          title="Split Mask into Layers"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-charcoal-muted)',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            borderRadius: 4,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#0284c7')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-charcoal-muted)')}
                        >
                          <Split size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLayerVisibility(l.id);
                          }}
                          title={isVis ? "Hide Layer Overlay" : "Show Layer Overlay"}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: isVis ? 'var(--color-forest-ink)' : 'var(--color-charcoal-muted)',
                            cursor: 'pointer',
                            padding: 2,
                          }}
                        >
                          {isVis ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                      </div>
                    </div>

                    {isActive && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}
                      >
                        <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>Opacity</span>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={l.opacity ?? 0.75}
                          onChange={(e) => handleUpdateLayerOpacity(l.id, Number(e.target.value))}
                          style={{ flex: 1, height: 4 }}
                        />
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                          {Math.round((l.opacity ?? 0.75) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Viewport Grid Container */}
        {volumeNotFound ? (
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--color-cream-paper)',
              padding: 24,
            }}
          >
            <div
              className="animate-fade-in-scale"
              style={{
                maxWidth: 480,
                width: '100%',
                backgroundColor: '#fff',
                padding: 32,
                borderRadius: 16,
                border: '1px solid var(--color-border-mist)',
                boxShadow: '0 8px 30px rgba(15,62,23,0.06)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: 'var(--color-keylime-wash)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--color-border-mist)',
                }}
              >
                <Grid2X2 size={24} color="var(--color-forest-ink)" />
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-forest-ink)' }}>
                  No Reconstructed CT Volume Found
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-charcoal-muted)', lineHeight: 1.5 }}>
                  This patient case has not had a DICOM series uploaded and reconstructed into 3D voxel space yet (Stages 1 & 2).
                </p>
              </div>

              <button
                onClick={() => router.push(`/cases/${caseId}/import`)}
                className="btn btn-primary"
                style={{ padding: '8px 20px', fontSize: 13, gap: 6 }}
              >
                <span>Go to Stage 1: DICOM Import</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </main>
        ) : isVolumeLoading ? (
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0a0d0a',
              gap: 14,
            }}
          >
            <Loader2 size={36} className="animate-spin" color="#b1dbb8" />
            <span
              style={{
                fontSize: 14,
                color: '#e1f4df',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
              }}
            >
              Loading 3D Volume & Multi-Planar Views
            </span>
            <span
              style={{
                fontSize: 12,
                color: '#6b8b6e',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Initializing Axial, Coronal, Sagittal, and 3D bone preview
            </span>
          </main>
        ) : (
          <main
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#0a0d0a',
              display: 'grid',
              gap: 6,
              gridTemplateColumns:
                viewMode === 'quad' ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gridTemplateRows:
                viewMode === 'quad' ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              overflow: 'hidden',
            }}
          >
            {/* Quad or Single Axial View */}
            {(viewMode === 'quad' || viewMode === 'axial') && (
              <SliceViewport
                caseId={caseId}
                axis="axial"
                title="Axial (Z)"
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
                onMouseMove={handleViewportMouseMove}
                onMouseUp={handleViewportMouseUp}
                onFocusView={setViewMode}
                ww={windowWidth}
                wl={windowLevel}
                crosshair={crosshair}
                setCrosshair={setCrosshair}
                showCrosshairs={showCrosshairs}
                metadata={metadata}
                rulers={rulers}
                angles={angles}
                currentRulerDraft={currentRulerDraft}
                currentAngleDraft={currentAngleDraft}
              />
            )}

            {/* Quad or Single Coronal View */}
            {(viewMode === 'quad' || viewMode === 'coronal') && (
              <SliceViewport
                caseId={caseId}
                axis="coronal"
                title="Coronal (Y)"
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
                onMouseMove={handleViewportMouseMove}
                onMouseUp={handleViewportMouseUp}
                onFocusView={setViewMode}
                ww={windowWidth}
                wl={windowLevel}
                crosshair={crosshair}
                setCrosshair={setCrosshair}
                showCrosshairs={showCrosshairs}
                metadata={metadata}
                rulers={rulers}
                angles={angles}
                currentRulerDraft={currentRulerDraft}
                currentAngleDraft={currentAngleDraft}
              />
            )}

            {/* Quad or Single Sagittal View */}
            {(viewMode === 'quad' || viewMode === 'sagittal') && (
              <SliceViewport
                caseId={caseId}
                axis="sagittal"
                title="Sagittal (X)"
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
                onMouseMove={handleViewportMouseMove}
                onMouseUp={handleViewportMouseUp}
                onFocusView={setViewMode}
                ww={windowWidth}
                wl={windowLevel}
                crosshair={crosshair}
                setCrosshair={setCrosshair}
                showCrosshairs={showCrosshairs}
                metadata={metadata}
                rulers={rulers}
                angles={angles}
                currentRulerDraft={currentRulerDraft}
                currentAngleDraft={currentAngleDraft}
              />
            )}

            {/* Quad or Single 3D Generation View */}
            {(viewMode === 'quad' || viewMode === '3d') && (
              <div
                className="seg-viewport-dark"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                <Volume3DPreview caseId={caseId} refreshKey={maskVersion} layerId={activeLayerId} />
              </div>
            )}
          </main>
        )}
      </div>

      {/* ── Keyboard Shortcuts Cheat Sheet Modal ──────────── */}
      {showShortcutsModal && (
        <div className="modal-backdrop" onClick={() => setShowShortcutsModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={20} color="var(--color-forest-ink)" />
                <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 20 }}>Keyboard Shortcuts Cheat Sheet</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4 style={{ fontSize: 13, color: 'var(--color-forest-ink)', marginBottom: 8 }}>Tools & Modes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Point Click (MITK)</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>P</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Bounding Box</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>B</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Pan / Zoom</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>H</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Calibrated Ruler</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>M</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cobb Angle</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>N</kbd>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: 13, color: 'var(--color-forest-ink)', marginBottom: 8 }}>Navigation & Edits</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Next / Prev Slice</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Wheel / [ ]</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Smooth Zoom</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Ctrl + Wheel</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Undo Prompt</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Ctrl + Z</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Redo Prompt</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Ctrl + Y</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Toggle Crosshairs</span> <kbd style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>C</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TotalSegmentator AI Auto-Segmentation Modal ─────── */}
      {showAutoSegModal && (
        <div className="modal-backdrop" onClick={() => setShowAutoSegModal(false)} style={{ zIndex: 1050 }}>
          <div
            className="modal-card animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 680,
              width: '95%',
              padding: 24,
              borderRadius: 16,
              border: '1px solid var(--color-border-mist)',
              boxShadow: '0 20px 40px rgba(15, 62, 23, 0.15)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: selectedModelEngine === 'monai' ? '#eff6ff' : '#ecfdf5',
                    border: `1.5px solid ${selectedModelEngine === 'monai' ? '#3b82f6' : '#10b981'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 200ms ease',
                  }}
                >
                  {selectedModelEngine === 'monai' ? (
                    <Brain size={24} color="#2563eb" />
                  ) : (
                    <Sparkles size={24} color="#059669" />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-forest-ink)' }}>
                      AI Auto-Segmentation Engine
                    </h3>
                    <span
                      style={{
                        backgroundColor: selectedModelEngine === 'monai' ? '#2563eb' : '#10b981',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        transition: 'all 200ms ease',
                      }}
                    >
                      {selectedModelEngine === 'monai' ? 'MONAI 1.6' : 'TotalSegmentator v2.0'}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-charcoal-muted)' }}>
                    {selectedModelEngine === 'monai'
                      ? 'NVIDIA & Project MONAI deep learning models for zero-shot and whole-body CT multi-organ & bone segmentation.'
                      : 'Deep learning CT segmentation of bones and 117+ anatomical structures directly from CT voxels.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAutoSegModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-charcoal-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* AI Model Engine Selector Tabs */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-charcoal-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 6,
                }}
              >
                Select AI Deep Learning Engine
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModelEngine('totalsegmentator');
                    if (selectedPreset.startsWith('monai_')) setSelectedPreset('only_bones');
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px solid',
                    borderColor: selectedModelEngine === 'totalsegmentator' ? '#10b981' : 'var(--color-border-mist)',
                    backgroundColor: selectedModelEngine === 'totalsegmentator' ? '#f0fdf4' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontWeight: selectedModelEngine === 'totalsegmentator' ? 700 : 500,
                    color: selectedModelEngine === 'totalsegmentator' ? '#047857' : 'var(--color-charcoal)',
                    fontSize: 12,
                    transition: 'all 150ms ease',
                  }}
                >
                  <Sparkles size={14} color={selectedModelEngine === 'totalsegmentator' ? '#059669' : '#64748b'} />
                  <span>TotalSegmentator v2.0</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedModelEngine('monai');
                    if (!selectedPreset.startsWith('monai_')) setSelectedPreset('monai_wholebody');
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px solid',
                    borderColor: selectedModelEngine === 'monai' ? '#3b82f6' : 'var(--color-border-mist)',
                    backgroundColor: selectedModelEngine === 'monai' ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontWeight: selectedModelEngine === 'monai' ? 700 : 500,
                    color: selectedModelEngine === 'monai' ? '#1d4ed8' : 'var(--color-charcoal)',
                    fontSize: 12,
                    transition: 'all 150ms ease',
                  }}
                >
                  <Brain size={14} color={selectedModelEngine === 'monai' ? '#2563eb' : '#64748b'} />
                  <span>MONAI 1.6 (VISTA-3D / Auto3DSeg)</span>
                </button>
              </div>
            </div>

            {/* Task Presets Grid */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-charcoal-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                }}
              >
                Select Anatomical Segmentation Task
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                {autoSegPresets
                  .filter((preset) => {
                    if (selectedModelEngine === 'monai') {
                      return preset.id.startsWith('monai_') || preset.id === 'only_bones';
                    }
                    return !preset.id.startsWith('monai_');
                  })
                  .map((preset) => {
                    const isSelected = selectedPreset === preset.id;
                    const isOnlyBones = preset.id === 'only_bones';
                    const activeBorderColor = selectedModelEngine === 'monai' ? '#3b82f6' : '#10b981';
                    const activeBgColor = selectedModelEngine === 'monai' ? '#eff6ff' : '#f0fdf4';

                    return (
                      <div
                        key={preset.id}
                        onClick={() => setSelectedPreset(preset.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: isSelected ? `2px solid ${activeBorderColor}` : isOnlyBones ? '1.5px solid #a7f3d0' : '1.5px solid var(--color-border-mist)',
                          backgroundColor: isSelected ? activeBgColor : isOnlyBones ? '#fafffd' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 120ms ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                border: '1.5px solid',
                                borderColor: isSelected ? activeBorderColor : 'var(--color-border-mist)',
                                backgroundColor: isSelected ? activeBorderColor : '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {isSelected && <Check size={10} color="#fff" />}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-forest-ink)' }}>
                              {preset.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {isOnlyBones && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                Bone Target
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: 6,
                                backgroundColor: isSelected ? (selectedModelEngine === 'monai' ? '#dbeafe' : '#d1fae5') : 'var(--color-surface-sunken)',
                                color: isSelected ? (selectedModelEngine === 'monai' ? '#1e40af' : '#047857') : 'var(--color-charcoal-muted)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {preset.structures_count} {preset.structures_count === 1 ? 'target' : 'classes'}
                            </span>
                          </div>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--color-charcoal-muted)', margin: '2px 0 0 22px', lineHeight: 1.4 }}>
                          {preset.description}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Advanced Tuning & Options */}
            <div
              style={{
                backgroundColor: 'var(--color-surface-sunken)',
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--color-border-mist)',
                marginBottom: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-charcoal)' }}>Fast Inference Mode</div>
                  <div style={{ fontSize: 11, color: 'var(--color-charcoal-muted)' }}>
                    Optimized resolution for ~3× faster execution (recommended for interactive planning)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoSegFast}
                  onChange={(e) => setAutoSegFast(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: selectedModelEngine === 'monai' ? '#3b82f6' : '#10b981', cursor: 'pointer' }}
                />
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--color-border-mist)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-charcoal)' }}>
                    Auto-Generate 3D STLs on Completion
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-charcoal-muted)' }}>
                    Automatically run Marching Cubes and launch the 3D surgical CAD workspace when done
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoSegGenerateSTLs}
                  onChange={(e) => setAutoSegGenerateSTLs(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: selectedModelEngine === 'monai' ? '#3b82f6' : '#10b981', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowAutoSegModal(false)} className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: 12 }}>
                Cancel
              </button>
              <button
                onClick={handleStartAutoSeg}
                className="btn btn-primary"
                style={{
                  backgroundColor: selectedModelEngine === 'monai' ? '#2563eb' : '#059669',
                  borderColor: selectedModelEngine === 'monai' ? '#2563eb' : '#059669',
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {selectedModelEngine === 'monai' ? <Brain size={15} /> : <Sparkles size={15} />}
                <span>{selectedModelEngine === 'monai' ? 'Run MONAI Engine' : 'Run TotalSegmentator'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── STL Generation Overlay Modal ──────────────────── */}
      {isGeneratingSTL && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 62, 23, 0.35)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="animate-fade-in-scale"
            style={{
              width: 460,
              padding: 32,
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-cards)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              textAlign: 'center',
              border: '1px solid var(--color-border-mist)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Loader2 size={24} className="animate-spin" color="var(--color-forest-ink)" />
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 300,
                  color: 'var(--color-forest-ink)',
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                }}
              >
                Generating 3D STL Artifact
              </h3>
            </div>

            <p
              style={{
                fontSize: 13,
                color: 'var(--color-charcoal-muted)',
                margin: 0,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {stlMessage || 'Applying Marching Cubes, Laplacian smoothing, and normal repairs...'}
            </p>

            <div className="progress-bar" style={{ height: 6 }}>
              <div className="progress-bar-fill" style={{ width: `${stlProgress}%` }} />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--color-charcoal-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span>Pipeline Stage 4</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{stlProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ✂️ Split Mask Studio Modal ────────────────────── */}
      {splitMaskModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 62, 23, 0.45)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSplittingMask) {
              setSplitMaskModalOpen(false);
            }
          }}
        >
          <div
            className="animate-fade-in-scale"
            style={{
              width: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-cards)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: 24,
              border: '1px solid var(--color-border-mist)',
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    backgroundColor: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Split size={20} />
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: 'var(--color-forest-ink)',
                      margin: 0,
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    3D Split Mask Studio
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--color-charcoal-muted)' }}>
                    Partition anatomical mask into independent segmentation layers
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSplitMaskModalOpen(false)}
                disabled={isSplittingMask}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-charcoal-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Target Layer Info Banner */}
            {(() => {
              const targetLayer = layers.find((l) => l.id === (splitMaskTargetLayerId || activeLayerId));
              return (
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-mist)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-charcoal-muted)' }}>Target Layer:</span>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: targetLayer?.color || '#00e575',
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-charcoal)' }}>
                      {targetLayer?.name || 'Active Layer'}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: '#0284c7', backgroundColor: '#e0f2fe', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                    Stage 3 Mask
                  </span>
                </div>
              );
            })()}

            {/* Splitting Mode Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, backgroundColor: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              <button
                onClick={() => setSplitMaskMode('islands')}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: splitMaskMode === 'islands' ? '#fff' : 'transparent',
                  color: splitMaskMode === 'islands' ? '#0284c7' : 'var(--color-charcoal-muted)',
                  fontWeight: splitMaskMode === 'islands' ? 700 : 500,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  boxShadow: splitMaskMode === 'islands' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                <LayersIcon size={14} />
                <span>Disconnected Islands</span>
              </button>

              <button
                onClick={() => setSplitMaskMode('plane')}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: splitMaskMode === 'plane' ? '#fff' : 'transparent',
                  color: splitMaskMode === 'plane' ? '#0284c7' : 'var(--color-charcoal-muted)',
                  fontWeight: splitMaskMode === 'plane' ? 700 : 500,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  boxShadow: splitMaskMode === 'plane' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                <Scissors size={14} />
                <span>Planar Slice Cut</span>
              </button>
            </div>

            {/* Mode 1: Disconnected Islands Options */}
            {splitMaskMode === 'islands' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--color-border-mist)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-charcoal)' }}>
                  Performs 3D graph component labeling to automatically separate discrete bone fragments, vertebrae, or anatomical structures into distinct colored layers.
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-charcoal)', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Minimum Component Size</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0284c7' }}>{splitMaskMinSize.toLocaleString()} voxels</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    value={splitMaskMinSize}
                    onChange={(e) => setSplitMaskMinSize(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#0284c7', height: 4 }}
                  />
                  <div style={{ fontSize: 9, color: 'var(--color-charcoal-muted)', marginTop: 2 }}>
                    Debris smaller than this threshold will be ignored (top 2 fragments always kept).
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-charcoal)', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Max Component Layers</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0284c7' }}>{splitMaskMaxComponents} layers</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="16"
                    step="1"
                    value={splitMaskMaxComponents}
                    onChange={(e) => setSplitMaskMaxComponents(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#0284c7', height: 4 }}
                  />
                </div>
              </div>
            )}

            {/* Mode 2: Planar Slice Cut Options */}
            {splitMaskMode === 'plane' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--color-border-mist)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-charcoal)' }}>
                  Bisects the active 3D segmentation mask along an anatomical slice plane, generating two child layers (Part A and Part B).
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-charcoal)', display: 'block', marginBottom: 4 }}>
                    Cutting Plane Orientation:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {(['axial', 'coronal', 'sagittal'] as const).map((ax) => {
                      const isSel = splitMaskPlaneAxis === ax;
                      const label = ax === 'axial' ? 'Axial (Z)' : ax === 'coronal' ? 'Coronal (Y)' : 'Sagittal (X)';
                      const maxSlice = ax === 'axial' ? maxAxial : ax === 'coronal' ? maxCoronal : maxSagittal;
                      return (
                        <button
                          key={ax}
                          type="button"
                          onClick={() => {
                            setSplitMaskPlaneAxis(ax);
                            const current = ax === 'axial' ? axialSlice : ax === 'coronal' ? coronalSlice : sagittalSlice;
                            setSplitMaskPlaneSlice(current);
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid',
                            borderColor: isSel ? '#0284c7' : 'var(--color-border-mist)',
                            backgroundColor: isSel ? '#e0f2fe' : '#fff',
                            color: isSel ? '#0369a1' : 'var(--color-charcoal)',
                            fontWeight: isSel ? 700 : 500,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-charcoal)', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Cut Slice Position</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0284c7' }}>
                      Slice {splitMaskPlaneSlice} / {splitMaskPlaneAxis === 'axial' ? maxAxial : splitMaskPlaneAxis === 'coronal' ? maxCoronal : maxSagittal}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(1, (splitMaskPlaneAxis === 'axial' ? maxAxial : splitMaskPlaneAxis === 'coronal' ? maxCoronal : maxSagittal) - 1)}
                    value={splitMaskPlaneSlice}
                    onChange={(e) => setSplitMaskPlaneSlice(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#0284c7', height: 4 }}
                  />
                </div>
              </div>
            )}

            {/* General Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-charcoal)', display: 'block', marginBottom: 4 }}>
                  Layer Name Prefix (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Femur Fragment, Vertebra, Bone"
                  value={splitMaskPrefix}
                  onChange={(e) => setSplitMaskPrefix(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    outline: 'none',
                  }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: 'var(--color-charcoal)' }}>
                <input
                  type="checkbox"
                  checked={splitMaskDeleteOriginal}
                  onChange={(e) => setSplitMaskDeleteOriginal(e.target.checked)}
                  style={{ accentColor: '#0284c7' }}
                />
                <span>Archive / Remove original parent layer after splitting</span>
              </label>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setSplitMaskModalOpen(false)}
                disabled={isSplittingMask}
                className="btn btn-ghost"
                style={{ padding: '8px 16px', fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSplitMask}
                disabled={isSplittingMask}
                className="btn"
                style={{
                  backgroundColor: '#0284c7',
                  border: '1px solid #0284c7',
                  color: '#fff',
                  padding: '8px 20px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 6,
                  cursor: isSplittingMask ? 'not-allowed' : 'pointer',
                  opacity: isSplittingMask ? 0.7 : 1,
                }}
              >
                {isSplittingMask ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Splitting Mask...</span>
                  </>
                ) : (
                  <>
                    <Split size={14} />
                    <span>Execute Split Mask</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
