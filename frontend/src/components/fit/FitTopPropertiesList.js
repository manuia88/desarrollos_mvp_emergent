// W5.x F11 · FitTopPropertiesList · top-N matches para un lead
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTopPropertiesForLead } from '../../api/fit';
import FitScoreBadge from './FitScoreBadge';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

export default function FitTopPropertiesList({ leadId, limit = 5 }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState({ properties: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const res = await getTopPropertiesForLead(leadId, limit);
      if (!mounted) return;
      setData(res || { properties: [] });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [leadId, limit]);

  const items = Array.isArray(data?.properties) ? data.properties : [];

  return (
    <section
      data-testid="fit-top-properties"
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 24, padding: 22,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        fontFamily: 'DM Sans, sans-serif', color: CREAM,
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <span style={{
          ...gradientText,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>{t('fit.top_properties_title', 'Top propiedades para este lead')}</span>
      </header>

      {loading && (
        <div data-testid="fit-top-properties-loading" style={{ display: 'grid', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: 56, borderRadius: 14,
              background: 'linear-gradient(90deg, rgba(240,235,224,0.04), rgba(240,235,224,0.08), rgba(240,235,224,0.04))',
              backgroundSize: '200% 100%', animation: 'fitShimmer 1.4s linear infinite',
            }} />
          ))}
          <style>{`@keyframes fitShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
      )}

      {!loading && items.length === 0 && (
        <p data-testid="fit-top-properties-empty" style={{ margin: 0, color: MUTED, fontSize: 13 }}>
          {t('fit.empty_properties', 'Sin matches suficientes aun')}
        </p>
      )}

      {!loading && items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {items.map((p) => (
            <li
              key={p.property_id}
              data-testid={`fit-top-property-${p.property_id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 60px 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 14,
                background: 'rgba(240,235,224,0.03)',
                border: '1px solid rgba(240,235,224,0.06)',
                transition: `background 280ms ${EASE}, transform 280ms ${EASE}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(240,235,224,0.06)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(240,235,224,0.03)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <FitScoreBadge score={p.score} confidence={p.confidence} size="sm" />

              {p.photo_url ? (
                <img
                  src={p.photo_url}
                  alt=""
                  style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                  loading="lazy"
                />
              ) : (
                <span style={{
                  width: 60, height: 40, borderRadius: 8,
                  background: 'rgba(240,235,224,0.06)', display: 'block',
                }} />
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, color: CREAM, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{p.property_title || p.property_id}</div>
                {p.top_reason && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{p.top_reason}</div>
                )}
              </div>

              <a
                data-testid={`fit-top-property-view-${p.property_id}`}
                href={`/desarrollo/${encodeURIComponent(p.property_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 14px', borderRadius: 9999,
                  background: 'rgba(99,102,241,0.10)',
                  color: '#C7D2FE',
                  border: '1px solid rgba(99,102,241,0.32)',
                  textDecoration: 'none',
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                  transition: `transform 280ms ${EASE}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >{t('fit.btn_ver', 'Ver')}</a>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length >= limit && (
        <footer style={{ marginTop: 12, textAlign: 'right' }}>
          <a
            data-testid="fit-top-properties-view-all"
            href={`/portal/asesor/leads/${encodeURIComponent(leadId || '')}/matches`}
            style={{ ...gradientText, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none' }}
          >{t('fit.view_all', 'Ver todos')} →</a>
        </footer>
      )}

      <div data-testid="fit-top-properties-meta" style={{ marginTop: 10, fontSize: 11, color: MUTED_2, textAlign: 'right' }}>
        {loading ? t('fit.loading', 'Cargando...') : `${items.length} matches`}
      </div>
    </section>
  );
}
