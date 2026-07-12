/**
 * W5.1 Sub-Chunk C — Landing SEO /valor/:slug
 * - Server-friendly title/desc via useEffect (SPA).
 * - JSON-LD inyectado en <head> para Google Rich Snippets.
 * - Muestra precio referencial, top 3 desarrollos, score, demand, breadcrumbs.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ToolNav from '../../components/ui/ToolNav';
import CtaFooter from '../../components/landing/CtaFooter';
import ExplainabilityCard from '../../components/avm/ExplainabilityCard';
import ForecastChart from '../../components/forecast/ForecastChart';
import NarrativeBlock from '../../components/landing/NarrativeBlock';
import AvmConfidenceRange from '../../components/shared/AvmConfidenceRange';
import ProbabilityBar from '../../components/shared/ProbabilityBar';
import { fetchAvmLanding } from '../../api/avm';

function fmtMXN(n) {
  if (!n) return '—';
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  } catch { return `$${n}`; }
}

function setMetaTag(name, content, attr = 'name') {
  if (typeof document === 'undefined') return;
  let tag = document.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setJsonLd(scripts) {
  if (typeof document === 'undefined') return () => {};
  const nodes = scripts.map((obj, i) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.avmLanding = String(i);
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
    return s;
  });
  return () => nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
}

export default function ValorColonia() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAvmLanding(slug)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('not_found'); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!data) return;
    const meta = data.meta || {};
    if (meta.title) document.title = meta.title;
    if (meta.description) setMetaTag('description', meta.description);
    setMetaTag('og:title', meta.title || '', 'property');
    setMetaTag('og:description', meta.description || '', 'property');
    setMetaTag('og:type', 'website', 'property');
    // W5.16 · Social card dinámico (1200×630 og:image)
    const API = process.env.REACT_APP_BACKEND_URL;
    if (API && slug) {
      setMetaTag('og:image', `${API}/api/social-cards/og/zone/${slug}.png`, 'property');
      setMetaTag('og:image:width', '1200', 'property');
      setMetaTag('og:image:height', '630', 'property');
      setMetaTag('twitter:card', 'summary_large_image', 'name');
      setMetaTag('twitter:image', `${API}/api/social-cards/og/zone/${slug}.png`, 'name');
    }
    let cleanup = () => {};
    if (Array.isArray(data.json_ld)) {
      cleanup = setJsonLd(data.json_ld);
    }
    return () => cleanup();
  }, [data]);

  if (error === 'not_found') {
    return (
      <div className="theme-light-scope" style={{ background: '#FBFAFC', minHeight: '100vh', color: '#1E2230' }}>
        <ToolNav />
        <main style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'DM Sans' }}>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 32, fontWeight: 800 }}>Colonia no encontrada</h1>
          <p style={{ color: '#5A5F6E', marginTop: 8 }}>
            <Link to="/valores" style={{ color: '#6D4AFF' }}>Volver a Valores</Link>
          </p>
        </main>
        <CtaFooter />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="theme-light-scope" style={{ background: '#FBFAFC', minHeight: '100vh', color: '#1E2230' }}>
        <ToolNav />
        <main style={{ padding: '48px 24px', fontFamily: 'DM Sans', color: '#5A5F6E' }}>Cargando…</main>
      </div>
    );
  }

  const sample = data.sample_avm || {};
  const embedUrl = `/widgets/avm/${slug}?theme=light`;
  const embedSnippet = `<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}${embedUrl}" width="100%" height="520" frameborder="0" style="border-radius:18px"></iframe>`;

  return (
    <div className="theme-light-scope" data-testid="valor-colonia-page" style={{ background: '#FBFAFC', minHeight: '100vh', color: '#1E2230' }}>
      <ToolNav />
      <main style={{ paddingTop: 16, paddingBottom: 60 }}>
        {/* Hero */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 16px' }}>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, color: '#9AA0AE', marginBottom: 12, fontFamily: 'DM Sans' }}>
            <Link to="/" style={{ color: '#5A5F6E' }}>DesarrollosMX</Link>
            <span style={{ margin: '0 8px' }}>›</span>
            <Link to="/valores" style={{ color: '#5A5F6E' }}>Valores</Link>
            <span style={{ margin: '0 8px' }}>›</span>
            <span style={{ color: '#6D4AFF' }}>{data.colonia_name}</span>
          </nav>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6D4AFF', marginBottom: 10 }}>
            Valuación · {data.alcaldia || 'CDMX'}
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(30px, 4.5vw, 52px)', letterSpacing: '-0.025em',
            lineHeight: 1.05, margin: '0 0 14px', color: '#1E2230',
          }}>
            ¿Cuánto vale tu propiedad en {data.colonia_name}?
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: '#5A5F6E', maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
            Estimación automatizada gratuita basada en modelo hedónico OLS y datos de mercado reales.
            Precio promedio: <strong style={{ color: '#1E2230' }}>{fmtMXN(data.price_m2)} / m²</strong>.
          </p>
        </section>

        {/* Sample AVM */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 24px' }}>
          <div style={{
            padding: 28, borderRadius: 20,
            background: '#FFFFFF',
            border: '1px solid #ECECEC',
          }}>
            <div style={{ fontSize: 11, color: '#6D4AFF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Vivienda típica · 80 m² · 2 rec · 2 baños · 8 años
            </div>
            <div style={{ fontFamily: 'Outfit', fontSize: 44, fontWeight: 800, color: '#1E2230', lineHeight: 1 }}>
              {fmtMXN(sample.precio_estimado)}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E', marginTop: 6 }}>
              Rango: {fmtMXN(sample.range_low)} — {fmtMXN(sample.range_high)} ·{' '}
              {fmtMXN(sample.precio_per_m2)}/m² · Confianza {sample.confidence}
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                to={`/valores?colonia=${slug}`}
                data-testid="valor-colonia-cta-estimar"
                style={{ padding: '10px 18px', borderRadius: 9999, border: 'none', background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
              >Estimar mi propiedad</Link>
              <Link
                to={`/colonia/${slug}`}
                style={{ padding: '10px 18px', borderRadius: 9999, border: '1px solid rgba(109,74,255,0.4)', background: 'rgba(109,74,255,0.10)', color: '#6D4AFF', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
              >Ver landing colonia</Link>
            </div>
          </div>

          {/* Explainability */}
          {sample.explain && <ExplainabilityCard explain={sample.explain} />}

          {/* W5.15 P2 — AVM Confidence Range widget · property_id sintetico misma logica que en fsd persist */}
          <div style={{ marginTop: 16 }}>
            <AvmConfidenceRange property_id={`${slug}_m2${Math.round(sample.m2 || 80)}_r${sample.recamaras || 2}_b${sample.banos || 2}_a${sample.antiguedad_anos || 8}`} />
          </div>

          {/* W5.19 — Probability Bar: closes_below_listed */}
          <div style={{ marginTop: 12 }}>
            <ProbabilityBar
              type="closes_below_listed"
              entity_id={`${slug}_m2${Math.round(sample.m2 || 80)}_r${sample.recamaras || 2}_b${sample.banos || 2}_a${sample.antiguedad_anos || 8}`}
              params={{ listed: sample.range_high || sample.precio_estimado || 5000000 }}
              title={undefined}
            />
          </div>

          {/* W5.6 Sub-A — Narrativa AI de la zona */}
          <div style={{ marginTop: 16 }}>
            <NarrativeBlock entityType="zone" entityId={slug} />
          </div>

          {/* W5.6 Sub-B — Multi-escenario: compra ahora vs esperar */}
          <NarrativeBlock
            entityType="scenario"
            entityId={slug}
            paramsObject={{ colonia: slug, m2: 80, rec: 2, ban: 2, age: 8 }}
          />

          {/* W5.3 Parte 1 — Forecast multi-horizonte (vivienda típica) */}
          <ForecastChart
            mode="property"
            params={{ colonia: slug, m2: 80, recamaras: 2, banos: 2, antiguedadAnos: 8, horizons: '6,12,24' }}
          />
        </section>

        {/* Top desarrollos */}
        {Array.isArray(data.top_devs) && data.top_devs.length > 0 && (
          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
            <div style={{ fontSize: 11, color: '#9AA0AE', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Top desarrollos activos en {data.colonia_name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
              {data.top_devs.map(d => (
                <Link
                  key={d.dev_id}
                  to={`/desarrollo/${d.slug || d.dev_id}`}
                  data-testid={`valor-colonia-dev-${d.dev_id}`}
                  style={{
                    padding: 16, borderRadius: 16,
                    background: '#FFFFFF', border: '1px solid #ECECEC',
                    color: '#1E2230', textDecoration: 'none', display: 'block',
                  }}
                >
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: '#5A5F6E' }}>desde {fmtMXN(d.price_from)} · {d.stage}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Embed snippet */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
          <div style={{ padding: 18, borderRadius: 16, background: '#FFFFFF', border: '1px solid #ECECEC' }}>
            <div style={{ fontSize: 11, color: '#6D4AFF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Embeber widget AVM en tu sitio
            </div>
            <pre
              data-testid="valor-colonia-embed-snippet"
              style={{
                fontFamily: 'monospace', fontSize: 11, color: '#1E2230',
                background: '#F6F7FA', padding: 12, borderRadius: 10,
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
              }}
            >{embedSnippet}</pre>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
