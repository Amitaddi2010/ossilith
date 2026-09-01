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
  const [activeTab, setActiveTab] = useState<'contrast' | 'log'>('contrast');
  const [isOpen, setIsOpen] = useState(true); // Open by default with fully visible bounded height
  const [histogramData, setHistogramData] = useState<number[]>([]);
  const [dataStats, setDataStats] = useState<{ min: number; max: number }>({ min: -1024, max: 3071 });
  const [isDragging, setIsDragging] = useState<'min' | 'max' | 'ramp' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 600, height: 80 });

  const HU_MIN = -1024;
  const HU_MAX = 3071;
  const HU_RANGE = HU_MAX - HU_MIN;

  const PAD_X = 12;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 18;

  // 1. Responsive Resize Observer for Canvas Container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  // 2. Fetch Histogram Data
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

  // Coordinate Conversion with Canvas Insets
  const huToX = useCallback((hu: number, usableWidth: number) => {
    const pct = Math.max(0, Math.min(1, (hu - HU_MIN) / HU_RANGE));
    return PAD_X + pct * usableWidth;
  }, [HU_MIN, HU_RANGE, PAD_X]);

  const xToHu = useCallback((x: number, usableWidth: number) => {
    const clampedX = Math.max(PAD_X, Math.min(PAD_X + usableWidth, x));
    const pct = (clampedX - PAD_X) / usableWidth;
    return Math.round(HU_MIN + pct * HU_RANGE);
  }, [HU_MIN, HU_RANGE, PAD_X]);

  // 3. Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen || activeTab !== 'contrast') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvasDimensions.width;
    const height = canvasDimensions.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const usableWidth = Math.max(10, width - PAD_X * 2);
    const usableHeight = Math.max(10, height - PAD_TOP - PAD_BOTTOM);
    const bottomY = PAD_TOP + usableHeight;
    const topY = PAD_TOP;

    // Background fill
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(0, 0, width, height);

    // Subtle horizontal gridlines
    ctx.strokeStyle = '#1a221a';
    ctx.lineWidth = 1;
    [0.33, 0.66].forEach((ratio) => {
      ctx.beginPath();
      ctx.moveTo(PAD_X, PAD_TOP + usableHeight * ratio);
      ctx.lineTo(PAD_X + usableWidth, PAD_TOP + usableHeight * ratio);
      ctx.stroke();
    });

    // Vertical dashed HU reference lines
    [0, 1000, 2000].forEach((hu) => {
      const x = huToX(hu, usableWidth);
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#27382a';
      ctx.moveTo(x, PAD_TOP);
      ctx.lineTo(x, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw Histogram Area Gradient
    if (histogramData.length > 1) {
      const grad = ctx.createLinearGradient(0, PAD_TOP, 0, bottomY);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.04)');

      ctx.beginPath();
      ctx.moveTo(PAD_X, bottomY);

      histogramData.forEach((val, i) => {
        const x = PAD_X + (i / (histogramData.length - 1)) * usableWidth;
        const y = bottomY - (val / 100) * usableHeight;
        ctx.lineTo(x, y);
      });

      ctx.lineTo(PAD_X + usableWidth, bottomY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Histogram top curve
      ctx.beginPath();
      histogramData.forEach((val, i) => {
        const x = PAD_X + (i / (histogramData.length - 1)) * usableWidth;
        const y = bottomY - (val / 100) * usableHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Transfer Function Line (Min HU -> Max HU)
    const minX = huToX(minHu, usableWidth);
    const maxX = huToX(maxHu, usableWidth);

    // Baseline before Min
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(PAD_X, bottomY);
    ctx.lineTo(minX, bottomY);
    ctx.stroke();

    // Active Slope
    ctx.beginPath();
    ctx.moveTo(minX, bottomY);
    ctx.lineTo(maxX, topY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Topline after Max
    ctx.beginPath();
    ctx.moveTo(maxX, topY);
    ctx.lineTo(PAD_X + usableWidth, topY);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Min Handle (Blue circle)
    ctx.beginPath();
    ctx.arc(minX, bottomY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Max Handle (Blue circle)
    ctx.beginPath();
    ctx.arc(maxX, topY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Draw X-axis tick labels directly on canvas to guarantee zero clipping
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('-1023', PAD_X, height - 3);

    ctx.textAlign = 'center';
    ctx.fillText('0', huToX(0, usableWidth), height - 3);
    ctx.fillText('1000', huToX(1000, usableWidth), height - 3);
    ctx.fillText('2000', huToX(2000, usableWidth), height - 3);

    ctx.textAlign = 'right';
    ctx.fillText('3071', PAD_X + usableWidth, height - 3);
  }, [histogramData, minHu, maxHu, activeTab, isOpen, canvasDimensions, huToX]);

  // Pointer Interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const usableWidth = Math.max(10, rect.width - PAD_X * 2);

    const minX = huToX(minHu, usableWidth);
    const maxX = huToX(maxHu, usableWidth);

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
    const clickX = e.clientX - rect.left;
    const usableWidth = Math.max(10, rect.width - PAD_X * 2);
    const currHu = xToHu(clickX, usableWidth);

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
      {/* ── Level 1: Toolbar Header (30px) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          height: 30,
          backgroundColor: '#faf8f5',
          fontSize: 11,
          borderBottom: isOpen ? '1px solid #e8e4db' : 'none',
        }}
      >
        {/* Left: Tab Switches */}
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
              fontWeight: 700,
              cursor: 'pointer',
              height: 22,
            }}
          >
            <Activity size={12} color={activeTab === 'contrast' ? '#10b981' : '#6b7c6e'} />
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
            <Terminal size={12} />
            <span>Console Log</span>
          </button>
        </div>

        {/* Center: Interactive Min, Max & Preset Inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6b7c6e', fontSize: 10.5 }}>Preset:</span>
            <select
              value={activePreset}
              onChange={(e) => handlePresetSelect(e.target.value as GrayscalePreset)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid #d8d2c4',
                backgroundColor: '#fff',
                color: '#0f3e17',
                padding: '1px 6px',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6b7c6e', fontSize: 10.5 }}>Min:</span>
            <input
              type="number"
              value={minHu}
              onChange={(e) => onMinMaxChange(Number(e.target.value), maxHu, 'custom')}
              style={{
                width: 58,
                height: 22,
                padding: '0 4px',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                borderRadius: 4,
                border: '1px solid #d8d2c4',
                backgroundColor: '#fff',
                color: '#0f3e17',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ color: '#6b7c6e', fontSize: 10 }}>HU</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6b7c6e', fontSize: 10.5 }}>Max:</span>
            <input
              type="number"
              value={maxHu}
              onChange={(e) => onMinMaxChange(minHu, Number(e.target.value), 'custom')}
              style={{
                width: 58,
                height: 22,
                padding: '0 4px',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                borderRadius: 4,
                border: '1px solid #d8d2c4',
                backgroundColor: '#fff',
                color: '#0f3e17',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ color: '#6b7c6e', fontSize: 10 }}>HU</span>
          </div>
        </div>

        {/* Right: Expand / Collapse Toggle */}
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? 'Collapse histogram' : 'Expand histogram curve'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            border: '1px solid #d8d2c4',
            backgroundColor: '#fff',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 10.5,
            color: '#0f3e17',
            cursor: 'pointer',
            height: 22,
            fontWeight: 600,
          }}
        >
          <span>{isOpen ? 'Hide Curve' : 'Show Curve'}</span>
          {isOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>

      {/* ── Level 2: Responsive Histogram Canvas Drawer (100px) ── */}
      {isOpen && activeTab === 'contrast' && (
        <div
          ref={containerRef}
          style={{
            height: 95,
            width: '100%',
            padding: '4px 8px',
            backgroundColor: '#fff',
            position: 'relative',
            boxSizing: 'border-box',
          }}
        >
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
              border: '1px solid #ded8cb',
            }}
          />
        </div>
      )}

      {/* Log Console Drawer */}
      {isOpen && activeTab === 'log' && (
        <div
          style={{
            height: 95,
            padding: 8,
            fontSize: 10.5,
            color: '#334155',
            overflowY: 'auto',
            backgroundColor: '#faf8f5',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          <div>[SYSTEM] Multi-Planar Reconstruction (MPR) Engine Active.</div>
          <div>[INFO] Dynamic CT Voxel Range: [{dataStats.min} HU .. {dataStats.max} HU]</div>
          <div>[GPU] Real-time slice windowing & grayscale transfer pipeline calibrated.</div>
        </div>
      )}
    </div>
  );
}
