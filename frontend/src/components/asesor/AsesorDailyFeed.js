/**
 * Phase 4 Batch 34 · Component — AsesorDailyFeed
 *
 * "Tu día hoy" widget en AsesorMetricas:
 *   - Top 5 leads prioritarios (health × momentum)
 *   - Cada card: avatar + name + heat ring + momentum + reason + CTA gradient
 *   - 1-click ejecuta acción según action_type (call/whatsapp/email/schedule_visit)
 *   - Auto-refresh hourly + botón refresh manual
 *   - Empty state si no hay leads/acciones
 */
import React, { useEffect, useState, useCallback } from 'react';
import { fetchDailyFeed, executeFeedAction } from '../../api/asesor_match';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const ACTION_LABELS = {
  call: 'Llamar ahora',
  whatsapp: 'Mandar WA',
  email: 'Enviar email',
  schedule_visit: 'Agendar visita',
};

function HeatRing({ score, trend }) {
  const color = score >= 80 ? '#22C55E' : score >= 50 ? '#F59E0B' : 'rgba(240,235,224,0.45)';
  const trendColor = trend > 0 ? '#22C55E' : trend < 0 ? '#EF4444' : 'var(--cream-3)';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 9999,
        border: `2.5px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(240,235,224,0.04)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
          {score || 0}
        </span>
      </div>
      <span style={{ fontSize: 9, color: trendColor, fontWeight: 600 }}>
        {trend > 0 ? `+${trend}` : trend}
      </span>
    </div>
  );
}

function FeedItem({ item, onExecute, executingId }) {
  const isExecuting = executingId === item.lead_id;
  const action = item.recommended_action || {};
  const label = ACTION_LABELS[action.type] || 'Hacer ahora';

  return (
    <div data-testid={`daily-feed-item-${item.lead_id}`} style={{
      padding: 14, borderRadius: 14,
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(240,235,224,0.12)',
      backdropFilter: 'blur(24px)',
      display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
      transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 280ms',
      transform: isExecuting ? 'translateY(-4px)' : 'translateY(0)',
      opacity: isExecuting ? 0.6 : 1,
    }}>
      <HeatRing score={item.heat_score} trend={item.momentum_signed_pct} />

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)',
                      fontFamily: 'Outfit' }}>
          {item.lead_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 4, lineHeight: 1.5 }}>
          {item.reason_text}
        </div>
      </div>

      <button
        data-testid={`daily-feed-cta-${item.lead_id}`}
        type="button"
        onClick={() => onExecute(item)}
        disabled={isExecuting}
        style={{
          padding: '10px 20px', borderRadius: 9999,
          border: 'none', background: GRADIENT, color: '#fff',
          fontSize: 12, fontWeight: 600,
          cursor: isExecuting ? 'not-allowed' : 'pointer',
          minHeight: 44, minWidth: 140,
          flexShrink: 0,
        }}
      >
        {isExecuting ? 'Procesando…' : label}
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div data-testid="daily-feed-empty" style={{
      padding: 24, textAlign: 'center',
      borderRadius: 14,
      background: 'rgba(240,235,224,0.04)',
      border: '1px dashed rgba(240,235,224,0.18)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)',
                    fontFamily: 'Outfit', marginBottom: 4 }}>
        Sin acciones críticas hoy
      </div>
      <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>
        Tu pipeline está al día. Buen trabajo.
      </div>
    </div>
  );
}

export default function AsesorDailyFeed({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [executingId, setExecutingId] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async (force = false) => {
    setLoading(true); setError('');
    try {
      const d = await fetchDailyFeed({ forceRefresh: force, topN: 5 });
      setData(d);
    } catch (e) {
      setError(e.message || 'Error al cargar feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh hourly
    const t = setInterval(() => load(false), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const onExecute = async (item) => {
    const lid = item.lead_id;
    const at = item.recommended_action?.type;
    if (!at) return;
    setExecutingId(lid);
    try {
      const result = await executeFeedAction(lid, at);
      if (result.redirect_url) {
        if (at === 'whatsapp' || at === 'schedule_visit') {
          window.open(result.redirect_url,
            at === 'whatsapp' ? '_blank' : '_self');
        }
      } else if (at === 'email' && result.sent) {
        setToast('Email enviado');
      } else if (at === 'call') {
        setToast('Acción registrada');
      }
      // Después de 1s, refresca feed
      setTimeout(() => {
        setExecutingId(null);
        load(false);
        setTimeout(() => setToast(''), 2400);
      }, 800);
    } catch (e) {
      setExecutingId(null);
      setToast(e.message || 'Error');
    }
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const items = data?.items || [];

  return (
    <div data-testid="asesor-daily-feed" style={{
      padding: 20, borderRadius: 16,
      background: 'rgba(99,102,241,0.04)',
      border: '1px solid rgba(99,102,241,0.18)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Tu día hoy</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cream)',
                        fontFamily: 'Outfit', marginTop: 2 }}>
            {greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? 'acción' : 'acciones'} high-impact`
              : 'Sin acciones pendientes'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="daily-feed-refresh" type="button"
                  onClick={() => load(true)} disabled={loading}
                  style={{
                    padding: '6px 14px', borderRadius: 9999,
                    border: '1px solid rgba(240,235,224,0.18)',
                    background: 'transparent', color: 'var(--cream-2)',
                    fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
                  }}>
            {loading ? '...' : 'Refrescar'}
          </button>
          <a data-testid="daily-feed-all-leads"
             href="/asesor/leads"
             style={{
               padding: '6px 14px', borderRadius: 9999,
               border: '1px solid rgba(240,235,224,0.18)',
               background: 'transparent', color: 'var(--cream)',
               fontSize: 11, textDecoration: 'none',
             }}>Ver todos</a>
        </div>
      </div>

      {error && (
        <div data-testid="daily-feed-error" style={{
          padding: 10, borderRadius: 10,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 12,
        }}>{error}</div>
      )}

      {loading && !data && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--cream-3)',
                      fontSize: 12 }}>Cargando feed…</div>
      )}

      {data && items.length === 0 && !loading && <EmptyState />}

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <FeedItem key={it.lead_id} item={it}
                      onExecute={onExecute} executingId={executingId} />
          ))}
        </div>
      )}

      {toast && (
        <div data-testid="daily-feed-toast" style={{
          alignSelf: 'center',
          padding: '8px 18px', borderRadius: 9999,
          background: 'rgba(34,197,94,0.12)',
          border: '1px solid rgba(34,197,94,0.3)',
          color: '#86efac', fontSize: 12, fontWeight: 600,
        }}>{toast}</div>
      )}
    </div>
  );
}
