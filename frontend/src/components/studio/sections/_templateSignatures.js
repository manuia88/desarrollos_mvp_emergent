// W5.22 Z.8.6 — Template signatures: visual signature per template_key aplicable a TODAS sections
// CADA template tiene un "feel" consistente cross-section (Family warm en TODAS sus sections · Luxury serif en TODAS · etc)
//
// Cada signature define:
//   palette_dark + palette_light (paletas spirit-aware)
//   typography (heading_font · body_font · weights · letter_spacing)
//   layout (radius · spacing · cards_style)
//   tone (warm | data | exclusive | artisan | urgent | clean | cinematic | minimal | trust | compare)
//   structural_hints (sections que prefieren ciertas estructuras · ej gallery_layout · testimonial_layout)
//   copy_voice (tono de copy default sin override en theme)

export const TEMPLATE_SIGNATURES = {
  modern: {
    palette_dark: { primary: '#6366F1', secondary: '#EC4899', accent: '#F0EBE0', bg: '#06080F', text: '#F0EBE0', text_dim: 'rgba(240,235,224,0.62)', gradient: 'linear-gradient(90deg, #6366F1, #EC4899)' },
    palette_light: { primary: '#6366F1', secondary: '#EC4899', accent: '#1E1B4B', bg: '#FFFFFF', text: '#1E1B4B', text_dim: 'rgba(30,27,75,0.62)', gradient: 'linear-gradient(90deg, #6366F1, #EC4899)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 800, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.02em', body_size: '15px', line_height: 1.6 },
    layout: { radius: 16, padding: '80px 24px', card_style: 'glass', spacing_scale: 'balanced' },
    tone: 'clean',
    structural_hints: { gallery: 'masonry', testimonials: 'grid', features: 'cards', stats: 'gradient_text', map: 'standard', lead_form: 'glass_card', footer: 'standard', countdown: 'inline' },
    copy_voice: 'directo profesional',
  },
  luxury: {
    palette_dark: { primary: '#D4AF37', secondary: '#1A1A1A', accent: '#F5F0E8', bg: '#0A0A0A', text: '#F5F0E8', text_dim: 'rgba(245,240,232,0.6)', gradient: 'linear-gradient(90deg, #D4AF37, #B8941F)' },
    palette_light: { primary: '#B8941F', secondary: '#1A1A1A', accent: '#0A0A0A', bg: '#FAF7F0', text: '#1A1A1A', text_dim: 'rgba(26,26,26,0.6)', gradient: 'linear-gradient(90deg, #B8941F, #D4AF37)' },
    typography: { heading_font: "'Playfair Display', 'Outfit', serif", heading_weight: 700, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.02em', body_size: '16px', line_height: 1.7 },
    layout: { radius: 0, padding: '120px 24px', card_style: 'minimal-border', spacing_scale: 'spacious' },
    tone: 'exclusive',
    structural_hints: { gallery: 'grid-tight', testimonials: 'large-quote', features: 'alternating', stats: 'serif-large', map: 'dark-exclusive', lead_form: 'minimal-vip', footer: 'minimal', countdown: 'inline' },
    copy_voice: 'serif elegante exclusivo · time-saver',
  },
  family: {
    palette_dark: { primary: '#F97316', secondary: '#10B981', accent: '#FEF3C7', bg: '#1C1410', text: '#FEF3C7', text_dim: 'rgba(254,243,199,0.65)', gradient: 'linear-gradient(90deg, #F97316, #FBBF24)' },
    palette_light: { primary: '#EA580C', secondary: '#059669', accent: '#FEF3C7', bg: '#FEFBF6', text: '#4A2C1A', text_dim: 'rgba(74,44,26,0.62)', gradient: 'linear-gradient(90deg, #F97316, #FBBF24)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 700, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.01em', body_size: '17px', line_height: 1.7 },
    layout: { radius: 24, padding: '100px 32px', card_style: 'soft-shadow', spacing_scale: 'comfortable' },
    tone: 'warm',
    structural_hints: { gallery: 'grid-rounded', testimonials: 'photos-families', features: 'icons-warm', stats: 'cards-warm', map: 'schools-parks', lead_form: 'warm-friendly', footer: 'warm-contact', countdown: 'inline' },
    copy_voice: 'calido emocional familia hijos',
  },
  investor: {
    palette_dark: { primary: '#3B82F6', secondary: '#22C55E', accent: '#0F172A', bg: '#020617', text: '#E2E8F0', text_dim: 'rgba(226,232,240,0.6)', gradient: 'linear-gradient(90deg, #3B82F6, #22C55E)' },
    palette_light: { primary: '#2563EB', secondary: '#16A34A', accent: '#E2E8F0', bg: '#FAFBFC', text: '#1E293B', text_dim: 'rgba(30,41,59,0.62)', gradient: 'linear-gradient(90deg, #3B82F6, #22C55E)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 800, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.02em', body_size: '15px', line_height: 1.5, data_font: "'JetBrains Mono', 'Menlo', monospace" },
    layout: { radius: 8, padding: '64px 24px', card_style: 'data-card', spacing_scale: 'dense' },
    tone: 'data',
    structural_hints: { gallery: 'data-overlay', testimonials: 'numbers-only', features: 'minimal', stats: 'big-mono', map: 'cap-rate-heat', lead_form: 'investment-fields', footer: 'data-disclaimer', countdown: 'inline' },
    copy_voice: 'analitico numerico ROI',
  },
  boutique: {
    palette_dark: { primary: '#92400E', secondary: '#D97706', accent: '#FEF3C7', bg: '#1C1410', text: '#FEF3C7', text_dim: 'rgba(254,243,199,0.6)', gradient: 'linear-gradient(90deg, #92400E, #D97706)' },
    palette_light: { primary: '#92400E', secondary: '#D97706', accent: '#3B2C1A', bg: '#F7F3E9', text: '#3B2C1A', text_dim: 'rgba(59,44,26,0.62)', gradient: 'linear-gradient(90deg, #92400E, #D97706)' },
    typography: { heading_font: "'Lora', 'Playfair Display', serif", heading_weight: 600, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.01em', body_size: '16px', line_height: 1.7 },
    layout: { radius: 4, padding: '96px 32px', card_style: 'textured-paper', spacing_scale: 'comfortable' },
    tone: 'artisan',
    structural_hints: { gallery: 'polaroid-stack', testimonials: 'single-large-quote', features: 'alternating-text', stats: 'small-refined', map: 'artisan-boutiques', lead_form: 'curated', footer: 'artisan-signature', countdown: 'inline' },
    copy_voice: 'artesanal curated unico hecho-a-mano',
  },
  urgent: {
    palette_dark: { primary: '#EF4444', secondary: '#F97316', accent: '#FEE2E2', bg: '#0F0606', text: '#FEE2E2', text_dim: 'rgba(254,226,226,0.65)', gradient: 'linear-gradient(90deg, #EF4444, #F97316)' },
    palette_light: { primary: '#DC2626', secondary: '#EA580C', accent: '#7F1D1D', bg: '#FFFFFF', text: '#7F1D1D', text_dim: 'rgba(127,29,29,0.7)', gradient: 'linear-gradient(90deg, #EF4444, #F97316)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 800, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.04em', body_size: '16px', line_height: 1.5 },
    layout: { radius: 12, padding: '60px 20px', card_style: 'alert-bordered', spacing_scale: 'tight' },
    tone: 'urgent',
    structural_hints: { gallery: 'masonry-badges', testimonials: 'rapid-quotes', features: 'checkmarks-fast', stats: 'urgent-banner', map: 'buyers-zone', lead_form: 'sticky-bottom', footer: 'with-countdown', countdown: 'banner' },
    copy_voice: 'urgente scarcity se-acaba',
  },
  scrollytelling: {
    palette_dark: { primary: '#7C3AED', secondary: '#EC4899', accent: '#F0EBE0', bg: '#0A0612', text: '#F0EBE0', text_dim: 'rgba(240,235,224,0.65)', gradient: 'linear-gradient(90deg, #7C3AED, #EC4899)' },
    palette_light: { primary: '#7C3AED', secondary: '#DB2777', accent: '#2E1065', bg: '#FBF5E9', text: '#2E1065', text_dim: 'rgba(46,16,101,0.6)', gradient: 'linear-gradient(90deg, #7C3AED, #DB2777)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 700, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.02em', body_size: '18px', line_height: 1.7 },
    layout: { radius: 12, padding: '140px 48px', card_style: 'transparent-overlay', spacing_scale: 'very-spacious' },
    tone: 'cinematic',
    structural_hints: { gallery: 'fade-sequence', testimonials: 'cinematic-fullscreen', features: 'scroll-sticky', stats: 'scroll-reveal', map: 'narrative-scroll', lead_form: 'end-of-story', footer: 'cinematic-credits', countdown: 'inline' },
    copy_voice: 'narrativo cinematic profundo storytelling',
  },
  video_first: {
    palette_dark: { primary: '#FFFFFF', secondary: '#EC4899', accent: '#1A1A1A', bg: '#000000', text: '#FFFFFF', text_dim: 'rgba(255,255,255,0.7)', gradient: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.7))' },
    palette_light: { primary: '#000000', secondary: '#EC4899', accent: '#FFFFFF', bg: '#FFFFFF', text: '#0A0A0A', text_dim: 'rgba(10,10,10,0.6)', gradient: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.7))' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 800, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.03em', body_size: '16px', line_height: 1.6 },
    layout: { radius: 8, padding: '72px 24px', card_style: 'dark-translucent', spacing_scale: 'balanced' },
    tone: 'cinematic',
    structural_hints: { gallery: 'photo-video-mix', testimonials: 'video-cards', features: 'minimal-dark', stats: 'overlay-video', map: 'drone-aerial', lead_form: 'floating-callme', footer: 'video-tour-thumb', countdown: 'inline' },
    copy_voice: 'sensorial corto cinematic vive',
  },
  social_proof: {
    palette_dark: { primary: '#22C55E', secondary: '#3B82F6', accent: '#FEF3C7', bg: '#06080F', text: '#F0EBE0', text_dim: 'rgba(240,235,224,0.65)', gradient: 'linear-gradient(90deg, #22C55E, #3B82F6)' },
    palette_light: { primary: '#16A34A', secondary: '#2563EB', accent: '#064E3B', bg: '#F9FAFB', text: '#064E3B', text_dim: 'rgba(6,78,59,0.62)', gradient: 'linear-gradient(90deg, #16A34A, #2563EB)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 700, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.02em', body_size: '16px', line_height: 1.6 },
    layout: { radius: 16, padding: '80px 24px', card_style: 'testimonial-card', spacing_scale: 'balanced' },
    tone: 'trust',
    structural_hints: { gallery: 'reviews-overlay', testimonials: 'carousel-large-count', features: 'with-reviews', stats: 'social-proof-numbers', map: 'testimonios-pin', lead_form: 'join-count', footer: 'stars-count-reviews', countdown: 'inline' },
    copy_voice: 'confianza validacion social numeros',
  },
  compare: {
    palette_dark: { primary: '#6366F1', secondary: '#22C55E', accent: '#F0EBE0', bg: '#06080F', text: '#F0EBE0', text_dim: 'rgba(240,235,224,0.62)', gradient: 'linear-gradient(90deg, #6366F1, #22C55E)' },
    palette_light: { primary: '#4F46E5', secondary: '#16A34A', accent: '#1E1B4B', bg: '#FFFFFF', text: '#1E1B4B', text_dim: 'rgba(30,27,75,0.62)', gradient: 'linear-gradient(90deg, #4F46E5, #16A34A)' },
    typography: { heading_font: "'Outfit', sans-serif", heading_weight: 700, body_font: "'DM Sans', sans-serif", heading_letter_spacing: '-0.02em', body_size: '15px', line_height: 1.55 },
    layout: { radius: 12, padding: '72px 24px', card_style: 'comparison-table', spacing_scale: 'dense' },
    tone: 'compare',
    structural_hints: { gallery: 'side-by-side-vs', testimonials: 'comparison-quotes', features: 'comparison-grid', stats: 'highlighted-cols', map: 'split-vs-zone', lead_form: 'compare-yourself', footer: 'mini-comparison-cta', countdown: 'inline' },
    copy_voice: 'claro diferenciado esto-vs-eso',
  },
};

// Defaults
export const DEFAULT_MODE_PER_TEMPLATE = {
  luxury: 'dark',
  family: 'light',
  investor: 'dark',
  boutique: 'light',
  urgent: 'dark',
  modern: 'dark',
  scrollytelling: 'dark',
  video_first: 'dark',
  social_proof: 'light',
  compare: 'light',
};

/**
 * Resuelve signature efectivo para un template + mode dado.
 * Returns: { palette, typography, layout, tone, structural_hints, copy_voice }
 */
export function resolveSignature(templateKey, themeMode = 'dark') {
  const sig = TEMPLATE_SIGNATURES[templateKey] || TEMPLATE_SIGNATURES.modern;
  const palette = (themeMode === 'light' ? sig.palette_light : sig.palette_dark) || sig.palette_dark;
  return {
    palette,
    typography: sig.typography,
    layout: sig.layout,
    tone: sig.tone,
    structural_hints: sig.structural_hints,
    copy_voice: sig.copy_voice,
    mode: themeMode,
  };
}

// Helper: build theme-merged styles que cualquier section puede consumir
export function buildSectionStyle(signature, themeFromBackend = {}, overrides = {}) {
  const sig = signature || resolveSignature('modern', 'dark');
  // Theme backend tiene precedence si está hidratado (para Z.8.3 retrocompat)
  // pero signature.palette gana sobre theme.palette para asegurar consistency cross-section
  const palette = { ...(themeFromBackend.palette || {}), ...(sig.palette || {}) };
  const typography = { ...(themeFromBackend.typography || {}), ...(sig.typography || {}) };
  const layout = { ...(themeFromBackend.layout || {}), ...(sig.layout || {}) };
  return {
    palette,
    typography,
    layout,
    tone: sig.tone,
    structural_hints: sig.structural_hints,
    mode: sig.mode,
    ...overrides,
  };
}
