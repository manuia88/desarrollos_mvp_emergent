/**
 * W5.2 Sub-D — SEO landings temáticas auto.
 * URL: /cdmx/:theme_key
 *
 * Renderiza: H1 + meta tags + JSON-LD ItemList en <head>, grid 20 zonas,
 * sección metodología y CTA al final.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import CtaFooter from '../../components/landing/CtaFooter';

const API = process.env.REACT_APP_BACKEND_URL;

function setMetaTag(name, content, attr = 'name') {
  if (typeof document === 'undefined') return null;
  let tag = document.querySelector(`meta[${attr}="${name}"]`);
  let created = false;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
    created = true;
  }
  const previous = tag.getAttribute('content');
  tag.setAttribute('content', content);
  return { tag, previous, created };
}

function setJsonLd(scripts) {
  if (typeof document === 'undefined') return () => {};
  const nodes = scripts.map((obj, i) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.seoThemed = String(i);
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
    return s;
  });
  return () => nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
}

export default function SeoThemedLanding() {
  const params = useParams();
  // El dispatcher en App.js usa :intent (mismo path /cdmx/:intent), por lo que
  // este componente puede recibir cualquiera de los dos nombres de param.
  const themeKey = params.theme_key || params.intent;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    fetch(`${API}/api/seo-themed/${themeKey}`)
      .then(async r => {
        if (cancelled) return;
        if (r.status === 404) { setError('not_found'); return; }
        if (!r.ok) { setError('server_error'); return; }
        const json = await r.json();
        if (!cancelled) setData(json);
      })
      .catch(() => { if (!cancelled) setError('network_error'); });
    return () => { cancelled = true; };
  }, [themeKey]);

  useEffect(() => {
    if (!data) return;
    document.title = `${data.title} · DesarrollosMX`;
    setMetaTag('description', data.description || '');
    setMetaTag('og:title', data.title || '', 'property');
    setMetaTag('og:description', data.description || '', 'property');
    setMetaTag('og:type', 'website', 'property');
    let cleanupLd = () => {};
    if (Array.isArray(data.schema_org_jsonld)) {
      cleanupLd = setJsonLd(data.schema_org_jsonld);
    }
    return () => cleanupLd();
  }, [data]);

  // 404 component (theme key inválido)
  if (error === 'not_found') {
    return (
      <div data-testid="seo-themed-not-found" style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0' }}>
        <Navbar />
        <main style={{ padding: '120px 24px', textAlign: 'center', fontFamily: 'DM Sans' }}>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 32, fontWeight: 800 }}>Página no encontrada</h1>
          <p style={{ color: 'rgba(240,235,224,0.6)', marginTop: 8 }}>
            El tema solicitado no existe.{' '}
            <Link to="/marketplace" style={{ color: '#a5b4fc' }}>Volver al marketplace</Link>
          </p>
        </main>
        <CtaFooter />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0' }}>
        <Navbar />
        <main style={{ padding: '120px 24px', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.6)' }}>Cargando…</main>
      </div>
    );
  }

  const zones = data.top_zones || [];

  return (
    <div data-testid="seo-themed-page" style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0' }}>
      <Navbar />
      <main style={{ paddingTop: 80, paddingBottom: 60 }}>
        {/* Hero */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 24px' }}>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)', marginBottom: 12, fontFamily: 'DM Sans' }}>
            <Link to="/" style={{ color: 'rgba(240,235,224,0.6)' }}>DesarrollosMX</Link>
            <span style={{ margin: '0 8px' }}>›</span>
            <span style={{ color: 'rgba(240,235,224,0.6)' }}>CDMX</span>
            <span style={{ margin: '0 8px' }}>›</span>
            <span style={{ color: '#a5b4fc' }}>{data.title}</span>
          </nav>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 10 }}>
            Ranking · DesarrollosMX Intelligence
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: '-0.025em',
            lineHeight: 1.05, margin: '0 0 16px', color: '#F0EBE0',
          }}>
            {data.h1}
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'rgba(240,235,224,0.7)', maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
            {data.description}
          </p>
        </section>

        {/* Grid de zonas */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            {zones.map((z, i) => (
              <Link
                key={z.slug}
                to={`/zona/${z.slug}`}
                data-testid={`seo-themed-zone-${z.slug}`}
                style={{
                  position: 'relative',
                  padding: 18, borderRadius: 16,
                  background: 'rgba(13,16,23,0.92)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#F0EBE0',
                  textDecoration: 'none',
                  backdropFilter: 'blur(24px)',
                  transition: 'border-color 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 12, right: 14,
                  fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'rgba(165,180,252,0.55)',
                }}>#{i + 1}</span>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {z.alcaldia || 'CDMX'}
                </div>
                <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                  {z.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: '#a5b4fc' }}>
                    {Number(z.score).toFixed(0)}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)' }}>/ 100</span>
                </div>
                <div style={{
                  height: 6, marginTop: 8, borderRadius: 9999, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.06)',
                }}>
                  <div style={{
                    width: `${Math.max(2, Math.min(100, Number(z.score)))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  }} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Metodología */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{
            padding: 22, borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
              Metodología
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(240,235,224,0.75)', lineHeight: 1.6 }}>
              El ranking combina sub-scores de DesarrollosMX (Lifestyle · Seguridad · Transporte ·
              Amenidades · Precio · Vibe) calculados con datos auditables.{' '}
              <Link to="/methodology" style={{ color: '#a5b4fc' }}>Ver metodología completa</Link>.
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
          <div style={{
            padding: 28, borderRadius: 20, textAlign: 'center',
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.30)',
          }}>
            <div style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              ¿Quieres profundizar?
            </div>
            <p style={{ color: 'rgba(240,235,224,0.7)', fontSize: 14, maxWidth: 540, margin: '0 auto 18px' }}>
              Habla con un asesor DesarrollosMX y recibe el análisis completo de tu colonia preferida.
            </p>
            <Link
              to="/asesores"
              data-testid="seo-themed-cta-asesor"
              style={{
                display: 'inline-block', padding: '12px 24px', borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                color: '#fff', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Habla con asesor DMX
            </Link>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
