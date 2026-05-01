// /superadmin/data-sources/:id — detail page with 4 tabs (Estado / Histórico / Uploads / Errores).
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import ConnectModal from '../../components/superadmin/ConnectModal';
import UploadModal from '../../components/superadmin/UploadModal';
import * as api from '../../api/superadmin';
import { ArrowLeft, Sparkle, Database, Bookmark, Shield, Clock } from '../../components/icons';

const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return '—'; }
};
const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;

const STATUS_TONES = {
  active:      { fg: '#86efac', bg: 'rgba(34,197,94,0.16)',   border: 'rgba(34,197,94,0.32)',   label: 'Activa' },
  ok:          { fg: '#86efac', bg: 'rgba(34,197,94,0.16)',   border: 'rgba(34,197,94,0.32)',   label: 'OK' },
  ingested:    { fg: '#86efac', bg: 'rgba(34,197,94,0.16)',   border: 'rgba(34,197,94,0.32)',   label: 'Ingerido' },
  stub:        { fg: '#fcd34d', bg: 'rgba(245,158,11,0.16)',  border: 'rgba(245,158,11,0.32)',  label: 'Stub' },
  uploaded:    { fg: '#fcd34d', bg: 'rgba(245,158,11,0.16)',  border: 'rgba(245,158,11,0.32)',  label: 'Subido' },
  processing:  { fg: '#fcd34d', bg: 'rgba(245,158,11,0.16)',  border: 'rgba(245,158,11,0.32)',  label: 'Procesando' },
  manual_only: { fg: '#a5b4fc', bg: 'rgba(99,102,241,0.16)',  border: 'rgba(99,102,241,0.32)',  label: 'Solo manual' },
  blocked:     { fg: '#fca5a5', bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.32)',   label: 'Bloqueada' },
  error:       { fg: '#fca5a5', bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.32)',   label: 'Error' },
  failed:      { fg: '#fca5a5', bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.32)',   label: 'Falló' },
  h2:          { fg: 'var(--cream-3)', bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.28)', label: 'Horizonte 2' },
  never:       { fg: 'var(--cream-3)', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.22)', label: 'Sin sync' },
  running:     { fg: 'var(--cream-2)', bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.22)', label: 'Corriendo' },
};
const Pill = ({ tone = 'never' }) => {
  const t = STATUS_TONES[tone] || STATUS_TONES.never;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
      background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>{t.label}</span>
  );
};

const TABS = [
  { k: 'estado',    label: 'Estado' },
  { k: 'historico', label: 'Histórico ingestion' },
  { k: 'uploads',   label: 'Uploads manuales' },
  { k: 'errores',   label: 'Errores' },
];

export default function DataSourceDetailPage({ user, onLogout }) {
  const { id } = useParams();
  const [src, setSrc] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [tab, setTab] = useState('estado');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [uploadingOpen, setUploadingOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, tone = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [s, j, u] = await Promise.all([
        api.getDataSource(id),
        api.listIngestionJobs({ source_id: id, limit: 50 }),
        api.listSourceUploads(id),
      ]);
      setSrc(s); setJobs(j); setUploads(u);
    } catch (e) {
      if (e?.status === 401) { window.location.href = `/?login=1&next=/superadmin/data-sources/${id}`; return; }
      if (e?.status === 404) { setErr(`Fuente "${id}" no encontrada.`); return; }
      setErr(e?.message || 'No se pudo cargar.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const errorLog = useMemo(() => (src?.error_log || []).slice().reverse(), [src]);

  const handleTest = async () => {
    setBusyAction('test');
    try {
      const r = await api.testConnection(id);
      showToast(`Test: ${r.ok ? 'OK' : 'falló'} — ${r.message}`, r.ok ? 'ok' : 'bad');
      await load();
    } catch (e) { showToast(`Error: ${e.message}`, 'bad'); }
    finally { setBusyAction(null); }
  };
  const handleSync = async () => {
    setBusyAction('sync');
    try {
      const r = await api.syncSource(id);
      showToast(`Sync: ${r.records_ingested} records${r.is_stub ? ' (stub)' : ''} en ${r.duration_ms}ms`, r.status === 'ok' ? 'ok' : 'bad');
      await load();
    } catch (e) { showToast(`Error: ${e.message}`, 'bad'); }
    finally { setBusyAction(null); }
  };
  const handleReprocess = async (uplId) => {
    try {
      const r = await api.reprocessUpload(uplId);
      showToast(`Re-procesado: ${r.records_extracted} records (${r.status})`, r.status === 'ingested' ? 'ok' : 'bad');
      await load();
    } catch (e) { showToast(`Error: ${e.message}`, 'bad'); }
  };

  if (loading) return <SuperadminLayout user={user} onLogout={onLogout}><div style={{ padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', textAlign: 'center' }}>Cargando…</div></SuperadminLayout>;
  if (err) return <SuperadminLayout user={user} onLogout={onLogout}><div style={{ padding: 32, textAlign: 'center' }}><div className="eyebrow" style={{ color: '#fca5a5' }}>ERROR</div><div style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', marginTop: 8 }}>{err}</div></div></SuperadminLayout>;
  if (!src) return null;

  const canSyncTest = src.access_mode !== 'manual_upload';

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <Link to="/superadmin/data-sources" data-testid="detail-back" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
        textDecoration: 'none', marginBottom: 14,
      }}>
        <ArrowLeft size={11} /> Volver a fuentes
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>FUENTE · {src.access_mode.toUpperCase()}</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '0 0 8px', lineHeight: 1.05 }}>
            {src.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pill tone={src.status} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              {src.records_total.toLocaleString('es-MX')} records ingestados · última sync {fmtDate(src.last_sync)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canSyncTest && (
            <button onClick={() => setConnecting(true)} data-testid="detail-connect" className="btn btn-glass btn-sm">Conectar</button>
          )}
          {canSyncTest && (
            <button onClick={handleTest} disabled={busyAction === 'test'} data-testid="detail-test" className="btn btn-glass btn-sm">
              {busyAction === 'test' ? '…' : 'Probar'}
            </button>
          )}
          {canSyncTest && (
            <button onClick={handleSync} disabled={busyAction === 'sync'} data-testid="detail-sync" className="btn btn-primary btn-sm">
              {busyAction === 'sync' ? '…' : 'Sincronizar'}
            </button>
          )}
          {src.supports_manual_upload && (
            <button onClick={() => setUploadingOpen(true)} data-testid="detail-upload" className="btn btn-primary btn-sm">Subir archivo</button>
          )}
        </div>
      </div>

      {src.description && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, maxWidth: 800, marginBottom: 22 }}>
          {src.description}
        </p>
      )}

      {/* Tabs */}
      <div data-testid="detail-tabs" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => {
          const active = tab === t.k;
          return (
            <button key={t.k} data-testid={`tab-${t.k}`} onClick={() => setTab(t.k)} style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none', borderBottom: `2px solid ${active ? '#6366F1' : 'transparent'}`,
              color: active ? 'var(--cream)' : 'var(--cream-3)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'estado' && <EstadoTab src={src} />}
      {tab === 'historico' && <HistoricoTab jobs={jobs} />}
      {tab === 'uploads' && <UploadsTab uploads={uploads} onReprocess={handleReprocess} />}
      {tab === 'errores' && <ErroresTab errorLog={errorLog} />}

      <ConnectModal open={connecting} source={src} onClose={() => setConnecting(false)} onSaved={() => load()} />
      <UploadModal open={uploadingOpen} source={src} onClose={() => setUploadingOpen(false)} onUploaded={() => { load(); }} />

      {toast && (
        <div data-testid="detail-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 700,
          padding: '12px 18px', borderRadius: 12,
          background: toast.tone === 'ok' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.tone === 'ok' ? 'rgba(34,197,94,0.32)' : 'rgba(239,68,68,0.32)'}`,
          color: toast.tone === 'ok' ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
          backdropFilter: 'blur(20px)', maxWidth: 420,
        }}>
          {toast.msg}
        </div>
      )}
    </SuperadminLayout>
  );
}

// ─── Tab: Estado ─────────────────────────────────────────────────────────────
function EstadoTab({ src }) {
  const Row = ({ label, value, mono }) => (
    <div style={{ padding: '11px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: mono ? 'monospace' : 'DM Sans', fontSize: 13, color: 'var(--cream)', textAlign: 'right' }}>{value}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <div data-testid="estado-meta" style={{ padding: 18, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>METADATOS</div>
        <Row label="ID" value={src.id} mono />
        <Row label="Categoría" value={src.category} />
        <Row label="Modo" value={src.access_mode} />
        <Row label="Endpoint" value={src.endpoint || '—'} mono />
        <Row label="Last sync" value={fmtDate(src.last_sync)} />
        <Row label="Last status" value={<Pill tone={src.last_status === 'ok' ? 'ok' : src.last_status === 'error' ? 'error' : 'never'} />} />
        <Row label="Records total" value={src.records_total.toLocaleString('es-MX')} mono />
        <Row label="Creada" value={fmtDate(src.created_at)} />
        <Row label="Actualizada" value={fmtDate(src.updated_at)} />
      </div>
      <div data-testid="estado-creds" style={{ padding: 18, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>CREDENCIALES (CIFRADAS)</div>
        {(src.credentials_keys || []).length === 0 ? (
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Esta fuente no requiere credenciales.</div>
        ) : (
          (src.credentials_keys || []).map(k => {
            const summary = src.credentials_summary?.[k];
            const envKey = src.credentials_env?.[k];
            return (
              <div key={k} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {k}
                </div>
                {summary?.set ? (
                  <code style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#86efac' }}>{summary.preview}</code>
                ) : (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    Sin configurar {envKey ? <>· fallback env <code>{envKey}</code></> : null}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Tab: Histórico ingestion ────────────────────────────────────────────────
function HistoricoTab({ jobs }) {
  if (jobs.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin jobs registrados todavía.</div>;
  }
  return (
    <div data-testid="historico-table" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Job', 'Trigger', 'Started', 'Duration', 'Records', 'Status'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '11px 14px', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => {
            const dur = j.finished_at && j.started_at
              ? `${((new Date(j.finished_at) - new Date(j.started_at)) / 1000).toFixed(2)}s`
              : '—';
            return (
              <tr key={j.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 14px', color: 'var(--cream-2)', fontFamily: 'monospace', fontSize: 11.5 }}>{j.id}</td>
                <td style={{ padding: '11px 14px', color: 'var(--cream-2)' }}>{j.trigger}</td>
                <td style={{ padding: '11px 14px', color: 'var(--cream-3)', fontSize: 11.5 }}>{fmtDate(j.started_at)}</td>
                <td style={{ padding: '11px 14px', color: 'var(--cream-2)' }}>{dur}</td>
                <td style={{ padding: '11px 14px', color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{j.records_ingested}</td>
                <td style={{ padding: '11px 14px' }}><Pill tone={j.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab: Uploads manuales ───────────────────────────────────────────────────
function UploadsTab({ uploads, onReprocess }) {
  if (uploads.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin uploads manuales registrados para esta fuente.</div>;
  }
  return (
    <div data-testid="uploads-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {uploads.map(u => (
        <div key={u.id} data-testid={`upload-row-${u.id}`} style={{ padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{u.filename}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
                {fmtDate(u.created_at)} · {fmtBytes(u.file_size_bytes)} · {u.records_extracted ?? 0} records
                {u.period_start && u.period_end && (
                  <> · cubre {new Date(u.period_start).toLocaleDateString('es-MX')} → {new Date(u.period_end).toLocaleDateString('es-MX')}</>
                )}
              </div>
              {u.upload_notes && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6, fontStyle: 'italic' }}>
                  "{u.upload_notes}"
                </div>
              )}
              <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
                sha256: {u.file_hash.slice(0, 24)}…
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <Pill tone={u.status} />
              <div style={{ display: 'flex', gap: 6 }}>
                <a
                  href={api.downloadUploadUrl(u.id)}
                  data-testid={`upload-download-${u.id}`}
                  className="btn btn-glass btn-sm"
                  style={{ textDecoration: 'none', fontSize: 11, padding: '4px 10px' }}
                >
                  Descargar
                </a>
                <button
                  onClick={() => onReprocess(u.id)}
                  data-testid={`upload-reprocess-${u.id}`}
                  className="btn btn-glass btn-sm"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  Re-procesar
                </button>
              </div>
              {u.screenshot_path && (
                <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#a5b4fc', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Bookmark size={9} /> screenshot audit
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Errores ────────────────────────────────────────────────────────────
function ErroresTab({ errorLog }) {
  if (errorLog.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin errores registrados.</div>;
  }
  return (
    <div data-testid="errores-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {errorLog.map((e, i) => (
        <div key={i} style={{ padding: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{e.scope || 'error'}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{fmtDate(e.ts)}</span>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', lineHeight: 1.5 }}>{e.message}</div>
        </div>
      ))}
    </div>
  );
}
