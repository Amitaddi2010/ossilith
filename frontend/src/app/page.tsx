'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowRight,
  Plus,
  FolderOpen,
  Cpu,
  Layers,
  Box,
  Scissors,
  CheckCircle2,
  Trash2,
  Sparkles,
  ShieldCheck,
  Activity,
  Layers3,
  Sliders,
  Printer,
  ChevronRight,
  Eye,
  RotateCw,
  Search,
  Check,
  Zap,
  Lock,
  Download,
  Flame,
  FileCheck,
  Crosshair,
  Maximize2,
  ExternalLink,
  Key,
} from 'lucide-react';
import { useCaseStore } from '@/stores/caseStore';
import { useLicenseStore } from '@/stores/licenseStore';
import { getHealth, type HealthResponse } from '@/lib/api';
import { LicenseActivationModal } from '@/components/license/LicenseActivationModal';


import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';


/* ── Interactive 3D Hero Foot Canvas (Foot.stl) ────────── */

function HeroInteractiveFoot({ renderMode }: { renderMode: 'solid' | 'wireframe' | 'xray' }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const loader = new STLLoader();
    loader.load(
      '/models/Foot.stl',
      (geo) => {
        geo.computeVertexNormals();
        geo.center();
        geo.computeBoundingSphere();
        setGeometry(geo);
      },
      undefined,
      (err) => {
        console.warn('Could not load Foot.stl, using fallback', err);
      }
    );
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.45;
    }
  });

  if (!geometry) {
    return (
      <mesh>
        <boxGeometry args={[15, 15, 15]} />
        <meshStandardMaterial color="#cbd5e1" wireframe />
      </mesh>
    );
  }

  // Scale Foot.stl dynamically so it is 100% visible inside the viewport
  const radius = geometry.boundingSphere?.radius || 100;
  const targetScale = 38 / radius;

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        scale={[targetScale, targetScale, targetScale]}
        rotation={[-Math.PI / 2 + 0.35, 0, -0.3]}
        castShadow
        receiveShadow
      >
        {renderMode === 'solid' && (
          <meshPhysicalMaterial
            color="#e6dfd1"
            roughness={0.42}
            metalness={0.06}
            clearcoat={0.25}
            clearcoatRoughness={0.3}
            side={THREE.DoubleSide}
          />
        )}
        {renderMode === 'wireframe' && (
          <meshBasicMaterial color="#0f3e17" wireframe side={THREE.DoubleSide} />
        )}
        {renderMode === 'xray' && (
          <meshPhysicalMaterial
            color="#38bdf8"
            transparent
            opacity={0.42}
            roughness={0.1}
            metalness={0.2}
            transmission={0.85}
            ior={1.3}
            side={THREE.DoubleSide}
          />
        )}
      </mesh>
    </Float>
  );
}


/* ── Service indicator ──────────────────────────────────── */

function ServiceTag({ name, status }: { name: string; status: string }) {
  const isOk = status === 'ok';
  return (
    <div className="pill-badge" style={{ fontSize: 11, padding: '4px 10px' }}>
      <div className={isOk ? 'status-dot-live' : 'status-dot-warn'} />
      <span style={{ textTransform: 'capitalize', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
        {name}: {status}
      </span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const cases = useCaseStore((s) => s.cases);
  const loading = useCaseStore((s) => s.loading);
  const fetchCases = useCaseStore((s) => s.fetchCases);
  const createCase = useCaseStore((s) => s.createCase);
  const deleteCase = useCaseStore((s) => s.deleteCase);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive Hero 3D state
  const [heroRenderMode, setHeroRenderMode] = useState<'solid' | 'wireframe' | 'xray'>('solid');

  // Interactive Pipeline Station state
  const [activeStage, setActiveStage] = useState<number>(1);
  const [mprSlice, setMprSlice] = useState<number>(64);
  const [huWindow, setHuWindow] = useState<'bone' | 'soft' | 'lung'>('bone');
  const [aiPromptCount, setAiPromptCount] = useState<number>(3);
  const [osteotomyAngle, setOsteotomyAngle] = useState<number>(12);
  const [selectedImplant, setSelectedImplant] = useState<string>('DCP Plate 3.5mm');

  // License management
  const { status: licenseStatus, loadLicense, openModal: openLicenseModal } = useLicenseStore();

  useEffect(() => {
    fetchCases();
    getHealth()
      .then(setHealth)
      .catch(() => {});
    loadLicense();

    if (typeof window !== 'undefined') {
      const isCasesPath =
        window.location.pathname === '/cases' ||
        window.location.hash === '#cases-section' ||
        window.location.hash === '#active-cases';
      if (isCasesPath) {
        setTimeout(() => {
          const el = document.getElementById('active-cases');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 120);
      }
    }
  }, [fetchCases, loadLicense]);




  const handleCreateCase = async () => {
    if (!newCaseName.trim()) return;
    try {
      const c = await createCase(newCaseName.trim());
      setShowNewCase(false);
      setNewCaseName('');
      router.push(`/cases/${c.id}/import`);
    } catch {
      // error handled in store
    }
  };

  const filteredCases = cases.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-cream-paper)' }}>
      {/* ── Top Navigation Bar ─────────────────────────── */}
      <header
        style={{
          borderBottom: '1px solid var(--color-border-mist)',
          backgroundColor: 'rgba(255, 254, 252, 0.92)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <nav
          style={{
            padding: '16px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: 'var(--page-max-width)',
            margin: '0 auto',
            width: '100%',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: 'var(--color-forest-ink)',
                boxShadow: '0 0 0 3px var(--color-keylime-wash)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '24px',
                fontWeight: 600,
                color: 'var(--color-forest-ink)',
                letterSpacing: '-0.02em',
              }}
            >
              Ossilith
            </span>
            <span className="pill-badge" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 4 }}>
              Hospital LAN Only
            </span>
          </div>

          {/* Health status badges & Navigation */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {health &&
              health.services &&
              Object.entries(health.services).map(([name, svc]: [string, any]) => (
                <ServiceTag key={name} name={name} status={svc?.status || 'unknown'} />
              ))}
            <button
              className="btn btn-sm"
              onClick={openLicenseModal}
              style={{
                gap: 6,
                backgroundColor: licenseStatus?.is_valid && !licenseStatus?.is_trial
                  ? 'rgba(16, 185, 129, 0.12)'
                  : licenseStatus?.is_valid && licenseStatus?.is_trial
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
                color: licenseStatus?.is_valid && !licenseStatus?.is_trial
                  ? '#059669'
                  : licenseStatus?.is_valid && licenseStatus?.is_trial
                  ? '#d97706'
                  : '#dc2626',
                border: `1px solid ${
                  licenseStatus?.is_valid && !licenseStatus?.is_trial
                    ? 'rgba(16, 185, 129, 0.3)'
                    : licenseStatus?.is_valid && licenseStatus?.is_trial
                    ? 'rgba(245, 158, 11, 0.3)'
                    : 'rgba(239, 68, 68, 0.3)'
                }`,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Key size={13} />
              {licenseStatus?.is_valid
                ? licenseStatus.is_trial
                  ? `TRIAL (${licenseStatus.days_remaining}d)`
                  : 'PRO CLINICAL'
                : 'ACTIVATE'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => router.push('/editor')} style={{ gap: 6 }}>
              <Box size={14} color="var(--color-forest-ink)" /> 3D CAD Studio
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewCase(true)} style={{ gap: 6 }}>
              <Plus size={14} /> New Case
            </button>

          </div>
        </nav>
      </header>

      {/* ── Main Content Container ─────────────────────── */}
      <main className="container" style={{ flex: 1, paddingBottom: 80 }}>
        {/* ── 1. Hero Split Section with Live 3D Canvas ──── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 24,
            marginTop: 28,
            marginBottom: 64,
            alignItems: 'stretch',
          }}
        >
          {/* Hero Left: Editorial Headline & Value Prop */}
          <div
            className="panel-keylime animate-fade-in-up"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '36px 32px',
              borderRadius: 18,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span className="pill-badge" style={{ backgroundColor: '#fff', color: 'var(--color-forest-ink)', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5 }}>
                  ✦ CLINICAL-GRADE ORTHOPEDIC SUITE
                </span>
              </div>
              <h1 style={{ marginBottom: 18, fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.25 }}>
                From Volumetric CT DICOM to Patient-Specific 3D Surgical CAD.
              </h1>
              <p style={{ fontSize: 15, color: 'var(--color-charcoal)', maxWidth: 520, lineHeight: 1.6, marginBottom: 24 }}>
                Automated multi-planar reconstruction, interactive neural click segmentation via <strong>nnInteractive</strong>, and real-time osteotomy plane cuts with ASTM F3001 3D print validation on your local GPU.
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <button
                  className="btn btn-primary btn-hero"
                  onClick={() => setShowNewCase(true)}
                  style={{ gap: 8 }}
                >
                  Start New Case <ArrowRight size={18} />
                </button>
                <button
                  className="btn btn-secondary btn-hero"
                  onClick={() => router.push('/editor')}
                  style={{ backgroundColor: '#fff', gap: 8 }}
                >
                  <Box size={16} /> Open 3D Editor
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 16, borderTop: '1px solid rgba(15, 62, 23, 0.12)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-forest-ink)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <ShieldCheck size={15} /> 100% Local GPU Execution
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-forest-ink)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <Lock size={14} /> Zero Cloud Telemetry
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-forest-ink)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <Printer size={15} /> Direct 3D Slicer Handoff
                </span>
              </div>
            </div>
          </div>

          {/* Hero Right: Live Interactive 3D Showcase Card */}
          <div
            className="panel-slate animate-fade-in-up stagger-2"
            style={{
              borderRadius: 18,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 380,
            }}
          >
            {/* Top Toolbar in Hero 3D Card */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-forest-ink)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  LIVE INTERACTIVE 3D PREVIEW
                </span>
                <div style={{ fontSize: 12, color: 'var(--color-forest-ink)', fontWeight: 600 }}>
                  Patient Foot & Ankle Anatomy (Foot.stl)
                </div>
              </div>

              {/* Shading mode switch */}
              <div style={{ display: 'flex', backgroundColor: '#fff', padding: 2, borderRadius: 8, border: '1px solid var(--color-border-mist)', gap: 2 }}>
                {(['solid', 'wireframe', 'xray'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setHeroRenderMode(mode)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 10,
                      textTransform: 'capitalize',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: heroRenderMode === mode ? 'var(--color-keylime-wash)' : 'transparent',
                      color: heroRenderMode === mode ? 'var(--color-forest-ink)' : 'var(--color-muted)',
                      fontWeight: heroRenderMode === mode ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Embedded 3D Canvas */}
            <div style={{ width: '100%', height: 260, position: 'relative', touchAction: 'none' }}>
              <Canvas camera={{ position: [45, 30, 60], fov: 45, near: 0.1, far: 1000 }}>
                <ambientLight intensity={0.75} />
                <directionalLight position={[20, 30, 25]} intensity={1.4} />
                <directionalLight position={[-20, -10, -20]} intensity={0.5} color="#38bdf8" />
                <HeroInteractiveFoot renderMode={heroRenderMode} />
                <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.0} />
              </Canvas>
            </div>

            {/* Live Metrics Readout */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(6px)',
                borderRadius: 10,
                padding: '8px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid var(--color-border-mist)',
                zIndex: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <span style={{ fontSize: 9.5, color: 'var(--color-muted)', display: 'block' }}>FACES</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-forest-ink)' }}>64,792</span>
                </div>

                <div>
                  <span style={{ fontSize: 9.5, color: 'var(--color-muted)', display: 'block' }}>PRINT QC</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ ASTM F3001</span>
                </div>
                <div>
                  <span style={{ fontSize: 9.5, color: 'var(--color-muted)', display: 'block' }}>SURGICAL DRIFT</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-forest-ink)' }}>0.00 mm</span>
                </div>
              </div>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => router.push('/editor')}
                style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}
              >
                Launch Studio <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </section>

        {/* ── 2. Interactive 5-Stage Pipeline Explorer ───── */}
        <section style={{ marginBottom: 64 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <span className="eyebrow-label" style={{ color: 'var(--color-forest-ink)' }}>INTERACTIVE WORKSTATION PIPELINE</span>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', marginTop: 4 }}>
              Experience the 5 Clinical Processing Stages
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-muted)', maxWidth: 540, margin: '6px auto 0' }}>
              Click any stage below to test the interactive surgical simulation widgets.
            </p>
          </div>

          {/* Stepper Navigation Pills */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: 20,
            }}
          >
            {[
              { id: 1, label: 'Stage 1 · DICOM Ingestion', icon: FolderOpen },
              { id: 2, label: 'Stage 2 · 2D MPR Slicing', icon: Layers },
              { id: 3, label: 'Stage 3 · nnInteractive AI', icon: Cpu },
              { id: 4, label: 'Stage 4 · Mesh & Netfabb QC', icon: Sparkles },
              { id: 5, label: 'Stage 5 · 3D CAD & 3D Print', icon: Scissors },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveStage(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: activeStage === id ? 700 : 500,
                  border: '1px solid',
                  borderColor: activeStage === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                  backgroundColor: activeStage === id ? 'var(--color-forest-ink)' : '#fff',
                  color: activeStage === id ? '#fff' : 'var(--color-charcoal)',
                  cursor: 'pointer',
                  boxShadow: activeStage === id ? '0 4px 12px rgba(15, 62, 23, 0.15)' : 'none',
                  transition: 'all 150ms ease',
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Stage Interactive Interactive Sandbox Card */}
          <div
            className="panel-sage animate-fade-in"
            style={{
              borderRadius: 20,
              padding: '32px 28px',
              border: '1px solid var(--color-border-mist)',
              backgroundColor: '#fff',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* ── STAGE 1 INTERACTIVE SANDBOX ── */}
            {activeStage === 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
                <div>
                  <span className="pill-badge" style={{ backgroundColor: 'var(--color-keylime-wash)', color: 'var(--color-forest-ink)', marginBottom: 8 }}>
                    STAGE 1 OF 5
                  </span>
                  <h3 style={{ fontSize: 22, marginBottom: 8 }}>DICOM Ingestion & Hounsfield Pre-flight</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--color-charcoal)', lineHeight: 1.5, marginBottom: 16 }}>
                    Batch folder ingestion with automatic slice spacing alignment, orientation tags validation, and instant Hounsfield Unit (HU) windowing calibration.
                  </p>
                  
                  {/* HU Window Presets */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', display: 'block', marginBottom: 6 }}>
                    SELECT HU WINDOW CALIBRATION:
                  </span>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {[
                      { id: 'bone' as const, label: 'Bone (W:2000 L:400)' },
                      { id: 'soft' as const, label: 'Soft Tissue (W:350 L:40)' },
                      { id: 'lung' as const, label: 'Lung (W:1500 L:-600)' },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setHuWindow(id)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 11,
                          borderRadius: 8,
                          border: '1px solid',
                          borderColor: huWindow === id ? 'var(--color-forest-ink)' : 'var(--color-border-mist)',
                          backgroundColor: huWindow === id ? 'var(--color-keylime-wash)' : '#fff',
                          color: 'var(--color-forest-ink)',
                          fontWeight: huWindow === id ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--color-surface-sunken)', padding: 20, borderRadius: 14, border: '1px solid var(--color-border-mist)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-forest-ink)' }}>PRE-FLIGHT VALIDATION REPORT</span>
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Passed</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-muted)' }}>Pixel Spacing:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>0.742 mm × 0.742 mm</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-muted)' }}>Slice Thickness:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>0.625 mm (Isotropic)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-muted)' }}>Total Slices:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>384 Axials</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STAGE 2 INTERACTIVE SANDBOX ── */}
            {activeStage === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
                <div>
                  <span className="pill-badge" style={{ backgroundColor: 'var(--color-keylime-wash)', color: 'var(--color-forest-ink)', marginBottom: 8 }}>
                    STAGE 2 OF 5
                  </span>
                  <h3 style={{ fontSize: 22, marginBottom: 8 }}>Synchronized Multi-Planar Reconstruction (MPR)</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--color-charcoal)', lineHeight: 1.5, marginBottom: 16 }}>
                    Real-time tri-planar crosshair synchronization. Drag the interactive slice scrubber below to navigate slice coordinates:
                  </p>

                  <div style={{ backgroundColor: 'var(--color-surface-sunken)', padding: 14, borderRadius: 12, border: '1px solid var(--color-border-mist)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-forest-ink)' }}>AXIAL SLICE POSITION:</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-forest-ink)' }}>Slice #{mprSlice} / 128</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={128}
                      value={mprSlice}
                      onChange={(e) => setMprSlice(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--color-forest-ink)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {['Axial View', 'Coronal View', 'Sagittal View'].map((plane, idx) => (
                    <div
                      key={plane}
                      style={{
                        backgroundColor: '#111827',
                        borderRadius: 10,
                        padding: 8,
                        height: 140,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        border: '1px solid #374151',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{plane}</span>
                      <div
                        style={{
                          position: 'absolute',
                          top: `${(mprSlice / 128) * 100}%`,
                          left: 0,
                          right: 0,
                          height: 1,
                          backgroundColor: '#22c55e',
                          boxShadow: '0 0 4px #22c55e',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }} />
                      </div>
                      <span style={{ fontSize: 9, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>Z: {(mprSlice * 0.625).toFixed(1)}mm</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── STAGE 3 INTERACTIVE SANDBOX ── */}
            {activeStage === 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
                <div>
                  <span className="pill-badge" style={{ backgroundColor: 'var(--color-keylime-wash)', color: 'var(--color-forest-ink)', marginBottom: 8 }}>
                    STAGE 3 OF 5
                  </span>
                  <h3 style={{ fontSize: 22, marginBottom: 8 }}>TotalSegmentator + nnInteractive Dual AI Suite</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--color-charcoal)', lineHeight: 1.5, marginBottom: 14 }}>
                    Choose between <strong>1-click TotalSegmentator Auto-Segmentation</strong> (117+ organs, bones, vessels, and muscles) or <strong>nnInteractive click-prompt guidance</strong>:
                  </p>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setAiPromptCount((prev) => Math.min(10, prev + 1))}
                      style={{ gap: 6, backgroundColor: '#059669', borderColor: '#059669' }}
                    >
                      <Sparkles size={13} /> TotalSegmentator (117+ Classes)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setAiPromptCount(1)}
                    >
                      Reset
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-muted)' }}>
                    <span>⚡ Engine: <strong>TotalSegmentator v2.0 + nnUNet</strong></span>
                    <span>🎯 Spatial Accuracy: <strong>Dice 0.942 ± 0.02 · Sub-Millimeter</strong></span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#0f172a', borderRadius: 14, padding: 18, border: '1px solid #1e293b', position: 'relative', height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {/* Multi-compartment anatomy preview */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        backgroundColor: 'rgba(230, 213, 172, 0.2)',
                        border: '1.5px solid #E6D5AC',
                        color: '#E6D5AC',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      🦴 Femur / Skeleton
                    </div>
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        backgroundColor: 'rgba(217, 83, 79, 0.2)',
                        border: '1.5px solid #D9534F',
                        color: '#F87171',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      🫀 Liver & Viscera
                    </div>
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        backgroundColor: 'rgba(56, 189, 248, 0.2)',
                        border: '1.5px solid #38BDF8',
                        color: '#38BDF8',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      🫁 Pulmonary
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STAGE 4 INTERACTIVE SANDBOX ── */}
            {activeStage === 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
                <div>
                  <span className="pill-badge" style={{ backgroundColor: 'var(--color-keylime-wash)', color: 'var(--color-forest-ink)', marginBottom: 8 }}>
                    STAGE 4 OF 5
                  </span>
                  <h3 style={{ fontSize: 22, marginBottom: 8 }}>Watertight Marching Cubes & Netfabb QC</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--color-charcoal)', lineHeight: 1.5, marginBottom: 16 }}>
                    High-speed isosurface extraction with automated ASTM F3001 printability diagnostics and 1-click mesh auto-healing.
                  </p>
                  
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div className="pill-badge" style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: 11.5 }}>
                      ✓ Manifold: 100% Watertight
                    </div>
                    <div className="pill-badge" style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: 11.5 }}>
                      ✓ 0 Self-Intersections
                    </div>
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--color-surface-sunken)', padding: 18, borderRadius: 14, border: '1px solid var(--color-border-mist)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-forest-ink)' }}>PRINTABILITY HEALTH SCORE</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>98.6% (Ready)</span>
                  </div>
                  <div style={{ height: 6, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: '98.6%', height: '100%', backgroundColor: '#16a34a' }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── STAGE 5 INTERACTIVE SANDBOX ── */}
            {activeStage === 5 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
                <div>
                  <span className="pill-badge" style={{ backgroundColor: 'var(--color-keylime-wash)', color: 'var(--color-forest-ink)', marginBottom: 8 }}>
                    STAGE 5 OF 5
                  </span>
                  <h3 style={{ fontSize: 22, marginBottom: 8 }}>3D Surgical CAD Studio & Direct Slicer Export</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--color-charcoal)', lineHeight: 1.5, marginBottom: 16 }}>
                    Perform zero-drift osteotomies, place 2-point parametric connectors, attach titanium implants, and export directly to slicing software:
                  </p>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['Bambu Studio', 'OrcaSlicer', 'FlashPrint', 'Creality Print', 'Cura'].map((slicer) => (
                      <span
                        key={slicer}
                        style={{
                          padding: '4px 8px',
                          fontSize: 10.5,
                          borderRadius: 6,
                          backgroundColor: 'var(--color-keylime-wash)',
                          color: 'var(--color-forest-ink)',
                          fontWeight: 600,
                          border: '1px solid var(--color-sage-mist)',
                        }}
                      >
                        🖨️ {slicer}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--color-surface-sunken)', padding: 18, borderRadius: 14, border: '1px solid var(--color-border-mist)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-forest-ink)', display: 'block', marginBottom: 8 }}>
                    OSTEOTOMY CUT ANGLE SIMULATOR:
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>Sagittal Angle:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-forest-ink)' }}>{osteotomyAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={osteotomyAngle}
                    onChange={(e) => setOsteotomyAngle(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-forest-ink)' }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── 3. Active Patient Workstation Cases ─────────── */}
        <section id="active-cases" style={{ scrollMarginTop: 24 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="eyebrow-label">WORKSTATION CASE MANAGER</span>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', marginTop: 2 }}>Active Clinical Cases</h2>
            </div>

            {/* Search filter bar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} color="var(--color-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search cases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 12px 6px 30px',
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid var(--color-border-mist)',
                    backgroundColor: '#fff',
                    outline: 'none',
                    minWidth: 180,
                  }}
                />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewCase(true)} style={{ gap: 4 }}>
                <Plus size={13} /> New Case
              </button>
            </div>
          </div>

          {/* New Case Creation Inline Form */}
          {showNewCase && (
            <div className="panel-sage animate-fade-in" style={{ marginBottom: 24, borderRadius: 14, padding: 20 }}>
              <span className="eyebrow-label">CREATE CASE</span>
              <h4 style={{ marginBottom: 10 }}>New Patient Surgical Planning Case</h4>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder="e.g. Patient #1042 — Mandibular Reconstruction"
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                  autoFocus
                  style={{ flex: 1, minWidth: 260 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleCreateCase}
                  disabled={!newCaseName.trim()}
                >
                  Create & Import
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowNewCase(false);
                    setNewCaseName('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cases Grid */}
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="panel-keylime" style={{ textAlign: 'center', padding: '48px 20px', borderRadius: 16 }}>
              <FolderOpen size={36} color="var(--color-forest-ink)" style={{ margin: '0 auto 12px', opacity: 0.7 }} />
              <h3 style={{ marginBottom: 6 }}>No Active Patient Cases Found</h3>
              <p style={{ color: 'var(--color-muted)', fontSize: 13, maxWidth: 400, margin: '0 auto 18px' }}>
                Create a new surgical case to import whole DICOM series or start with the standalone 3D CAD editor.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewCase(true)}>
                  <Plus size={14} /> Create First Case
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => router.push('/editor')}>
                  <Box size={14} /> Standalone 3D Editor
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {filteredCases.map((c) => (
                <div
                  key={c.id}
                  className="panel-product-inner animate-fade-in"
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    padding: 18,
                    border: '1px solid var(--color-border-mist)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 14,
                    transition: 'all 150ms ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                        CASE #{c.id.slice(0, 8)}
                      </span>
                      <span className="pill-badge" style={{ fontSize: 10, backgroundColor: 'var(--color-keylime-wash)', color: 'var(--color-forest-ink)' }}>
                        {c.status || 'Active'}
                      </span>
                    </div>

                    <h4 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-forest-ink)', marginBottom: 4 }}>
                      {c.name}
                    </h4>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      Created {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--color-border-mist)', flexWrap: 'wrap' }}>
                    {(!c.status || c.status === 'created' || c.status === 'importing' || c.status === 'imported') ? (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/import`)}
                          style={{ flex: 1, fontSize: 11, gap: 4 }}
                        >
                          <span>Stage 1: Import DICOM</span>
                          <ArrowRight size={12} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/segment`)}
                          style={{ fontSize: 11 }}
                          title="Open AI Segmentation"
                        >
                          AI Segment
                        </button>
                      </>
                    ) : (c.status === 'ready' || c.status === 'segmenting') ? (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/segment`)}
                          style={{ flex: 1, fontSize: 11, gap: 4, backgroundColor: '#059669', borderColor: '#059669' }}
                        >
                          <Sparkles size={12} />
                          <span>Stage 3: AI Segment</span>
                          <ArrowRight size={12} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/import`)}
                          style={{ fontSize: 11 }}
                          title="Re-inspect DICOM series"
                        >
                          DICOM
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/editor`)}
                          style={{ fontSize: 11 }}
                          title="Open 3D Planning"
                        >
                          3D CAD
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/editor`)}
                          style={{ flex: 1, fontSize: 11, gap: 4 }}
                        >
                          <span>Stage 4: 3D Planning</span>
                          <ArrowRight size={12} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => router.push(`/cases/${c.id}/segment`)}
                          style={{ fontSize: 11 }}
                          title="Review Segmentation"
                        >
                          Segment
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => deleteCase(c.id)}
                      title="Delete Case"
                      style={{ padding: '6px 8px', color: '#dc2626' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--color-border-mist)', padding: '24px 28px', backgroundColor: '#fff', marginTop: 'auto' }}>
        <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, color: 'var(--color-forest-ink)' }}>
              Ossilith Surgical Systems
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>· Clinical 3D Orthopedic CAD</span>
          </div>

          <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--color-muted)' }}>
            <span>ASTM F3001 Validation</span>
            <span>·</span>
            <span>nnInteractive AI</span>
            <span>·</span>
            <span>Hospital LAN Isolated</span>
          </div>
        </div>
      </footer>

      {/* ── License Activation Modal ────────────────────── */}
      <LicenseActivationModal />
    </div>
  );
}

