'use client';

import React, { useState, useEffect } from 'react';
import { useLicenseStore } from '@/stores/licenseStore';
import {
  Key,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Copy,
  Check,
  Sparkles,
  X,
  Lock,
  ExternalLink,
} from 'lucide-react';

export function LicenseActivationModal() {
  const {
    status,
    hwid,
    isLoading,
    isActivating,
    error,
    isModalOpen,
    closeModal,
    activate,
    startTrial,
    loadLicense,
  } = useLicenseStore();

  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [copiedHwid, setCopiedHwid] = useState(false);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isModalOpen) {
      loadLicense();
    }
  }, [isModalOpen, loadLicense]);

  if (!isModalOpen) return null;

  const handleCopyHwid = () => {
    const textToCopy = hwid || status?.hwid || '';
    if (textToCopy && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(textToCopy);
      setCopiedHwid(true);
      setTimeout(() => setCopiedHwid(false), 2500);
    }
  };

  const handleActivate = async () => {
    if (!licenseKeyInput.trim()) return;
    setSuccessMsg('');
    const ok = await activate(licenseKeyInput.trim());
    if (ok) {
      setSuccessMsg('License successfully verified & activated!');
      setTimeout(() => {
        setSuccessMsg('');
        closeModal();
      }, 1600);
    }
  };

  const handleStartTrial = async () => {
    setSuccessMsg('');
    const ok = await startTrial(customerNameInput || 'Clinical Evaluation User');
    if (ok) {
      setSuccessMsg('14-Day Clinical Evaluation Trial Activated!');
      setTimeout(() => {
        setSuccessMsg('');
        closeModal();
      }, 1600);
    }
  };

  const isPro = status?.is_valid && !status?.is_trial;
  const isTrial = status?.is_valid && status?.is_trial;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(12, 30, 16, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          backgroundColor: '#fffefc',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(12, 47, 16, 0.35), 0 4px 16px rgba(0,0,0,0.08)',
          border: '1px solid rgba(15, 62, 23, 0.16)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          animation: 'fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #efeeeb',
            backgroundColor: '#f7f6f3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: 'rgba(15, 62, 23, 0.08)',
                border: '1px solid rgba(15, 62, 23, 0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-forest-ink, #0f3e17)',
              }}
            >
              <Key size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--color-forest-ink, #0f3e17)',
                    fontFamily: 'var(--font-sans, system-ui)',
                  }}
                >
                  Ossilith Software Licensing
                </h3>
                {isPro && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 99,
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#059669',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    PRO CLINICAL
                  </span>
                )}
                {isTrial && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 99,
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: '#d97706',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    TRIAL ({status?.days_remaining}d left)
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7c6e', marginTop: 2 }}>
                Machine-bound cryptographic software protection & activation
              </p>
            </div>
          </div>

          <button
            onClick={closeModal}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7c6e',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Alerts */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#b91c1c',
                fontSize: 12.5,
              }}
            >
              <ShieldAlert size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#047857',
                fontSize: 12.5,
              }}
            >
              <ShieldCheck size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Machine HWID Section */}
          <div
            style={{
              padding: '16px',
              borderRadius: 14,
              backgroundColor: '#f7f6f3',
              border: '1px solid #efeeeb',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-forest-ink, #0f3e17)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Cpu size={15} color="#0f3e17" />
                Target Machine Hardware ID (HWID)
              </label>
              <span style={{ fontSize: 11, color: '#6b7c6e' }}>Provide this to your vendor/admin</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={hwid || status?.hwid || 'Detecting hardware...'}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  backgroundColor: '#fff',
                  border: '1px solid #d7e4d8',
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--color-forest-ink, #0f3e17)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleCopyHwid}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#fff',
                  border: '1px solid #d7e4d8',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--color-forest-ink, #0f3e17)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedHwid ? (
                  <>
                    <Check size={14} color="#059669" />
                    <span style={{ color: '#059669' }}>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy HWID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* License Key Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-forest-ink, #0f3e17)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Key size={15} color="#0f3e17" />
              Enter Digitally-Signed License Key
            </label>
            <textarea
              rows={3}
              placeholder="Paste your signed license string (e.g. eyJjdXN0b21lciI6...)"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#fff',
                border: '1px solid #d7e4d8',
                borderRadius: 12,
                fontSize: 11.5,
                fontFamily: 'var(--font-mono, monospace)',
                color: '#222',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.4,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 10 }}>
              <button
                onClick={handleActivate}
                disabled={isActivating || !licenseKeyInput.trim()}
                style={{
                  padding: '12px 22px',
                  backgroundColor: 'var(--color-forest-ink, #0f3e17)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: isActivating || !licenseKeyInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: isActivating || !licenseKeyInput.trim() ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(15, 62, 23, 0.2)',
                }}
              >
                <ShieldCheck size={16} />
                {isActivating ? 'Verifying Ed25519 Signature...' : 'Activate License Key'}
              </button>

              {!isPro && !isTrial && (
                <button
                  onClick={handleStartTrial}
                  disabled={isActivating}
                  style={{
                    padding: '12px 18px',
                    backgroundColor: '#fff',
                    color: 'var(--color-forest-ink, #0f3e17)',
                    border: '1px solid #d7e4d8',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Sparkles size={14} color="#d97706" />
                  Start 14-Day Free Evaluation
                </button>
              )}
            </div>
          </div>

          {/* Included Features Matrix */}
          <div style={{ paddingTop: 4 }}>
            <h4
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#6b7c6e',
                marginBottom: 10,
              }}
            >
              Included Clinical Modules & Capabilities
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                'TotalSegmentator v2.0 & MONAI 1.6',
                'Zero Joint-Breach Watershed Engine',
                'Multi-Bone Shell Splitting & CAD',
                'Medical STL / 3MF 3D Print Export',
              ].map((feat, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    backgroundColor: '#f7f6f3',
                    border: '1px solid #efeeeb',
                    fontSize: 11.5,
                    color: '#222',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Check size={14} color="#059669" style={{ flexShrink: 0 }} />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #efeeeb',
            backgroundColor: '#f7f6f3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#6b7c6e',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} />
            Ossilith v0.1.0 • Offline Cryptographic Protection
          </span>
          <button
            onClick={closeModal}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              color: '#222',
              borderRadius: 6,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
