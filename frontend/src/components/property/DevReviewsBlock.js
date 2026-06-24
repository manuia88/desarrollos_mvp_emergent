// W6.MOV.3 · DevReviewsBlock
// Mismo pattern que ZoneReviewsBlock pero per development
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDevelopmentReviews } from '../../api/reviewsResidents';

const CREAM = '#1E2230';
const SUBTLE = 'rgba(30,34,48,0.65)';
const PANEL_BG = 'rgba(30,34,48,0.04)';
const PANEL_BORDER = 'rgba(30,34,48,0.10)';

const SENT_COLOR = {
  positive: '#34D399',
  neutral: 'rgba(30,34,48,0.50)',
  negative: '#F87171',
};

export default function DevReviewsBlock({ devId, hideIfEmpty = false }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (!devId) return undefined;
    setLoading(true);
    getDevelopmentReviews(devId)
      .then((d) => { if (mounted) setData(d); })
      .catch((e) => { if (mounted) setError(e); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [devId]);

  if (loading) {
    return (
      <section data-testid="dev-reviews-loading" style={cardStyle}>
        <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif' }}>
          {t('reviewsResidents.loading', 'Cargando reseñas residentes…')}
        </div>
      </section>
    );
  }

  if (error || !data || data.n_reviews === 0) {
    if (hideIfEmpty) return null;   // ficha: no mostrar caja de "sin reseñas" en el acto de confianza
    return (
      <section data-testid="dev-reviews-empty" style={cardStyle}>
        <h3 style={titleStyle}>{t('reviewsResidents.title', 'Voz de residentes')}</h3>
        <div style={{ marginTop: 12, color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
          {t('reviewsResidents.empty', 'Aún no hay reseñas suficientes para este desarrollo.')}
        </div>
      </section>
    );
  }

  const { n_reviews, avg_rating, sentiment_breakdown_pct, top_themes, top_quotes } = data;
  const pos = sentiment_breakdown_pct?.positive || 0;
  const neu = sentiment_breakdown_pct?.neutral || 0;
  const neg = sentiment_breakdown_pct?.negative || 0;

  return (
    <section data-testid="dev-reviews-block" style={cardStyle}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={titleStyle}>{t('reviewsResidents.title', 'Voz de residentes')}</h3>
        <span style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {t('reviewsResidents.subtitleDev', 'Opiniones sobre este desarrollo')}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 16 }}>
        <Kpi label={t('reviewsResidents.kpi.rating', 'Rating promedio')} value={avg_rating != null ? `${avg_rating} / 5` : '—'} />
        <Kpi label={t('reviewsResidents.kpi.nReviews', 'Reseñas')} value={n_reviews} />
        <Kpi label={t('reviewsResidents.sentiment.positive', 'Positivas')} value={`${pos}%`} color={SENT_COLOR.positive} />
        <Kpi label={t('reviewsResidents.sentiment.negative', 'Negativas')} value={`${neg}%`} color={SENT_COLOR.negative} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ height: 12, borderRadius: 9999, display: 'flex', overflow: 'hidden', background: PANEL_BORDER }}>
          {pos > 0 && <div style={{ width: `${pos}%`, background: SENT_COLOR.positive }} title={`Pos ${pos}%`} />}
          {neu > 0 && <div style={{ width: `${neu}%`, background: SENT_COLOR.neutral }} title={`Neu ${neu}%`} />}
          {neg > 0 && <div style={{ width: `${neg}%`, background: SENT_COLOR.negative }} title={`Neg ${neg}%`} />}
        </div>
      </div>

      {top_themes && top_themes.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {top_themes.map((th) => (
            <span key={th.theme} style={chipStyle}>
              {t(`reviewsResidents.themes.${th.theme}`, th.theme)} · {th.count}
            </span>
          ))}
        </div>
      )}

      {top_quotes && top_quotes.length > 0 && (
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {top_quotes.map((q, i) => (
            <blockquote key={i} style={{
              ...quoteStyle,
              borderLeftColor: SENT_COLOR[q.sentiment] || SENT_COLOR.neutral,
            }}>
              <div style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14, lineHeight: 1.5 }}>
                "{q.text}"
              </div>
              <footer style={{ marginTop: 8, color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>— {q.author}</span>
                {q.rating > 0 && <span>{q.rating} / 5</span>}
                {q.source && <span style={{ opacity: 0.7 }}>{q.source}</span>}
              </footer>
            </blockquote>
          ))}
        </div>
      )}
    </section>
  );
}

const cardStyle = {
  padding: 24,
  borderRadius: 24,
  background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`,
  backdropFilter: 'blur(24px)',
  marginTop: 24,
};

const titleStyle = {
  margin: 0,
  color: CREAM,
  fontFamily: 'Playfair Display, serif',
  fontSize: 24,
  fontWeight: 600,
};

const chipStyle = {
  padding: '4px 12px',
  borderRadius: 9999,
  background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`,
  color: CREAM,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const quoteStyle = {
  margin: 0,
  padding: '12px 16px',
  borderLeft: '3px solid',
  background: PANEL_BG,
  borderRadius: 12,
};

function Kpi({ label, value, color }) {
  return (
    <div style={{ padding: 12, borderRadius: 16, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
      <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ color: color || CREAM, fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}
