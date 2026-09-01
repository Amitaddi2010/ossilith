'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, Terminal, Layers, Activity } from 'lucide-react';
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
            const air = Math.exp(-Math.pow((hu + 900) / 120, 2)) * 85;
            const soft = Math.exp(-Math.pow((hu - 40) / 80, 2)) * 65;
            const bone = Math.exp(-Math.pow((hu - 750) / 450, 2)) * 45;
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

  // 2. Pixel-Accurate Canvas Rendering
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

    // Clear White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw Solid Gray Filled Area Histogram
    if (histogramData.length > 0) {
      ctx.beginPath();
      ctx.moveTo(0, height);

      histogramData.forEach((val, i) => {
        const x = (i / (histogramData.length - 1)) * width;
        const y = height - (val / 100) * (height - 10);
        ctx.lineTo(x, y);
      });

      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = '#78716c';
      ctx.fill();
    }

    // Draw Black Diagonal Transfer Function Ramp
    const minX = huToX(minHu, width);
    const maxX = huToX(maxHu, width);
    const bottomY = height - 2;
    const topY = 2;

    // Segment 1: Baseline Before Min
    ctx.beginPath();
    ctx.moveTo(0, bottomY);
    ctx.lineTo(minX, bottomY);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Segment 2: Diagonal Ramp Line (Min -> Max)
    ctx.beginPath();
    ctx.moveTo(minX, bottomY);
    ctx.lineTo(maxX, topY);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Segment 3: Topline After Max
    ctx.beginPath();
    ctx.moveTo(maxX, topY);
    ctx.lineTo(width, topY);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Min Circular Handle
    ctx.beginPath();
    ctx.arc(minX, bottomY - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    // Max Circular Handle
    ctx.beginPath();
    ctx.arc(maxX, topY + 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  }, [histogramData, minHu, maxHu, activeTab, huToX]);

  // Pointer Interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    const minX = huToX(minHu, width);
    const maxX = huToX(maxHu, width);

    if (Math.abs(clickX - minX) < 14) {
      setIsDragging('min');
    } else if (Math.abs(clickX - maxX) < 14) {
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
        backgroundColor: '#ffffff',
        borderTop: '1px solid #cbd5e1',
        display: 'flex',
        flexDirection: 'column',
        height: isExpanded ? 240 : 140,
        transition: 'height 0.2s ease',
        userSelect: 'none',
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Top Tabs Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #cbd5e1',
          backgroundColor: '#f1f5f9',
          padding: '0 4px',
          height: 24,
        }}
      >
        <div style={{ display: 'flex', gap: 2, height: '100%', alignItems: 'flex-end' }}>
          <button
            onClick={() => setActiveTab('log')}
            style={{
              padding: '2px 10px',
              fontSize: 10.5,
              fontWeight: 500,
              backgroundColor: activeTab === 'log' ? '#ffffff' : 'transparent',
              borderTop: activeTab === 'log' ? '1px solid #94a3b8' : '1px solid transparent',
              borderLeft: activeTab === 'log' ? '1px solid #94a3b8' : '1px solid transparent',
              borderRight: activeTab === 'log' ? '1px solid #94a3b8' : '1px solid transparent',
              borderBottom: activeTab === 'log' ? '1px solid #ffffff' : 'none',
              color: '#334155',
              cursor: 'pointer',
              height: '100%',
              marginBottom: -1,
            }}
          >
            Log
          </button>
          <button
            onClick={() => setActiveTab('volume')}
            style={{
              padding: '2px 10px',
              fontSize: 10.5,
              fontWeight: 500,
              backgroundColor: activeTab === 'volume' ? '#ffffff' : 'transparent',
              borderTop: activeTab === 'volume' ? '1px solid #94a3b8' : '1px solid transparent',
              borderLeft: activeTab === 'volume' ? '1px solid #94a3b8' : '1px solid transparent',
              borderRight: activeTab === 'volume' ? '1px solid #94a3b8' : '1px solid transparent',
              borderBottom: activeTab === 'volume' ? '1px solid #ffffff' : 'none',
              color: '#334155',
              cursor: 'pointer',
              height: '100%',
              marginBottom: -1,
            }}
          >
            Volume Rendering
          </button>
          <button
            onClick={() => setActiveTab('contrast')}
            style={{
              padding: '2px 10px',
              fontSize: 10.5,
              fontWeight: 600,
              backgroundColor: activeTab === 'contrast' ? '#ffffff' : 'transparent',
              borderTop: activeTab === 'contrast' ? '1px solid #94a3b8' : '1px solid transparent',
              borderLeft: activeTab === 'contrast' ? '1px solid #94a3b8' : '1px solid transparent',
              borderRight: activeTab === 'contrast' ? '1px solid #94a3b8' : '1px solid transparent',
              borderBottom: activeTab === 'contrast' ? '1px solid #ffffff' : 'none',
              color: '#0f172a',
              cursor: 'pointer',
              height: '100%',
              marginBottom: -1,
            }}
          >
            Contrast
          </button>
        </div>

        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          title={isExpanded ? 'Collapse' : 'Expand'}
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
          {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'contrast' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '2px 8px 4px',
            backgroundColor: '#ffffff',
            position: 'relative',
          }}
        >
          {/* High Density Area Histogram Canvas */}
          <div style={{ flex: 1, position: 'relative', minHeight: 60, width: '100%' }}>
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
              }}
            />
          </div>

          {/* Calibrated HU Axis Labels */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: '#64748b',
              fontFamily: 'Segoe UI, sans-serif',
              padding: '1px 2px 2px',
              position: 'relative',
            }}
          >
            <span>-1023</span>
            <span style={{ position: 'absolute', left: `${((0 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>0</span>
            <span style={{ position: 'absolute', left: `${((1000 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>1000</span>
            <span style={{ position: 'absolute', left: `${((2000 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>2000</span>
            <span>3071</span>
          </div>

          {/* Bottom Controls Row matching user reference */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              paddingTop: 2,
              borderTop: '1px solid #e2e8f0',
              fontSize: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#334155' }}>Grayscale:</span>
              <select
                value={activePreset}
                onChange={(e) => handlePresetSelect(e.target.value as GrayscalePreset)}
                style={{
                  padding: '1px 4px',
                  fontSize: 10.5,
                  borderRadius: 2,
                  border: '1px solid #94a3b8',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer',
                  height: 20,
                }}
              >
                {GRAYSCALE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#334155' }}>Min:</span>
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
                  width: 54,
                  padding: '1px 4px',
                  fontSize: 10.5,
                  fontFamily: 'Segoe UI, sans-serif',
                  borderRadius: 2,
                  border: '1px solid #94a3b8',
                  textAlign: 'right',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  height: 20,
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#334155' }}>Max:</span>
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
                  width: 54,
                  padding: '1px 4px',
                  fontSize: 10.5,
                  fontFamily: 'Segoe UI, sans-serif',
                  borderRadius: 2,
                  border: '1px solid #94a3b8',
                  textAlign: 'right',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  height: 20,
                }}
              />
            </div>

            <button
              style={{
                fontSize: 10,
                padding: '2px 6px',
                border: '1px solid #94a3b8',
                borderRadius: 2,
                backgroundColor: '#f8fafc',
                color: '#334155',
                cursor: 'pointer',
                height: 20,
              }}
            >
              Simulation Objects
            </button>

            <button
              style={{
                fontSize: 10,
                padding: '2px 6px',
                border: '1px solid #94a3b8',
                borderRadius: 2,
                backgroundColor: '#f8fafc',
                color: '#334155',
                cursor: 'pointer',
                height: 20,
              }}
            >
              Snap
            </button>
          </div>
        </div>
      )}

      {/* Log Tab */}
      {activeTab === 'log' && (
        <div style={{ flex: 1, padding: 8, fontSize: 10.5, color: '#334155', overflowY: 'auto', backgroundColor: '#ffffff', fontFamily: 'Consolas, monospace' }}>
          <div>Ready</div>
          <div>CT Voxel dynamic range: [{dataStats.min} HU .. {dataStats.max} HU]</div>
          <div>Multi-Planar Reconstruction (MPR) Initialized.</div>
        </div>
      )}

      {/* Volume Rendering Tab */}
      {activeTab === 'volume' && (
        <div style={{ flex: 1, padding: 8, fontSize: 11, color: '#334155', display: 'flex', gap: 16, alignItems: 'center', backgroundColor: '#ffffff' }}>
          <span>Volume Opacity: <strong>100%</strong></span>
          <span>Iso-surface Threshold: <strong>{minHu} HU</strong></span>
          <span>Shading: <strong>Phong Blinn Bone</strong></span>
        </div>
      )}
    </div>
  );
}
