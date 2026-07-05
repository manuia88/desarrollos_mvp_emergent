// W2.1 SA2 — Superadmin Data Sources Hub
import React, { useEffect, useState, useCallback, useRef } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import ConnectorCard from '../../components/superadmin/ConnectorCard';
import {
  Plug, Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw, X, Repeat, Play,
} from 'lucide-react';
import {
  listConnectors, getConnector, testConnector, retryConnector, replayConnector, listInvocations,
  getInsightsCronStatus, refreshInsightSource, listInsightCourses, createInsightCourse, deleteInsightCourse,
} from '../../api/superadminDataHub';
import { Z } from '../../styles/zIndex';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function KpiCard({ Icon, label, value, accent }) {
  return (
    <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <Icon size={11} color={accent} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: accent || 'var(--cream)' }}>{value}</div>
    </div>
  );
}

function ReplayModal({ connector, onClose, onConfirm }) {
  const today = new Date().toISOString().slice(0, 10);
  const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(sevenAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const fromTs = `${from}T00:00:00Z`;
      const toTs = `${to}T23:59:59Z`;
      // Pre-validate range client-side
      const days = (new Date(toTs) - new Date(fromTs)) / 86400000;
      if (days > 7) { setErr('Rango máximo 7 días'); setBusy(false); return; }
      if (days < 0) { setErr('Fecha fin debe ser posterior a fecha inicio'); setBusy(false); return; }
      const r = await replayConnector(connector.id, fromTs, toTs);
      onConfirm(r);
    } catch (e) { setErr(e.message || 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="replay-modal" style={{
        width: '100%', maxWidth: 460, background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14,
        padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Repeat size={14} color="var(--theme)" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, flex: 1 }}>
            Reproducir fallos · {connector.name}
          </h3>
          <button onClick={onClose} data-testid="replay-modal-close"
            style={{ padding: 5, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)' }}>
            <X size={14} />
          </button>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', margin: 0, lineHeight: 1.5 }}>
          Re-ejecuta hasta 100 invocaciones fallidas en el rango seleccionado.
          Rango máximo 7 días.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Desde</span>
            <input data-testid="replay-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ padding: '7px 11px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none' }} />
          </label>
          <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Hasta</span>
            <input data-testid="replay-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ padding: '7px 11px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none' }} />
          </label>
        </div>
        {err && (
          <div data-testid="replay-err" style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)', padding: '7px 11px', borderRadius: 8 }}>
            {err}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button data-testid="replay-confirm" onClick={submit} disabled={busy}
            style={{ padding: '8px 18px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Ejecutando…' : 'Reproducir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectorDrawer({ connectorId, onClose, onAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [invFilter, setInvFilter] = useState('all');
  const [invs, setInvs] = useState({ items: [], total: 0 });

  const reload = useCallback(async () => {
    if (!connectorId) return;
    setLoading(true);
    try { setData(await getConnector(connectorId)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [connectorId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!connectorId || tab !== 'log') return;
    listInvocations(connectorId, { limit: 100, status: invFilter === 'all' ? undefined : invFilter })
      .then(setInvs).catch(() => setInvs({ items: [], total: 0 }));
  }, [connectorId, tab, invFilter]);

  if (!connectorId) return null;
  const conn = data?.connector;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', justifyContent: 'flex-end' }}>
      <div data-testid="connector-drawer" style={{
        width: '100%', maxWidth: 600, background: 'rgba(13,17,28,0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px 80px',
        overflowY: 'auto',
      }}>
        {loading && <div style={{ padding: 30, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>}
        {conn && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
              <div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '0 0 3px' }}>
                  {conn.name}
                </h2>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)' }}>
                  {conn.id} · {conn.category}
                </div>
              </div>
              <button onClick={onClose} data-testid="connector-drawer-close"
                style={{ padding: '6px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>Cerrar</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 4, flexWrap: 'wrap' }}>
              {[['overview', 'Overview'], ['log', `Log (${data?.invocations?.length || 0})`], ['audit', `Auditoría (${data?.audit_log?.length || 0})`]].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} data-testid={`drawer-tab-${k}`}
                  style={{
                    padding: '6px 12px', borderRadius: 9999, fontSize: 12,
                    fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                    border: tab === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid transparent',
                    background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                    color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                  }}>{l}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {[
                    ['Estado', conn.status, conn.status === 'ok' ? '#4ADE80' : conn.status === 'failed' ? '#F87171' : conn.status === 'degraded' ? '#FACC15' : 'rgba(240,235,224,0.55)'],
                    ['OK 24h', conn.success_count_24h || 0, '#4ADE80'],
                    ['Fails 24h', conn.fail_count_24h || 0, conn.fail_count_24h ? '#F87171' : 'rgba(240,235,224,0.55)'],
                    ['Latencia avg', `${Math.round(conn.latency_avg_ms_24h || 0)}ms`, 'var(--theme)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ padding: '11px 13px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{l}</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {conn.last_error && (
                  <div style={{ padding: '9px 12px', borderRadius: 9, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Último error</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: '#F87171', wordBreak: 'break-word' }}>{conn.last_error}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button data-testid="drawer-test" onClick={async () => { await onAction('test', conn.id); reload(); }}
                    style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Play size={11} /> Probar
                  </button>
                  {conn.supports_retry && (
                    <button data-testid="drawer-retry" onClick={async () => { await onAction('retry', conn.id); reload(); }}
                      style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <RefreshCw size={11} /> Reintentar
                    </button>
                  )}
                  {conn.supports_replay && (
                    <button data-testid="drawer-replay" onClick={() => onAction('replay', conn)}
                      style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Repeat size={11} /> Replay
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === 'log' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[['all', 'Todos'], ['ok', 'OK'], ['fail', 'Falló']].map(([k, l]) => (
                    <button key={k} onClick={() => setInvFilter(k)} data-testid={`inv-filter-${k}`}
                      style={{ padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: invFilter === k ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.10)', background: invFilter === k ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', color: invFilter === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
                      {l}
                    </button>
                  ))}
                  <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)' }}>
                    {invs.total} totales
                  </span>
                </div>
                {(invs.items || []).length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>
                    Sin invocaciones
                  </div>
                ) : invs.items.map((inv) => (
                  <div key={inv.id} style={{
                    padding: '7px 11px', borderRadius: 8,
                    background: inv.status === 'ok' ? 'rgba(74,222,128,0.04)' : 'rgba(239,68,68,0.05)',
                    border: `1px solid ${inv.status === 'ok' ? 'rgba(74,222,128,0.18)' : 'rgba(239,68,68,0.22)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 10.5, marginBottom: inv.error ? 3 : 0 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700, background: inv.status === 'ok' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)', color: inv.status === 'ok' ? '#4ADE80' : '#F87171' }}>
                        {inv.status.toUpperCase()}
                      </span>
                      <span style={{ color: 'rgba(240,235,224,0.55)' }}>{fmtRel(inv.ts)}</span>
                      <span style={{ color: 'rgba(240, 235, 224, 0.70)' }}>· {inv.op}</span>
                      <span style={{ color: 'var(--theme)' }}>· {inv.duration_ms}ms</span>
                    </div>
                    {inv.error && (
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: '#F87171', wordBreak: 'break-word' }}>{inv.error}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(data?.audit_log || []).length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>
                    Sin entradas de auditoría
                  </div>
                ) : data.audit_log.map((a) => (
                  <div key={a.id} style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 10.5, marginBottom: 3 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700, background: 'rgba(var(--theme-rgb),0.15)', color: 'var(--theme)' }}>
                        {a.action}
                      </span>
                      <span style={{ color: 'rgba(240,235,224,0.55)' }}>{fmtRel(a.ts)}</span>
                      <span style={{ color: 'rgba(240, 235, 224, 0.70)' }}>· {a.actor?.user_id || '—'}</span>
                    </div>
                    {a.after && (
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.55)', wordBreak: 'break-word' }}>
                        {JSON.stringify(a.after)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ── Insights externos — frescura por fuente + refresh + cursos (censo 2026-07-05: backend sin pantalla) ──
function InsightsExternosPanel() {
  const [st, setSt] = useState(null);
  const [courses, setCourses] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [nuevo, setNuevo] = useState({ title: '', description: '' });
  const load = useCallback(() => {
    getInsightsCronStatus().then(setSt).catch(() => setSt({ error: true }));
    listInsightCourses().then((r) => setCourses(r.courses || r.items || (Array.isArray(r) ? r : []))).catch(() => setCourses([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = async (id) => {
    setBusy(id); setMsg('');
    try { await refreshInsightSource(id); setMsg(`${id} refrescada ✓`); load(); }
    catch (e) { setMsg(e?.message || 'Error.'); }
    finally { setBusy(''); }
  };
  const crear = async () => {
    if (!nuevo.title.trim()) return;
    setBusy('crear');
    try { await createInsightCourse({ title: nuevo.title.trim(), description: nuevo.description.trim() || null }); setNuevo({ title: '', description: '' }); load(); }
    catch (e) { setMsg(e?.message || 'Error al crear.'); }
    finally { setBusy(''); }
  };
  const borrar = async (slug) => {
    if (!window.confirm('¿Borrar este curso?')) return;
    setBusy(slug);
    try { await deleteInsightCourse(slug); load(); } catch (e) { setMsg(e?.message || 'Error.'); }
    finally { setBusy(''); }
  };
  const tone = (status) => status === 'ok' ? '#34D399' : status === 'error' ? '#F87171' : status === 'never_fetched' ? 'rgba(240,235,224,0.4)' : '#F5C451';
  const sources = (st && st.sources) || (st && st.statuses) || [];
  return (
    <div data-testid="insights-externos-panel" style={{ marginTop: 24 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginBottom: 2 }}>Insights externos</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 12 }}>
        Fuentes de contexto (tasas, noticias, indicadores) que alimentan los insights — frescura por fuente y refresco manual.
      </div>
      {st === null && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>Cargando…</div>}
      {st && st.error && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>No se pudo cargar el estado de fuentes.</div>}
      {sources.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {sources.map((f) => (
            <div key={f.source_id || f.id} style={{ padding: '11px 13px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: tone(f.status), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.source_id || f.id}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' }}>{f.status === 'never_fetched' ? 'nunca consultada' : (f.last_fetched_at || f.updated_at || '').slice(0, 16) || f.status}</div>
              </div>
              <button onClick={() => refresh(f.source_id || f.id)} disabled={!!busy} title="Refrescar ahora"
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 8px', cursor: busy ? 'wait' : 'pointer', color: 'rgba(240,235,224,0.7)' }}>
                <RefreshCw size={12} className={busy === (f.source_id || f.id) ? 'animate-spin' : undefined} />
              </button>
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.7)', marginTop: 8 }}>{msg}</div>}

      {/* Cursos educativos (el público los ve en Insights → aquí se administran) */}
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)', margin: '18px 0 8px' }}>Cursos educativos</div>
      {courses !== null && courses.length === 0 && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)', marginBottom: 8 }}>Sin cursos publicados todavía.</div>}
      {courses !== null && courses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {courses.map((c) => (
            <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)' }}>{c.title}</span>
                {c.description && <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.5)', marginLeft: 8 }}>{String(c.description).slice(0, 80)}</span>}
              </div>
              <button onClick={() => borrar(c.slug)} disabled={!!busy} title="Borrar curso"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.45)', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={nuevo.title} onChange={(e) => setNuevo((n) => ({ ...n, title: e.target.value }))} placeholder="Título del curso"
          style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none', width: 220 }} />
        <input value={nuevo.description} onChange={(e) => setNuevo((n) => ({ ...n, description: e.target.value }))} placeholder="Descripción (opcional)"
          style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none', flex: 1, minWidth: 200 }} />
        <button onClick={crear} disabled={!!busy || !nuevo.title.trim()}
          style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(var(--theme-rgb),0.4)', background: 'rgba(var(--theme-rgb),0.14)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: (busy || !nuevo.title.trim()) ? 'default' : 'pointer' }}>
          {busy === 'crear' ? 'Creando…' : 'Crear curso'}
        </button>
      </div>
    </div>
  );
}

export default function SuperadminDataSourcesHub({ user, onLogout }) {
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [drawerId, setDrawerId] = useState(null);
  const [replayConn, setReplayConn] = useState(null);
  const [toast, setToast] = useState('');
  const [refreshingAll, setRefreshingAll] = useState(false);
  const tabVisibleRef = useRef(true);

  const load = useCallback(async () => {
    try { setData(await listConnectors()); }
    catch (e) { setToast(e.message || 'Error al cargar'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); } }, [toast]);

  // Auto-refresh KPIs every 60s (paused when tab hidden)
  useEffect(() => {
    const onVis = () => { tabVisibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (tabVisibleRef.current) load(); }, 60000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [load]);

  const handleTest = async (id) => {
    try { const r = await testConnector(id); setToast(r.ok ? `Probado: ${r.latency_ms}ms` : `Falló: ${r.error || 'error'}`); load(); }
    catch (e) { setToast(e.message || 'Error'); }
  };
  const handleRetry = async (id) => {
    try { const r = await retryConnector(id); setToast((r.retry_result?.ok ? 'Retry OK' : 'Retry falló') + ` · ${r.retry_result?.latency_ms || 0}ms`); load(); }
    catch (e) { setToast(e.message || 'Error'); }
  };
  const handleReplay = (conn) => setReplayConn(conn);
  const handleReplayConfirm = (r) => {
    setReplayConn(null);
    setToast(`Replay ${r.connector_id}: ${r.succeeded} OK · ${r.failed_again} fallaron · total ${r.total}`);
    load();
  };

  const handleDrawerAction = async (action, payload) => {
    if (action === 'test') return handleTest(payload);
    if (action === 'retry') return handleRetry(payload);
    if (action === 'replay') {
      setDrawerId(null);
      setTimeout(() => setReplayConn(payload), 100);
    }
  };

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      const ids = (data.items || []).filter(c => c.status !== 'stub').map(c => c.id);
      await Promise.allSettled(ids.map(id => testConnector(id)));
      setToast(`Refrescados ${ids.length} conectores`);
      await load();
    } finally { setRefreshingAll(false); }
  };

  const filtered = (data.items || []).filter(c => {
    if (filterCat !== 'all' && c.category !== filterCat) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  const CATEGORY_CHIPS = [
    ['all', 'Todos'], ['ai', 'IA'], ['geo', 'Geo'], ['email', 'Email'],
    ['drive', 'Drive'], ['observability', 'Observabilidad'], ['calendar', 'Calendar'],
  ];
  const STATUS_CHIPS = [
    ['all', 'Todos'], ['ok', 'OK'], ['degraded', 'Degraded'], ['failed', 'Failed'], ['stub', 'Stub'],
  ];

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-data-hub">
        <style>{`@keyframes connectorPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }`}</style>

        {toast && (
          <div data-testid="hub-toast" style={{ position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Plug size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
                Conectores
              </h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
              Status real, retry manual y replay de rangos fallidos para todos los servicios externos.
            </p>
          </div>
          <button data-testid="refresh-all-btn" onClick={refreshAll} disabled={refreshingAll}
            style={{ padding: '9px 18px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: refreshingAll ? 'wait' : 'pointer', opacity: refreshingAll ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} className={refreshingAll ? 'animate-spin' : ''} />
            {refreshingAll ? 'Refrescando…' : 'Refrescar todo'}
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
          <KpiCard Icon={Activity} label="Total" value={data.counts?.total || 0} accent="var(--theme)" />
          <KpiCard Icon={CheckCircle} label="Operativos" value={data.counts?.ok || 0} accent="#4ADE80" />
          <KpiCard Icon={AlertTriangle} label="Degraded" value={data.counts?.degraded || 0} accent="#FACC15" />
          <KpiCard Icon={XCircle} label="Failed" value={data.counts?.failed || 0} accent={data.counts?.failed ? '#F87171' : 'rgba(240,235,224,0.55)'} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 }}>Categoría</span>
          {CATEGORY_CHIPS.map(([k, l]) => (
            <button key={k} data-testid={`cat-chip-${k}`} onClick={() => setFilterCat(k)}
              style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: filterCat === k ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.08)', background: filterCat === k ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', color: filterCat === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 }}>Estado</span>
          {STATUS_CHIPS.map(([k, l]) => (
            <button key={k} data-testid={`status-chip-${k}`} onClick={() => setFilterStatus(k)}
              style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: filterStatus === k ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.08)', background: filterStatus === k ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', color: filterStatus === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans' }}>
            Cargando conectores…
          </div>
        ) : filtered.length === 0 ? (
          <div data-testid="hub-empty" style={{ padding: 60, textAlign: 'center', borderRadius: 14, background: 'rgba(240,235,224,0.03)', border: '1px dashed rgba(240,235,224,0.14)', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.55)' }}>
            <Plug size={28} color="rgba(240,235,224,0.20)" style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>
              Sin conectores que coincidan
            </div>
            <div style={{ fontSize: 12 }}>Ajusta los filtros para ver más resultados.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map(c => (
              <ConnectorCard key={c.id} conn={c}
                onTest={handleTest} onRetry={handleRetry} onReplay={handleReplay}
                onOpen={() => setDrawerId(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      <InsightsExternosPanel />

      <ConnectorDrawer connectorId={drawerId} onClose={() => setDrawerId(null)} onAction={handleDrawerAction} />
      {replayConn && <ReplayModal connector={replayConn} onClose={() => setReplayConn(null)} onConfirm={handleReplayConfirm} />}
    </SuperadminLayout>
  );
}
