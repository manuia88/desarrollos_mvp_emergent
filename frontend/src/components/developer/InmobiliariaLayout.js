// InmobiliariaLayout — Sidebar + role gate for portal inmobiliaria
import React from 'react';
import { Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { Home, BarChart, Users, Building, Settings, LogOut, MapPin, UserCheck } from '../icons';

const NAV = [
  { k: 'dashboard', to: '/inmobiliaria', label: 'Dashboard', Icon: Home, end: true },
  { k: 'asesores', to: '/inmobiliaria/asesores', label: 'Asesores', Icon: UserCheck },
  { k: 'leads', to: '/inmobiliaria/leads', label: 'Leads', Icon: BarChart },
  { k: 'config', to: '/inmobiliaria/configuracion', label: 'Configuración', Icon: Settings },
];

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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '240px 1fr' }}>
      <aside data-testid="inmobiliaria-sidebar" style={{
        background: 'linear-gradient(180deg, #0D1118, #08090D)',
        borderRight: '1px solid var(--border)',
        padding: '22px 14px', position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', letterSpacing: '-0.02em' }}>DesarrollosMX</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Portal Inmobiliaria</div>
          </div>
        </Link>

        <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 10 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', fontWeight: 600 }}>{user.name || user.email}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{user.role}</div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {NAV.map(({ k, to, label, Icon, end }) => (
            <NavLink key={k} to={to} end={!!end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9,
              textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: isActive ? 'var(--cream)' : 'var(--cream-3)',
              transition: 'background 0.15s, color 0.15s',
            })}>
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button onClick={onLogout} style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9,
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)',
          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, width: '100%', textAlign: 'left',
        }}>
          <LogOut size={14} /> Cerrar sesión
        </button>
      </aside>

      <main style={{ padding: '28px 32px', overflowY: 'auto', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
