// W4.16 — StateOfCDMX (public /insights/state-of-cdmx-2026)
import React, { useEffect, useState } from 'react';
import { HorizontalBars, DemandSupplyBars, VelocityLineChart } from '../../components/marketing/StateOfCDMXChart';

const API = process.env.REACT_APP_BACKEND_URL;

const VELOCITY_CATEGORIES = [
  { categoria: 'Luxury', key: 'luxury' },
  { categoria: 'Premium', key: 'premium' },
  { categoria: 'Residencial', key: 'residencial' },
  { categoria: 'Medio', key: 'medio' },
  { categoria: 'Social', key: 'social' },
];

export default function StateOfCDMX() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/state-of-cdmx`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error('fetch_failed');
        setMetrics(d.metrics);
      })
      .catch(() => setError('No pudimos cargar los datos. Reintenta en un momento.'));

    // SEO meta description + og:image
    try {
      const head = document.head;
      const setMeta = (name, val, prop = false) => {
        const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
        let m = head.querySelector(sel);
        if (!m) {
          m = document.createElement('meta');
          if (prop) m.setAttribute('property', name); else m.setAttribute('name', name);
          head.appendChild(m);
        }
        m.setAttribute('content', val);
      };
      document.title = 'State of CDMX 2026 · DesarrollosMX Annual Report';
      setMeta('description', 'Reporte anual DMX · Top colonias por ROI, gap demanda-oferta, velocity por categoría y predicciones 2026 H2 para CDMX.');
      setMeta('og:title', 'State of CDMX 2026 · DesarrollosMX', true);
      setMeta('og:description', 'Datos brutos del mercado inmobiliario CDMX · análisis IA + predicciones.', true);
      setMeta('og:image', `${API}/api/state-of-cdmx/og-image/2026-Q2.png`, true);
      setMeta('og:type', 'article', true);
    } catch (_) {}

    try { window.posthog?.capture?.('state_of_cdmx_viewed'); } catch (_) {}
  }, []);

  if (error) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--cream)', fontFamily: 'DM Sans',
      }}>
        {error}
      </div>
    );
  }
  if (!metrics) {
    return (
      <div data-testid="state-of-cdmx-page" style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--cream-3, #a0a4b0)', fontFamily: 'DM Sans', fontSize: 14,
      }}>
        Cargando…
      </div>
    );
  }

  const top = metrics.top_10_colonias_roi || [];
  const demand = metrics.demand_supply_gap_top10 || [];
  const velocityData = VELOCITY_CATEGORIES.map((c) => ({
    categoria: c.categoria,
    meses: metrics.velocity_by_category?.[c.key] ?? 9,
  }));
  const preds = metrics.predictions_2026 || {};

  const kpiCards = [
    { id: 'top-colonia', label: 'Top colonia ROI 12m', value: top[0]?.name || '—',
      sub: top[0] ? `+${top[0].roi_12m_pct.toFixed(1)}%` : '' },
    { id: 'demand-leader', label: 'Demanda más caliente',
      value: demand[0]?.name || '—',
      sub: demand[0] ? `Gap ${demand[0].gap_score.toFixed(0)}` : '' },
    { id: 'velocity-champion', label: 'Velocity champion',
      value: `${metrics.velocity_by_category?.social ?? 7} meses`,
      sub: 'segmento Social' },
    { id: 'forecast-q4', label: 'Forecast Q4 2026',
      value: `+${(preds.q4_avg_appreciation ?? 0).toFixed(1)}%`,
      sub: 'apreciación promedio' },
  ];

  return (
    <div data-testid="state-of-cdmx-page" style={{
      background: '#06080F', color: '#F0EBE0', minHeight: '100vh',
      paddingBottom: 100,
    }}>
      <div style={{ height: 6, background: 'linear-gradient(90deg, #6366F1, #EC4899)' }} />

      {/* Hero */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 24px 32px' }}>
        <span style={eyebrow}>DMX · INTELIGENCIA INMOBILIARIA</span>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(40px, 6vw, 72px)',
          lineHeight: 1.05, letterSpacing: '-0.02em', margin: '12px 0 14px',
        }}>
          State of <span style={gradientText}>CDMX 2026</span>
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 18, color: 'var(--cream-3, #a0a4b0)',
          maxWidth: 720, lineHeight: 1.55,
        }}>
          Datos brutos del mercado inmobiliario CDMX · análisis IA + predicciones agregadas
          desde el corpus DMX (modelo hedónico + Zone Score + match weights ML).
        </p>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)',
          marginTop: 12, letterSpacing: '0.02em',
        }}>
          Período: <strong>{metrics.period}</strong> · actualizado {String(metrics.generated_at || '').slice(0, 10)}
        </div>
      </div>

      {/* Section 1 · KPI strip */}
      <Section testid="state-section-1" title="Highlights del mercado">
        <div style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {kpiCards.map((k) => (
            <div key={k.id} data-testid={`state-kpi-${k.id}`} style={kpiStyle}>
              <div style={{ fontFamily: 'Outfit', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cream-3, #a0a4b0)' }}>
                {k.label.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, marginTop: 8 }}>
                {k.value}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#a5b4fc', marginTop: 4 }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 2 · Top 10 ROI */}
      <Section testid="state-section-2" title="Top 10 colonias por ROI 12 meses" sub="Predicción basada en modelo hedónico + plusvalía histórica.">
        <div style={chartCard}>
          <HorizontalBars
            data={top.map((r) => ({ name: r.name, roi: r.roi_12m_pct }))}
            dataKey="roi"
            valueFormatter={(v) => `${v}%`}
          />
        </div>
      </Section>

      {/* Section 3 · Demand-Supply */}
      <Section testid="state-section-3" title="Demand–Supply Gap por colonia" sub="Verde = demanda alta · ámbar = equilibrado · rojo = sobreoferta.">
        <div style={chartCard}>
          <DemandSupplyBars data={demand} />
        </div>
      </Section>

      {/* Section 4 · Velocity */}
      <Section testid="state-section-4" title="Velocity por categoría de precio" sub="Meses estimados de tiempo en mercado hasta liquidar inventario.">
        <div style={chartCard}>
          <VelocityLineChart data={velocityData} />
        </div>
      </Section>

      {/* Section 5 · Predictions */}
      <Section testid="state-section-5" title="Predicciones 2026 · Q3 → Q4">
        <div style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}>
          <div style={gradientCard}>
            <div style={eyebrowOnGradient}>APRECIACIÓN Q3</div>
            <div style={bigNum}>+{(preds.q3_avg_appreciation ?? 0).toFixed(1)}%</div>
            <div style={sub}>Promedio top zonas CDMX</div>
          </div>
          <div style={gradientCard}>
            <div style={eyebrowOnGradient}>APRECIACIÓN Q4</div>
            <div style={bigNum}>+{(preds.q4_avg_appreciation ?? 0).toFixed(1)}%</div>
            <div style={sub}>Aceleración esperada cierre año</div>
          </div>
          <div style={{ ...gradientCard, background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={eyebrow}>HOT ZONES</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginTop: 12, lineHeight: 1.6 }}>
              {(preds.hot_zones || []).map((s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(' · ') || '—'}
            </div>
          </div>
        </div>
      </Section>

      {/* Section 6 · DMX Index */}
      <Section testid="state-section-6" title="DMX Index · Top creatives preventa" sub="Capa 7 anonimizada · datos completos en Wave 5.">
        <div style={{
          ...chartCard,
          padding: 28,
          textAlign: 'center',
          fontFamily: 'DM Sans',
          fontSize: 14,
          color: 'var(--cream-3, #a0a4b0)',
        }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, color: 'var(--cream)', marginBottom: 8 }}>
            {metrics.dmx_index_top_creatives_count ?? 12}
          </div>
          creatives en top 1% conversión preventa CDMX · datos reales en versión Pro
        </div>
      </Section>

      {/* Section 7 · Download PDF */}
      <Section testid="state-section-7" title="¿Quieres este reporte como PDF?" sub="Personalizado con tu nombre · entregado por email.">
        <div style={chartCard}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, #a0a4b0)' }}>
              Genera tu audit propio + recibe el State of CDMX 2026 anexo.
            </div>
            <a
              href="/free-audit?utm_source=state-of-cdmx&utm_medium=cta&utm_campaign=annual-report-2026"
              data-testid="state-download-pdf"
              style={ctaPrimary}
            >
              GENERAR MI AUDIT PDF
            </a>
          </div>
        </div>
      </Section>

      {/* Section 8 · Broker CTA */}
      <Section testid="state-section-8" title="¿Eres asesor o desarrollador?">
        <div style={{
          ...chartCard,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(236,72,153,0.10))',
          border: '1px solid rgba(99,102,241,0.30)',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ maxWidth: 540 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>
                DMX automatiza tu marketing inmobiliario
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.55 }}>
                Studio brochures · briefings IE · investment simulator · tour 3D Gaussian Splatting · CRM agéntico.
                Empieza gratis.
              </div>
            </div>
            <a
              href="/broker-portal"
              data-testid="state-cta-broker"
              style={ctaPrimary}
            >
              IR A BROKER PORTAL
            </a>
          </div>
        </div>
      </Section>

      <div style={{
        textAlign: 'center', marginTop: 32, fontFamily: 'DM Sans', fontSize: 11,
        color: 'var(--cream-3, #a0a4b0)',
      }}>
        DMX no opina, mide · Solo uso informativo · LFPDPPP compliant
      </div>
    </div>
  );
}

function Section({ title, sub, children, testid }) {
  return (
    <div data-testid={testid} style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px 0' }}>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {sub && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, #a0a4b0)', margin: '0 0 18px' }}>
          {sub}
        </p>
      )}
      {children}
    </div>
  );
}

// Styles
const gradientText = {
  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
};
const eyebrow = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em',
  color: 'var(--cream-3, #a0a4b0)',
};
const eyebrowOnGradient = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em',
  color: 'rgba(255,255,255,0.75)',
};
const chartCard = {
  background: 'rgba(13,16,23,0.92)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 18, padding: 22,
  backdropFilter: 'blur(24px)',
};
const kpiStyle = {
  background: 'rgba(13,16,23,0.92)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 14, padding: '18px 20px',
  position: 'relative', overflow: 'hidden',
};
const gradientCard = {
  background: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
  borderRadius: 18, padding: 24, color: '#fff',
};
const bigNum = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 44, marginTop: 12 };
const sub = { fontFamily: 'DM Sans', fontSize: 12, marginTop: 4, opacity: 0.85 };
const ctaPrimary = {
  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
  color: '#fff', border: 'none', borderRadius: 9999,
  padding: '12px 26px',
  fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
  textDecoration: 'none',
  display: 'inline-block',
};
