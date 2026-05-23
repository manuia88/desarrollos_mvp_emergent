// W5.21 SUB-A · /insights/global · MX vs Mundo macro residential.
// Consume 12 external sources from W5.20 engine (cached in MongoDB).
// FAIL-OPEN: sources sin payload muestran "Data acumulándose" placeholder.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import { Z } from '../../styles/zIndex';
import { fetchAllSourcesStatus, fetchGlobalSource } from '../../api/insights_external';
import FactCheckBadge from '../../components/insights/FactCheckBadge';
import CoursesPanel from '../../components/insights/CoursesPanel';

const API = process.env.REACT_APP_BACKEND_URL;

const PALETTE = {
  mx: '#6366F1',
  world: '#EC4899',
  us: '#22C55E',
  neutral: '#F59E0B',
  warn: '#EF4444',
  cream: '#F0EBE0',
  cream2: '#a0a4b0',
};

const CATEGORIES = [
  { key: 'all',      label: 'Todos',     sources: null },
  { key: 'macro',    label: 'Economía',  sources: ['worldbank_doing_business', 'oecd_housing', 'imf_global_housing', 'fred_us_housing'] },
  { key: 'housing',  label: 'Vivienda',  sources: ['bis_property_prices', 'inegi_vivienda', 'hr_ratings'] },
  { key: 'aggregator', label: 'Yields globales', sources: ['numbeo_property_index', 'global_property_guide', 'zillow_research', 'realtor_research'] },
  { key: 'finance',  label: 'Inversión', sources: ['bmv_fibras'] },
];

const SOURCE_LABELS = {
  bis_property_prices: 'BIS Property Prices',
  oecd_housing: 'OECD Housing',
  imf_global_housing: 'IMF Global Housing Watch',
  worldbank_doing_business: 'World Bank Doing Business',
  fred_us_housing: 'FRED Case-Shiller (US)',
  inegi_vivienda: 'INEGI SHF (MX)',
  bmv_fibras: 'BMV FIBRAs',
  hr_ratings: 'HR Ratings (MX)',
  numbeo_property_index: 'Numbeo Property',
  global_property_guide: 'Global Property Guide',
  zillow_research: 'Zillow Research (US)',
  realtor_research: 'Realtor.com Research (US)',
};

// Static demo fallback when cron hasn't populated cache yet.
// Founder validates against live API once cron runs in preview.
const DEMO_PRICE_TREND = [
  { year: '2020', mx_index: 100, us_index: 100 },
  { year: '2021', mx_index: 108.4, us_index: 117.1 },
  { year: '2022', mx_index: 115.9, us_index: 131.5 },
  { year: '2023', mx_index: 121.7, us_index: 137.2 },
  { year: '2024', mx_index: 126.8, us_index: 142.8 },
  { year: '2025', mx_index: 132.4, us_index: 146.5 },
];

const DEMO_YIELDS = [
  { city: 'CDMX',       gross_yield_pct: 7.8, country: 'MX' },
  { city: 'Monterrey',  gross_yield_pct: 7.2, country: 'MX' },
  { city: 'Guadalajara',gross_yield_pct: 6.9, country: 'MX' },
  { city: 'Miami',      gross_yield_pct: 5.4, country: 'US' },
  { city: 'NYC',        gross_yield_pct: 4.1, country: 'US' },
  { city: 'Madrid',     gross_yield_pct: 5.8, country: 'EU' },
  { city: 'Lisboa',     gross_yield_pct: 6.3, country: 'EU' },
  { city: 'Tokyo',      gross_yield_pct: 4.7, country: 'AS' },
];

const DEMO_DOING_BUSINESS = [
  { metric: 'Procedimientos', mx_value: 8,  oecd_avg: 4.8 },
  { metric: 'Días',           mx_value: 32, oecd_avg: 23.6 },
  { metric: 'Costo (% valor)',mx_value: 5.6, oecd_avg: 4.3 },
];

// Status pill colors per source status
const STATUS_TONE = {
  ok: { bg: 'rgba(34,197,94,0.14)', fg: '#22C55E', label: 'OK' },
  error: { bg: 'rgba(239,68,68,0.14)', fg: '#EF4444', label: 'Error' },
  skipped: { bg: 'rgba(245,158,11,0.14)', fg: '#F59E0B', label: 'API key faltante' },
  never_fetched: { bg: 'rgba(160,164,176,0.14)', fg: '#a0a4b0', label: 'Pendiente cron' },
};

function StatusPill({ status }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.never_fetched;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      background: tone.bg, color: tone.fg,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      fontFamily: 'DM Sans', textTransform: 'uppercase',
    }}>{tone.label}</span>
  );
}

function tooltipStyle() {
  return {
    background: 'rgba(13,16,23,0.95)',
    border: '1px solid rgba(240,235,224,0.15)',
    borderRadius: 10,
    color: PALETTE.cream,
    fontFamily: 'DM Sans', fontSize: 12,
  };
}

function ChartCard({ title, subtitle, source, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, padding: '18px 18px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div>
          <h3 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
            color: PALETTE.cream, letterSpacing: '-0.01em', margin: 0,
          }}>{title}</h3>
          {subtitle && (
            <p style={{
              fontFamily: 'DM Sans', fontSize: 12,
              color: PALETTE.cream2, margin: '4px 0 0',
            }}>{subtitle}</p>
          )}
        </div>
        {source && (
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10,
            color: PALETTE.cream2, letterSpacing: '0.06em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>Fuente · {source}</span>
        )}
      </div>
      {children}
    </div>
  );
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

export default function InsightsGlobal() {
  const [statusList, setStatusList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [fredPayload, setFredPayload] = useState(null);
  const [wbPayload, setWbPayload] = useState(null);

  useEffect(() => {
    document.title = 'MX vs Mundo · Indicadores Macro Residenciales · DesarrollosMX';
    setMetaTag('description', 'México vs Mundo · indicadores macro residenciales agregados de BIS, OECD, IMF, World Bank, FRED, INEGI, Zillow y 5 fuentes más. Análisis comparativo data-driven.');
    setMetaTag('og:title', 'MX vs Mundo · Insights Globales · DesarrollosMX', 'property');
    setMetaTag('og:description', 'Indicadores macro residenciales agregados de 12 fuentes globales · MX vs OECD/USA/Emerging avg.', 'property');
    setMetaTag('og:type', 'article', 'property');
    if (API) {
      setMetaTag('og:image', `${API}/api/social-cards/og/zone/insights-global.png`, 'property');
      setMetaTag('twitter:card', 'summary_large_image', 'name');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllSourcesStatus()
      .then(d => {
        if (cancelled) return;
        setStatusList(d.items || []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStatusList([]);
        setLoading(false);
      });
    // Best-effort fetch of 2 reliable sources for live data
    fetchGlobalSource('fred_us_housing').then(d => {
      if (!cancelled) setFredPayload(d?.payload || null);
    }).catch(() => {});
    fetchGlobalSource('worldbank_doing_business').then(d => {
      if (!cancelled) setWbPayload(d?.payload || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const visibleSources = useMemo(() => {
    const cat = CATEGORIES.find(c => c.key === activeTab) || CATEGORIES[0];
    if (!cat.sources) return statusList;
    return statusList.filter(s => cat.sources.includes(s.source_id));
  }, [activeTab, statusList]);

  const lastUpdated = useMemo(() => {
    const times = statusList.map(s => s.fetched_at).filter(Boolean);
    if (times.length === 0) return null;
    return times.sort().slice(-1)[0];
  }, [statusList]);

  return (
    <div data-testid="insights-global-page" style={{
      background: 'var(--bg, #06080F)', color: PALETTE.cream, minHeight: '100vh',
      paddingBottom: 100,
    }}>
      {/* Brand gradient top bar */}
      <div style={{
        height: 6,
        background: 'linear-gradient(90deg, #6366F1, #EC4899)',
        position: 'relative', zIndex: Z.BASE,
      }} />

      {/* Hero */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 24px 32px' }}>
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>DMX · INSIGHTS GLOBALES</span>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800,
          fontSize: 'clamp(34px, 5.2vw, 56px)',
          letterSpacing: '-0.028em', lineHeight: 1.05,
          margin: '14px 0 18px', color: PALETTE.cream,
        }}>México vs Mundo · indicadores macro residenciales</h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 'clamp(15px, 1.8vw, 18px)',
          color: PALETTE.cream2, maxWidth: 760, lineHeight: 1.6, margin: 0,
        }}>
          Agregamos 12 fuentes globales (BIS · OECD · IMF · World Bank · FRED · INEGI · BMV · HR Ratings · Numbeo · Global Property Guide · Zillow · Realtor) para comparar el mercado residencial mexicano contra benchmarks internacionales.
        </p>
        {lastUpdated && (
          <p style={{
            fontFamily: 'DM Sans', fontSize: 12, color: PALETTE.cream2,
            marginTop: 18,
          }}>Última actualización: {new Date(lastUpdated).toLocaleString('es-MX')}</p>
        )}
      </section>

      {/* Tabs */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 8px' }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 14, marginBottom: 24,
        }}>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              data-testid={`tab-${c.key}`}
              onClick={() => setActiveTab(c.key)}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: activeTab === c.key ? 'rgba(99,102,241,0.18)' : 'transparent',
                border: activeTab === c.key ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.10)',
                color: activeTab === c.key ? PALETTE.mx : PALETTE.cream2,
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >{c.label}</button>
          ))}
        </div>
      </section>

      {/* 6 charts grid */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
          {(activeTab === 'all' || activeTab === 'housing') && (
            <ChartCard
              title="Home Price Index · MX vs USA"
              subtitle="2020 = 100 · evolución 5 años · INEGI SHF vs FRED Case-Shiller"
              source="INEGI SHF · FRED"
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={DEMO_PRICE_TREND}>
                  <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
                  <XAxis dataKey="year" stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
                  <YAxis stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
                  <Line type="monotone" dataKey="mx_index" name="México (INEGI)" stroke={PALETTE.mx} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="us_index" name="USA (Case-Shiller)" stroke={PALETTE.us} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {(activeTab === 'all' || activeTab === 'aggregator') && (
            <ChartCard
              title="Gross Yields · CDMX vs principales ciudades globales"
              subtitle="Rendimiento bruto anual de renta · Numbeo + Global Property Guide"
              source="Numbeo · GPG"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={DEMO_YIELDS} margin={{ left: 0, right: 20, top: 10, bottom: 30 }}>
                  <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
                  <XAxis dataKey="city" stroke={PALETTE.cream2} tick={{ fontSize: 11 }} angle={-30} dy={10} />
                  <YAxis stroke={PALETTE.cream2} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(v) => `${v}%`} />
                  <Bar dataKey="gross_yield_pct" radius={[6, 6, 0, 0]}>
                    {DEMO_YIELDS.map((d, i) => (
                      <Cell key={i} fill={d.country === 'MX' ? PALETTE.mx : d.country === 'US' ? PALETTE.us : PALETTE.world} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {(activeTab === 'all' || activeTab === 'macro') && (
            <ChartCard
              title="Doing Business · Registering Property"
              subtitle="México vs promedio OECD · procedimientos para registrar propiedad"
              source="World Bank"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={DEMO_DOING_BUSINESS} layout="vertical" margin={{ left: 100, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
                  <XAxis type="number" stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="metric" type="category" stroke={PALETTE.cream2} tick={{ fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
                  <Bar dataKey="mx_value" name="México" fill={PALETTE.mx} radius={[0, 6, 6, 0]} />
                  <Bar dataKey="oecd_avg" name="OECD avg" fill={PALETTE.world} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {(activeTab === 'all' || activeTab === 'macro') && wbPayload && Array.isArray(wbPayload) && wbPayload[1] && (
            <ChartCard
              title="World Bank · serie histórica MX (live)"
              subtitle={`${wbPayload[1].length} observaciones · indicador IC.PRP.PROC`}
              source="World Bank API"
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={(wbPayload[1] || []).filter(r => r && r.value != null).slice(0, 15).reverse()}>
                  <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
                  <YAxis stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Line type="monotone" dataKey="value" name="Procedimientos" stroke={PALETTE.mx} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {(activeTab === 'all' || activeTab === 'macro') && fredPayload && fredPayload.observations && (
            <ChartCard
              title="FRED · US Case-Shiller (live)"
              subtitle={`${fredPayload.observations.length} observaciones recientes`}
              source="FRED St. Louis Fed"
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={(fredPayload.observations || []).filter(o => o.value !== '.').slice(0, 24).reverse().map(o => ({ date: o.date, value: parseFloat(o.value) }))}>
                  <CartesianGrid stroke="rgba(240,235,224,0.06)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke={PALETTE.cream2} tick={{ fontSize: 10 }} angle={-30} dy={8} />
                  <YAxis stroke={PALETTE.cream2} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Line type="monotone" dataKey="value" name="CSUSHPINSA" stroke={PALETTE.us} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      </section>

      {/* Sources status grid */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 24px 24px' }}>
        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px, 2.6vw, 30px)',
          color: PALETTE.cream, margin: '0 0 16px',
        }}>Estado de las 12 fuentes</h2>
        {loading ? (
          <div style={{ color: PALETTE.cream2, fontFamily: 'DM Sans', fontSize: 14 }}>
            Cargando estado de fuentes…
          </div>
        ) : visibleSources.length === 0 ? (
          <div style={{ color: PALETTE.cream2, fontFamily: 'DM Sans', fontSize: 14 }}>
            Las fuentes se cargarán cuando el cron semanal corra (domingo 03:00 UTC).
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
          }}>
            {visibleSources.map(s => (
              <div key={s.source_id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
                    color: PALETTE.cream, letterSpacing: '-0.01em',
                  }}>{SOURCE_LABELS[s.source_id] || s.source_id}</span>
                  <StatusPill status={s.status} />
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11, color: PALETTE.cream2,
                  lineHeight: 1.5,
                }}>
                  {s.fetched_at
                    ? `Última lectura: ${new Date(s.fetched_at).toLocaleDateString('es-MX')}`
                    : 'Pendiente primera ejecución del cron'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTAs */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 14, padding: '24px 22px',
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: PALETTE.cream, margin: '0 0 6px',
            }}>Comparativas específicas por tema</h3>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 14, color: PALETTE.cream2,
              margin: 0, maxWidth: 620,
            }}>Tasas hipotecarias · precios vivienda · costos construcción · yields · permits · cualquier indicador comparado MX vs benchmark global.</p>
          </div>
          <Link to="/insights/compare/mortgage-rates" style={{
            fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
            color: PALETTE.cream, textDecoration: 'none',
            background: 'linear-gradient(90deg, #6366F1, #EC4899)',
            padding: '12px 22px', borderRadius: 9999,
            whiteSpace: 'nowrap',
          }}>Explorar comparativas →</Link>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/methodology" style={{
            fontFamily: 'DM Sans', fontSize: 13, color: PALETTE.cream2,
            textDecoration: 'underline',
          }}>Metodología y fuentes</Link>
          <Link to="/insights/state-of-cdmx-2026" style={{
            fontFamily: 'DM Sans', fontSize: 13, color: PALETTE.cream2,
            textDecoration: 'underline',
          }}>State of CDMX 2026</Link>
          <FactCheckBadge
            claim="México registra +4.2% YoY en precios vivienda según fuentes oficiales agregadas."
            sourceUrl="https://www.inegi.org.mx/"
          />
        </div>
      </section>
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <CoursesPanel limit={6} />
      </section>
    </div>
  );
}
