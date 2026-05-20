// W5.22 Z.8.3 — LeadForm · theme-aware multi-step (1-3 steps · progress bar)
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Z.8.6 — CTA + headline + subhead defaults per template signature (consistency cross-section)
const TEMPLATE_LEAD_DEFAULTS = {
  luxury: { headline: 'Tour privado VIP', subhead: 'Coordinamos un acompañamiento personalizado en 24h', cta: 'Solicitar tour VIP' },
  family: { headline: 'Agenda visita en familia', subhead: 'Te recibimos un sábado · perfecto para conocer la zona', cta: 'Agenda visita en familia' },
  investor: { headline: 'Descarga la proyección PDF', subhead: 'Recibe los modelos ROI 5/10/15 años + cap rate calculado', cta: 'Descarga proyección PDF' },
  boutique: { headline: 'Conoce la historia detrás', subhead: 'Conversamos sobre el proceso curatorial y el arquitecto', cta: 'Conoce la historia' },
  urgent: { headline: 'Reserva antes que se acabe', subhead: 'Bloquea tu unidad 72h sin compromiso', cta: 'Reservar ahora' },
  scrollytelling: { headline: 'Sé parte de la historia', subhead: 'Te contactamos para continuar la conversación', cta: 'Sé parte de la historia' },
  video_first: { headline: 'Te llamo para un tour', subhead: 'Dejame tu numero · te coordino video-tour 1:1', cta: 'Agenda video-tour' },
  social_proof: { headline: 'Únete a los que ya confiaron', subhead: '200+ familias DMX validan nuestro proceso', cta: 'Quiero ser parte' },
  compare: { headline: 'Compáralo tú mismo', subhead: 'Recibe la tabla detallada vs los proyectos vecinos', cta: 'Ver comparativa' },
  modern: { headline: 'Reserva tu visita', subhead: 'Te confirmamos en menos de 24h', cta: 'Reservar visita' },
};

// Per-template field sets (investor pide horizonte inversion · family pide hijos · etc)
const TEMPLATE_LEAD_FIELDS = {
  investor: [
    { name: 'nombre', type: 'text', label: 'Nombre', required: true },
    { name: 'email', type: 'email', label: 'Correo', required: true },
    { name: 'telefono', type: 'phone', label: 'WhatsApp', required: true },
    { name: 'horizonte', type: 'select', label: 'Horizonte inversion', required: false, options: ['1-2 años (flip)', '3-5 años (renta + venta)', '10+ años (patrimonio)'] },
    { name: 'capital', type: 'select', label: 'Capital disponible', required: false, options: ['$2M-$5M', '$5M-$10M', '$10M+'] },
  ],
  family: [
    { name: 'nombre', type: 'text', label: 'Nombre', required: true },
    { name: 'email', type: 'email', label: 'Correo', required: true },
    { name: 'telefono', type: 'phone', label: 'Telefono', required: true },
    { name: 'hijos', type: 'select', label: 'Hijos / edades', required: false, options: ['Sin hijos', '0-5 años', '6-12 años', '13-18 años', 'Mixto'] },
    { name: 'mensaje', type: 'text', label: '¿Qué buscas en una casa?', required: false },
  ],
  urgent: [
    { name: 'nombre', type: 'text', label: 'Nombre', required: true },
    { name: 'telefono', type: 'phone', label: 'WhatsApp · te llamo en 5 min', required: true },
  ],
  luxury: [
    { name: 'nombre', type: 'text', label: 'Nombre completo', required: true },
    { name: 'email', type: 'email', label: 'Correo privado', required: true },
    { name: 'telefono', type: 'phone', label: 'WhatsApp', required: true },
    { name: 'preferencia', type: 'select', label: 'Horario tour', required: false, options: ['Mañana', 'Tarde', 'Solicito noche'] },
  ],
};

export default function LeadFormSection({ config = {}, brandKit = {}, onLead, isPreview, theme = {}, templateKey }) {
  const { t } = useTranslation('common');
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};
  const variant = sectionVariants.lead_form || 'glass_card';

  // Z.8.6 — template defaults solo si user no override (config.X tiene precedence)
  const tplDef = TEMPLATE_LEAD_DEFAULTS[templateKey] || TEMPLATE_LEAD_DEFAULTS.modern;
  const tplFields = TEMPLATE_LEAD_FIELDS[templateKey];

  const fields = config.fields && config.fields.length ? config.fields : (tplFields || []);
  const steps = Math.max(1, Math.min(config.steps || 1, 3));
  const submitText = config.submit_text || tplDef.cta || t('common.send') || 'Enviar';
  const successMsg = config.success_message || 'Gracias. Te contactamos pronto.';
  const headline = config.headline || tplDef.headline || 'Reserva tu visita';
  const subhead = config.subhead || tplDef.subhead || '';

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(90deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.7)';
  const radius = parseInt(layout.border_radius || '20', 10) || 0;
  const sectionPadding = layout.section_padding || '5rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  const [step, setStep] = useState(0);
  const [vals, setVals] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stepGroups = useMemo(() => {
    if (steps === 1) return [fields];
    const chunks = [];
    const size = Math.ceil(fields.length / steps);
    for (let i = 0; i < fields.length; i += size) {
      chunks.push(fields.slice(i, i + size));
    }
    return chunks;
  }, [fields, steps]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < stepGroups.length - 1) {
      setStep(step + 1);
      return;
    }
    if (isPreview) {
      setSubmitted(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await onLead(vals);
      if (r?.ok) setSubmitted(true);
      else setError(r?.message || 'Error al enviar');
    } catch (err) {
      if (err?.status === 429) setError('Demasiados envios. Espera un minuto.');
      else setError('No pudimos enviar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: Math.max(radius / 2, 10),
    border: `1px solid ${themePrimary}33`,
    background: 'rgba(255,255,255,0.04)',
    color: text,
    fontSize: 15,
    fontFamily: bodyFont,
  };

  // Z.8.6 · sticky-bottom (urgent) · floating (video_first) · minimal-vip (luxury) variants
  const isSticky = variant === 'sticky-bottom' || templateKey === 'urgent';
  const isFloating = variant === 'floating-callme' || templateKey === 'video_first';
  const isMinimalVIP = variant === 'minimal-vip' || templateKey === 'luxury';

  const wrapStyle = isSticky
    ? { position: 'sticky', bottom: 0, padding: '16px 12px', background: palette.bg || 'rgba(15,6,6,0.95)', borderTop: `2px solid ${themePrimary}`, zIndex: 50, fontFamily: bodyFont }
    : isFloating
      ? { padding: sectionPadding, maxWidth: 480, margin: '0 auto', fontFamily: bodyFont }
      : { padding: sectionPadding, maxWidth: 560, margin: '0 auto', fontFamily: bodyFont };

  return (
    <section id="lead-form-anchor" data-testid="sec-lead-form" data-variant={variant} style={wrapStyle}>
      <div style={{ background: isMinimalVIP ? 'transparent' : (isSticky ? 'transparent' : 'rgba(13,16,23,0.92)'), backdropFilter: isSticky || isMinimalVIP ? 'none' : 'blur(24px)', border: isMinimalVIP ? `1px solid ${themePrimary}` : (isSticky ? 'none' : `1px solid ${themePrimary}33`), borderRadius: isMinimalVIP ? 0 : radius, padding: isSticky ? 0 : (isMinimalVIP ? 40 : 28) }}>
        {headline && <h2 style={{ margin: 0, fontFamily: headingFont, fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', textAlign: 'center', color: text }}>{headline}</h2>}
        {subhead && <p style={{ marginTop: 8, marginBottom: 24, color: textDim, textAlign: 'center' }}>{subhead}</p>}
        {steps > 1 && (
          <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ width: `${((step + 1) / stepGroups.length) * 100}%`, height: '100%', background: grad, transition: `width ${theme.animation?.duration || '320ms'} ${theme.animation?.transition_curve || 'cubic-bezier(0.22, 1, 0.36, 1)'}` }} />
          </div>
        )}
        {submitted ? (
          <div data-testid="lead-form-success" style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 9999, background: grad, display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: '#fff', fontSize: 24, fontWeight: 800 }}>✓</div>
            <h3 style={{ margin: 0, fontFamily: headingFont, color: text }}>{successMsg}</h3>
          </div>
        ) : (
          <form data-testid="lead-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            {(stepGroups[step] || []).map((f, i) => (
              <div key={i}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: textDim }}>
                  {f.label}{f.required && <span style={{ color: themeSecondary, marginLeft: 4 }}>*</span>}
                </label>
                {f.type === 'select' ? (
                  <select data-testid={`field-${f.name}`} required={!!f.required} value={vals[f.name] || ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} style={inputStyle}>
                    <option value="">--</option>
                    {(f.options || []).map((o, j) => <option key={j} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input data-testid={`field-${f.name}`} type={f.type === 'phone' ? 'tel' : (f.type || 'text')} required={!!f.required} value={vals[f.name] || ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} style={inputStyle} />
                )}
              </div>
            ))}
            {error && <div style={{ color: '#F87171', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} style={{ padding: '12px 20px', borderRadius: 9999, background: `${themePrimary}1f`, color: text, border: `1px solid ${themePrimary}55`, cursor: 'pointer', fontWeight: 600, fontFamily: bodyFont }}>Atras</button>
              )}
              <button data-testid="lead-form-submit" type="submit" disabled={loading} style={{ flex: 1, padding: '12px 24px', background: grad, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer', fontFamily: bodyFont }}>
                {loading ? '…' : (step < stepGroups.length - 1 ? 'Siguiente' : submitText)}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
