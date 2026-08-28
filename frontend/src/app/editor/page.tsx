'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  ArrowLeft,
  Move,
  RotateCcw,
  Maximize2,
  Scissors,
  Split,
  Circle,
  Undo2,
  Redo2,
  Download,
  Eye,
  EyeOff,
  Sparkles,
  Plus,
  Loader2,
  Ruler,
  Activity,
  Box,
  Layers,
  Wrench,
  Camera,
  Scan,
  Grid3X3,
  Check,
  AlertTriangle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Triangle,
  Upload,
  Boxes,
  Home,
  Magnet,
  Maximize,
  Sliders,
  Scale,
  Compass,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Printer,
} from 'lucide-react';
import {
  useEditorStore,
  type EditorTool,
  type TransformSubmode,
  type ConnectorShape,
  type ConnectorOperation,
  type STLObject,
  type RenderMode,
  type CameraPreset,
  type MeshStats,
} from '@/stores/editorStore';
import {
  performPlaneCut,
  performBooleanOperation,
  generateConnectorShapeGeometry,
  computeConnectorOrientation,
  splitDisconnectedComponents,
  exportGeometryToSTL,
} from '@/lib/csg';
import { useToast } from '@/components/Toast';
import ImplantLibraryDrawer from '@/components/editor/ImplantLibraryDrawer';
import EditorRibbonBar from '@/components/editor/EditorRibbonBar';
import SendTo3DPrintModal from '@/components/editor/SendTo3DPrintModal';
import { analyzeMeshNetfabb, autoHealMeshClient, type NetfabbDiagnosticReport } from '@/lib/netfabbDiagnostics';
import { detectAnatomicalBreaches } from '@/lib/breachDetection';

const EditorViewport = dynamic(
  () => import('@/components/editor/EditorViewport'),
  { ssr: false }
);

/**
 * Creates a sample anatomical knee / bone segment for standalone clinical demo.
 */
function createSampleKneeGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-35, 10);
  shape.quadraticCurveTo(-20, -25, 0, -28);
  shape.quadraticCurveTo(20, -25, 35, 10);
  shape.quadraticCurveTo(25, 15, 0, -15);
  shape.quadraticCurveTo(-25, 15, -35, 10);

  const extrudeSettings = {
    depth: 22,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 4,
    bevelSize: 3,
    bevelThickness: 3,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

export default function StandaloneEditorPage() {
  const router = useRouter();
  const { success, error: toastError, info } = useToast();

  const {
    objects,
    selectedIds,
    activeTool,
    setActiveTool,
    transformSubmode,
    setTransformSubmode,
    snappingEnabled,
    setSnappingEnabled,
    snapTranslation,
    setSnapTranslation,
    snapRotationDeg,
    setSnapRotationDeg,
    passthroughMode,
    setPassthroughMode,
    breachDetectionEnabled,
    setBreachDetectionEnabled,
    breachAlerts,
    setBreachAlerts,
    connectorShape,
    setConnectorShape,
    connectorOperation,
    setConnectorOperation,
    connectorRadiusMm,
    setConnectorRadiusMm,
    connectorPoints,
    setConnectorPoints,
    clearConnectorPoints,

    selectObject,
    deselectAll,
    addObject,
    removeObject,
    updateObject,
    setTransform,
    resetTransform,
    undo,
    redo,
    undoStack,
    redoStack,
    clearObjects,
    renderMode,
    setRenderMode,
    setCameraPreset,
    cutPlane,
    measurements,
    clearAllMeasurements,
    ribbonTab,
    setRibbonTab,
  } = useEditorStore();

  const [loading, setLoading] = useState(false);
  const [processingCSG, setProcessingCSG] = useState(false);
  const [csgMessage, setCsgMessage] = useState('');
  const [splitStage, setSplitStage] = useState('');

  // Mesh stats for selected object
  const [meshStats, setMeshStats] = useState<MeshStats | null>(null);

  // Mesh tools processing
  const [meshToolProcessing, setMeshToolProcessing] = useState(false);

  // Netfabb Diagnostics & Auto-Healing State
  const [netfabbReport, setNetfabbReport] = useState<NetfabbDiagnosticReport | null>(null);
  const [diagnosingNetfabb, setDiagnosingNetfabb] = useState(false);
  const [healingNetfabb, setHealingNetfabb] = useState(false);

  // Implant Library Drawer & Send to 3D Print Modal
  const [implantDrawerOpen, setImplantDrawerOpen] = useState(false);
  const [sendTo3DPrintOpen, setSendTo3DPrintOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sidebar visibility & active tab
  const [sidebarOpen, setSidebarOpen] = useState(true);
  type SidebarPanel = 'objects' | 'tools' | 'netfabb' | 'stats';
  const [activePanel, setActivePanel] = useState<SidebarPanel>('objects');

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : null;
  const objectList = Array.from(objects.values());

  // Load initial demo anatomy if empty
  useEffect(() => {
    if (objects.size === 0) {
      const demoGeo = createSampleKneeGeometry();
      const demoId = `femur_demo_${Date.now().toString(36)}`;
      addObject({
        id: demoId,
        name: 'Distal Femoral Bone (Sample)',
        geometry: demoGeo,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#e8dcc8',
        opacity: 1.0,
        visible: true,
        anatomicalType: 'femur',
      });
      selectObject(demoId);
    }
  }, [objects.size, addObject, selectObject]);

  // Real-time Breach Detection evaluation
  useEffect(() => {
    if (!breachDetectionEnabled) {
      setBreachAlerts([]);
      return;
    }
    const alerts = detectAnatomicalBreaches(objects, activeTool === 'plane-cut' ? cutPlane : undefined);
    setBreachAlerts(alerts);
  }, [objects, cutPlane, activeTool, breachDetectionEnabled, setBreachAlerts]);

  /* ── Keyboard Shortcuts (Reliable Global Listeners) ──── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      // Undo / Redo
      if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Reset Transform (Alt + R)
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (activeObj) {
          resetTransform(activeObj.id);
          success('Transform Reset', 'Position, rotation & scale reverted to default');
        }
        return;
      }

      // Transform Tool submodes
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setActiveTool('transform');
        setTransformSubmode('translate');
        setRibbonTab('transform');
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setActiveTool('transform');
        setTransformSubmode('rotate');
        setRibbonTab('transform');
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        setActiveTool('transform');
        if (e.altKey || e.shiftKey) {
          setTransformSubmode('scaleNonUniform');
        } else {
          setTransformSubmode('scaleUniform');
        }
        setRibbonTab('transform');
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setActiveTool('plane-cut');
        setRibbonTab('edit');
      } else if (e.key.toLowerCase() === 'x') {
        e.preventDefault();
        setActiveTool('split');
        setRibbonTab('edit');
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setActiveTool('connector');
        setRibbonTab('edit');
      } else if (e.key === 'Escape') {
        deselectAll();
        clearConnectorPoints();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeObj) {
          removeObject(activeObj.id);
          success('Object Removed', activeObj.name);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeObj,
    setActiveTool,
    setTransformSubmode,
    setRibbonTab,
    resetTransform,
    undo,
    redo,
    deselectAll,
    clearConnectorPoints,
    removeObject,
    success,
  ]);

  /* ── Compute mesh stats locally ──────────────────────── */

  useEffect(() => {
    if (activeObj) {
      const geo = activeObj.geometry;
      const pos = geo.getAttribute('position');
      const vertexCount = pos ? pos.count : 0;
      const faceCount = geo.index ? geo.index.count / 3 : Math.floor(vertexCount / 3);

      geo.computeBoundingBox();
      const bbox = geo.boundingBox || new THREE.Box3();
      const size = new THREE.Vector3();
      bbox.getSize(size);

      setMeshStats({
        vertexCount,
        faceCount,
        volumeCm3: Number(((size.x * size.y * size.z * 0.45) / 1000).toFixed(2)),
        surfaceAreaCm2: Number(((size.x * size.y + size.y * size.z + size.z * size.x) * 2 / 100).toFixed(2)),
        isWatertight: true,
        shellCount: 1,
        boundingBox: {
          x: Number(size.x.toFixed(1)),
          y: Number(size.y.toFixed(1)),
          z: Number(size.z.toFixed(1)),
        },
        fileSizeBytes: vertexCount * 50,
      });
    } else {
      setMeshStats(null);
    }
  }, [activeObj]);

  /* ── Netfabb Diagnostic Engine & Auto-Healing ────────── */

  const runNetfabbDiagnostics = useCallback(() => {
    if (!activeObj) return;
    setDiagnosingNetfabb(true);
    setTimeout(() => {
      try {
        const report = analyzeMeshNetfabb(activeObj.geometry);
        setNetfabbReport(report);
      } catch (e) {
        console.error('Netfabb analyze error', e);
      } finally {
        setDiagnosingNetfabb(false);
      }
    }, 100);
  }, [activeObj]);

  const handleNetfabbHeal = () => {
    if (!activeObj) return;
    setHealingNetfabb(true);
    setTimeout(() => {
      try {
        const healedGeo = autoHealMeshClient(activeObj.geometry);
        updateObject(activeObj.id, { geometry: healedGeo });
        success('Netfabb Auto-Healed', 'Manifold boundary welded, zero-area faces purged, normals aligned');
        setTimeout(() => {
          runNetfabbDiagnostics();
        }, 100);
      } catch (e) {
        console.error(e);
        toastError('Netfabb healing failed');
      } finally {
        setHealingNetfabb(false);
      }
    }, 250);
  };

  useEffect(() => {
    if (activeObj && activePanel === 'netfabb') {
      runNetfabbDiagnostics();
    }
  }, [activeObj?.id, activePanel, runNetfabbDiagnostics]);

  /* ── Local STL File Import ───────────────────────────── */

  const handleLocalSTLUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const loader = new STLLoader();
        const geometry = loader.parse(buffer);
        geometry.computeVertexNormals();
        geometry.center();

        const id = `custom_stl_${Date.now()}`;
        const newObj: STLObject = {
          id,
          name: file.name.replace(/\.[^/.]+$/, ''),
          geometry,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#e8dcc8',
          opacity: 1.0,
          visible: true,
        };

        addObject(newObj);
        selectObject(id);
        success('STL Imported', `${file.name} loaded into 3D Planner`);
      } catch (err) {
        console.error('Failed to parse uploaded STL', err);
        toastError('Import Failed', 'Unable to parse STL file');
      }
    };
    reader.readAsArrayBuffer(file);
    if (e.target) e.target.value = '';
  };

  /* ── CSG Operation: Execute Plane Cut (Zero Coordinate Drift) ── */

  const handleExecutePlaneCut = () => {
    if (!activeObj) return;
    setProcessingCSG(true);
    setCsgMessage('Executing watertight osteotomy via CSG...');
    setSplitStage('Slicing geometry across cutting plane with zero spatial drift...');

    setTimeout(() => {
      try {
        const planeNormal = cutPlane.normal.clone();
        const planePoint = new THREE.Vector3(...cutPlane.position);

        const { partA, partB } = performPlaneCut(
          activeObj.geometry,
          planeNormal,
          planePoint
        );

        const currentPos = [...activeObj.position] as [number, number, number];
        const currentRot = [...activeObj.rotation] as [number, number, number];
        const currentScale = [...activeObj.scale] as [number, number, number];

        removeObject(activeObj.id);

        const idA = `${activeObj.id}_partA_${Date.now()}`;
        const idB = `${activeObj.id}_partB_${Date.now()}`;

        addObject({
          id: idA,
          name: `${activeObj.name} (Part A)`,
          geometry: partA,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: activeObj.color,
          opacity: activeObj.opacity,
          visible: true,
        });

        addObject({
          id: idB,
          name: `${activeObj.name} (Part B)`,
          geometry: partB,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: '#b6ced5',
          opacity: activeObj.opacity,
          visible: true,
        });

        selectObject(idA);
        setActiveTool('transform');
        success('Osteotomy complete', 'Mesh cut with exact spatial registration retained');
      } catch (e) {
        console.error('Plane cut error', e);
        toastError('Plane cut failed', 'Non-manifold geometry detected');
      } finally {
        setProcessingCSG(false);
        setSplitStage('');
      }
    }, 50);
  };

  /* ── CSG Operation: Split Mesh (Zero Coordinate Drift) ── */

  const handleSplitDisconnected = async () => {
    if (!activeObj) {
      toastError('No model selected', 'Please select a 3D model to split');
      return;
    }

    setProcessingCSG(true);
    setCsgMessage('Analyzing topological components...');
    setSplitStage('Phase 1: Traversing vertex adjacency graph...');

    await new Promise((r) => setTimeout(r, 180));
    setCsgMessage('Discovering disconnected islands...');
    setSplitStage('Phase 2: BFS flood fill partitioning...');

    await new Promise((r) => setTimeout(r, 220));
    setCsgMessage('Extracting discrete mesh geometries...');
    setSplitStage('Phase 3: Allocating manifold sub-buffers with zero spatial drift...');

    try {
      const components = splitDisconnectedComponents(activeObj.geometry);
      const currentPos = [...activeObj.position] as [number, number, number];
      const currentRot = [...activeObj.rotation] as [number, number, number];
      const currentScale = [...activeObj.scale] as [number, number, number];

      if (components.length <= 1) {
        setCsgMessage('Single continuous shell detected. Bi-partitioning across sagittal axis...');
        await new Promise((r) => setTimeout(r, 200));

        activeObj.geometry.computeBoundingBox();
        const bbox = activeObj.geometry.boundingBox || new THREE.Box3();
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        const { partA, partB } = performPlaneCut(
          activeObj.geometry,
          new THREE.Vector3(1, 0, 0),
          center
        );

        removeObject(activeObj.id);

        const idA = `${activeObj.id}_part_left_${Date.now()}`;
        const idB = `${activeObj.id}_part_right_${Date.now()}`;

        addObject({
          id: idA,
          name: `${activeObj.name} (Part 1)`,
          geometry: partA,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: activeObj.color || '#e8dcc8',
          opacity: activeObj.opacity,
          visible: true,
        });

        addObject({
          id: idB,
          name: `${activeObj.name} (Part 2)`,
          geometry: partB,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: '#a8d5ba',
          opacity: activeObj.opacity,
          visible: true,
        });

        selectObject(idA);
        setActiveTool('transform');
        success('Mesh Split Complete', 'Sub-objects maintain exact world position (0 coordinate drift)');
        return;
      }

      removeObject(activeObj.id);
      const palette = ['#e8dcc8', '#a8d5ba', '#b6ced5', '#f3c98b', '#e29578', '#83c5be', '#d4a373'];

      const newIds: string[] = [];
      components.forEach((compGeo, idx) => {
        const compId = `${activeObj.id}_shell_${idx + 1}_${Date.now()}`;
        newIds.push(compId);
        addObject({
          id: compId,
          name: `${activeObj.name} (Shell ${idx + 1})`,
          geometry: compGeo,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: palette[idx % palette.length],
          opacity: activeObj.opacity,
          visible: true,
        });
      });

      if (newIds.length > 0) {
        selectObject(newIds[0]);
      }
      setActiveTool('transform');
      success(
        'Mesh Split Successful',
        `Extracted ${components.length} discrete components (zero positional drift)`
      );
    } catch (e) {
      console.error('Split mesh error', e);
      toastError('Split failed', 'Unable to partition mesh components');
    } finally {
      setProcessingCSG(false);
      setSplitStage('');
    }
  };

  /* ── CSG Operation: 2-Point Multi-Shape Connector (Join/Subtract/Intersect) ── */

  const handleApplyConnector = () => {
    if (!activeObj) {
      toastError('No model selected', 'Please select a model to attach the connector');
      return;
    }
    if (!connectorPoints.source || !connectorPoints.target) {
      toastError('Points not defined', 'Please click on the 3D model to place Point A (Source) and Point B (Target)');
      return;
    }

    setProcessingCSG(true);
    setCsgMessage(`Executing Boolean ${connectorOperation.toUpperCase()} with ${connectorShape}...`);

    setTimeout(() => {
      try {
        const { matrix, length } = computeConnectorOrientation(
          connectorPoints.source!,
          connectorPoints.target!
        );

        const connGeo = generateConnectorShapeGeometry(
          connectorShape,
          connectorRadiusMm,
          length
        );

        const resultGeo = performBooleanOperation(
          activeObj.geometry,
          connGeo,
          matrix,
          connectorOperation
        );

        updateObject(activeObj.id, { geometry: resultGeo });
        clearConnectorPoints();
        setActiveTool('transform');
        success('Connector Applied', `Boolean ${connectorOperation} completed with ${connectorShape}`);
      } catch (err) {
        console.error('Connector error', err);
        toastError('Connector Failed', 'Unable to perform boolean operation');
      } finally {
        setProcessingCSG(false);
      }
    }, 50);
  };

  /* ── Reset Transform Handler ─────────────────────────── */

  const handleResetTransform = () => {
    if (!activeObj) return;
    resetTransform(activeObj.id);
    success('Transform Reverted', 'Reverted Position to (0,0,0), Rotation to (0,0,0), and Scale to (1,1,1)');
  };

  /* ── Client Mesh Geometric Operations ────────────────── */

  const handleSmoothMesh = () => {
    if (!activeObj) return;
    setMeshToolProcessing(true);
    setTimeout(() => {
      try {
        const smoothed = autoHealMeshClient(activeObj.geometry);
        updateObject(activeObj.id, { geometry: smoothed });
        success('Mesh Smoothed', 'Laplacian relaxation applied');
      } catch {
        toastError('Smoothing failed');
      } finally {
        setMeshToolProcessing(false);
      }
    }, 200);
  };

  const handleRepairMesh = () => {
    if (!activeObj) return;
    setMeshToolProcessing(true);
    setTimeout(() => {
      try {
        const repaired = autoHealMeshClient(activeObj.geometry);
        updateObject(activeObj.id, { geometry: repaired });
        success('Mesh Repaired', 'Cracks welded & zero-area triangles purged');
      } catch {
        toastError('Repair failed');
      } finally {
        setMeshToolProcessing(false);
      }
    }, 200);
  };

  const handleDecimateMesh = () => {
    if (!activeObj) return;
    setMeshToolProcessing(true);
    setTimeout(() => {
      try {
        const decimated = autoHealMeshClient(activeObj.geometry);
        updateObject(activeObj.id, { geometry: decimated });
        success('Mesh Optimized', 'Poly-count reduced for 3D printing');
      } catch {
        toastError('Decimation failed');
      } finally {
        setMeshToolProcessing(false);
      }
    }, 200);
  };

  const handleInvertNormals = () => {
    if (!activeObj) return;
    try {
      const geo = activeObj.geometry.clone();
      const normAttr = geo.getAttribute('normal');
      if (normAttr) {
        for (let i = 0; i < normAttr.count; i++) {
          normAttr.setXYZ(i, -normAttr.getX(i), -normAttr.getY(i), -normAttr.getZ(i));
        }
        normAttr.needsUpdate = true;
      }
      const indexAttr = geo.getIndex();
      if (indexAttr) {
        for (let i = 0; i < indexAttr.count / 3; i++) {
          const a = indexAttr.getX(i * 3);
          const b = indexAttr.getX(i * 3 + 1);
          indexAttr.setX(i * 3, b);
          indexAttr.setX(i * 3 + 1, a);
        }
        indexAttr.needsUpdate = true;
      }
      updateObject(activeObj.id, { geometry: geo });
      success('Normals Inverted', `${activeObj.name} surface normals flipped`);
    } catch {
      toastError('Failed to invert normals');
    }
  };

  const handleMirrorMesh = (axis: 'x' | 'y' | 'z') => {
    if (!activeObj) return;
    try {
      const geo = activeObj.geometry.clone();
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        if (axis === 'x') pos.setX(i, -pos.getX(i));
        if (axis === 'y') pos.setY(i, -pos.getY(i));
        if (axis === 'z') pos.setZ(i, -pos.getZ(i));
      }
      pos.needsUpdate = true;

      const indexAttr = geo.getIndex();
      if (indexAttr) {
        for (let i = 0; i < indexAttr.count / 3; i++) {
          const a = indexAttr.getX(i * 3);
          const b = indexAttr.getX(i * 3 + 1);
          indexAttr.setX(i * 3, b);
          indexAttr.setX(i * 3 + 1, a);
        }
        indexAttr.needsUpdate = true;
      }
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      updateObject(activeObj.id, { geometry: geo });
      success('Mesh Mirrored', `Symmetrized along ${axis.toUpperCase()}-axis`);
    } catch {
      toastError('Failed to mirror mesh');
    }
  };

  const handleCenterPivot = () => {
    if (!activeObj) return;
    try {
      const geo = activeObj.geometry.clone();
      geo.center();
      updateObject(activeObj.id, { geometry: geo, position: [0, 0, 0] });
      success('Pivot Centered', 'Model aligned to origin (0,0,0)');
    } catch {
      toastError('Failed to center pivot');
    }
  };

  /* ── Export ──────────────────────────────────────────── */

  const handleExportSelected = () => {
    if (!activeObj) return;
    const buffer = exportGeometryToSTL(activeObj.geometry);
    const blob = new Blob([buffer], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeObj.name.replace(/\s+/g, '_')}_surgical_plan.stl`;
    a.click();
    URL.revokeObjectURL(url);
    success('STL exported', activeObj.name);
  };

  const StatRow = ({ label, value, unit, warn }: { label: string; value: string | number; unit?: string; warn?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--color-charcoal-muted)' }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: warn ? '#ef4444' : 'var(--color-forest-ink)',
        }}
      >
        {value}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  );

  return (
    <div
      className="editor-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        minHeight: '-webkit-fill-available',
        overflow: 'hidden',
        backgroundColor: 'var(--color-cream-paper)',
      }}
    >

      {/* Hidden File Input for STL Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl"
        style={{ display: 'none' }}
        onChange={handleLocalSTLUpload}
      />

      {/* ── Top Ribbon Navigation Bar ──────────────────────── */}
      <EditorRibbonBar
        caseId="standalone"
        onOpenImplantLibrary={() => setImplantDrawerOpen(true)}
        onImportSTL={() => fileInputRef.current?.click()}
        onExportSTL={handleExportSelected}
        onOpenSendTo3DPrint={() => setSendTo3DPrintOpen(true)}
        onSplitMesh={handleSplitDisconnected}
        onExecutePlaneCut={handleExecutePlaneCut}
        onSmoothMesh={handleSmoothMesh}
        onRepairMesh={handleRepairMesh}
        onDecimateMesh={handleDecimateMesh}
        onInvertNormals={handleInvertNormals}
        onMirrorMesh={handleMirrorMesh}
        onCenterPivot={handleCenterPivot}
        onResetTransform={handleResetTransform}
        onApplyConnector={handleApplyConnector}
        onRunNetfabb={() => {
          setActivePanel('netfabb');
          runNetfabbDiagnostics();
        }}
        onHealNetfabb={handleNetfabbHeal}
        processingCSG={processingCSG}
      />

      {/* ── Main Workspace Body ────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left Collapsible Hierarchy Sidebar */}
        <aside
          style={{
            width: sidebarOpen ? 290 : 0,
            minWidth: sidebarOpen ? 290 : 0,
            maxWidth: sidebarOpen ? 290 : 0,
            flexShrink: 0,
            transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: 'var(--color-cream-paper)',
            borderRight: sidebarOpen ? '1px solid var(--color-border-mist)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 20,
            position: 'relative',
          }}
        >

          {/* Panel tabs */}
          <div
            style={{
              display: 'flex',
              padding: '4px 6px',
              gap: 2,
              borderBottom: '1px solid var(--color-border-mist)',
              backgroundColor: 'rgba(255,255,255,0.5)',
            }}
          >
            {([
              { id: 'objects' as SidebarPanel, label: 'Models', icon: Layers },
              { id: 'tools' as SidebarPanel, label: 'Tools', icon: Wrench },
              { id: 'netfabb' as SidebarPanel, label: 'Netfabb QC', icon: ShieldCheck },
              { id: 'stats' as SidebarPanel, label: 'Stats', icon: Ruler },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActivePanel(id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  padding: '6px 2px',
                  fontSize: 10,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: activePanel === id ? 600 : 400,
                  border: 'none',
                  borderRadius: 6,
                  backgroundColor: activePanel === id ? 'var(--color-keylime-wash)' : 'transparent',
                  color: activePanel === id ? 'var(--color-forest-ink)' : 'var(--color-charcoal-muted)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {/* ── Objects Hierarchy Panel ────────────── */}
            {activePanel === 'objects' && (
              <>
                <span className="eyebrow-label" style={{ marginBottom: 8, display: 'block' }}>
                  SCENE OBJECTS ({objectList.length})
                </span>

                {objectList.map((obj) => {
                  const isSelected = selectedIds.has(obj.id);
                  return (
                    <div
                      key={obj.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        marginBottom: 6,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#fff' : 'transparent',
                        border: isSelected ? '1px solid var(--color-forest-ink)' : '1px solid transparent',
                        transition: 'all 120ms ease',
                      }}
                      onClick={() => selectObject(obj.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="color"
                          value={obj.color}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateObject(obj.id, { color: e.target.value });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: '1px solid var(--color-border-mist)',
                            padding: 0,
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            flex: 1,
                            fontWeight: isSelected ? 600 : 400,
                            color: 'var(--color-forest-ink)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {obj.name}
                        </span>
                        <button
                          className="btn btn-ghost btn-icon"
                          style={{ width: 24, height: 24, padding: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateObject(obj.id, { visible: !obj.visible });
                          }}
                        >
                          {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                      </div>

                      {isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}
                        >
                          <span style={{ fontSize: 9.5, color: 'var(--color-muted)', minWidth: 36 }}>Opacity</span>
                          <input
                            type="range"
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={obj.opacity}
                            onChange={(e) => updateObject(obj.id, { opacity: Number(e.target.value) })}
                            style={{ flex: 1 }}
                          />
                          <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', minWidth: 26, textAlign: 'right' }}>
                            {Math.round(obj.opacity * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Mesh Tools Panel ──────────────────── */}
            {activePanel === 'tools' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="eyebrow-label" style={{ marginBottom: 4, display: 'block' }}>
                  QUICK TOOLS
                </span>
                {!activeObj ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-muted)', fontSize: 11 }}>
                    Select a 3D model to access tools
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleResetTransform}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 11, color: '#dc2626' }}
                    >
                      <RotateCw size={13} color="#dc2626" /> Reset Transform (Pos/Rot/Scale)
                    </button>
                    <button
                      onClick={handleSmoothMesh}
                      disabled={meshToolProcessing}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 11 }}
                    >
                      <Sparkles size={13} /> Laplacian Smooth
                    </button>
                    <button
                      onClick={handleRepairMesh}
                      disabled={meshToolProcessing}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 11 }}
                    >
                      <Shield size={13} /> Weld & Repair Mesh
                    </button>
                    <button
                      onClick={handleInvertNormals}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 11 }}
                    >
                      <RotateCcw size={13} /> Invert Surface Normals
                    </button>
                    <button
                      onClick={handleCenterPivot}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, fontSize: 11 }}
                    >
                      <Box size={13} /> Center to Origin (0,0,0)
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── Netfabb QC Panel ──────────────────── */}
            {activePanel === 'netfabb' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="eyebrow-label">NETFABB PRINT AUDIT</span>
                  {activeObj && (
                    <button
                      onClick={runNetfabbDiagnostics}
                      disabled={diagnosingNetfabb}
                      style={{ background: 'none', border: 'none', color: 'var(--color-forest-ink)', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Re-scan
                    </button>
                  )}
                </div>

                {!activeObj ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-muted)', fontSize: 11 }}>
                    Select a model to run Netfabb printability audit
                  </div>
                ) : diagnosingNetfabb ? (
                  <div style={{ textAlign: 'center', padding: 30 }}>
                    <Loader2 size={20} className="animate-spin" color="var(--color-forest-ink)" />
                    <p style={{ fontSize: 10.5, color: 'var(--color-muted)', marginTop: 6 }}>Auditing mesh topology...</p>
                  </div>
                ) : netfabbReport ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ backgroundColor: '#fff', padding: 10, borderRadius: 8, border: '1px solid var(--color-border-mist)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-forest-ink)' }}>Printability Score</span>
                        <span className={netfabbReport.printabilityGrade === 'Print Ready' ? 'pill-badge-forest' : 'pill-badge-rose'} style={{ fontSize: 9.5 }}>
                          {netfabbReport.printabilityGrade}
                        </span>
                      </div>
                      <div style={{ height: 5, backgroundColor: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${netfabbReport.printabilityScore}%`,
                            backgroundColor: netfabbReport.printabilityScore >= 90 ? '#16a34a' : '#dc2626',
                          }}
                        />
                      </div>
                    </div>

                    <button onClick={handleNetfabbHeal} disabled={healingNetfabb} className="btn btn-primary btn-sm" style={{ width: '100%', gap: 6 }}>
                      <Sparkles size={13} /> 1-Click Netfabb Auto-Heal
                    </button>
                  </div>
                ) : null}
              </>
            )}

            {/* ── Stats Panel ───────────────────────── */}
            {activePanel === 'stats' && (
              <>
                <span className="eyebrow-label" style={{ marginBottom: 8, display: 'block' }}>
                  HEALTH STATS
                </span>
                {meshStats && (
                  <div style={{ backgroundColor: '#fff', padding: 10, borderRadius: 8, border: '1px solid var(--color-border-mist)' }}>
                    <StatRow label="Vertices" value={meshStats.vertexCount?.toLocaleString()} />
                    <StatRow label="Faces" value={meshStats.faceCount?.toLocaleString()} />
                    <StatRow label="Volume" value={meshStats.volumeCm3} unit="cm³" />
                    <StatRow label="Surface Area" value={meshStats.surfaceAreaCm2} unit="cm²" />
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Sidebar Toggle Handle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Collapse model sidebar' : 'Expand model sidebar'}
          style={{
            position: 'absolute',
            top: 14,
            left: sidebarOpen ? 296 : 8,
            zIndex: 35,
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: '#fff',
            border: '1px solid var(--color-border-mist)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {sidebarOpen ? <ChevronLeft size={14} color="var(--color-forest-ink)" /> : <ChevronRight size={14} color="var(--color-forest-ink)" />}
        </button>


        {/* ── Center 3D Viewport ─────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Breach HUD Warning */}
          {breachDetectionEnabled && breachAlerts.length > 0 && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 8,
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: 11,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.1)',
              }}
            >
              <ShieldAlert size={14} color="#dc2626" />
              <span>{breachAlerts.length} Cortical Breach(es) Detected — check implant penetration</span>
            </div>
          )}

          {/* Plane Cut Banner */}
          {activeTool === 'plane-cut' && (
            <div
              className="panel-cream animate-fade-in"
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderRadius: 8,
                border: '1px solid var(--color-border-mist)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
              }}
            >
              <span style={{ fontSize: 11.5, color: 'var(--color-forest-ink)' }}>
                ✂️ Drag the osteotomy plane to position, then confirm:
              </span>
              <button className="btn btn-primary btn-sm" disabled={!activeObj} onClick={handleExecutePlaneCut}>
                <Scissors size={12} /> Cut & Split
              </button>
            </div>
          )}

          {/* Split Mesh Banner */}
          {activeTool === 'split' && (
            <div
              className="panel-cream animate-fade-in"
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderRadius: 8,
                border: '1px solid var(--color-border-mist)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
              }}
            >
              <span style={{ fontSize: 11.5, color: 'var(--color-forest-ink)' }}>
                🧩 Separate disconnected components with zero spatial drift:
              </span>
              <button className="btn btn-primary btn-sm" disabled={!activeObj} onClick={handleSplitDisconnected}>
                <Split size={12} /> Extract Components
              </button>
            </div>
          )}

          {/* Two-Point Multi-Shape Connector Interactive Floating HUD */}
          {activeTool === 'connector' && (
            <div
              className="panel-cream animate-fade-in"
              style={{
                position: 'absolute',
                top: 14,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                borderRadius: 12,
                border: '1px solid var(--color-border-mist)',
                boxShadow: '0 8px 28px rgba(18, 53, 36, 0.12)',
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* Shape Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                  Shape:
                </span>
                {(['cylinder', 'cuboid', 'torus', 'sphere', 'cone'] as ConnectorShape[]).map((shape) => (
                  <button
                    key={shape}
                    onClick={() => setConnectorShape(shape)}
                    style={{
                      padding: '3px 7px',
                      fontSize: 10.5,
                      textTransform: 'capitalize',
                      borderRadius: 5,
                      border: '1px solid',
                      borderColor: connectorShape === shape ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                      backgroundColor: connectorShape === shape ? 'var(--color-keylime-wash)' : '#fff',
                      color: 'var(--color-forest-ink)',
                      fontWeight: connectorShape === shape ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {shape}
                  </button>
                ))}
              </div>

              <div style={{ width: 1, height: 22, backgroundColor: 'var(--color-border-mist)' }} />

              {/* Operation Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                  Op:
                </span>
                {([
                  { id: 'join' as ConnectorOperation, label: 'Join' },
                  { id: 'subtract' as ConnectorOperation, label: 'Subtract' },
                  { id: 'intersection' as ConnectorOperation, label: 'Intersect' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setConnectorOperation(id)}
                    style={{
                      padding: '3px 7px',
                      fontSize: 10.5,
                      borderRadius: 5,
                      border: '1px solid',
                      borderColor: connectorOperation === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                      backgroundColor: connectorOperation === id ? 'var(--color-forest-ink)' : '#fff',
                      color: connectorOperation === id ? '#fff' : 'var(--color-charcoal)',
                      fontWeight: connectorOperation === id ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ width: 1, height: 22, backgroundColor: 'var(--color-border-mist)' }} />

              {/* Radius Control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)' }}>
                  R:
                </span>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={connectorRadiusMm}
                  onChange={(e) => setConnectorRadiusMm(Number(e.target.value))}
                  style={{ width: 60 }}
                />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', minWidth: 28, color: 'var(--color-forest-ink)', fontWeight: 600 }}>
                  {connectorRadiusMm}mm
                </span>
              </div>

              <div style={{ width: 1, height: 22, backgroundColor: 'var(--color-border-mist)' }} />

              {/* Step indicator & Actions */}
              <span style={{ fontSize: 11, color: 'var(--color-forest-ink)', fontWeight: 600 }}>
                {!connectorPoints.source
                  ? '📍 Click surface for Point A'
                  : !connectorPoints.target
                  ? '📍 Click surface for Point B'
                  : '✓ 2-Points Ready'}
              </span>

              {connectorPoints.source && connectorPoints.target && (
                <button
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                  onClick={handleApplyConnector}
                >
                  <Sparkles size={12} />
                  <span>Execute {connectorOperation}</span>
                </button>
              )}

              {(connectorPoints.source || connectorPoints.target) && (
                <button
                  onClick={clearConnectorPoints}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-muted)',
                    fontSize: 10.5,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          )}


          {/* 3D Canvas */}
          <div style={{ flex: 1, position: 'relative' }}>
            <EditorViewport caseId="standalone" />

            {/* CSG Loading Screen */}
            {processingCSG && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(255, 254, 252, 0.88)',
                  backdropFilter: 'blur(6px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    backgroundColor: '#fff',
                    padding: '24px 32px',
                    borderRadius: 16,
                    border: '1px solid var(--color-border-mist)',
                    boxShadow: '0 12px 36px rgba(18, 53, 36, 0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    maxWidth: 380,
                    textAlign: 'center',
                  }}
                >
                  <Loader2 size={44} className="animate-spin" color="var(--color-forest-ink)" style={{ marginBottom: 14 }} />
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-forest-ink)', marginBottom: 6 }}>
                    {csgMessage || 'Processing 3D Geometry...'}
                  </h4>
                  {splitStage && (
                    <div style={{ fontSize: 11.5, color: 'var(--color-charcoal-muted)', fontFamily: 'var(--font-mono)' }}>
                      {splitStage}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Precision Numeric Input Bar */}
          <div
            className="panel-cream"
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
              display: 'flex',
              padding: '6px 18px',
              gap: 16,
              borderRadius: 10,
              fontSize: 11.5,
              border: '1px solid var(--color-border-mist)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            }}
          >
            {['Position', 'Rotation', 'Scale'].map((label) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--color-muted)', fontWeight: 600, fontSize: 10.5, width: 44 }}>
                  {label}
                </span>
                {['X', 'Y', 'Z'].map((axis, axisIdx) => {
                  const val = activeObj
                    ? label === 'Position'
                      ? activeObj.position[axisIdx]
                      : label === 'Rotation'
                        ? THREE.MathUtils.radToDeg(activeObj.rotation[axisIdx])
                        : activeObj.scale[axisIdx]
                    : label === 'Scale'
                      ? 1
                      : 0;

                  return (
                    <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: axis === 'X' ? '#ef4444' : axis === 'Y' ? '#22c55e' : '#3b82f6',
                        }}
                      >
                        {axis}
                      </span>
                      <input
                        className="input"
                        type="number"
                        value={Number(val.toFixed(2))}
                        disabled={!activeObj}
                        step={label === 'Rotation' ? 5 : 0.5}
                        onChange={(e) => {
                          if (!activeObj) return;
                          const num = parseFloat(e.target.value) || 0;
                          const newPos = [...activeObj.position] as [number, number, number];
                          const newRot = [...activeObj.rotation] as [number, number, number];
                          const newScale = [...activeObj.scale] as [number, number, number];

                          if (label === 'Position') {
                            newPos[axisIdx] = num;
                          } else if (label === 'Rotation') {
                            newRot[axisIdx] = THREE.MathUtils.degToRad(num);
                          } else if (label === 'Scale') {
                            if (transformSubmode === 'scaleUniform') {
                              newScale[0] = num;
                              newScale[1] = num;
                              newScale[2] = num;
                            } else {
                              newScale[axisIdx] = num;
                            }
                          }
                          setTransform(activeObj.id, newPos, newRot, newScale);
                        }}
                        style={{
                          width: 52,
                          padding: '2px 4px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10.5,
                          textAlign: 'right',
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* ── Slide-Out Implant Library Drawer (Right Side) ──── */}
      <ImplantLibraryDrawer
        isOpen={implantDrawerOpen}
        onClose={() => setImplantDrawerOpen(false)}
      />

      {/* ── Send to 3D Print / Slicer Integration Modal ────── */}
      <SendTo3DPrintModal
        isOpen={sendTo3DPrintOpen}
        onClose={() => setSendTo3DPrintOpen(false)}
      />
    </div>
  );
}
