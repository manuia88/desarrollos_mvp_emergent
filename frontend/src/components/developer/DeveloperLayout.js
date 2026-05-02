// DeveloperLayout — sidebar nav for developer portal
import React from 'react';
import { Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Home, Database, BarChart, Sparkle, Radio, LogOut, MapPin, Users, Settings, Calendar } from '../icons';

const ROLES_OK = new Set(['developer_admin', 'developer_member', 'superadmin']);

const NAV = [
  { k: 'dashboard',    to: '/desarrollador',                        label: 'Panel',           Icon: Home,     end: true },
  { k: 'inv',          to: '/desarrollador/inventario',             label: 'Inventario',      Icon: Database },
  { k: 'dem',          to: '/desarrollador/demanda',                label: 'Demanda',         Icon: MapPin },
  { k: 'rep',          to: '/desarrollador/reportes',               label: 'Reportes IA',     Icon: Sparkle },
  { k: 'price',        to: '/desarrollador/pricing',                label: 'Pricing dinámico', Icon: BarChart },
  { k: 'comp',         to: '/desarrollador/competidores',           label: 'Radar',           Icon: Radio },
  { k: 'usuarios',     to: '/desarrollador/usuarios',               label: 'Equipo',          Icon: Users },
  { k: 'calendario',   to: '/desarrollador/calendario-subidas',     label: 'Contenido',       Icon: Calendar },
  { k: 'config',       to: '/desarrollador/configuracion',          label: 'Configuración',   Icon: Settings },
];

export default function DeveloperLayout({ user, onLogout, children }) {
  const loc = useLocation();

  if (!user) return <Navigate to="/?login=1" replace state={{ next: loc.pathname }} />;
  if (!ROLES_OK.has(user.role)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div className="eyebrow">403</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '8px 0 14px' }}>
            Acceso restringido al portal de desarrolladores
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 18 }}>
            Tu rol actual es <strong>{user.role}</strong>. Solicita el upgrade a administrador de desarrolladora.
          </p>
          <Link to="/" className="btn btn-primary" style={{ justifyContent: 'center' }}>Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dev-shell" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '240px 1fr' }}>
      <aside data-testid="dev-sidebar" style={{
        background: 'linear-gradient(180deg, #0D1118, #08090D)',
        borderRight: '1px solid var(--border)',
        padding: '22px 14px', position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', letterSpacing: '-0.02em' }}>DesarrollosMX</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Portal desarrollador</div>
          </div>
        </Link>
        <div style={{ padding: '10px 10px', background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.22)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{user.name}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
            {user.role === 'superadmin' ? 'Superadmin' : 'Admin desarrolladora'}
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ k, to, label, Icon, end }) => (
            <NavLink key={k} to={to} end={end} data-testid={`devnav-${k}`}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                textDecoration: 'none',
                color: isActive ? 'var(--cream)' : 'var(--cream-3)',
                background: isActive ? 'rgba(236,72,153,0.14)' : 'transparent',
                borderLeft: `2px solid ${isActive ? '#EC4899' : 'transparent'}`,
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
                transition: 'background 0.15s, color 0.15s',
              })}>
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to="/marketplace" style={{ padding: '9px 12px', borderRadius: 10, textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12.5, color: 'var(--cream-3)' }}>
            Ver marketplace público
          </Link>
          <button onClick={onLogout} data-testid="dev-logout" style={{
            padding: '9px 12px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)',
            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          }}>
            <LogOut size={12} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main data-testid="dev-main" style={{ padding: '22px 28px 80px', maxWidth: 1500 }}>{children}</main>

      <style>{`@media (max-width: 840px) { .dev-shell { grid-template-columns: 1fr !important; } .dev-shell > aside { position: relative !important; height: auto !important; } }`}</style>
    </div>
  );
}
