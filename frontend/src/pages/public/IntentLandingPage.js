// W4.2D3 — IntentLandingPage.js
// Landing programmatic SEO por intent: /cdmx/preventa, /cdmx/casas, etc.
// Hero · Top colonias · Recent developments grid · Lead capture · JSON-LD SearchResultsPage
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ToolNav from '../../components/ui/ToolNav';
import CtaFooter from '../../components/landing/CtaFooter';
import LandingLeadCaptureForm from '../../components/seo/LandingLeadCaptureForm';

const API = process.env.REACT_APP_BACKEND_URL;
const SITE_BASE = 'https://desarrollosmx.io';

function buildIntentJsonLd(data) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: data.title || data.label,
    description: data.description,
    url: `${SITE_BASE}/cdmx/${data.intent}`,
    about: {
      '@type': 'Place',
      name: 'Ciudad de México',
      address: { '@type': 'PostalAddress', addressRegion: 'CDMX', addressCountry: 'MX' },
    },
  };
}

function buildIntentFaqs(data) {
  const top = (data.top_colonias || []).slice(0, 5).map(c => c.name).join(', ');
  const cnt = data.recent_developments_count || 0;
  return [
    {
      question: `¿Qué incluye la categoría "${data.label}" en DesarrollosMX?`,
      answer: `${data.description} Filtramos automáticamente desarrollos auditados por DesarrollosMX que cumplen los criterios de la categoría.`,
    },
    {
      question: `¿En qué colonias hay más oferta de "${data.label}"?`,
      answer: top
        ? `Las colonias con mejor oferta son: ${top}. Cada una incluye análisis Intelligence Engine completo (DRPI, Risk Score, comparables hedónicos).`
        : `Estamos integrando colonias progresivamente. Suscríbete para ser de los primeros en recibir alertas.`,
    },
    {
      question: `¿Cuántos desarrollos hay disponibles ahora?`,
      answer: cnt > 0
        ? `DesarrollosMX rastrea ${cnt} desarrollo(s) que coinciden con la categoría "${data.label}". El listado se actualiza diariamente.`
        : `Aún no hay desarrollos publicados en esta categoría. Suscríbete para alertas instantáneas.`,
    },
    {
      question: `¿Cómo verifica DesarrollosMX la información?`,
      answer: `Integramos INEGI, SESNSP, CENAPRED, ENVIPE, DENUE, SHF, INFONAVIT y RPP. Datos k-anonymized (k≥5) y LFPDPPP-compliant. R² del modelo hedónico publicado por colonia.`,
    },
    {
      question: `¿Puedo registrarme para recibir alertas?`,
      answer: `Sí. Suscríbete con tu correo y te enviamos los nuevos desarrollos que cumplan "${data.label}". Cero spam, cancela cuando quieras.`,
    },
  ];
}

function IntentJsonLd({ data }) {
  useEffect(() => {
    if (!data || !data.intent) return;
    const a = document.createElement('script');
    a.type = 'application/ld+json';
    a.setAttribute('data-intent-jsonld', 'srp');
    a.text = JSON.stringify(buildIntentJsonLd(data));
    document.head.appendChild(a);

    const faqs = buildIntentFaqs(data);
    const f = document.createElement('script');
    f.type = 'application/ld+json';
    f.setAttribute('data-intent-jsonld', 'faq');
    f.text = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(q => ({
        '@type': 'Question', name: q.question,
        acceptedAnswer: { '@type': 'Answer', text: q.answer },
      })),
    });
    document.head.appendChild(f);
    return () => {
      try { document.head.removeChild(a); } catch {}
      try { document.head.removeChild(f); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.intent]);
  return null;
}

function FaqAccordion({ faqs }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div data-testid="intent-faq" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {faqs.map((f, idx) => {
        const open = openIdx === idx;
        return (
          <div key={idx} style={{
            borderRadius: 14,
            border: '1px solid #ECECEC',
            background: open ? 'rgba(109,74,255,0.06)' : '#FFFFFF',
            overflow: 'hidden', transition: 'background 0.2s ease',
          }}>
            <button
              data-testid={`intent-faq-q-${idx}`}
              onClick={() => setOpenIdx(open ? -1 : idx)}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 18px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--cream)', fontFamily: 'Outfit', fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}
            >
              <span>{f.question}</span>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 18, color: '#6D4AFF',
                transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'transform 0.18s ease', flexShrink: 0,
              }}>+</span>
            </button>
            {open && (
              <div style={{
                padding: '0 18px 16px', fontFamily: 'DM Sans', fontSize: 14,
                color: 'var(--cream-2)', lineHeight: 1.7,
              }}>
                {f.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function nfMxn(value) {
  if (value == null || isNaN(value)) return null;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(value);
  } catch { return `$${Math.round(value).toLocaleString('es-MX')}`; }
}

export default function IntentLandingPage() {
  const { intent } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetch(`${API}/api/public/landing/intent/${intent}`)
      .then(async r => {
        if (cancelled) return;
        if (r.status === 404) { setError('not_found'); setLoading(false); return; }
        if (!r.ok) { setError('server_error'); setLoading(false); return; }
        const d = await r.json();
        if (!cancelled) {
          // Update document title for SEO when full SSR is added later.
          if (typeof document !== 'undefined' && d.title) document.title = d.title;
          setData(d); setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) { setError('network_error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [intent]);

  if (loading) {
    return (
      <div className="theme-light-scope" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <ToolNav />
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)' }}>
            Cargando…
          </div>
        </main>
      </div>
    );
  }

  if (error === 'not_found' || !data) {
    return (
      <div className="theme-light-scope" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <ToolNav />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 5vw, 40px)',
            margin: '0 0 12px', letterSpacing: '-0.025em',
          }}>
            Categoría no encontrada
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', lineHeight: 1.7 }}>
            La categoría <strong>{intent}</strong> no está soportada. Prueba: preventa, entrega-inmediata, estrenar, departamentos o casas.
          </p>
          <Link to="/marketplace" data-testid="intent-cta-marketplace-fallback" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
            padding: '10px 22px', borderRadius: 9999,
            background: 'linear-gradient(90deg, #6366F1, #EC4899)',
            color: '#fff', textDecoration: 'none', marginTop: 20,
          }}>
            Ver Marketplace
          </Link>
        </main>
      </div>
    );
  }

  const top = data.top_colonias || [];
  const devs = data.recent_developments || [];
  const showLeadCapture = devs.length === 0;

  return (
    <div data-testid="intent-page" className="theme-light-scope" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
      <ToolNav />
      <IntentJsonLd data={data} />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" style={{
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
          marginBottom: 18, letterSpacing: '0.04em',
        }}>
          <Link to="/" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 8px', color: '#9AA0AE' }}>›</span>
          <span style={{ color: 'var(--cream-3)' }}>CDMX</span>
          <span style={{ margin: '0 8px', color: '#9AA0AE' }}>›</span>
          <span style={{ color: 'var(--cream-2)' }}>{data.label}</span>
        </nav>

        {/* Hero */}
        <header style={{ marginBottom: 36 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', marginBottom: 10,
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            CDMX · Búsqueda
          </div>
          <h1 data-testid="intent-name" style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 6vw, 56px)',
            margin: '0 0 14px', letterSpacing: '-0.025em',
          }}>
            {data.label}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
            lineHeight: 1.7, margin: 0, maxWidth: 720,
          }}>
            {data.description}
          </p>
        </header>

        {/* Top colonias */}
        {top.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={sectionTitleStyle}>Mejores colonias para {data.label.toLowerCase()}</h2>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {top.map(c => (
                <Link
                  key={c.slug}
                  to={`/zona/${c.slug}`}
                  data-testid={`intent-col-${c.slug}`}
                  style={{
                    padding: '14px 16px', borderRadius: 14, textDecoration: 'none',
                    border: '1px solid rgba(99,102,241,0.20)',
                    background: 'rgba(99,102,241,0.05)',
                    transition: 'background 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                >
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>
                    {c.name}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>
                    {c.alcaldia}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recent developments */}
        {devs.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={sectionTitleStyle}>Desarrollos disponibles · {devs.length}</h2>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {devs.map(d => (
                <Link
                  key={d.id}
                  to={`/desarrollo/${d.id}`}
                  data-testid={`intent-dev-${d.id}`}
                  style={{
                    padding: '16px 18px', borderRadius: 14, textDecoration: 'none',
                    border: '1px solid #ECECEC',
                    background: '#FFFFFF',
                    transition: 'background 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F6F7FA'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; }}
                >
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 4 }}>
                    {d.name}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>
                    {d.colonia_id ? d.colonia_id.replace(/-/g, ' ') : 'CDMX'}
                    {d.stage ? ` · ${d.stage}` : ''}
                  </div>
                  {d.price_from_mxn && (
                    <div style={{
                      fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
                      color: '#6D4AFF', marginTop: 8,
                    }}>
                      Desde {nfMxn(d.price_from_mxn) || '—'}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Lead capture si no hay devs */}
        {showLeadCapture && (
          <section style={{ marginBottom: 36, maxWidth: 640 }}>
            <LandingLeadCaptureForm
              zoneInterest={`intent-${data.intent}`}
              sourceUrl={`/cdmx/${data.intent}`}
              title={`Avísame de "${data.label}"`}
              description={`Te enviaremos un correo cuando publiquemos desarrollos verificados que cumplan "${data.label}".`}
            />
          </section>
        )}

        {/* FAQ */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitleStyle}>Preguntas frecuentes</h2>
          <FaqAccordion faqs={buildIntentFaqs(data)} />
        </section>

      </main>
      <CtaFooter />
    </div>
  );
}

const sectionTitleStyle = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 20,
  color: 'var(--cream)', margin: '0 0 16px',
  letterSpacing: '-0.015em',
};
