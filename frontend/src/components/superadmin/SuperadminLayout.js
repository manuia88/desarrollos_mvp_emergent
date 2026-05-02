// SuperadminLayout — backward-compat wrapper around PortalLayout.
import React from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { PortalLayout } from '../shared/PortalLayout';

const ROLES_OK = new Set(['superadmin']);

export default function SuperadminLayout({ user, onLogout, children }) {
  const loc = useLocation();

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
    <PortalLayout role="superadmin" user={user} onLogout={onLogout}>
      <div data-testid="sa-main" style={{ padding: '22px 28px 80px', maxWidth: 1500 }}>
        {children}
      </div>
    </PortalLayout>
  );
}
