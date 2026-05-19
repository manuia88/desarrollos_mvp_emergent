// W5.22 Z.2 Sub-D — Hook Score badge color-coded + tooltip breakdown.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

function bandFor(score) {
  if (score >= 70) {
    return { bg: 'rgba(34,197,94,0.18)', fg: 'var(--success, #22C55E)', bd: 'rgba(34,197,94,0.45)', label: 'high' };
  }
  if (score >= 40) {
    return { bg: 'rgba(245,158,11,0.18)', fg: '#F59E0B', bd: 'rgba(245,158,11,0.45)', label: 'mid' };
  }
  return { bg: 'rgba(239,68,68,0.18)', fg: 'var(--danger, #EF4444)', bd: 'rgba(239,68,68,0.45)', label: 'low' };
}

export default function HookScoreBadge({ score, breakdown, size = 'md' }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const safeScore = typeof score === 'number' ? Math.round(score) : 0;
  const tone = bandFor(safeScore);
  const px = size === 'lg' ? { padding: '6px 12px', fontSize: 13 } : { padding: '3px 10px', fontSize: 11 };

  const bd = breakdown || {};
  const items = [
    { key: 'clarity', label: t('studio.hook_score.clarity'), value: bd.clarity },
    { key: 'cta', label: t('studio.hook_score.cta'), value: bd.cta },
    { key: 'novelty', label: t('studio.hook_score.novelty'), value: bd.novelty },
    { key: 'urgency', label: t('studio.hook_score.urgency'), value: bd.urgency },
  ];

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}>
      <span
        data-testid={`hook-score-${tone.label}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          borderRadius: 9999,
          background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
          fontFamily: 'DM Sans', fontWeight: 700,
          ...px,
        }}>
        {t('studio.hook_score.label')} · {safeScore}
      </span>
      {open && breakdown && (
        <div role="tooltip" style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          padding: '10px 12px', minWidth: 200,
          background: 'rgba(6,8,15,0.96)',
          border: '1px solid rgba(240,235,224,0.16)',
          borderRadius: 10, zIndex: 100,
          fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream)',
          boxShadow: '0 18px 30px rgba(0,0,0,0.45)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: tone.fg }}>
            {t('studio.hook_score.breakdown_title')}
          </div>
          {items.map((it) => (
            <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, padding: '2px 0' }}>
              <span style={{ color: 'var(--cream-2)' }}>{it.label}</span>
              <span style={{ fontWeight: 700 }}>
                {typeof it.value === 'number' ? Math.round(it.value) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
