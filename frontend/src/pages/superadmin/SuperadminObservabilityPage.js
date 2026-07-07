// Phase F0.11 — /superadmin/observability · Sentry + PostHog + ml_events status.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Sparkle, AlertTriangle, BarChart, ArrowRight, RefreshCw } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;
const authH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dmx_token')}` });

function Card({ children, tone = 'default' }) {
  const borders = {
    default: 'var(--border)',
    ok:      'rgba(34,197,94,0.32)',
    warn:    'rgba(245,158,11,0.32)',
    err:     'rgba(239,68,68,0.32)',
  };
  return (
    <div style={{
      padding: 22, borderRadius: 14,
      background: 'rgba(255,255,255,0.02)', border: `1px solid ${borders[tone]}`,
      display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160,
    }}>{children}</div>
  );
}


// ── Corridas de subagentes (pricing/marketing/leads) — censo 2026-07-05: backend sin pantalla ──
function SubagentRunsPanel() {
  const [tipo, setTipo] = React.useState('pricing');
  const [runs, setRuns] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    setRuns(null);
    fetch(`${API}/api/superadmin/subagents/${tipo}/runs?days=30&limit=15`, { headers: authH(), credentials: 'include' })
      .then((r) => r.json()).then((d) => { if (alive) setRuns(d.runs || d.items || (Array.isArray(d) ? d : [])); })
      .catch(() => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, [tipo]);
  const TIPOS = [['pricing', 'Precios'], ['marketing', 'Marketing'], ['lead', 'Leads']];
  return (
    <div data-testid="subagent-runs-panel" style={{ marginTop: 22, padding: 22, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginBottom: 2 }}>Agentes que trabajan solos</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 10 }}>Cada corrida de los subagentes de precios, marketing y leads — qué hicieron y cuándo (últimos 30 días).</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {TIPOS.map(([k, l]) => (
          <button key={k} onClick={() => setTipo(k)} data-testid={`subagent-tab-${k}`}
            style={{ padding: '5px 14px', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
              background: tipo === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${tipo === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
              color: tipo === k ? 'var(--theme)' : 'rgba(240,235,224,0.6)' }}>{l}</button>
        ))}
      </div>
      {runs === null && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>Cargando…</div>}
      {runs !== null && runs.length === 0 && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>Sin corridas en 30 días — este agente aún no se activa.</div>}
      {runs !== null && runs.length > 0 && runs.slice(0, 10).map((r, i) => (
        <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.8)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 9999, background: (r.status === 'error' || r.error) ? '#F87171' : '#34D399', flexShrink: 0 }} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' }}>{String(r.created_at || '').slice(0, 16).replace('T', ' ')}</span>
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.summary || r.action || r.result_summary || r.org_id || 'corrida'}</span>
          {r.org_id && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.4)' }}>{r.org_id}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Memoria del Director (agente IA del dev) — stats + inspección (censo 2026-07-05) ──
function DirectorMemoryPanel() {
  const [stats, setStats] = React.useState(null);
  const [q, setQ] = React.useState('');
  const [orgId, setOrgId] = React.useState('');
  const [hits, setHits] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    fetch(`${API}/api/superadmin/director/memory/stats?days=90`, { headers: authH(), credentials: 'include' })
      .then((r) => r.json()).then(setStats).catch(() => setStats({ error: true }));
  }, []);
  const buscar = async () => {
    if (!q.trim() || !orgId.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/director/memory/retrieve`, { method: 'POST', headers: authH(), credentials: 'include',
        body: JSON.stringify({ query: q.trim(), org_id: orgId.trim(), top_k: 5 }) });
      const d = await r.json();
      setHits(d.results || d.memories || (Array.isArray(d) ? d : []));
    } catch { setHits([]); }
    finally { setBusy(false); }
  };
  const byType = (stats && Array.isArray(stats.by_source_type)) ? stats.by_source_type : [];
  return (
    <div data-testid="director-memory-panel" style={{ marginTop: 14, padding: 22, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginBottom: 2 }}>Memoria del Director</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 10 }}>Qué recuerda el agente Director de cada cuenta — y qué recuperaría ante una pregunta (inspección al átomo).</div>
      {stats && !stats.error && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.75)' }}>
          <span>memorias (90d): <b style={{ color: 'var(--cream)' }}>{stats.total_entries ?? 0}</b></span>
          {byType.map((t) => <span key={t.source_type}>{t.source_type}: <b style={{ color: 'var(--cream)' }}>{t.count}</b></span>)}
        </div>
      )}
      {stats && stats.error && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>No se pudo cargar la memoria.</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org_id (cuenta)"
          style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none', width: 160 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="¿Qué recordaría sobre…?"
          style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none', flex: 1, minWidth: 200 }} />
        <button onClick={buscar} disabled={busy || !q.trim() || !orgId.trim()}
          style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(var(--theme-rgb),0.4)', background: 'rgba(var(--theme-rgb),0.14)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Buscando…' : 'Inspeccionar'}
        </button>
      </div>
      {hits !== null && (
        <div style={{ marginTop: 10 }}>
          {hits.length === 0 && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>Sin memorias que coincidan.</div>}
          {hits.slice(0, 5).map((m, i) => (
            <div key={m.id || i} style={{ padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 6, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.8)' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.45)', marginRight: 8 }}>{m.source_type || m.type || 'memoria'}</span>
              {String(m.content || m.text || m.summary || '').slice(0, 180)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuperadminObservabilityPage({ user, onLogout, embedded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/_internal/observability/status`, { credentials: 'include' });
      setData(await r.json());
    } catch (e) { setData({ error: e.message }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const forceSentryError = async () => {
    setTesting(true);
    try {
      await fetch(`${API}/api/_internal/test-sentry`, { method: 'POST', credentials: 'include' });
      alert('Error forzado. Revisa Sentry dashboard en <30s.');
    } catch {}
    setTesting(false);
  };

  const emitTestMlEvent = async () => {
    try {
      const m = await import('../../observability');
      await m.emitMlEvent({
        event_type: 'observability_page_test',
        context: { page: '/superadmin/observability' },
        ai_decision: { suggested: 'click' },
        user_action: { accepted: true },
      });
      await load();
    } catch {}
  };

  return (
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
      <div>
        <div style={{ marginBottom: 22 }}>
          <div className="eyebrow">Phase F0.11</div>
          <h1 data-testid="obs-h1" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '4px 0 6px' }}>
            Observability · Sentry + PostHog
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
            Wiring de error tracking, product analytics y ML training events. Base para Phase 17 (ML continuous training).
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={load} data-testid="obs-refresh" className="btn btn-glass btn-sm">
              <RefreshCw size={11} /> Actualizar
            </button>
            <button onClick={forceSentryError} disabled={testing} data-testid="obs-force-error" className="btn btn-glass btn-sm">
              <AlertTriangle size={11} /> Forzar error (Sentry)
            </button>
            <button onClick={emitTestMlEvent} data-testid="obs-emit-ml" className="btn btn-glass btn-sm">
              <Sparkle size={11} /> Emitir ml_event test
            </button>
          </div>
        </div>

        {loading && <div data-testid="obs-loading" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando…</div>}

        {data && !loading && (
          <div data-testid="obs-cards" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16,
          }}>
            {/* Sentry */}
            <Card tone={data.sentry?.enabled ? 'ok' : 'warn'}>
              <div className="eyebrow">Sentry</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {data.sentry?.enabled ? 'Conectado' : 'Stub'}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                {data.sentry?.enabled
                  ? 'Errores backend y frontend se envían a tu dashboard Sentry. Sample 0.1 · Replay on-error 1.0.'
                  : 'Configura SENTRY_DSN en /app/backend/.env + REACT_APP_SENTRY_DSN en /app/frontend/.env.'}
              </div>
              {data.sentry?.enabled && data.sentry.dashboard_url && (
                <a href={data.sentry.dashboard_url} target="_blank" rel="noreferrer" data-testid="obs-sentry-link" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--theme)',
                  textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 600,
                }}>
                  Abrir Sentry <ArrowRight size={10} />
                </a>
              )}
            </Card>

            {/* PostHog */}
            <Card tone={data.posthog?.enabled ? 'ok' : 'warn'}>
              <div className="eyebrow">PostHog</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {data.posthog?.enabled ? 'Conectado' : 'Stub'}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                {data.posthog?.enabled
                  ? 'Product analytics activo. Autocapture ON · identify con role/org_id · eventos ML con prefijo dmx_ml_*.'
                  : 'Configura POSTHOG_KEY en /app/backend/.env + REACT_APP_POSTHOG_KEY en /app/frontend/.env.'}
              </div>
              {data.posthog?.enabled && data.posthog.dashboard_url && (
                <a href={data.posthog.dashboard_url} target="_blank" rel="noreferrer" data-testid="obs-posthog-link" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--theme)',
                  textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 600,
                }}>
                  Abrir PostHog <ArrowRight size={10} />
                </a>
              )}
            </Card>

            {/* ML Events */}
            <Card tone="default">
              <div className="eyebrow">ML training events · 24h</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div data-testid="obs-ml-24h" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 40, color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {data.ml_events?.last_24h || 0}
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--cream-3)' }}>
                  / {data.ml_events?.total || 0} total
                </div>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                Base Phase 17. Cada decisión AI con feedback humano alimenta el corpus de training.
              </div>
              {data.ml_events?.by_type_24h && Object.keys(data.ml_events.by_type_24h).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                  {Object.entries(data.ml_events.by_type_24h).slice(0, 4).map(([k, v]) => (
                    <div key={k} data-testid={`obs-ml-type-${k}`} style={{
                      display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Mono', fontSize: 10,
                      color: 'var(--cream-2)',
                    }}>
                      <span>{k}</span><span style={{ color: 'var(--theme)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        <div style={{
          marginTop: 28, padding: 18, borderRadius: 14,
          background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)',
        }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Entorno</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--cream)' }}>
            env: <strong style={{ color: 'var(--theme)' }}>{data?.env || '—'}</strong>
            {' · '}Sentry sample: <strong style={{ color: 'var(--theme)' }}>0.1</strong>
            {' · '}PostHog autocapture: <strong style={{ color: 'var(--theme)' }}>ON</strong>
          </div>
        </div>
      </div>

      {/* Subagentes + Memoria del Director (backend sin pantalla → visibles aquí) */}
      <SubagentRunsPanel />
      <DirectorMemoryPanel />
    </SuperadminLayout>
  );
}
