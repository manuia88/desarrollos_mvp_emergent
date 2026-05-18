/**
 * W5.23 — BattleCardRankingTimeline
 *
 * LineChart 12 semanas de ranking position (Recharts).
 * Eje Y invertido: rank #1 arriba.
 */
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';

const INDIGO = '#6366F1';

function CustomTooltip({ active, payload, label }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 12,
      background: 'rgba(6,8,15,0.97)',
      border: '1px solid rgba(99,102,241,0.3)',
      backdropFilter: 'blur(20px)',
      fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#F0EBE0',
    }}>
      <p style={{ margin: 0, fontWeight: 700, color: '#a5b4fc' }}>{label}</p>
      <p style={{ margin: '4px 0 0', color: '#F0EBE0' }}>
        {t('battle_card.ranking.position_label', { defaultValue: 'Rank' })} #{d.ranking || '—'}
      </p>
      <p style={{ margin: '2px 0 0', color: 'rgba(240,235,224,0.55)' }}>
        Score: {d.my_score?.toFixed(1) ?? '—'}
      </p>
    </div>
  );
}

export function BattleCardRankingTimeline({ history }) {
  const { t } = useTranslation();

  if (!history || history.length === 0) {
    return (
      <div
        data-testid="battle-card-ranking-timeline-empty"
        style={{
          padding: '20px', textAlign: 'center',
          color: 'rgba(240,235,224,0.35)', fontSize: 12,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {t('battle_card.ranking.timeline_title', { defaultValue: 'Sin historial disponible aun' })}
      </div>
    );
  }

  // Reformatear para Recharts: eje Y invertido
  const maxRank = Math.max(...history.map(h => h.ranking || 1), 1);
  const data = history.map(h => ({
    week_iso: (h.week_iso || '').replace(/^\d{4}-/, '').slice(0, 4),
    ranking: h.ranking || null,
    rank_inverted: h.ranking ? (maxRank + 1 - h.ranking) : null,
    my_score: h.my_score,
  }));

  return (
    <div data-testid="battle-card-ranking-timeline">
      <p style={{
        fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
        fontSize: 11, color: 'rgba(240,235,224,0.5)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        margin: '0 0 10px',
      }}>
        {t('battle_card.ranking.timeline_title', { defaultValue: 'Ranking · Ultimas 12 semanas' })}
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
          <XAxis
            dataKey="week_iso"
            tick={{ fill: 'rgba(240,235,224,0.35)', fontSize: 9, fontFamily: 'DM Sans' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[0, maxRank + 1]}
            tickFormatter={v => {
              const actual = maxRank + 1 - v;
              return actual >= 1 && actual <= maxRank ? `#${actual}` : '';
            }}
            tick={{ fill: 'rgba(240,235,224,0.35)', fontSize: 9, fontFamily: 'DM Sans' }}
            axisLine={false} tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone" dataKey="rank_inverted"
            stroke={INDIGO} strokeWidth={2.5}
            dot={{ r: 3, fill: INDIGO, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#a5b4fc' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BattleCardRankingTimeline;
