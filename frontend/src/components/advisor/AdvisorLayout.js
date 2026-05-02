// AdvisorLayout — sidebar nav + role gate + header + onboarding gate
import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Home, Database, BarChart, Clock, Route, TrendUp, Bookmark, Shield, LogOut, MapPin, Sparkle, MessageSquare, CalendarCheck, Target } from '../icons';
import OnboardingGate from './OnboardingGate';
import CitaNotifBanner from '../shared/CitaNotifBanner';
import * as api from '../../api/advisor';

const ROLES_OK = new Set(['advisor', 'asesor_admin', 'superadmin']);

const NAV = [
  { k: 'dashboard', to: '/asesor',              label: 'Panel',       Icon: Home,     end: true },
  { k: 'contactos', to: '/asesor/contactos',    label: 'Contactos',   Icon: Database },
  { k: 'busquedas', to: '/asesor/busquedas',    label: 'Búsquedas',   Icon: Route },
  { k: 'capt',      to: '/asesor/captaciones',  label: 'Captaciones', Icon: Bookmark },
  { k: 'tareas',    to: '/asesor/tareas',       label: 'Tareas',      Icon: Clock },
  { k: 'ops',       to: '/asesor/operaciones',  label: 'Operaciones', Icon: TrendUp },
  { k: 'com',       to: '/asesor/comisiones',   label: 'Comisiones',  Icon: BarChart },
  { k: 'lb',        to: '/asesor/ranking',      label: 'Ranking',     Icon: Shield },
  { k: 'studio',    to: '/asesor/studio',       label: 'Studio IA',   Icon: Sparkle },
  { k: 'briefings', to: '/asesor/briefings',    label: 'Briefings IE', Icon: MessageSquare },
  { k: 'citas',     to: '/asesor/citas',         label: 'Citas',        Icon: CalendarCheck },
  { k: 'leads-dev', to: '/asesor/leads-dev',     label: 'Leads desarrollos', Icon: Target },
];

export default function AdvisorLayout({ user, onLogout, children }) {
  const loc = useLocation();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

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
    <div className="advisor-shell" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '240px 1fr' }}>
      <aside data-testid="advisor-sidebar" style={{
        background: 'linear-gradient(180deg, #0D1118, #08090D)',
        borderRight: '1px solid var(--border)',
        padding: '22px 14px', position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: 'var(--grad)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
              DesarrollosMX
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Portal asesor
            </div>
          </div>
        </Link>

        <div style={{ padding: '10px 10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
            {user.name}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
            {user.role === 'superadmin' ? 'Superadmin' : user.role === 'asesor_admin' ? 'Admin de agencia' : 'Asesor certificado'}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ k, to, label, Icon, end }) => (
            <NavLink key={k} to={to} end={end} data-testid={`nav-${k}`}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                textDecoration: 'none',
                color: isActive ? 'var(--cream)' : 'var(--cream-3)',
                background: isActive ? 'rgba(99,102,241,0.14)' : 'transparent',
                borderLeft: `2px solid ${isActive ? '#6366F1' : 'transparent'}`,
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
                transition: 'background 0.15s, color 0.15s',
              })}>
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to="/marketplace" style={{
            padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12.5,
            color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <MapPin size={12} />
            Ver marketplace público
          </Link>
          <button onClick={onLogout} data-testid="advisor-logout" style={{
            padding: '9px 12px', borderRadius: 10, background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--cream-3)',
            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12.5,
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          }}>
            <LogOut size={12} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main data-testid="advisor-main" style={{ padding: '22px 28px 80px', maxWidth: 1400 }}>
        <CitaNotifBanner />
        {children}
      </main>

      <style>{`
        @media (max-width: 840px) {
          .advisor-shell { grid-template-columns: 1fr !important; }
          .advisor-shell > aside { position: relative !important; height: auto !important; }
        }
      `}</style>

      {!profileLoading && needsOnboarding && (
        <OnboardingGate profile={profile} onDone={() => api.getProfile().then(setProfile)} />
      )}
    </div>
  );
}
