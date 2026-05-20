// W5.22 Z.8.5 — Boutique · Curaduria (artesanos · piedras · arte · arquitecto firmado)
import React from 'react';
import * as Icons from 'lucide-react';

const DEFAULT_CARDS = [
  { icon: 'Hammer', title: 'Carpinteria custom', desc: 'Maderas mexicanas · ensambladas a mano' },
  { icon: 'Mountain', title: 'Piedras importadas', desc: 'Marmol Carrara · onix Hidalgo · curaduria geologica' },
  { icon: 'Palette', title: 'Arte original', desc: 'Obras comisionadas a artistas mexicanos emergentes' },
  { icon: 'Award', title: 'Arquitecto reconocido', desc: 'Firma con 12+ premios internacionales' },
];

export default function BoutiqueCuraduriaSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const secondary = palette.secondary || '#D97706';
  const text = palette.text || '#FEF3C7';
  const textDim = palette.text_dim || 'rgba(254,243,199,0.6)';
  const headingFont = typography.heading_font || "'Lora', serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const sectionPadding = layout.section_padding || '96px 32px';

  const tpl = config.spec_data || {};
  const cards = (tpl.curaduria_cards && tpl.curaduria_cards.length) ? tpl.curaduria_cards : DEFAULT_CARDS;

  return (
    <section data-testid="sec-curaduria" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 11, color: secondary, letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 14 }}>· Curaduria ·</div>
          <h2 style={{ fontFamily: headingFont, fontWeight: 600, fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', margin: 0, fontStyle: 'italic' }}>
            {config.title || 'Hecho a mano · detalles unicos'}
          </h2>
          <div style={{ height: 1, width: 80, background: secondary, margin: '24px auto 0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
          {cards.map((c, i) => {
            const Icon = Icons[c.icon] || Icons.Sparkles;
            return (
              <div key={i} style={{ padding: 28, background: 'rgba(217,119,6,0.04)', borderLeft: `2px solid ${secondary}`, borderRadius: 0 }}>
                <Icon size={26} color={secondary} strokeWidth={1.2} />
                <h3 style={{ margin: '16px 0 8px', fontFamily: headingFont, fontWeight: 600, fontSize: 20 }}>{c.title}</h3>
                <p style={{ color: textDim, margin: 0, lineHeight: 1.7, fontSize: 14 }}>{c.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
