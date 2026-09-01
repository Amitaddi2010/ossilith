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
  Layers,
  FileCode,
  Lock,
  ExternalLink,
  X,
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
      }, 1800);
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
      }, 1800);
    }
  };

  const isPro = status?.is_valid && !status?.is_trial;
  const isTrial = status?.is_valid && status?.is_trial;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-800/60 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                Ossilith Software Licensing
                {isPro && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                    PRO CLINICAL
                  </span>
                )}
                {isTrial && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium">
                    TRIAL ({status?.days_remaining}d left)
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Machine-bound cryptographic software protection & activation
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Status Alert Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Machine Hardware ID Section */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Target Machine Hardware ID (HWID)
              </label>
              <span className="text-[11px] text-zinc-500">Provide this to your vendor/admin</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={hwid || status?.hwid || 'Detecting hardware...'}
                className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-cyan-300 tracking-wider focus:outline-none"
              />
              <button
                onClick={handleCopyHwid}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 border border-zinc-700"
              >
                {copiedHwid ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy HWID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* License Activation Form */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-emerald-400" />
              Enter Digitally-Signed License Key
            </label>
            <textarea
              rows={3}
              placeholder="Paste your signed license string (e.g. eyJjdXN0b21lciI6...)"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value)}
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                onClick={handleActivate}
                disabled={isActivating || !licenseKeyInput.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {isActivating ? 'Verifying Ed25519 Signature...' : 'Activate License Key'}
              </button>

              {!isPro && !isTrial && (
                <button
                  onClick={handleStartTrial}
                  disabled={isActivating}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded-xl border border-zinc-700/80 transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Start 14-Day Free Evaluation
                </button>
              )}
            </div>
          </div>

          {/* Included Features Matrix */}
          <div className="pt-2">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Included Clinical Modules & Capabilities
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>TotalSegmentator v2.0 & MONAI 1.6</span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Zero Joint-Breach Watershed Engine</span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Multi-Bone Shell Splitting & CAD</span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Medical STL / 3MF 3D Print Export</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/60 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-500">
          <span>Ossilith v0.1.0 • Offline Cryptographic Protection</span>
          <button
            onClick={closeModal}
            className="px-4 py-1.5 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
