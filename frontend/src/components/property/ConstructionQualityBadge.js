// W6.MOV.5 · ConstructionQualityBadge
// Pill score 0-100 con tier label · click abre ConstructionQualityBreakdown modal opcional
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConstructionQualityBreakdown from './ConstructionQualityBreakdown';

const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const TIER_STYLE = {
  excelente: { bg: GRAD, color: '#06080F', label: 'EXCELENTE' },
  bueno: { bg: 'rgba(99,102,241,0.18)', color: CREAM, label: 'BUENO' },
  regular: { bg: 'rgba(240,235,224,0.10)', color: CREAM, label: 'REGULAR' },
  deficiente: { bg: 'rgba(236,72,153,0.18)', color: CREAM, label: 'DEFICIENTE' },
  no_data: { bg: 'rgba(240,235,224,0.06)', color: 'rgba(240,235,224,0.45)', label: 'SIN DATOS' },
};

const SIZE_MAP = {
  sm: { padding: '4px 10px', font: 11, gap: 6 },
  md: { padding: '6px 14px', font: 13, gap: 8 },
  lg: { padding: '8px 18px', font: 15, gap: 10 },
};

export default function ConstructionQualityBadge({
  score = null,
  tier = 'no_data',
  size = 'md',
  hasBreakdown = false,
  breakdown = null,
  developmentName = '',
}) {
  const { t } = useTranslation('common');
  const [modalOpen, setModalOpen] = useState(false);

  const tierKey = tier && TIER_STYLE[tier] ? tier : 'no_data';
  const ts = TIER_STYLE[tierKey];
  const sz = SIZE_MAP[size] || SIZE_MAP.md;

  const isClickable = hasBreakdown && breakdown && score !== null;

  const content = (
    <span
      onClick={isClickable ? () => setModalOpen(true) : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalOpen(true); } }
          : undefined
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sz.gap,
        padding: sz.padding,
        borderRadius: 9999,
        background: ts.bg,
        color: ts.color,
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: 600,
        fontSize: sz.font,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        cursor: isClickable ? 'pointer' : 'default',
        backdropFilter: 'blur(24px)',
        border: tierKey === 'no_data' ? '1px solid rgba(240,235,224,0.10)' : 'none',
        userSelect: 'none',
      }}
      data-testid="cq-badge"
      title={t('constructionQuality.tooltipHint', 'Calidad de construcción')}
    >
      <span aria-label={t('constructionQuality.label', 'Calidad construcción')}>
        {t('constructionQuality.short', 'CALIDAD')}
      </span>
      {score !== null ? (
        <span style={{ fontWeight: 800 }}>
          {score}<span style={{ opacity: 0.6, fontWeight: 600 }}>/100</span>
        </span>
      ) : null}
      <span style={{ opacity: 0.8 }}>· {t(`constructionQuality.tier.${tierKey}`, ts.label)}</span>
    </span>
  );

  return (
    <>
      {content}
      {modalOpen && (
        <ConstructionQualityBreakdown
          breakdown={breakdown}
          score={score}
          tier={tier}
          developmentName={developmentName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
