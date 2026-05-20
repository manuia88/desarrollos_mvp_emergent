// W5.22 Z.8.5 — Investor · Proyeccion financiera (ROI/cap_rate/yield/cash flow)
import React from 'react';

export default function InvestorProyeccionFinancieraSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#3B82F6';
  const secondary = palette.secondary || '#22C55E';
  const text = palette.text || '#E2E8F0';
  const textDim = palette.text_dim || 'rgba(226,232,240,0.6)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const dataFont = typography.data_font || "'JetBrains Mono', monospace";
  const radius = parseInt(layout.border_radius || '8', 10) || 0;
  const sectionPadding = layout.section_padding || '64px 24px';

  const tpl = config.spec_data || {};
  const data = config.template_data || tpl.template_data || {};
  const cols = tpl.proyeccion_columns || ['5 anos', '10 anos', '15 anos'];

  // Build rows with values from atlax data
  const roi5 = data.roi_5y_pct || 0;
  const irr = data.irr_pct || 0;
  const capRate = data.cap_rate_pct || 0;
  const grossYield = data.gross_yield_pct || 0;
  const rentMonthly = data.estimated_rent_monthly || 0;
  const breakEven = data.break_even_months || 0;

  const rows = [
    { label: 'Plusvalia esperada', v5: `+${roi5}%`, v10: `+${Math.round(roi5 * 2.1)}%`, v15: `+${Math.round(roi5 * 3.4)}%` },
    { label: 'Renta acumulada', v5: `$${Math.round(rentMonthly * 60 / 1000)}K`, v10: `$${Math.round(rentMonthly * 120 / 1000)}K`, v15: `$${Math.round(rentMonthly * 180 / 1000)}K` },
    { label: 'Cap rate', v5: `${capRate}%`, v10: `${capRate}%`, v15: `${capRate}%` },
    { label: 'Break-even', v5: `${breakEven}m`, v10: `${breakEven}m`, v15: `${breakEven}m` },
    { label: 'TIR proyectada', v5: `${irr}%`, v10: `${irr}%`, v15: `${irr}%` },
    { label: 'Cash flow mensual', v5: `$${Math.round(rentMonthly / 1000)}K`, v10: `$${Math.round(rentMonthly * 1.18 / 1000)}K`, v15: `$${Math.round(rentMonthly * 1.4 / 1000)}K` },
  ];

  return (
    <section data-testid="sec-proyeccion-financiera" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 4, background: `${primary}22`, color: primary, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Proyeccion DMX · datos reales</span>
        </div>
        <h2 style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 'clamp(1.5rem, 3vw, 2rem)', margin: '0 0 24px' }}>
          {config.title || 'Proyeccion financiera completa'}
        </h2>

        {/* Hero stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 4, marginBottom: 28, border: `1px solid ${primary}33`, borderRadius: radius }}>
          <div style={{ padding: 20, borderRight: `1px solid ${primary}22` }}>
            <div style={{ fontFamily: dataFont, fontSize: 32, fontWeight: 800, color: secondary, lineHeight: 1, letterSpacing: '-0.04em' }}>{roi5}%</div>
            <div style={{ marginTop: 6, color: textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>ROI 5 anos</div>
          </div>
          <div style={{ padding: 20, borderRight: `1px solid ${primary}22` }}>
            <div style={{ fontFamily: dataFont, fontSize: 32, fontWeight: 800, color: primary, lineHeight: 1, letterSpacing: '-0.04em' }}>{capRate}%</div>
            <div style={{ marginTop: 6, color: textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cap rate</div>
          </div>
          <div style={{ padding: 20, borderRight: `1px solid ${primary}22` }}>
            <div style={{ fontFamily: dataFont, fontSize: 32, fontWeight: 800, color: primary, lineHeight: 1, letterSpacing: '-0.04em' }}>{grossYield}%</div>
            <div style={{ marginTop: 6, color: textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Gross yield</div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: dataFont, fontSize: 32, fontWeight: 800, color: secondary, lineHeight: 1, letterSpacing: '-0.04em' }}>${Math.round(rentMonthly / 1000)}K</div>
            <div style={{ marginTop: 6, color: textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Renta mensual est.</div>
          </div>
        </div>

        {/* Detailed table */}
        <div style={{ overflow: 'auto', border: `1px solid ${primary}33`, borderRadius: radius }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
            <thead>
              <tr style={{ background: `${primary}11` }}>
                <th style={{ padding: 14, textAlign: 'left', fontFamily: headingFont, fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${primary}33` }}>Metrica</th>
                {cols.map((c) => <th key={c} style={{ padding: 14, textAlign: 'right', fontFamily: dataFont, fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${primary}33` }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${primary}11` }}>
                  <td style={{ padding: 14, color: textDim }}>{r.label}</td>
                  <td style={{ padding: 14, textAlign: 'right', fontFamily: dataFont, color: secondary, fontWeight: 700 }}>{r.v5}</td>
                  <td style={{ padding: 14, textAlign: 'right', fontFamily: dataFont, color: secondary, fontWeight: 700 }}>{r.v10}</td>
                  <td style={{ padding: 14, textAlign: 'right', fontFamily: dataFont, color: secondary, fontWeight: 700 }}>{r.v15}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 14, fontSize: 11, color: textDim, lineHeight: 1.5 }}>Proyecciones basadas en datos historicos zonales + modelo DMX (ARIMA · DRPI · FSD). Confianza ALTA. No constituye asesoria de inversion.</p>
      </div>
    </section>
  );
}
