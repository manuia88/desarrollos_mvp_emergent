// AdvisorLayout — backward-compat wrapper around PortalLayout.
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { PortalLayout } from '../shared/PortalLayout';
import OnboardingGate from './OnboardingGate';
import CitaNotifBanner from '../shared/CitaNotifBanner';
import ArgumentarioDrawer from '../shared/ArgumentarioDrawer';
import * as api from '../../api/advisor';

const ROLES_OK = new Set(['advisor', 'asesor_admin', 'superadmin']);

export default function AdvisorLayout({ user, onLogout, children }) {
  const loc = useLocation();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [argOpen, setArgOpen] = useState(false);

  useEffect(() => {
    if (!user || !ROLES_OK.has(user.role)) { setProfileLoading(false); return; }
    api.getProfile().then(p => setProfile(p)).catch(() => setProfile(null)).finally(() => setProfileLoading(false));
  }, [user]);

  if (!user) {
    return <Navigate to="/?login=1" replace state={{ next: loc.pathname }} />;
  }
  if (!ROLES_OK.has(user.role)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div className="eyebrow">403</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '8px 0 14px' }}>
            Acceso restringido al portal de asesores
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 18 }}>
            Tu cuenta actual tiene rol <strong>{user.role}</strong>. Solicita el upgrade a asesor para entrar al CRM Pulppo+.
          </p>
          <Link to="/" className="btn btn-primary" style={{ justifyContent: 'center' }}>Volver al inicio</Link>
        </div>
      </div>
    );
  }

  const needsOnboarding = profile && profile.profile_completed === false;

  return (
    <PortalLayout role={user.role} user={user} onLogout={onLogout}>
      <div data-testid="advisor-main" style={{ padding: '22px 28px 80px', maxWidth: 1400 }}>
        <CitaNotifBanner />
        {children}
      </div>

      {/* Phase 3 Batch 31 — Argumentario AI FAB (coach inline) */}
      {/* Bug-fix 2026-05-13: bottom 20 → 148 · evitaba colisión con ReportProblemButton (bottom:20) y AICopilotPanel (bottom:84) globales del PortalLayout */}
      <button
        data-testid="argumentario-fab"
        type="button"
        aria-label="Abrir Argumentario AI"
        onClick={() => setArgOpen(true)}
        style={{
          position: 'fixed', right: 20, bottom: 148, zIndex: 60,
          width: 56, height: 56, borderRadius: 9999,
          border: 'none',
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          color: '#fff', fontSize: 20, fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(var(--theme-rgb),0.4)',
          letterSpacing: '0.02em',
          fontFamily: 'Outfit, sans-serif',
        }}
      >AI</button>
      <ArgumentarioDrawer open={argOpen} onClose={() => setArgOpen(false)} />

      {!profileLoading && needsOnboarding && (
        <OnboardingGate profile={profile} onDone={() => api.getProfile().then(setProfile)} />
      )}
    </PortalLayout>
  );
}

