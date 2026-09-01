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
  Binary,
} from 'lucide-react';

export type RibbonTab =
  | 'view'
  | 'interactive'
  | 'autoseg'
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
    { id: 'interactive', label: 'Interactive CAD', icon: Zap, badge: 'Active' },
    { id: 'autoseg', label: 'AI Auto-Seg', icon: Sparkles, badge: 'AI' },
    { id: 'measure', label: 'Measure & HU', icon: Ruler },
    { id: 'export', label: '3D Export & Print', icon: Download },
    { id: 'license', label: 'License & System', icon: ShieldCheck },
  ];

  return (
    <div
      style={{
        backgroundColor: '#fcfbf8',
        borderBottom: '1px solid #e5e0d4',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 30,
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
      }}
    >
      {/* ── Level 1: Primary Header & Ribbon Tabs ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 38,
          backgroundColor: '#fff',
          borderBottom: '1px solid #e8e4db',
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
              background: '#f7f5ef',
              border: '1px solid #ded8cb',
              borderRadius: 6,
              padding: '3px 9px',
              color: '#0f3e17',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              height: 26,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e1f4df')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f7f5ef')}
          >
            <ArrowLeft size={13} color="#0f3e17" />
            <span>Cases</span>
          </button>

          <div style={{ height: 16, width: 1, backgroundColor: '#e5e0d4' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3e17', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
              {caseTitle || 'CT Volumetric Reconstruction'}
            </span>
            <span
              style={{
                fontSize: 9.5,
                padding: '1px 6px',
                borderRadius: 10,
                backgroundColor: '#e1f4df',
                color: '#0f3e17',
                fontWeight: 700,
                border: '1px solid #b1dbb8',
              }}
            >
              Stage 3: CAD
            </span>
          </div>
        </div>

        {/* Center: Ribbon Primary Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 3, height: '100%' }}>
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
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#0f3e17' : '#556b5a',
                  backgroundColor: isActive ? '#fcfbf8' : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2.5px solid #10b981' : '2.5px solid transparent',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#0f3e17';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#556b5a';
                }}
              >
                <Icon size={14} color={isActive ? '#10b981' : '#6b7c6e'} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: 8.5,
                      padding: '0 4px',
                      borderRadius: 3,
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
              backgroundColor: isSimulatedMode ? '#fee2e2' : '#ecfdf5',
              border: `1px solid ${isSimulatedMode ? '#fca5a5' : '#a7f3d0'}`,
              color: isSimulatedMode ? '#991b1b' : '#065f46',
              fontWeight: 600,
            }}
          >
            <Cpu size={11} color={isSimulatedMode ? '#dc2626' : '#10b981'} />
            <span>{isSimulatedMode ? 'Heuristic Mode' : 'GPU Neural'}</span>
          </div>

          <div style={{ height: 16, width: 1, backgroundColor: '#e5e0d4' }} />

          {/* Shortcuts Modal Button */}
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (?)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#fff',
              border: '1px solid #ded8cb',
              borderRadius: 6,
              padding: '2px 8px',
              color: '#0f3e17',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              height: 26,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f7f5ef')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
          >
            <HelpCircle size={12} color="#0f3e17" />
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
            padding: '5px 10px 4px',
            backgroundColor: '#fcfbf8',
            minHeight: 74,
            overflowX: 'auto',
            gap: 6,
          }}
        >
          {/* ========================================================= */}
          {/* TAB 1: VIEW & LAYOUT                                      */}
          {/* ========================================================= */}
          {activeTab === 'view' && (
            <>
              <RibbonSection label="Viewport Layout">
                <RibbonButton
                  icon={Grid2X2}
                  label="2×2 Quad MPR"
                  sub="Axial / Cor / Sag / 3D"
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
                  label="Point Click"
                  sub="MITK Single Seed"
                  hotkey="P"
                  active={activeTool === 'point'}
                  onClick={() => onToolSelect('point')}
                />
              </RibbonSection>

              <RibbonSection label="Target Polarity">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 105 }}>
                  <button
                    onClick={() => { if (!includeMode) onToggleIncludeMode(); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 5,
                      backgroundColor: includeMode ? '#e1f4df' : '#fff',
                      border: `1px solid ${includeMode ? '#10b981' : '#ded8cb'}`,
                      color: includeMode ? '#0f3e17' : '#556b5a',
                      fontSize: 11,
                      fontWeight: includeMode ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#10b981' }}>+</span>
                    <span>Target Bone</span>
                  </button>

                  <button
                    onClick={() => { if (includeMode) onToggleIncludeMode(); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 5,
                      backgroundColor: !includeMode ? '#fee2e2' : '#fff',
                      border: `1px solid ${!includeMode ? '#ef4444' : '#ded8cb'}`,
                      color: !includeMode ? '#991b1b' : '#556b5a',
                      fontSize: 11,
                      fontWeight: !includeMode ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#ef4444' }}>−</span>
                    <span>Background</span>
                  </button>
                </div>
              </RibbonSection>

              <RibbonSection label="Manual Drawing Tools">
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
                  label="Eraser Brush"
                  hotkey="E"
                  active={activeTool === 'eraser'}
                  onClick={() => onToolSelect('eraser')}
                />
              </RibbonSection>

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
                  sub="Multi-Body Split"
                  hotkey="X"
                  onClick={onOpenSplitMaskModal}
                />
                <RibbonButton
                  icon={SlidersHorizontal}
                  label="HU Threshold"
                  sub="Direct Density"
                  onClick={onOpenThresholdModal}
                />
                <RibbonButton
                  icon={Scissors}
                  label="Morphology"
                  sub="Dilate / Erode / Close"
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
              <RibbonSection label="Neural Inference Engine">
                <RibbonButton
                  icon={Sparkles}
                  label="Launch Auto-Seg (AI)"
                  sub="TotalSegmentator & MONAI"
                  onClick={onOpenAutoSegModal}
                  large
                  highlight
                />
              </RibbonSection>

              <RibbonSection label="Pre-trained Anatomical Presets">
                <RibbonButton
                  icon={Brain}
                  label="Unified Skeleton"
                  sub="All Skeletal Structures"
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
                  sub="Vertebrae / Pelvic Ring"
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

              <RibbonSection label="Active Measurements">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#556b5a' }}>
                    Active: <strong style={{ color: '#0f3e17' }}>{measurementCount}</strong> measurements
                  </div>
                  <button
                    onClick={onClearMeasurements}
                    disabled={measurementCount === 0}
                    style={{
                      padding: '3px 8px',
                      fontSize: 10.5,
                      borderRadius: 4,
                      backgroundColor: measurementCount > 0 ? '#fee2e2' : '#f7f5ef',
                      border: '1px solid #ded8cb',
                      color: measurementCount > 0 ? '#dc2626' : '#94a3b8',
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
              <RibbonSection label="Licensing & Master Admin">
                <RibbonButton
                  icon={ShieldCheck}
                  label="Master Admin Portal"
                  sub="amit.addi2010@gmail.com"
                  onClick={() => router.push('/admin/licenses')}
                  highlight
                />
              </RibbonSection>

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
        padding: '0 8px',
        borderRight: '1px solid #e8e4db',
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
          fontSize: 9.5,
          fontWeight: 600,
          color: '#6b7c6e',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: 2,
          paddingTop: 2,
          borderTop: '1px solid #ebe7df',
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
          padding: '3px 8px',
          fontSize: 10.5,
          fontWeight: active ? 700 : 500,
          borderRadius: 4,
          backgroundColor: active ? '#e1f4df' : '#fff',
          border: `1px solid ${active ? '#10b981' : '#ded8cb'}`,
          color: active ? '#0f3e17' : '#334155',
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
          padding: '5px 12px',
          minWidth: 84,
          borderRadius: 6,
          backgroundColor: active
            ? '#e1f4df'
            : highlight
              ? '#ecfdf5'
              : '#ffffff',
          border: `1px solid ${
            active
              ? '#10b981'
              : highlight
                ? '#10b981'
                : '#ded8cb'
          }`,
          color: active ? '#0f3e17' : highlight ? '#065f46' : '#1e293b',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          gap: 2,
          boxShadow: highlight ? '0 1px 3px rgba(16,185,129,0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
          transition: 'all 0.15s ease',
        }}
      >
        {Icon && <Icon size={18} color={active ? '#0f3e17' : highlight ? '#10b981' : '#556b5a'} />}
        <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
        {sub && <span style={{ fontSize: 9, color: '#6b7c6e', textAlign: 'center' }}>{sub}</span>}
        {hotkey && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 4,
              fontSize: 8.5,
              fontFamily: 'var(--font-mono, monospace)',
              color: '#6b7c6e',
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
        padding: '5px 9px',
        borderRadius: 5,
        backgroundColor: active
          ? '#e1f4df'
          : highlight
            ? '#ecfdf5'
            : '#ffffff',
        border: `1px solid ${
          active
            ? '#10b981'
            : highlight
              ? '#10b981'
              : '#ded8cb'
        }`,
        color: active ? '#0f3e17' : highlight ? '#065f46' : '#1e293b',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        position: 'relative',
        transition: 'all 0.12s ease',
        textAlign: 'left',
        minWidth: 92,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      {Icon && <Icon size={14} color={active ? '#0f3e17' : highlight ? '#10b981' : '#556b5a'} />}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ fontSize: 8.5, color: '#6b7c6e' }}>{sub}</span>}
      </div>
      {hotkey && (
        <span
          style={{
            fontSize: 8.5,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#6b7c6e',
            fontWeight: 700,
            backgroundColor: '#f1efe9',
            padding: '1px 3px',
            borderRadius: 3,
          }}
        >
          {hotkey}
        </span>
      )}
    </button>
  );
}
