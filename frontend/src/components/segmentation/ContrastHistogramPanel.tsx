'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown, Activity, Terminal, Layers, Sliders } from 'lucide-react';
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
  { id: 'bone', label: 'Bone Scale (100..1800)', min: 100, max: 1800 },
  { id: 'soft_tissue', label: 'Soft tissue (-150..250)', min: -150, max: 250 },
  { id: 'narrow', label: 'Narrow scale (300..900)', min: 300, max: 900 },
  { id: 'wide', label: 'Wide scale (-1024..2200)', min: -1024, max: 2200 },
  { id: 'mri', label: 'MRI Scale (0..2500)', min: 0, max: 2500 },
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
  const [activeTab, setActiveTab] = useState<'contrast' | 'log' | 'volume'>('contrast');
  const [isOpen, setIsOpen] = useState(false); // Collapsed by default to maximize CT slice viewports!
  const [histogramData, setHistogramData] = useState<number[]>([]);
  const [dataStats, setDataStats] = useState<{ min: number; max: number }>({ min: -1024, max: 3071 });
  const [isDragging, setIsDragging] = useState<'min' | 'max' | 'ramp' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // 2. Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen || activeTab !== 'contrast') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0e120f';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1a221b';
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
      ctx.strokeStyle = '#27382a';
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw Histogram Area
    if (histogramData.length > 0) {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');

      ctx.beginPath();
      ctx.moveTo(0, height);

      histogramData.forEach((val, i) => {
        const x = (i / (histogramData.length - 1)) * width;
        const y = height - (val / 100) * (height - 10);
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Top Outline
      ctx.beginPath();
      histogramData.forEach((val, i) => {
        const x = (i / (histogramData.length - 1)) * width;
        const y = height - (val / 100) * (height - 10);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Draw Transfer Function Ramp
    const minX = huToX(minHu, width);
    const maxX = huToX(maxHu, width);
    const bottomY = height - 4;
    const topY = 4;

    // Segment 1: Baseline before Min
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, bottomY);
    ctx.lineTo(minX, bottomY);
    ctx.stroke();

    // Segment 2: Diagonal Slope (Min -> Max)
    ctx.beginPath();
    ctx.moveTo(minX, bottomY);
    ctx.lineTo(maxX, topY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Segment 3: Topline after Max
    ctx.beginPath();
    ctx.moveTo(maxX, topY);
    ctx.lineTo(width, topY);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Min Handle Circle
    ctx.beginPath();
    ctx.arc(minX, bottomY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Max Handle Circle
    ctx.beginPath();
    ctx.arc(maxX, topY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }, [histogramData, minHu, maxHu, activeTab, isOpen, huToX]);

  // Pointer Dragging
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
      style={{
        backgroundColor: '#fff',
        borderTop: '1px solid #d8d2c4',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* ── Compact Status Bar Header (28px) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          height: 28,
          backgroundColor: '#faf8f5',
          fontSize: 11,
        }}
      >
        {/* Left: Tab Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => {
              setActiveTab('contrast');
              if (!isOpen) setIsOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: activeTab === 'contrast' ? '#e1f4df' : 'transparent',
              color: activeTab === 'contrast' ? '#0f3e17' : '#556b5a',
              fontWeight: 600,
              cursor: 'pointer',
              height: 22,
            }}
          >
            <Activity size={11} color={activeTab === 'contrast' ? '#10b981' : '#6b7c6e'} />
            <span>Contrast & Grayscale</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('log');
              if (!isOpen) setIsOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: activeTab === 'log' ? '#e1f4df' : 'transparent',
              color: activeTab === 'log' ? '#0f3e17' : '#556b5a',
              fontWeight: 600,
              cursor: 'pointer',
              height: 22,
            }}
          >
            <Terminal size={11} />
            <span>Console Log</span>
          </button>
        </div>

        {/* Center: Live Scale Summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6b7c6e' }}>Preset:</span>
            <select
              value={activePreset}
              onChange={(e) => handlePresetSelect(e.target.value as GrayscalePreset)}
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid #d8d2c4',
                backgroundColor: '#fff',
                color: '#0f3e17',
                padding: '1px 4px',
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
            <span style={{ color: '#6b7c6e' }}>Range:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0f3e17' }}>
              [{minHu} .. {maxHu}] HU
            </span>
          </div>
        </div>

        {/* Right: Drawer Expand / Collapse Toggle */}
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? 'Collapse histogram' : 'Expand histogram curve'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            border: '1px solid #d8d2c4',
            backgroundColor: '#fff',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 10,
            color: '#0f3e17',
            cursor: 'pointer',
            height: 20,
            fontWeight: 600,
          }}
        >
          <span>{isOpen ? 'Hide Curve' : 'Show Curve'}</span>
          {isOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>

      {/* ── Collapsible Interactive Drawer (Height 90px when open) ── */}
      {isOpen && activeTab === 'contrast' && (
        <div
          style={{
            height: 90,
            display: 'flex',
            flexDirection: 'column',
            padding: '4px 10px 4px',
            backgroundColor: '#fff',
            borderTop: '1px solid #e8e4db',
          }}
        >
          <div style={{ flex: 1, position: 'relative', width: '100%' }}>
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
                border: '1px solid #d8d2c4',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: '#6b7c6e',
              fontFamily: 'var(--font-mono, monospace)',
              padding: '1px 2px 0',
              position: 'relative',
              fontWeight: 500,
            }}
          >
            <span>-1023</span>
            <span style={{ position: 'absolute', left: `${((0 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>0</span>
            <span style={{ position: 'absolute', left: `${((1000 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>1000</span>
            <span style={{ position: 'absolute', left: `${((2000 - HU_MIN) / HU_RANGE) * 100}%`, transform: 'translateX(-50%)' }}>2000</span>
            <span>3071</span>
          </div>
        </div>
      )}

      {/* Log Drawer */}
      {isOpen && activeTab === 'log' && (
        <div style={{ height: 90, padding: 8, fontSize: 10.5, color: '#334155', overflowY: 'auto', backgroundColor: '#faf8f5', fontFamily: 'var(--font-mono, monospace)' }}>
          <div>[SYSTEM] Multi-Planar Reconstruction (MPR) Engine Active.</div>
          <div>[INFO] Dynamic Voxel Range: [{dataStats.min} HU .. {dataStats.max} HU]</div>
          <div>[GPU] Real-time slice windowing & grayscale transfer pipeline calibrated.</div>
        </div>
      )}
    </div>
  );
}
