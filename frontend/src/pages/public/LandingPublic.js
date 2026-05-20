// W5.22 Z.8 — LandingPublic: ruta publica /landing/:slug
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as api from '../../api/studio_z8';
import LandingLeadForm from '../../components/studio/LandingLeadForm';
import LandingAtlaxWidget from '../../components/studio/LandingAtlaxWidget';

const TEMPLATES = {
  luxury: lazy(() => import('./landings/templates/Luxury')),
  modern: lazy(() => import('./landings/templates/Modern')),
  family: lazy(() => import('./landings/templates/Family')),
  investor: lazy(() => import('./landings/templates/Investor')),
  boutique: lazy(() => import('./landings/templates/Boutique')),
  urgent: lazy(() => import('./landings/templates/Urgent')),
  scrollytelling: lazy(() => import('./landings/templates/Scrollytelling')),
  video_first: lazy(() => import('./landings/templates/VideoFirst')),
  social_proof: lazy(() => import('./landings/templates/SocialProof')),
  compare: lazy(() => import('./landings/templates/Compare')),
};

const DEFAULT_DOMAIN = process.env.REACT_APP_LANDING_DOMAIN || 'desarrollosmx.io';

function injectMeta(landing) {
  const head = document.head;
  const setMeta = (property, content) => {
    let m = head.querySelector(`meta[property="${property}"]`);
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('property', property);
      head.appendChild(m);
    }
    m.setAttribute('content', content);
  };
  const slug = landing.slug;
  const title = landing.content?.hero?.title || 'Landing';
  const subtitle = landing.content?.hero?.subtitle || '';
  const ogImage = `${process.env.REACT_APP_BACKEND_URL}/api/social-cards/og/landing/${slug}.png`;
  document.title = `${title} · DesarrollosMX`;
  setMeta('og:title', title);
  setMeta('og:description', subtitle.slice(0, 200));
  setMeta('og:image', ogImage);
  setMeta('og:type', 'website');
  setMeta('og:url', `https://${DEFAULT_DOMAIN}/landing/${slug}`);
}

export default function LandingPublic() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.getPublicLanding(slug, isPreview);
        if (alive) {
          setData(r);
          if (r?.landing) injectMeta(r.landing);
        }
      } catch (e) {
        if (alive) setError(e.status === 404 ? '404' : 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug, isPreview]);

  const onLead = async (payload) => {
    try {
      const res = await api.submitPublicLead(slug, payload);
      return res;
    } catch (e) {
      throw e;
    }
  };

  if (loading) {
    return (
      <div data-testid="landing-loading" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: '#06080F', color: '#a0a4b0' }}>
        Cargando...
      </div>
    );
  }
  if (error === '404' || !data?.landing) {
    return (
      <div data-testid="landing-not-found" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: '#06080F', color: '#F0EBE0', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif' }}>Landing no disponible</h1>
          <p style={{ color: '#a0a4b0' }}>La pagina que buscas no existe o aun no esta publicada.</p>
        </div>
      </div>
    );
  }

  const landing = { ...data.landing, brand_kit: data.brand_kit };
  const TplComp = TEMPLATES[landing.template_key] || TEMPLATES.modern;
  const pdfEnabled = landing.content?.brochure_pdf_enabled;
  const atlaxEnabled = landing.content?.atlax_widget_enabled;

  return (
    <div data-testid="landing-public">
      {isPreview && (
        <div data-testid="preview-banner" style={{ background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', textAlign: 'center', padding: 10, fontSize: 13, fontWeight: 600 }}>
          {t('studio.landings.preview_banner')}
        </div>
      )}
      <Suspense fallback={<div style={{ minHeight: '60vh', background: '#06080F' }} />}>
        <TplComp landing={landing} onLead={onLead} isPreview={isPreview}>
          <LandingLeadForm landing={landing} onLead={onLead} isPreview={isPreview} />
          {pdfEnabled && (
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <a
                data-testid="landing-pdf-btn"
                href={`${process.env.REACT_APP_BACKEND_URL}/api/studio/landing/${landing.id}/export-pdf`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', color: '#F0EBE0', textDecoration: 'none', border: '1px solid rgba(99,102,241,0.3)', fontWeight: 600, fontSize: 13 }}
              >
                Descargar brochure PDF
              </a>
            </div>
          )}
        </TplComp>
      </Suspense>
      {atlaxEnabled && <LandingAtlaxWidget landing={landing} />}
      {/* Tracking pixel · W5.25 pattern */}
      <img src={api.trackPixelUrl(slug)} alt="" width="1" height="1" style={{ position: 'absolute', left: -9999, top: -9999 }} aria-hidden="true" />
    </div>
  );
}
