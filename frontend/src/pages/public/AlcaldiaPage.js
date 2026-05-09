// W4.2D3 — AlcaldiaPage.js
// Landing programmatic SEO por alcaldía CDMX: /alcaldia/:slug
// Hero · Grid colonias hijas (links a /zona/:slug) · Lead capture si vacía · FAQ · JSON-LD
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import CtaFooter from '../../components/landing/CtaFooter';
import LandingLeadCaptureForm from '../../components/seo/LandingLeadCaptureForm';
import { useAuth } from '../../App';

const API = process.env.REACT_APP_BACKEND_URL;
const SITE_BASE = 'https://desarrollosmx.io';

function buildAlcaldiaJsonLd(data) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: data.name,
    description: `Análisis de la alcaldía ${data.name}, Ciudad de México. Colonias cubiertas, desarrollos activos y datos auditables por DesarrollosMX.`,
    url: `${SITE_BASE}/alcaldia/${data.slug}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: data.name,
      addressRegion: 'CDMX',
      addressCountry: 'MX',
    },
    containsPlace: (data.colonias_with_data || []).slice(0, 12).map(c => ({
      '@type': 'Place', name: c.name, url: `${SITE_BASE}/zona/${c.slug}`,
    })),
  };
}

function buildAlcaldiaFaqs(data) {
  const cwd = data.colonias_with_data_count || 0;
  const cp = data.colonias_pending_count || 0;
  const totalSelected = cwd + cp;
  const namesWithData = (data.colonias_with_data || []).slice(0, 5).map(c => c.name).join(', ');
  return [
    {
      question: `¿Cuántas colonias de ${data.name} cubre DesarrollosMX?`,
      answer: totalSelected > 0
        ? `DesarrollosMX cubre ${totalSelected} colonias en ${data.name}: ${cwd} con análisis Intelligence Engine completo y ${cp} pendientes de seedeo.`
        : `Estamos onboardeando colonias de ${data.name}. Suscríbete para ser de los primeros en acceder al análisis.`,
    },
    {
      question: `¿Cuáles colonias de ${data.name} tienen datos completos?`,
      answer: namesWithData
        ? `Las colonias de ${data.name} con análisis IE completo son: ${namesWithData}. Cada una incluye DRPI, Risk Score y desarrollos activos.`
        : `Aún no hay colonias de ${data.name} con análisis IE completo. Estamos priorizando alcaldías con mayor volumen de transacciones primero.`,
    },
    {
      question: `¿Hay desarrollos en preventa en ${data.name}?`,
      answer: data.active_developments > 0
        ? `Sí. DesarrollosMX rastrea ${data.active_developments} desarrollo(s) activo(s) en ${data.name}, cubriendo preventa, construcción y entrega inmediata.`
        : `Aún no hay desarrollos activos publicados para ${data.name}. Estamos integrando proyectos de la zona.`,
    },
    {
      question: `¿Qué fuentes oficiales usa DesarrollosMX para ${data.name}?`,
      answer: `Integramos INEGI, SESNSP, CENAPRED, ENVIPE, DENUE y registros públicos de propiedad para producir análisis auditables, k-anonymized (k≥5) y LFPDPPP-compliant.`,
    },
    {
      question: `¿Cómo registro interés en ${data.name} sin compromiso?`,
      answer: `Solo deja tu correo y te avisamos cuando publiquemos inventario verificado en ${data.name}. Cero spam, cancela cuando quieras.`,
    },
  ];
}

function AlcaldiaJsonLd({ data }) {
  useEffect(() => {
    if (!data || !data.slug) return;
    const place = document.createElement('script');
    place.type = 'application/ld+json';
    place.setAttribute('data-alcaldia-jsonld', 'place');
    place.text = JSON.stringify(buildAlcaldiaJsonLd(data));
    document.head.appendChild(place);

    const faqs = buildAlcaldiaFaqs(data);
    const faq = document.createElement('script');
    faq.type = 'application/ld+json';
    faq.setAttribute('data-alcaldia-jsonld', 'faq');
    faq.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question', name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
    document.head.appendChild(faq);
    return () => {
      try { document.head.removeChild(place); } catch {}
      try { document.head.removeChild(faq); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.slug]);
  return null;
}

function FaqAccordion({ faqs }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div data-testid="alcaldia-faq" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {faqs.map((f, idx) => {
        const open = openIdx === idx;
        return (
          <div key={idx} style={{
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.10)',
            background: open ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
            overflow: 'hidden', transition: 'background 0.2s ease',
          }}>
            <button
              data-testid={`alcaldia-faq-q-${idx}`}
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
                fontFamily: 'DM Sans', fontSize: 18, color: '#a5b4fc',
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

export default function AlcaldiaPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetch(`${API}/api/public/landing/alcaldia/${slug}`)
      .then(async r => {
        if (cancelled) return;
        if (r.status === 404) { setError('not_found'); setLoading(false); return; }
        if (!r.ok) { setError('server_error'); setLoading(false); return; }
        const d = await r.json();
        if (!cancelled) { setData(d); setLoading(false); }
      })
      .catch(() => { if (!cancelled) { setError('network_error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <Navbar user={user} />
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)' }}>
            Cargando alcaldía…
          </div>
        </main>
      </div>
    );
  }

  if (error === 'not_found' || !data) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <Navbar user={user} />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 5vw, 40px)',
            margin: '0 0 12px', letterSpacing: '-0.025em',
          }}>
            Alcaldía no encontrada
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', lineHeight: 1.7 }}>
            La alcaldía <strong>{slug}</strong> no está en el catálogo CDMX de DesarrollosMX.
          </p>
          <Link to="/marketplace" data-testid="alcaldia-cta-marketplace-fallback" style={{
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

  const cwd = data.colonias_with_data || [];
  const cp = data.colonias_pending || [];
  const showLeadCapture = data.lead_capture_enabled || cwd.length === 0;

  return (
    <div data-testid="alcaldia-page" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
      <AlcaldiaJsonLd data={data} />
      <Navbar user={user} />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" style={{
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
          marginBottom: 18, letterSpacing: '0.04em',
        }}>
          <Link to="/" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.25)' }}>›</span>
          <span style={{ color: 'var(--cream-3)' }}>Alcaldías</span>
          <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.25)' }}>›</span>
          <span style={{ color: 'var(--cream-2)' }}>{data.name}</span>
        </nav>

        {/* Hero */}
        <header style={{ marginBottom: 36 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', marginBottom: 10,
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Alcaldía · CDMX
          </div>
          <h1 data-testid="alcaldia-name" style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 6vw, 56px)',
            margin: '0 0 14px', letterSpacing: '-0.025em',
          }}>
            {data.name}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
            lineHeight: 1.7, margin: 0, maxWidth: 720,
          }}>
            {data.colonias_count > 0
              ? `${data.name} concentra ${data.colonias_count} colonia(s) en el catálogo de DesarrollosMX, con ${data.colonias_with_data_count} cubriendo análisis Intelligence Engine completo.`
              : `${data.name} es una alcaldía de Ciudad de México. Estamos integrando colonias de la zona; suscríbete para acceso temprano a datos y desarrollos.`}
          </p>
        </header>

        {/* Stats strip */}
        <section style={{ marginBottom: 36, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <KpiBox testid="alcaldia-kpi-colonias" label="Colonias cubiertas" value={data.colonias_count} />
          <KpiBox testid="alcaldia-kpi-data" label="Con análisis IE" value={data.colonias_with_data_count} />
          <KpiBox testid="alcaldia-kpi-pending" label="En preparación" value={data.colonias_pending_count} />
          <KpiBox testid="alcaldia-kpi-devs" label="Desarrollos activos" value={data.active_developments} />
        </section>

        {/* Colonias con data */}
        {cwd.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={sectionTitleStyle}>Colonias con análisis completo</h2>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {cwd.map(c => (
                <Link
                  key={c.slug}
                  to={`/zona/${c.slug}`}
                  data-testid={`alcaldia-col-${c.slug}`}
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
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
                    Análisis IE completo →
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Colonias pendientes */}
        {cp.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={sectionTitleStyle}>Colonias en preparación</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {cp.map(c => (
                <Link
                  key={c.slug}
                  to={`/zona/${c.slug}`}
                  style={{
                    padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.02)',
                    fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)',
                    transition: 'background 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Lead capture si la alcaldía no tiene colonias seedeadas */}
        {showLeadCapture && (
          <section style={{ marginBottom: 36, maxWidth: 640 }}>
            <LandingLeadCaptureForm
              zoneInterest={`alcaldia-${data.slug}`}
              sourceUrl={`/alcaldia/${data.slug}`}
              title={`Avísame de inventario en ${data.name}`}
              description={`Te enviaremos un correo cuando DesarrollosMX integre desarrollos verificados en ${data.name}.`}
            />
          </section>
        )}

        {/* FAQ */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitleStyle}>Preguntas frecuentes sobre {data.name}</h2>
          <FaqAccordion faqs={buildAlcaldiaFaqs(data)} />
        </section>

      </main>
      <CtaFooter />
    </div>
  );
}

function KpiBox({ label, value, testid }) {
  return (
    <div data-testid={testid} style={{
      flex: '1 1 180px', minWidth: 160, padding: '16px 20px',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.025)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--cream-3)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

const sectionTitleStyle = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 20,
  color: 'var(--cream)', margin: '0 0 16px',
  letterSpacing: '-0.015em',
};
