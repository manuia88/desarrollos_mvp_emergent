// W5.22 Z.8 — LandingLeadForm: render dinamico fields desde landing.content.lead_form
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function LandingLeadForm({ landing, onLead, isPreview }) {
  const { t } = useTranslation('common');
  const c = landing.content || {};
  const lf = c.lead_form || { fields: [], submit_text: 'Enviar', success_message: 'Gracias.' };
  const [vals, setVals] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) {
      setSubmitted(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await onLead(vals);
      if (r?.ok) {
        setSubmitted(true);
      } else {
        setError(r?.message || t('studio.landings.lead_form_error'));
      }
    } catch (err) {
      if (err?.status === 429) setError(t('studio.landings.lead_form_rate_limited'));
      else setError(t('studio.landings.lead_form_error'));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div data-testid="lead-form-success" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', padding: 32, background: 'rgba(99,102,241,0.08)', borderRadius: 16, border: '1px solid rgba(99,102,241,0.2)' }}>
        <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif' }}>{lf.success_message || t('studio.landings.lead_form_thanks')}</h3>
      </div>
    );
  }

  return (
    <form data-testid="lead-form" onSubmit={handleSubmit} style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gap: 14 }}>
      {(lf.fields || []).map((f, i) => (
        <div key={i}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
            {f.label}{f.required && <span style={{ color: secondary, marginLeft: 4 }}>*</span>}
          </label>
          {f.type === 'select' ? (
            <select
              data-testid={`lead-form-${f.name}`}
              required={!!f.required}
              value={vals[f.name] || ''}
              onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 15 }}
            >
              <option value="">--</option>
              {(f.options || []).map((o, j) => (
                <option key={j} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              data-testid={`lead-form-${f.name}`}
              type={f.type === 'phone' ? 'tel' : (f.type || 'text')}
              required={!!f.required}
              value={vals[f.name] || ''}
              onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 15 }}
            />
          )}
        </div>
      ))}
      {error && <div data-testid="lead-form-error" style={{ color: '#F87171', fontSize: 13 }}>{error}</div>}
      <button
        data-testid="lead-form-submit"
        type="submit"
        disabled={loading}
        style={{
          marginTop: 8, padding: '14px 24px',
          background: `linear-gradient(90deg, ${primary}, ${secondary})`,
          color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '…' : (lf.submit_text || t('common.send'))}
      </button>
    </form>
  );
}
