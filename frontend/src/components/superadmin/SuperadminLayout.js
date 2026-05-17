// SuperadminLayout — backward-compat wrapper around PortalLayout.
import React, { useEffect } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { PortalLayout } from '../shared/PortalLayout';
import { useAuth } from '../../App';

const ROLES_OK = new Set(['superadmin']);

// Section keys must match tier.section_key in navByRole.js SUPERADMIN_NAV
// AND .portal-superadmin[data-section="..."] rules in superadmin-aurora.css.
function sectionFromPath(p) {
  if (p === '/superadmin' || p.startsWith('/superadmin/tenants')) return 'principal';
  if (/^\/superadmin\/(bulk-ingest|data-sources|drive|documents|data-lake|metrics-cube)/.test(p)) return 'datos';
  if (/^\/superadmin\/(scores|drpi|risk-score|investment-explorer|intelligence-hub|trends|phase5-foundation|transactions)/.test(p)) return 'inteligencia';
  if (/^\/superadmin\/(health|observability|phase-y-observability|audit-log|audit-chain|fraud-alerts|fraud-patterns|risk-alerts|compliance|duplicates)/.test(p)) return 'operacion';
  if (/^\/superadmin\/(ai-cost|commercial|api-keys|vertical-products|data-licensing|cross-sell-analytics)/.test(p)) return 'monetizacion';
  if (/^\/superadmin\/(whatsapp|newsletter|bulletins|landing-leads|partners|onboarding-analytics)/.test(p)) return 'crecimiento';
  if (/^\/superadmin\/primitives-demo/.test(p)) return 'devtools';
  return 'principal';
}

export default function SuperadminLayout({ user: propUser, onLogout: propOnLogout, children }) {
  const loc = useLocation();
  const ctx = useAuth();
  const user = propUser || ctx.user;
  const onLogout = propOnLogout || ctx.logout;
  const section = sectionFromPath(loc.pathname);

  // Sync body class + data-attribute so cursor custom (position:fixed at body
  // root) can pick up the section --theme. Cleaned up on unmount.
  useEffect(() => {
    document.body.classList.add('superadmin-active');
    document.body.setAttribute('data-superadmin-section', section);
    return () => {
      document.body.classList.remove('superadmin-active');
      document.body.removeAttribute('data-superadmin-section');
    };
  }, [section]);

  if (!user) return <Navigate to={`/?login=1&next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!ROLES_OK.has(user.role)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div className="eyebrow">403</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '8px 0 14px' }}>
            Acceso restringido al panel superadmin
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 18 }}>
            Tu rol actual es <strong>{user.role}</strong>. Solo el equipo de operaciones DMX puede acceder.
          </p>
          <Link to="/" className="btn btn-primary" style={{ justifyContent: 'center' }}>Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-superadmin" data-section={section}>
      <PortalLayout role="superadmin" user={user} onLogout={onLogout}>
        <div data-testid="sa-main" style={{ padding: '22px 28px 80px', maxWidth: 1500 }}>
          {children}
        </div>
      </PortalLayout>
    </div>
  );
}
