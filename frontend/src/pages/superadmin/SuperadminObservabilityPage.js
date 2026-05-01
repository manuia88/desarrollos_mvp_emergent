// Phase F0.11 — /superadmin/observability · Sentry + PostHog + ml_events status.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Sparkle, AlertTriangle, BarChart, ArrowRight, RefreshCw } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

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

export default function SuperadminObservabilityPage({ user, onLogout }) {
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
    <SuperadminLayout user={user} onLogout={onLogout}>
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
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#c7d2fe',
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
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#c7d2fe',
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
                      <span>{k}</span><span style={{ color: '#a5b4fc' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        <div style={{
          marginTop: 28, padding: 18, borderRadius: 14,
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
        }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Entorno</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--cream)' }}>
            env: <strong style={{ color: '#c7d2fe' }}>{data?.env || '—'}</strong>
            {' · '}Sentry sample: <strong style={{ color: '#c7d2fe' }}>0.1</strong>
            {' · '}PostHog autocapture: <strong style={{ color: '#c7d2fe' }}>ON</strong>
          </div>
        </div>
      </div>
    </SuperadminLayout>
  );
}
