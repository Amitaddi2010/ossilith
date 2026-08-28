'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Eye,
  Sliders,
  Sparkles,
  Layers,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────── */

interface ParsedSeries {
  id: string;
  series_instance_uid: string;
  modality: string;
  slice_count: number;
  pixel_spacing_x: number | null;
  pixel_spacing_y: number | null;
  slice_thickness: number | null;
  rows?: number;
  columns?: number;
  study_description?: string;
  series_description?: string;
}

type WizardStep = 'upload' | 'series' | 'preview' | 'building';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/* ── Import Wizard (Ease Health Theme) ─────────────────── */

export default function ImportPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [step, setStep] = useState<WizardStep>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [seriesList, setSeriesList] = useState<ParsedSeries[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildMessage, setBuildMessage] = useState('');

  // 2D Preview state
  const [previewSlice, setPreviewSlice] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);

  const selectedSeries = seriesList.find((s) => s.id === selectedSeriesId);

  /* ── Upload handler ──────────────────────────────────── */

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      try {
        const formData = new FormData();
        acceptedFiles.forEach((file) => formData.append('files', file));

        const res = await fetch(`${API_BASE}/api/cases/${caseId}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: 'Upload failed' }));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const list: ParsedSeries[] = data.series || [];
        setSeriesList(list);
        if (list.length > 0) {
          setSelectedSeriesId(list[0].id);
          setPreviewSlice(Math.floor(list[0].slice_count / 2));
        }
        setUploadProgress(100);
        setStep('series');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [caseId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/dicom': ['.dcm'],
      'application/octet-stream': ['.dcm'],
    },
    multiple: true,
  });

  /* ── Select series & build ───────────────────────────── */

  const handleBuildVolume = async () => {
    if (!selectedSeriesId) return;
    setStep('building');
    setBuildProgress(0);
    setBuildMessage('Starting volume reconstruction...');

    try {
      const res = await fetch(
        `${API_BASE}/api/cases/${caseId}/series/${selectedSeriesId}/select`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to start reconstruction');

      const data = await res.json();
      const jobId = data.job_id;

      // Subscribe to SSE for progress
      const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);
      es.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setBuildProgress(msg.progress || 0);
        setBuildMessage(msg.message || '');
        if (msg.status === 'completed') {
          es.close();
          router.push(`/cases/${caseId}/segment`);
        } else if (msg.status === 'failed') {
          es.close();
          setError(msg.error || 'Volume reconstruction failed');
          setStep('series');
        }
      };
      es.onerror = () => {
        es.close();
        setBuildMessage('Reconstruction processing in background...');
      };
    } catch (e) {
      setError((e as Error).message);
      setStep('series');
    }
  };

  return (
    <div className="page">
      {/* ── Top Header ────────────────────────────────── */}
      <header
        style={{
          padding: '20px 35px',
          borderBottom: '1px solid var(--color-border-mist)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push('/')}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 style={{ fontSize: 20, fontWeight: 400 }}>DICOM Import Wizard</h3>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Stage 1 & 2 · Case {caseId?.slice(0, 8)}…
            </span>
          </div>
        </div>

        {/* Step indicator pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['upload', 'series', 'preview', 'building'] as WizardStep[]).map((s, i) => {
            const steps: WizardStep[] = ['upload', 'series', 'preview', 'building'];
            const currentIndex = steps.indexOf(step);
            const isCurrent = step === s;
            const isDone = currentIndex > i;
            return (
              <div
                key={s}
                className={isCurrent ? 'pill-badge-forest' : isDone ? 'pill-badge-sage' : 'pill-badge'}
                style={{ fontSize: 11, textTransform: 'capitalize' }}
              >
                {i + 1}. {s}
              </div>
            );
          })}
        </div>
      </header>

      <main className="container" style={{ flex: 1, paddingTop: 40, paddingBottom: 60, maxWidth: step === 'preview' ? 1100 : 800 }}>
        {error && (
          <div
            className="animate-fade-in"
            style={{
              padding: '16px 20px',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: 'var(--radius-cards)',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 14,
            }}
          >
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {/* ── Step 1: Upload ──────────────────────────── */}
        {step === 'upload' && (
          <div className="animate-fade-in">
            <span className="eyebrow-label">STAGE 1 — DICOM INGESTION</span>
            <h2 style={{ marginBottom: 12 }}>Upload CT Series or Study ZIP</h2>
            <p style={{ marginBottom: 28, color: 'var(--color-charcoal)' }}>
              Drag and drop patient DICOM slices or a single compressed archive. Metadata validation will verify slice thickness, pixel spacing, and orientation.
            </p>

            <div
              {...getRootProps()}
              className="panel-keylime"
              style={{
                padding: '64px 32px',
                textAlign: 'center',
                cursor: 'pointer',
                border: isDragActive ? '2px dashed var(--color-forest-ink)' : '2px dashed var(--color-sage-mist)',
                transition: 'background-color 150ms ease',
              }}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <>
                  <Loader2
                    size={42}
                    color="var(--color-forest-ink)"
                    style={{ margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}
                  />
                  <h4 style={{ marginBottom: 8 }}>Validating DICOM Metadata...</h4>
                  <div className="progress-bar" style={{ maxWidth: 300, margin: '14px auto 0' }}>
                    <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-cream-paper)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    {isDragActive ? (
                      <FileArchive size={28} color="var(--color-forest-ink)" />
                    ) : (
                      <Upload size={28} color="var(--color-forest-ink)" />
                    )}
                  </div>
                  <h3 style={{ marginBottom: 6 }}>
                    {isDragActive ? 'Drop DICOM study here' : 'Click or drop DICOM files here'}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    Supports raw .dcm slice series and .zip archive packages
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Series Selection ────────────────── */}
        {step === 'series' && (
          <div className="animate-fade-in">
            <span className="eyebrow-label">SERIES GROUPING</span>
            <h2 style={{ marginBottom: 12 }}>Select Reconstructed Series</h2>
            <p style={{ marginBottom: 24 }}>
              Found {seriesList.length} distinct series in upload. Choose the primary CT volume:
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              {seriesList.map((series) => {
                const isSelected = selectedSeriesId === series.id;
                return (
                  <div
                    key={series.id}
                    className={isSelected ? 'panel-keylime' : 'panel-cream'}
                    style={{
                      border: isSelected ? '2px solid var(--color-forest-ink)' : '1px solid var(--color-border-mist)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      padding: '24px 28px',
                    }}
                    onClick={() => {
                      setSelectedSeriesId(series.id);
                      setPreviewSlice(Math.floor(series.slice_count / 2));
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span className="pill-badge-forest">{series.modality}</span>
                        <h4 style={{ fontSize: 17, fontWeight: 400, color: 'var(--color-forest-ink)' }}>
                          {series.series_description || `Series ${series.series_instance_uid.slice(0, 24)}…`}
                        </h4>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>
                        {series.slice_count} axial slices
                        {series.pixel_spacing_x && ` · Spacing: ${series.pixel_spacing_x.toFixed(2)} × ${series.pixel_spacing_y?.toFixed(2)} mm`}
                        {series.slice_thickness && ` · Thickness: ${series.slice_thickness.toFixed(2)} mm`}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 size={24} color="var(--color-forest-ink)" />}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 35 }}>
              <button className="btn btn-ghost" onClick={() => setStep('upload')}>
                <ArrowLeft size={16} /> Back
              </button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn btn-secondary"
                  disabled={!selectedSeriesId}
                  onClick={() => setStep('preview')}
                >
                  <Eye size={16} /> Preview Slices
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!selectedSeriesId}
                  onClick={handleBuildVolume}
                >
                  <Sparkles size={16} /> Build 3D Volume
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: 2D Preview ──────────────────────── */}
        {step === 'preview' && selectedSeries && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
              <div>
                <span className="eyebrow-label">2D SLICE INSPECTION</span>
                <h2>Pre-Reconstruction Preview</h2>
              </div>
              <span className="pill-badge-sage">
                {selectedSeries.slice_count} Slices Verified
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
              {/* Slice Display Container */}
              <div className="panel-slate" style={{ padding: 20 }}>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '1/1',
                    maxHeight: 500,
                    backgroundColor: '#000',
                    borderRadius: 'var(--radius-cards)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_BASE}/api/cases/${caseId}/series/${selectedSeries.id}/slice/${previewSlice}`}
                    alt={`Slice ${previewSlice + 1}`}
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => setPreviewLoading(false)}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                  {previewLoading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                      <Loader2 size={32} color="var(--color-cream-paper)" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                </div>

                {/* Scrubber */}
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-forest-ink)', fontWeight: 600 }}>
                    Slice:
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, selectedSeries.slice_count - 1)}
                    value={previewSlice}
                    onChange={(e) => setPreviewSlice(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--color-forest-ink)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--color-forest-ink)', minWidth: 64, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {previewSlice + 1} / {selectedSeries.slice_count}
                  </span>
                </div>
              </div>

              {/* Metadata Panel */}
              <div className="panel-keylime" style={{ padding: 28 }}>
                <h4 style={{ marginBottom: 16, color: 'var(--color-forest-ink)', fontWeight: 400 }}>Series Metrics</h4>
                <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'block' }}>MODALITY</span>
                    <span style={{ fontWeight: 600 }}>{selectedSeries.modality}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'block' }}>SLICE COUNT</span>
                    <span>{selectedSeries.slice_count} slices</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'block' }}>PIXEL SPACING</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedSeries.pixel_spacing_x?.toFixed(3)} × {selectedSeries.pixel_spacing_y?.toFixed(3)} mm
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'block' }}>SLICE THICKNESS</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedSeries.slice_thickness?.toFixed(2)} mm</span>
                  </div>
                </div>

                <div style={{ marginTop: 32 }}>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleBuildVolume}>
                    <Sparkles size={16} /> Reconstruct Volume
                  </button>
                  <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep('series')}>
                    Change Series
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Building ────────────────────────── */}
        {step === 'building' && (
          <div className="panel-keylime animate-fade-in" style={{ textAlign: 'center', padding: '64px 32px' }}>
            <div className="spinner" style={{ width: 48, height: 48, borderWidth: 3, margin: '0 auto 20px' }} />
            <h2>Reconstructing 3D Volume</h2>
            <p style={{ marginTop: 8, marginBottom: 24, color: 'var(--color-charcoal)' }}>
              {buildMessage}
            </p>
            <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto' }}>
              <div className="progress-bar-fill" style={{ width: `${buildProgress}%` }} />
            </div>
            <div style={{ fontSize: 14, marginTop: 12, color: 'var(--color-forest-ink)', fontWeight: 600 }}>
              {buildProgress}%
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
