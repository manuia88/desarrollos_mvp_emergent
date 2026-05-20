// W5.22 Z.8.2 — LeadFormSection: multi-step (1-3 steps · progress bar) · dynamic fields
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function LeadFormSection({ config = {}, brandKit = {}, onLead, isPreview }) {
  const { t } = useTranslation('common');
  const fields = config.fields || [];
  const steps = Math.max(1, Math.min(config.steps || 1, 3));
  const submitText = config.submit_text || t('common.send') || 'Enviar';
  const successMsg = config.success_message || 'Gracias. Te contactamos pronto.';
  const headline = config.headline || 'Reserva tu visita';
  const subhead = config.subhead || '';
  const primary = brandKit.color_primary || '#6366F1';
  const secondary = brandKit.color_secondary || '#EC4899';
  const grad = `linear-gradient(90deg, ${primary}, ${secondary})`;

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

  return (
    <section id="lead-form-anchor" data-testid="sec-lead-form" style={{ padding: '5rem 1.5rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, padding: 28 }}>
        {headline && <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', textAlign: 'center' }}>{headline}</h2>}
        {subhead && <p style={{ marginTop: 8, marginBottom: 24, color: 'rgba(240,235,224,0.62)', textAlign: 'center' }}>{subhead}</p>}
        {steps > 1 && (
          <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ width: `${((step + 1) / stepGroups.length) * 100}%`, height: '100%', background: grad, transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
          </div>
        )}
        {submitted ? (
          <div data-testid="lead-form-success" style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 9999, background: grad, display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: '#fff', fontSize: 24, fontWeight: 800 }}>✓</div>
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif' }}>{successMsg}</h3>
          </div>
        ) : (
          <form data-testid="lead-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            {(stepGroups[step] || []).map((f, i) => (
              <div key={i}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'rgba(240,235,224,0.7)' }}>
                  {f.label}{f.required && <span style={{ color: secondary, marginLeft: 4 }}>*</span>}
                </label>
                {f.type === 'select' ? (
                  <select data-testid={`field-${f.name}`} required={!!f.required} value={vals[f.name] || ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#F0EBE0', fontSize: 15 }}>
                    <option value="">--</option>
                    {(f.options || []).map((o, j) => <option key={j} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input data-testid={`field-${f.name}`} type={f.type === 'phone' ? 'tel' : (f.type || 'text')} required={!!f.required} value={vals[f.name] || ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#F0EBE0', fontSize: 15 }} />
                )}
              </div>
            ))}
            {error && <div style={{ color: '#F87171', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} style={{ padding: '12px 20px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', fontWeight: 600 }}>Atras</button>
              )}
              <button data-testid="lead-form-submit" type="submit" disabled={loading} style={{ flex: 1, padding: '12px 24px', background: grad, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}>
                {loading ? '…' : (step < stepGroups.length - 1 ? 'Siguiente' : submitText)}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
