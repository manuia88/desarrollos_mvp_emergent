// W5.22 Z.8.3 — Section dispatcher: switch type → render component (theme-aware)
import React from 'react';
import HeroSection from './HeroSection';
import PropertyShowcaseSection from './PropertyShowcaseSection';
import GallerySection from './GallerySection';
import VideoSection from './VideoSection';
import MapSection from './MapSection';
import StatsSection from './StatsSection';
import FeaturesSection from './FeaturesSection';
import TestimonialsSection from './TestimonialsSection';
import LeadFormSection from './LeadFormSection';
import CalendarBookingSection from './CalendarBookingSection';
import PriceTableSection from './PriceTableSection';
import FAQSection from './FAQSection';
import CountdownSection from './CountdownSection';
import FooterSection from './FooterSection';

const REGISTRY = {
  hero: HeroSection,
  property_showcase: PropertyShowcaseSection,
  gallery: GallerySection,
  video: VideoSection,
  map: MapSection,
  stats: StatsSection,
  features: FeaturesSection,
  testimonials: TestimonialsSection,
  lead_form: LeadFormSection,
  calendar_booking: CalendarBookingSection,
  price_table: PriceTableSection,
  faq: FAQSection,
  countdown: CountdownSection,
  footer: FooterSection,
};

export const SECTION_TYPES = Object.keys(REGISTRY);

export const SECTION_META = {
  hero: { label: 'Hero', icon: 'Image', desc: 'Encabezado principal' },
  property_showcase: { label: 'Propiedad', icon: 'Home', desc: 'Showcase con price + features + 3DGS' },
  gallery: { label: 'Galeria', icon: 'Images', desc: 'Grid / masonry / carousel' },
  video: { label: 'Video', icon: 'Video', desc: 'YouTube / Vimeo / MP4' },
  map: { label: 'Mapa', icon: 'MapPin', desc: 'Mapbox embed con coords' },
  stats: { label: 'Stats', icon: 'BarChart3', desc: 'Contadores animados' },
  features: { label: 'Features', icon: 'Sparkles', desc: 'Beneficios + iconos' },
  testimonials: { label: 'Testimonios', icon: 'Quote', desc: 'Reviews + ratings' },
  lead_form: { label: 'Formulario', icon: 'ClipboardList', desc: 'Multi-step lead capture' },
  calendar_booking: { label: 'Reserva', icon: 'Calendar', desc: 'Slots de visita' },
  price_table: { label: 'Precios', icon: 'Tag', desc: 'Comparativo tipologias' },
  faq: { label: 'FAQ', icon: 'HelpCircle', desc: 'Preguntas frecuentes accordion' },
  countdown: { label: 'Countdown', icon: 'Timer', desc: 'Urgencia / scarcity' },
  footer: { label: 'Footer', icon: 'Anchor', desc: 'Logo + contacto + social' },
};

export default function SectionRenderer({ section, brandKit, linkedEntity, onLead, isPreview, theme }) {
  if (!section || section.visible === false) return null;
  const Comp = REGISTRY[section.type];
  if (!Comp) return null;
  const overrides = section.style_overrides || {};
  const t = theme || {};
  const palette = t.palette || {};
  const layout = t.layout || {};
  const animation = t.animation || {};
  const wrapStyle = {
    background: overrides.bg_color || palette.bg || 'transparent',
    color: palette.text || undefined,
    paddingTop: overrides.padding_top ?? undefined,
    paddingBottom: overrides.padding_bottom ?? undefined,
    textAlign: overrides.text_align || undefined,
    transition: `background ${animation.duration || '320ms'} ${animation.transition_curve || 'cubic-bezier(0.22, 1, 0.36, 1)'}`,
  };
  if (layout.border_radius) wrapStyle.borderRadius = undefined;
  return (
    <div data-testid={`section-${section.type}`} data-section-id={section.id} data-theme={t.name ? section.type : undefined} style={wrapStyle}>
      <Comp
        config={section.config || {}}
        brandKit={brandKit || {}}
        linkedEntity={linkedEntity}
        onLead={onLead}
        isPreview={isPreview}
        theme={t}
      />
    </div>
  );
}
