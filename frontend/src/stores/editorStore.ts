/**
 * Zustand store for the STL editor — objects, unified transforms with snapping,
 * 2-point multi-shape connectors, passthrough, breach detection, locked TKR, and undo/redo.
 */

import { create } from 'zustand';
import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────

export interface STLObject {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  initialPosition?: [number, number, number];
  initialRotation?: [number, number, number];
  initialScale?: [number, number, number];
  color: string;
  opacity: number;
  visible: boolean;
  isImplant?: boolean;
  anatomicalType?: 'femur' | 'tibia' | 'patella' | 'fibula' | 'mandible' | 'cranial' | 'generic';
}

export type EditorTool =
  | 'transform' // MeshMixer unified transform
  | 'rotate'
  | 'translate'
  | 'scale'
  | 'plane-cut'
  | 'split'
  | 'connector'
  | 'tkr'
  | 'measure-distance'
  | 'measure-angle'
  | 'mechanical-axis'
  | 'screw-picker'
  | 'islands'
  | 'region-grow';

export interface MeshShell {
  index: number;
  vertex_count: number;
  face_count: number;
  volume_cm3: number;
  surface_area_cm2: number;
  is_watertight: boolean;
  bounds: [[number, number, number], [number, number, number]];
  centroid: [number, number, number];
  bbox_dims: [number, number, number];
}

export type TransformSubmode = 'translate' | 'rotate' | 'scaleUniform' | 'scaleNonUniform';
export type MechanicalAxisSubtype = 'hka' | 'mpta' | 'mldfa';

export type ConnectorShape = 'cylinder' | 'cuboid' | 'torus' | 'sphere' | 'cone';
export type ConnectorOperation = 'join' | 'subtract' | 'intersection';

export type RenderMode = 'solid' | 'wireframe' | 'xray';

export interface Measurement3D {
  id: string;
  type: 'distance' | 'angle' | 'mechanical-axis' | 'screw';
  subtype?: MechanicalAxisSubtype | 'generic';
  points: THREE.Vector3[];
  value: number; // mm or degrees
  label: string;
  classification?: string; // e.g. "3.8° Varus Deformity", "Within Cortical Margin"
  hasBreach?: boolean;
}

export interface GhostMirrorOverlay {
  visible: boolean;
  sourceId: string;
  name: string;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface Annotation3D {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  text: string;
  color: string;
}

export interface CutPlaneState {
  position: [number, number, number];
  rotation: [number, number, number];
  normal: THREE.Vector3;
}

export interface MeshStats {
  vertexCount: number;
  faceCount: number;
  volumeCm3: number;
  surfaceAreaCm2: number;
  isWatertight: boolean;
  shellCount: number;
  boundingBox: { x: number; y: number; z: number };
  fileSizeBytes?: number;
}

export interface EditOperation {
  type: string;
  timestamp: number;
  before: Map<string, STLObject | null>;
  after: Map<string, STLObject | null>;
}

export interface BreachAlert {
  id: string;
  objectId: string;
  objectName: string;
  type: 'cortical_penetration' | 'joint_over_resection' | 'nerve_canal_breach';
  depthMm: number;
  location: [number, number, number];
  message: string;
}

export interface TKRPlanningState {
  active: boolean;
  isLocked: boolean; // Locked in current build
  femoralResectionDepth: number;
  femoralValgusAngle: number;
  femoralFlexionAngle: number;
  femoralExternalRotation: number;
  tibialResectionDepth: number;
  tibialPosteriorSlope: number;
  tibialVarusValgus: number;
  femoralSize: string;
  tibialSize: string;
  insertThicknessMm: number;
  activeResectionTarget: 'femur' | 'tibia' | null;
  showCutPlanes: boolean;
  showMechanicalAxis: boolean;
}

// ── Camera Presets ────────────────────────────────────────

export type CameraPreset = 'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior' | 'free';

export const CAMERA_PRESETS: Record<CameraPreset, { position: [number, number, number]; up: [number, number, number] }> = {
  anterior: { position: [0, 0, 250], up: [0, 1, 0] },
  posterior: { position: [0, 0, -250], up: [0, 1, 0] },
  left: { position: [-250, 0, 0], up: [0, 1, 0] },
  right: { position: [250, 0, 0], up: [0, 1, 0] },
  superior: { position: [0, 250, 0], up: [0, 0, -1] },
  inferior: { position: [0, -250, 0], up: [0, 0, 1] },
  free: { position: [120, 80, 160], up: [0, 1, 0] },
};

// ── Store Interface ───────────────────────────────────────

interface EditorStore {
  objects: Map<string, STLObject>;
  selectedIds: Set<string>;
  activeTool: EditorTool;
  transformSubmode: TransformSubmode;
  cutPlane: CutPlaneState;

  // Connector feature
  connectorShape: ConnectorShape;
  connectorOperation: ConnectorOperation;
  connectorRadiusMm: number;
  connectorPoints: { source: THREE.Vector3 | null; target: THREE.Vector3 | null };

  renderMode: RenderMode;
  cameraPreset: CameraPreset;
  cameraPresetTrigger: number;

  // Ribbon Navigation
  ribbonTab: 'home' | 'transform' | 'edit' | 'planning';
  setRibbonTab: (tab: 'home' | 'transform' | 'edit' | 'planning') => void;

  // Snapping
  snappingEnabled: boolean;
  snapTranslation: number; // mm (0.5, 1, 2, 5, 10)
  snapRotationDeg: number; // degrees (1, 5, 15, 45, 90)

  // Passthrough / X-Ray Mode
  passthroughMode: boolean;

  // Breach Detection
  breachDetectionEnabled: boolean;
  breachAlerts: BreachAlert[];

  // TKR Planning Module State
  tkrState: TKRPlanningState;

  // Measurements
  measurements: Measurement3D[];
  measurementDraftPoints: THREE.Vector3[];

  // Undo/redo & Clipboard
  undoStack: EditOperation[];
  redoStack: EditOperation[];
  clipboard: STLObject[];

  // Actions — Clipboard & Duplication
  copySelected: () => STLObject[];
  pasteClipboard: () => string[];
  duplicateSelected: () => string[];
  deleteSelected: () => void;

  // Hover tracking
  hoveredObjectId: string | null;
  setHoveredObjectId: (id: string | null) => void;

  // Touch & Mobile Viewport Navigation
  touchGestureMode: 'rotate' | 'pan';
  setTouchGestureMode: (mode: 'rotate' | 'pan') => void;
  zoomToFitTrigger: number;
  triggerZoomToFit: () => void;

  // Actions — objects
  addObject: (obj: STLObject, recordUndo?: boolean) => void;
  removeObject: (id: string, recordUndo?: boolean) => void;
  updateObject: (id: string, updates: Partial<STLObject>) => void;
  clearObjects: () => void;

  // Actions — selection
  selectObject: (id: string, multi?: boolean) => void;
  deselectAll: () => void;

  // Actions — tools & transform submodes
  setActiveTool: (tool: EditorTool) => void;
  setTransformSubmode: (submode: TransformSubmode) => void;
  setRenderMode: (mode: RenderMode) => void;
  setCameraPreset: (preset: CameraPreset) => void;

  // Actions — connectors
  setConnectorShape: (shape: ConnectorShape) => void;
  setConnectorOperation: (op: ConnectorOperation) => void;
  setConnectorRadiusMm: (r: number) => void;
  setConnectorPoints: (pts: { source: THREE.Vector3 | null; target: THREE.Vector3 | null }) => void;
  clearConnectorPoints: () => void;

  // Actions — Snapping
  setSnappingEnabled: (enabled: boolean) => void;
  setSnapTranslation: (snap: number) => void;
  setSnapRotationDeg: (snapDeg: number) => void;

  // Actions — Passthrough
  setPassthroughMode: (on: boolean) => void;

  // Actions — Breach Detection
  setBreachDetectionEnabled: (on: boolean) => void;
  setBreachAlerts: (alerts: BreachAlert[]) => void;

  // Actions — TKR Planning
  setTkrState: (updates: Partial<TKRPlanningState>) => void;
  resetTkrState: () => void;

  // Actions — cut plane
  setCutPlanePosition: (pos: [number, number, number]) => void;
  setCutPlaneRotation: (rot: [number, number, number]) => void;

  // Islands / Shells Feature
  shells: MeshShell[];
  selectedShellIndices: number[];
  hoveredShellIndex: number | null;
  islandsLoading: boolean;
  colorByShellsMode: boolean;
  minSplitFaces: number;
  faceToShellMap: Map<string, Uint32Array>;
  setShells: (shells: MeshShell[]) => void;
  setSelectedShellIndices: (indices: number[]) => void;
  toggleShellSelection: (index: number) => void;
  setHoveredShellIndex: (index: number | null) => void;
  setIslandsLoading: (loading: boolean) => void;
  setColorByShellsMode: (enabled: boolean) => void;
  setMinSplitFaces: (val: number) => void;
  setFaceToShellMap: (objId: string, map: Uint32Array) => void;

  // Mesh Surface Region-Growing Tool
  meshRegionGrowAngleDeg: number;
  meshRegionGrowRadiusMm: number;
  meshRegionGrowSelectedFaces: number[];
  meshRegionGrowSeedFace: number | null;
  setMeshRegionGrowAngleDeg: (deg: number) => void;
  setMeshRegionGrowRadiusMm: (r: number) => void;
  setMeshRegionGrowSelectedFaces: (faces: number[]) => void;
  setMeshRegionGrowSeedFace: (faceIdx: number | null) => void;
  clearMeshRegionGrow: () => void;

  // Phase 2: Mechanical Axis Submode
  mechanicalAxisSubmode: MechanicalAxisSubtype;
  setMechanicalAxisSubmode: (submode: MechanicalAxisSubtype) => void;

  // Phase 2: 1-Click Ghost Mirror Overlay
  ghostOverlay: GhostMirrorOverlay | null;
  toggleMirrorGhostOverlay: () => void;
  clearGhostOverlay: () => void;

  // Phase 2: Measurement Log & 1-Click Snapshot
  showMeasurementLog: boolean;
  setShowMeasurementLog: (show: boolean) => void;
  snapshotExportTrigger: number;
  triggerSnapshotExport: () => void;

  // Actions — measurements
  addMeasurementDraftPoint: (point: THREE.Vector3) => void;
  clearMeasurementDraft: () => void;
  commitMeasurement: (m: Measurement3D) => void;
  removeMeasurement: (id: string) => void;
  clearAllMeasurements: () => void;

  // Actions — transforms (with undo tracking)
  setTransform: (
    id: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
  resetTransform: (id: string) => void;

  // Actions — undo/redo
  pushUndo: (op: EditOperation) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}


const DEFAULT_TKR_STATE: TKRPlanningState = {
  active: false,
  isLocked: true, // Locked in current release
  femoralResectionDepth: 9.0,
  femoralValgusAngle: 6.0,
  femoralFlexionAngle: 3.0,
  femoralExternalRotation: 3.0,
  tibialResectionDepth: 8.0,
  tibialPosteriorSlope: 3.0,
  tibialVarusValgus: 0.0,
  femoralSize: 'Size 4',
  tibialSize: 'Size 4',
  insertThicknessMm: 10.0,
  activeResectionTarget: 'femur',
  showCutPlanes: true,
  showMechanicalAxis: true,
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  objects: new Map(),
  selectedIds: new Set(),
  activeTool: 'transform',
  transformSubmode: 'translate',
  cutPlane: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    normal: new THREE.Vector3(0, 0, 1),
  },

  // Connectors
  connectorShape: 'cylinder',
  connectorOperation: 'join',
  connectorRadiusMm: 4.0,
  connectorPoints: { source: null, target: null },

  renderMode: 'solid',
  cameraPreset: 'free',
  cameraPresetTrigger: 0,
  ribbonTab: 'home',

  // Snapping default
  snappingEnabled: false,
  snapTranslation: 1.0, // 1 mm
  snapRotationDeg: 15.0, // 15 deg

  // Passthrough
  passthroughMode: false,

  // Breach Detection
  breachDetectionEnabled: true,
  breachAlerts: [],

  // TKR Planning
  tkrState: DEFAULT_TKR_STATE,

  // Hover tracking
  hoveredObjectId: null,
  setHoveredObjectId: (id) => set({ hoveredObjectId: id }),

  // Touch & Mobile Viewport Navigation
  touchGestureMode: 'rotate',
  setTouchGestureMode: (mode) => set({ touchGestureMode: mode }),
  zoomToFitTrigger: 0,
  triggerZoomToFit: () => set((state) => ({ zoomToFitTrigger: state.zoomToFitTrigger + 1 })),


  // Islands / Shells Feature
  shells: [],
  selectedShellIndices: [],
  hoveredShellIndex: null,
  islandsLoading: false,
  colorByShellsMode: true,
  minSplitFaces: 150,
  faceToShellMap: new Map(),
  setShells: (shells) => set({ shells }),
  setSelectedShellIndices: (indices) => set({ selectedShellIndices: indices }),
  toggleShellSelection: (index) =>
    set((state) => {
      const exists = state.selectedShellIndices.includes(index);
      return {
        selectedShellIndices: exists
          ? state.selectedShellIndices.filter((i) => i !== index)
          : [...state.selectedShellIndices, index],
      };
    }),
  setHoveredShellIndex: (idx) => set({ hoveredShellIndex: idx }),
  setIslandsLoading: (loading) => set({ islandsLoading: loading }),
  setColorByShellsMode: (enabled) => set({ colorByShellsMode: enabled }),
  setMinSplitFaces: (val) => set({ minSplitFaces: val }),
  setFaceToShellMap: (objId, map) =>
    set((state) => {
      const next = new Map(state.faceToShellMap);
      next.set(objId, map);
      return { faceToShellMap: next };
    }),


  // Mesh Surface Region-Growing Tool
  meshRegionGrowAngleDeg: 45.0,
  meshRegionGrowRadiusMm: 30.0,
  meshRegionGrowSelectedFaces: [],
  meshRegionGrowSeedFace: null,
  setMeshRegionGrowAngleDeg: (deg) => set({ meshRegionGrowAngleDeg: deg }),
  setMeshRegionGrowRadiusMm: (r) => set({ meshRegionGrowRadiusMm: r }),
  setMeshRegionGrowSelectedFaces: (faces) => set({ meshRegionGrowSelectedFaces: faces }),
  setMeshRegionGrowSeedFace: (faceIdx) => set({ meshRegionGrowSeedFace: faceIdx }),
  clearMeshRegionGrow: () => set({ meshRegionGrowSelectedFaces: [], meshRegionGrowSeedFace: null }),

  // Phase 2: Mechanical Axis Submode
  mechanicalAxisSubmode: 'hka',
  setMechanicalAxisSubmode: (submode) => set({ mechanicalAxisSubmode: submode, measurementDraftPoints: [] }),

  // Phase 2: 1-Click Ghost Mirror Overlay
  ghostOverlay: null,
  toggleMirrorGhostOverlay: () => {
    const state = get();
    if (state.ghostOverlay) {
      set({ ghostOverlay: null });
      return;
    }
    const sel = Array.from(state.selectedIds);
    const targetObj = sel.length > 0 ? state.objects.get(sel[0]) : Array.from(state.objects.values())[0];
    if (!targetObj || !targetObj.geometry) return;

    // Flip along X (Sagittal midline mirror)
    const clonedGeo = targetObj.geometry.clone();
    set({
      ghostOverlay: {
        visible: true,
        sourceId: targetObj.id,
        name: `Ghost Mirror: ${targetObj.name}`,
        geometry: clonedGeo,
        position: [...targetObj.position] as [number, number, number],
        rotation: [...targetObj.rotation] as [number, number, number],
        scale: [-targetObj.scale[0], targetObj.scale[1], targetObj.scale[2]] as [number, number, number],
      },
    });
  },
  clearGhostOverlay: () => set({ ghostOverlay: null }),

  // Phase 2: Measurement Log & 1-Click Snapshot
  showMeasurementLog: false,
  setShowMeasurementLog: (show) => set({ showMeasurementLog: show }),
  snapshotExportTrigger: 0,
  triggerSnapshotExport: () => set((state) => ({ snapshotExportTrigger: state.snapshotExportTrigger + 1 })),

  measurements: [],
  measurementDraftPoints: [],
  undoStack: [],
  redoStack: [],
  clipboard: [],

  // ── Objects ───────────────────────────────────────────

  addObject: (obj, recordUndo = true) =>
    set((state) => {
      let finalObj = { ...obj };
      const geo = obj.geometry;
      if (geo) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        if (geo.boundingBox) {
          const center = new THREE.Vector3();
          geo.boundingBox.getCenter(center);
          // If geometry vertices have a center offset from local origin, center the geometry and shift position
          if (center.lengthSq() > 1e-4) {
            const clonedGeo = geo.clone();
            clonedGeo.translate(-center.x, -center.y, -center.z);
            clonedGeo.computeBoundingBox();
            clonedGeo.computeVertexNormals();

            const euler = new THREE.Euler(...(obj.rotation || [0, 0, 0]));
            const scaleVec = new THREE.Vector3(...(obj.scale || [1, 1, 1]));
            const worldOffset = center.clone().multiply(scaleVec).applyEuler(euler);

            const newPos: [number, number, number] = [
              (obj.position ? obj.position[0] : 0) + worldOffset.x,
              (obj.position ? obj.position[1] : 0) + worldOffset.y,
              (obj.position ? obj.position[2] : 0) + worldOffset.z,
            ];

            finalObj = {
              ...obj,
              geometry: clonedGeo,
              position: newPos,
              initialPosition: newPos,
              initialRotation: obj.rotation ? [...obj.rotation] : [0, 0, 0],
              initialScale: obj.scale ? [...obj.scale] : [1, 1, 1],
            };
          } else if (!finalObj.initialPosition) {
            finalObj = {
              ...finalObj,
              initialPosition: obj.position ? [...obj.position] : [0, 0, 0],
              initialRotation: obj.rotation ? [...obj.rotation] : [0, 0, 0],
              initialScale: obj.scale ? [...obj.scale] : [1, 1, 1],
            };
          }
        }
      }

      const next = new Map(state.objects);
      next.set(finalObj.id, finalObj);
      const sel = new Set([finalObj.id]);

      if (recordUndo) {
        const before = new Map<string, STLObject | null>([[finalObj.id, null]]);
        const after = new Map<string, STLObject | null>([[finalObj.id, { ...finalObj }]]);
        const op: EditOperation = {
          type: 'add',
          timestamp: Date.now(),
          before,
          after,
        };
        return {
          objects: next,
          selectedIds: sel,
          zoomToFitTrigger: state.zoomToFitTrigger + 1,
          undoStack: [...state.undoStack, op],
          redoStack: [],
        };
      }

      // Auto-trigger zoom-to-fit when a new model is added
      return { objects: next, selectedIds: sel, zoomToFitTrigger: state.zoomToFitTrigger + 1 };
    }),

  removeObject: (id, recordUndo = true) =>
    set((state) => {
      const obj = state.objects.get(id);
      const next = new Map(state.objects);
      next.delete(id);
      const sel = new Set(state.selectedIds);
      sel.delete(id);

      if (recordUndo && obj) {
        const before = new Map<string, STLObject | null>([[id, { ...obj }]]);
        const after = new Map<string, STLObject | null>([[id, null]]);
        const op: EditOperation = {
          type: 'delete',
          timestamp: Date.now(),
          before,
          after,
        };
        return {
          objects: next,
          selectedIds: sel,
          undoStack: [...state.undoStack, op],
          redoStack: [],
        };
      }

      return { objects: next, selectedIds: sel };
    }),

  updateObject: (id, updates) =>
    set((state) => {
      const next = new Map(state.objects);
      const obj = next.get(id);
      if (obj) next.set(id, { ...obj, ...updates });
      return { objects: next };
    }),

  clearObjects: () =>
    set({ objects: new Map(), selectedIds: new Set(), undoStack: [], redoStack: [] }),

  // ── Selection ─────────────────────────────────────────

  selectObject: (id, multi = false) =>
    set((state) => {
      const sel = multi ? new Set(state.selectedIds) : new Set<string>();
      if (sel.has(id)) {
        sel.delete(id);
      } else {
        sel.add(id);
      }
      return { selectedIds: sel };
    }),

  deselectAll: () => set({ selectedIds: new Set() }),

  // ── Tools & Submodes ──────────────────────────────────

  setActiveTool: (tool) => {
    if (tool === 'translate') {
      set({ activeTool: 'transform', transformSubmode: 'translate', measurementDraftPoints: [], connectorPoints: { source: null, target: null } });
    } else if (tool === 'rotate') {
      set({ activeTool: 'transform', transformSubmode: 'rotate', measurementDraftPoints: [], connectorPoints: { source: null, target: null } });
    } else if (tool === 'scale') {
      set({ activeTool: 'transform', transformSubmode: 'scaleUniform', measurementDraftPoints: [], connectorPoints: { source: null, target: null } });
    } else {
      set({ activeTool: tool, measurementDraftPoints: [], connectorPoints: { source: null, target: null } });
    }
  },

  setTransformSubmode: (submode) => set({ transformSubmode: submode }),
  setRibbonTab: (tab) => set({ ribbonTab: tab }),
  setRenderMode: (mode) => set({ renderMode: mode }),
  setCameraPreset: (preset) =>
    set((state) => ({
      cameraPreset: preset,
      cameraPresetTrigger: state.cameraPresetTrigger + 1,
    })),

  // ── Connectors ────────────────────────────────────────

  setConnectorShape: (shape) => set({ connectorShape: shape }),
  setConnectorOperation: (op) => set({ connectorOperation: op }),
  setConnectorRadiusMm: (r) => set({ connectorRadiusMm: r }),
  setConnectorPoints: (pts) => set({ connectorPoints: pts }),
  clearConnectorPoints: () => set({ connectorPoints: { source: null, target: null } }),

  // ── Snapping ──────────────────────────────────────────

  setSnappingEnabled: (enabled) => set({ snappingEnabled: enabled }),
  setSnapTranslation: (snap) => set({ snapTranslation: snap }),
  setSnapRotationDeg: (snapDeg) => set({ snapRotationDeg: snapDeg }),

  // ── Passthrough Mode ──────────────────────────────────

  setPassthroughMode: (on) => set({ passthroughMode: on }),

  // ── Breach Detection ──────────────────────────────────

  setBreachDetectionEnabled: (on) => set({ breachDetectionEnabled: on }),
  setBreachAlerts: (alerts) => set({ breachAlerts: alerts }),

  // ── TKR Planning ──────────────────────────────────────

  setTkrState: (updates) =>
    set((state) => ({
      tkrState: { ...state.tkrState, ...updates },
    })),

  resetTkrState: () => set({ tkrState: DEFAULT_TKR_STATE }),

  // ── Cut Plane ─────────────────────────────────────────

  setCutPlanePosition: (pos) =>
    set((state) => ({
      cutPlane: { ...state.cutPlane, position: pos },
    })),

  setCutPlaneRotation: (rot) =>
    set((state) => {
      const euler = new THREE.Euler(rot[0], rot[1], rot[2]);
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(euler).normalize();
      return {
        cutPlane: { ...state.cutPlane, rotation: rot, normal },
      };
    }),

  // ── Measurements ──────────────────────────────────────

  addMeasurementDraftPoint: (point) =>
    set((state) => ({
      measurementDraftPoints: [...state.measurementDraftPoints, point.clone()],
    })),

  clearMeasurementDraft: () => set({ measurementDraftPoints: [] }),

  commitMeasurement: (m) =>
    set((state) => ({
      measurements: [...state.measurements, m],
      measurementDraftPoints: [],
    })),

  removeMeasurement: (id) =>
    set((state) => ({
      measurements: state.measurements.filter((m) => m.id !== id),
    })),

  clearAllMeasurements: () =>
    set({ measurements: [], measurementDraftPoints: [] }),

  // ── Clipboard & Duplication ────────────────────────────

  copySelected: () => {
    const state = get();
    const sel = state.selectedIds;
    const items: STLObject[] = [];
    sel.forEach((id) => {
      const obj = state.objects.get(id);
      if (obj) {
        items.push({
          ...obj,
          geometry: obj.geometry.clone(),
          position: [...obj.position] as [number, number, number],
          rotation: [...obj.rotation] as [number, number, number],
          scale: [...obj.scale] as [number, number, number],
        });
      }
    });
    set({ clipboard: items });
    return items;
  },

  pasteClipboard: () => {
    const state = get();
    if (!state.clipboard || state.clipboard.length === 0) return [];

    const before = new Map<string, STLObject | null>();
    const after = new Map<string, STLObject | null>();
    const newIds: string[] = [];
    const next = new Map(state.objects);

    state.clipboard.forEach((item, index) => {
      const newId = `stl_copy_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
      const newObj: STLObject = {
        ...item,
        id: newId,
        name: `${item.name} (Copy)`,
        geometry: item.geometry.clone(),
        position: [item.position[0] + 15, item.position[1] + 15, item.position[2]],
        rotation: [...item.rotation] as [number, number, number],
        scale: [...item.scale] as [number, number, number],
      };
      next.set(newId, newObj);
      before.set(newId, null);
      after.set(newId, newObj);
      newIds.push(newId);
    });

    const op: EditOperation = {
      type: 'paste',
      timestamp: Date.now(),
      before,
      after,
    };

    set({
      objects: next,
      selectedIds: new Set(newIds),
      undoStack: [...state.undoStack, op],
      redoStack: [],
    });

    return newIds;
  },

  duplicateSelected: () => {
    const state = get();
    const sel = state.selectedIds;
    if (sel.size === 0) return [];

    const before = new Map<string, STLObject | null>();
    const after = new Map<string, STLObject | null>();
    const newIds: string[] = [];
    const next = new Map(state.objects);

    let idx = 0;
    sel.forEach((id) => {
      const obj = state.objects.get(id);
      if (obj) {
        const newId = `stl_dup_${Date.now()}_${idx++}_${Math.random().toString(36).slice(2, 6)}`;
        const newObj: STLObject = {
          ...obj,
          id: newId,
          name: `${obj.name} (Copy)`,
          geometry: obj.geometry.clone(),
          position: [obj.position[0] + 15, obj.position[1] + 15, obj.position[2]],
          rotation: [...obj.rotation] as [number, number, number],
          scale: [...obj.scale] as [number, number, number],
        };
        next.set(newId, newObj);
        before.set(newId, null);
        after.set(newId, newObj);
        newIds.push(newId);
      }
    });

    if (newIds.length === 0) return [];

    const op: EditOperation = {
      type: 'duplicate',
      timestamp: Date.now(),
      before,
      after,
    };

    set({
      objects: next,
      selectedIds: new Set(newIds),
      undoStack: [...state.undoStack, op],
      redoStack: [],
    });

    return newIds;
  },

  deleteSelected: () => {
    const state = get();
    const sel = state.selectedIds;
    if (sel.size === 0) return;

    const before = new Map<string, STLObject | null>();
    const after = new Map<string, STLObject | null>();
    const next = new Map(state.objects);

    sel.forEach((id) => {
      const obj = state.objects.get(id);
      if (obj) {
        before.set(id, { ...obj });
        after.set(id, null);
        next.delete(id);
      }
    });

    const op: EditOperation = {
      type: 'delete',
      timestamp: Date.now(),
      before,
      after,
    };

    set({
      objects: next,
      selectedIds: new Set(),
      undoStack: [...state.undoStack, op],
      redoStack: [],
    });
  },

  // ── Transforms (tracked for undo) ─────────────────────

  setTransform: (id, position, rotation, scale) => {
    const state = get();
    const obj = state.objects.get(id);
    if (!obj) return;

    const beforeObj: STLObject = {
      ...obj,
      position: [...obj.position] as [number, number, number],
      rotation: [...obj.rotation] as [number, number, number],
      scale: [...obj.scale] as [number, number, number],
    };
    const afterObj: STLObject = { ...obj, position, rotation, scale };

    const before = new Map<string, STLObject | null>([[id, beforeObj]]);
    const after = new Map<string, STLObject | null>([[id, afterObj]]);

    const op: EditOperation = {
      type: 'transform',
      timestamp: Date.now(),
      before,
      after,
    };

    set((state) => {
      const next = new Map(state.objects);
      next.set(id, afterObj);
      return {
        objects: next,
        undoStack: [...state.undoStack, op],
        redoStack: [],
      };
    });
  },

  resetTransform: (id) => {
    const state = get();
    const obj = state.objects.get(id);
    if (!obj) return;

    const beforeObj: STLObject = {
      ...obj,
      position: [...obj.position] as [number, number, number],
      rotation: [...obj.rotation] as [number, number, number],
      scale: [...obj.scale] as [number, number, number],
    };
    const targetPos = obj.initialPosition ? [...obj.initialPosition] as [number, number, number] : [...obj.position] as [number, number, number];
    const targetRot = obj.initialRotation ? [...obj.initialRotation] as [number, number, number] : [0, 0, 0] as [number, number, number];
    const targetScale = obj.initialScale ? [...obj.initialScale] as [number, number, number] : [1, 1, 1] as [number, number, number];
    const afterObj: STLObject = { ...obj, position: targetPos, rotation: targetRot, scale: targetScale };

    const before = new Map<string, STLObject | null>([[id, beforeObj]]);
    const after = new Map<string, STLObject | null>([[id, afterObj]]);

    const op: EditOperation = {
      type: 'reset_transform',
      timestamp: Date.now(),
      before,
      after,
    };

    set((state) => {
      const next = new Map(state.objects);
      next.set(id, afterObj);
      return {
        objects: next,
        undoStack: [...state.undoStack, op],
        redoStack: [],
      };
    });
  },

  // ── Undo/Redo ─────────────────────────────────────────

  pushUndo: (op) =>
    set((state) => ({
      undoStack: [...state.undoStack, op],
      redoStack: [],
    })),

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;

    const op = state.undoStack[state.undoStack.length - 1];
    const next = new Map(state.objects);
    const restoredSel = new Set<string>();

    op.before.forEach((snapshot, id) => {
      if (snapshot === null) {
        next.delete(id);
      } else {
        next.set(id, snapshot);
        restoredSel.add(id);
      }
    });

    set({
      objects: next,
      selectedIds: restoredSel.size > 0 ? restoredSel : state.selectedIds,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, op],
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;

    const op = state.redoStack[state.redoStack.length - 1];
    const next = new Map(state.objects);
    const redoneSel = new Set<string>();

    op.after.forEach((snapshot, id) => {
      if (snapshot === null) {
        next.delete(id);
      } else {
        next.set(id, snapshot);
        redoneSel.add(id);
      }
    });

    set({
      objects: next,
      selectedIds: redoneSel.size > 0 ? redoneSel : state.selectedIds,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, op],
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
