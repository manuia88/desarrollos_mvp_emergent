/**
 * W5.23 — BattleCardCompetitorsTable
 *
 * Tabla side-by-side top 3 competidores vs yo.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const GREEN  = '#10B981';
const YELLOW = '#F59E0B';
const RED    = '#EF4444';

function _color(score) {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

const DIM_KEYS = ['precio', 'ventas', 'zona', 'marketing', 'lead_gen'];

function ScoreCell({ value }) {
  const color = _color(value || 0);
  return (
    <td style={{
      padding: '7px 12px', textAlign: 'center',
      fontFamily: 'Outfit, sans-serif', fontWeight: 700,
      fontSize: 15, color: color,
    }}>
      {(value ?? '—') !== '—' ? Math.round(value) : '—'}
    </td>
  );
}

export function BattleCardCompetitorsTable({ myScore, myDimScores, competitors }) {
  const { t } = useTranslation();

  const dimLabel = (dim) => t(`battle_card.dimensions.${dim}`, { defaultValue: dim });

  const allCols = [
    { id: 'yo', name: t('battle_card.competitors.your_position', { defaultValue: 'Tu proyecto' }), isMe: true, dims: myDimScores, composite: myScore },
    ...(competitors || []).map(c => ({
      id: c.project_id,
      name: c.name || c.project_id,
      isMe: false,
      dims: c.dim_scores || {},
      composite: c.composite_score || 0,
    })),
  ];

  return (
    <div
      data-testid="battle-card-competitors-table"
      style={{ overflowX: 'auto' }}
    >
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'DM Sans, sans-serif', fontSize: 12,
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(99,102,241,0.3)' }}>
            <th style={{
              padding: '8px 12px', textAlign: 'left',
              color: 'rgba(240,235,224,0.45)',
              fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              {t('battle_card.competitors.table_header', { defaultValue: 'Dimension' })}
            </th>
            {allCols.map(col => (
              <th
                key={col.id}
                style={{
                  padding: '8px 12px', textAlign: 'center',
                  color: col.isMe ? '#a5b4fc' : 'rgba(240,235,224,0.45)',
                  fontWeight: col.isMe ? 800 : 600,
                  fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                  borderLeft: col.isMe ? '2px solid rgba(99,102,241,0.4)' : 'none',
                }}
              >
                {col.name.substring(0, 20)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIM_KEYS.map((dim, i) => (
            <tr
              key={dim}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
              }}
            >
              <td style={{
                padding: '7px 12px',
                color: 'rgba(240,235,224,0.65)', fontWeight: 600,
              }}>
                {dimLabel(dim)}
              </td>
              {allCols.map(col => (
                <ScoreCell
                  key={col.id}
                  value={col.dims[dim]}
                />
              ))}
            </tr>
          ))}
          {/* Fila total */}
          <tr style={{ borderTop: '2px solid rgba(99,102,241,0.3)' }}>
            <td style={{
              padding: '8px 12px',
              color: '#F0EBE0', fontWeight: 800, fontSize: 12,
            }}>
              {t('battle_card.competitors.vs_label', { defaultValue: 'Total' })}
            </td>
            {allCols.map(col => (
              <ScoreCell key={col.id} value={col.composite} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default BattleCardCompetitorsTable;
