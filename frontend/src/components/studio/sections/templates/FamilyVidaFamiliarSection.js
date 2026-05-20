// W5.22 Z.8.5 — Family · Vida familiar (colegios · parques · hospitales · transporte)
import React from 'react';
import * as Icons from 'lucide-react';

const CARDS = [
  { icon: 'GraduationCap', label: 'Colegios cercanos', data_field: 'schools_nearby', desc: '{count} colegios · top zona escolar' },
  { icon: 'Trees', label: 'Parques 2km', data_field: 'parks_nearby', desc: '{count} parques + areas verdes · pet-friendly' },
  { icon: 'Heart', label: 'Hospitales', data_field: 'hospitals_nearby', desc: '{count} servicios medicos pediatra cercanos' },
  { icon: 'Bus', label: 'Transporte', data_field: 'transit_stops', desc: '{count} lineas · score {transit_score}' },
];

export default function FamilyVidaFamiliarSection({ config = {}, theme = {}, linkedEntity }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#F97316';
  const secondary = palette.secondary || '#10B981';
  const grad = palette.gradient || `linear-gradient(135deg, ${primary}, ${secondary})`;
  const text = palette.text || '#FEF3C7';
  const textDim = palette.text_dim || 'rgba(254,243,199,0.65)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const sectionPadding = layout.section_padding || '100px 32px';

  const tpl = (config.spec_data || {});
  const cards = (tpl.vida_familiar_cards && tpl.vida_familiar_cards.length) ? tpl.vida_familiar_cards : CARDS;
  const data = (config.template_data || tpl.template_data || {});

  return (
    <section data-testid="sec-vida-familiar" style={{ padding: sectionPadding, fontFamily: bodyFont }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', textAlign: 'center', margin: '0 0 14px', color: text }}>
          {config.title || 'La vida familiar que merece tu familia'}
        </h2>
        <p style={{ textAlign: 'center', color: textDim, fontSize: 16, marginBottom: 48 }}>Datos reales de la zona · no estimaciones</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {cards.map((c, i) => {
            const Icon = Icons[c.icon] || Icons.MapPin;
            const count = data[c.data_field] ?? linkedEntity?.[c.data_field] ?? '?';
            const desc = (c.desc || c.desc_template || '').replace('{count}', count).replace('{score}', data.transit_score ?? '?').replace('{transit_score}', data.transit_score ?? '?');
            return (
              <div key={i} style={{ padding: 28, borderRadius: 24, background: `rgba(249,115,22,0.06)`, border: `1px solid ${primary}33`, textAlign: 'center', boxShadow: `0 12px 40px ${primary}15` }}>
                <div style={{ width: 56, height: 56, borderRadius: 9999, background: grad, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
                  <Icon size={26} color="#fff" />
                </div>
                <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 32, color: text }}>{count}</div>
                <div style={{ fontSize: 13, color: text, fontWeight: 600, marginTop: 4 }}>{c.label}</div>
                <p style={{ marginTop: 8, fontSize: 12, color: textDim, lineHeight: 1.55 }}>{desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
