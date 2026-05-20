// W5.22 Z.8.3 — LeadForm · theme-aware multi-step (1-3 steps · progress bar)
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function LeadFormSection({ config = {}, brandKit = {}, onLead, isPreview, theme = {} }) {
  const { t } = useTranslation('common');
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};

  const fields = config.fields || [];
  const steps = Math.max(1, Math.min(config.steps || 1, 3));
  const submitText = config.submit_text || t('common.send') || 'Enviar';
  const successMsg = config.success_message || 'Gracias. Te contactamos pronto.';
  const headline = config.headline || 'Reserva tu visita';
  const subhead = config.subhead || '';

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

  return (
    <section id="lead-form-anchor" data-testid="sec-lead-form" style={{ padding: sectionPadding, maxWidth: 560, margin: '0 auto', fontFamily: bodyFont }}>
      <div style={{ background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)', border: `1px solid ${themePrimary}33`, borderRadius: radius, padding: 28 }}>
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
