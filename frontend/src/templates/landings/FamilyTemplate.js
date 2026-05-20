// W5.22 Z.8.7 Sub-B2 · Family Template · emocional cálido · naranja+verde+cream · escuelas+parques
// Consume schema LLM completo de memory/Z8_PROMPT_03_FAMILY.md
import React, { useState } from 'react';

const PAL = {
  bg: '#FFFBEB',
  surface: '#FEF3C7',
  ink: '#451A03',
  inkSoft: '#78350F',
  dim: '#92400E',
  warm: '#F97316',
  warmDark: '#EA580C',
  green: '#10B981',
  border: 'rgba(249, 115, 22, 0.18)',
};
const HEAD = "'Outfit', sans-serif";
const BODY = "'DM Sans', 'Inter', sans-serif";

export default function FamilyTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];
  const heroPhoto = photos.find((p) => ['interior', 'amenity', 'unit_interior'].includes(p.category)) || photos[0];
  const landmarks = intake.landmarks || [];
  const schools = landmarks.filter((l) => l.type === 'school' || (l.name || '').toLowerCase().includes('escuela') || (l.name || '').toLowerCase().includes('colegio')).slice(0, 8);
  const testimonials = intake.testimonials || [];

  const preHeader = copy?.pre_header || 'Para la familia que ya está lista para tener su propia casa.';
  const headline = copy?.headline || intake.project_name || '¿Y si la próxima vez que tu hijo pregunte cuál es su cuarto, ya tengas respuesta?';
  const subheadline = copy?.subheadline || `${schools.length || 5} colegios a menos de 10 min · áreas verdes · mensualidad accesible`;
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const valueProps = copy?.value_props || [
    { icon: 'school', label: `${schools.length || 5} escuelas top cerca`, detail: schools.length ? schools.slice(0, 3).map((s) => s.name).join(' · ') : '' },
    { icon: 'park', label: 'Áreas verdes y parques', detail: '' },
    { icon: 'security', label: 'Seguridad 24/7', detail: 'Concierge · CCTV · acceso controlado' },
  ];
  const fascination = copy?.fascination_bullets || [];
  const monthly = copy?.monthly_payment_block;
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack || { items: [] };
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;

  return (
    <div data-testid="tpl-z87-family" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh', lineHeight: 1.6 }}>
      <div style={{ background: PAL.warm, color: '#fff', padding: '10px 24px', fontFamily: HEAD, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{preHeader}</div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', minHeight: '72vh', alignItems: 'stretch' }}>
        <div style={{ background: heroPhoto ? `url(${heroPhoto.url}) center/cover` : `linear-gradient(135deg, ${PAL.warm}, ${PAL.green})`, minHeight: 400 }} />
        <div style={{ padding: '4rem 3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ fontFamily: HEAD, fontSize: 'clamp(2rem, 3.6vw, 3rem)', fontWeight: 800, margin: 0, lineHeight: 1.1, color: PAL.ink }}>{headline}</h1>
          <p style={{ marginTop: 20, fontSize: 18, color: PAL.inkSoft, lineHeight: 1.7 }}>{subheadline}</p>
          <a href="#agendar-visita" style={{ display: 'inline-block', marginTop: 36, padding: '16px 36px', background: PAL.warm, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontFamily: HEAD, fontWeight: 700, fontSize: 16, width: 'fit-content', boxShadow: '0 6px 20px rgba(249, 115, 22, 0.3)' }}>Agendar visita en familia este sábado</a>
          <p style={{ marginTop: 14, fontSize: 13, color: PAL.dim }}>Sin compromiso · {advisor.full_name || 'Asesora familia'} te llama en menos de 24h</p>
        </div>
      </section>

      {reframe && (
        <section style={{ padding: '5rem 3rem', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: HEAD, fontSize: 'clamp(1.3rem, 2.2vw, 1.8rem)', fontWeight: 600, lineHeight: 1.7, color: PAL.ink, whiteSpace: 'pre-line' }}>{reframe}</p>
        </section>
      )}

      {valueProps.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {valueProps.slice(0, 6).map((v, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 24, padding: 28, border: `2px solid ${PAL.border}`, boxShadow: '0 4px 12px rgba(249,115,22,0.08)' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: PAL.surface, display: 'grid', placeItems: 'center', marginBottom: 18 }}>
                  <span style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: PAL.warmDark }}>{(v.icon || '·').slice(0, 1).toUpperCase()}</span>
                </div>
                <h3 style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: PAL.ink, margin: '0 0 8px' }}>{v.label}</h3>
                {v.detail && <p style={{ color: PAL.dim, lineHeight: 1.6, margin: 0, fontSize: 14 }}>{v.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {storyArc && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto', background: PAL.surface, borderRadius: 24 }}>
          {storyArc.intro && <p style={{ fontFamily: HEAD, fontSize: 13, color: PAL.warmDark, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, fontWeight: 700 }}>{storyArc.intro}</p>}
          {storyArc.body && <p style={{ fontSize: 'clamp(1rem, 1.4vw, 1.2rem)', lineHeight: 1.8, color: PAL.ink, marginTop: 20, whiteSpace: 'pre-line' }}>{storyArc.body}</p>}
          {storyArc.closing && <p style={{ marginTop: 16, color: PAL.dim, fontStyle: 'italic' }}>{storyArc.closing}</p>}
        </section>
      )}

      {(monthly || intake.enganche_pct) && (
        <section style={{ padding: '4rem 3rem', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 32, border: `3px solid ${PAL.green}`, textAlign: 'center' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.green, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', margin: 0 }}>{monthly?.headline || 'Cotiza tu mensualidad'}</h2>
            {monthly?.details && (
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
                {monthly.details.map((d, i) => <li key={i} style={{ padding: '8px 0', color: PAL.inkSoft, fontSize: 15 }}>· {d}</li>)}
              </ul>
            )}
            <a href="#agendar-visita" style={{ display: 'inline-block', marginTop: 24, padding: '12px 28px', background: PAL.green, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>{monthly?.calculator_label || 'Cotizar mensualidad'}</a>
          </div>
        </section>
      )}

      {fascination.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>Lo que tu familia va a vivir aquí</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {fascination.slice(0, 10).map((b, i) => (
              <li key={i} style={{ padding: '14px 18px 14px 44px', background: '#fff', borderRadius: 14, position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: PAL.inkSoft, lineHeight: 1.5, fontSize: 14 }}>
                <span style={{ position: 'absolute', left: 14, top: 14, color: PAL.warm, fontWeight: 800 }}>✓</span>
                {b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {schools.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>Escuelas a la mano</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {schools.map((s, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: 18, border: `1px solid ${PAL.border}` }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.ink, fontSize: 15 }}>{s.name}</div>
                <div style={{ marginTop: 4, color: PAL.dim, fontSize: 12 }}>{s.walking_minutes ? `${s.walking_minutes} min caminando` : s.distance_m ? `${(s.distance_m / 1000).toFixed(1)} km` : 'cerca'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section style={{ padding: '5rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, color: PAL.ink, margin: '0 0 12px', textAlign: 'center' }}>Familias que ya viven aquí</h2>
          <p style={{ textAlign: 'center', color: PAL.dim, marginBottom: 36 }}>Sin actores · sin guion</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {testimonials.slice(0, 6).map((t, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 18, padding: 24, border: `1px solid ${PAL.border}` }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt={t.author} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: PAL.warm, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: HEAD, fontWeight: 700 }}>{(t.author || '?').slice(0, 1)}</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: PAL.ink, fontSize: 14 }}>{t.author}</div>
                    <div style={{ color: PAL.dim, fontSize: 12 }}>{t.role || ''}</div>
                  </div>
                </div>
                <p style={{ color: PAL.inkSoft, lineHeight: 1.6, fontSize: 14, margin: 0 }}>"{t.quote}"</p>
                {t.rating && <div style={{ marginTop: 12, color: PAL.warm }}>{'★'.repeat(t.rating)}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto' }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 18, padding: 28, marginBottom: 16, border: `1px solid ${PAL.border}` }}>
              <p style={{ fontFamily: HEAD, color: PAL.warmDark, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Si están pensando</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: PAL.ink, margin: '8px 0 16px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.inkSoft, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {stack.items?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: PAL.ink, textAlign: 'center', margin: '0 0 12px' }}>Lo que recibes al apartar</h2>
          {stack.intro && <p style={{ textAlign: 'center', color: PAL.dim, marginBottom: 28 }}>{stack.intro}</p>}
          <div style={{ display: 'grid', gap: 12 }}>
            {stack.items.map((it, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: 20, border: `1px solid ${PAL.border}`, display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 18, alignItems: 'start' }}>
                <span style={{ color: PAL.green, fontSize: 20, fontWeight: 800 }}>✓</span>
                <div>
                  <h4 style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.ink, margin: 0, fontSize: 16 }}>{it.title}</h4>
                  <p style={{ color: PAL.dim, lineHeight: 1.6, margin: '6px 0 0', fontSize: 14 }}>{it.body}</p>
                </div>
                {it.value_real && <span style={{ fontFamily: HEAD, color: PAL.warmDark, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{it.value_real}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {riskReversal && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto', background: PAL.surface, borderRadius: 24 }}>
          <p style={{ fontFamily: HEAD, color: PAL.warmDark, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}>Antes de decidir</p>
          <p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p>
        </section>
      )}

      {scarcity && <section style={{ padding: '3rem 3rem', maxWidth: 820, margin: '0 auto' }}><p style={{ textAlign: 'center', color: PAL.inkSoft, lineHeight: 1.8, fontSize: 16, whiteSpace: 'pre-line' }}>{scarcity}</p></section>}

      <section id="agendar-visita" data-testid="lead-form-section" style={{ padding: '5rem 3rem', background: PAL.warm, color: '#fff' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: '0 0 12px', fontWeight: 800, textAlign: 'center' }}>Agenda tu visita en familia</h2>
          {leadForm.intro && <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.9)', marginBottom: 28 }}>{leadForm.intro}</p>}
          <FamilyForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 20, color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {yesLadder && <section style={{ padding: '4rem 3rem', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontWeight: 600, color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>Preguntas frecuentes</h2>
          {faq.map((f, i) => (
            <details key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 10, border: `1px solid ${PAL.border}` }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 700, color: PAL.ink, listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}>
                <span>{f.q}</span><span style={{ color: PAL.warm }}>+</span>
              </summary>
              <p style={{ marginTop: 10, color: PAL.dim, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 3rem', maxWidth: 720, margin: '0 auto' }}>
          {ps.body && <p style={{ color: PAL.inkSoft, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 15 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 16, color: PAL.warmDark, fontFamily: HEAD, fontWeight: 700 }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.dim, fontSize: 12, borderTop: `1px solid ${PAL.border}` }}>{footer || `${intake.developer_name || ''} · privacidad LFPDPPP`}</footer>
    </div>
  );
}

function FamilyForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Tu nombre', required: true },
    { id: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel' },
    { id: 'children_count', label: '¿Cuántos hijos?', type: 'select', options: ['1', '2', '3+', 'Planeando'] },
    { id: 'visit_day', label: 'Mejor día para visita', type: 'select', options: ['Sábado AM', 'Sábado PM', 'Domingo AM', 'Coordinar'] },
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
  if (sent) return <p style={{ background: '#fff', color: '#92400E', padding: 20, borderRadius: 14, textAlign: 'center', fontWeight: 600 }}>¡Listo! {advisor.full_name || 'Asesora familia'} te llama en menos de 24h.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, background: '#fff', padding: 28, borderRadius: 20, color: PAL.ink }}>
      {fields.map((f) => (
        <label key={f.id} style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 13, color: PAL.dim, marginBottom: 6, fontWeight: 600 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', border: `2px solid ${PAL.border}`, borderRadius: 12, fontSize: 14, fontFamily: BODY }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', border: `2px solid ${PAL.border}`, borderRadius: 12, fontSize: 14, fontFamily: BODY }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 8, padding: '14px 28px', background: PAL.green, color: '#fff', border: 'none', fontFamily: HEAD, fontSize: 15, fontWeight: 800, cursor: 'pointer', borderRadius: 9999 }}>{leadForm.submit_label || 'Agendar visita en familia'}</button>
    </form>
  );
}
