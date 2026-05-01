// Phase 7.11 — /superadmin/drive · overview de todas las conexiones Drive activas.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import * as drive from '../../api/drive';
import { Cloud, RefreshCw, AlertTriangle, CheckCircle, Folder } from '../../components/icons';

function fmtAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'hace segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function SuperadminDrivePage({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setData(await drive.listAllDriveConnections()); }
    catch (e) { setData({ error: e.message, connections: [] }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onSync = async (devId) => {
    setBusyId(devId);
    try {
      await drive.syncDriveNow(devId, 'superadmin');
      await load();
    } catch (e) { alert(`Error: ${e.message}`); }
    setBusyId(null);
  };

  const conns = data?.connections || [];
  const configured = data?.configured;

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div>
        <div style={{ marginBottom: 22 }}>
          <div className="eyebrow">Moat #2 · Phase 7.11</div>
          <h1 data-testid="drive-h1" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '4px 0 6px' }}>
            Drive Watch Service
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
            Conexiones Google Drive activas por desarrollo. El watcher sincroniza cada 6h automáticamente — detecta archivos nuevos o modificados (vía md5Checksum) y los pasa por el pipeline de extracción + auto-sync.
          </p>
        </div>

        {!configured && (
          <div data-testid="drive-not-configured" style={{
            padding: '14px 18px', borderRadius: 14, marginBottom: 18,
            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <AlertTriangle size={16} color="#fcd34d" />
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: '#fcd34d', marginBottom: 2 }}>
                Drive OAuth no configurado
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.55 }}>
                Para activar la integración: agrega <code>GOOGLE_OAUTH_CLIENT_ID</code> y <code>GOOGLE_OAUTH_CLIENT_SECRET</code> en <code>/app/backend/.env</code>, configura el redirect URI en Google Cloud Console (<code>{process.env.REACT_APP_BACKEND_URL}/api/auth/google/drive-callback</code>) y reinicia el backend.
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div data-testid="drive-loading" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            Cargando conexiones…
          </div>
        )}

        {!loading && conns.length === 0 && configured && (
          <div data-testid="drive-empty" style={{
            padding: 32, textAlign: 'center', borderRadius: 14,
            border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)',
          }}>
            <Cloud size={28} color="var(--cream-3)" />
            <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 16, color: 'var(--cream-2)', marginTop: 12 }}>
              Aún no hay desarrollos con Drive conectado
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 6 }}>
              Cada desarrollador puede conectar su Drive desde <code>/desarrollador/desarrollos/:slug/legajo</code>.
            </div>
          </div>
        )}

        {!loading && conns.length > 0 && (
          <div data-testid="drive-table" style={{
            borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 1.4fr 1fr', gap: 0, padding: '10px 16px', background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)' }}>
              {['Desarrollo', 'Carpeta Drive', 'Estado', 'Sync', 'Último audit', 'Acciones'].map((h, i) => (
                <div key={i} className="eyebrow" style={{ fontSize: 10 }}>{h}</div>
              ))}
            </div>
            {conns.map((c) => (
              <div key={c.development_id} data-testid={`drive-row-${c.development_id}`} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 1.4fr 1fr',
                gap: 0, padding: '14px 16px', borderBottom: '1px solid var(--border)',
                fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', alignItems: 'center',
              }}>
                <div>
                  <a href={`/desarrollador/desarrollos/${c.development_id}/legajo`}
                     style={{ color: 'var(--cream)', textDecoration: 'none', fontWeight: 600 }}>
                    {c.development_id}
                  </a>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.folder_id ? (
                    <><Folder size={11} color="#a5b4fc" /> {c.folder_name || c.folder_id}</>
                  ) : (
                    <span style={{ color: 'var(--cream-3)', fontStyle: 'italic' }}>sin carpeta</span>
                  )}
                </div>
                <div>
                  {c.status === 'connected' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#86efac' }}><CheckCircle size={11} /> connected</span>}
                  {c.status === 'error' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fca5a5' }}><AlertTriangle size={11} /> error</span>}
                  {c.status === 'disconnected' && <span style={{ color: 'var(--cream-3)' }}>disconnected</span>}
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10.5 }}>
                  {fmtAgo(c.last_sync_at)}
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10 }}>
                  {c.last_audit ? `${c.last_audit.scanned || 0} scan · ${c.last_audit.new || 0} new · ${c.last_audit.updated || 0} upd${(c.last_audit.errors || []).length ? ` · ${c.last_audit.errors.length} err` : ''}` : '—'}
                </div>
                <div>
                  <button
                    onClick={() => onSync(c.development_id)}
                    disabled={busyId === c.development_id || !c.folder_id}
                    data-testid={`drive-sync-${c.development_id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.32)',
                      color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
                      cursor: c.folder_id ? 'pointer' : 'not-allowed', opacity: c.folder_id ? 1 : 0.5,
                    }}
                  >
                    <RefreshCw size={10} /> {busyId === c.development_id ? '…' : 'Sync'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
