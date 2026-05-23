// W6.MOV.5 · ConstructionQualityBreakdown modal
// 4 dimensiones (avance · acabados · defectos · cronograma) con score + detail por dim
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const DIM_ORDER = ['avance', 'acabados', 'defectos', 'cronograma'];
const DIM_ICONS = {
  avance: '◆',
  acabados: '◇',
  defectos: '○',
  cronograma: '▣',
};

function dimColor(score) {
  if (score == null) return 'rgba(240,235,224,0.4)';
  if (score >= 85) return '#22C55E';
  if (score >= 70) return INDIGO;
  if (score >= 50) return '#F59E0B';
  return '#EC4899';
}

export default function ConstructionQualityBreakdown({
  breakdown = null,
  score = null,
  tier = 'no_data',
  developmentName = '',
  onClose,
}) {
  const { t } = useTranslation('common');

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!breakdown) {
    return null;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6,8,15,0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      data-testid="cq-breakdown-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'rgba(13,16,23,0.96)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(240,235,224,0.10)',
          borderRadius: 24,
          padding: '28px 28px 24px',
          fontFamily: 'DM Sans, sans-serif',
          color: CREAM,
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text',
              backgroundClip: 'text', marginBottom: 6,
            }}>
              {t('constructionQuality.title', 'Calidad de construcción')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>
              {developmentName || t('constructionQuality.modalTitle', 'Índice de calidad')}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close', 'Cerrar')}
            style={{
              background: 'transparent',
              border: '1px solid rgba(240,235,224,0.18)',
              color: CREAM,
              width: 32, height: 32,
              borderRadius: 9999,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Score grande */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22,
          padding: '16px 18px',
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: 18,
        }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 42, lineHeight: 1, color: dimColor(score) }}>
            {score != null ? score : '—'}
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>
              {t(`constructionQuality.tier.${tier || 'no_data'}`, tier || 'sin datos')}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
              {t('constructionQuality.scoreLabel', 'Score 0-100 · 4 dimensiones')}
            </div>
          </div>
        </div>

        {/* 4 dimensiones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DIM_ORDER.map((dim) => {
            const detail = breakdown[dim];
            if (!detail) return null;
            const dimScore = detail.score;
            const color = dimColor(dimScore);
            return (
              <div
                key={dim}
                data-testid={`cq-dim-${dim}`}
                style={{
                  padding: '14px 16px',
                  background: 'rgba(240,235,224,0.04)',
                  border: '1px solid rgba(240,235,224,0.08)',
                  borderRadius: 16,
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 9999,
                  background: `${color}22`, color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700,
                }}>
                  {DIM_ICONS[dim] || '•'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {t(`constructionQuality.dim.${dim}`, dim)}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>
                    {t(`constructionQuality.dimDesc.${dim}`, '')}
                  </div>
                  {detail.missing_data && (
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4, fontStyle: 'italic' }}>
                      {t('constructionQuality.missingData', 'Datos parciales')}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color }}>
                  {dimScore != null ? Math.round(dimScore) : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 18, fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
          {t('constructionQuality.disclaimer',
            'Índice calculado semanalmente desde data interna DMX · avance vs cronograma · inspecciones de acabados · defectos reportados por residentes · puntualidad de hitos.')}
        </div>
      </div>
    </div>
  );
}
