// /superadmin/data-sources — IE Engine wire-up + manual upload admin (Phase A2: connect + test + sync).
import React, { useEffect, useState, useMemo } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import ConnectModal from '../../components/superadmin/ConnectModal';
import * as api from '../../api/superadmin';
import { Database, Sparkle, Bookmark, Shield, Clock } from '../../components/icons';

const STATUS_TONES = {
  active:       { label: 'Activa',      bg: 'rgba(34,197,94,0.16)',  fg: '#86efac', border: 'rgba(34,197,94,0.32)' },
  stub:         { label: 'Stub',        bg: 'rgba(245,158,11,0.16)', fg: '#fcd34d', border: 'rgba(245,158,11,0.32)' },
  manual_only:  { label: 'Solo manual', bg: 'rgba(99,102,241,0.16)', fg: '#a5b4fc', border: 'rgba(99,102,241,0.32)' },
  blocked:      { label: 'Bloqueada',   bg: 'rgba(239,68,68,0.16)',  fg: '#fca5a5', border: 'rgba(239,68,68,0.32)' },
  h2:           { label: 'Horizonte 2', bg: 'rgba(148,163,184,0.16)', fg: 'var(--cream-3)', border: 'rgba(148,163,184,0.28)' },
};

const ACCESS_MODE_LABELS = {
  api_key:        'API key',
  ckan_resource:  'CKAN resource',
  keyless_url:    'URL pública',
  wms_wfs:        'WMS / WFS',
  manual_upload:  'Upload manual',
  external_paid:  'Paid SDK',
};

const CATEGORY_LABELS = {
  clima: 'Clima',
  demografia: 'Demografía',
  economia: 'Economía',
  geo: 'Geo',
  seguridad: 'Seguridad',
  transporte: 'Transporte',
  salud: 'Salud',
  agua: 'Agua',
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return '—'; }
};

const StatCard = ({ label, value, accent, Icon }) => (
  <div data-testid={`sa-stat-${label}`} style={{
    padding: 16,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border)',
    borderRadius: 14,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'rgba(99,102,241,0.10)',
        border: '1px solid rgba(99,102,241,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} color="var(--indigo-3)" />
      </div>
      <div className="eyebrow" style={{ margin: 0 }}>{label}</div>
    </div>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
      color: accent || 'var(--cream)',
      letterSpacing: '-0.025em', lineHeight: 1,
    }}>
      {value}
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const tone = STATUS_TONES[status] || STATUS_TONES.stub;
  return (
    <span data-testid={`sa-status-${status}`} style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 9999,
      background: tone.bg,
      color: tone.fg,
      border: `1px solid ${tone.border}`,
      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      {tone.label}
    </span>
  );
};

export default function DataSourcesPage({ user, onLogout }) {
  const [sources, setSources] = useState([]);
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('todas');
  const [connecting, setConnecting] = useState(null); // source object or null
  const [actionBusy, setActionBusy] = useState({}); // { [id]: 'test'|'sync' }
  const [toast, setToast] = useState(null); // { msg, tone }

  const showToast = (msg, tone = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, st, j, u] = await Promise.all([
        api.listDataSources(),
        api.getDataSourcesStats(),
        api.listIngestionJobs({ limit: 20 }),
        api.listRecentUploads(),
      ]);
      setSources(s); setStats(st); setJobs(j); setUploads(u);
    } catch (e) {
      if (e?.status === 401) { window.location.href = '/?login=1&next=/superadmin/data-sources'; return; }
      setErr(e?.message || 'No se pudo cargar el panel.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleTest = async (s) => {
    setActionBusy(b => ({ ...b, [s.id]: 'test' }));
    try {
      const res = await api.testConnection(s.id);
      showToast(`${s.name} · ${res.ok ? 'OK' : 'falló'} — ${res.message}`, res.ok ? 'ok' : 'bad');
      await load();
    } catch (e) {
      showToast(`Error: ${e.message}`, 'bad');
    } finally {
      setActionBusy(b => { const c = { ...b }; delete c[s.id]; return c; });
    }
  };

  const handleSync = async (s) => {
    setActionBusy(b => ({ ...b, [s.id]: 'sync' }));
    try {
      const res = await api.syncSource(s.id);
      showToast(
        `${s.name} · ${res.records_ingested} records${res.is_stub ? ' (stub)' : ''} en ${res.duration_ms}ms`,
        res.status === 'ok' ? 'ok' : 'bad',
      );
      await load();
    } catch (e) {
      showToast(`Error sync: ${e.message}`, 'bad');
    } finally {
      setActionBusy(b => { const c = { ...b }; delete c[s.id]; return c; });
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'todas') return sources;
    return sources.filter(s => s.status === filter);
  }, [sources, filter]);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>IE ENGINE · FASE A</div>
      <h1 style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
        color: 'var(--cream)', letterSpacing: '-0.028em',
        margin: '0 0 10px', lineHeight: 1.05,
      }}>
        Fuentes de datos
      </h1>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)',
        lineHeight: 1.6, maxWidth: 760, margin: '0 0 28px',
      }}>
        Wire-up, monitoreo y uploads manuales de las 18 fuentes que alimentan los 118-125 scores
        del IE Engine. Cada fuente tiene su modo de acceso y, cuando aplica, un canal de subida manual versionado.
      </p>

      {loading ? (
        <div style={{ padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', textAlign: 'center' }}>Cargando fuentes…</div>
      ) : err ? (
        <div data-testid="sa-error" style={{ padding: 32, textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: '#fca5a5', marginBottom: 8 }}>ERROR</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginBottom: 14 }}>{err}</div>
          <button onClick={load} className="btn btn-primary">Reintentar</button>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          {stats && (
            <div data-testid="sa-stats" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12, marginBottom: 24,
            }}>
              <StatCard label="ACTIVAS"        value={stats.active}      Icon={Sparkle}  accent="#86efac" />
              <StatCard label="STUB"           value={stats.stub}        Icon={Database} accent="#fcd34d" />
              <StatCard label="MANUAL"         value={stats.manual_only} Icon={Bookmark} accent="#a5b4fc" />
              <StatCard label="HORIZONTE 2"    value={stats.h2}          Icon={Clock}    accent="var(--cream-3)" />
              <StatCard label="ERRORES 24H"    value={stats.errors_24h}  Icon={Shield}   accent={stats.errors_24h ? '#fca5a5' : 'var(--cream)'} />
            </div>
          )}

          {/* Filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {[
              { k: 'todas',       label: `Todas (${sources.length})` },
              { k: 'active',      label: `Activas (${stats?.active ?? 0})` },
              { k: 'stub',        label: `Stub (${stats?.stub ?? 0})` },
              { k: 'manual_only', label: `Solo manual (${stats?.manual_only ?? 0})` },
              { k: 'blocked',     label: `Bloqueadas (${stats?.blocked ?? 0})` },
              { k: 'h2',          label: `H2 (${stats?.h2 ?? 0})` },
            ].map(f => {
              const active = filter === f.k;
              return (
                <button key={f.k} data-testid={`sa-filter-${f.k}`} onClick={() => setFilter(f.k)} style={{
                  padding: '6px 14px',
                  borderRadius: 9999,
                  background: active ? 'var(--grad)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--cream-2)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Sources table */}
          <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 28 }}>
            <table data-testid="sa-sources-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fuente', 'Categoría', 'Modo', 'Status', 'Última sync', 'Records', 'Acciones'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '11px 14px',
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5,
                      color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const canConnect = ['api_key', 'ckan_resource', 'wms_wfs', 'keyless_url'].includes(s.access_mode);
                  const canTest = s.access_mode !== 'manual_upload';
                  return (
                    <tr key={s.id} data-testid={`sa-row-${s.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', color: 'var(--cream)' }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
                          {s.id}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--cream-2)' }}>
                        {CATEGORY_LABELS[s.category] || s.category}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--cream-2)' }}>
                        {ACCESS_MODE_LABELS[s.access_mode] || s.access_mode}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusBadge status={s.status} />
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--cream-3)', fontSize: 11.5 }}>
                        {fmtDate(s.last_sync)}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>
                        {s.records_total.toLocaleString('es-MX')}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {canConnect && (
                            <button data-testid={`sa-act-connect-${s.id}`}
                              onClick={() => setConnecting(s)}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px' }}>
                              Conectar
                            </button>
                          )}
                          {canTest && (
                            <button data-testid={`sa-act-test-${s.id}`}
                              onClick={() => handleTest(s)}
                              disabled={!!actionBusy[s.id]}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px', opacity: actionBusy[s.id] ? 0.5 : 1 }}>
                              {actionBusy[s.id] === 'test' ? '…' : 'Probar'}
                            </button>
                          )}
                          {canTest && (
                            <button data-testid={`sa-act-sync-${s.id}`}
                              onClick={() => handleSync(s)}
                              disabled={!!actionBusy[s.id]}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px', opacity: actionBusy[s.id] ? 0.5 : 1 }}>
                              {actionBusy[s.id] === 'sync' ? '…' : 'Sync'}
                            </button>
                          )}
                          {s.supports_manual_upload && (
                            <button data-testid={`sa-act-upload-${s.id}`} disabled className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px', opacity: 0.45, cursor: 'not-allowed' }}
                              title="Disponible en Fase A3">
                              Subir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)' }}>Sin fuentes en este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Two-column: jobs + uploads */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="sa-2col">
            <div style={{
              padding: 18, background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)', borderRadius: 14,
            }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>ÚLTIMOS 20 INGESTION JOBS</div>
              {jobs.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
                  Aún no hay jobs ejecutados. Disponible cuando A2 active sync manual / cron.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {jobs.map(j => (
                    <li key={j.id} data-testid={`sa-job-${j.id}`} style={{
                      padding: '10px 0', borderBottom: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    }}>
                      <div>
                        <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>{j.source_id}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                          {j.trigger} · {fmtDate(j.started_at)} · {j.records_ingested} records
                        </div>
                      </div>
                      <StatusBadge status={j.status === 'ok' ? 'active' : j.status === 'error' ? 'blocked' : 'stub'} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{
              padding: 18, background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)', borderRadius: 14,
            }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>ÚLTIMOS 20 UPLOADS MANUALES</div>
              {uploads.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
                  Sin uploads manuales todavía. Disponible cuando A3 active el dropzone.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {uploads.map(u => (
                    <li key={u.id} data-testid={`sa-upload-${u.id}`} style={{
                      padding: '10px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
                        {u.filename} <span style={{ color: 'var(--cream-3)' }}>· {u.source_id}</span>
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                        {fmtDate(u.created_at)} · {(u.file_size_bytes / 1024).toFixed(1)} KB · {u.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`@media (max-width: 900px) { .sa-2col { grid-template-columns: 1fr !important; } }`}</style>

      <ConnectModal
        open={!!connecting}
        source={connecting}
        onClose={() => setConnecting(null)}
        onSaved={() => load()}
      />

      {toast && (
        <div data-testid="sa-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 700,
          padding: '12px 18px', borderRadius: 12,
          background: toast.tone === 'ok' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.tone === 'ok' ? 'rgba(34,197,94,0.32)' : 'rgba(239,68,68,0.32)'}`,
          color: toast.tone === 'ok' ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
          backdropFilter: 'blur(20px)',
          maxWidth: 420, boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
        }}>
          {toast.msg}
        </div>
      )}
    </SuperadminLayout>
  );
}
