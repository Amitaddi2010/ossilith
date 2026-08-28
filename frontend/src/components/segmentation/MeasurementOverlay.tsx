'use client';

import React from 'react';

export interface MeasurementPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface RulerMeasurement {
  id: string;
  p1: MeasurementPoint;
  p2: MeasurementPoint;
}

export interface AngleMeasurement {
  id: string;
  p1: MeasurementPoint;
  center: MeasurementPoint;
  p2: MeasurementPoint;
}

interface MeasurementOverlayProps {
  rulers: RulerMeasurement[];
  angles: AngleMeasurement[];
  currentRulerDraft: { p1: MeasurementPoint; p2?: MeasurementPoint } | null;
  currentAngleDraft: { p1: MeasurementPoint; center?: MeasurementPoint; p2?: MeasurementPoint } | null;
  pixelSpacing: [number, number]; // [spacing_x_mm, spacing_y_mm]
  imageWidth: number;
  imageHeight: number;
}

export default function MeasurementOverlay({
  rulers,
  angles,
  currentRulerDraft,
  currentAngleDraft,
  pixelSpacing,
  imageWidth,
  imageHeight,
}: MeasurementOverlayProps) {
  const [spacingX, spacingY] = pixelSpacing || [1.0, 1.0];

  const calcDistMm = (p1: MeasurementPoint, p2: MeasurementPoint) => {
    const dx = (p2.x - p1.x) * imageWidth * spacingX;
    const dy = (p2.y - p1.y) * imageHeight * spacingY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const calcAngleDeg = (p1: MeasurementPoint, center: MeasurementPoint, p2: MeasurementPoint) => {
    const v1x = (p1.x - center.x) * imageWidth * spacingX;
    const v1y = (p1.y - center.y) * imageHeight * spacingY;
    const v2x = (p2.x - center.x) * imageWidth * spacingX;
    const v2y = (p2.y - center.y) * imageHeight * spacingY;

    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  };

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 25,
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {/* Completed Rulers */}
      {rulers.map((r) => {
        const x1 = r.p1.x * 100;
        const y1 = r.p1.y * 100;
        const x2 = r.p2.x * 100;
        const y2 = r.p2.y * 100;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const distMm = calcDistMm(r.p1, r.p2);

        return (
          <g key={r.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
            <circle cx={x1} cy={y1} r="1.2" fill="#0284c7" stroke="#ffffff" strokeWidth="0.4" />
            <circle cx={x2} cy={y2} r="1.2" fill="#0284c7" stroke="#ffffff" strokeWidth="0.4" />
            {/* Readout badge */}
            <rect
              x={midX - 7}
              y={midY - 2.5}
              width="14"
              height="5"
              rx="1.5"
              fill="rgba(15, 23, 42, 0.85)"
              stroke="#38bdf8"
              strokeWidth="0.3"
            />
            <text
              x={midX}
              y={midY + 1}
              fill="#ffffff"
              fontSize="2.6"
              fontFamily="sans-serif"
              textAnchor="middle"
              fontWeight="bold"
            >
              {distMm.toFixed(1)} mm
            </text>
          </g>
        );
      })}

      {/* Active Ruler Draft */}
      {currentRulerDraft && currentRulerDraft.p2 && (
        <g>
          <line
            x1={currentRulerDraft.p1.x * 100}
            y1={currentRulerDraft.p1.y * 100}
            x2={currentRulerDraft.p2.x * 100}
            y2={currentRulerDraft.p2.y * 100}
            stroke="#f59e0b"
            strokeWidth="0.8"
            strokeDasharray="2,2"
          />
          <circle cx={currentRulerDraft.p1.x * 100} cy={currentRulerDraft.p1.y * 100} r="1.2" fill="#d97706" />
          <circle cx={currentRulerDraft.p2.x * 100} cy={currentRulerDraft.p2.y * 100} r="1.2" fill="#d97706" />
        </g>
      )}

      {/* Completed Angles */}
      {angles.map((a) => {
        const x1 = a.p1.x * 100;
        const y1 = a.p1.y * 100;
        const cx = a.center.x * 100;
        const cy = a.center.y * 100;
        const x2 = a.p2.x * 100;
        const y2 = a.p2.y * 100;
        const angleDeg = calcAngleDeg(a.p1, a.center, a.p2);

        return (
          <g key={a.id}>
            <line x1={cx} y1={cy} x2={x1} y2={y1} stroke="#ec4899" strokeWidth="0.8" />
            <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#ec4899" strokeWidth="0.8" />
            <circle cx={cx} cy={cy} r="1.4" fill="#db2777" stroke="#ffffff" strokeWidth="0.4" />
            <circle cx={x1} cy={y1} r="1.0" fill="#db2777" />
            <circle cx={x2} cy={y2} r="1.0" fill="#db2777" />
            {/* Readout badge */}
            <rect
              x={cx - 7}
              y={cy - 6.5}
              width="14"
              height="5"
              rx="1.5"
              fill="rgba(15, 23, 42, 0.85)"
              stroke="#ec4899"
              strokeWidth="0.3"
            />
            <text
              x={cx}
              y={cy - 3}
              fill="#ffffff"
              fontSize="2.6"
              fontFamily="sans-serif"
              textAnchor="middle"
              fontWeight="bold"
            >
              {angleDeg.toFixed(1)}°
            </text>
          </g>
        );
      })}
    </svg>
  );
}
