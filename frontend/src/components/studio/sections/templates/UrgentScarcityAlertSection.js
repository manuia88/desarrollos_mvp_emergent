// W5.22 Z.8.5 — Urgent · Scarcity alert (units_left · price_drop · obra · reserva)
import React from 'react';
import * as Icons from 'lucide-react';

const DEFAULT_ITEMS = [
  { label: 'Unidades restantes', data_field: 'units_left', icon: 'Home' },
  { label: 'Descuento vence', data_field: 'price_drop_pct', icon: 'Tag', suffix: '%' },
  { label: 'Avance obra', data_field: 'construction_progress', icon: 'TrendingUp', suffix: '%' },
  { label: 'Reserva con', data_field: 'min_reservation', icon: 'Wallet', prefix: '$' },
];

export default function UrgentScarcityAlertSection({ config = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const primary = palette.primary || '#EF4444';
  const text = palette.text || '#FEE2E2';
  const textDim = palette.text_dim || 'rgba(254,226,226,0.65)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";
  const sectionPadding = layout.section_padding || '60px 20px';
  const radius = parseInt(layout.border_radius || '12', 10) || 0;

  const tpl = config.spec_data || {};
  const items = (tpl.scarcity_alert_items && tpl.scarcity_alert_items.length) ? tpl.scarcity_alert_items : DEFAULT_ITEMS;
  const data = config.template_data || tpl.template_data || {};

  return (
    <section data-testid="sec-scarcity-alert" style={{ padding: sectionPadding, fontFamily: bodyFont, color: text, borderTop: `4px solid ${primary}`, borderBottom: `4px solid ${primary}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '6px 14px', background: primary, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', borderRadius: 9999, marginBottom: 18 }}>
          {data.scarcity_label || 'Oferta limitada · actua ahora'}
        </div>
        <h2 style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', letterSpacing: '-0.04em', margin: '0 0 32px' }}>
          {config.title || 'Por que actuar HOY'}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {items.map((it, i) => {
            const Icon = Icons[it.icon] || Icons.AlertCircle;
            const raw = data[it.data_field];
            const val = raw != null ? `${it.prefix || ''}${raw}${it.suffix || ''}` : '—';
            return (
              <div key={i} style={{ padding: 24, background: `${primary}14`, border: `1px solid ${primary}55`, borderRadius: radius, textAlign: 'center' }}>
                <Icon size={22} color={primary} />
                <div style={{ marginTop: 12, fontFamily: headingFont, fontSize: 32, fontWeight: 800, color: text, letterSpacing: '-0.03em' }}>{val}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{it.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 24, color: textDim, fontSize: 13 }}>Estos numeros se actualizan en tiempo real · refresh cada 5 min</div>
      </div>
    </section>
  );
}
