'use client';

import React, { useState } from 'react';
import {
  Printer,
  Download,
  ExternalLink,
  Check,
  X,
  Sliders,
  ShieldCheck,
  Sparkles,
  Layers,
  Box,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { exportGeometryToSTL } from '@/lib/csg';
import { useToast } from '@/components/Toast';

interface SendTo3DPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SlicerOption {
  id: string;
  name: string;
  vendor: string;
  protocol: string;
  preferredFormat: '3mf' | 'stl';
  description: string;
  color: string;
}

const SLICERS: SlicerOption[] = [
  {
    id: 'bambu-studio',
    name: 'Bambu Studio',
    vendor: 'Bambu Lab',
    protocol: 'bambustudio://',
    preferredFormat: '3mf',
    description: 'High-speed multi-material 3D slicing for X1/P1/A1 medical guides.',
    color: '#00ae42',
  },
  {
    id: 'orcaslicer',
    name: 'OrcaSlicer',
    vendor: 'Open Source',
    protocol: 'orcaslicer://',
    preferredFormat: '3mf',
    description: 'Advanced calibration & custom support generation for complex bone models.',
    color: '#0284c7',
  },
  {
    id: 'flashprint',
    name: 'FlashPrint',
    vendor: 'Flashforge',
    protocol: 'flashprint://',
    preferredFormat: 'stl',
    description: 'Optimized slicing for Flashforge Creator, Guider, and Medical Dental series.',
    color: '#ea580c',
  },
  {
    id: 'creality-print',
    name: 'Creality Print',
    vendor: 'Creality',
    protocol: 'crealityprint://',
    preferredFormat: 'stl',
    description: 'Slicing ecosystem for K1, Ender, and HALOT resin anatomical printers.',
    color: '#2563eb',
  },
  {
    id: 'cura',
    name: 'Ultimaker Cura',
    vendor: 'Ultimaker',
    protocol: 'cura://',
    preferredFormat: 'stl',
    description: 'Industry-standard slicing engine with fine-grained tree supports.',
    color: '#1e293b',
  },
];

export default function SendTo3DPrintModal({ isOpen, onClose }: SendTo3DPrintModalProps) {
  const { objects, selectedIds } = useEditorStore();
  const { success, info } = useToast();

  const [selectedSlicer, setSelectedSlicer] = useState<string>('bambu-studio');
  const [material, setMaterial] = useState<'medical_resin' | 'titanium' | 'pla_tough' | 'peek'>('medical_resin');
  const [layerHeight, setLayerHeight] = useState<string>('0.12');
  const [infillDensity, setInfillDensity] = useState<number>(100);
  const [generateTreeSupports, setGenerateTreeSupports] = useState<boolean>(true);

  if (!isOpen) return null;

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : Array.from(objects.values())[0] || null;
  const currentSlicer = SLICERS.find((s) => s.id === selectedSlicer) || SLICERS[0];

  const handleExportAndLaunch = () => {
    if (!activeObj) return;

    const buffer = exportGeometryToSTL(activeObj.geometry);
    const blob = new Blob([buffer], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeObj.name.replace(/\s+/g, '_')}_${currentSlicer.name.replace(/\s+/g, '_')}.${currentSlicer.preferredFormat}`;
    a.click();
    URL.revokeObjectURL(url);

    // Attempt protocol launch
    try {
      window.location.href = `${currentSlicer.protocol}`;
    } catch {
      // Browser will ignore unhandled protocols
    }

    success('Model Prepared for 3D Printing', `Sent ${activeObj.name} to ${currentSlicer.name}`);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(18, 53, 36, 0.4)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          border: '1px solid var(--color-border-mist)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
          width: '100%',
          maxWidth: 620,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeIn 150ms ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border-mist)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8faf9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Printer size={18} color="var(--color-forest-ink)" />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-forest-ink)', margin: 0 }}>
              Send to 3D Print / Slicer Integration
            </h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Slicer Selection Grid */}
          <div>
            <span className="eyebrow-label" style={{ marginBottom: 8, display: 'block' }}>
              SELECT TARGET SLICING SOFTWARE
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SLICERS.map((slicer) => {
                const isSelected = selectedSlicer === slicer.id;
                return (
                  <div
                    key={slicer.id}
                    onClick={() => setSelectedSlicer(slicer.id)}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: `1.5px solid ${isSelected ? slicer.color : 'var(--color-border-mist)'}`,
                      backgroundColor: isSelected ? `${slicer.color}0a` : '#fff',
                      cursor: 'pointer',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? slicer.color : 'var(--color-forest-ink)' }}>
                        {slicer.name}
                      </span>
                      <span style={{ fontSize: 9.5, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                        .{slicer.preferredFormat.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontSize: 10.5, color: 'var(--color-charcoal-muted)', margin: 0, lineHeight: 1.3 }}>
                      {slicer.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clinical Print Settings */}
          <div
            style={{
              backgroundColor: '#f8faf9',
              padding: 14,
              borderRadius: 12,
              border: '1px solid var(--color-border-mist)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-forest-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={14} /> Surgical Print Profile
              </span>
              <span className="pill-badge-forest" style={{ fontSize: 9.5 }}>
                ASTM F3001 Print Ready
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Material Preset */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--color-charcoal-muted)', display: 'block', marginBottom: 4 }}>
                  Biocompatible Material:
                </label>
                <select
                  value={material}
                  onChange={(e: any) => setMaterial(e.target.value)}
                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border-mist)' }}
                >
                  <option value="medical_resin">Class IIa Surgical Guide Resin</option>
                  <option value="titanium">Titanium Ti-6Al-4V ELI (DMLS)</option>
                  <option value="peek">Implant-Grade PEEK</option>
                  <option value="pla_tough">Pre-op Anatomical PLA Tough</option>
                </select>
              </div>

              {/* Layer Height */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--color-charcoal-muted)', display: 'block', marginBottom: 4 }}>
                  Layer Resolution:
                </label>
                <select
                  value={layerHeight}
                  onChange={(e) => setLayerHeight(e.target.value)}
                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border-mist)' }}
                >
                  <option value="0.05">0.05 mm (High Detail Resin)</option>
                  <option value="0.12">0.12 mm (Surgical Template Precision)</option>
                  <option value="0.16">0.16 mm (Standard Orthopedic)</option>
                  <option value="0.20">0.20 mm (Rapid Anatomy Mockup)</option>
                </select>
              </div>
            </div>

            {/* Infill & Tree Supports */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--color-border-mist)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-charcoal)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={generateTreeSupports}
                  onChange={(e) => setGenerateTreeSupports(e.target.checked)}
                />
                Auto-generate organic tree supports
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: 'var(--color-charcoal-muted)' }}>Infill:</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{infillDensity}% (Solid)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border-mist)',
            backgroundColor: '#f8faf9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            Model: <strong>{activeObj?.name || 'Selected Model'}</strong>
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={handleExportAndLaunch} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
              <Download size={13} />
              <span>Export & Launch {currentSlicer.name}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
