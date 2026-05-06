// Phase 7.11 — DriveConnect: connect/picker/sync/disconnect Google Drive per development.
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as drive from '../../api/drive';
import { Cloud, CheckCircle, AlertTriangle, RefreshCw, X, Folder } from '../icons';

function fmtAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'hace segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} d`;
}

export default function DriveConnect({ devId, role = 'developer_admin' }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setStatus(await drive.fetchDriveStatus(devId, role)); }
    catch (e) { setStatus({ configured: false, error: e.message }); }
    setLoading(false);
  }, [devId, role]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-open picker after callback (?drive=connected&picker=1)
  useEffect(() => {
    if (params.get('drive') === 'connected' && params.get('picker') === '1') {
      openPicker();
      const np = new URLSearchParams(params);
      np.delete('drive'); np.delete('picker');
      setParams(np, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4500);
  };

  const onConnect = async () => {
    setBusy(true);
    try {
      const r = await drive.fetchDriveOAuthUrl(devId, role);
      if (r.ok && r.authorization_url) {
        window.location.href = r.authorization_url;
      } else {
        showToast(r.message || 'Drive no configurado', 'error');
      }
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setFolders([]);
    try {
      const r = await drive.fetchDriveFolders(devId, role);
      setFolders(r.folders || []);
    } catch (e) {
      showToast(`Error listando folders: ${e.message}`, 'error');
      setPickerOpen(false);
    }
  };

  const pickFolder = async (f) => {
    setBusy(true);
    try {
      await drive.setDriveFolder(devId, role, f.id, f.name);
      setPickerOpen(false);
      showToast(`Carpeta "${f.name}" seleccionada. Sincronizando…`);
      await refresh();
      onSyncNow();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };

  const onSyncNow = async () => {
    setBusy(true);
    try {
      const r = await drive.syncDriveNow(devId, role);
      const a = r.audit || {};
      const summary = `Drive sync: ${a.scanned || 0} archivos · ${a.new || 0} nuevos · ${a.updated || 0} actualizados${(a.errors || []).length ? ` · ${a.errors.length} errores` : ''}`;
      showToast(summary, (a.errors || []).length ? 'warn' : 'success');
      await refresh();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };

  const onDisconnect = async () => {
    if (!window.confirm('¿Desconectar Google Drive y eliminar tokens?')) return;
    setBusy(true);
    try {
      await drive.disconnectDrive(devId, role);
      showToast('Drive desconectado.');
      await refresh();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };

  if (loading) {
    return <div data-testid="drive-loading" style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Cargando Drive…</div>;
  }

  const conn = status?.connection;
  const configured = status?.configured;
  const connected = !!conn;
  const hasFolder = !!conn?.folder_id;

  // Stub state (keys missing)
  if (!configured && !connected) {
    return (
      <div data-testid="drive-stub" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 9999,
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
        fontFamily: 'DM Sans', fontSize: 11, color: '#fcd34d',
      }}>
        <AlertTriangle size={11} />
        Drive: configura GOOGLE_OAUTH_CLIENT_ID en .env
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {!connected && (
          <button
            data-testid="drive-connect-btn"
            onClick={onConnect}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 9999,
              background: 'var(--grad)', border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              opacity: busy ? 0.6 : 1, letterSpacing: '0.02em',
            }}>
            <Cloud size={12} />
            Conectar Google Drive
          </button>
        )}
        {connected && !hasFolder && (
          <>
            <span data-testid="drive-status-pending" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.32)',
              fontFamily: 'DM Sans', fontSize: 11, color: '#c7d2fe',
            }}>
              <CheckCircle size={11} /> Autenticado · selecciona carpeta
            </span>
            <button onClick={openPicker} data-testid="drive-pick-folder" style={btnGlass}>
              <Folder size={11} /> Elegir carpeta
            </button>
            <button onClick={onDisconnect} style={btnGhost} data-testid="drive-disconnect">
              <X size={10} />
            </button>
          </>
        )}
        {connected && hasFolder && (
          <>
            <span data-testid="drive-status-connected" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 9999,
              background: conn.status === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)',
              border: `1px solid ${conn.status === 'error' ? 'rgba(239,68,68,0.32)' : 'rgba(34,197,94,0.32)'}`,
              fontFamily: 'DM Sans', fontSize: 11,
              color: conn.status === 'error' ? '#fca5a5' : '#86efac',
            }}>
              {conn.status === 'error' ? <AlertTriangle size={11} /> : <CheckCircle size={11} />}
              Drive conectado · sync {fmtAgo(conn.last_sync_at)}
            </span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Folder size={11} /> {conn.folder_name || conn.folder_id}
            </span>
            <button onClick={onSyncNow} disabled={busy} data-testid="drive-sync-now" style={btnGlass}>
              <RefreshCw size={11} /> {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
            <button onClick={openPicker} style={btnGlass} data-testid="drive-change-folder">
              <Folder size={11} /> Cambiar carpeta
            </button>
            <button onClick={() => setAuditOpen(true)} style={btnGhost} data-testid="drive-audit" title="Ver último audit">
              audit
            </button>
            <button onClick={onDisconnect} style={btnGhost} data-testid="drive-disconnect">
              <X size={10} />
            </button>
          </>
        )}
      </div>

      {pickerOpen && (
        <div data-testid="drive-picker" style={modalBackdrop} onClick={() => setPickerOpen(false)}>
          <div style={modalPanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: 'var(--cream)' }}>
                Selecciona carpeta de Drive
              </h3>
              <button onClick={() => setPickerOpen(false)} style={btnGhost}><X size={11} /></button>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 14 }}>
              Carpetas en la raíz de tu Drive. Solo monitoreamos lectura.
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {folders.length === 0 && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', padding: 14, textAlign: 'center' }}>
                  Cargando carpetas…
                </div>
              )}
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => pickFolder(f)}
                  data-testid={`drive-folder-${f.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'transparent', border: '1px solid var(--border)', borderRadius: 10,
                    fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Folder size={13} color="#a5b4fc" />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: 'var(--cream-3)' }}>{f.modifiedTime?.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {auditOpen && conn?.last_audit && (
        <div data-testid="drive-audit-modal" style={modalBackdrop} onClick={() => setAuditOpen(false)}>
          <div style={modalPanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: 'var(--cream)' }}>
                Último audit Drive sync
              </h3>
              <button onClick={() => setAuditOpen(false)} style={btnGhost}><X size={11} /></button>
            </div>
            <pre style={{ fontFamily: 'DM Mono', fontSize: 10.5, color: 'var(--cream-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 380, overflowY: 'auto', margin: 0, lineHeight: 1.55 }}>
              {JSON.stringify(conn.last_audit, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {toast && (
        <div data-testid={`drive-toast-${toast.kind}`} style={{
          position: 'fixed', bottom: 96, right: 24, zIndex: 9999,
          padding: '11px 16px', borderRadius: 12,
          background: toast.kind === 'error' ? 'rgba(239,68,68,0.92)' : toast.kind === 'warn' ? 'rgba(245,158,11,0.92)' : 'rgba(34,197,94,0.92)',
          color: '#0A0D16', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
          maxWidth: 420, boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        }}>{toast.msg}</div>
      )}
    </>
  );
}

const btnGlass = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
  fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', cursor: 'pointer',
};
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 9px', borderRadius: 9999,
  background: 'transparent', border: '1px solid var(--border)',
  fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', cursor: 'pointer',
};
const modalBackdrop = {
  position: 'fixed', inset: 0, zIndex: 9000,
  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
};
const modalPanel = {
  width: 'min(560px, 100%)',
  background: '#0E1220', border: '1px solid var(--border)', borderRadius: 18,
  padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
};
