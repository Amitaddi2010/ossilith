'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Grid2X2,
  Maximize2,
  Box,
  Hand,
  Sliders,
  Crosshair,
  Zap,
  Layers,
  Split,
  Square,
  Pen,
  Lasso,
  Eraser,
  Ruler,
  Activity,
  Sparkles,
  Scissors,
  HelpCircle,
  Undo2,
  Redo2,
  Download,
  ShieldCheck,
  Cpu,
  Brain,
  SlidersHorizontal,
  FileDown,
  Printer,
  Binary,
  Check,
  RotateCcw,
} from 'lucide-react';

export type RibbonTab = 'interactive' | 'view' | 'autoseg' | 'measure' | 'export' | 'license';

export type SegTool =
  | 'region_grow'
  | 'point'
  | 'island'
  | 'split_mask'
  | 'bbox'
  | 'pan'
  | 'scribble'
  | 'lasso'
  | 'eraser'
  | 'ruler'
  | 'angle';

export type ViewMode = 'quad' | 'axial' | 'coronal' | 'sagittal' | '3d';
export type WindowPreset = 'default' | 'bone' | 'soft_tissue' | 'lung' | 'custom';

interface RibbonMenuProps {
  caseId: string;
  caseTitle?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeTool: SegTool;
  onToolSelect: (tool: SegTool) => void;
  includeMode: boolean;
  onToggleIncludeMode: () => void;
  windowPreset: WindowPreset;
  onWindowPresetChange: (preset: WindowPreset, ww: number | null, wl: number | null) => void;
  showCrosshairs: boolean;
  onToggleCrosshairs: () => void;
  onOpenAutoSegModal: () => void;
  isAutoSegmenting: boolean;
  autoSegProgress: number;
  onGenerateSTL: () => void;
  onGenerateAllSTLs: () => void;
  isGeneratingSTL: boolean;
  layerCount: number;
  activeLayerName?: string;
  onOpenShortcuts: () => void;
  onOpenThresholdModal: () => void;
  onOpenMorphologyModal: () => void;
  onOpenSplitMaskModal: () => void;
  onClearMeasurements: () => void;
  measurementCount: number;
  isSimulatedMode: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export default function RibbonMenu({
  caseId,
  caseTitle,
  viewMode,
  onViewModeChange,
  activeTool,
  onToolSelect,
  includeMode,
  onToggleIncludeMode,
  windowPreset,
  onWindowPresetChange,
  showCrosshairs,
  onToggleCrosshairs,
  onOpenAutoSegModal,
  isAutoSegmenting,
  autoSegProgress,
  onGenerateSTL,
  onGenerateAllSTLs,
  isGeneratingSTL,
  layerCount,
  activeLayerName,
  onOpenShortcuts,
  onOpenThresholdModal,
  onOpenMorphologyModal,
  onOpenSplitMaskModal,
  onClearMeasurements,
  measurementCount,
  isSimulatedMode,
  onUndo,
  onRedo,
}: RibbonMenuProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RibbonTab>('interactive');

  const TABS: { id: RibbonTab; label: string; icon: any; badge?: string }[] = [
    { id: 'interactive', label: 'Interactive CAD', icon: Zap },
    { id: 'view', label: 'View & Windowing', icon: Grid2X2 },
    { id: 'autoseg', label: 'AI Auto-Seg', icon: Sparkles, badge: 'AI' },
    { id: 'measure', label: 'Measurements', icon: Ruler, badge: measurementCount > 0 ? `${measurementCount}` : undefined },
    { id: 'export', label: '3D Export & Print', icon: Download },
    { id: 'license', label: 'System & License', icon: ShieldCheck },
  ];

  return (
    <header
      style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #ded8cb',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 30,
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        flexShrink: 0,
      }}
    >
      {/* ── Level 1: App Header Bar (36px) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 36,
          backgroundColor: '#faf8f5',
          borderBottom: '1px solid #e8e4db',
        }}
      >
        {/* Left: Return, Case Title & Stage */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => router.push('/cases')}
            title="Return to Cases Dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#fff',
              border: '1px solid #d8d2c4',
              borderRadius: 4,
              padding: '2px 8px',
              color: '#0f3e17',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              height: 24,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e1f4df')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
          >
            <ArrowLeft size={12} color="#0f3e17" />
            <span>Cases</span>
          </button>

          <div style={{ height: 14, width: 1, backgroundColor: '#ded8cb' }} />

          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f3e17', letterSpacing: '-0.01em' }}>
            {caseTitle || `Case #${caseId.slice(0, 8)}`}
          </span>

          <span
            style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 8,
              backgroundColor: '#e1f4df',
              color: '#0f3e17',
              fontWeight: 700,
              border: '1px solid #b1dbb8',
            }}
          >
            Stage 3: CAD
          </span>
        </div>

        {/* Center: Tabs Switcher */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 12px',
                  height: '100%',
                  fontSize: 11.5,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#0f3e17' : '#556b5a',
                  backgroundColor: isActive ? '#fff' : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2.5px solid #10b981' : '2.5px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
              >
                <Icon size={13} color={isActive ? '#10b981' : '#6b7c6e'} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: 8.5,
                      padding: '0 5px',
                      borderRadius: 4,
                      backgroundColor: isActive ? '#10b981' : '#e1f4df',
                      color: isActive ? '#fff' : '#0f3e17',
                      fontWeight: 700,
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Heuristic/Neural Status & Shortcuts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 4,
              backgroundColor: isSimulatedMode ? '#fef3c7' : '#ecfdf5',
              border: `1px solid ${isSimulatedMode ? '#fde68a' : '#a7f3d0'}`,
              color: isSimulatedMode ? '#92400e' : '#065f46',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: isSimulatedMode ? '#d97706' : '#10b981',
              }}
            />
            <span>{isSimulatedMode ? 'Heuristic Mode' : 'GPU Neural'}</span>
          </div>

          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (?)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              backgroundColor: '#fff',
              border: '1px solid #d8d2c4',
              borderRadius: 4,
              padding: '2px 6px',
              color: '#0f3e17',
              fontSize: 10.5,
              cursor: 'pointer',
              height: 24,
            }}
          >
            <HelpCircle size={12} color="#0f3e17" />
            <span>Keys (?)</span>
          </button>
        </div>
      </div>

      {/* ── Level 2: Precision Toolbar Deck (54px - Generous Non-Overlapping Layout) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          padding: '4px 8px',
          backgroundColor: '#fff',
          height: 54,
          overflowX: 'auto',
          gap: 2,
        }}
      >
        {/* ========================================================= */}
        {/* TAB 1: INTERACTIVE CAD                                    */}
        {/* ========================================================= */}
        {activeTab === 'interactive' && (
          <>
            <ToolbarGroup label="Primary Seed & Grow">
              <ToolItem
                icon={Zap}
                label="3D Region Grow"
                hotkey="G"
                active={activeTool === 'region_grow'}
                onClick={() => onToolSelect('region_grow')}
                highlight
              />
              <ToolItem
                icon={Crosshair}
                label="Point Click"
                hotkey="P"
                active={activeTool === 'point'}
                onClick={() => onToolSelect('point')}
              />
            </ToolbarGroup>

            <ToolbarGroup label="Target Polarity">
              <button
                onClick={() => { if (!includeMode) onToggleIncludeMode(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                  borderRadius: 4,
                  backgroundColor: includeMode ? '#e1f4df' : '#fff',
                  border: `1px solid ${includeMode ? '#10b981' : '#d8d2c4'}`,
                  color: includeMode ? '#0f3e17' : '#556b5a',
                  fontSize: 11,
                  fontWeight: includeMode ? 700 : 500,
                  cursor: 'pointer',
                  height: 28,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: '#10b981' }}>+</span>
                <span>Target</span>
              </button>

              <button
                onClick={() => { if (includeMode) onToggleIncludeMode(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                  borderRadius: 4,
                  backgroundColor: !includeMode ? '#fee2e2' : '#fff',
                  border: `1px solid ${!includeMode ? '#ef4444' : '#d8d2c4'}`,
                  color: !includeMode ? '#991b1b' : '#556b5a',
                  fontSize: 11,
                  fontWeight: !includeMode ? 700 : 500,
                  cursor: 'pointer',
                  height: 28,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: '#ef4444' }}>−</span>
                <span>Background</span>
              </button>
            </ToolbarGroup>

            <ToolbarGroup label="Manual Drawing Tools">
              <ToolItem
                icon={Pen}
                label="Brush"
                hotkey="S"
                active={activeTool === 'scribble'}
                onClick={() => onToolSelect('scribble')}
              />
              <ToolItem
                icon={Lasso}
                label="Lasso"
                hotkey="L"
                active={activeTool === 'lasso'}
                onClick={() => onToolSelect('lasso')}
              />
              <ToolItem
                icon={Square}
                label="BBox"
                hotkey="B"
                active={activeTool === 'bbox'}
                onClick={() => onToolSelect('bbox')}
              />
              <ToolItem
                icon={Eraser}
                label="Eraser"
                hotkey="E"
                active={activeTool === 'eraser'}
                onClick={() => onToolSelect('eraser')}
              />
            </ToolbarGroup>

            <ToolbarGroup label="Topology & Surgical Filters">
              <ToolItem
                icon={Layers}
                label="Island Filter"
                hotkey="I"
                active={activeTool === 'island'}
                onClick={() => onToolSelect('island')}
              />
              <ToolItem
                icon={Split}
                label="Split Mask"
                hotkey="X"
                active={activeTool === 'split_mask'}
                onClick={onOpenSplitMaskModal}
              />
              <ToolItem
                icon={Scissors}
                label="Morphology"
                onClick={onOpenMorphologyModal}
              />
            </ToolbarGroup>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: VIEW & WINDOWING                                   */}
        {/* ========================================================= */}
        {activeTab === 'view' && (
          <>
            <ToolbarGroup label="Viewport Layout">
              <ToolItem
                icon={Grid2X2}
                label="2×2 Quad"
                active={viewMode === 'quad'}
                onClick={() => onViewModeChange('quad')}
                highlight
              />
              <ToolItem
                label="Axial (Z)"
                active={viewMode === 'axial'}
                onClick={() => onViewModeChange('axial')}
              />
              <ToolItem
                label="Coronal (Y)"
                active={viewMode === 'coronal'}
                onClick={() => onViewModeChange('coronal')}
              />
              <ToolItem
                label="Sagittal (X)"
                active={viewMode === 'sagittal'}
                onClick={() => onViewModeChange('sagittal')}
              />
              <ToolItem
                icon={Box}
                label="3D View"
                active={viewMode === '3d'}
                onClick={() => onViewModeChange('3d')}
              />
            </ToolbarGroup>

            <ToolbarGroup label="Navigation & Guides">
              <ToolItem
                icon={Hand}
                label="Pan / Zoom"
                hotkey="H"
                active={activeTool === 'pan'}
                onClick={() => onToolSelect('pan')}
              />
              <ToolItem
                icon={Crosshair}
                label="Crosshairs"
                active={showCrosshairs}
                onClick={onToggleCrosshairs}
              />
            </ToolbarGroup>

            <ToolbarGroup label="Window Presets">
              <ToolItem
                label="Bone CT"
                active={windowPreset === 'bone'}
                onClick={() => onWindowPresetChange('bone', 2000, 400)}
              />
              <ToolItem
                label="Soft Tissue"
                active={windowPreset === 'soft_tissue'}
                onClick={() => onWindowPresetChange('soft_tissue', 400, 50)}
              />
              <ToolItem
                label="Lung CT"
                active={windowPreset === 'lung'}
                onClick={() => onWindowPresetChange('lung', 1500, -600)}
              />
              <ToolItem
                label="Auto Dynamic"
                active={windowPreset === 'default'}
                onClick={() => onWindowPresetChange('default', null, null)}
              />
            </ToolbarGroup>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 3: AI AUTO-SEGMENTATION                               */}
        {/* ========================================================= */}
        {activeTab === 'autoseg' && (
          <>
            <ToolbarGroup label="AI Inference Engine">
              <ToolItem
                icon={Sparkles}
                label="Launch AI Auto-Seg"
                onClick={onOpenAutoSegModal}
                highlight
              />
            </ToolbarGroup>

            <ToolbarGroup label="Target Presets">
              <ToolItem
                icon={Brain}
                label="Full Skeleton"
                onClick={onOpenAutoSegModal}
              />
              <ToolItem
                icon={Layers}
                label="Extremities (Limbs)"
                onClick={onOpenAutoSegModal}
              />
              <ToolItem
                icon={Box}
                label="Spine & Pelvis"
                onClick={onOpenAutoSegModal}
              />
            </ToolbarGroup>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 4: MEASUREMENTS                                       */}
        {/* ========================================================= */}
        {activeTab === 'measure' && (
          <>
            <ToolbarGroup label="Clinical Calibrated Tools">
              <ToolItem
                icon={Ruler}
                label="Calibrated Ruler (mm)"
                hotkey="M"
                active={activeTool === 'ruler'}
                onClick={() => onToolSelect('ruler')}
                highlight
              />
              <ToolItem
                icon={Activity}
                label="Cobb Angle"
                hotkey="N"
                active={activeTool === 'angle'}
                onClick={() => onToolSelect('angle')}
              />
            </ToolbarGroup>

            <ToolbarGroup label="Active Annotations">
              <button
                onClick={onClearMeasurements}
                disabled={measurementCount === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  backgroundColor: measurementCount > 0 ? '#fee2e2' : '#f7f5ef',
                  border: `1px solid ${measurementCount > 0 ? '#fca5a5' : '#ded8cb'}`,
                  color: measurementCount > 0 ? '#991b1b' : '#94a3b8',
                  cursor: measurementCount > 0 ? 'pointer' : 'default',
                  height: 28,
                  fontWeight: 600,
                }}
              >
                <span>Clear All ({measurementCount})</span>
              </button>
            </ToolbarGroup>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 5: 3D EXPORT & PRINT                                  */}
        {/* ========================================================= */}
        {activeTab === 'export' && (
          <>
            <ToolbarGroup label="CAD Generation">
              <ToolItem
                icon={Download}
                label={layerCount > 1 ? `Generate All STLs (${layerCount})` : 'Generate Active STL'}
                onClick={layerCount > 1 ? onGenerateAllSTLs : onGenerateSTL}
                disabled={isGeneratingSTL}
                highlight
              />
            </ToolbarGroup>

            <ToolbarGroup label="Export Formats">
              <ToolItem
                icon={FileDown}
                label="Binary STL"
                onClick={onGenerateSTL}
              />
              <ToolItem
                icon={Printer}
                label="3MF Print Package"
                onClick={onGenerateSTL}
              />
              <ToolItem
                icon={Binary}
                label="DICOM RT-Struct"
                onClick={onGenerateSTL}
              />
            </ToolbarGroup>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 6: SYSTEM & LICENSE                                   */}
        {/* ========================================================= */}
        {activeTab === 'license' && (
          <>
            <ToolbarGroup label="Administration">
              <ToolItem
                icon={ShieldCheck}
                label="Master Admin Portal"
                onClick={() => router.push('/admin/licenses')}
                highlight
              />
            </ToolbarGroup>

            <ToolbarGroup label="Documentation">
              <ToolItem
                icon={HelpCircle}
                label="Shortcuts Guide (?)"
                onClick={onOpenShortcuts}
              />
            </ToolbarGroup>
          </>
        )}
      </div>
    </header>
  );
}

/* ── Clean Toolbar Group (No absolute overlap!) ── */

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        borderRight: '1px solid #e8e4db',
        height: '100%',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
        {children}
      </div>
      <span
        style={{
          fontSize: 9,
          color: '#6b7c6e',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 700,
          lineHeight: 1,
          paddingBottom: 2,
        }}
      >
        {label}
      </span>
    </div>
  );
}

interface ToolItemProps {
  icon?: any;
  label: string;
  hotkey?: string;
  active?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}

function ToolItem({
  icon: Icon,
  label,
  hotkey,
  active,
  disabled,
  highlight,
  onClick,
}: ToolItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '0 8px',
        height: 28,
        borderRadius: 4,
        backgroundColor: active
          ? '#e1f4df'
          : highlight
            ? '#ecfdf5'
            : '#fff',
        border: `1px solid ${
          active
            ? '#10b981'
            : highlight
              ? '#10b981'
              : '#d8d2c4'
        }`,
        color: active ? '#0f3e17' : highlight ? '#065f46' : '#222222',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        transition: 'all 0.1s ease',
        whiteSpace: 'nowrap',
        boxShadow: highlight ? '0 1px 3px rgba(16,185,129,0.12)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!active && !highlight) e.currentTarget.style.backgroundColor = '#f7f5ef';
      }}
      onMouseLeave={(e) => {
        if (!active && !highlight) e.currentTarget.style.backgroundColor = '#fff';
      }}
    >
      {Icon && <Icon size={13} color={active ? '#0f3e17' : highlight ? '#10b981' : '#556b5a'} />}
      <span>{label}</span>
      {hotkey && (
        <span
          style={{
            fontSize: 8.5,
            fontFamily: 'var(--font-mono, monospace)',
            color: active ? '#0f3e17' : '#6b7c6e',
            fontWeight: 700,
            backgroundColor: active ? 'rgba(16,185,129,0.2)' : '#f0ece2',
            padding: '1px 4px',
            borderRadius: 2,
            marginLeft: 2,
          }}
        >
          {hotkey}
        </span>
      )}
    </button>
  );
}
