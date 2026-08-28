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
  | 'measure-angle';

export type TransformSubmode = 'translate' | 'rotate' | 'scaleUniform' | 'scaleNonUniform';

export type ConnectorShape = 'cylinder' | 'cuboid' | 'torus' | 'sphere' | 'cone';
export type ConnectorOperation = 'join' | 'subtract' | 'intersection';

export type RenderMode = 'solid' | 'wireframe' | 'xray';

export interface Measurement3D {
  id: string;
  type: 'distance' | 'angle';
  points: THREE.Vector3[];
  value: number; // mm or degrees
  label: string;
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
  before: Map<string, Partial<STLObject>>;
  after: Map<string, Partial<STLObject>>;
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

  // Undo/redo
  undoStack: EditOperation[];
  redoStack: EditOperation[];

  // Touch & Mobile Viewport Navigation
  touchGestureMode: 'rotate' | 'pan';
  setTouchGestureMode: (mode: 'rotate' | 'pan') => void;
  zoomToFitTrigger: number;
  triggerZoomToFit: () => void;

  // Actions — objects
  addObject: (obj: STLObject) => void;
  removeObject: (id: string) => void;
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

  // Touch & Mobile Viewport Navigation
  touchGestureMode: 'rotate',
  setTouchGestureMode: (mode) => set({ touchGestureMode: mode }),
  zoomToFitTrigger: 0,
  triggerZoomToFit: () => set((state) => ({ zoomToFitTrigger: state.zoomToFitTrigger + 1 })),


  measurements: [],
  measurementDraftPoints: [],
  undoStack: [],
  redoStack: [],


  // ── Objects ───────────────────────────────────────────

  addObject: (obj) =>
    set((state) => {
      const next = new Map(state.objects);
      next.set(obj.id, obj);
      return { objects: next };
    }),

  removeObject: (id) =>
    set((state) => {
      const next = new Map(state.objects);
      next.delete(id);
      const sel = new Set(state.selectedIds);
      sel.delete(id);
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
    set({ objects: new Map(), selectedIds: new Set() }),

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

  // ── Transforms (tracked for undo) ─────────────────────

  setTransform: (id, position, rotation, scale) => {
    const state = get();
    const obj = state.objects.get(id);
    if (!obj) return;

    const before = new Map<string, Partial<STLObject>>();
    before.set(id, {
      position: [...obj.position] as [number, number, number],
      rotation: [...obj.rotation] as [number, number, number],
      scale: [...obj.scale] as [number, number, number],
    });

    const after = new Map<string, Partial<STLObject>>();
    after.set(id, { position, rotation, scale });

    const op: EditOperation = {
      type: 'transform',
      timestamp: Date.now(),
      before,
      after,
    };

    set((state) => {
      const next = new Map(state.objects);
      const o = next.get(id);
      if (o) next.set(id, { ...o, position, rotation, scale });
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

    const before = new Map<string, Partial<STLObject>>();
    before.set(id, {
      position: [...obj.position] as [number, number, number],
      rotation: [...obj.rotation] as [number, number, number],
      scale: [...obj.scale] as [number, number, number],
    });

    const after = new Map<string, Partial<STLObject>>();
    after.set(id, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

    const op: EditOperation = {
      type: 'reset_transform',
      timestamp: Date.now(),
      before,
      after,
    };

    set((state) => {
      const next = new Map(state.objects);
      const o = next.get(id);
      if (o) next.set(id, { ...o, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
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

    op.before.forEach((snapshot, id) => {
      const obj = next.get(id);
      if (obj) next.set(id, { ...obj, ...snapshot });
    });

    set({
      objects: next,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, op],
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;

    const op = state.redoStack[state.redoStack.length - 1];
    const next = new Map(state.objects);

    op.after.forEach((snapshot, id) => {
      const obj = next.get(id);
      if (obj) next.set(id, { ...obj, ...snapshot });
    });

    set({
      objects: next,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, op],
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
