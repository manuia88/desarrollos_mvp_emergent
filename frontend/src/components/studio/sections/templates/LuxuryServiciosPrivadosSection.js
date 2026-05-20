// W5.22 Z.8.5 — Luxury · Servicios privados (chef · spa · valet · concierge · helipad · driver)
import React from 'react';
import * as Icons from 'lucide-react';

const DEFAULT_ITEMS = [
  { icon: 'ChefHat', title: 'Chef privado on-demand', desc: 'Reserva 24h · chef ejecutivo en residencia' },
  { icon: 'Sparkles', title: 'Spa & wellness', desc: 'Spa privado · masaje terapeutico · sauna' },
  { icon: 'Car', title: 'Valet 24/7', desc: 'Acceso vehicular sin tocar volante' },
  { icon: 'Bell', title: 'Concierge', desc: 'Reservas restaurantes · vuelos · eventos' },
  { icon: 'Plane', title: 'Helipad', desc: 'Acceso aereo directo a la torre' },
  { icon: 'User', title: 'Driver dedicado', desc: 'Chofer profesional en residencia' },
];

export default function LuxuryServiciosPrivadosSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#D4AF37';
  const text = palette.text || '#F5F0E8';
  const textDim = palette.text_dim || 'rgba(245,240,232,0.6)';
  const bg = palette.bg || '#0A0A0A';
  const headingFont = typography.heading_font || "'Playfair Display', serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const items = (config.items && config.items.length) ? config.items : DEFAULT_ITEMS;
  const title = config.title || 'Servicios privados incluidos';
  const sectionPadding = layout.section_padding || '120px 24px';

  return (
    <section data-testid="sec-servicios-privados" style={{ padding: sectionPadding, background: bg, color: text, fontFamily: bodyFont }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ height: 1, width: 60, background: primary, margin: '0 auto 28px' }} />
        <h2 style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
        <p style={{ color: textDim, marginTop: 14, fontSize: 15 }}>Cada residencia incluye acceso ilimitado · sin costos adicionales</p>
        <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
          {items.map((it, i) => {
            const Icon = Icons[it.icon] || Icons.Sparkles;
            return (
              <div key={i} style={{ padding: 28, border: `1px solid ${primary}55`, borderRadius: 0, textAlign: 'left' }}>
                <Icon size={28} color={primary} strokeWidth={1.4} />
                <h3 style={{ margin: '18px 0 8px', fontFamily: headingFont, fontWeight: 600, fontSize: 20 }}>{it.title}</h3>
                <p style={{ color: textDim, margin: 0, lineHeight: 1.6, fontSize: 14 }}>{it.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
