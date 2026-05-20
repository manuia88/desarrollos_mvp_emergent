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
import MarketplaceSection from './MarketplaceSection';
// Z.8.5 — Template-specific unique sections
import LuxuryServiciosPrivadosSection from './templates/LuxuryServiciosPrivadosSection';
import FamilyVidaFamiliarSection from './templates/FamilyVidaFamiliarSection';
import InvestorProyeccionFinancieraSection from './templates/InvestorProyeccionFinancieraSection';
import BoutiqueCuraduriaSection from './templates/BoutiqueCuraduriaSection';
import UrgentScarcityAlertSection from './templates/UrgentScarcityAlertSection';
import ScrollytellingCapituloSection from './templates/ScrollytellingCapituloSection';
import VideoFirstGaleriaVideoSection from './templates/VideoFirstGaleriaVideoSection';
import SocialProofSocialStatsSection from './templates/SocialProofSocialStatsSection';
import SocialProofTestimoniosGrandeSection from './templates/SocialProofTestimoniosGrandeSection';
import CompareTablaSection from './templates/CompareTablaSection';

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
  marketplace: MarketplaceSection,
  // Z.8.5 — Property template unique sections
  servicios_privados: LuxuryServiciosPrivadosSection,
  vida_familiar: FamilyVidaFamiliarSection,
  proyeccion_financiera: InvestorProyeccionFinancieraSection,
  curaduria: BoutiqueCuraduriaSection,
  scarcity_alert: UrgentScarcityAlertSection,
  capitulo: ScrollytellingCapituloSection,
  galeria_video: VideoFirstGaleriaVideoSection,
  social_stats: SocialProofSocialStatsSection,
  testimonios_grande: SocialProofTestimoniosGrandeSection,
  comparison_table_grande: CompareTablaSection,
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
  marketplace: { label: 'Marketplace', icon: 'Grid3x3', desc: 'Mini-portal completo · filtros · search · map · paginated' },
  // Z.8.5 — Template-specific section meta
  servicios_privados: { label: 'Servicios privados', icon: 'Crown', desc: 'Luxury · chef · spa · valet · concierge · helipad · driver' },
  vida_familiar: { label: 'Vida familiar', icon: 'Heart', desc: 'Family · colegios · parques · hospitales · transporte' },
  proyeccion_financiera: { label: 'Proyeccion financiera', icon: 'TrendingUp', desc: 'Investor · ROI/cap rate/yield/cash flow' },
  curaduria: { label: 'Curaduria', icon: 'Award', desc: 'Boutique · piedras · carpinteria · arte · arquitecto' },
  scarcity_alert: { label: 'Scarcity alert', icon: 'AlertTriangle', desc: 'Urgent · unidades restantes + descuento + obra' },
  capitulo: { label: 'Capitulo', icon: 'BookOpen', desc: 'Scrollytelling · capitulo narrative long-form' },
  galeria_video: { label: 'Galeria video', icon: 'Film', desc: 'Video-first · 5 clips amanecer/amenidades/rooftop/drone/atardecer' },
  social_stats: { label: 'Social stats', icon: 'Users', desc: 'Social proof · families/satisfaction/rating prominent' },
  testimonios_grande: { label: 'Testimonios grande', icon: 'Quote', desc: 'Social proof · testimonios hero-size carousel' },
  comparison_table_grande: { label: 'Comparison table', icon: 'Columns', desc: 'Compare · vs competidores · Battle Card data' },
};

// Z.8.5.1 — template_key → unique section map (cuando spec quiere inyectar la unica del template)
const TEMPLATE_UNIQUE_SECTION = {
  luxury: 'servicios_privados',
  family: 'vida_familiar',
  investor: 'proyeccion_financiera',
  boutique: 'curaduria',
  urgent: 'scarcity_alert',
  scrollytelling: 'capitulo',
  video_first: 'galeria_video',
  social_proof: 'social_stats',
  compare: 'comparison_table_grande',
  modern: null,
};

export function getUniqueSectionForTemplate(template_key) {
  return TEMPLATE_UNIQUE_SECTION[template_key] || null;
}

export default function SectionRenderer({ section, brandKit, linkedEntity, onLead, isPreview, theme, landingSlug, templateKey }) {
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
    <div data-testid={`section-${section.type}`} data-section-id={section.id} data-template-key={templateKey || undefined} data-theme={t.name ? section.type : undefined} style={wrapStyle}>
      <Comp
        config={section.config || {}}
        brandKit={brandKit || {}}
        linkedEntity={linkedEntity}
        onLead={onLead}
        isPreview={isPreview}
        theme={t}
        landingSlug={landingSlug}
        templateKey={templateKey}
      />
    </div>
  );
}
