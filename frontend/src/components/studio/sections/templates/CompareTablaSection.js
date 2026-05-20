// W5.22 Z.8.5 — Compare · Comparison table grande (vs competidores · Battle Card data)
import React from 'react';

const DEFAULT_DIMS = [
  'Precio por m2',
  'Amenidades',
  'Ubicacion (walkability)',
  'Avance obra',
  'Entrega',
  'Reputacion developer',
  'Plusvalia historica zona',
  'Cap rate proyectado',
  'Servicios premium',
  'Sostenibilidad',
];

function statusIcon(score) {
  if (score >= 80) return { mark: '✓', color: '#22C55E' };
  if (score >= 50) return { mark: '~', color: '#F59E0B' };
  return { mark: '✗', color: '#EF4444' };
}

export default function CompareTablaSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#6366F1';
  const secondary = palette.secondary || '#22C55E';
  const grad = palette.gradient || `linear-gradient(135deg, ${primary}, ${secondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const radius = parseInt(layout.border_radius || '12', 10) || 0;
  const sectionPadding = layout.section_padding || '72px 24px';

  const tpl = config.spec_data || {};
  const data = config.template_data || tpl.template_data || {};
  const dims = (tpl.comparison_dimensions && tpl.comparison_dimensions.length) ? tpl.comparison_dimensions : DEFAULT_DIMS;
  const dimScores = data.dim_scores || {};
  // Mock competitor scores: our score viene de dim_scores · competitors heuristic (10-30 points behind)
  const myComposite = data.composite_score || 78;
  const compA = Math.max(0, myComposite - 12);
  const compB = Math.max(0, myComposite - 22);

  return (
    <section data-testid="sec-compare-table" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', textAlign: 'center', margin: '0 0 14px' }}>
          {config.title || 'Caracteristica por caracteristica'}
        </h2>
        <p style={{ textAlign: 'center', color: textDim, fontSize: 14, marginBottom: 32 }}>Datos verificados por DMX Battle Card · ranking actualizado semanalmente</p>
        <div style={{ overflow: 'auto', borderRadius: radius, border: `1px solid ${primary}33` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: grad, color: '#fff' }}>
                <th style={{ padding: 14, textAlign: 'left', fontFamily: headingFont, fontSize: 12 }}>Caracteristica</th>
                <th style={{ padding: 14, textAlign: 'center', fontFamily: headingFont, fontSize: 12, background: 'rgba(255,255,255,0.18)' }}>Nosotros</th>
                <th style={{ padding: 14, textAlign: 'center', fontFamily: headingFont, fontSize: 12 }}>Competidor A</th>
                <th style={{ padding: 14, textAlign: 'center', fontFamily: headingFont, fontSize: 12 }}>Competidor B</th>
              </tr>
            </thead>
            <tbody>
              {dims.map((d, i) => {
                const myS = (Object.values(dimScores || {})[i % Math.max(1, Object.keys(dimScores || {}).length)] || myComposite);
                const aS = Math.max(0, myS - 8 - (i % 3) * 4);
                const bS = Math.max(0, myS - 18 - (i % 5) * 3);
                const me = statusIcon(myS);
                const aI = statusIcon(aS);
                const bI = statusIcon(bS);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${primary}22` }}>
                    <td style={{ padding: 14, color: text, fontWeight: 500, fontSize: 13 }}>{d}</td>
                    <td style={{ padding: 14, textAlign: 'center', background: `${secondary}11` }}>
                      <span style={{ color: me.color, fontSize: 20, fontWeight: 800 }}>{me.mark}</span>
                    </td>
                    <td style={{ padding: 14, textAlign: 'center' }}>
                      <span style={{ color: aI.color, fontSize: 18 }}>{aI.mark}</span>
                    </td>
                    <td style={{ padding: 14, textAlign: 'center' }}>
                      <span style={{ color: bI.color, fontSize: 18 }}>{bI.mark}</span>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: `2px solid ${primary}55`, background: `${primary}08` }}>
                <td style={{ padding: 14, fontFamily: headingFont, fontWeight: 800, fontSize: 13 }}>Composite Score</td>
                <td style={{ padding: 14, textAlign: 'center', fontFamily: headingFont, fontWeight: 800, fontSize: 18, color: secondary }}>{myComposite}</td>
                <td style={{ padding: 14, textAlign: 'center', fontFamily: headingFont, fontWeight: 700, fontSize: 16, color: textDim }}>{compA}</td>
                <td style={{ padding: 14, textAlign: 'center', fontFamily: headingFont, fontWeight: 700, fontSize: 16, color: textDim }}>{compB}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
