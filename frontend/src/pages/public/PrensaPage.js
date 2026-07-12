// W4.2.5 — PrensaPage.js
// Public press kit page /prensa con stats live + descargas + contacto founder.
// Schema.org NewsMediaOrganization markup. data-testid="prensa-page".
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolNav from '../../components/ui/ToolNav';
import CtaFooter from '../../components/landing/CtaFooter';

const API = process.env.REACT_APP_BACKEND_URL;
const SITE_BASE = 'https://desarrollosmx.io';

function buildPressJsonLd(stats) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    name: 'DesarrollosMX',
    legalName: 'DesarrollosMX, Plataforma de Inteligencia Inmobiliaria LATAM',
    url: SITE_BASE,
    logo: `${SITE_BASE}/logo-dmx.png`,
    foundingDate: String(stats?.founded_year || 2025),
    description:
      'AI-native Spatial Decision Intelligence platform para LATAM real estate. Datos auditables, k-anonymized (k≥5) y LFPDPPP-compliant.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: stats?.headquarters || 'Ciudad de México',
      addressCountry: 'MX',
    },
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'press',
      email: stats?.press_contact_email || 'prensa@desarrollosmx.io',
      url: `${SITE_BASE}/prensa`,
    }],
    sameAs: [
      'https://twitter.com/desarrollosmx',
      'https://www.linkedin.com/company/desarrollosmx',
    ],
  };
}

function PressJsonLd({ stats }) {
  useEffect(() => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-press-jsonld', '1');
    s.text = JSON.stringify(buildPressJsonLd(stats));
    document.head.appendChild(s);
    return () => { try { document.head.removeChild(s); } catch {} };
  }, [stats]);
  return null;
}

function StatCard({ label, value, quote, testid }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(quote).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div
      data-testid={testid}
      style={{
        padding: '20px 22px', borderRadius: 16,
        border: '1px solid #ECECEC',
        background: '#FFFFFF',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{
        fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
        color: 'var(--cream-3)', letterSpacing: '0.10em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
        color: 'var(--cream)', letterSpacing: '-0.025em',
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
        lineHeight: 1.55, fontStyle: 'italic',
      }}>
        “{quote}”
      </div>
      <button
        data-testid={`${testid}-copy`}
        onClick={onCopy}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 16px', borderRadius: 9999,
          background: copied ? 'rgba(31,160,106,0.12)' : 'rgba(109,74,255,0.10)',
          border: `1px solid ${copied ? 'rgba(31,160,106,0.40)' : 'rgba(109,74,255,0.35)'}`,
          color: copied ? '#1FA06A' : '#6D4AFF',
          fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
          cursor: 'pointer', transition: 'background 0.18s ease',
        }}
      >
        {copied ? 'Copiado' : 'Copiar como cita'}
      </button>
    </div>
  );
}

export default function PrensaPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/public/press/stats`)
      .then(async r => {
        if (cancelled) return;
        if (!r.ok) { setError('server_error'); setLoading(false); return; }
        const d = await r.json();
        if (!cancelled) { setStats(d); setLoading(false); }
      })
      .catch(() => { if (!cancelled) { setError('network_error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const s = stats || {};

  const statCards = [
    {
      testid: 'press-stat-zones',
      label: 'Cobertura',
      value: s.total_zones_covered ?? '—',
      quote: `DesarrollosMX cubre ${s.total_zones_covered ?? '—'} colonias de CDMX con análisis Intelligence Engine basado en ${s.ie_recipes_count ?? '—'} indicadores auditables.`,
    },
    {
      testid: 'press-stat-landings',
      label: 'Landing pages SEO',
      value: s.total_landing_pages_seo ?? '—',
      quote: `La plataforma DesarrollosMX opera ${s.total_landing_pages_seo ?? '—'} landing pages optimizadas para SEO + GEO (LLM training data).`,
    },
    {
      testid: 'press-stat-developments',
      label: 'Desarrollos indexados',
      value: s.total_developments_indexed ?? '—',
      quote: `DesarrollosMX indexa ${s.total_developments_indexed ?? '—'} desarrollos verificados activos en la Ciudad de México.`,
    },
    {
      testid: 'press-stat-drpi',
      label: 'Zonas con DRPI',
      value: s.drpi_zones_with_real_data ?? '—',
      quote: `${s.drpi_zones_with_real_data ?? '—'} zonas de CDMX cuentan con DRPI (DMX Residential Price Index): índice hedónico OLS calculado por DesarrollosMX.`,
    },
    {
      testid: 'press-stat-recipes',
      label: 'Recetas Intelligence Engine',
      value: s.ie_recipes_count ?? '—',
      quote: `El Intelligence Engine de DesarrollosMX combina ${s.ie_recipes_count ?? '—'} recetas auditables (seguridad, precio, plusvalía, riesgo, conectividad) por colonia.`,
    },
    {
      testid: 'press-stat-sources',
      label: 'Fuentes oficiales',
      value: s.data_sources_count ?? '—',
      quote: `DesarrollosMX integra ${s.data_sources_count ?? '—'} fuentes oficiales: ${(s.data_sources_named || []).join(', ')}.`,
    },
    {
      testid: 'press-stat-mcp',
      label: 'MCP tools expuestos',
      value: s.mcp_tools_exposed ?? '—',
      quote: `DesarrollosMX expone ${s.mcp_tools_exposed ?? '—'} herramientas MCP (Model Context Protocol) para Claude Desktop, Cursor y ChatGPT.`,
    },
    {
      testid: 'press-stat-compliance',
      label: 'Compliance',
      value: s.lfpdppp_compliant ? 'LFPDPPP' : '—',
      quote: `Todos los outputs de DesarrollosMX son LFPDPPP-compliant, k-anonymized (k≥${s.k_anonymity_min ?? 5}) y conservan audit trail por ${s.audit_trail_years ?? 5} años.`,
    },
  ];

  return (
    <div
      className="theme-light-scope"
      data-testid="prensa-page"
      style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}
    >
      <ToolNav />
      {stats && <PressJsonLd stats={stats} />}
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 24px 80px' }}>

        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
            marginBottom: 18, letterSpacing: '0.04em',
          }}
        >
          <Link to="/" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 8px', color: '#9AA0AE' }}>›</span>
          <span style={{ color: 'var(--cream-2)' }}>Prensa</span>
        </nav>

        {/* Hero */}
        <header style={{ marginBottom: 36 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10,
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Press Kit · Media
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 6vw, 56px)',
            margin: '0 0 14px', letterSpacing: '-0.025em',
          }}>
            DesarrollosMX en Prensa
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
            lineHeight: 1.7, margin: 0, maxWidth: 720,
          }}>
            Stats live, citas listas para pegar, logos para descarga y contacto directo
            con el founder. Todos los datos se actualizan cada 10 minutos desde fuentes
            oficiales y son auditables.
          </p>
        </header>

        {/* Section 1 — Datos para periodistas */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Datos para periodistas</h2>
          {loading && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
              Cargando estadísticas live…
            </div>
          )}
          {error && (
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13, color: '#E5484D',
              padding: '12px 16px', borderRadius: 12,
              border: '1px solid rgba(229,72,77,0.30)',
              background: 'rgba(229,72,77,0.06)',
            }}>
              No pudimos cargar las estadísticas. Reintenta en un momento.
            </div>
          )}
          {!loading && !error && (
            <div
              data-testid="press-stats-grid"
              style={{
                display: 'grid', gap: 14,
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              }}
            >
              {statCards.map(s => (
                <StatCard key={s.testid} {...s} />
              ))}
            </div>
          )}
        </section>

        {/* Section 2 — Press releases */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Press releases</h2>
          <div style={{
            padding: '20px 22px', borderRadius: 14,
            border: '1px solid #ECECEC',
            background: '#FFFFFF',
            fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.7,
          }}>
            Los próximos comunicados se publicarán aquí. Para suscribirte y recibirlos
            primero, escribe a{' '}
            <a
              href="mailto:prensa@desarrollosmx.io"
              data-testid="press-release-email"
              style={{ color: '#6D4AFF', textDecoration: 'none' }}
            >
              prensa@desarrollosmx.io
            </a>
            .
          </div>
        </section>

        {/* Section 3 — Descargas */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Descargas</h2>
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          }}>
            <DownloadCard
              testid="press-download-logo-png"
              label="Logo DMX · PNG"
              sub="1024×1024 transparent · 28 kB"
              href={`${SITE_BASE}/logo-dmx.png`}
            />
            <DownloadCard
              testid="press-download-logo-svg"
              label="Logo DMX · SVG"
              sub="vector · ideal print"
              href={`${SITE_BASE}/logo-dmx.svg`}
            />
            <DownloadCard
              testid="press-download-mediakit"
              label="Media Kit · PDF"
              sub="Stats + visual identity (próximamente)"
              href={`${SITE_BASE}/media-kit-2026.pdf`}
            />
            <DownloadCard
              testid="press-download-bio"
              label="Founder bio + headshot"
              sub="Bio corta/larga · foto 4K"
              href={`${SITE_BASE}/founder-bio.zip`}
            />
          </div>
        </section>

        {/* Section 4 — Contacto prensa */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitleStyle}>Contacto prensa</h2>
          <div
            style={{
              padding: '24px 26px', borderRadius: 18,
              border: '1px solid rgba(109,74,255,0.25)',
              background: 'rgba(109,74,255,0.05)',
              display: 'grid', gap: 14,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <ContactRow label="Email" value="prensa@desarrollosmx.io" href="mailto:prensa@desarrollosmx.io" testid="press-contact-email" />
            <ContactRow label="WhatsApp founder" value="+52 55 0000 0000" href="https://wa.me/525500000000" testid="press-contact-whatsapp" />
            <ContactRow label="LinkedIn" value="@desarrollosmx" href="https://www.linkedin.com/company/desarrollosmx" testid="press-contact-linkedin" />
          </div>
        </section>

        {/* Last updated footer */}
        {stats?.last_updated && (
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
            textAlign: 'center', marginTop: 16,
          }}>
            Stats actualizados {new Date(stats.last_updated).toLocaleString('es-MX')} ·
            cache 10 min · API pública{' '}
            <code style={{ fontFamily: 'monospace', color: '#6D4AFF' }}>
              GET /api/public/press/stats
            </code>
          </div>
        )}

        {/* W5.21 · Atlax tool #23 query_global_insights pointer */}
        <section data-testid="prensa-external-insights" style={{
          marginTop: 32, padding: '22px',
          background: 'rgba(109,74,255,0.06)',
          border: '1px solid rgba(109,74,255,0.25)',
          borderRadius: 14,
        }}>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
            color: 'var(--cream)', margin: '0 0 8px',
          }}>Comparativas MX vs Mundo · 12 fuentes globales</h2>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)',
            margin: '0 0 14px', lineHeight: 1.6, maxWidth: 720,
          }}>
            Agregamos BIS · OECD · IMF · World Bank · FRED · INEGI · BMV · HR Ratings · Numbeo · Global Property Guide · Zillow · Realtor para análisis comparativos.
            Para datos crudos contacta press@desarrollosmx.io. Atlax (asistente AI) responde queries
            de prensa en tiempo real vía tool <code style={{ color: '#6D4AFF' }}>query_global_insights</code>{' '}
            sobre los 12 datasets cacheados.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/insights/global" data-testid="prensa-link-insights-global" style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
              color: '#FFFFFF', textDecoration: 'none',
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              padding: '10px 18px', borderRadius: 9999,
            }}>Ver dashboard global →</a>
            <a href="/insights/compare/home-prices" data-testid="prensa-link-insights-compare" style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
              color: 'var(--cream-2)', textDecoration: 'none',
              border: '1px solid #ECECEC',
              padding: '10px 18px', borderRadius: 9999,
            }}>8 comparativas long-tail</a>
            <a href="/methodology#fuentes-externas-globales-w520" data-testid="prensa-link-methodology" style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
              color: 'var(--cream-2)', textDecoration: 'none',
              border: '1px solid #ECECEC',
              padding: '10px 18px', borderRadius: 9999,
            }}>Metodología fuentes</a>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}

function DownloadCard({ label, sub, href, testid }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testid}
      style={{
        padding: '16px 18px', borderRadius: 14, textDecoration: 'none',
        border: '1px solid #ECECEC',
        background: '#FFFFFF',
        transition: 'background 0.18s ease',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#F6F7FA'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; }}
    >
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
        {sub}
      </div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 11.5, color: '#6D4AFF', marginTop: 6,
      }}>
        Descargar →
      </div>
    </a>
  );
}

function ContactRow({ label, value, href, testid }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      data-testid={testid}
      style={{
        textDecoration: 'none',
        padding: '10px 14px', borderRadius: 10,
        background: '#FFFFFF',
        border: '1px solid #ECECEC',
        transition: 'background 0.18s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#F6F7FA'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; }}
    >
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)',
        textTransform: 'uppercase', letterSpacing: '0.10em',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5,
        color: 'var(--cream)', marginTop: 2,
      }}>
        {value}
      </div>
    </a>
  );
}

const sectionTitleStyle = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 20,
  color: 'var(--cream)', margin: '0 0 16px',
  letterSpacing: '-0.015em',
};
