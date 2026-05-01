// /superadmin/scores — tabla filtrable + "Ver explain" + drawer Histórico + Recompute batch (Phase B3)
import React, { useEffect, useMemo, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import * as api from '../../api/superadmin';
import ScoreExplainModal from '../../components/landing/ScoreExplainModal';
import { Sparkle, Database, X } from '../../components/icons';

const TIER_COLORS = {
  green:   { bg: 'rgba(34,197,94,0.14)',  fg: '#86efac', label: 'Óptimo' },
  amber:   { bg: 'rgba(245,158,11,0.14)', fg: '#fcd34d', label: 'Medio' },
  red:     { bg: 'rgba(239,68,68,0.14)',  fg: '#fca5a5', label: 'Atención' },
  unknown: { bg: 'rgba(148,163,184,0.12)', fg: 'var(--cream-3)', label: '—' },
};

const fmtDate = (s) => s ? new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function TierPill({ tier }) {
  const t = TIER_COLORS[tier] || TIER_COLORS.unknown;
  return (
    <span data-testid={`tier-pill-${tier}`} style={{
      padding: '2px 10px', borderRadius: 9999,
      background: t.bg, color: t.fg,
      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>{t.label}</span>
  );
}

function ScoreHistoryDrawer({ zoneId, code, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!zoneId || !code) return;
    setData(null);
    api.scoreHistory(zoneId, code).then(setData).catch(e => setErr(e.message));
  }, [zoneId, code]);
  if (!zoneId || !code) return null;
  return (
    <div data-testid="history-drawer" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 510,
      background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: '100%', height: '100vh',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        borderLeft: '1px solid var(--border)', padding: 28, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <div className="eyebrow">Histórico</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: '4px 0 2px', letterSpacing: '-0.02em' }}>
              {code}
            </h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              zone: <strong style={{ color: 'var(--cream)' }}>{zoneId}</strong>
            </div>
          </div>
          <button onClick={onClose} data-testid="history-close" style={{
            background: 'transparent', border: '1px solid var(--border)',
            padding: 8, borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
          }}><X size={14} /></button>
        </div>

        {err && <div style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12 }}>Error: {err}</div>}
        {!data && !err && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando…</div>}

        {data?.current && (
          <div style={{ padding: 16, marginBottom: 18, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.08)', borderRadius: 14 }}>
            <div className="eyebrow" style={{ margin: 0 }}>Valor actual</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {data.current.value != null ? data.current.value.toFixed(1) : '—'}
              </span>
              <TierPill tier={data.current.tier} />
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 'auto' }}>{fmtDate(data.current.computed_at)}</span>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6 }}>
              formula v{data.current.formula_version} · confidence {data.current.confidence}
            </div>
          </div>
        )}

        <div className="eyebrow" style={{ marginBottom: 8 }}>Timeline ({data?.history?.length || 0})</div>
        {data?.history?.length === 0 && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', padding: 14, border: '1px dashed var(--border)', borderRadius: 12 }}>
            Sin recomputes previos. Este es el primer snapshot.
          </div>
        )}
        {data?.history?.map((h, i) => (
          <div key={i} data-testid="history-row" style={{
            padding: '10px 14px', marginBottom: 6,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', minWidth: 44 }}>
              {h.value != null ? h.value.toFixed(1) : '—'}
            </span>
            <TierPill tier={h.tier} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 'auto' }}>{fmtDate(h.archived_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BatchProgressBar({ task }) {
  if (!task || task.status === 'idle') return null;
  const pct = task.total ? Math.round((task.processed / task.total) * 100) : 0;
  const running = task.status === 'running';
  return (
    <div data-testid="batch-progress" style={{
      padding: 14, marginBottom: 18,
      background: running ? 'rgba(99,102,241,0.08)' : 'rgba(34,197,94,0.06)',
      border: `1px solid ${running ? 'rgba(99,102,241,0.32)' : 'rgba(34,197,94,0.28)'}`,
      borderRadius: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Sparkle size={13} color={running ? 'var(--indigo-3)' : '#86efac'} />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
          {running ? 'Recomputando todas las zonas…' : 'Recompute terminado'}
        </span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 'auto' }}>
          {task.processed}/{task.total} zonas · {task.real_count || 0} reales · {task.stub_count || 0} stubs
          {task.duration_ms ? ` · ${(task.duration_ms / 1000).toFixed(1)}s` : ''}
        </span>
      </div>
      <div style={{ height: 4, background: 'rgba(148,163,184,0.18)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: running ? 'var(--grad)' : '#22c55e', transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

export default function ScoresPage({ user, onLogout }) {
  const [scores, setScores] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [explain, setExplain] = useState(null);
  const [history, setHistory] = useState(null);
  const [task, setTask] = useState(null);
  const [toast, setToast] = useState(null);

  const [fZone, setFZone] = useState('');
  const [fCode, setFCode] = useState('');
  const [fTier, setFTier] = useState('');
  const [fScope, setFScope] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.listScores({ zone_id: fZone, code: fCode, tier: fTier, scope: fScope, limit: 500 }),
        api.listRecipes(),
      ]);
      setScores(s);
      setRecipes(r.recipes || []);
    } catch (e) {
      setToast({ type: 'err', msg: `Error cargando: ${e.message}` });
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fZone, fCode, fTier, fScope]);

  // Poll active task if running
  useEffect(() => {
    if (!task || task.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const updated = await api.recomputeAllStatus(task.id);
        setTask(updated);
        if (updated.status !== 'running') {
          clearInterval(t);
          setToast({ type: 'ok', msg: `Recompute terminado: ${updated.real_count} reales, ${updated.stub_count} stubs.` });
          load();
        }
      } catch (e) { clearInterval(t); }
    }, 1500);
    return () => clearInterval(t);
  }, [task?.id, task?.status]);

  // On load, fetch most recent task
  useEffect(() => {
    api.recomputeAllStatus().then(t => {
      if (t && t.id) setTask(t);
    }).catch(() => {});
  }, []);

  const fireRecomputeAll = async () => {
    try {
      const resp = await api.recomputeAll();
      const fresh = await api.recomputeAllStatus(resp.task_id);
      setTask(fresh);
      setToast({ type: 'ok', msg: `Recompute disparado: ${resp.total} zonas en cola.` });
    } catch (e) {
      setToast({ type: 'err', msg: `Error: ${e.message}` });
    }
  };

  const zones = useMemo(() => Array.from(new Set(scores.map(s => s.zone_id))).sort(), [scores]);
  const codes = useMemo(() => Array.from(new Set(recipes.map(r => r.code))).sort(), [recipes]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <div className="eyebrow">IE Engine · Phase B3</div>
              <h1 data-testid="scores-h1" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '4px 0 2px' }}>
                Scores calculados
              </h1>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
                {recipes.length} recipes registradas · {scores.length} scores persistidos
              </div>
            </div>
            <button data-testid="recompute-all-btn" onClick={fireRecomputeAll}
              disabled={task?.status === 'running'}
              style={{
                padding: '10px 22px', borderRadius: 9999,
                background: task?.status === 'running' ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: task?.status === 'running' ? 'wait' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              <Database size={13} />
              {task?.status === 'running' ? 'Recomputando…' : 'Recompute todas las zonas'}
            </button>
          </div>

          <BatchProgressBar task={task} />

          {/* Filters */}
          <div data-testid="scores-filters" style={{
            display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
            padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14,
          }}>
            <select value={fScope} onChange={e => setFScope(e.target.value)} data-testid="f-scope"
              style={{ padding: '8px 12px', background: '#0D1118', border: '1px solid var(--border)', color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5 }}>
              <option value="">Scope: todos</option>
              <option value="colonia">Colonia</option>
              <option value="proyecto">Proyecto</option>
            </select>
            <select value={fZone} onChange={e => setFZone(e.target.value)} data-testid="f-zone"
              style={{ padding: '8px 12px', background: '#0D1118', border: '1px solid var(--border)', color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5, minWidth: 160 }}>
              <option value="">Zona: todas</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <select value={fCode} onChange={e => setFCode(e.target.value)} data-testid="f-code"
              style={{ padding: '8px 12px', background: '#0D1118', border: '1px solid var(--border)', color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5, minWidth: 220 }}>
              <option value="">Recipe: todos</option>
              {codes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fTier} onChange={e => setFTier(e.target.value)} data-testid="f-tier"
              style={{ padding: '8px 12px', background: '#0D1118', border: '1px solid var(--border)', color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5 }}>
              <option value="">Tier: todos</option>
              <option value="green">Óptimo</option>
              <option value="amber">Medio</option>
              <option value="red">Atención</option>
              <option value="unknown">Desconocido</option>
            </select>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 'auto' }}>
              {loading ? 'Cargando…' : `${scores.length} resultados`}
            </div>
          </div>

          {/* Table */}
          <div style={{ background: '#0D1118', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="scores-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                    {['Zona', 'Recipe', 'Valor', 'Tier', 'Confidence', 'Stub', 'Computed', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.length === 0 && !loading && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>
                      Sin scores que coincidan con los filtros.
                    </td></tr>
                  )}
                  {scores.map((s, i) => (
                    <tr key={`${s.zone_id}-${s.code}`} data-testid="score-row" style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 500 }}>{s.zone_id}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{s.code}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>
                        {s.value != null ? s.value.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}><TierPill tier={s.tier} /></td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{s.confidence}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 11, color: s.is_stub ? '#fca5a5' : '#86efac' }}>{s.is_stub ? 'Sí' : 'No'}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>{fmtDate(s.computed_at)}</td>
                      <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                        <button data-testid="btn-explain" onClick={() => setExplain({ zoneId: s.zone_id, code: s.code })} style={{
                          padding: '5px 10px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.32)',
                          color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                        }}>Ver explain</button>
                        <button data-testid="btn-history" onClick={() => setHistory({ zoneId: s.zone_id, code: s.code })} style={{
                          padding: '5px 10px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)',
                          color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                        }}>Histórico</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        {toast && (
          <div data-testid="scores-toast" style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 540,
            padding: '12px 18px', borderRadius: 14,
            background: toast.type === 'err' ? 'rgba(239,68,68,0.16)' : 'rgba(34,197,94,0.14)',
            border: `1px solid ${toast.type === 'err' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.35)'}`,
            color: toast.type === 'err' ? '#fca5a5' : '#86efac',
            fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, maxWidth: 360,
          }}>{toast.msg}</div>
        )}

        <ScoreExplainModal
          open={!!explain} zoneId={explain?.zoneId} code={explain?.code}
          onClose={() => setExplain(null)}
        />
        {history && (
          <ScoreHistoryDrawer
            zoneId={history.zoneId} code={history.code}
            onClose={() => setHistory(null)}
          />
        )}
      </div>
    </SuperadminLayout>
  );
}
