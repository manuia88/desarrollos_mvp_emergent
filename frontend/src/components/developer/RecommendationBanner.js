// W4.1C — RecommendationBanner
// Always-on top banner for developer_admin showing highest-impact finding.
// Dismissible for 24h via localStorage.
import React, { useEffect, useState } from 'react';
import { fetchTopRecommendation } from '../../api/recommendations';
import { X } from '../icons';

const DISMISS_PREFIX = 'dmx_rec_dismissed_';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function isDismissed(recId) {
  try {
    const val = localStorage.getItem(`${DISMISS_PREFIX}${recId}`);
    if (!val) return false;
    return Date.now() - Number(val) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function markDismissed(recId) {
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${recId}`, String(Date.now()));
  } catch {}
}

const SEV_COLORS = {
  high:   { fg: '#fca5a5', bg: 'rgba(252,165,165,0.12)', bd: 'rgba(252,165,165,0.25)' },
  medium: { fg: '#fcd34d', bg: 'rgba(252,211,77,0.12)',  bd: 'rgba(252,211,77,0.25)'  },
  low:    { fg: '#a3e635', bg: 'rgba(163,230,53,0.12)',  bd: 'rgba(163,230,53,0.25)'  },
};
const SEV_LABEL = { high: 'ALTO', medium: 'MEDIO', low: 'BAJO' };

export default function RecommendationBanner() {
  const [status, setStatus] = useState('loading'); // loading | visible | hidden
  const [rec, setRec] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchTopRecommendation();
      if (cancelled) return;
      if (!data || !data.has_recommendation) { setStatus('hidden'); return; }
      if (isDismissed(data.rec_id)) { setStatus('hidden'); return; }
      setRec(data);
      setStatus('visible');
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    if (rec?.rec_id) markDismissed(rec.rec_id);
    setStatus('hidden');
  };

  if (status !== 'visible' || !rec) return null;

  const sev = SEV_COLORS[rec.finding?.severity] || SEV_COLORS.high;
  const action = (rec.finding?.recommended_action || '').slice(0, 90);
  const hasEllipsis = (rec.finding?.recommended_action || '').length > 90;
  const ieHref = `/desarrollador/desarrollos/${rec.dev_id}/ie`;

  return (
    <div
      data-testid="recommendation-banner"
      style={{
        background: 'rgba(99,102,241,0.08)',
        borderBottom: '1px solid rgba(99,102,241,0.20)',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        minHeight: 44,
      }}
    >
      {/* Severity badge */}
      <span style={{
        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
        padding: '2px 10px', borderRadius: 9999,
        background: sev.bg, border: `1px solid ${sev.bd}`, color: sev.fg,
        letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {SEV_LABEL[rec.finding?.severity] || 'ALTO'}
      </span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
          {rec.dev_name}
        </span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginLeft: 6 }}>
          · {rec.finding?.title} — {action}{hasEllipsis ? '…' : ''}
        </span>
      </div>

      {/* Ver button */}
      <a
        href={ieHref}
        data-testid="recommendation-banner-ver"
        style={{
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
          padding: '5px 16px', borderRadius: 9999,
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          color: '#fff', textDecoration: 'none',
          whiteSpace: 'nowrap', flexShrink: 0,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      >
        Ver
      </a>

      {/* Dismiss */}
      <button
        data-testid="recommendation-banner-dismiss"
        onClick={dismiss}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--cream-3)', padding: 4, display: 'flex', alignItems: 'center',
          borderRadius: 9999, flexShrink: 0,
          transition: 'color 0.15s',
        }}
        aria-label="Cerrar recomendación"
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--cream)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--cream-3)'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
