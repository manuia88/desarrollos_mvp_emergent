// W5.22 Z.8 — LandingContentEditor: tabs editor (hero · stats · features · testimonials · cta · form · extras)
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LandingLeadFormConfig from './LandingLeadFormConfig';

const TABS = ['hero', 'stats', 'features', 'testimonials', 'cta', 'lead_form', 'extras'];

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#F0EBE0',
  fontSize: 14,
};

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ fontSize: 12, color: '#a0a4b0' }}>{label}</label>
      {children}
    </div>
  );
}

export default function LandingContentEditor({ content, onChange }) {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState('hero');
  const c = content || {};

  const update = (path, value) => {
    // simple deep-set for known shapes
    const next = JSON.parse(JSON.stringify(c));
    const keys = path.split('.');
    let cur = next;
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!cur[keys[i]]) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
    onChange(next);
  };

  const updateArrayItem = (key, idx, patch) => {
    const next = [...(c[key] || [])];
    next[idx] = { ...next[idx], ...patch };
    update(key, next);
  };
  const addArrayItem = (key, blank) => update(key, [...(c[key] || []), blank]);
  const removeArrayItem = (key, idx) => {
    const next = [...(c[key] || [])];
    next.splice(idx, 1);
    update(key, next);
  };

  return (
    <div data-testid="content-editor" style={{ display: 'grid', gap: 16 }}>
      <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid rgba(99,102,241,0.18)' }}>
        {TABS.map((tk) => (
          <button
            key={tk}
            type="button"
            data-testid={`editor-tab-${tk}`}
            onClick={() => setTab(tk)}
            style={{
              padding: '8px 14px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
              background: tab === tk ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: tab === tk ? '#F0EBE0' : '#a0a4b0',
              border: 'none',
              borderBottom: tab === tk ? '2px solid #6366F1' : '2px solid transparent',
              fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13,
            }}
          >
            {t(`studio.landings.tab_${tk}`)}
          </button>
        ))}
      </div>

      {tab === 'hero' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label={t('studio.landings.field_title')}>
            <input data-testid="hero-title-input" style={inputStyle} value={c.hero?.title || ''} onChange={(e) => update('hero.title', e.target.value)} />
          </Field>
          <Field label={t('studio.landings.field_subtitle')}>
            <textarea data-testid="hero-subtitle-input" style={{ ...inputStyle, minHeight: 80 }} value={c.hero?.subtitle || ''} onChange={(e) => update('hero.subtitle', e.target.value)} />
          </Field>
          <Field label="Background image URL (R2 key)">
            <input data-testid="hero-bg-image" style={inputStyle} value={c.hero?.bg_image_r2_key || ''} onChange={(e) => update('hero.bg_image_r2_key', e.target.value)} />
          </Field>
          <Field label="Background video URL (R2 key · solo VideoFirst)">
            <input data-testid="hero-bg-video" style={inputStyle} value={c.hero?.bg_video_r2_key || ''} onChange={(e) => update('hero.bg_video_r2_key', e.target.value)} />
          </Field>
        </div>
      )}

      {tab === 'stats' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(c.stats || []).map((s, i) => (
            <div key={i} data-testid={`stat-row-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8 }}>
              <input style={inputStyle} placeholder={t('studio.landings.stat_label_placeholder')} value={s.label || ''} onChange={(e) => updateArrayItem('stats', i, { label: e.target.value })} />
              <input style={inputStyle} placeholder={t('studio.landings.stat_value_placeholder')} value={s.value || ''} onChange={(e) => updateArrayItem('stats', i, { value: e.target.value })} />
              <button type="button" data-testid={`stat-remove-${i}`} onClick={() => removeArrayItem('stats', i)} style={{ background: 'transparent', color: '#F87171', border: 'none', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button type="button" data-testid="stat-add" onClick={() => addArrayItem('stats', { label: '', value: '' })} style={{ marginTop: 4, padding: '8px 14px', background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 600, justifySelf: 'start' }}>+ Stat</button>
        </div>
      )}

      {tab === 'features' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(c.features || []).map((f, i) => (
            <div key={i} data-testid={`feature-row-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 36px', gap: 8 }}>
              <input style={inputStyle} placeholder={t('studio.landings.feature_title_placeholder')} value={f.title || ''} onChange={(e) => updateArrayItem('features', i, { title: e.target.value })} />
              <input style={inputStyle} placeholder={t('studio.landings.feature_desc_placeholder')} value={f.description || ''} onChange={(e) => updateArrayItem('features', i, { description: e.target.value })} />
              <button type="button" data-testid={`feature-remove-${i}`} onClick={() => removeArrayItem('features', i)} style={{ background: 'transparent', color: '#F87171', border: 'none', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button type="button" data-testid="feature-add" onClick={() => addArrayItem('features', { title: '', description: '', icon: 'Sparkles' })} style={{ marginTop: 4, padding: '8px 14px', background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 600, justifySelf: 'start' }}>+ Feature</button>
        </div>
      )}

      {tab === 'testimonials' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(c.testimonials || []).map((tst, i) => (
            <div key={i} data-testid={`testimonial-row-${i}`} style={{ display: 'grid', gap: 6, padding: 12, background: 'rgba(13,16,23,0.55)', borderRadius: 10 }}>
              <input style={inputStyle} placeholder={t('studio.landings.testimonial_author')} value={tst.author || ''} onChange={(e) => updateArrayItem('testimonials', i, { author: e.target.value })} />
              <input style={inputStyle} placeholder={t('studio.landings.testimonial_role')} value={tst.role || ''} onChange={(e) => updateArrayItem('testimonials', i, { role: e.target.value })} />
              <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder={t('studio.landings.testimonial_quote')} value={tst.quote || ''} onChange={(e) => updateArrayItem('testimonials', i, { quote: e.target.value })} />
              <button type="button" data-testid={`testimonial-remove-${i}`} onClick={() => removeArrayItem('testimonials', i)} style={{ alignSelf: 'flex-end', background: 'transparent', color: '#F87171', border: 'none', cursor: 'pointer' }}>Quitar</button>
            </div>
          ))}
          <button type="button" data-testid="testimonial-add" onClick={() => addArrayItem('testimonials', { author: '', role: '', quote: '' })} style={{ marginTop: 4, padding: '8px 14px', background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 600, justifySelf: 'start' }}>+ Testimonio</button>
        </div>
      )}

      {tab === 'cta' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label={t('studio.landings.cta_primary_text')}>
            <input data-testid="cta-primary-text" style={inputStyle} value={c.cta?.primary?.text || ''} onChange={(e) => update('cta.primary.text', e.target.value)} />
          </Field>
          <Field label={t('studio.landings.cta_secondary_text')}>
            <input data-testid="cta-secondary-text" style={inputStyle} value={c.cta?.secondary?.text || ''} onChange={(e) => update('cta.secondary.text', e.target.value)} />
          </Field>
        </div>
      )}

      {tab === 'lead_form' && (
        <LandingLeadFormConfig leadForm={c.lead_form} onChange={(lf) => update('lead_form', lf)} />
      )}

      {tab === 'extras' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <label data-testid="extras-atlax" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#F0EBE0', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!c.atlax_widget_enabled} onChange={(e) => update('atlax_widget_enabled', e.target.checked)} />
            {t('studio.landings.extras_atlax')}
          </label>
          <label data-testid="extras-pdf" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#F0EBE0', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!c.brochure_pdf_enabled} onChange={(e) => update('brochure_pdf_enabled', e.target.checked)} />
            {t('studio.landings.extras_pdf')}
          </label>
          <Field label={t('studio.landings.extras_urgent_expires')}>
            <input data-testid="extras-urgent-expires" type="datetime-local" style={inputStyle} value={c.urgent_expires_at || ''} onChange={(e) => update('urgent_expires_at', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}
