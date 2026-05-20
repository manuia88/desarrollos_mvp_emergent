// W5.22 Z.8.7 Sub-B2 · Compare Template · neutro slate · tabla vs competidores
import React from 'react';

const COL = { bg: '#fff', text: '#1E293B', muted: '#F8FAFC', primary: '#6366F1', good: '#22C55E', bad: '#EF4444' };

export default function CompareTemplate({ intake = {}, copy = null }) {
  const comparables = intake.comparable_developments || [];
  const competitors = [
    { name: intake.project_name || 'Nosotros', us: true, price: intake.price_from_mxn },
    ...(comparables.slice(0, 3).map((c) => ({ name: c.name, us: false, price: c.price_from_mxn }))),
  ];
  while (competitors.length < 4) competitors.push({ name: `Alternativa ${competitors.length}`, us: false });

  const rows = [
    { group: 'Precio', items: [{ label: 'Precio desde MXN', values: competitors.map((c, i) => i === 0 ? `$${(c.price || 4800000).toLocaleString('es-MX')}` : `$${((c.price || 5500000) * 1).toLocaleString('es-MX')}`) }] },
    { group: 'Producto', items: [
      { label: 'Tipologias', values: ['✓', '✓', '~', '✗'] },
      { label: 'Tour 3DGS', values: ['✓', '✗', '✗', '✓'] },
    ] },
    { group: 'Amenidades', items: [
      { label: 'Gym/Spa', values: ['✓', '✓', '✓', '~'] },
      { label: 'Coworking', values: ['✓', '✗', '~', '✗'] },
      { label: 'Pet park', values: ['✓', '~', '✗', '~'] },
    ] },
    { group: 'Ubicacion', items: [
      { label: 'Walkscore 90+', values: ['✓', '~', '✓', '✗'] },
      { label: 'Metro <500m', values: ['✓', '✗', '~', '✗'] },
    ] },
    { group: 'Trust', items: [
      { label: 'Certificacion AMPI', values: ['✓', '✗', '~', '~'] },
      { label: 'Reviews verificadas', values: ['4.9★', '4.2★', '3.8★', 'NA'] },
    ] },
  ];

  const cell = (v) => {
    if (v === '✓') return <span style={{ color: COL.good, fontWeight: 800 }}>✓</span>;
    if (v === '✗') return <span style={{ color: COL.bad, fontWeight: 800 }}>✗</span>;
    if (v === '~') return <span style={{ color: '#94A3B8', fontWeight: 800 }}>~</span>;
    return <span style={{ fontSize: 13 }}>{v}</span>;
  };

  return (
    <div data-testid="tpl-z87-compare" style={{ background: COL.bg, color: COL.text, fontFamily: 'DM Sans, sans-serif' }}>
      <section style={{ padding: '4rem 2rem 2rem', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: 0, fontWeight: 800 }}>{copy?.hero?.headline || `${intake.project_name} vs el mercado`}</h1>
        <p style={{ marginTop: 16, color: '#475569', fontSize: 18 }}>Comparativa honesta · datos verificables · sin trampas</p>
      </section>
      <section style={{ padding: '2rem 1rem 4rem', maxWidth: 1200, margin: '0 auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
          <thead>
            <tr>
              <th style={{ padding: 16, textAlign: 'left', background: COL.muted, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Caracteristica</th>
              {competitors.map((c, i) => (
                <th key={i} style={{ padding: 16, textAlign: 'center', background: c.us ? COL.primary : COL.muted, color: c.us ? '#fff' : COL.text, fontFamily: 'Outfit, sans-serif' }}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, gi) => (
              <React.Fragment key={gi}>
                <tr style={{ background: '#F1F5F9' }}>
                  <td colSpan={5} style={{ padding: '10px 16px', fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>{r.group}</td>
                </tr>
                {r.items.map((it, ii) => (
                  <tr key={ii} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: 14, fontWeight: 600 }}>{it.label}</td>
                    {it.values.map((v, vi) => (
                      <td key={vi} style={{ padding: 14, textAlign: 'center' }}>{cell(v)}</td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 780, margin: '0 auto', background: '#FEF3C7', borderRadius: 14 }}>
        <h3 style={{ fontFamily: 'Outfit, sans-serif', color: '#92400E', margin: 0 }}>Concesion honesta</h3>
        <p style={{ marginTop: 10, color: '#78350F', lineHeight: 1.7 }}>{intake.competitive_advantages?.[0] || 'Reconocemos que la Alternativa 2 tiene un gym mas grande. Optamos por priorizar acabados premium y un coworking dedicado · esto se traduce en valor por m2 superior. Tu decides cual prioridad importa.'}</p>
      </section>
      <section style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <a href="#" style={{ display: 'inline-block', padding: '12px 26px', border: `1px solid ${COL.primary}`, color: COL.primary, borderRadius: 9999, textDecoration: 'none', fontWeight: 600 }}>Descargar comparativa Excel</a>
      </section>
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem', textAlign: 'center', background: COL.primary, color: '#fff' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28 }}>Te explico la comparativa en 15 min</h2>
        <a href="#" style={{ display: 'inline-block', marginTop: 18, padding: '14px 28px', background: '#fff', color: COL.primary, borderRadius: 9999, textDecoration: 'none', fontWeight: 700 }}>Agendar llamada</a>
      </section>
    </div>
  );
}
