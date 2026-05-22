// W5.x F11 · FitTopLeadsList · top-N leads cualificados para una property
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTopLeadsForProperty } from '../../api/fit';
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

function buildWhatsAppHref(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

export default function FitTopLeadsList({ propertyId, limit = 5 }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState({ leads: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const res = await getTopLeadsForProperty(propertyId, limit);
      if (!mounted) return;
      setData(res || { leads: [] });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [propertyId, limit]);

  const items = Array.isArray(data?.leads) ? data.leads : [];

  return (
    <section
      data-testid="fit-top-leads"
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
        }}>{t('fit.top_leads_title', 'Top leads cualificados para esta propiedad')}</span>
      </header>

      {loading && (
        <div data-testid="fit-top-leads-loading" style={{ display: 'grid', gap: 10 }}>
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
        <p data-testid="fit-top-leads-empty" style={{ margin: 0, color: MUTED, fontSize: 13 }}>
          {t('fit.empty_leads', 'Aun no hay leads suficientemente cualificados')}
        </p>
      )}

      {!loading && items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {items.map((l) => {
            const waHref = buildWhatsAppHref(l.lead_whatsapp);
            return (
              <li
                key={l.lead_id}
                data-testid={`fit-top-lead-${l.lead_id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
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
                <FitScoreBadge score={l.score} confidence={l.confidence} size="sm" />

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, color: CREAM, fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{l.lead_name || l.lead_id}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {l.lead_whatsapp || ''}
                    {l.lead_whatsapp && l.top_reason ? <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span> : ''}
                    {l.top_reason || ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {waHref && (
                    <a
                      data-testid={`fit-top-lead-whatsapp-${l.lead_id}`}
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px', borderRadius: 9999,
                        background: GRAD, color: '#fff',
                        textDecoration: 'none',
                        fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
                        transition: `transform 280ms ${EASE}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                    >{t('fit.btn_whatsapp', 'WhatsApp')}</a>
                  )}
                  <a
                    data-testid={`fit-top-lead-view-${l.lead_id}`}
                    href={`/portal/asesor/leads/${encodeURIComponent(l.lead_id)}`}
                    style={{
                      padding: '6px 12px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.10)', color: '#C7D2FE',
                      border: '1px solid rgba(99,102,241,0.32)',
                      textDecoration: 'none',
                      fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
                      transition: `transform 280ms ${EASE}`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  >{t('fit.btn_ver_lead', 'Ver lead')}</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && items.length >= limit && (
        <footer style={{ marginTop: 12, textAlign: 'right' }}>
          <a
            data-testid="fit-top-leads-view-all"
            href={`/portal/asesor/propiedades/${encodeURIComponent(propertyId || '')}/leads`}
            style={{ ...gradientText, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none' }}
          >{t('fit.view_all', 'Ver todos')} →</a>
        </footer>
      )}

      <div data-testid="fit-top-leads-meta" style={{ marginTop: 10, fontSize: 11, color: MUTED_2, textAlign: 'right' }}>
        {loading ? t('fit.loading', 'Cargando...') : `${items.length} leads`}
      </div>
    </section>
  );
}
