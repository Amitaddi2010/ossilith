'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Grid2X2,
  Maximize2,
  Box,
  Hand,
  ZoomIn,
  ZoomOut,
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
  ChevronDown,
  FileDown,
  Printer,
  CheckCircle2,
  RefreshCw,
  Eye,
  Settings,
  Flame,
  Binary,
} from 'lucide-react';

export type RibbonTab =
  | 'view'
  | 'autoseg'
  | 'interactive'
  | 'measure'
  | 'export'
  | 'license';

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const TABS: { id: RibbonTab; label: string; icon: any; badge?: string }[] = [
    { id: 'view', label: 'View & Layout', icon: Grid2X2 },
    { id: 'interactive', label: 'Interactive CAD', icon: Zap, badge: 'Core' },
    { id: 'autoseg', label: 'AI Auto-Seg', icon: Sparkles, badge: 'AI' },
    { id: 'measure', label: 'Measure & HU', icon: Ruler },
    { id: 'export', label: '3D Export & Print', icon: Download },
    { id: 'license', label: 'License & System', icon: ShieldCheck },
  ];

  return (
    <div
      style={{
        backgroundColor: '#0c0e12',
        borderBottom: '1px solid #1e2430',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 30,
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
      }}
    >
      {/* ── Level 1: Top Quick Access & Ribbon Navigation Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          height: 34,
          backgroundColor: '#07090c',
          borderBottom: '1px solid #181d26',
        }}
      >
        {/* Left: Back & Case Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => router.push('/cases')}
            title="Return to Patient Cases"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: '#151922',
              border: '1px solid #242c38',
              borderRadius: 4,
              padding: '2px 8px',
              color: '#94a3b8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              height: 24,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <ArrowLeft size={13} />
            <span>Cases</span>
          </button>

          <div style={{ height: 14, width: 1, backgroundColor: '#242c38' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              {caseTitle || 'CT Volumetric Reconstruction'}
            </span>
            <span
              style={{
                fontSize: 9.5,
                padding: '1px 6px',
                borderRadius: 10,
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontWeight: 700,
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              Stage 3: CAD
            </span>
          </div>
        </div>

        {/* Center: Ribbon Primary Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (isCollapsed) setIsCollapsed(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 12px',
                  height: '100%',
                  fontSize: 11.5,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  backgroundColor: isActive ? '#0f131a' : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#e2e8f0';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#94a3b8';
                }}
              >
                <Icon size={13} color={isActive ? '#38bdf8' : '#64748b'} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: 8.5,
                      padding: '0 4px',
                      borderRadius: 3,
                      backgroundColor: isActive ? 'rgba(56,189,248,0.2)' : 'rgba(100,116,139,0.2)',
                      color: isActive ? '#38bdf8' : '#94a3b8',
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

        {/* Right: Quick Tools & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Neural / Fallback Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10.5,
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: isSimulatedMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              border: `1px solid ${isSimulatedMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              color: isSimulatedMode ? '#fca5a5' : '#86efac',
              fontWeight: 600,
            }}
          >
            <Cpu size={11} />
            <span>{isSimulatedMode ? 'Heuristic' : 'GPU Neural'}</span>
          </div>

          <div style={{ height: 14, width: 1, backgroundColor: '#242c38' }} />

          {/* Shortcuts Modal Button */}
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (?)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#151922',
              border: '1px solid #242c38',
              borderRadius: 4,
              padding: '2px 7px',
              color: '#94a3b8',
              fontSize: 11,
              cursor: 'pointer',
              height: 24,
            }}
          >
            <HelpCircle size={12} />
            <span>Keys (?)</span>
          </button>
        </div>
      </div>

      {/* ── Level 2: Ribbon Toolbar Sections Deck ── */}
      {!isCollapsed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            padding: '4px 8px 3px',
            backgroundColor: '#0f131a',
            minHeight: 74,
            overflowX: 'auto',
            gap: 4,
          }}
        >
          {/* ========================================================= */}
          {/* TAB 1: VIEW & LAYOUT                                      */}
          {/* ========================================================= */}
          {activeTab === 'view' && (
            <>
              {/* Section: Viewport Layouts */}
              <RibbonSection label="Viewport Layout">
                <RibbonButton
                  icon={Grid2X2}
                  label="2x2 Quad MPR"
                  sub="Axial/Cor/Sag/3D"
                  active={viewMode === 'quad'}
                  onClick={() => onViewModeChange('quad')}
                  large
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3 }}>
                  <RibbonButton
                    label="Axial (Z)"
                    active={viewMode === 'axial'}
                    onClick={() => onViewModeChange('axial')}
                    small
                  />
                  <RibbonButton
                    label="Coronal (Y)"
                    active={viewMode === 'coronal'}
                    onClick={() => onViewModeChange('coronal')}
                    small
                  />
                  <RibbonButton
                    label="Sagittal (X)"
                    active={viewMode === 'sagittal'}
                    onClick={() => onViewModeChange('sagittal')}
                    small
                  />
                  <RibbonButton
                    label="3D Bone"
                    active={viewMode === '3d'}
                    onClick={() => onViewModeChange('3d')}
                    small
                  />
                </div>
              </RibbonSection>

              {/* Section: Navigation & Crosshairs */}
              <RibbonSection label="Navigation & Crosshairs">
                <RibbonButton
                  icon={Hand}
                  label="Pan / Zoom"
                  hotkey="H"
                  active={activeTool === 'pan'}
                  onClick={() => onToolSelect('pan')}
                />
                <RibbonButton
                  icon={Crosshair}
                  label="Crosshairs"
                  sub={showCrosshairs ? 'Synchronized' : 'Hidden'}
                  active={showCrosshairs}
                  onClick={onToggleCrosshairs}
                />
              </RibbonSection>

              {/* Section: CT Windowing Presets */}
              <RibbonSection label="CT Windowing Presets">
                <RibbonButton
                  label="Bone CT"
                  sub="W2000 / L400"
                  active={windowPreset === 'bone'}
                  onClick={() => onWindowPresetChange('bone', 2000, 400)}
                />
                <RibbonButton
                  label="Soft Tissue"
                  sub="W400 / L50"
                  active={windowPreset === 'soft_tissue'}
                  onClick={() => onWindowPresetChange('soft_tissue', 400, 50)}
                />
                <RibbonButton
                  label="Lung CT"
                  sub="W1500 / L-600"
                  active={windowPreset === 'lung'}
                  onClick={() => onWindowPresetChange('lung', 1500, -600)}
                />
                <RibbonButton
                  label="Auto CT"
                  sub="Full Dynamic"
                  active={windowPreset === 'default'}
                  onClick={() => onWindowPresetChange('default', null, null)}
                />
              </RibbonSection>
            </>
          )}

          {/* ========================================================= */}
          {/* TAB 2: INTERACTIVE CAD                                    */}
          {/* ========================================================= */}
          {activeTab === 'interactive' && (
            <>
              {/* Section: 3D Region Grow & Point Seed */}
              <RibbonSection label="Primary Seed & Grow">
                <RibbonButton
                  icon={Zap}
                  label="3D Region Grow"
                  sub="HU Threshold Spread"
                  hotkey="G"
                  active={activeTool === 'region_grow'}
                  onClick={() => onToolSelect('region_grow')}
                  large
                  highlight
                />
                <RibbonButton
                  icon={Crosshair}
                  label="Point Seed"
                  sub="MITK Click Mode"
                  hotkey="P"
                  active={activeTool === 'point'}
                  onClick={() => onToolSelect('point')}
                />
              </RibbonSection>

              {/* Section: Target vs Background Mode */}
              <RibbonSection label="Target Polarity">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 105 }}>
                  <button
                    onClick={() => { if (!includeMode) onToggleIncludeMode(); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 4,
                      backgroundColor: includeMode ? 'rgba(34, 197, 94, 0.2)' : '#151922',
                      border: `1px solid ${includeMode ? '#22c55e' : '#242c38'}`,
                      color: includeMode ? '#86efac' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 900 }}>+</span>
                    <span>Target Bone</span>
                  </button>

                  <button
                    onClick={() => { if (includeMode) onToggleIncludeMode(); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 4,
                      backgroundColor: !includeMode ? 'rgba(239, 68, 68, 0.2)' : '#151922',
                      border: `1px solid ${!includeMode ? '#ef4444' : '#242c38'}`,
                      color: !includeMode ? '#fca5a5' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 900 }}>−</span>
                    <span>Background</span>
                  </button>
                </div>
              </RibbonSection>

              {/* Section: Manual Drawing Tools */}
              <RibbonSection label="Manual Brush & Lasso">
                <RibbonButton
                  icon={Pen}
                  label="Scribble Brush"
                  hotkey="S"
                  active={activeTool === 'scribble'}
                  onClick={() => onToolSelect('scribble')}
                />
                <RibbonButton
                  icon={Lasso}
                  label="Lasso Polygon"
                  hotkey="L"
                  active={activeTool === 'lasso'}
                  onClick={() => onToolSelect('lasso')}
                />
                <RibbonButton
                  icon={Square}
                  label="Bounding Box"
                  hotkey="B"
                  active={activeTool === 'bbox'}
                  onClick={() => onToolSelect('bbox')}
                />
                <RibbonButton
                  icon={Eraser}
                  label="Eraser Tool"
                  hotkey="E"
                  active={activeTool === 'eraser'}
                  onClick={() => onToolSelect('eraser')}
                />
              </RibbonSection>

              {/* Section: Topology & Surgical Cleanup */}
              <RibbonSection label="Topology & Surgical Filters">
                <RibbonButton
                  icon={Layers}
                  label="Island Filter"
                  sub="Isolate Main Bone"
                  hotkey="I"
                  active={activeTool === 'island'}
                  onClick={() => onToolSelect('island')}
                />
                <RibbonButton
                  icon={Split}
                  label="Split Mask"
                  sub="Multi-Body Island"
                  hotkey="X"
                  onClick={onOpenSplitMaskModal}
                />
                <RibbonButton
                  icon={SlidersHorizontal}
                  label="HU Threshold"
                  sub="Direct Intensity"
                  onClick={onOpenThresholdModal}
                />
                <RibbonButton
                  icon={Scissors}
                  label="Morphology"
                  sub="Dilate / Erode"
                  onClick={onOpenMorphologyModal}
                />
              </RibbonSection>
            </>
          )}

          {/* ========================================================= */}
          {/* TAB 3: AI AUTO-SEGMENTATION                               */}
          {/* ========================================================= */}
          {activeTab === 'autoseg' && (
            <>
              {/* Section: Neural Inference Engine */}
              <RibbonSection label="Neural Inference Engine">
                <RibbonButton
                  icon={Sparkles}
                  label="Launch Auto-Seg"
                  sub="TotalSegmentator & MONAI"
                  onClick={onOpenAutoSegModal}
                  large
                  highlight
                />
              </RibbonSection>

              {/* Section: Presets Quick Select */}
              <RibbonSection label="Pre-trained Anatomical Presets">
                <RibbonButton
                  icon={Brain}
                  label="Unified Skeleton"
                  sub="Primary Bone Target"
                  onClick={onOpenAutoSegModal}
                />
                <RibbonButton
                  icon={Layers}
                  label="Extremity Bones"
                  sub="Femur / Tibia / Arm"
                  onClick={onOpenAutoSegModal}
                />
                <RibbonButton
                  icon={Box}
                  label="Spine & Pelvis"
                  sub="Vertebrae / Pelvic"
                  onClick={onOpenAutoSegModal}
                />
              </RibbonSection>
            </>
          )}

          {/* ========================================================= */}
          {/* TAB 4: MEASURE & HU                                       */}
          {/* ========================================================= */}
          {activeTab === 'measure' && (
            <>
              {/* Section: Calibrated Instruments */}
              <RibbonSection label="Calibrated Clinical Tools">
                <RibbonButton
                  icon={Ruler}
                  label="Calibrated Ruler"
                  sub="Millimeter Precision"
                  hotkey="M"
                  active={activeTool === 'ruler'}
                  onClick={() => onToolSelect('ruler')}
                  large
                />
                <RibbonButton
                  icon={Activity}
                  label="Cobb Angle"
                  sub="Spine & Joint Angles"
                  hotkey="N"
                  active={activeTool === 'angle'}
                  onClick={() => onToolSelect('angle')}
                  large
                />
              </RibbonSection>

              {/* Section: Measurement Manager */}
              <RibbonSection label="Active Measurements">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Active: <strong style={{ color: '#38bdf8' }}>{measurementCount}</strong> measurements
                  </div>
                  <button
                    onClick={onClearMeasurements}
                    disabled={measurementCount === 0}
                    style={{
                      padding: '3px 8px',
                      fontSize: 10.5,
                      borderRadius: 4,
                      backgroundColor: measurementCount > 0 ? '#1e2430' : '#151922',
                      border: '1px solid #2d3748',
                      color: measurementCount > 0 ? '#fca5a5' : '#64748b',
                      cursor: measurementCount > 0 ? 'pointer' : 'default',
                    }}
                  >
                    Clear All Overlays
                  </button>
                </div>
              </RibbonSection>
            </>
          )}

          {/* ========================================================= */}
          {/* TAB 5: 3D EXPORT & PRINT                                  */}
          {/* ========================================================= */}
          {activeTab === 'export' && (
            <>
              {/* Section: Mesh Generation */}
              <RibbonSection label="CAD Mesh Generation">
                <RibbonButton
                  icon={Download}
                  label={layerCount > 1 ? `Generate All STLs (${layerCount})` : 'Generate Active STL'}
                  sub={layerCount > 1 ? 'Multi-Body Batch' : (activeLayerName || 'Active Layer')}
                  onClick={layerCount > 1 ? onGenerateAllSTLs : onGenerateSTL}
                  disabled={isGeneratingSTL}
                  large
                  highlight
                />
              </RibbonSection>

              {/* Section: Formats */}
              <RibbonSection label="Export Formats & 3D Print">
                <RibbonButton
                  icon={FileDown}
                  label="Binary STL"
                  sub="Medical Standard"
                  onClick={onGenerateSTL}
                />
                <RibbonButton
                  icon={Printer}
                  label="3MF Print Package"
                  sub="Multi-Color CAD"
                  onClick={onGenerateSTL}
                />
                <RibbonButton
                  icon={Binary}
                  label="DICOM RT-Struct"
                  sub="PACS Export"
                  onClick={onGenerateSTL}
                />
              </RibbonSection>
            </>
          )}

          {/* ========================================================= */}
          {/* TAB 6: LICENSE & SYSTEM                                   */}
          {/* ========================================================= */}
          {activeTab === 'license' && (
            <>
              {/* Section: Clinical Licensing */}
              <RibbonSection label="Licensing & Master Admin">
                <RibbonButton
                  icon={ShieldCheck}
                  label="Master Admin Portal"
                  sub="amit.addi2010@gmail.com"
                  onClick={() => router.push('/admin/licenses')}
                  highlight
                />
              </RibbonSection>

              {/* Section: Shortcuts & Reference */}
              <RibbonSection label="Help & Documentation">
                <RibbonButton
                  icon={HelpCircle}
                  label="Shortcuts Guide"
                  sub="Complete Keybindings"
                  onClick={onOpenShortcuts}
                />
              </RibbonSection>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Ribbon Sub-components: Section & Button ── */

function RibbonSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 6px',
        borderRight: '1px solid #1c222c',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: 2,
          paddingTop: 2,
          borderTop: '1px solid #181e28',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {label}
      </div>
    </div>
  );
}

interface RibbonButtonProps {
  icon?: any;
  label: string;
  sub?: string;
  hotkey?: string;
  active?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  large?: boolean;
  small?: boolean;
  onClick?: () => void;
}

function RibbonButton({
  icon: Icon,
  label,
  sub,
  hotkey,
  active,
  disabled,
  highlight,
  large,
  small,
  onClick,
}: RibbonButtonProps) {
  if (small) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: '2px 8px',
          fontSize: 10.5,
          fontWeight: active ? 700 : 500,
          borderRadius: 3,
          backgroundColor: active ? 'rgba(56, 189, 248, 0.2)' : '#151922',
          border: `1px solid ${active ? '#38bdf8' : '#242c38'}`,
          color: active ? '#38bdf8' : '#cbd5e1',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          transition: 'all 0.1s ease',
        }}
      >
        {label}
      </button>
    );
  }

  if (large) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 12px',
          minWidth: 80,
          borderRadius: 5,
          backgroundColor: active
            ? 'rgba(56, 189, 248, 0.2)'
            : highlight
              ? 'rgba(16, 185, 129, 0.15)'
              : '#141820',
          border: `1px solid ${
            active
              ? '#38bdf8'
              : highlight
                ? '#10b981'
                : '#242c38'
          }`,
          color: active ? '#38bdf8' : highlight ? '#86efac' : '#e2e8f0',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          gap: 2,
          transition: 'all 0.15s ease',
        }}
      >
        {Icon && <Icon size={18} color={active ? '#38bdf8' : highlight ? '#34d399' : '#94a3b8'} />}
        <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
        {sub && <span style={{ fontSize: 9, color: '#64748b', textAlign: 'center' }}>{sub}</span>}
        {hotkey && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 3,
              fontSize: 8,
              fontFamily: 'var(--font-mono, monospace)',
              color: '#64748b',
              fontWeight: 700,
            }}
          >
            {hotkey}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 4,
        backgroundColor: active
          ? 'rgba(56, 189, 248, 0.18)'
          : highlight
            ? 'rgba(16, 185, 129, 0.12)'
            : '#141820',
        border: `1px solid ${
          active
            ? '#38bdf8'
            : highlight
              ? '#10b981'
              : '#242c38'
        }`,
        color: active ? '#38bdf8' : highlight ? '#86efac' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        position: 'relative',
        transition: 'all 0.12s ease',
        textAlign: 'left',
        minWidth: 90,
      }}
    >
      {Icon && <Icon size={13} color={active ? '#38bdf8' : highlight ? '#34d399' : '#94a3b8'} />}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ fontSize: 8.5, color: '#64748b' }}>{sub}</span>}
      </div>
      {hotkey && (
        <span
          style={{
            fontSize: 8,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#64748b',
            fontWeight: 700,
            backgroundColor: '#1b222d',
            padding: '1px 3px',
            borderRadius: 2,
          }}
        >
          {hotkey}
        </span>
      )}
    </button>
  );
}
