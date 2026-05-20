// W5.22 Z.8.2 — Section dispatcher: switch type → render component
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

export default function SectionRenderer({ section, brandKit, linkedEntity, onLead, isPreview }) {
  if (!section || section.visible === false) return null;
  const Comp = REGISTRY[section.type];
  if (!Comp) return null;
  const overrides = section.style_overrides || {};
  const wrapStyle = {
    background: overrides.bg_color || 'transparent',
    paddingTop: overrides.padding_top ?? undefined,
    paddingBottom: overrides.padding_bottom ?? undefined,
    textAlign: overrides.text_align || undefined,
  };
  return (
    <div data-testid={`section-${section.type}`} data-section-id={section.id} style={wrapStyle}>
      <Comp config={section.config || {}} brandKit={brandKit || {}} linkedEntity={linkedEntity} onLead={onLead} isPreview={isPreview} />
    </div>
  );
}
