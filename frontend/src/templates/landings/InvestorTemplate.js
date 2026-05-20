// W5.22 Z.8.7 Sub-B2 · Investor Template · Bloomberg blue · data heavy · JetBrains Mono
import React, { useState } from 'react';

const COL = { primary: '#1A56DB', bg: '#fff', muted: '#F1F5F9', text: '#0F172A' };
const MONO = 'JetBrains Mono, ui-monospace, monospace';

export default function InvestorTemplate({ intake = {}, copy = null }) {
  const m = intake.investment_metrics || {};
  const [enganche, setEnganche] = useState(1500000);
  const baseRoi = m.expected_roi_pct || 18;
  const cashflow = Math.round(enganche * (baseRoi / 100));
  const advisor = intake.assigned_advisor || {};

  return (
    <div data-testid="tpl-z87-investor" style={{ background: COL.bg, color: COL.text, fontFamily: 'Outfit, sans-serif', minHeight: '100vh' }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 0, minHeight: '70vh', alignItems: 'stretch' }}>
        <div style={{ background: `url(${intake.photos?.[0]?.url || ''}) center/cover`, minHeight: 360, background: !intake.photos?.[0] ? `linear-gradient(135deg, ${COL.primary}, #0F172A)` : undefined }} />
        <div style={{ padding: '4rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: COL.muted }}>
          <div style={{ fontFamily: MONO, color: COL.primary, fontSize: 12, letterSpacing: '0.15em', marginBottom: 12 }}>INVESTOR BRIEF · {intake.colonia || 'CDMX'}</div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, margin: 0, lineHeight: 1.05 }}>{copy?.hero?.headline || intake.project_name}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginTop: 36 }}>
            {[
              { label: 'ROI esperado', value: `${m.expected_roi_pct ?? '—'}%` },
              { label: 'Yield anual', value: `${m.expected_yield_pct ?? '—'}%` },
              { label: 'Cap rate', value: `${m.cap_rate_pct ?? '—'}%` },
              { label: 'Payback', value: `${m.payback_years ?? '—'}a` },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: MONO, fontSize: 32, color: COL.primary, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ padding: '4rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, marginBottom: 24 }}>Escenarios · 3 cuadros</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 13 }}>
          <thead>
            <tr style={{ background: COL.muted }}>
              <th style={{ padding: 14, textAlign: 'left', color: COL.primary, fontFamily: 'Outfit, sans-serif' }}>Escenario</th>
              <th style={{ padding: 14, textAlign: 'right', color: COL.primary, fontFamily: 'Outfit, sans-serif' }}>ROI</th>
              <th style={{ padding: 14, textAlign: 'right', color: COL.primary, fontFamily: 'Outfit, sans-serif' }}>Yield</th>
              <th style={{ padding: 14, textAlign: 'right', color: COL.primary, fontFamily: 'Outfit, sans-serif' }}>Payback</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'Conservador', roi: baseRoi * 0.7, yield_: (m.expected_yield_pct ?? 6) * 0.7, payback: (m.payback_years ?? 8) * 1.3 },
              { name: 'Base', roi: baseRoi, yield_: m.expected_yield_pct ?? 6, payback: m.payback_years ?? 8 },
              { name: 'Optimista', roi: baseRoi * 1.3, yield_: (m.expected_yield_pct ?? 6) * 1.3, payback: (m.payback_years ?? 8) * 0.7 },
            ].map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: 14, fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: 14, textAlign: 'right' }}>{s.roi.toFixed(1)}%</td>
                <td style={{ padding: 14, textAlign: 'right' }}>{s.yield_.toFixed(1)}%</td>
                <td style={{ padding: 14, textAlign: 'right' }}>{s.payback.toFixed(1)}a</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section style={{ padding: '4rem 2rem', maxWidth: 800, margin: '0 auto', background: COL.muted, borderRadius: 14 }}>
        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>Calculadora ROI</h3>
        <label style={{ display: 'block', marginTop: 16, fontFamily: MONO, fontSize: 12, color: '#64748B' }}>Enganche (MXN)
          <input type="number" data-testid="investor-enganche" value={enganche} onChange={(e) => setEnganche(Number(e.target.value) || 0)} style={{ display: 'block', width: '100%', marginTop: 8, padding: 12, fontFamily: MONO, fontSize: 18, border: '1px solid #CBD5E1', borderRadius: 8 }} />
        </label>
        <div style={{ marginTop: 24, padding: 18, background: COL.primary, color: '#fff', borderRadius: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Cashflow estimado anual (base)</div>
          <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700 }}>${cashflow.toLocaleString('es-MX')}</div>
        </div>
      </section>
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem', textAlign: 'center', background: COL.text, color: '#fff' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28 }}>Descarga el modelo financiero</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>Excel + proyecciones 10 anos firmado por {advisor.full_name || 'tu analista'}</p>
        <a href={`mailto:${advisor.email || ''}`} style={{ display: 'inline-block', marginTop: 24, padding: '14px 32px', background: COL.primary, color: '#fff', textDecoration: 'none', borderRadius: 9999, fontWeight: 600, fontFamily: MONO, fontSize: 13 }}>SOLICITAR_MODELO_XLS</a>
      </section>
    </div>
  );
}
