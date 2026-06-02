/**
 * W5.15 Parte 2 Sub-B — AVM Confidence Range widget.
 *
 * Renderiza rango low-value-high con badge confidence + feature breakdown
 * colapsable. Hidden si fetch falla o si confidence=BAJA y fsd_pct>30.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFsd } from '../../api/accuracy';

const CONFIDENCE_STYLE = {
  ALTA:  { bg: 'rgba(34,197,94,0.14)',  border: 'rgba(34,197,94,0.55)',  fg: '#86efac' },
  MEDIA: { bg: 'rgba(234,179,8,0.14)',  border: 'rgba(234,179,8,0.55)',  fg: '#fde68a' },
  BAJA:  { bg: 'rgba(239,68,68,0.14)',  border: 'rgba(239,68,68,0.55)',  fg: '#fecaca' },
};

function fmtMXN(n) {
  if (n == null) return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); }
  catch { return `$${Number(n).toLocaleString()}`; }
}

export default function AvmConfidenceRange({ property_id, compact = false }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!property_id) { setHidden(true); setLoading(false); return; }
    let cancel = false;
    (async () => {
      const r = await getFsd(property_id);
      if (cancel) return;
      const body = r.body || {};
      if (!body.available) { setHidden(true); setLoading(false); return; }
      // Hidden si confianza es muy baja
      if (body.confidence_lvl === 'BAJA' && (body.fsd_pct || 0) > 30) {
        setHidden(true); setLoading(false); return;
      }
      setData(body);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [property_id]);

  if (hidden) return null;
  if (loading || !data) {
    return (
      <div data-testid="avm-conf-loading" style={{
        padding: 16, borderRadius: 14, background: 'rgba(var(--bg-rgb),0.85)',
        border: '1px solid rgba(var(--cream-rgb),0.06)',
        fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.55)',
      }}>{t('confianza.widget.loading')}</div>
    );
  }

  const conf = data.confidence_lvl || 'MEDIA';
  const cs = CONFIDENCE_STYLE[conf] || CONFIDENCE_STYLE.MEDIA;
  const low = Number(data.low_estimate || 0);
  const value = Number(data.value || 0);
  const high = Number(data.high_estimate || 0);
  const range = Math.max(1, high - low);
  const markerPct = Math.max(0, Math.min(100, ((value - low) / range) * 100));
  const fsdPct = Number(data.fsd_pct || 0);

  const sub = conf === 'ALTA' ? t('confianza.widget.subtitle_alta')
    : conf === 'MEDIA' ? t('confianza.widget.subtitle_media')
    : t('confianza.widget.subtitle_baja');

  // Top 3 features por contribution
  const breakdown = Object.entries(data.feature_breakdown || {})
    .map(([k, v]) => ({ key: k, ...(v || {}) }))
    .sort((a, b) => (b.contribution_pct || 0) - (a.contribution_pct || 0))
    .slice(0, 3);

  return (
    <div
      data-testid={`avm-conf-range-${property_id}`}
      style={{
        padding: compact ? 14 : 18, borderRadius: 14,
        background: 'rgba(var(--bg-rgb),0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(99,102,241,0.22)', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(var(--cream-rgb),0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('confianza.widget.title')}
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.65)', margin: '4px 0 0' }}>{sub}</p>
        </div>
        <span data-testid="avm-conf-badge" style={{
          display: 'inline-flex', padding: '4px 12px', borderRadius: 9999,
          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
          background: cs.bg, color: cs.fg, border: `1px solid ${cs.border}`,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}
        title={t('confianza.widget.fsd_tooltip', { pct: fsdPct.toFixed(1) })}>
          {t(`confianza.confidence.${conf}`, conf)} · ±{fsdPct.toFixed(1)}%
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <div style={{ position: 'relative', height: 14, borderRadius: 9999,
          background: 'linear-gradient(90deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
          border: '1px solid rgba(var(--cream-rgb),0.10)',
        }}>
          <div style={{
            position: 'absolute', left: `${markerPct}%`, top: -4, height: 22, width: 3,
            background: 'linear-gradient(180deg, #6366F1, #EC4899)', borderRadius: 9999,
            transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Mono', fontSize: 11, color: 'rgba(var(--cream-rgb),0.70)' }}>
          <span data-testid="avm-conf-low">{fmtMXN(low)}</span>
          <span data-testid="avm-conf-value" style={{ color: 'var(--cream)', fontWeight: 700 }}>{fmtMXN(value)} · {t('confianza.widget.central')}</span>
          <span data-testid="avm-conf-high">{fmtMXN(high)}</span>
        </div>
      </div>

      <button
        data-testid="avm-conf-toggle"
        onClick={() => setOpen((o) => !o)}
        style={{
          alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 9999,
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: 'rgba(99,102,241,0.10)', color: 'var(--blue)',
          border: '1px solid rgba(99,102,241,0.35)',
        }}>{open ? '−' : '+'} {t('confianza.widget.how_calculated')}</button>

      {open && (
        <div data-testid="avm-conf-breakdown" style={{
          padding: 12, borderRadius: 12, background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.18)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(var(--cream-rgb),0.55)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('confianza.widget.top_features')}
          </div>
          {breakdown.length === 0 && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.55)' }}>—</div>
          )}
          {breakdown.map((f) => (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'rgba(var(--cream-rgb),0.75)' }}>{f.key}{f.missing_data_flag ? ' (incompleto)' : ''}</span>
              <span style={{ fontFamily: 'DM Mono', color: 'var(--blue)', fontWeight: 600 }}>{Number(f.contribution_pct || 0).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
