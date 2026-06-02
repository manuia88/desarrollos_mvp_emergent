/**
 * W5.23 — BattleCardScoreGauge
 *
 * Muestra el score compuesto 0-100 con RadialBarChart Recharts + color semántico.
 */
import React from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { useTranslation } from 'react-i18next';

const GREEN  = '#10B981';
const YELLOW = '#F59E0B';
const RED    = '#EF4444';
const BG     = 'rgba(var(--cream-rgb),0.05)';

function _color(score) {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

export function BattleCardScoreGauge({ score, delta_pp, week_iso }) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, score || 0));
  const color = _color(pct);

  const data = [
    { name: 'score', value: pct, fill: color },
  ];

  return (
    <div
      data-testid="battle-card-score-gauge"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '20px 0', gap: 4,
      }}
    >
      <div style={{ position: 'relative' }}>
        <RadialBarChart
          width={180} height={180}
          cx={90} cy={90}
          innerRadius={60} outerRadius={84}
          startAngle={210} endAngle={-30}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          {/* Background arc */}
          <RadialBar
            background={{ fill: 'rgba(var(--cream-rgb),0.07)' }}
            dataKey="value"
            cornerRadius={8}
            angleAxisId={0}
          />
        </RadialBarChart>

        {/* Score en el centro */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 36, color: color, lineHeight: 1, letterSpacing: '-0.04em',
          }}>
            {Math.round(pct)}
          </span>
          <span style={{
            fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
            fontSize: 11, color: 'rgba(var(--cream-rgb),0.5)', marginTop: 1,
          }}>
            {t('battle_card.title.score_label', { defaultValue: '/ 100' })}
          </span>
        </div>
      </div>

      {/* Semana + delta */}
      {week_iso && (
        <span style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 11,
          color: 'rgba(var(--cream-rgb),0.45)',
        }}>
          {t('battle_card.title.week_N', { n: week_iso, defaultValue: `Semana ${week_iso}` })}
        </span>
      )}
      {delta_pp != null && delta_pp !== 0 && (
        <span style={{
          fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12,
          color: delta_pp > 0 ? GREEN : RED,
        }}>
          {delta_pp > 0 ? '+' : ''}{delta_pp.toFixed(1)} pp
        </span>
      )}
    </div>
  );
}

export default BattleCardScoreGauge;
