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
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const loadStats = async () => {
    try {
      const s = await api.getDataSourcesStats();
      setStats(s);
    } catch (e) {
      if (e?.status === 401) { window.location.href = '/?login=1&next=/superadmin'; return; }
      setErr(e?.message || 'No se pudo cargar el panel.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadStats(); }, []);

  const triggerJob = async (job) => {
    setBusy(job);
    try {
      const r = await api.triggerCron(job);
      const okCount = r.summary.filter(s => s.status === 'ok' || s.ok).length;
      setToast({ msg: `Cron ${job} corrió sobre ${r.summary.length} fuentes (${okCount} ok)`, tone: 'ok' });
      await loadStats();
    } catch (e) {
      setToast({ msg: `Error: ${e.message}`, tone: 'bad' });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3500);
    }
  };

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
        <div className="eyebrow" style={{ marginBottom: 8 }}>CRON · APSCHEDULER</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 14 }}>
          Daily ingestion corre a las <strong>00:00 America/Mexico_City</strong> sobre fuentes activas con access_mode
          api_key / ckan_resource / keyless_url / wms_wfs. Hourly status check en el minuto 0 de cada hora.
          Las fuentes manual_upload se actualizan solo cuando alguien sube archivo.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            data-testid="dash-cron-daily"
            onClick={() => triggerJob('daily_ingestion')}
            disabled={busy === 'daily_ingestion'}
            className="btn btn-primary btn-sm"
          >
            {busy === 'daily_ingestion' ? 'Corriendo…' : 'Disparar daily_ingestion ahora'}
          </button>
          <button
            data-testid="dash-cron-hourly"
            onClick={() => triggerJob('hourly_status')}
            disabled={busy === 'hourly_status'}
            className="btn btn-glass btn-sm"
          >
            {busy === 'hourly_status' ? 'Corriendo…' : 'Disparar hourly_status ahora'}
          </button>
        </div>
      </div>

      {toast && (
        <div data-testid="dash-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 700,
          padding: '12px 18px', borderRadius: 12,
          background: toast.tone === 'ok' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.tone === 'ok' ? 'rgba(34,197,94,0.32)' : 'rgba(239,68,68,0.32)'}`,
          color: toast.tone === 'ok' ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
          backdropFilter: 'blur(20px)', maxWidth: 420,
        }}>{toast.msg}</div>
      )}

      {/* Phase 7.9 — Recent unit changes (cross-dev) */}
      <div data-testid="dash-recent-changes" style={{ marginTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Phase 7.9 · Histórico</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '0 0 14px', letterSpacing: '-0.018em' }}>
          Cambios recientes (todos los desarrollos)
        </h3>
        <RecentChangesAcrossDevs />
      </div>
    </SuperadminLayout>
  );
}


// Sub-component: cross-dev recent changes (last 10 from any development)
function RecentChangesAcrossDevs() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        // Pull from each known dev (lightweight: superadmin endpoint per dev). Aggregate top 10 by changed_at desc.
        const API = process.env.REACT_APP_BACKEND_URL;
        const devsRes = await fetch(`${API}/api/developments?limit=30`, { credentials: 'include' });
        const devs = (await devsRes.json()).items || [];
        const all = [];
        await Promise.all(devs.map(async (d) => {
          try {
            const r = await fetch(`${API}/api/superadmin/developments/${encodeURIComponent(d.id)}/units-history?limit=10`, { credentials: 'include' });
            if (r.ok) {
              const data = await r.json();
              (data.history || []).forEach((h) => { all.push({ ...h, dev_name: d.name }); });
            }
          } catch {}
        }));
        all.sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || ''));
        setItems(all.slice(0, 10));
      } finally { setLoading(false); }
    })();
  }, []);
  if (loading) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando…</div>;
  if (items.length === 0) return <div data-testid="dash-no-changes" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Sin cambios recientes registrados.</div>;
  const SOURCE_COLOR = {
    manual_edit: '#c7d2fe', auto_sync: '#86efac', drive_webhook: '#f9a8d4',
    drive_watcher: '#e9d5ff', bulk_upload: '#fcd34d', drive_sheets: '#93c5fd', system: 'var(--cream-3)',
  };
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      {items.map((h, i) => (
        <div key={h.id || i} data-testid={`dash-change-${i}`} style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 0.8fr 1fr 1fr', gap: 0,
          padding: '9px 14px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
          fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', alignItems: 'center',
        }}>
          <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{h.dev_name || h.development_id}</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10 }}>{h.unit_id}</div>
          <div>{h.field_changed}</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--cream-3)' }}>
            {String(h.old_value ?? '—')} → <span style={{ color: 'var(--cream)' }}>{String(h.new_value ?? '—')}</span>
          </div>
          <div>
            <span style={{
              padding: '2px 8px', borderRadius: 9999, fontSize: 9, fontWeight: 600,
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              color: SOURCE_COLOR[h.source] || 'var(--cream-3)',
            }}>{h.source}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
