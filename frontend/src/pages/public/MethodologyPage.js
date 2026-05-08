// W3.3 ZZ.3 — /methodology public page
import React, { useEffect, useState } from 'react';
import { fetchMethodology } from '../../api/bulletins';
import Navbar from '../../components/landing/Navbar';

function Section({ title, children }) {
  return (
    <section style={{
      padding: '28px 0', borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <h2 style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px, 2.4vw, 28px)',
        color: 'var(--cream)', letterSpacing: '-0.02em', margin: '0 0 14px',
      }}>{title}</h2>
      <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  );
}

function KvLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '6px 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
      <span style={{ color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function MethodologyPage() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchMethodology().then(setData).catch(() => setData(null));

    // OG / Schema.org Dataset markup
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': 'DMX Residential Price Index (DRPI)',
      'description': 'Índice mensual de precios residenciales de CDMX por colonia, basado en regresión hedónica OLS sobre cierres verificados.',
      'creator': { '@type': 'Organization', 'name': 'DesarrollosMX' },
      'license': 'https://desarrollosmx.com/terminos',
      'temporalCoverage': '2026/..',
      'spatialCoverage': 'Ciudad de México, México',
      'keywords': ['real estate','CDMX','price index','hedonic regression','LATAM'],
    });
    document.head.appendChild(script);
    document.title = 'Metodología · DesarrollosMX';
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
      <Navbar />
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div data-testid="methodology-hero">
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase',
            backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Metodología abierta · DesarrollosMX
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(32px, 5vw, 56px)',
            margin: '12px 0 14px', letterSpacing: '-0.025em',
          }}>
            Cómo calculamos los datos DMX
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>
            DesarrollosMX publica métricas trazables y reproducibles. Esta página describe los
            modelos estadísticos, fuentes de datos y validaciones que sostienen el DRPI, el Zone
            Score, el Risk Score (próximamente) y el Construction Cost Index.
          </p>
        </div>

        {/* DRPI */}
        <Section title="1 · DRPI · Modelo hedónico">
          {data?.drpi && (
            <>
              <KvLine label="Método" value={data.drpi.method} />
              <KvLine label="Variables" value={data.drpi.variables.join(', ')} />
              <KvLine label="Categóricas" value={(data.drpi.categorical || []).join(', ') || '—'} />
              <KvLine label="Tamaño mínimo de muestra" value={`${data.drpi.min_sample_size} cierres`} />
              <KvLine label="Ventana de entrenamiento" value={`${data.drpi.training_window_days} días`} />
              <KvLine label="Frecuencia" value={data.drpi.frequency} />
              <KvLine label="Versión" value={`v${data.drpi.version}`} />
              {data.drpi_r_squared_summary?.median != null && (
                <KvLine
                  label="R² · rango actual"
                  value={`min ${data.drpi_r_squared_summary.min} · mediana ${data.drpi_r_squared_summary.median} · max ${data.drpi_r_squared_summary.max} (${data.drpi_r_squared_summary.n_zones} zonas)`}
                />
              )}
              {data.drpi_current_national?.available && (
                <KvLine
                  label={`Nacional · ${data.drpi_current_national.period}`}
                  value={`Índice ${data.drpi_current_national.national_index} · Δ ${data.drpi_current_national.national_delta_pct ?? '—'}%`}
                />
              )}
            </>
          )}
        </Section>

        {/* Zone Score */}
        <Section title="2 · Zone Score A-F">
          {data?.zone_score && (
            <>
              <p>Composición ponderada de 6 dimensiones (versión {data.zone_score.version}):</p>
              <ul style={{ paddingLeft: 22, margin: '8px 0 14px' }}>
                {Object.entries(data.zone_score.weights).map(([k, v]) => (
                  <li key={k}>{k}: peso {Math.round(v * 100)}%</li>
                ))}
              </ul>
              <p>Letras: A ≥ 80 · B 65-79 · C 50-64 · D 35-49 · E 20-34 · F &lt; 20.</p>
            </>
          )}
        </Section>

        {/* Risk */}
        <Section title="3 · Risk Score V2 multi-source">
          {data?.risk_score && (
            <>
              <p>
                <strong style={{ color: 'var(--cream)' }}>V2 activo</strong> (W3.4B):
                composite ponderado de 4 dimensiones · v{data.risk_score.version || '2.0.0'}.
              </p>
              <KvLine label="Composite weights" value="crime 40% · natural 25% · title 15% · perception 20%" />
              <KvLine label="Fuentes activas" value={(data.risk_score.sources_active || []).join(' · ')} />
              <KvLine label="Frecuencia" value={data.risk_score.frequency || ''} />
              <KvLine label="Alert engine" value={data.risk_score.alert_engine || ''} />
              {data.risk_score.dimensions && (
                <div style={{ marginTop: 14 }}>
                  <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 8 }}>
                    Dimensiones
                  </h3>
                  {Object.entries(data.risk_score.dimensions).map(([k, dim]) => (
                    <div key={k} style={{ marginBottom: 12 }}>
                      <div style={{ color: 'var(--cream)', fontWeight: 700, marginBottom: 4 }}>
                        {k === 'crime' ? 'Crime' : k === 'natural' ? 'Natural'
                         : k === 'title' ? 'Título' : 'Percepción'}
                      </div>
                      {Object.entries(dim).map(([dk, dv]) => (
                        <div key={dk} style={{ marginLeft: 16, fontSize: 13, color: 'var(--cream-2)' }}>
                          <span style={{ color: 'var(--cream-3)' }}>{dk}:</span> {Array.isArray(dv) ? dv.join(', ') : String(dv)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {(data.risk_score.sources_pending_v3 || []).length > 0 && (
                <p style={{ color: 'var(--cream-3)', marginTop: 14 }}>
                  <strong>V3 pendiente</strong>: {(data.risk_score.sources_pending_v3 || []).join(', ')}.
                </p>
              )}
            </>
          )}
        </Section>

        {/* Construction Cost */}
        <Section title="4 · Construction Cost Index">
          {data?.construction_cost && (
            <>
              <KvLine label="Fuentes" value={(data.construction_cost.sources || []).join(' · ')} />
              <KvLine label="Frecuencia" value={data.construction_cost.frequency} />
              <KvLine label="Método" value={data.construction_cost.method} />
            </>
          )}
        </Section>

        {/* Validation */}
        <Section title="5 · Validación">
          <p>
            Métricas de validación rigurosas (R², RMSE, MAPE) están disponibles en formato JSON
            público en <code style={{ color: '#a5b4fc' }}>{data?.validation_endpoint || '/api/data-lake/public/validation'}</code>,
            actualizadas snapshot-vs-snapshot.
          </p>
        </Section>

        {/* Citation */}
        <Section title="6 · Citación y prensa">
          {data?.citation && (
            <>
              <p>{data.citation.guideline}</p>
              <KvLine label="DOI (placeholder)" value={data.citation.doi_placeholder} />
              <KvLine label="Contacto prensa" value={data.citation.press_contact} />
            </>
          )}
        </Section>
      </main>
    </div>
  );
}
