// W5.x F8 · AlertCard · tarjeta de alerta predictiva con barra vertical por urgency_tier
import React from 'react';
import { useTranslation } from 'react-i18next';
import AlertActions from './AlertActions';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const URGENCY_ACCENT = {
  critical: 'linear-gradient(180deg, #6366F1, #EC4899)',
  high: '#EC4899',
  medium: '#6366F1',
  low: 'rgba(240,235,224,0.32)',
};

const URGENCY_LABEL = {
  critical: 'alerts.urgency_critical',
  high: 'alerts.urgency_high',
  medium: 'alerts.urgency_medium',
  low: 'alerts.urgency_low',
};

const URGENCY_CHIP_BG = {
  critical: 'rgba(236,72,153,0.12)',
  high: 'rgba(236,72,153,0.10)',
  medium: 'rgba(99,102,241,0.10)',
  low: 'rgba(240,235,224,0.06)',
};

const URGENCY_CHIP_COLOR = {
  critical: '#F9A8D4',
  high: '#F9A8D4',
  medium: '#A5B4FC',
  low: 'rgba(240,235,224,0.7)',
};

function formatRelative(iso, t) {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return t('alerts.time_now', 'ahora');
    if (mins < 60) return t('alerts.time_minutes', '{{n}}m', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('alerts.time_hours', '{{n}}h', { n: hrs });
    const days = Math.floor(hrs / 24);
    return t('alerts.time_days', '{{n}}d', { n: days });
  } catch {
    return '';
  }
}

export default function AlertCard({ alert, onActionDone }) {
  const { t } = useTranslation('common');
  if (!alert) return null;

  const tier = String(alert.urgency_tier || 'medium').toLowerCase();
  const accent = URGENCY_ACCENT[tier] || URGENCY_ACCENT.medium;
  const chipBg = URGENCY_CHIP_BG[tier] || URGENCY_CHIP_BG.medium;
  const chipColor = URGENCY_CHIP_COLOR[tier] || URGENCY_CHIP_COLOR.medium;
  const tierLabel = t(URGENCY_LABEL[tier] || URGENCY_LABEL.medium);

  const leadName = alert.lead_name || alert.lead?.name || t('alerts.lead_unknown', 'Lead sin nombre');
  const leadMeta = [alert.lead_email || alert.lead?.email, alert.lead_phone || alert.lead?.phone]
    .filter(Boolean).join(' · ');
  const message = alert.message || alert.prediction || alert.narrative || '';
  const score = typeof alert.score === 'number' ? Math.round(alert.score) : null;
  const createdRel = formatRelative(alert.created_at || alert.detected_at, t);

  return (
    <article
      data-testid={`alert-card-${alert.alert_id || alert.id}`}
      data-urgency={tier}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '4px 1fr',
        gap: 0,
        background: CARD_BG,
        border: BORDER,
        borderRadius: 20,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        overflow: 'hidden',
        transition: `transform 320ms ${EASE}, border-color 320ms ${EASE}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Accent bar */}
      <div
        aria-hidden="true"
        data-testid={`alert-accent-${tier}`}
        style={{ background: accent, width: 4 }}
      />

      <div style={{ padding: '18px 22px 20px', display: 'grid', gap: 14 }}>
        {/* Header · urgency chip + tiempo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              data-testid={`alert-tier-chip-${tier}`}
              style={{
                padding: '4px 10px', borderRadius: 9999,
                background: chipBg, color: chipColor,
                fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 700,
                letterSpacing: '0.10em', textTransform: 'uppercase',
              }}
            >{tierLabel}</span>
            {score !== null && (
              <span
                data-testid="alert-score"
                style={{
                  padding: '4px 10px', borderRadius: 9999,
                  background: 'rgba(240,235,224,0.06)', color: MUTED,
                  fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}
              >{t('alerts.score_label', 'Score')} {score}</span>
            )}
          </div>
          {createdRel && (
            <span style={{ color: MUTED_2, fontSize: 11.5, fontFamily: 'DM Sans, sans-serif' }}>
              {createdRel}
            </span>
          )}
        </div>

        {/* Lead info */}
        <div>
          <h3
            data-testid="alert-lead-name"
            style={{
              margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              fontSize: 18, color: CREAM, letterSpacing: '-0.01em', lineHeight: 1.2,
            }}
          >{leadName}</h3>
          {leadMeta && (
            <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 12.5, fontFamily: 'DM Sans, sans-serif' }}>
              {leadMeta}
            </p>
          )}
        </div>

        {/* Mensaje predictivo */}
        {message && (
          <p
            data-testid="alert-message"
            style={{
              margin: 0, color: 'rgba(240,235,224,0.82)',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, lineHeight: 1.55,
            }}
          >{message}</p>
        )}

        {/* Actions */}
        <AlertActions alert={alert} onActionDone={onActionDone} />
      </div>
    </article>
  );
}
