'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Plus,
  FolderOpen,
  Cpu,
  Layers3,
  Box,
  Scissors,
  CheckCircle2,
  Trash2,
  Sparkles,
  Activity,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useCaseStore } from '@/stores/caseStore';
import { getHealth, type HealthResponse } from '@/lib/api';

/* ── Service indicator ──────────────────────────────────── */

function ServiceTag({ name, status }: { name: string; status: string }) {
  const isOk = status === 'ok';
  return (
    <div className="pill-badge" style={{ fontSize: 11, padding: '4px 10px' }}>
      <div className={isOk ? 'status-dot-live' : 'status-dot-warn'} />
      <span style={{ textTransform: 'capitalize', fontFamily: 'var(--font-sans)' }}>
        {name}: {status}
      </span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { cases, loading, fetchCases, createCase, deleteCase } = useCaseStore();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCases();
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, [fetchCases]);

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

  return (
    <div className="page">
      {/* ── Top Navigation ────────────────────────────── */}
      <nav
        style={{
          padding: '24px 35px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: 'var(--color-forest-ink)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '22px',
              fontWeight: 400,
              color: 'var(--color-forest-ink)',
              letterSpacing: '-0.02em',
            }}
          >
            Ossilith
          </span>
          <span className="pill-badge" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 6 }}>
            LAN Only
          </span>
        </div>

        {/* Health status badges & Navigation */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {health &&
            Object.entries(health.services).map(([name, svc]) => (
              <ServiceTag key={name} name={name} status={svc.status} />
            ))}
          <button className="btn btn-secondary btn-sm" onClick={() => router.push('/editor')}>
            <Box size={14} /> Standalone 3D Planner
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewCase(true)}>
            <Plus size={14} /> New Case
          </button>
        </div>
      </nav>

      {/* ── Main Content Container ─────────────────────── */}
      <main className="container" style={{ flex: 1, paddingBottom: 80 }}>
        {/* ── Hero Split Section ──────────────────────── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '1.15fr 0.85fr',
            gap: 24,
            marginTop: 20,
            marginBottom: 64,
          }}
        >
          {/* Hero Left: Keylime Wash Panel */}
          <div className="panel-keylime animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span className="eyebrow-label">CLINICAL SURGICAL PLANNING</span>
              <h1 style={{ marginBottom: 20 }}>
                From CT DICOM to custom surgical guides on your local workstation.
              </h1>
              <p style={{ fontSize: 16, color: 'var(--color-charcoal)', maxWidth: 540, lineHeight: 1.6 }}>
                An end-to-end medical pipeline: automated volume reconstruction, interactive AI segmentation via nnInteractive, and real-time mesh plane cutting, Netfabb QC & implant library placement.
              </p>
            </div>

            <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-hero"
                onClick={() => setShowNewCase(true)}
              >
                Start New Case <ArrowRight size={18} />
              </button>
              <button
                className="btn btn-secondary btn-hero"
                onClick={() => router.push('/editor')}
                style={{ backgroundColor: '#fff' }}
              >
                <Box size={16} /> Standalone 3D Planner
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-forest-ink)', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                <ShieldCheck size={16} /> Hospital Network Isolated
              </span>
            </div>
          </div>

          {/* Hero Right: Slate Hush Showcase Panel */}
          <div className="panel-slate animate-fade-in-up stagger-2" style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
            <span className="eyebrow-label" style={{ color: 'var(--color-forest-ink)' }}>PIPELINE STAGES</span>

            {/* Inner Product Preview Cards */}
            <div className="panel-product-inner" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-nav)', backgroundColor: 'var(--color-keylime-wash)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FolderOpen size={18} color="var(--color-forest-ink)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-forest-ink)' }}>DICOM Import & Validation</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>pydicom spacing check & MPR 2D preview</div>
              </div>
            </div>

            <div className="panel-product-inner" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-nav)', backgroundColor: 'var(--color-mint-veil)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cpu size={18} color="var(--color-forest-ink)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-forest-ink)' }}>nnInteractive Segmentation</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Point clicks, bounding boxes, scribbles & lassos</div>
              </div>
            </div>

            <div className="panel-product-inner" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-nav)', backgroundColor: 'var(--color-sage-mist)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scissors size={18} color="var(--color-forest-ink)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-forest-ink)' }}>3D STL Surgical Planning</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Plane cuts, component splitting & boolean connectors</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Create New Case Modal / Inline ─────────── */}
        {showNewCase && (
          <section className="panel-sage animate-fade-in" style={{ marginBottom: 42 }}>
            <span className="eyebrow-label">CREATE CASE</span>
            <h3 style={{ marginBottom: 14 }}>New Surgical Planning Case</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                className="input"
                placeholder="e.g. Patient #1042 — Mandibular Reconstruction"
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                autoFocus
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
          </section>
        )}

        {/* ── Case List Section ───────────────────────── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
            <div>
              <span className="eyebrow-label">ACTIVE CASES</span>
              <h2>Patient Workstation Cases</h2>
            </div>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              {cases.length} {cases.length === 1 ? 'case' : 'cases'} on workstation
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : cases.length === 0 ? (
            <div className="panel-keylime" style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Box size={36} color="var(--color-forest-ink)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ marginBottom: 8 }}>No cases on this workstation yet</h3>
              <p style={{ color: 'var(--color-muted)', marginBottom: 20 }}>
                Upload a DICOM series or study ZIP to begin 3D volume reconstruction and interactive planning.
              </p>
              <button className="btn btn-primary" onClick={() => setShowNewCase(true)}>
                <Plus size={16} /> Create First Case
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {cases.map((c) => {
                const isImportDone = c.status !== 'created';
                const isVolumeDone = c.status === 'ready' || c.status === 'segmenting' || c.status === 'complete';
                const isSegmentDone = c.status === 'complete';

                return (
                  <div
                    key={c.id}
                    className="case-card animate-fade-in-up"
                    style={{
                      animationDelay: `${60 * cases.indexOf(c)}ms`,
                      animationFillMode: 'both',
                    }}
                    onClick={() => {
                      if (c.status === 'created' || c.status === 'importing') {
                        router.push(`/cases/${c.id}/import`);
                      } else if (c.status === 'complete') {
                        router.push(`/cases/${c.id}/editor`);
                      } else {
                        router.push(`/cases/${c.id}/segment`);
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 'var(--radius-cards)',
                          backgroundColor: isVolumeDone ? 'var(--color-mint-veil)' : 'var(--color-keylime-wash)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Activity size={20} color="var(--color-forest-ink)" />
                      </div>
                      <div>
                        <h4 style={{ fontSize: 18, fontWeight: 400, color: 'var(--color-forest-ink)' }}>{c.name}</h4>
                        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                          Created <span suppressHydrationWarning>{new Date(c.created_at).toLocaleDateString()}</span> · ID: {c.id.slice(0, 8)}…
                        </div>
                      </div>
                    </div>

                    {/* Pipeline Stage Stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      <div className="pipeline-stepper">
                        <div className={`pipeline-step ${isImportDone ? 'completed' : 'active'}`}>
                          <CheckCircle2 size={12} />
                          <span>1. Import</span>
                        </div>
                        <span style={{ color: 'var(--color-border-mist)' }}>→</span>
                        <div className={`pipeline-step ${isVolumeDone ? 'completed' : isImportDone ? 'active' : 'pending'}`}>
                          <Layers3 size={12} />
                          <span>2. Volume</span>
                        </div>
                        <span style={{ color: 'var(--color-border-mist)' }}>→</span>
                        <div className={`pipeline-step ${isSegmentDone ? 'completed' : isVolumeDone ? 'active' : 'pending'}`}>
                          <Cpu size={12} />
                          <span>3. Segment</span>
                        </div>
                        <span style={{ color: 'var(--color-border-mist)' }}>→</span>
                        <div className={`pipeline-step ${isSegmentDone ? 'active' : 'pending'}`}>
                          <Scissors size={12} />
                          <span>4. Plan 3D</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className="btn btn-ghost btn-icon"
                          title="Delete case"
                          disabled={deletingId === c.id}
                          style={{
                            transition: 'color 150ms ease, background-color 150ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#dc2626';
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--color-forest-ink)';
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Permanently delete case "${c.name}"?`)) {
                              setDeletingId(c.id);
                              await deleteCase(c.id);
                              setDeletingId(null);
                            }
                          }}
                        >
                          {deletingId === c.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                        <ArrowRight size={16} color="var(--color-forest-ink)" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid var(--color-border-mist)',
          padding: '24px 35px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--color-charcoal-muted)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 14, color: 'var(--color-forest-ink)' }}>Ossilith</span>
        <span style={{ margin: '0 8px', opacity: 0.3 }}>·</span>
        Surgical Planning Pipeline
        <span style={{ margin: '0 8px', opacity: 0.3 }}>·</span>
        Local Workstation Environment
      </footer>
    </div>
  );
}
