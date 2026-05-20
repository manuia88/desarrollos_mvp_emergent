// W5.22 Z.8.7 Sub-B2 · Scrollytelling Template · capítulos full-height parallax · cinemático · 70% Brunson
// Consume schema LLM completo de memory/Z8_PROMPT_10_SCROLLYTELLING.md
import React, { useState } from 'react';

const PAL = { bg: '#0F0A1F', bgSoft: '#1F1438', ink: '#F5F3FF', dim: 'rgba(245,243,255,0.65)', faint: 'rgba(245,243,255,0.4)', purple: '#7C3AED', accent: '#E879F9', cream: '#FBF5E9' };
const HEAD = "'Outfit', sans-serif";
const BODY = "'Inter', 'DM Sans', sans-serif";

export default function ScrollytellingTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];

  const preface = copy?.preface || { text: 'Este no es un brochure. Es un recorrido. Te tomará 6 minutos. Después no podrás verlo igual.' };
  const chapters = copy?.chapters?.length > 0 ? copy.chapters : [
    { number: '01', title: 'La visión', body: copy?.story_arc?.intro || '', cliffhanger: '↓' },
    { number: '02', title: 'El lugar', body: copy?.story_arc?.body || '', cliffhanger: '↓' },
    { number: '03', title: 'El arquitecto', body: copy?.story_arc?.closing || '', cliffhanger: '↓' },
  ];
  const ps = copy?.ps_cinematographic || copy?.ps || {};
  const leadForm = copy?.lead_form_at_chapter_6_or_7 || copy?.lead_form_copy || {};
  const faq = copy?.faq_optional_after_chapters || copy?.faq || [];
  const footer = copy?.footer_text_minimal || copy?.footer_text;

  return (
    <div data-testid="tpl-z87-scrollytelling" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh' }}>
      {/* Preface */}
      <section style={{ height: '60vh', display: 'grid', placeItems: 'center', padding: '0 2rem', textAlign: 'center', background: `linear-gradient(180deg, ${PAL.bg}, ${PAL.bgSoft})` }}>
        <p style={{ fontFamily: HEAD, fontSize: 'clamp(1.2rem, 2vw, 1.8rem)', fontStyle: 'italic', color: PAL.dim, maxWidth: 720, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{typeof preface === 'string' ? preface : preface.text}</p>
      </section>

      {chapters.map((c, i) => {
        const bg = c.background_media?.url || photos[i % photos.length]?.url;
        return (
          <section key={i} style={{ minHeight: '90vh', position: 'relative', display: 'flex', alignItems: 'center', padding: '6rem 2rem' }}>
            {bg && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(15,10,31,0.4), rgba(15,10,31,0.85)), url(${bg}) center/cover` }} />}
            <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
              <div style={{ fontFamily: HEAD, fontSize: 14, color: PAL.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 18, fontWeight: 700 }}>Capítulo {c.number || String(i + 1).padStart(2, '0')}</div>
              <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(2.5rem, 6vw, 5rem)', fontWeight: 900, margin: 0, lineHeight: 0.95, color: '#fff' }}>{c.title}</h2>
              {c.subtitle && <p style={{ marginTop: 16, fontFamily: HEAD, fontStyle: 'italic', color: PAL.cream, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)' }}>{c.subtitle}</p>}
              {c.body && <p style={{ marginTop: 32, fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{c.body}</p>}

              {c.stack_items_integrated?.length > 0 && (
                <div style={{ marginTop: 40, display: 'grid', gap: 14, textAlign: 'left' }}>
                  {c.stack_items_integrated.map((it, j) => (
                    <div key={j} style={{ background: 'rgba(255,255,255,0.06)', padding: 20, borderRadius: 12, borderLeft: `3px solid ${PAL.accent}` }}>
                      <h4 style={{ margin: 0, fontFamily: HEAD, fontWeight: 700, color: PAL.cream, fontSize: 16 }}>{it.title}</h4>
                      <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.6, fontSize: 14 }}>{it.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {c.cliffhanger && <p style={{ marginTop: 48, fontFamily: HEAD, fontStyle: 'italic', color: PAL.accent, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontWeight: 500 }}>{c.cliffhanger}</p>}
              {c.cta_inline && <a href="#chapter-form" style={{ display: 'inline-block', marginTop: 24, padding: '14px 32px', background: PAL.purple, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontFamily: HEAD, fontWeight: 700, fontSize: 15 }}>{c.cta_inline.label || c.cta_inline}</a>}
            </div>
          </section>
        );
      })}

      <section id="chapter-form" data-testid="lead-form-section" style={{ padding: '6rem 2rem', textAlign: 'center', background: `linear-gradient(180deg, ${PAL.bg}, #000)` }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 900, margin: 0, color: '#fff' }}>{leadForm.intro || 'Tu capítulo empieza ahora'}</h2>
          <p style={{ marginTop: 16, color: PAL.dim }}>{leadForm.subtitle || 'Tres datos. Inicias la conversación.'}</p>
          <ScrollyForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 18, color: PAL.faint, fontSize: 12 }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {faq.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 760, margin: '0 auto' }}>
          {faq.map((f, i) => (
            <details key={i} style={{ background: PAL.bgSoft, borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 700, color: PAL.cream, listStyle: 'none' }}>{f.q}</summary>
              <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '4rem 2rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          {ps.body && <p style={{ fontFamily: HEAD, fontStyle: 'italic', color: PAL.cream, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 16 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 20, color: PAL.accent, fontFamily: HEAD, fontSize: 13, fontStyle: 'italic' }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.faint, fontSize: 11, fontFamily: HEAD, fontStyle: 'italic' }}>{footer || `${intake.developer_name || ''} · ${intake.project_name || ''} · LFPDPPP`}</footer>
    </div>
  );
}

function ScrollyForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'email', label: 'Correo electrónico', required: true, type: 'email' },
    { id: 'what_resonated', label: '¿Qué capítulo resonó más?', type: 'select', options: ['La visión', 'El lugar', 'El arquitecto', 'Todos'] },
  ];
  const [state, setState] = useState({});
  const [sent, setSent] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) { setSent(true); return; }
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/studio/property-intake/public/${slug}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ payload: state }) });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ background: PAL.purple, padding: 20, borderRadius: 12, textAlign: 'center', color: '#fff', fontFamily: 'inherit' }}>Capítulo iniciado. {advisor.full_name || 'El equipo'} responde con dossier completo.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 28 }}>
      {fields.map((f) => (
        <label key={f.id}>
          <span style={{ display: 'block', fontFamily: HEAD, fontSize: 12, color: PAL.dim, marginBottom: 6, letterSpacing: '0.05em' }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 14, background: PAL.bgSoft, border: `1px solid rgba(245,243,255,0.2)`, borderRadius: 10, color: '#fff', fontSize: 14 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o} style={{ color: PAL.ink, background: PAL.bgSoft }}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 14, background: PAL.bgSoft, border: `1px solid rgba(245,243,255,0.2)`, borderRadius: 10, color: '#fff', fontSize: 14 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 8, padding: '16px 32px', background: PAL.accent, color: PAL.bg, border: 'none', borderRadius: 9999, fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>{leadForm.submit_label || 'Iniciar mi capítulo'}</button>
    </form>
  );
}
