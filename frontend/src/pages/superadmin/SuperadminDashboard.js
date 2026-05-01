// /superadmin — landing dashboard for superadmin operators (Phase A: IE Engine widget only).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import * as api from '../../api/superadmin';
import { Database, ArrowRight, Sparkle, Bookmark, Shield, Clock } from '../../components/icons';

const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
};

const Stat = ({ label, value, accent, Icon }) => (
  <div data-testid={`dash-stat-${label}`} style={{
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border)',
    borderRadius: 12,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Icon size={12} color="var(--indigo-3)" />
      <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </span>
    </div>
    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: accent || 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1 }}>
      {value}
    </div>
  </div>
);

export default function SuperadminDashboard({ user, onLogout }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.getDataSourcesStats()
      .then(setStats)
      .catch(e => {
        if (e?.status === 401) { window.location.href = '/?login=1&next=/superadmin'; return; }
        setErr(e?.message || 'No se pudo cargar el panel.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>PANEL SUPERADMIN</div>
      <h1 style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
        color: 'var(--cream)', letterSpacing: '-0.028em',
        margin: '0 0 10px', lineHeight: 1.05,
      }}>
        Hola, {(user?.name || '').split(' ')[0] || 'Operador'}
      </h1>
      <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, maxWidth: 760, margin: '0 0 28px' }}>
        Operaciones DMX. Desde aquí monitoreas el IE Engine — el moat #1 de la plataforma.
      </p>

      {/* IE Engine widget */}
      <div style={{
        padding: 22,
        background: 'linear-gradient(140deg, rgba(99,102,241,0.10), rgba(236,72,153,0.04))',
        border: '1px solid var(--border)', borderRadius: 16,
        marginBottom: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>IE ENGINE · ESTADO</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
              18 fuentes, 118-125 scores
            </div>
          </div>
          <Link to="/superadmin/data-sources" data-testid="dash-cta-data-sources" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            Ver todas <ArrowRight size={11} />
          </Link>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: 'var(--cream-3)', fontFamily: 'DM Sans', textAlign: 'center', fontSize: 13 }}>Cargando…</div>
        ) : err ? (
          <div style={{ padding: 16, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13 }}>{err}</div>
        ) : stats && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10, marginBottom: 16,
            }}>
              <Stat label="Activas"       value={stats.active}      accent="#86efac"     Icon={Sparkle} />
              <Stat label="Stub"          value={stats.stub}        accent="#fcd34d"     Icon={Database} />
              <Stat label="Manual"        value={stats.manual_only} accent="#a5b4fc"     Icon={Bookmark} />
              <Stat label="Horizonte 2"   value={stats.h2}          accent="var(--cream-3)" Icon={Clock} />
              <Stat label="Errores 24h"   value={stats.errors_24h}  accent={stats.errors_24h ? '#fca5a5' : 'var(--cream)'} Icon={Shield} />
            </div>

            <div className="eyebrow" style={{ marginBottom: 8 }}>SYNCS RECIENTES</div>
            {stats.recent_syncs.length === 0 ? (
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>
                Sin syncs registradas. Phase A2 activará el botón "Sincronizar" desde la tabla de fuentes.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {stats.recent_syncs.map(s => (
                  <li key={s.id} style={{
                    padding: '8px 0', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontFamily: 'DM Sans', fontSize: 12.5,
                  }}>
                    <span style={{ color: 'var(--cream)' }}>{s.name}</span>
                    <span style={{ color: 'var(--cream-3)', fontSize: 11 }}>{fmtDate(s.last_sync)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div style={{
        padding: 22,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)', borderRadius: 16,
      }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>FASE A3 · WIRE-UP + MANUAL UPLOAD</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6 }}>
          Conectar / Probar / Sync / Subir están activos. Los cron jobs automáticos
          (daily 00:00 MX + hourly status) y los 9 conectores reales restantes llegan en A4.
          El cálculo real de scores N1-N2 se hace en Fase B.
        </div>
      </div>
    </SuperadminLayout>
  );
}
