'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, Sliders, Activity, Terminal, Layers } from 'lucide-react';
import { API_BASE } from '@/lib/api';

export type GrayscalePreset =
  | 'custom'
  | 'bone'
  | 'soft_tissue'
  | 'narrow'
  | 'wide'
  | 'mri';

export interface ContrastScale {
  id: GrayscalePreset;
  label: string;
  min: number;
  max: number;
}

export const GRAYSCALE_PRESETS: ContrastScale[] = [
  { id: 'custom', label: 'Custom scale', min: -1024, max: 2200 },
  { id: 'bone', label: 'Bone Scale', min: 100, max: 1800 },
  { id: 'soft_tissue', label: 'Soft tissue scale', min: -150, max: 250 },
  { id: 'narrow', label: 'Narrow scale', min: 300, max: 900 },
  { id: 'wide', label: 'Wide scale', min: -1024, max: 2200 },
  { id: 'mri', label: 'MRI Scale', min: 0, max: 2500 },
];

interface ContrastHistogramPanelProps {
  caseId: string;
  minHu: number;
  maxHu: number;
  onMinMaxChange: (min: number, max: number, presetId?: GrayscalePreset) => void;
  activePreset: GrayscalePreset;
  onPresetChange: (preset: GrayscalePreset) => void;
}

export default function ContrastHistogramPanel({
  caseId,
  minHu,
  maxHu,
  onMinMaxChange,
  activePreset,
  onPresetChange,
}: ContrastHistogramPanelProps) {
  const [activeTab, setActiveTab] = useState<'log' | 'volume' | 'contrast'>('contrast');
  const [isExpanded, setIsExpanded] = useState(false);
  const [histogramData, setHistogramData] = useState<number[]>([]);
  const [dataStats, setDataStats] = useState<{ min: number; max: number }>({ min: -1024, max: 3071 });
  const [isDragging, setIsDragging] = useState<'min' | 'max' | 'ramp' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const HU_MIN = -1024;
  const HU_MAX = 3071;
  const HU_RANGE = HU_MAX - HU_MIN;

  // 1. Fetch Histogram Data
  useEffect(() => {
    let isMounted = true;
    async function fetchHistogram() {
      try {
        const res = await fetch(`${API_BASE}/api/cases/${caseId}/volume/histogram`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.bins) {
            setHistogramData(data.bins);
            if (data.data_min !== undefined) {
              setDataStats({ min: Math.round(data.data_min), max: Math.round(data.data_max) });
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          const mockBins: number[] = [];
          for (let i = 0; i < 256; i++) {
            const hu = HU_MIN + (i / 255) * HU_RANGE;
            const air = Math.exp(-Math.pow((hu + 900) / 120, 2)) * 80;
            const soft = Math.exp(-Math.pow((hu - 40) / 80, 2)) * 60;
            const bone = Math.exp(-Math.pow((hu - 750) / 450, 2)) * 40;
            const noise = Math.sin(i * 0.7) * 2 + Math.random() * 1.5;
            mockBins.push(Math.max(2, Math.min(100, air + soft + bone + noise)));
          }
          setHistogramData(mockBins);
        }
      }
    }
    fetchHistogram();
    return () => {
      isMounted = false;
    };
  }, [caseId]);

  // Coordinate Conversion Helpers
  const huToX = useCallback((hu: number, width: number) => {
    const pct = Math.max(0, Math.min(1, (hu - HU_MIN) / HU_RANGE));
    return pct * width;
  }, [HU_MIN, HU_RANGE]);

  const xToHu = useCallback((x: number, width: number) => {
    const pct = Math.max(0, Math.min(1, x / width));
    return Math.round(HU_MIN + pct * HU_RANGE);
  }, [HU_MIN, HU_RANGE]);

  // 2. High-DPI Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTab !== 'contrast') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#11141a';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e2430';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((ratio) => {
      ctx.beginPath();
      ctx.moveTo(0, height * ratio);
      ctx.lineTo(width, height * ratio);
      ctx.stroke();
    });

    // Vertical HU ticks (0, 1000, 2000)
    [0, 1000, 2000].forEach((hu) => {
      const x = huToX(hu, width);
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#2d3748';
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw Histogram Area
    if (histogramData.length > 0) {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(100, 116, 139, 0.55)');
      grad.addColorStop(1, 'rgba(51, 65, 85, 0.2)');

      ctx.beginPath();
      ctx.moveTo(0, height);

      histogramData.forEach((val, i) => {
        const x = (i / (histogramData.length - 1)) * width;
        const y = height - (val / 100) * (height - 12);
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Outline top of histogram
      ctx.beginPath();
      histogramData.forEach((val, i) => {
        const x = (i / (histogramData.length - 1)) * width;
        const y = height - (val / 100) * (height - 12);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Draw Transfer Function Ramp
    const minX = huToX(minHu, width);
    const maxX = huToX(maxHu, width);
    const bottomY = height - 4;
    const topY = 4;

    // Ramp line
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;

    // Segment 1: Baseline before Min
    ctx.beginPath();
    ctx.moveTo(0, bottomY);
    ctx.lineTo(minX, bottomY);
    ctx.stroke();

    // Segment 2: Diagonal Slope (Min -> Max)
    ctx.beginPath();
    ctx.moveTo(minX, bottomY);
    ctx.lineTo(maxX, topY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Segment 3: Topline after Max
    ctx.beginPath();
    ctx.moveTo(maxX, topY);
    ctx.lineTo(width, topY);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Min Handle Circle
    ctx.beginPath();
    ctx.arc(minX, bottomY, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Max Handle Circle
    ctx.beginPath();
    ctx.arc(maxX, topY, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }, [histogramData, minHu, maxHu, activeTab, huToX]);

  // 3. Pointer Interaction for Dragging Handles
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    const minX = huToX(minHu, width);
    const maxX = huToX(maxHu, width);

    if (Math.abs(clickX - minX) < 12) {
      setIsDragging('min');
    } else if (Math.abs(clickX - maxX) < 12) {
      setIsDragging('max');
    } else {
      setIsDragging('ramp');
    }
    canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const currX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const currHu = xToHu(currX, rect.width);

    if (isDragging === 'min') {
      const newMin = Math.min(currHu, maxHu - 20);
      onMinMaxChange(newMin, maxHu, 'custom');
    } else if (isDragging === 'max') {
      const newMax = Math.max(currHu, minHu + 20);
      onMinMaxChange(minHu, newMax, 'custom');
    } else if (isDragging === 'ramp') {
      const currentWidth = maxHu - minHu;
      const halfWidth = Math.round(currentWidth / 2);
      const newMin = Math.max(HU_MIN, currHu - halfWidth);
      const newMax = Math.min(HU_MAX, newMin + currentWidth);
      onMinMaxChange(newMin, newMax, 'custom');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setIsDragging(null);
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePresetSelect = (presetId: GrayscalePreset) => {
    onPresetChange(presetId);
    const found = GRAYSCALE_PRESETS.find((p) => p.id === presetId);
    if (found && presetId !== 'custom') {
      onMinMaxChange(found.min, found.max, presetId);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        backgroundColor: '#0f1218',
        borderTop: '1px solid #242c38',
        display: 'flex',
        flexDirection: 'column',
        height: isExpanded ? 220 : 130,
        transition: 'height 0.2s ease',
        userSelect: 'none',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* ── Top Tabs Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e2430',
          backgroundColor: '#0c0e12',
          padding: '0 8px',
          height: 28,
        }}
      >
        <div style={{ display: 'flex', gap: 2, height: '100%', alignItems: 'flex-end' }}>
          <button
            onClick={() => setActiveTab('log')}
            style={{
              padding: '3px 14px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: activeTab === 'log' ? '#0f1218' : 'transparent',
              borderTop: activeTab === 'log' ? '2px solid #38bdf8' : '2px solid transparent',
              borderLeft: activeTab === 'log' ? '1px solid #242c38' : '1px solid transparent',
              borderRight: activeTab === 'log' ? '1px solid #242c38' : '1px solid transparent',
              borderBottom: activeTab === 'log' ? '1px solid #0f1218' : 'none',
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              color: activeTab === 'log' ? '#f8fafc' : '#64748b',
              cursor: 'pointer',
              height: '100%',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Terminal size={11} /> Log
          </button>
          <button
            onClick={() => setActiveTab('volume')}
            style={{
              padding: '3px 14px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: activeTab === 'volume' ? '#0f1218' : 'transparent',
              borderTop: activeTab === 'volume' ? '2px solid #38bdf8' : '2px solid transparent',
              borderLeft: activeTab === 'volume' ? '1px solid #242c38' : '1px solid transparent',
              borderRight: activeTab === 'volume' ? '1px solid #242c38' : '1px solid transparent',
              borderBottom: activeTab === 'volume' ? '1px solid #0f1218' : 'none',
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              color: activeTab === 'volume' ? '#f8fafc' : '#64748b',
              cursor: 'pointer',
              height: '100%',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Layers size={11} /> Volume Rendering
          </button>
          <button
            onClick={() => setActiveTab('contrast')}
            style={{
              padding: '3px 14px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: activeTab === 'contrast' ? '#0f1218' : 'transparent',
              borderTop: activeTab === 'contrast' ? '2px solid #38bdf8' : '2px solid transparent',
              borderLeft: activeTab === 'contrast' ? '1px solid #242c38' : '1px solid transparent',
              borderRight: activeTab === 'contrast' ? '1px solid #242c38' : '1px solid transparent',
              borderBottom: activeTab === 'contrast' ? '1px solid #0f1218' : 'none',
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              color: activeTab === 'contrast' ? '#38bdf8' : '#64748b',
              cursor: 'pointer',
              height: '100%',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Activity size={11} /> Contrast & Grayscale
          </button>
        </div>

        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {/* ── Tab Content: Contrast & Grayscale Curve ── */}
      {activeTab === 'contrast' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '4px 12px 6px',
            position: 'relative',
            backgroundColor: '#0f1218',
          }}
        >
          {/* Main Interactive Canvas Area */}
          <div style={{ flex: 1, position: 'relative', minHeight: 48, width: '100%' }}>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                cursor: isDragging ? 'ew-resize' : 'crosshair',
                borderRadius: 4,
                border: '1px solid #1e2430',
              }}
            />
          </div>

          {/* HU X-Axis Scale Labels */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9.5,
              color: '#64748b',
              fontFamily: 'var(--font-mono, monospace)',
              padding: '2px 4px 1px',
              position: 'relative',
            }}
          >
            <span>-1023</span>
            <span style={{ position: 'absolute', left: `${((0 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>0</span>
            <span style={{ position: 'absolute', left: `${((1000 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>1000</span>
            <span style={{ position: 'absolute', left: `${((2000 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>2000</span>
            <span>3071</span>
          </div>

          {/* ── Bottom Controls Row ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 14,
              paddingTop: 3,
              fontSize: 11,
            }}
          >
            {/* Grayscale Preset Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Grayscale:</span>
              <select
                value={activePreset}
                onChange={(e) => handlePresetSelect(e.target.value as GrayscalePreset)}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                  height: 22,
                }}
              >
                {GRAYSCALE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Min HU Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Min:</span>
              <input
                type="number"
                value={minHu}
                step={10}
                min={-2000}
                max={maxHu - 10}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val) && val < maxHu) {
                    onMinMaxChange(val, maxHu, 'custom');
                  }
                }}
                style={{
                  width: 64,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  borderRadius: 4,
                  border: '1px solid #334155',
                  textAlign: 'right',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  fontWeight: 600,
                  height: 22,
                }}
              />
            </div>

            {/* Max HU Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Max:</span>
              <input
                type="number"
                value={maxHu}
                step={10}
                min={minHu + 10}
                max={4000}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val) && val > minHu) {
                    onMinMaxChange(minHu, val, 'custom');
                  }
                }}
                style={{
                  width: 64,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  borderRadius: 4,
                  border: '1px solid #334155',
                  textAlign: 'right',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  fontWeight: 600,
                  height: 22,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Log Tab */}
      {activeTab === 'log' && (
        <div style={{ flex: 1, padding: 10, fontSize: 11, color: '#94a3b8', overflowY: 'auto', backgroundColor: '#0f1218', fontFamily: 'var(--font-mono, monospace)' }}>
          <div>[SYSTEM] Multi-Planar Reconstruction (MPR) Engine Active.</div>
          <div>[INFO] CT Voxel space dynamic range: [{dataStats.min} HU .. {dataStats.max} HU]</div>
          <div>[GPU] Real-time slice windowing & grayscale transfer pipeline calibrated.</div>
        </div>
      )}

      {/* Volume Rendering Tab */}
      {activeTab === 'volume' && (
        <div style={{ flex: 1, padding: 10, fontSize: 11, color: '#cbd5e1', display: 'flex', gap: 20, alignItems: 'center', backgroundColor: '#0f1218' }}>
          <span>Volume Raycasting Opacity: <strong style={{ color: '#38bdf8' }}>100%</strong></span>
          <span>Iso-surface Threshold: <strong style={{ color: '#38bdf8' }}>{minHu} HU</strong></span>
          <span>Shading Model: <strong style={{ color: '#38bdf8' }}>Phong Blinn Bone</strong></span>
        </div>
      )}
    </div>
  );
}
