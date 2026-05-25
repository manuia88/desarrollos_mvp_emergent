// W7.AS.3.D · Round 2 · SentimentHeatmap — timeline horizontal con gradient
// color por turno (green positive · gray neutral · red negative). Tooltip con
// sentiment + timestamp. Máx 50 turnos visibles · scroll horizontal.
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const SENT_COLOR = {
  positive: 'var(--theme-success, #22C55E)',
  neutral: 'var(--theme-muted, #94A3B8)',
  negative: 'var(--theme-danger, #EF4444)',
};
const MAX_TURNS = 50;

function fmtTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  } catch {
    return '—';
  }
}

export default function SentimentHeatmap({ messages = [] }) {
  const { t } = useTranslation('conversation_round2_ui');
  const [hover, setHover] = useState(null);

  const turns = useMemo(() => {
    const list = (messages || []).filter((m) => m && (m.sentiment || m.role));
    return list.slice(-MAX_TURNS);
  }, [messages]);

  if (turns.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.4)', padding: '6px 0' }}>
        {t('heatmap.no_data')}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.5)' }}>
          {t('heatmap.title')}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>{turns.length} {t('heatmap.turns')}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
        {turns.map((m, i) => {
          const sentiment = m.sentiment || 'neutral';
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              style={{
                flex: '0 0 auto', width: 14, height: 26, borderRadius: 4,
                background: SENT_COLOR[sentiment] || SENT_COLOR.neutral,
                opacity: hover === null || hover === i ? 1 : 0.55,
                cursor: 'default', transition: 'opacity 0.12s ease',
              }}
            />
          );
        })}
      </div>
      {hover !== null && turns[hover] && (
        <div style={{
          position: 'absolute', top: -6, right: 0, transform: 'translateY(-100%)',
          background: 'rgba(20,20,28,0.96)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '7px 10px', fontSize: 11.5, color: 'var(--cream, #F0EBE0)', whiteSpace: 'nowrap',
          zIndex: 5, pointerEvents: 'none',
        }}>
          <div>
            {t('heatmap.tooltip_sentiment')}:{' '}
            <span style={{ color: SENT_COLOR[turns[hover].sentiment || 'neutral'] }}>
              {t(`sentiment.${turns[hover].sentiment || 'neutral'}`)}
            </span>
          </div>
          <div style={{ color: 'rgba(240,235,224,0.55)' }}>
            {t('heatmap.tooltip_time')}: {fmtTime(turns[hover].created_at || turns[hover].ts)}
          </div>
        </div>
      )}
    </div>
  );
}
