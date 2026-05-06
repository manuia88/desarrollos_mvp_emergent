/**
 * Phase 4 Batch 33 · Component — ClientInsightsTab
 *
 * Tab dentro de EntityDrawer cuando entity_type='lead'.
 * Sections:
 *   - Header: nombre + heat score + trend 7d signed
 *   - Actividad 30d: timeline vertical
 *   - De dónde vino (attribution multi-touch)
 *   - Lo que vio (top 5 vistas) + top 5 favoritos
 *   - Conversaciones (last message + sentiment + count)
 *   - Próxima acción sugerida (Claude Haiku) + botón "Hacer ahora"
 */
import React, { useEffect, useState } from 'react';
import { fetchClientInsights } from '../../api/asesor_daily';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const SENTIMENT_COLORS = {
  positivo: '#22C55E',
  neutral: '#F59E0B',
  negativo: '#EF4444',
};

const ACTION_LABELS = {
  call: 'Llamar ahora',
  whatsapp: 'WhatsApp ahora',
  email: 'Enviar email',
  schedule_visit: 'Agendar visita',
};

function HealthRing({ score, trend }) {
  const color = score >= 80 ? '#22C55E' : score >= 50 ? '#F59E0B' : 'rgba(240,235,224,0.45)';
  const trendColor = trend > 0 ? '#22C55E' : trend < 0 ? '#EF4444' : 'var(--cream-3)';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 9999,
        border: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(240,235,224,0.04)',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--cream)' }}>
          {score || 0}
        </span>
      </div>
      <span style={{ fontSize: 10, color: trendColor, fontWeight: 600 }}>
        {trend > 0 ? `+${trend}` : trend} 7d
      </span>
    </div>
  );
}

function Section({ title, children, testId }) {
  return (
    <div data-testid={testId} style={{
      padding: 12, borderRadius: 12,
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.08)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--cream-3)',
      }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--cream)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function Timeline({ events }) {
  if (!events?.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>
        Lead sin actividad reciente.
      </div>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none',
                 display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.slice(0, 12).map((ev, i) => {
        const ts = ev.ts ? new Date(ev.ts) : null;
        const tsStr = ts ? ts.toLocaleString('es-MX', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }) : '';
        return (
          <li key={i} data-testid={`insight-timeline-${i}`}
              style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: 'var(--cream)', textTransform: 'uppercase',
              letterSpacing: '0.04em', flexShrink: 0,
            }}>{ev.type}</span>
            <span style={{ flex: 1, color: 'var(--cream-2)' }}>{ev.label}</span>
            <span style={{ fontSize: 10, color: 'var(--cream-3)', flexShrink: 0 }}>
              {tsStr}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NextActionCard({ action, leadName, onAction }) {
  if (!action?.text) return null;
  const label = ACTION_LABELS[action.action_type] || 'Hacer ahora';
  return (
    <div data-testid="insight-next-action" style={{
      padding: 14, borderRadius: 12,
      background: 'linear-gradient(90deg, rgba(99,102,241,0.12), rgba(236,72,153,0.12))',
      border: '1px solid rgba(99,102,241,0.3)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--cream-3)',
      }}>Próxima acción sugerida</div>
      <div style={{ fontSize: 13.5, color: 'var(--cream)', lineHeight: 1.6 }}>
        {action.text}
      </div>
      <button data-testid="insight-action-btn" type="button"
              onClick={() => onAction?.(action.action_type)}
              style={{
                alignSelf: 'flex-start',
                padding: '8px 18px', borderRadius: 9999,
                border: 'none', background: GRADIENT, color: '#fff',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{label}</button>
    </div>
  );
}

export default function ClientInsightsTab({ leadId, onAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (force = false) => {
    if (!leadId) return;
    setLoading(true); setError('');
    try {
      const d = await fetchClientInsights(leadId, force);
      setData(d);
    } catch (e) {
      setError(e.message || 'Error al cargar insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  if (loading) {
    return (
      <div data-testid="insights-loading" style={{
        padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontSize: 12,
      }}>Cargando insights…</div>
    );
  }
  if (error) {
    return (
      <div data-testid="insights-error" style={{
        padding: 12, borderRadius: 10,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.25)',
        color: '#fca5a5', fontSize: 12,
      }}>{error}</div>
    );
  }
  if (!data) return null;

  const sentiment = data?.chat?.sentiment || 'neutral';
  const sColor = SENTIMENT_COLORS[sentiment] || '#F59E0B';

  return (
    <div data-testid="client-insights-tab" style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: 4,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <HealthRing score={data.health?.current || 0}
                    trend={data.health?.trend_7d || 0} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Insights del lead</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cream)',
                        marginTop: 2, fontFamily: 'Outfit' }}>
            {data.name || data.lead_id}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
            {data.activity_30d?.total || 0} eventos ·{' '}
            {data.activity_30d?.favoritos || 0} favoritos ·{' '}
            {data.chat?.threads_count || 0} chats
          </div>
        </div>
      </div>

      {/* Next action */}
      <NextActionCard action={data.next_action}
                      leadName={data.name}
                      onAction={onAction} />

      {/* Timeline */}
      <Section title="Actividad últimos 30 días" testId="insight-section-activity">
        <Timeline events={data.timeline} />
      </Section>

      {/* Attribution */}
      {data.attribution?.source && (
        <Section title="De dónde vino" testId="insight-section-attribution">
          <div>
            Fuente: <strong style={{ color: 'var(--cream)' }}>
              {data.attribution.source}
            </strong>
            {data.attribution.medium && (
              <> · medio: {data.attribution.medium}</>
            )}
            {data.attribution.campaign && (
              <> · campaña: {data.attribution.campaign}</>
            )}
          </div>
          {Array.isArray(data.attribution.touchpoints) && data.attribution.touchpoints.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--cream-3)' }}>
              {data.attribution.touchpoints.length} touchpoints
            </div>
          )}
        </Section>
      )}

      {/* Top vistas */}
      {(data.top_views || []).length > 0 && (
        <Section title="Lo que vio" testId="insight-section-views">
          <ul style={{ margin: 0, paddingLeft: 16,
                       display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.top_views.slice(0, 5).map((v, i) => (
              <li key={i}>
                {v.project_name || v.project_id}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Top favoritos */}
      {(data.top_favoritos || []).length > 0 && (
        <Section title="Sus favoritos" testId="insight-section-favoritos">
          <ul style={{ margin: 0, paddingLeft: 16,
                       display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.top_favoritos.map((f, i) => (
              <li key={i}>{f.project_name || f.project_id}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Conversaciones */}
      <Section title="Conversaciones" testId="insight-section-chat">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            {data.chat?.messages_count || 0} mensajes en{' '}
            {data.chat?.threads_count || 0} hilos
            <span style={{
              marginLeft: 8, padding: '2px 8px', borderRadius: 9999,
              background: `${sColor}1A`, border: `1px solid ${sColor}55`,
              color: sColor, fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{sentiment}</span>
          </div>
          {data.chat?.last_message_text && (
            <div style={{
              padding: 8, borderRadius: 8,
              background: 'rgba(240,235,224,0.04)',
              fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5,
              fontStyle: 'italic',
            }}>"{data.chat.last_message_text}"</div>
          )}
        </div>
      </Section>

      {data.from_cache && (
        <button data-testid="insights-refresh" type="button"
                onClick={() => load(true)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '4px 12px', borderRadius: 9999,
                  border: '1px solid rgba(240,235,224,0.18)',
                  background: 'transparent', color: 'var(--cream-3)',
                  fontSize: 10, cursor: 'pointer',
                }}>Refrescar</button>
      )}
    </div>
  );
}
