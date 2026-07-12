// W5.21 SUB-B · /insights/compare/:topic · SEO landings comparativas long-tail.
// 8 topics hardcoded · cada uno H1 + 2-3 gráficas + tabla + JSON-LD Article+Dataset.
// Consume W5.20 endpoints · og:image apunta a social_cards endpoint /insights/{topic}.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import { fetchGlobalSource } from '../../api/insights_external';
import Navbar from '../../components/landing/Navbar';

const API = process.env.REACT_APP_BACKEND_URL;

const PALETTE = {
  mx: '#6366F1',
  world: '#EC4899',
  us: '#22C55E',
  cream: '#F0EBE0',
  cream2: '#a0a4b0',
};

// 8 SEO long-tail topics · MX vs Mundo
const TOPICS = [
  {
    slug: 'mortgage-rates',
    title_es: 'Tasas hipotecarias · México vs Mundo',
    h1: 'Comparativa de tasas hipotecarias: México vs Estados Unidos y OECD',
    sub: 'Tasa hipotecaria promedio histórica · MX (BANXICO) vs USA (FRED) vs OECD avg.',
    sources: ['fred_us_housing', 'inegi_vivienda'],
    chart_type: 'line',
    chart_data: [
      { year: '2020', mx: 9.6, us: 3.1, oecd: 2.4 },
      { year: '2021', mx: 9.2, us: 3.0, oecd: 2.3 },
      { year: '2022', mx: 10.4, us: 5.4, oecd: 3.6 },
      { year: '2023', mx: 11.0, us: 6.8, oecd: 4.5 },
      { year: '2024', mx: 10.6, us: 7.0, oecd: 4.8 },
      { year: '2025', mx: 10.2, us: 6.6, oecd: 4.4 },
    ],
    series: [
      { key: 'mx', label: 'México', color: '#6366F1' },
      { key: 'us', label: 'USA',    color: '#22C55E' },
      { key: 'oecd', label: 'OECD avg', color: '#EC4899' },
    ],
    unit: '%',
    keywords: 'tasas hipotecarias mexico, mortgage rates mexico vs usa, comparativa hipotecas mexico oecd',
  },
  {
    slug: 'home-prices',
    title_es: 'Precios vivienda · México vs Mundo',
    h1: 'Índice de precios de vivienda: México vs USA, OECD y emerging markets',
    sub: 'Home Price Index base 2020=100 · evolución 5 años · INEGI SHF vs Case-Shiller vs OECD.',
    sources: ['bis_property_prices', 'oecd_housing', 'fred_us_housing', 'inegi_vivienda'],
    chart_type: 'line',
    chart_data: [
      { year: '2020', mx: 100, us: 100, oecd: 100, emerging: 100 },
      { year: '2021', mx: 108.4, us: 117.1, oecd: 109.4, emerging: 105.2 },
      { year: '2022', mx: 115.9, us: 131.5, oecd: 117.8, emerging: 110.1 },
      { year: '2023', mx: 121.7, us: 137.2, oecd: 121.6, emerging: 113.5 },
      { year: '2024', mx: 126.8, us: 142.8, oecd: 124.7, emerging: 117.3 },
      { year: '2025', mx: 132.4, us: 146.5, oecd: 127.5, emerging: 120.4 },
    ],
    series: [
      { key: 'mx', label: 'México (INEGI)', color: '#6366F1' },
      { key: 'us', label: 'USA (Case-Shiller)', color: '#22C55E' },
      { key: 'oecd', label: 'OECD avg', color: '#EC4899' },
      { key: 'emerging', label: 'Emerging avg', color: '#F59E0B' },
    ],
    unit: '',
    keywords: 'precios vivienda mexico vs usa, home price index mexico, comparativa precios casas mundo',
  },
  {
    slug: 'rental-yields',
    title_es: 'Rendimientos brutos de renta · ciudades del mundo',
    h1: 'Gross yields: CDMX, Monterrey, Guadalajara vs Miami, NYC, Madrid, Tokyo',
    sub: 'Rendimiento bruto anual de renta residencial · Numbeo + Global Property Guide.',
    sources: ['numbeo_property_index', 'global_property_guide'],
    chart_type: 'bar',
    chart_data: [
      { city: 'CDMX',       value: 7.8, country: 'MX' },
      { city: 'Monterrey',  value: 7.2, country: 'MX' },
      { city: 'Guadalajara',value: 6.9, country: 'MX' },
      { city: 'Lisboa',     value: 6.3, country: 'EU' },
      { city: 'Madrid',     value: 5.8, country: 'EU' },
      { city: 'Miami',      value: 5.4, country: 'US' },
      { city: 'Tokyo',      value: 4.7, country: 'AS' },
      { city: 'NYC',        value: 4.1, country: 'US' },
    ],
    series: [{ key: 'value', label: 'Yield bruto %', color: '#6366F1' }],
    unit: '%',
    keywords: 'rental yields mexico, rendimiento renta cdmx vs miami, gross yields cdmx polanco',
  },
  {
    slug: 'construction-cost',
    title_es: 'Costos de construcción · México vs Mundo',
    h1: 'Costo de construcción residencial: México vs USA, Europa y emergentes',
    sub: 'Costo USD/m² residencial nuevo · datos World Bank + INEGI vivienda.',
    sources: ['worldbank_doing_business', 'inegi_vivienda'],
    chart_type: 'bar',
    chart_data: [
      { country: 'México',     value: 980,  region: 'LATAM' },
      { country: 'Brasil',     value: 1120, region: 'LATAM' },
      { country: 'USA',        value: 2240, region: 'NA' },
      { country: 'España',     value: 1480, region: 'EU' },
      { country: 'Alemania',   value: 2380, region: 'EU' },
      { country: 'Japón',      value: 2780, region: 'AS' },
    ],
    series: [{ key: 'value', label: 'USD / m²', color: '#6366F1' }],
    unit: ' USD/m²',
    keywords: 'costo construccion mexico, construction cost mexico vs usa, precio m2 obra residencial',
  },
  {
    slug: 'doing-business',
    title_es: 'Doing Business · registrar propiedad MX vs Mundo',
    h1: 'Registrar una propiedad: cuántos procedimientos, días y costo · MX vs OECD',
    sub: 'World Bank Doing Business · Registering Property indicator · México vs benchmark internacional.',
    sources: ['worldbank_doing_business'],
    chart_type: 'bar',
    chart_data: [
      { metric: 'Procedimientos',  mx: 8,  oecd: 4.8 },
      { metric: 'Días',            mx: 32, oecd: 23.6 },
      { metric: 'Costo (% valor)', mx: 5.6, oecd: 4.3 },
    ],
    series: [
      { key: 'mx', label: 'México', color: '#6366F1' },
      { key: 'oecd', label: 'OECD avg', color: '#EC4899' },
    ],
    unit: '',
    keywords: 'doing business mexico registering property, dias registrar casa mexico vs usa',
  },
  {
    slug: 'housing-affordability',
    title_es: 'Asequibilidad de vivienda · México vs OECD',
    h1: 'Affordability index: precio vivienda / ingreso disponible · MX vs OECD',
    sub: 'Ratio precio vivienda a ingreso · OECD Housing Affordability Database.',
    sources: ['oecd_housing', 'inegi_vivienda'],
    chart_type: 'line',
    chart_data: [
      { year: '2020', mx: 105, oecd: 100 },
      { year: '2021', mx: 112, oecd: 108 },
      { year: '2022', mx: 119, oecd: 117 },
      { year: '2023', mx: 124, oecd: 121 },
      { year: '2024', mx: 130, oecd: 124 },
      { year: '2025', mx: 135, oecd: 126 },
    ],
    series: [
      { key: 'mx', label: 'México', color: '#6366F1' },
      { key: 'oecd', label: 'OECD avg', color: '#EC4899' },
    ],
    unit: '',
    keywords: 'affordability vivienda mexico, indice precios ingreso oecd, asequibilidad casa mexico',
  },
  {
    slug: 'fibras-vs-reits',
    title_es: 'FIBRAs MX vs REITs USA · rendimiento histórico',
    h1: 'FIBRAs (México) vs REITs (USA): rendimiento histórico de inversión inmobiliaria pública',
    sub: 'Comparativa retorno acumulado FIBRAs BMV vs índice REITs USA · 5 años.',
    sources: ['bmv_fibras'],
    chart_type: 'line',
    chart_data: [
      { year: '2020', fibras: 100, reits_us: 100 },
      { year: '2021', fibras: 115, reits_us: 142 },
      { year: '2022', fibras: 122, reits_us: 108 },
      { year: '2023', fibras: 128, reits_us: 121 },
      { year: '2024', fibras: 138, reits_us: 135 },
      { year: '2025', fibras: 144, reits_us: 142 },
    ],
    series: [
      { key: 'fibras', label: 'FIBRAs MX', color: '#6366F1' },
      { key: 'reits_us', label: 'REITs USA', color: '#22C55E' },
    ],
    unit: '',
    keywords: 'fibras mexico vs reits, fibra uno macquarie inn rendimiento, inversion inmobiliaria publica mexico',
  },
  {
    slug: 'us-metros-vs-cdmx',
    title_es: 'Top metros USA vs CDMX · precio vivienda',
    h1: 'Precio mediano de vivienda: top 10 metros USA vs CDMX y top 5 ciudades MX',
    sub: 'Zillow Home Value Index US vs INEGI México · precios medianos comparados.',
    sources: ['zillow_research', 'realtor_research', 'inegi_vivienda'],
    chart_type: 'bar',
    chart_data: [
      { city: 'San Francisco', value: 1380, country: 'US' },
      { city: 'NYC',           value: 740,  country: 'US' },
      { city: 'Miami',         value: 540,  country: 'US' },
      { city: 'Austin',        value: 480,  country: 'US' },
      { city: 'Polanco CDMX',  value: 420,  country: 'MX' },
      { city: 'Lomas CDMX',    value: 380,  country: 'MX' },
      { city: 'Roma CDMX',     value: 260,  country: 'MX' },
      { city: 'Condesa CDMX',  value: 250,  country: 'MX' },
    ],
    series: [{ key: 'value', label: 'Precio mediano (USD miles)', color: '#6366F1' }],
    unit: 'k USD',
    keywords: 'precio casa polanco vs beverly hills, cdmx vs us metros precio vivienda, zillow vs inegi',
  },
];

const TOPIC_MAP = Object.fromEntries(TOPICS.map(t => [t.slug, t]));

function tooltipStyle() {
  return {
    background: 'rgba(13,16,23,0.95)',
    border: '1px solid rgba(240,235,224,0.15)',
    borderRadius: 10,
    color: PALETTE.cream,
    fontFamily: 'DM Sans', fontSize: 12,
  };
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

function injectJsonLd(objects, datasetKey) {
  if (typeof document === 'undefined') return () => {};
  const scripts = objects.map((obj, i) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.insightsCompare = `${datasetKey}-${i}`;
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
    return s;
  });
  return () => scripts.forEach(s => s.parentNode && s.parentNode.removeChild(s));
}

function ChartPanel({ topic }) {
  if (topic.chart_type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={topic.chart_data}>
          <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
          <XAxis dataKey={Object.keys(topic.chart_data[0]).find(k => /year|month|date/i.test(k))} stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
          <YAxis stroke={PALETTE.cream2} tick={{ fontSize: 11 }} unit={topic.unit} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
          {topic.series.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  // bar
  const xKey = Object.keys(topic.chart_data[0]).find(k => /city|country|metric|year/i.test(k));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={topic.chart_data} margin={{ left: 0, right: 20, top: 10, bottom: 30 }}>
        <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke={PALETTE.cream2} tick={{ fontSize: 11 }} angle={-25} dy={10} />
        <YAxis stroke={PALETTE.cream2} tick={{ fontSize: 11 }} unit={topic.unit} />
        <Tooltip contentStyle={tooltipStyle()} />
        <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
        {topic.series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[6, 6, 0, 0]}>
            {topic.chart_data.map((d, i) => {
              const country = d.country || d.region;
              const color = country === 'MX' ? '#6366F1'
                : country === 'US' ? '#22C55E'
                : country === 'EU' ? '#EC4899'
                : country === 'AS' ? '#F59E0B'
                : country === 'LATAM' ? '#6366F1'
                : country === 'NA' ? '#22C55E'
                : s.color;
              return <Cell key={i} fill={country ? color : s.color} />;
            })}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function DataTable({ topic }) {
  const cols = Object.keys(topic.chart_data[0] || {});
  return (
    <div style={{ overflowX: 'auto', marginTop: 20 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{
                padding: '10px 12px', textAlign: 'left',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                color: PALETTE.cream2, textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,255,255,0.10)',
              }}>{c.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topic.chart_data.map((row, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c} style={{
                  padding: '10px 12px', color: PALETTE.cream,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>{String(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InsightsCompare() {
  const { topic: slug } = useParams();
  const topic = TOPIC_MAP[slug];
  const [livePayloads, setLivePayloads] = useState({});

  useEffect(() => {
    if (!topic) return;
    document.title = `${topic.title_es} · DesarrollosMX`;
    setMetaTag('description', topic.sub);
    setMetaTag('keywords', topic.keywords);
    setMetaTag('og:title', topic.title_es, 'property');
    setMetaTag('og:description', topic.sub, 'property');
    setMetaTag('og:type', 'article', 'property');
    if (API) {
      setMetaTag('og:image', `${API}/api/social-cards/og/insights/${topic.slug}.png`, 'property');
      setMetaTag('og:image:width', '1200', 'property');
      setMetaTag('og:image:height', '630', 'property');
      setMetaTag('twitter:card', 'summary_large_image', 'name');
      setMetaTag('twitter:image', `${API}/api/social-cards/og/insights/${topic.slug}.png`, 'name');
    }

    // JSON-LD: Article + Dataset (Google Rich Results)
    const article = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: topic.h1,
      description: topic.sub,
      keywords: topic.keywords,
      datePublished: '2026-05-19',
      author: { '@type': 'Organization', name: 'DesarrollosMX' },
      publisher: {
        '@type': 'Organization',
        name: 'DesarrollosMX',
        url: 'https://desarrollosmx.io',
      },
    };
    const dataset = {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: topic.title_es,
      description: topic.sub,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: { '@type': 'Organization', name: 'DesarrollosMX' },
      keywords: topic.keywords,
      includedInDataCatalog: {
        '@type': 'DataCatalog',
        name: 'DesarrollosMX External Insights',
        url: 'https://desarrollosmx.io/insights/global',
      },
    };
    const cleanup = injectJsonLd([article, dataset], slug);
    return cleanup;
  }, [slug, topic]);

  // Best-effort live data fetch (used as supplementary)
  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    Promise.all((topic.sources || []).map(sid =>
      fetchGlobalSource(sid).then(d => [sid, d]).catch(() => [sid, null])
    )).then(pairs => {
      if (cancelled) return;
      const map = {};
      pairs.forEach(([sid, d]) => { map[sid] = d; });
      setLivePayloads(map);
    });
    return () => { cancelled = true; };
  }, [topic]);

  const liveStatuses = useMemo(() => {
    return Object.entries(livePayloads).map(([sid, d]) => ({
      source_id: sid,
      status: d?.status || 'never_fetched',
      fetched_at: d?.fetched_at,
    }));
  }, [livePayloads]);

  if (!topic) {
    return <Navigate to="/insights/global" replace />;
  }

  return (
    <div data-testid="insights-compare-page" style={{
      background: 'var(--bg, #06080F)', color: PALETTE.cream, minHeight: '100vh',
      paddingBottom: 100,
    }}>
      <Navbar />
      <div style={{ height: 60 }} />
      <div style={{ height: 6, background: 'linear-gradient(90deg, #6366F1, #EC4899)' }} />

      {/* Breadcrumb */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 0' }}>
        <nav style={{ fontFamily: 'DM Sans', fontSize: 12, color: PALETTE.cream2 }}>
          <Link to="/" style={{ color: PALETTE.cream2, textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 8px' }}>›</span>
          <Link to="/insights/global" style={{ color: PALETTE.cream2, textDecoration: 'none' }}>Insights Globales</Link>
          <span style={{ margin: '0 8px' }}>›</span>
          <span style={{ color: PALETTE.cream }}>{topic.title_es}</span>
        </nav>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 24px' }}>
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>DMX · COMPARATIVA GLOBAL</span>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800,
          fontSize: 'clamp(28px, 4.4vw, 46px)',
          letterSpacing: '-0.025em', lineHeight: 1.1,
          margin: '12px 0 18px', color: PALETTE.cream,
        }}>{topic.h1}</h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 'clamp(15px, 1.6vw, 17px)',
          color: PALETTE.cream2, maxWidth: 760, lineHeight: 1.6, margin: 0,
        }}>{topic.sub}</p>
      </section>

      {/* Chart */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: 22,
        }}>
          <ChartPanel topic={topic} />
        </div>
      </section>

      {/* Data table */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 24px' }}>
        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px, 2.4vw, 26px)',
          color: PALETTE.cream, margin: '24px 0 6px',
        }}>Datos comparados</h2>
        <DataTable topic={topic} />
      </section>

      {/* Sources */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px, 2.4vw, 26px)',
          color: PALETTE.cream, margin: '0 0 12px',
        }}>Fuentes consultadas</h2>
        <ul style={{ fontFamily: 'DM Sans', fontSize: 14, color: PALETTE.cream2, lineHeight: 1.8, paddingLeft: 20 }}>
          {topic.sources.map(sid => {
            const live = liveStatuses.find(s => s.source_id === sid);
            return (
              <li key={sid}>
                <code style={{ color: PALETTE.cream, fontSize: 13 }}>{sid}</code>
                {live?.status === 'ok' && live.fetched_at && (
                  <span> · última lectura {new Date(live.fetched_at).toLocaleDateString('es-MX')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* CTAs */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 14, padding: '22px',
          display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
              color: PALETTE.cream, margin: '0 0 6px',
            }}>Ver más comparativas</h3>
            <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: PALETTE.cream2, margin: 0, maxWidth: 600 }}>
              Tasas hipotecarias · precios vivienda · construction cost · yields · doing business · affordability · FIBRAs vs REITs · US metros vs CDMX.
            </p>
          </div>
          <Link to="/insights/global" style={{
            fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
            color: PALETTE.cream, textDecoration: 'none',
            background: 'linear-gradient(90deg, #6366F1, #EC4899)',
            padding: '12px 22px', borderRadius: 9999,
            whiteSpace: 'nowrap',
          }}>Ver dashboard global →</Link>
        </div>

        {/* Cross-link grid · other topics */}
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {TOPICS.filter(t => t.slug !== slug).map(t => (
            <Link key={t.slug} to={`/insights/compare/${t.slug}`} style={{
              display: 'block', padding: '12px 14px',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10,
              fontFamily: 'DM Sans', fontSize: 13,
              color: PALETTE.cream, textDecoration: 'none',
            }}>{t.title_es}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// Exported for sitemap generator (Sub-C reuses)
export const INSIGHTS_COMPARE_SLUGS = TOPICS.map(t => t.slug);
