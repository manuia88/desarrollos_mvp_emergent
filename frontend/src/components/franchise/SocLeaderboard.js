/**
 * W6.MOV.1 · SocLeaderboard.js
 * Top N franquiciatarios · tabla con avatar + name + score + level + delta_week.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SocBadge from './SocBadge';
import { getLeaderboard } from '../../api/socFranchise';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const ROW_BORDER = '1px solid rgba(240,235,224,0.06)';

function Initials({ name }) {
  const ini = (name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('') || '?';
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.32), rgba(236,72,153,0.32))',
      color: CREAM, fontWeight: 700, fontSize: 12,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid rgba(240,235,224,0.18)',
    }}>{ini}</div>
  );
}

function Delta({ value }) {
  if (value == null) return <span style={{ opacity: 0.45, fontSize: 11 }}>—</span>;
  const positive = value > 0;
  const zero = value === 0;
  const color = zero ? MUTED : positive ? '#86EFAC' : '#FCA5A5';
  const sign = positive ? '+' : '';
  return (
    <span style={{ color, fontSize: 12, fontWeight: 600 }}>
      {zero ? '0' : `${sign}${value}`}
    </span>
  );
}

export default function SocLeaderboard({
  level,
  limit = 20,
  highlightUserId,
  onSelectUser,
}) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getLeaderboard({ level, limit });
      setItems(r.items || []);
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setLoading(false);
    }
  }, [level, limit, t]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ padding: 18, color: MUTED, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
        {t('common.loading', 'Cargando…')}
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 18, color: '#FCA5A5', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
        {error}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div style={{ padding: 18, color: MUTED, fontSize: 13, textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        {t('socFranchise.leaderboard.empty', 'Aún no hay franquiciatarios certificados')}
      </div>
    );
  }

  return (
    <div
      data-testid="soc-leaderboard"
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 16,
        padding: 14, fontFamily: 'DM Sans, sans-serif', color: CREAM,
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left',  fontSize: 11, fontWeight: 600, opacity: 0.6 }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left',  fontSize: 11, fontWeight: 600, opacity: 0.6 }}>
                {t('socFranchise.leaderboard.colName', 'Asesor')}
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, opacity: 0.6 }}>
                {t('socFranchise.leaderboard.colScore', 'Score')}
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'left',  fontSize: 11, fontWeight: 600, opacity: 0.6 }}>
                {t('socFranchise.leaderboard.colLevel', 'Nivel')}
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, opacity: 0.6 }}>
                {t('socFranchise.leaderboard.colDelta', 'Δ 7d')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const isMe = highlightUserId && it.user_id === highlightUserId;
              return (
                <tr
                  key={it.user_id || idx}
                  data-testid={`soc-row-${it.user_id}`}
                  onClick={() => onSelectUser && onSelectUser(it.user_id)}
                  style={{
                    borderBottom: ROW_BORDER,
                    background: isMe ? 'rgba(99,102,241,0.10)' : 'transparent',
                    cursor: onSelectUser ? 'pointer' : 'default',
                  }}
                >
                  <td style={{ padding: '10px 10px', fontWeight: 700, opacity: 0.85 }}>{idx + 1}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Initials name={it.name} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {it.name || it.email || it.user_id}
                          {isMe && (
                            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7, fontWeight: 500 }}>
                              ({t('socFranchise.leaderboard.you', 'tú')})
                            </span>
                          )}
                        </div>
                        {it.tenant_id && (
                          <div style={{ fontSize: 11, opacity: 0.5 }}>{it.tenant_id}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                    {it.score != null ? Number(it.score).toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <SocBadge level={it.level} size="sm" />
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                    <Delta value={it.delta_week} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
