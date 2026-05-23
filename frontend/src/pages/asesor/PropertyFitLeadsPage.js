// W5.x F11 close · PropertyFitLeadsPage · vista advisor para una propiedad
// Renderiza FitTopLeadsList + header con metadata del development.
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FitTopLeadsList from '../../components/fit/FitTopLeadsList';
import { fetchDevelopment } from '../../api/marketplace';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

export default function PropertyFitLeadsPage() {
  const { t } = useTranslation('common');
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const [dev, setDev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (!propertyId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const d = await fetchDevelopment(propertyId);
        if (!mounted) return;
        setDev(d || null);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [propertyId]);

  const devTitle = dev?.name || dev?.title || dev?.id || propertyId;
  const devLocation = dev?.colonia || dev?.zone || dev?.delegacion || '';

  return (
    <div
      data-testid="property-fit-leads-page"
      style={{
        minHeight: '100vh',
        background: BG,
        color: CREAM,
        fontFamily: 'DM Sans, sans-serif',
        padding: '40px 24px 96px',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: 28 }}>
          <div style={{
            letterSpacing: '0.22em', fontSize: 11, color: INDIGO,
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            DESARROLLOSMX · {t('fit.eyebrow_asesor', 'Inteligencia asesor')}
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 42px)',
            letterSpacing: '-0.02em',
            background: GRAD,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}>
            {t('fit.property_fit_leads_title', 'Leads mas compatibles')}
          </h1>
          <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 14, lineHeight: 1.55, maxWidth: 640 }}>
            {t('fit.property_fit_leads_subtitle', 'Top leads que matchean con esta propiedad segun fit score W5.4 + W5.2 + buyer behavior.')}
          </p>
        </header>

        {/* Property metadata */}
        <section
          data-testid="pfl-property-title"
          style={{
            background: CARD_BG, border: BORDER, borderRadius: 18, padding: 18, marginBottom: 22,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {loading && (
            <div data-testid="pfl-loading" style={{
              height: 28, width: '50%', borderRadius: 9999,
              background: 'linear-gradient(90deg, rgba(240,235,224,0.04), rgba(240,235,224,0.08), rgba(240,235,224,0.04))',
              backgroundSize: '200% 100%', animation: 'pflShimmer 1.4s linear infinite',
            }}>
              <style>{`@keyframes pflShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
          )}
          {!loading && error && (
            <div data-testid="pfl-error" style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(244,114,182,0.10)',
              border: '1px solid rgba(244,114,182,0.35)',
              color: '#FBCFE8',
              fontSize: 13,
            }}>
              {t('fit.property_fit_leads_error', 'No fue posible cargar los leads. Intenta de nuevo.')} · {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
                {t('fit.property_label', 'Propiedad')}
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {devTitle}
              </div>
              {devLocation && (
                <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{devLocation}</div>
              )}
            </>
          )}
        </section>

        {/* Fit leads list */}
        {!loading && !error && propertyId && (
          <FitTopLeadsList propertyId={propertyId} limit={5} />
        )}

        {!loading && !error && !propertyId && (
          <p data-testid="pfl-empty" style={{ color: MUTED, fontSize: 14 }}>
            {t('fit.property_fit_leads_empty', 'Sin leads suficientemente cualificados aun')}
          </p>
        )}

        {/* Back button */}
        <div style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/portal/asesor/marketplace')}
            style={{
              padding: '10px 18px',
              borderRadius: 9999,
              background: 'rgba(99,102,241,0.10)',
              color: '#C7D2FE',
              border: '1px solid rgba(99,102,241,0.32)',
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: `transform 220ms ${EASE}, background 220ms ${EASE}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            ← {t('fit.back_to_marketplace', 'Volver al marketplace')}
          </button>
        </div>

        {/* Disclaimer */}
        <aside style={{
          marginTop: 28,
          padding: '14px 18px',
          borderRadius: 14,
          background: 'rgba(99,102,241,0.08)',
          border: `1px solid ${INDIGO}33`,
          color: MUTED,
          fontSize: 12.5,
          lineHeight: 1.6,
        }}>
          {t('fit.property_fit_leads_disclaimer', 'Fit score combina W5.4 buyer score + W5.2 zone subscores + comportamiento. Usa criterio profesional antes de contactar.')}
        </aside>
      </div>
    </div>
  );
}
