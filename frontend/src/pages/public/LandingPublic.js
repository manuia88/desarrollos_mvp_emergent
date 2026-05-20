// W5.22 Z.8.2 — LandingPublic REWORK: render sections dynamically + tracking pixels + WA cta
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as api from '../../api/studio_z8';
import SectionRenderer from '../../components/studio/sections/SectionRenderer';
import LandingAtlaxWidget from '../../components/studio/LandingAtlaxWidget';

// Z.8.2 rework · templates v1 deprecated · placeholder para landings sin sections
const PlaceholderTemplate = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06080F', color: '#F0EBE0', fontFamily: 'Outfit', padding: 24, textAlign: 'center' }}>
    <div>
      <div style={{ fontSize: 14, letterSpacing: '0.1em', opacity: 0.6, marginBottom: 16, textTransform: 'uppercase' }}>DMX Studio</div>
      <h1 style={{ fontWeight: 800, fontSize: 32, marginBottom: 12 }}>Landing en construcción</h1>
      <p style={{ fontSize: 15, opacity: 0.7, maxWidth: 480, lineHeight: 1.5 }}>El builder profesional Z.8.2 está en desarrollo. Esta landing se reactivará pronto con el nuevo editor.</p>
    </div>
  </div>
);
// Legacy templates dispatcher (compat landings Z.8 v1 sin sections)
const TEMPLATES = {
  luxury: PlaceholderTemplate, modern: PlaceholderTemplate, family: PlaceholderTemplate,
  investor: PlaceholderTemplate, boutique: PlaceholderTemplate, urgent: PlaceholderTemplate,
  scrollytelling: PlaceholderTemplate, video_first: PlaceholderTemplate,
  social_proof: PlaceholderTemplate, compare: PlaceholderTemplate,
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
  const heroSec = (landing.sections || []).find((s) => s.type === 'hero');
  const title = heroSec?.config?.headline || landing.content?.hero?.title || 'Landing';
  const subtitle = heroSec?.config?.subhead || landing.content?.hero?.subtitle || '';
  const ogImage = `${process.env.REACT_APP_BACKEND_URL}/api/social-cards/og/landing/${slug}.png`;
  document.title = `${title} · DesarrollosMX`;
  setMeta('og:title', title);
  setMeta('og:description', subtitle.slice(0, 200));
  setMeta('og:image', ogImage);
  setMeta('og:type', 'website');
  setMeta('og:url', `https://${DEFAULT_DOMAIN}/landing/${slug}`);
}

function injectPixels(pixels) {
  if (!pixels) return;
  const head = document.head;
  const body = document.body;
  // GA4
  if (pixels.ga4_id && pixels.ga4_id.startsWith('G-')) {
    if (!document.getElementById('ga4-loader')) {
      const s = document.createElement('script');
      s.id = 'ga4-loader';
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${pixels.ga4_id}`;
      head.appendChild(s);
      const cfg = document.createElement('script');
      cfg.id = 'ga4-cfg';
      cfg.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config','${pixels.ga4_id}');`;
      head.appendChild(cfg);
    }
  }
  // Meta Pixel
  if (pixels.meta_pixel_id && /^\d{6,20}$/.test(pixels.meta_pixel_id)) {
    if (!document.getElementById('meta-pixel-loader')) {
      const s = document.createElement('script');
      s.id = 'meta-pixel-loader';
      s.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixels.meta_pixel_id}');fbq('track','PageView');`;
      head.appendChild(s);
    }
  }
  // Custom head (sanitized backend-side)
  if (pixels.custom_head && !document.getElementById('custom-head-inject')) {
    const wrap = document.createElement('div');
    wrap.id = 'custom-head-inject';
    wrap.innerHTML = pixels.custom_head;
    Array.from(wrap.children).forEach((el) => head.appendChild(el));
  }
  // Custom body
  if (pixels.custom_body && !document.getElementById('custom-body-inject')) {
    const wrap = document.createElement('div');
    wrap.id = 'custom-body-inject';
    wrap.innerHTML = pixels.custom_body;
    Array.from(wrap.children).forEach((el) => body.appendChild(el));
  }
}

function WhatsAppFloat({ phone, message }) {
  if (!phone) return null;
  const cleaned = (phone || '').replace(/[^0-9+]/g, '');
  const link = `https://wa.me/${cleaned}?text=${encodeURIComponent(message || 'Hola, vi tu landing')}`;
  return (
    <a data-testid="wa-float" href={link} target="_blank" rel="noreferrer" aria-label="WhatsApp" style={{ position: 'fixed', right: 24, bottom: 24, width: 54, height: 54, borderRadius: 9999, background: '#25D366', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 10px 30px rgba(37,211,102,0.4)', zIndex: 8998, textDecoration: 'none', fontWeight: 800 }}>
      WA
    </a>
  );
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
        if (!alive) return;
        setData(r);
        if (r?.landing) {
          injectMeta(r.landing);
          injectPixels(r.landing.tracking_pixels);
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
      return await api.submitPublicLead(slug, payload);
    } catch (e) {
      throw e;
    }
  };

  if (loading) {
    return (
      <div data-testid="landing-loading" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: '#06080F', color: 'rgba(240,235,224,0.62)' }}>
        Cargando...
      </div>
    );
  }
  if (error === '404' || !data?.landing) {
    return (
      <div data-testid="landing-not-found" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: '#06080F', color: '#F0EBE0', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif' }}>Landing no disponible</h1>
          <p style={{ color: 'rgba(240,235,224,0.62)' }}>La pagina que buscas no existe o aun no esta publicada.</p>
        </div>
      </div>
    );
  }

  const landing = data.landing;
  const brandKit = data.brand_kit || {};
  const linkedEntity = landing.linked_entity || null;
  const theme = landing.theme || null;
  const hasSections = (landing.sections || []).length > 0;
  const atlaxEnabled = landing.content?.atlax_widget_enabled;
  const TplComp = !hasSections ? (TEMPLATES[landing.template_key] || TEMPLATES.modern) : null;
  const heroSec = (landing.sections || []).find((s) => s.type === 'hero');
  const heroTitle = heroSec?.config?.headline || landing.content?.hero?.title;
  const waPhone = brandKit?.contact_whatsapp || brandKit?.phone;
  const themeBg = theme?.palette?.bg || '#06080F';
  const themeText = theme?.palette?.text || '#F0EBE0';
  const themeBodyFont = theme?.typography?.body_font || 'DM Sans, sans-serif';

  return (
    <div data-testid="landing-public" data-theme-key={landing.template_key} style={{ background: themeBg, color: themeText, minHeight: '100vh', fontFamily: themeBodyFont, transition: 'background 320ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
      {isPreview && (
        <div data-testid="preview-banner" style={{ background: theme?.palette?.gradient || 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', textAlign: 'center', padding: 10, fontSize: 13, fontWeight: 600 }}>
          {t('studio.landings.preview_banner')}
        </div>
      )}
      {hasSections ? (
        landing.sections.map((sec) => {
          // Z.8.4 — marketplace section receives content.marketplace_config inside its config (via content)
          const sectionConfig = sec.type === 'marketplace'
            ? { ...(sec.config || {}), marketplace_config: landing.content?.marketplace_config }
            : sec.config;
          return (
            <SectionRenderer
              key={sec.id || sec.type}
              section={{ ...sec, config: sectionConfig }}
              brandKit={brandKit}
              linkedEntity={linkedEntity}
              onLead={onLead}
              isPreview={isPreview}
              theme={theme}
              landingSlug={landing.slug}
            />
          );
        })
      ) : TplComp ? (
        <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
          <TplComp landing={{ ...landing, brand_kit: brandKit }} onLead={onLead} isPreview={isPreview} />
        </Suspense>
      ) : null}
      {atlaxEnabled && <LandingAtlaxWidget landing={{ ...landing, brand_kit: brandKit }} />}
      {waPhone && <WhatsAppFloat phone={waPhone} message={`Hola, vi tu landing "${heroTitle || slug}"`} />}
      <img src={api.trackPixelUrl(slug)} alt="" width="1" height="1" style={{ position: 'absolute', left: -9999, top: -9999 }} aria-hidden="true" />
    </div>
  );
}
