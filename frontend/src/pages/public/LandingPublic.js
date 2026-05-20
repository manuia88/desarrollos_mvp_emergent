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

function ShareModal({ open, onClose, slug, templateKey, title }) {
  if (!open) return null;
  const API = process.env.REACT_APP_BACKEND_URL;
  const landingUrl = `${window.location.origin}/landing/${slug}`;
  const ogUrl = `${API}/api/social-cards/og/landing-${templateKey}/${slug}.png`;
  const feedUrl = `${API}/api/social-cards/feed/landing-${templateKey}/${slug}.png`;
  const storyUrl = `${API}/api/social-cards/story/landing-${templateKey}/${slug}.png`;
  const shareText = `Mira ${title || 'esta propiedad'} en DMX`;

  const links = [
    { label: 'WhatsApp', url: `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + landingUrl)}` },
    { label: 'Twitter / X', url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(landingUrl)}` },
    { label: 'LinkedIn', url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(landingUrl)}` },
    { label: 'Facebook', url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(landingUrl)}` },
    { label: 'Email', url: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareText + ' ' + landingUrl)}` },
  ];

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(landingUrl); alert('Link copiado'); } catch (e) { /* silent */ }
  };

  return (
    <div data-testid="share-modal" role="dialog" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 9100, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#0d1017', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: 24, color: '#F0EBE0', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 18 }}>Compartir landing</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ padding: '6px 10px', background: 'transparent', color: '#a0a4b0', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[['Twitter/IG', ogUrl, '1200×630'], ['Feed', feedUrl, '1080×1080'], ['Story', storyUrl, '1080×1920']].map(([label, url, dim]) => (
            <div key={label} style={{ padding: 10, border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
              <img src={url} alt={label} style={{ width: '100%', borderRadius: 6, marginBottom: 6 }} onError={(e) => { e.target.style.display = 'none'; }} />
              <div style={{ fontSize: 11, color: '#F0EBE0', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#a0a4b0' }}>{dim}</div>
              <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#6366F1' }}>Abrir PNG ↗</a>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {links.map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', color: '#F0EBE0', textDecoration: 'none', border: '1px solid rgba(99,102,241,0.3)', fontSize: 12 }}>{l.label}</a>
          ))}
        </div>
        <button data-testid="copy-link" type="button" onClick={copyLink} style={{ width: '100%', padding: '10px 14px', borderRadius: 9999, background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Copiar link</button>
      </div>
    </div>
  );
}

function CrossLinksBanner({ slug, primaryColor, gradient }) {
  const [links, setLinks] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getCrossLinks(slug).then((r) => { if (alive) setLinks(r); }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);
  if (!links || (!links.marketplace_slug && !links.carrusel_id)) return null;
  return (
    <div data-testid="cross-links-banner" style={{ padding: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 14 }}>Tambien podria interesarte</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {links.marketplace_slug && (
          <a data-testid="cross-marketplace" href={`/landing/${links.marketplace_slug}`} style={{ padding: '10px 18px', borderRadius: 9999, background: gradient || 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            Ver mas propiedades{links.asesor_name ? ` de ${links.asesor_name}` : ''} →
          </a>
        )}
        {links.carrusel_id && (
          <a data-testid="cross-carrusel" href={`/embed/carrusel/${links.carrusel_id}`} target="_blank" rel="noreferrer" style={{ padding: '10px 18px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', color: '#F0EBE0', textDecoration: 'none', fontSize: 13, fontWeight: 600, border: `1px solid ${primaryColor || '#6366F1'}55` }}>
            Ver carrusel del proyecto ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ShareFloat({ onOpen }) {
  return (
    <button data-testid="share-float" type="button" onClick={onOpen} aria-label="Compartir" style={{ position: 'fixed', left: 24, bottom: 24, width: 54, height: 54, borderRadius: 9999, background: 'linear-gradient(135deg, #6366F1, #EC4899)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 10px 30px rgba(99,102,241,0.4)', zIndex: 8998, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 18 }}>
      ⇪
    </button>
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
  const [shareOpen, setShareOpen] = useState(false);
  const [templateSpec, setTemplateSpec] = useState(null);

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
          // Z.8.5.1 — Fetch template spec for sections_order reorder
          if (r.landing.template_key) {
            api.getTemplateSpec(r.landing.template_key).then((spec) => { if (alive) setTemplateSpec(spec); }).catch(() => {});
          }
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

  // Z.8.5 — Analytics tracking (batch every 5s)
  useEffect(() => {
    if (!data?.landing || isPreview) return undefined;
    const buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const batch = buffer.splice(0, buffer.length);
      api.sendAnalyticsBatch(slug, batch).catch(() => { /* silent */ });
    };
    const flushIv = setInterval(flush, 5000);
    let maxDepth = 0;
    const onScroll = () => {
      const h = document.documentElement;
      const depth = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / Math.max(1, h.scrollHeight)) * 100));
      if (depth > maxDepth + 10) {
        maxDepth = depth;
        buffer.push({ type: 'scroll_depth', depth_pct: depth });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Section visibility tracking via IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const sid = e.target.getAttribute('data-section-id') || '';
          const stype = (e.target.getAttribute('data-testid') || '').replace('section-', '');
          buffer.push({ type: 'section_visible', section_id: sid, section_type: stype });
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-testid^="section-"]').forEach((el) => observer.observe(el));
    // CTA click tracking via delegated listener
    const onClick = (ev) => {
      const t = ev.target.closest('[data-testid$="-cta"], [data-testid^="hero-"], [data-testid="lead-form-submit"]');
      if (t) {
        buffer.push({ type: 'cta_click', section_id: (t.getAttribute('data-testid') || '').slice(0, 80) });
      }
    };
    document.addEventListener('click', onClick);
    // Flush on unmount + visibility change
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(flushIv);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVis);
      observer.disconnect();
      flush();
    };
  }, [data?.landing, slug, isPreview]);

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
  // Z.8.5.1 — Reorder sections per template_spec.sections_order
  const rawSections = landing.sections || [];
  const orderedSections = (() => {
    const order = templateSpec?.sections_order || [];
    if (!order.length || !rawSections.length) return rawSections;
    const byType = new Map();
    rawSections.forEach((s, i) => {
      const arr = byType.get(s.type) || [];
      arr.push({ ...s, _origIdx: i });
      byType.set(s.type, arr);
    });
    const ordered = [];
    order.forEach((t) => {
      const arr = byType.get(t);
      if (arr && arr.length) {
        ordered.push(arr.shift());
        if (arr.length === 0) byType.delete(t); else byType.set(t, arr);
      }
    });
    // Sections que no estan en order → al final preservando orden original
    const leftover = [];
    byType.forEach((arr) => arr.forEach((s) => leftover.push(s)));
    leftover.sort((a, b) => a._origIdx - b._origIdx);
    return [...ordered, ...leftover];
  })();
  const hasSections = orderedSections.length > 0;
  const atlaxEnabled = landing.content?.atlax_widget_enabled;
  const TplComp = !hasSections ? (TEMPLATES[landing.template_key] || TEMPLATES.modern) : null;
  const heroSec = orderedSections.find((s) => s.type === 'hero');
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
        orderedSections.map((sec) => {
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
              templateKey={landing.template_key}
              themeMode={landing.theme_mode || (templateSpec && templateSpec.default_mode) || 'dark'}
            />
          );
        })
      ) : TplComp ? (
        <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
          <TplComp landing={{ ...landing, brand_kit: brandKit }} onLead={onLead} isPreview={isPreview} />
        </Suspense>
      ) : null}
      {hasSections && <CrossLinksBanner slug={slug} primaryColor={theme?.palette?.primary} gradient={theme?.palette?.gradient} />}
      {atlaxEnabled && <LandingAtlaxWidget landing={{ ...landing, brand_kit: brandKit }} />}
      {waPhone && <WhatsAppFloat phone={waPhone} message={`Hola, vi tu landing "${heroTitle || slug}"`} />}
      <ShareFloat onOpen={() => setShareOpen(true)} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} slug={slug} templateKey={landing.template_key} title={heroTitle} />
      <img src={api.trackPixelUrl(slug)} alt="" width="1" height="1" style={{ position: 'absolute', left: -9999, top: -9999 }} aria-hidden="true" />
    </div>
  );
}
