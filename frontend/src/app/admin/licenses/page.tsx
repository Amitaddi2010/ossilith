'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import {
  fetchAdminLicenses,
  generateAdminLicense,
  revokeAdminLicense,
  fetchAdminStats,
  AdminLicenseRecord,
  AdminStats,
} from '@/lib/api';
import {
  Key,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Copy,
  Check,
  Sparkles,
  Download,
  Mail,
  UserCheck,
  Building,
  Calendar,
  Lock,
  Search,
  LogOut,
  Plus,
  RefreshCw,
  X,
  Layers,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

const AUTHORIZED_ADMIN_EMAILS = [
  'amit.addi2010@gmail.com',
];

export default function AdminLicensePage() {
  const router = useRouter();

  // ── Firebase Auth State ──
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('amit.addi2010@gmail.com');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);


  // ── License Management State ──
  const [licenses, setLicenses] = useState<AdminLicenseRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Generator Form State ──
  const [showGenerator, setShowGenerator] = useState(false);
  const [customer, setCustomer] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [hwid, setHwid] = useState('*');
  const [tier, setTier] = useState('CLINICAL_PRO');
  const [validDays, setValidDays] = useState(365);
  const [notes, setNotes] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([
    'dicom_import',
    'volume_reconstruction',
    'autoseg_totalseg',
    'autoseg_monai',
    'multi_bone_split',
    'surgical_cad',
    'stl_export',
  ]);

  // ── Generated Key Output Modal State ──
  const [generatedRecord, setGeneratedRecord] = useState<AdminLicenseRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Listen to Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email) {
        const authorized = AUTHORIZED_ADMIN_EMAILS.some(
          (adminEmail) => adminEmail.toLowerCase() === currentUser.email?.toLowerCase()
        );
        setIsAuthorized(authorized);
        if (!authorized) {
          setAuthError(`Access Restricted: Account "${currentUser.email}" is not authorized.`);
        } else {
          setAuthError(null);
        }
      } else {
        setIsAuthorized(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load licenses when authenticated & authorized
  useEffect(() => {
    if (user && isAuthorized) {
      loadData();
    }
  }, [user, isAuthorized]);


  const loadData = async () => {
    setIsLoading(true);
    try {
      const [licList, statsRes] = await Promise.all([
        fetchAdminLicenses(),
        fetchAdminStats(),
      ]);
      setLicenses(licList);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load admin license data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Auth Handlers ──
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Google sign in failed');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // ── Key Generation Handler ──
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer.trim()) return;

    try {
      const rec = await generateAdminLicense({
        customer: customer.trim(),
        organization: organization.trim() || 'General Hospital',
        email: email.trim() || 'surgeon@hospital.org',
        hwid: hwid.trim().toUpperCase() || '*',
        tier: tier.toUpperCase(),
        days: Number(validDays),
        features: selectedFeatures,
        notes: notes.trim(),
      });

      setGeneratedRecord(rec);
      setShowGenerator(false);
      // Reset form
      setCustomer('');
      setOrganization('');
      setEmail('');
      setHwid('*');
      setNotes('');
      loadData();
    } catch (err: any) {
      alert('Failed to generate license: ' + err.message);
    }
  };

  const handleRevoke = async (id: string, customerName: string) => {
    if (!confirm(`Are you sure you want to revoke the license for "${customerName}"?`)) return;
    try {
      await revokeAdminLicense(id, 'Revoked by vendor admin');
      loadData();
    } catch (err: any) {
      alert('Failed to revoke license: ' + err.message);
    }
  };

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleDownloadFile = (rec: AdminLicenseRecord) => {
    const blob = new Blob([rec.license_key], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ossilith_${rec.customer.replace(/\\s+/g, '_').toLowerCase()}.license`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 1. Render Firebase Login Screen if Not Authenticated ──
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefc' }}>
        <p style={{ fontSize: 14, color: '#0f3e17', fontWeight: 600 }}>Authenticating Secure Admin Session...</p>
      </div>
    );
  }

  if (!user || !isAuthorized) {

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f7f6f3',
          padding: 20,
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            backgroundColor: '#fff',
            borderRadius: 20,
            border: '1px solid #efeeeb',
            boxShadow: '0 20px 50px rgba(15, 62, 23, 0.08)',
            padding: '36px 32px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: 'rgba(15, 62, 23, 0.08)',
                color: '#0f3e17',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Lock size={24} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f3e17', margin: '0 0 6px 0' }}>
              Ossilith Master Admin
            </h2>
            <p style={{ fontSize: 13, color: '#6b7c6e', margin: 0 }}>
              Secure Ed25519 Cryptographic License & Customer Portal
            </p>
          </div>

          {authError && (
            <div
              style={{
                padding: '12px',
                borderRadius: 10,
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#b91c1c',
                fontSize: 12,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={15} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                Admin Email Address
              </label>
              <input
                type="email"
                required
                placeholder="admin@intellectspots.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #d7e4d8',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                Master Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #d7e4d8',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: 6,
                padding: '12px',
                backgroundColor: '#0f3e17',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15, 62, 23, 0.2)',
              }}
            >
              Sign In to Admin Portal
            </button>
          </form>

          <div style={{ margin: '18px 0', textAlign: 'center', position: 'relative' }}>
            <div style={{ height: 1, backgroundColor: '#efeeeb' }} />
            <span
              style={{
                position: 'relative',
                top: -9,
                backgroundColor: '#fff',
                padding: '0 10px',
                fontSize: 11,
                color: '#8b9b8e',
                textTransform: 'uppercase',
              }}
            >
              or
            </span>
          </div>

          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: '11px',
              backgroundColor: '#fff',
              border: '1px solid #d7e4d8',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: '#222',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            Sign in with Google
          </button>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              onClick={() => router.push('/')}
              style={{ background: 'none', border: 'none', color: '#6b7c6e', fontSize: 12, cursor: 'pointer' }}
            >
              ← Back to Surgical CAD Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. Authenticated Executive License Dashboard ──
  const filtered = licenses.filter(
    (l) =>
      l.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.hwid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.tier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f6f3', fontFamily: 'var(--font-sans, system-ui)' }}>
      {/* Top Admin Header */}
      <header
        style={{
          borderBottom: '1px solid #efeeeb',
          backgroundColor: '#fff',
          padding: '16px 32px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: '#0f3e17',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
              }}
            >
              <Key size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f3e17' }}>
                  Ossilith License Vault & Customer Management
                </h1>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 99,
                    backgroundColor: 'rgba(15, 62, 23, 0.08)',
                    color: '#0f3e17',
                    fontWeight: 700,
                  }}
                >
                  SECURE ED25519
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: '#6b7c6e' }}>
                Signed as {user.email} (Administrator)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '8px 14px',
                borderRadius: 9,
                border: '1px solid #d7e4d8',
                backgroundColor: '#fff',
                color: '#0f3e17',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← App Workspace
            </button>
            <button
              onClick={() => setShowGenerator(true)}
              style={{
                padding: '8px 16px',
                borderRadius: 9,
                backgroundColor: '#0f3e17',
                color: '#fff',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(15, 62, 23, 0.2)',
              }}
            >
              <Plus size={15} /> Issue New License
            </button>
            <button
              onClick={handleSignOut}
              style={{
                padding: '8px 12px',
                borderRadius: 9,
                border: '1px solid #efeeeb',
                backgroundColor: '#fff',
                color: '#b91c1c',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1280, margin: '28px auto', padding: '0 24px 60px' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          <div style={{ backgroundColor: '#fff', padding: '20px 24px', borderRadius: 16, border: '1px solid #efeeeb' }}>
            <span style={{ fontSize: 12, color: '#6b7c6e', fontWeight: 600 }}>TOTAL ISSUED LICENSES</span>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#0f3e17', marginTop: 4 }}>
              {stats?.total_issued || 0}
            </div>
            <span style={{ fontSize: 11, color: '#8b9b8e' }}>Across all surgical centers</span>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '20px 24px', borderRadius: 16, border: '1px solid #efeeeb' }}>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>ACTIVE CLINICAL SEATS</span>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {stats?.active_count || 0}
            </div>
            <span style={{ fontSize: 11, color: '#059669' }}>100% Verified & Valid</span>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '20px 24px', borderRadius: 16, border: '1px solid #efeeeb' }}>
            <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>RENEWALS IN 30 DAYS</span>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#d97706', marginTop: 4 }}>
              {stats?.expiring_soon_count || 0}
            </div>
            <span style={{ fontSize: 11, color: '#d97706' }}>Action needed for accounts</span>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '20px 24px', borderRadius: 16, border: '1px solid #efeeeb' }}>
            <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>REVOKED / BLACKLISTED</span>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>
              {stats?.revoked_count || 0}
            </div>
            <span style={{ fontSize: 11, color: '#8b9b8e' }}>Deactivated tokens</span>
          </div>
        </div>

        {/* Customer Registry Header & Search */}
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            border: '1px solid #efeeeb',
            padding: '20px 24px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f3e17' }}>Customer & Seat Registry</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7c6e' }}>
              Manage customer machine hardware bindings and cryptographic license tokens
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 280 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: '#8b9b8e' }} />
              <input
                type="text"
                placeholder="Search surgeon, clinic, HWID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 9,
                  border: '1px solid #d7e4d8',
                  fontSize: 12.5,
                  outline: 'none',
                }}
              />
            </div>
            <button
              onClick={loadData}
              style={{
                padding: '9px 12px',
                borderRadius: 9,
                border: '1px solid #d7e4d8',
                backgroundColor: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                color: '#0f3e17',
              }}
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Registry Table */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, border: '1px solid #efeeeb', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: '#6b7c6e' }}>
              <Key size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px 0' }}>No Customer Licenses Found</p>
              <p style={{ fontSize: 12, margin: 0 }}>Click "Issue New License" above to generate your first client key.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f7f6f3', borderBottom: '1px solid #efeeeb', color: '#6b7c6e', fontSize: 11.5 }}>
                    <th style={{ padding: '14px 20px', fontWeight: 600 }}>STATUS</th>
                    <th style={{ padding: '14px 20px', fontWeight: 600 }}>CUSTOMER / CLINIC</th>
                    <th style={{ padding: '14px 20px', fontWeight: 600 }}>TIER</th>
                    <th style={{ padding: '14px 20px', fontWeight: 600 }}>HARDWARE ID (HWID)</th>
                    <th style={{ padding: '14px 20px', fontWeight: 600 }}>ISSUED / EXPIRY</th>
                    <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rec) => {
                    const isRevoked = rec.is_revoked;
                    const isExpired = rec.status === 'expired';
                    return (
                      <tr key={rec.license_id} style={{ borderBottom: '1px solid #efeeeb' }}>
                        <td style={{ padding: '16px 20px' }}>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 99,
                              backgroundColor: isRevoked
                                ? 'rgba(239, 68, 68, 0.12)'
                                : isExpired
                                ? 'rgba(245, 158, 11, 0.12)'
                                : 'rgba(16, 185, 129, 0.12)',
                              color: isRevoked ? '#b91c1c' : isExpired ? '#d97706' : '#059669',
                              border: `1px solid ${
                                isRevoked
                                  ? 'rgba(239, 68, 68, 0.3)'
                                  : isExpired
                                  ? 'rgba(245, 158, 11, 0.3)'
                                  : 'rgba(16, 185, 129, 0.3)'
                              }`,
                            }}
                          >
                            {isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontWeight: 600, color: '#0f3e17' }}>{rec.customer}</div>
                          <div style={{ fontSize: 11.5, color: '#6b7c6e' }}>{rec.organization} • {rec.email}</div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ fontWeight: 700, fontSize: 11, color: '#0f3e17' }}>{rec.tier}</span>
                        </td>
                        <td style={{ padding: '16px 20px', fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: '#0f3e17' }}>
                          {rec.hwid === '*' ? (
                            <span style={{ color: '#059669', fontWeight: 600 }}>✦ Wildcard (Any Machine)</span>
                          ) : (
                            rec.hwid
                          )}
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: 11.5, color: '#6b7c6e' }}>
                          <div>Issued: {rec.issued_date.split('T')[0]}</div>
                          <div>Expiry: {rec.expiry_date ? rec.expiry_date.split('T')[0] : 'Lifetime / Perpetual'}</div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setGeneratedRecord(rec)}
                              title="View & Export Key"
                              style={{
                                padding: '6px 10px',
                                borderRadius: 7,
                                border: '1px solid #d7e4d8',
                                backgroundColor: '#fff',
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: '#0f3e17',
                                cursor: 'pointer',
                              }}
                            >
                              View Key
                            </button>
                            {!isRevoked && (
                              <button
                                onClick={() => handleRevoke(rec.license_id, rec.customer)}
                                title="Revoke License"
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 7,
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  color: '#b91c1c',
                                  cursor: 'pointer',
                                }}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── 3. Issue License Generator Modal ── */}
      {showGenerator && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(15, 62, 23, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 600,
              backgroundColor: '#fff',
              borderRadius: 20,
              border: '1px solid #efeeeb',
              boxShadow: '0 24px 64px rgba(15, 62, 23, 0.25)',
              overflow: 'hidden',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #efeeeb',
                backgroundColor: '#f7f6f3',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Key size={20} color="#0f3e17" />
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f3e17' }}>
                  Issue & Sign Customer License Key
                </h3>
              </div>
              <button
                onClick={() => setShowGenerator(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7c6e' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGenerate} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                  Doctor / Surgeon Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Dr. Jane Smith"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                    Hospital / Clinic
                  </label>
                  <input
                    type="text"
                    placeholder="Mayo Clinic Orthopedics"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                    Licensee Email
                  </label>
                  <input
                    type="email"
                    placeholder="doctor@hospital.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17' }}>
                    Target Machine Hardware ID (HWID)
                  </label>
                  <button
                    type="button"
                    onClick={() => setHwid('*')}
                    style={{ background: 'none', border: 'none', color: '#059669', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Set as Wildcard (*)
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="OSSI-XXXX-XXXX-XXXX-XXXX or *"
                  value={hwid}
                  onChange={(e) => setHwid(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ fontSize: 11, color: '#8b9b8e', display: 'block', marginTop: 4 }}>
                  Use '*' to allow the license to run on any computer (e.g. site license).
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                    License Tier
                  </label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 13, backgroundColor: '#fff' }}
                  >
                    <option value="TRIAL">TRIAL (14 Days Evaluation)</option>
                    <option value="STARTER">STARTER (Basic CAD)</option>
                    <option value="CLINICAL_PRO">CLINICAL PRO (AI + Full CAD + STL)</option>
                    <option value="ENTERPRISE">ENTERPRISE (Site License + Unlimited)</option>
                    <option value="UNLIMITED">UNLIMITED (Perpetual / Developer)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                    Validity Period
                  </label>
                  <select
                    value={validDays}
                    onChange={(e) => setValidDays(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 13, backgroundColor: '#fff' }}
                  >
                    <option value={14}>14 Days (Trial)</option>
                    <option value={30}>30 Days (1 Month)</option>
                    <option value={90}>90 Days (Quarterly)</option>
                    <option value={365}>365 Days (1 Year Standard)</option>
                    <option value={730}>730 Days (2 Years)</option>
                    <option value={0}>Lifetime / Perpetual (0 Days)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                  Internal Admin Notes
                </label>
                <input
                  type="text"
                  placeholder="PO #49201, Authorized by Dr. Roberts"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #d7e4d8', fontSize: 13 }}
                />
              </div>

              <div style={{ paddingTop: 8, borderTop: '1px solid #efeeeb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowGenerator(false)}
                  style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid #d7e4d8', backgroundColor: '#fff', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 9,
                    backgroundColor: '#0f3e17',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(15, 62, 23, 0.2)',
                  }}
                >
                  Generate & Digitally Sign Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 4. Key Delivery & Export Drawer / Modal ── */}
      {generatedRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(15, 62, 23, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 620,
              backgroundColor: '#fff',
              borderRadius: 20,
              border: '1px solid #efeeeb',
              boxShadow: '0 24px 64px rgba(15, 62, 23, 0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #efeeeb',
                backgroundColor: '#f7f6f3',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={22} color="#059669" />
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f3e17' }}>
                  Cryptographic License Key Issued
                </h3>
              </div>
              <button
                onClick={() => setGeneratedRecord(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7c6e' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '14px', borderRadius: 12, backgroundColor: '#f7f6f3', border: '1px solid #efeeeb', display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f3e17' }}>{generatedRecord.customer}</div>
                  <div style={{ color: '#6b7c6e' }}>{generatedRecord.organization}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#0f3e17' }}>{generatedRecord.tier}</div>
                  <div style={{ color: '#6b7c6e' }}>{generatedRecord.days_valid > 0 ? `${generatedRecord.days_valid} Days` : 'Lifetime'}</div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#0f3e17', display: 'block', marginBottom: 6 }}>
                  Signed License String (Token)
                </label>
                <textarea
                  readOnly
                  rows={4}
                  value={generatedRecord.license_key}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 10,
                    border: '1px solid #d7e4d8',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    backgroundColor: '#faf9f6',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleCopy(generatedRecord.license_key)}
                  style={{
                    flex: 1,
                    padding: '11px 16px',
                    borderRadius: 10,
                    backgroundColor: '#0f3e17',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {copiedKey ? <Check size={16} /> : <Copy size={16} />}
                  {copiedKey ? 'Copied to Clipboard!' : 'Copy License String'}
                </button>

                <button
                  onClick={() => handleDownloadFile(generatedRecord)}
                  style={{
                    padding: '11px 16px',
                    borderRadius: 10,
                    backgroundColor: '#fff',
                    color: '#0f3e17',
                    border: '1px solid #d7e4d8',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Download size={16} /> Download .license File
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #efeeeb', backgroundColor: '#f7f6f3', textAlign: 'right' }}>
              <button
                onClick={() => setGeneratedRecord(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', backgroundColor: '#d7e4d8', color: '#0f3e17', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
