// W1.4 ZZ.1 — Superadmin Bulk Drive Ingestion
import React, { useEffect, useState, useCallback, useRef } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import IngestionJobCard from '../../components/superadmin/IngestionJobCard';
import ReviewQueueItem from '../../components/superadmin/ReviewQueueItem';
import {
  Upload, FolderUp, Activity, FileText, Clock, DollarSign, RefreshCw, X,
} from 'lucide-react';
import {
  startIngest, listJobs, getJob, listJobItems,
  approveItem, rejectItem, mergeItem, bulkApproveJob, getStats,
} from '../../api/superadminBulkIngest';
import { listarDesarrolladores, altaDesarrollador } from '../../api/superadminAlta';
import { Z } from '../../styles/zIndex';

function fmtMxn(n) {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
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

function JobDetailDrawer({ jobId, onClose, onBulkApprove }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('resumen');

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    getJob(jobId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [jobId]);

  if (!jobId) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', justifyContent: 'flex-end' }}>
      <div data-testid="job-drawer" style={{ width: '100%', maxWidth: 560, background: 'rgba(13,17,28,0.97)', borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px 80px', overflowY: 'auto' }}>
        {loading && <div style={{ padding: 30, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>}
        {data && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0 }}>{data.id}</h2>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240, 235, 224, 0.70)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                  {data.drive_folder_url}
                </div>
              </div>
              <button onClick={onClose} data-testid="job-drawer-close"
                style={{ padding: '6px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>Cerrar</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 4 }}>
              {[['resumen', 'Resumen'], ['items', `Items (${data.items_total})`], ['errores', `Errores (${(data.error_log || []).length})`]].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} data-testid={`job-tab-${k}`}
                  style={{
                    padding: '6px 12px', borderRadius: 9999, fontSize: 12,
                    fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                    border: tab === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid transparent',
                    background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                    color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                  }}>{l}</button>
              ))}
            </div>

            {tab === 'resumen' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 18 }}>
                  {[
                    ['Total', data.items_total, 'var(--theme)'],
                    ['Aprobados', data.items_auto_approved, '#4ADE80'],
                    ['Pendientes', data.items_pending_review, '#FACC15'],
                    ['Fallidos', data.items_failed, '#F87171'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{l}</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {data.items_pending_review > 0 && (
                  <button data-testid="job-bulk-approve" onClick={() => onBulkApprove(data.id)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Aprobar todos &lt;65% score ({data.items_pending_review} candidatos)
                  </button>
                )}
              </>
            )}

            {tab === 'items' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(data.last_items || []).length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin items aún</div>
                ) : data.last_items.map(it => (
                  <div key={it.id} style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)' }}>
                      {it.extracted?.project_name || it.project_folder_name || '—'}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.72)', display: 'flex', gap: 8 }}>
                      <span>{it.decision}</span>
                      {it.dedup?.score != null && <span>· score {(it.dedup.score * 100).toFixed(0)}%</span>}
                      {it.inserted_dev_id && <span>· {it.inserted_dev_id}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'errores' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(data.error_log || []).length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'rgba(74,222,128,0.50)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin errores</div>
                ) : data.error_log.map((e, i) => (
                  <div key={i} style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: '#F87171', wordBreak: 'break-word' }}>
                    {e}
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

export default function SuperadminBulkIngest({ user, onLogout, embedded }) {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState({ items: [], total: 0 });
  const [reviewItems, setReviewItems] = useState({ items: [], total: 0 });
  const [tab, setTab] = useState('jobs');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drawerJob, setDrawerJob] = useState(null);
  const [form, setForm] = useState({ url: '', org: '' });
  const [busyStart, setBusyStart] = useState(false);
  const [toast, setToast] = useState('');
  const [devs, setDevs] = useState([]);          // para elegir/crear el dev dueño de la ingesta
  const [newDevName, setNewDevName] = useState('');
  const tabVisibleRef = useRef(true);

  const loadDevs = useCallback(() => {
    listarDesarrolladores().then((d) => setDevs(d.desarrolladores || [])).catch(() => {});
  }, []);
  const crearDevInline = async () => {
    if (!newDevName.trim()) { setToast('Escribe el nombre del nuevo desarrollador.'); return; }
    try {
      const r = await altaDesarrollador({ name: newDevName.trim(), plan_tier: 'pro' });
      loadDevs(); setForm((f) => ({ ...f, org: r.dev_org_id })); setNewDevName('');
      setToast(`Desarrollador "${r.name}" creado y seleccionado.`);
    } catch (e) { setToast(e.message || 'No se pudo crear el desarrollador.'); }
  };

  const loadStats = useCallback(async () => {
    try { setStats(await getStats()); } catch { /* keep */ }
  }, []);
  const loadJobs = useCallback(async () => {
    try { setJobs(await listJobs({ status: statusFilter, limit: 20 })); }
    catch { /* keep */ }
  }, [statusFilter]);
  const loadReview = useCallback(async () => {
    try {
      const all = await listJobs({ limit: 50 });
      const allItems = [];
      // NO filtrar por el contador del job (se queda viejo si el job murió a media corrida) →
      // consultar los pendientes REALES de cada job reciente. Así el conteo y la lista cuadran.
      for (const j of (all.items || []).slice(0, 20)) {
        try {
          const r = await listJobItems(j.id, { decision: 'pending_review', limit: 50 });
          allItems.push(...(r.items || []));
        } catch {}
      }
      setReviewItems({ items: allItems, total: allItems.length });
    } catch { /* keep */ }
  }, []);

  useEffect(() => { loadStats(); loadJobs(); loadDevs(); }, [loadStats, loadJobs, loadDevs]);
  useEffect(() => { if (tab === 'review') loadReview(); }, [tab, loadReview]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  // Auto-refresh every 10s if there's an extracting/pending job
  useEffect(() => {
    const onVis = () => { tabVisibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => {
      if (!tabVisibleRef.current) return;
      const live = (jobs.items || []).some(j => j.status === 'extracting' || j.status === 'pending');
      if (live) { loadStats(); loadJobs(); }
    }, 10000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [jobs, loadStats, loadJobs]);

  const handleStart = async () => {
    if (!form.url.trim()) { setToast('Ingresa la URL de la carpeta Drive'); return; }
    setBusyStart(true);
    try {
      const r = await startIngest(form.url.trim(), form.org.trim() || undefined);
      setToast(`Job ${r.job_id} en cola`);
      setForm({ url: '', org: '' });
      loadStats(); loadJobs();
    } catch (e) {
      setToast(e.message || 'Error al iniciar');
    } finally { setBusyStart(false); }
  };

  const handleApprove = async (id) => {
    try { await approveItem(id); setToast('Item aprobado'); loadReview(); loadStats(); loadJobs(); }
    catch (e) { setToast(e.message || 'Error'); }
  };
  const handleReject = async (id, reason) => {
    try { await rejectItem(id, reason); setToast('Item rechazado'); loadReview(); loadStats(); loadJobs(); }
    catch (e) { setToast(e.message || 'Error'); }
  };
  const handleMerge = async (id, devId) => {
    try { await mergeItem(id, devId); setToast(`Fusionado en ${devId}`); loadReview(); loadStats(); loadJobs(); }
    catch (e) { setToast(e.message || 'Error'); }
  };
  const handleBulkApprove = async (jobId) => {
    if (!window.confirm('Aprobar todos los items con score <65%?')) return;
    try {
      const r = await bulkApproveJob(jobId, 0.65);
      setToast(`${r.approved_count} aprobados, ${r.skipped_count} saltados`);
      loadStats(); loadJobs();
      if (drawerJob === jobId) {
        const fresh = await getJob(jobId); setDrawerJob(null); setTimeout(() => setDrawerJob(jobId), 100);
        void fresh;
      }
    } catch (e) { setToast(e.message || 'Error'); }
  };

  const STATUS_CHIPS = [['all', 'Todos'], ['pending', 'Pendientes'], ['extracting', 'Extrayendo'], ['reviewing', 'Revisión'], ['completed', 'Completos'], ['failed', 'Fallidos']];

  return (
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
      <div data-testid="superadmin-bulk-ingest">
        {toast && (
          <div style={{ position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <FolderUp size={20} color="var(--theme)" />
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
              Ingesta masiva
            </h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
            Pega una URL de carpeta Drive · Claude Haiku extrae proyectos · dedup automática · revisa edge cases.
          </p>
        </div>

        {/* KPI strip */}
        {stats && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <KpiCard Icon={Activity} label="Jobs totales" value={stats.jobs_total} accent="var(--theme)" />
            <KpiCard Icon={FileText} label="Proyectos ingresados" value={stats.proyectos_ingested_total} accent="#4ADE80" />
            <KpiCard Icon={Clock} label="Pendiente revisión" value={stats.pending_review_total} accent={stats.pending_review_total > 0 ? '#FACC15' : 'rgba(240,235,224,0.55)'} />
            <KpiCard Icon={DollarSign} label="AI mes (MXN)" value={fmtMxn(stats.ai_cost_mes_mxn)} accent="var(--theme)" />
          </div>
        )}

        {/* Start form */}
        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 22 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={13} color="var(--theme)" /> Iniciar nueva ingesta
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input data-testid="ingest-url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://drive.google.com/drive/folders/…"
              style={{ flex: '1 1 280px', padding: '9px 13px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
            <select data-testid="ingest-org" value={form.org} onChange={e => setForm(f => ({ ...f, org: e.target.value }))}
              style={{ flex: '0 1 220px', padding: '9px 13px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }}>
              <option value="">— desarrollador: sin asignar —</option>
              <option value="__new__">➕ Crear desarrollador nuevo…</option>
              {devs.map((d) => <option key={d.dev_org_id} value={d.dev_org_id}>{d.name}{d.status === 'pending_claim' ? ' · sin reclamar' : ''}</option>)}
            </select>
            <button data-testid="ingest-start-btn" onClick={handleStart} disabled={busyStart || !form.url.trim() || form.org === '__new__'}
              style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busyStart ? 'wait' : 'pointer', opacity: busyStart ? 0.7 : 1 }}>
              {busyStart ? 'Iniciando…' : 'Iniciar ingesta'}
            </button>
          </div>
          {form.org === '__new__' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input data-testid="ingest-newdev" value={newDevName} onChange={e => setNewDevName(e.target.value)}
                placeholder="Nombre / empresa del nuevo desarrollador"
                style={{ flex: '1 1 240px', padding: '9px 13px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
              <button data-testid="ingest-newdev-btn" onClick={crearDevInline}
                style={{ padding: '9px 18px', borderRadius: 9999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Crear y seleccionar
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button data-testid="tab-jobs" onClick={() => setTab('jobs')}
            style={{ padding: '8px 14px', borderRadius: 9999, fontSize: 12.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: tab === 'jobs' ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)', background: tab === 'jobs' ? 'rgba(var(--theme-rgb),0.16)' : 'transparent', color: tab === 'jobs' ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
            Jobs históricos
          </button>
          <button data-testid="tab-review" onClick={() => setTab('review')}
            style={{ padding: '8px 14px', borderRadius: 9999, fontSize: 12.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: tab === 'review' ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)', background: tab === 'review' ? 'rgba(var(--theme-rgb),0.16)' : 'transparent', color: tab === 'review' ? 'var(--theme)' : 'rgba(240,235,224,0.55)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Cola revisión
            {(stats?.pending_review_total || 0) > 0 && (
              <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(250,204,21,0.20)', color: '#FACC15', fontWeight: 700 }}>
                {stats.pending_review_total}
              </span>
            )}
          </button>
        </div>

        {tab === 'jobs' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {STATUS_CHIPS.map(([k, l]) => (
                <button key={k} data-testid={`status-chip-${k}`} onClick={() => setStatusFilter(k)}
                  style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: statusFilter === k ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.08)', background: statusFilter === k ? 'rgba(var(--theme-rgb),0.10)' : 'transparent', color: statusFilter === k ? 'var(--theme)' : 'rgba(240, 235, 224, 0.70)' }}>{l}</button>
              ))}
              <button onClick={() => loadJobs()} data-testid="jobs-refresh"
                style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'rgba(240,235,224,0.55)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={11} /> Refrescar
              </button>
            </div>
            {(jobs.items || []).length === 0 ? (
              <div data-testid="jobs-empty" style={{ padding: 50, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans' }}>
                <FolderUp size={36} color="rgba(240,235,224,0.18)" style={{ marginBottom: 10 }} />
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>Sin jobs aún</div>
                <div style={{ fontSize: 12 }}>Inicia tu primera ingesta arriba.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jobs.items.map(j => <IngestionJobCard key={j.id} job={j} onOpen={() => setDrawerJob(j.id)} />)}
              </div>
            )}
          </>
        )}

        {tab === 'review' && (
          <>
            {/* Explicación en lenguaje claro — qué es esto y qué significan los colores */}
            <div style={{ padding: '12px 15px', borderRadius: 11, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', marginBottom: 12, fontFamily: 'DM Sans' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 5 }}>¿Qué reviso aquí?</div>
              <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.72)', lineHeight: 1.6 }}>
                La IA leyó los documentos de cada carpeta (planos, listas de precios, fichas) y sacó los datos.
                <b style={{ color: 'var(--cream)' }}> La mayoría de proyectos entró sola al catálogo</b> (míralos en Desarrollos). Aquí abajo solo caen los que <b style={{ color: 'var(--cream)' }}>parecen repetidos</b> — tú decides.
                <br />
                En cada uno revisa que <b style={{ color: 'var(--cream)' }}>nombre, dirección, precio y unidades</b> estén bien (edítalos con un clic) y luego:
                <b style={{ color: '#4ADE80' }}> Aprobar</b> (es nuevo) · <b style={{ color: 'var(--theme)' }}>Fusionar</b> (es el mismo que ya existe) · <b style={{ color: '#F87171' }}>Rechazar</b> (no sirve).
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(240,235,224,0.62)' }}>
                <span><span style={{ color: '#4ADE80' }}>●</span> la IA lo encontró</span>
                <span><span style={{ color: '#FACC15' }}>●</span> dudoso</span>
                <span><span style={{ color: '#F87171' }}>●</span> no lo halló — complétalo (no significa que esté mal)</span>
              </div>
            </div>
            {(reviewItems.items || []).length === 0 ? (
              <div data-testid="review-empty" style={{ padding: 50, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans' }}>
                <Clock size={36} color="rgba(240,235,224,0.18)" style={{ marginBottom: 10 }} />
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>Nada que revisar</div>
                <div style={{ fontSize: 12 }}>No hay proyectos dudosos. Los que se ingirieron entraron directo al catálogo — míralos en <b style={{ color: 'var(--theme)' }}>Desarrollos</b> o en la ficha del dev.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviewItems.items.map(it => (
                  <ReviewQueueItem key={it.id} item={it}
                    onApprove={handleApprove} onReject={handleReject} onMerge={handleMerge} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <JobDetailDrawer jobId={drawerJob} onClose={() => setDrawerJob(null)} onBulkApprove={handleBulkApprove} />
    </SuperadminLayout>
  );
}
