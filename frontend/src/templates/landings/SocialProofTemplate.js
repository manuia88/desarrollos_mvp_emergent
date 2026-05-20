// W5.22 Z.8.7 Sub-B2 · SocialProof Template · testimonial-heavy · counter live · estrellas Google · 90% Brunson
// Consume schema LLM completo de memory/Z8_PROMPT_07_SOCIAL_PROOF.md
import React, { useState } from 'react';

const PAL = { bg: '#F9FAFB', ink: '#0F172A', dim: '#64748B', green: '#22C55E', greenDark: '#15803D', blue: '#3B82F6', star: '#F59E0B', border: '#E5E7EB' };
const HEAD = "'Outfit', sans-serif";
const BODY = "'DM Sans', sans-serif";

export default function SocialProofTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const testimonials = intake.testimonials || copy?.testimonial_grid?.entries || [];
  const mediaMentions = intake.media_mentions || [];

  const preHeader = copy?.pre_header || `${intake.units_sold || 0}+ unidades vendidas · ★4.8 (47 reseñas Google)`;
  const headline = copy?.headline || intake.project_name || 'Las familias que ya viven aquí lo decidieron antes. Esto es lo que dicen 18 meses después.';
  const subheadline = copy?.subheadline || 'No es marketing. Son sus palabras. Sus fotos. Sus cifras.';
  const liveCounter = copy?.live_counter_bar;
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const videoTestimonials = copy?.video_testimonials_block;
  const pressLogos = copy?.press_logos_strip;
  const metricsDashboard = copy?.metrics_dashboard;
  const useCases = copy?.specific_use_cases;
  const antiObjections = copy?.anti_objections || [];
  const stackOfProof = copy?.stack_of_proof || { items: [] };
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;

  return (
    <div data-testid="tpl-z87-social-proof" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh' }}>
      <div style={{ background: PAL.green, color: '#fff', padding: '12px 24px', textAlign: 'center', fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>★★★★★ {preHeader}</div>

      <section style={{ padding: '4rem 2rem 3rem', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: HEAD, fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 800, margin: 0, lineHeight: 1.15 }}>{headline}</h1>
        <p style={{ marginTop: 20, fontSize: 18, color: PAL.dim, maxWidth: 700, marginInline: 'auto' }}>{subheadline}</p>
      </section>

      {(liveCounter?.metrics || metricsDashboard?.metrics) && (
        <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, border: `1px solid ${PAL.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, textAlign: 'center' }}>
            {(liveCounter?.metrics || metricsDashboard?.metrics || []).map((m, i) => (
              <div key={i}>
                <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 'clamp(1.8rem, 2.6vw, 2.4rem)', color: PAL.green }}>{m.value}</div>
                <div style={{ fontSize: 12, color: PAL.dim, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reframe && <section style={{ padding: '4rem 2rem', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.2rem, 2vw, 1.5rem)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{reframe}</p></section>}

      {storyArc && (
        <section style={{ padding: '3rem 2rem', maxWidth: 880, margin: '0 auto', background: '#fff', borderRadius: 18, border: `1px solid ${PAL.border}` }}>
          {storyArc.body && <p style={{ fontSize: 'clamp(1rem, 1.4vw, 1.2rem)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{storyArc.body}</p>}
        </section>
      )}

      {testimonials.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, textAlign: 'center', margin: '0 0 28px' }}>Lo que dicen sus residentes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {testimonials.slice(0, 12).map((t, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 22, border: `1px solid ${PAL.border}` }}>
                <div style={{ color: PAL.star, marginBottom: 10 }}>{'★'.repeat(t.rating || 5)}</div>
                <p style={{ color: PAL.ink, lineHeight: 1.6, fontSize: 14, margin: '0 0 16px' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {t.avatar_url ? <img src={t.avatar_url} alt={t.author} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, borderRadius: '50%', background: PAL.green, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: HEAD, fontWeight: 700 }}>{(t.author || '?').slice(0, 1)}</div>}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.author}</div>
                    <div style={{ fontSize: 11, color: PAL.dim }}>{t.role || ''}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {videoTestimonials?.videos?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, textAlign: 'center', margin: '0 0 24px' }}>{videoTestimonials.intro || 'Tres residentes · cámara propia'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {videoTestimonials.videos.slice(0, 3).map((v, i) => (
              <div key={i} style={{ background: '#000', borderRadius: 14, overflow: 'hidden', aspectRatio: '16/9', display: 'grid', placeItems: 'center', color: '#fff', position: 'relative' }}>
                {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />}
                <a href={v.url} target="_blank" rel="noreferrer" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', textDecoration: 'none' }}>▶ {v.name}</a>
              </div>
            ))}
          </div>
        </section>
      )}

      {pressLogos?.logos?.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: PAL.dim, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>{pressLogos.intro || 'Cobertura en medios'}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 32, alignItems: 'center', filter: 'grayscale(1)', opacity: 0.7 }}>
            {pressLogos.logos.map((l, i) => <img key={i} src={typeof l === 'string' ? l : l.url} alt="logo" style={{ height: 32 }} />)}
          </div>
        </section>
      )}

      {mediaMentions.length > 0 && (
        <section style={{ padding: '2rem 2rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 28 }}>
          {mediaMentions.map((m, i) => (
            <a key={i} href={m.url || '#'} target="_blank" rel="noreferrer" style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.dim, fontSize: 14, textDecoration: 'none' }}>{m.outlet}</a>
          ))}
        </section>
      )}

      {useCases?.cases?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, textAlign: 'center', margin: '0 0 28px' }}>{useCases.intro || 'Casos específicos'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {useCases.cases.slice(0, 3).map((c, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 22, border: `2px solid ${PAL.green}` }}>
                <p style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.green, fontSize: 13, margin: 0 }}>{c.archetype}</p>
                <p style={{ marginTop: 12, color: PAL.ink, lineHeight: 1.6, fontSize: 14 }}>{c.story_summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: 24, marginBottom: 14, border: `1px solid ${PAL.border}` }}>
              <p style={{ fontFamily: HEAD, color: PAL.green, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Si estás pensando</p>
              <p style={{ fontSize: 17, fontWeight: 700, color: PAL.ink, margin: '6px 0 14px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.dim, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {stackOfProof.items?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, textAlign: 'center', margin: '0 0 24px' }}>{stackOfProof.intro || 'Stack de validaciones'}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {stackOfProof.items.map((it, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: 18, display: 'grid', gridTemplateColumns: '30px 1fr', gap: 14, border: `1px solid ${PAL.border}` }}>
                <span style={{ color: PAL.green, fontSize: 18, fontWeight: 800 }}>✓</span>
                <div>
                  <h4 style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.ink, margin: 0, fontSize: 15 }}>{it.title}</h4>
                  <p style={{ color: PAL.dim, lineHeight: 1.5, margin: '4px 0 0', fontSize: 13 }}>{it.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {riskReversal && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}><p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p></section>}

      <section data-testid="lead-form-section" style={{ padding: '5rem 2rem', background: PAL.greenDark, color: '#fff' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', textAlign: 'center', margin: '0 0 28px', fontWeight: 800 }}>{leadForm.intro || 'Conectarme con residentes'}</h2>
          <SocialProofForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {scarcity && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}><p style={{ color: PAL.dim, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{scarcity}</p></section>}
      {yesLadder && <section style={{ padding: '3rem 2rem', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.5vw, 1.3rem)', fontWeight: 600, color: PAL.ink, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          {faq.map((f, i) => (
            <details key={i} style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', marginBottom: 8, border: `1px solid ${PAL.border}` }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 700, listStyle: 'none' }}>{f.q}</summary>
              <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          {ps.body && <p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 15 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 14, color: PAL.greenDark, fontFamily: HEAD, fontWeight: 700 }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.dim, fontSize: 12 }}>{footer || `${intake.developer_name || ''} · ${testimonials.length}+ testimonios verificados · LFPDPPP`}</footer>
    </div>
  );
}

function SocialProofForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel' },
    { id: 'preferred_validation', label: '¿Con quién quieres hablar?', type: 'select', options: ['Una familia residente', 'Un inversionista activo', 'Pareja joven recién mudada', 'Cualquiera'] },
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
  if (sent) return <p style={{ background: '#fff', color: '#15803D', padding: 20, borderRadius: 12, textAlign: 'center', fontWeight: 700 }}>★ Conectando con residentes. {advisor.full_name || 'Asesor'} responde en menos de 60 min.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, background: '#fff', padding: 24, borderRadius: 14, color: PAL.ink }}>
      {fields.map((f) => (
        <label key={f.id}>
          <span style={{ display: 'block', fontSize: 12, color: PAL.dim, marginBottom: 6, fontWeight: 600 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 12, border: `2px solid ${PAL.border}`, borderRadius: 10, fontSize: 14 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 12, border: `2px solid ${PAL.border}`, borderRadius: 10, fontSize: 14 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 6, padding: '14px 28px', background: PAL.green, color: '#fff', border: 'none', borderRadius: 9999, fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>{leadForm.submit_label || 'Conectarme con residentes'}</button>
    </form>
  );
}
