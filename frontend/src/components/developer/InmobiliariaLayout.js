// InmobiliariaLayout — backward-compat wrapper around PortalLayout.
import React from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { PortalLayout } from '../shared/PortalLayout';
import CitaNotifBanner from '../shared/CitaNotifBanner';

const ROLES_OK = new Set(['superadmin', 'developer_admin', 'inmobiliaria_admin', 'inmobiliaria_director']);

export default function InmobiliariaLayout({ user, onLogout, children }) {
  const loc = useLocation();

  if (!user) return <Navigate to="/?login=1" replace state={{ next: loc.pathname }} />;
  if (!ROLES_OK.has(user.role)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div className="eyebrow">403</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: '8px 0 14px' }}>
            Acceso restringido al portal Inmobiliaria
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 18 }}>
            Tu cuenta no tiene acceso al portal inmobiliaria.
          </p>
          <Link to="/" className="btn btn-primary" style={{ justifyContent: 'center' }}>Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <PortalLayout role={user.role === 'inmobiliaria_director' ? 'inmobiliaria_admin' : (user.role || 'inmobiliaria_member')} user={user} onLogout={onLogout}>
      <div data-testid="inmobiliaria-main" style={{ padding: '22px 28px 80px', maxWidth: 1400 }}>
        <CitaNotifBanner />
        {children}
      </div>
    </PortalLayout>
  );
}
