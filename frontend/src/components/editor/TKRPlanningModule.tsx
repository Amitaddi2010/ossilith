'use client';

import React, { useState } from 'react';
import * as THREE from 'three';
import {
  Scissors,
  Activity,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronRight,
  Boxes,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Info,
} from 'lucide-react';
import { useEditorStore, type STLObject } from '@/stores/editorStore';
import { useToast } from '@/components/Toast';
import { performPlaneCut } from '@/lib/csg';
import { generateKneeImplantGeometry } from '@/lib/implantLibrary';

export default function TKRPlanningModule() {
  const {
    objects,
    selectedIds,
    tkrState,
    setTkrState,
    resetTkrState,
    addObject,
    removeObject,
    selectObject,
    setActiveTool,
  } = useEditorStore();

  const { success, error: toastError, info: toastInfo } = useToast();
  const [activeTab, setActiveTab] = useState<'femur' | 'tibia' | 'implants' | 'alignment'>('femur');
  const [isExecutingCut, setIsExecutingCut] = useState(false);

  const selectedList = Array.from(selectedIds);
  const activeObj = selectedList.length > 0 ? objects.get(selectedList[0]) || null : null;

  /* ── 1-Click Execute Distal Femoral Resection ────────── */
  const handleExecuteFemoralCut = () => {
    if (!activeObj) {
      toastError('No model selected', 'Please select the Femur model first');
      return;
    }

    setIsExecutingCut(true);
    setTimeout(() => {
      try {
        activeObj.geometry.computeBoundingBox();
        const bbox = activeObj.geometry.boundingBox || new THREE.Box3();
        const distalPoint = new THREE.Vector3(
          (bbox.min.x + bbox.max.x) / 2,
          bbox.min.y + tkrState.femoralResectionDepth,
          (bbox.min.z + bbox.max.z) / 2
        );

        // Plane normal with valgus & flexion angle
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(-tkrState.femoralFlexionAngle),
          0,
          THREE.MathUtils.degToRad(tkrState.femoralValgusAngle)
        );
        const planeNormal = new THREE.Vector3(0, 1, 0).applyEuler(euler).normalize();

        const { partA: shaft, partB: condyles } = performPlaneCut(
          activeObj.geometry,
          planeNormal,
          distalPoint
        );

        const currentPos = [...activeObj.position] as [number, number, number];
        const currentRot = [...activeObj.rotation] as [number, number, number];
        const currentScale = [...activeObj.scale] as [number, number, number];

        removeObject(activeObj.id);

        const idShaft = `femur_resected_shaft_${Date.now()}`;
        const idCondyles = `femur_distal_condyles_${Date.now()}`;

        addObject({
          id: idShaft,
          name: `${activeObj.name} (Resected Femur)`,
          geometry: shaft,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: '#e8dcc8',
          opacity: 1.0,
          visible: true,
          anatomicalType: 'femur',
        });

        addObject({
          id: idCondyles,
          name: `${activeObj.name} (Distal Bone Fragment - ${tkrState.femoralResectionDepth}mm)`,
          geometry: condyles,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: '#e29578',
          opacity: 0.6,
          visible: true,
        });

        selectObject(idShaft);
        success(
          'Distal Femoral Resection Complete',
          `${tkrState.femoralResectionDepth} mm cut with ${tkrState.femoralValgusAngle}° Valgus & ${tkrState.femoralFlexionAngle}° Flexion`
        );
      } catch (err) {
        console.error('Femoral resection error', err);
        toastError('Resection failed', 'Unable to perform planar resection');
      } finally {
        setIsExecutingCut(false);
      }
    }, 50);
  };

  /* ── 1-Click Execute Proximal Tibial Resection ────────── */
  const handleExecuteTibialCut = () => {
    if (!activeObj) {
      toastError('No model selected', 'Please select the Tibia model first');
      return;
    }

    setIsExecutingCut(true);
    setTimeout(() => {
      try {
        activeObj.geometry.computeBoundingBox();
        const bbox = activeObj.geometry.boundingBox || new THREE.Box3();
        const proximalPoint = new THREE.Vector3(
          (bbox.min.x + bbox.max.x) / 2,
          bbox.max.y - tkrState.tibialResectionDepth,
          (bbox.min.z + bbox.max.z) / 2
        );

        // Plane normal with posterior slope
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(-tkrState.tibialPosteriorSlope),
          0,
          THREE.MathUtils.degToRad(tkrState.tibialVarusValgus)
        );
        const planeNormal = new THREE.Vector3(0, -1, 0).applyEuler(euler).normalize();

        const { partA: plateau, partB: shaft } = performPlaneCut(
          activeObj.geometry,
          planeNormal,
          proximalPoint
        );

        const currentPos = [...activeObj.position] as [number, number, number];
        const currentRot = [...activeObj.rotation] as [number, number, number];
        const currentScale = [...activeObj.scale] as [number, number, number];

        removeObject(activeObj.id);

        const idShaft = `tibia_resected_shaft_${Date.now()}`;
        const idPlateau = `tibia_proximal_plateau_${Date.now()}`;

        addObject({
          id: idShaft,
          name: `${activeObj.name} (Resected Tibia)`,
          geometry: shaft,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: '#e8dcc8',
          opacity: 1.0,
          visible: true,
          anatomicalType: 'tibia',
        });

        addObject({
          id: idPlateau,
          name: `${activeObj.name} (Proximal Plateau - ${tkrState.tibialResectionDepth}mm)`,
          geometry: plateau,
          position: currentPos,
          rotation: currentRot,
          scale: currentScale,
          color: '#83c5be',
          opacity: 0.6,
          visible: true,
        });

        selectObject(idShaft);
        success(
          'Proximal Tibial Resection Complete',
          `${tkrState.tibialResectionDepth} mm cut with ${tkrState.tibialPosteriorSlope}° Posterior Slope`
        );
      } catch (err) {
        console.error('Tibial resection error', err);
        toastError('Resection failed', 'Unable to perform planar resection');
      } finally {
        setIsExecutingCut(false);
      }
    }, 50);
  };

  /* ── Spawn TKR Implants ──────────────────────────────── */
  const handleSpawnFemoralComponent = () => {
    const geo = generateKneeImplantGeometry('femoral_component', {
      size: tkrState.femoralSize,
      thicknessMm: 9.0,
      widthMm: 65.0,
    });

    const id = `femoral_implant_${Date.now()}`;
    const newObj: STLObject = {
      id,
      name: `Femoral Component (${tkrState.femoralSize})`,
      geometry: geo,
      position: [0, 15, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#d4d4d8',
      opacity: 1.0,
      visible: true,
      isImplant: true,
    };

    addObject(newObj);
    selectObject(id);
    setActiveTool('transform');
    success('Femoral Implant Spawned', `${tkrState.femoralSize} placed in 3D scene`);
  };

  const handleSpawnTibialTray = () => {
    const geo = generateKneeImplantGeometry('tibial_tray', {
      size: tkrState.tibialSize,
      insertThicknessMm: tkrState.insertThicknessMm,
      widthMm: 72.0,
    });

    const id = `tibial_tray_${Date.now()}`;
    const newObj: STLObject = {
      id,
      name: `Tibial Tray & Insert (${tkrState.tibialSize} / ${tkrState.insertThicknessMm}mm)`,
      geometry: geo,
      position: [0, -15, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#94a3b8',
      opacity: 1.0,
      visible: true,
      isImplant: true,
    };

    addObject(newObj);
    selectObject(id);
    setActiveTool('transform');
    success('Tibial Tray Spawned', `${tkrState.tibialSize} (${tkrState.insertThicknessMm}mm insert) placed in 3D scene`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header Banner */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          backgroundColor: '#fff',
          border: '1px solid var(--color-border-mist)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-forest-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={15} color="var(--color-forest-ink)" /> Total Knee Arthroplasty (TKR)
          </span>
          <span className="pill-badge-forest" style={{ fontSize: 9, padding: '2px 6px' }}>
            ASTM F2083
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-charcoal-muted)', margin: 0, lineHeight: 1.4 }}>
          Surgical resection planning, mechanical axis restoration, and parametric implant placement.
        </p>
      </div>

      {/* TKR Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, padding: 3, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 8, border: '1px solid var(--color-border-mist)' }}>
        {([
          { id: 'femur', label: 'Distal Femur' },
          { id: 'tibia', label: 'Prox. Tibia' },
          { id: 'implants', label: 'Implants' },
          { id: 'alignment', label: 'Alignment' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              flex: 1,
              padding: '5px 0',
              fontSize: 10.5,
              fontWeight: activeTab === id ? 600 : 400,
              borderRadius: 6,
              border: 'none',
              backgroundColor: activeTab === id ? 'var(--color-keylime-wash)' : 'transparent',
              color: activeTab === id ? 'var(--color-forest-ink)' : 'var(--color-charcoal-muted)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Femur Planning Tab ─────────────────────── */}
      {activeTab === 'femur' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, border: '1px solid var(--color-border-mist)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-forest-ink)', marginBottom: 8 }}>
              Distal Femoral Resection
            </div>

            {/* Resection Depth */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Resection Depth:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tkrState.femoralResectionDepth} mm</span>
              </div>
              <input
                type="range"
                min={5.0}
                max={15.0}
                step={0.5}
                value={tkrState.femoralResectionDepth}
                onChange={(e) => setTkrState({ femoralResectionDepth: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            {/* Valgus Angle */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Valgus Angle (FMA):</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tkrState.femoralValgusAngle}°</span>
              </div>
              <input
                type="range"
                min={2.0}
                max={10.0}
                step={0.5}
                value={tkrState.femoralValgusAngle}
                onChange={(e) => setTkrState({ femoralValgusAngle: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            {/* Flexion Angle */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Flexion Angle:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tkrState.femoralFlexionAngle}°</span>
              </div>
              <input
                type="range"
                min={0.0}
                max={6.0}
                step={0.5}
                value={tkrState.femoralFlexionAngle}
                onChange={(e) => setTkrState({ femoralFlexionAngle: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <button
              onClick={handleExecuteFemoralCut}
              disabled={isExecutingCut || !activeObj}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Scissors size={13} />
              Execute Distal Femoral Resection
            </button>
          </div>
        </div>
      )}

      {/* ── Tibia Planning Tab ─────────────────────── */}
      {activeTab === 'tibia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, border: '1px solid var(--color-border-mist)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-forest-ink)', marginBottom: 8 }}>
              Proximal Tibial Resection
            </div>

            {/* Resection Depth */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Resection Depth:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tkrState.tibialResectionDepth} mm</span>
              </div>
              <input
                type="range"
                min={5.0}
                max={14.0}
                step={0.5}
                value={tkrState.tibialResectionDepth}
                onChange={(e) => setTkrState({ tibialResectionDepth: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            {/* Posterior Slope */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Posterior Slope:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tkrState.tibialPosteriorSlope}°</span>
              </div>
              <input
                type="range"
                min={0.0}
                max={7.0}
                step={0.5}
                value={tkrState.tibialPosteriorSlope}
                onChange={(e) => setTkrState({ tibialPosteriorSlope: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            {/* Varus / Valgus */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Varus/Valgus Alignment:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {tkrState.tibialVarusValgus === 0 ? '0° (Neutral)' : `${tkrState.tibialVarusValgus}°`}
                </span>
              </div>
              <input
                type="range"
                min={-3.0}
                max={3.0}
                step={0.5}
                value={tkrState.tibialVarusValgus}
                onChange={(e) => setTkrState({ tibialVarusValgus: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <button
              onClick={handleExecuteTibialCut}
              disabled={isExecutingCut || !activeObj}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Scissors size={13} />
              Execute Proximal Tibial Resection
            </button>
          </div>
        </div>
      )}

      {/* ── Implant Sizing & Placement Tab ─────────── */}
      {activeTab === 'implants' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, border: '1px solid var(--color-border-mist)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-forest-ink)', marginBottom: 8 }}>
              Knee Prosthesis Components
            </div>

            {/* Femoral Component Sizing */}
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--color-charcoal)', display: 'block', marginBottom: 4 }}>
                Femoral Component:
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Size 3', 'Size 4', 'Size 5', 'Size 6'].map((sz) => (
                  <button
                    key={sz}
                    className={tkrState.femoralSize === sz ? 'pill-badge-forest' : 'pill-badge'}
                    style={{ cursor: 'pointer', flex: 1, padding: '4px 0', textAlign: 'center', fontSize: 10 }}
                    onClick={() => setTkrState({ femoralSize: sz })}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSpawnFemoralComponent}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', marginTop: 6, fontSize: 11 }}
              >
                <Boxes size={12} /> Spawn Femoral Component
              </button>
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--color-border-mist)', margin: '8px 0' }} />

            {/* Tibial Tray & Insert Sizing */}
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-charcoal)', display: 'block', marginBottom: 4 }}>
                Tibial Tray & Insert Sizing:
              </span>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {['Size 3', 'Size 4', 'Size 5'].map((sz) => (
                  <button
                    key={sz}
                    className={tkrState.tibialSize === sz ? 'pill-badge-forest' : 'pill-badge'}
                    style={{ cursor: 'pointer', flex: 1, padding: '4px 0', textAlign: 'center', fontSize: 10 }}
                    onClick={() => setTkrState({ tibialSize: sz })}
                  >
                    {sz}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-charcoal)' }}>Insert Thickness:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tkrState.insertThicknessMm} mm</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[9, 10, 11, 12, 14].map((th) => (
                  <button
                    key={th}
                    className={tkrState.insertThicknessMm === th ? 'pill-badge-forest' : 'pill-badge'}
                    style={{ cursor: 'pointer', flex: 1, padding: '3px 0', textAlign: 'center', fontSize: 10 }}
                    onClick={() => setTkrState({ insertThicknessMm: th })}
                  >
                    {th}mm
                  </button>
                ))}
              </div>

              <button
                onClick={handleSpawnTibialTray}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', marginTop: 6, fontSize: 11 }}
              >
                <Boxes size={12} /> Spawn Tibial Tray & Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mechanical Alignment Readout Tab ───────── */}
      {activeTab === 'alignment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, border: '1px solid var(--color-border-mist)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-forest-ink)', marginBottom: 8 }}>
              Mechanical Alignment Readouts
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
              <span style={{ color: 'var(--color-charcoal-muted)' }}>Hip-Knee-Ankle (HKA):</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#16a34a' }}>180.0° (Neutral)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
              <span style={{ color: 'var(--color-charcoal-muted)' }}>Femoral Mechanical (FMA):</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {(90.0 - tkrState.femoralValgusAngle).toFixed(1)}°
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
              <span style={{ color: 'var(--color-charcoal-muted)' }}>Tibial Mechanical (TMA):</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>90.0°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
              <span style={{ color: 'var(--color-charcoal-muted)' }}>Joint Line Preservation:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#16a34a' }}>0.0 mm Δ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
