// W5.22 Z.8.7 Sub-B2 · FirstHome Template · Brunson PURO 95% · highlighter+tachado+sticky CTA mobile
// Consume schema LLM completo de memory/Z8_PROMPT_04_FIRST_HOME.md
import React, { useState } from 'react';

const PAL = {
  bg: '#FFFFFF',
  surface: '#F0FDF4',
  ink: '#0F172A',
  inkSoft: '#1E293B',
  dim: '#64748B',
  green: '#16A34A',
  greenDark: '#15803D',
  highlight: '#FEF08A',
  red: '#DC2626',
  border: '#E2E8F0',
};
const HEAD = "'Outfit', sans-serif";
const BODY = "'DM Sans', sans-serif";
const fmtMoney = (v) => (typeof v === 'number' ? `$${v.toLocaleString('es-MX')}` : v || '—');

export default function FirstHomeTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];
  const heroPhoto = photos[0];
  const testimonials = intake.testimonials || [];

  const preHeader = copy?.pre_header || 'Si llevas más de 2 años rentando: esto es para ti.';
  const headline = copy?.headline || `Tu mensualidad: ${fmtMoney(intake.price_from_mxn ? Math.round(intake.price_from_mxn * 0.0075) : 8400)}. Tu renta hoy: ¿cuánto más le pagarás al casero?`;
  const subheadline = copy?.subheadline || '4 años pagándole a tu casero · 0 años pagándote a ti. La diferencia son cientos de miles al año.';
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const mathBlock = copy?.math_block;
  const fascination = copy?.fascination_bullets || [];
  const threeSecrets = copy?.three_secrets || [];
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack || { items: [] };
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;
  const ctaPrimary = copy?.cta_primary?.label || 'Cotizar mi mensualidad real';

  return (
    <div data-testid="tpl-z87-first-home" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh', paddingBottom: 80 }}>
      <div style={{ background: PAL.green, color: '#fff', padding: '10px 24px', fontSize: 14, textAlign: 'center', fontWeight: 600 }}>{preHeader}</div>

      <section style={{ padding: '4rem 2rem', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: HEAD, fontSize: 'clamp(2rem, 4.5vw, 3.4rem)', fontWeight: 900, margin: 0, lineHeight: 1.1, color: PAL.ink }}>{headline}</h1>
        <p style={{ marginTop: 20, fontSize: 'clamp(1rem, 1.6vw, 1.3rem)', color: PAL.inkSoft, maxWidth: 760, marginInline: 'auto', lineHeight: 1.6 }}>{subheadline}</p>
        {heroPhoto && <img src={heroPhoto.url} alt="depto" style={{ width: '100%', maxWidth: 880, marginTop: 36, borderRadius: 18 }} />}
        <a href="#cotizar" style={{ display: 'inline-block', marginTop: 32, padding: '18px 48px', background: PAL.green, color: '#fff', borderRadius: 14, textDecoration: 'none', fontFamily: HEAD, fontWeight: 800, fontSize: 18, boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}>{ctaPrimary} →</a>
      </section>

      {mathBlock && (
        <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          {mathBlock.headline && <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>{mathBlock.headline}</h2>}
          <div style={{ background: PAL.surface, borderRadius: 18, padding: 28 }}>
            {mathBlock.comparison && Object.entries(mathBlock.comparison).filter(([k]) => k !== 'anchor').map(([k, v]) => {
              if (!v || typeof v !== 'object') return null;
              const isHighlight = v.highlight;
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', borderBottom: `1px dashed ${PAL.border}`, background: isHighlight ? PAL.highlight : 'transparent', paddingInline: isHighlight ? 12 : 0, borderRadius: isHighlight ? 8 : 0 }}>
                  <span style={{ color: PAL.dim, fontSize: 14 }}>{v.label}</span>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: PAL.ink }}>{v.amount}</span>
                </div>
              );
            })}
            {mathBlock.comparison?.anchor && <p style={{ marginTop: 18, color: PAL.ink, fontWeight: 600, lineHeight: 1.5, fontStyle: 'italic' }}>{mathBlock.comparison.anchor}</p>}
          </div>
        </section>
      )}

      {reframe && (
        <section style={{ padding: '4rem 2rem', maxWidth: 800, margin: '0 auto' }}>
          <p style={{ fontFamily: HEAD, fontSize: 'clamp(1.2rem, 2vw, 1.6rem)', fontWeight: 700, lineHeight: 1.6, color: PAL.ink, whiteSpace: 'pre-line', textAlign: 'center' }}>{reframe}</p>
        </section>
      )}

      {storyArc && (
        <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto', background: PAL.surface, borderRadius: 24 }}>
          {storyArc.intro && <p style={{ fontFamily: HEAD, fontSize: 13, color: PAL.green, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, fontWeight: 700 }}>{storyArc.intro}</p>}
          {storyArc.body && <p style={{ fontSize: 16, lineHeight: 1.75, color: PAL.ink, marginTop: 16, whiteSpace: 'pre-line' }}>{storyArc.body}</p>}
          {storyArc.closing && <p style={{ marginTop: 14, color: PAL.dim, fontStyle: 'italic' }}>{storyArc.closing}</p>}
        </section>
      )}

      {threeSecrets.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, textAlign: 'center', margin: '0 0 32px' }}>3 secretos que cambian todo</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {threeSecrets.slice(0, 3).map((s, i) => (
              <div key={i} style={{ background: '#fff', border: `2px solid ${PAL.green}`, borderRadius: 18, padding: 24 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 36, color: PAL.green, lineHeight: 1 }}>#{i + 1}</div>
                <h3 style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, margin: '14px 0 10px', color: PAL.ink }}>{s.title}</h3>
                <p style={{ color: PAL.dim, lineHeight: 1.6, fontSize: 14, margin: 0, whiteSpace: 'pre-line' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {fascination.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, textAlign: 'center', margin: '0 0 24px' }}>Lo que vas a descubrir</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
            {fascination.slice(0, 15).map((b, i) => (
              <li key={i} style={{ background: '#fff', border: `1px solid ${PAL.border}`, borderRadius: 12, padding: '14px 18px 14px 50px', position: 'relative', color: PAL.inkSoft, lineHeight: 1.5, fontSize: 14 }}>
                <span style={{ position: 'absolute', left: 18, top: 14, color: PAL.green, fontWeight: 800 }}>✓</span>{b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: PAL.surface, borderRadius: 14, padding: 24, marginBottom: 14 }}>
              <p style={{ fontFamily: HEAD, color: PAL.greenDark, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Si estás pensando</p>
              <p style={{ fontSize: 17, fontWeight: 700, color: PAL.ink, margin: '8px 0 14px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.inkSoft, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {stack.items?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto', background: PAL.surface, borderRadius: 24 }}>
          {stack.intro && <p style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>{stack.intro}</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {stack.items.map((it, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 12, padding: 18, display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 14, alignItems: 'start' }}>
                <span style={{ color: PAL.green, fontSize: 20, fontWeight: 800 }}>{it.icon || '✓'}</span>
                <div>
                  <h4 style={{ fontFamily: HEAD, fontWeight: 700, margin: 0, color: PAL.ink, fontSize: 15 }}>{it.title}</h4>
                  <p style={{ color: PAL.dim, lineHeight: 1.6, margin: '4px 0 0', fontSize: 13 }}>{it.body}</p>
                </div>
                {it.value && <span style={{ fontFamily: HEAD, color: PAL.green, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{it.strikethrough_value && <del style={{ color: PAL.red, marginRight: 8 }}>{it.strikethrough_value}</del>}{it.value}</span>}
              </div>
            ))}
          </div>
          {stack.total_block && (
            <div style={{ marginTop: 20, padding: 20, background: PAL.highlight, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, color: PAL.ink, fontSize: 13 }}>{stack.total_block.label_visible}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 900, color: PAL.green, fontSize: 32 }}>{stack.total_block.value_visible}</div>
              {stack.total_block.anchor && <p style={{ marginTop: 8, fontSize: 13, color: PAL.inkSoft }}>{stack.total_block.anchor}</p>}
            </div>
          )}
        </section>
      )}

      {riskReversal && (
        <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          <p style={{ fontFamily: HEAD, color: PAL.greenDark, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}>Sin riesgo</p>
          <p style={{ color: PAL.inkSoft, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p>
        </section>
      )}

      {scarcity && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto', background: '#FEF2F2', borderRadius: 14 }}><p style={{ color: PAL.red, fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line', textAlign: 'center' }}>{scarcity}</p></section>}

      {testimonials.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, textAlign: 'center', margin: '0 0 28px' }}>Millennials que ya compraron</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {testimonials.slice(0, 3).map((t, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 20, border: `1px solid ${PAL.border}` }}>
                <p style={{ color: PAL.inkSoft, lineHeight: 1.6, margin: '0 0 14px', fontSize: 14 }}>"{t.quote}"</p>
                <div style={{ fontWeight: 700, color: PAL.ink, fontSize: 14 }}>{t.author}</div>
                <div style={{ color: PAL.dim, fontSize: 12 }}>{t.role}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="cotizar" data-testid="lead-form-section" style={{ padding: '5rem 2rem', background: PAL.ink, color: '#fff' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', textAlign: 'center', margin: '0 0 28px', fontWeight: 800 }}>{leadForm.intro || 'Cotiza tu mensualidad real'}</h2>
          <FirstHomeForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 20, color: 'rgba(255,255,255,0.65)', fontSize: 12, textAlign: 'center' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {yesLadder && <section style={{ padding: '3rem 2rem', maxWidth: 700, margin: '0 auto' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontWeight: 600, color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line', textAlign: 'center' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, margin: '0 0 24px', textAlign: 'center' }}>Preguntas frecuentes</h2>
          {faq.map((f, i) => (
            <details key={i} style={{ background: PAL.surface, borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 700, color: PAL.ink, listStyle: 'none' }}>{f.q}</summary>
              <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto', background: PAL.highlight, borderRadius: 18 }}>
          {ps.body && <p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 15, fontWeight: 500 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 14, color: PAL.greenDark, fontFamily: HEAD, fontWeight: 700 }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.dim, fontSize: 12 }}>{footer || `${intake.developer_name || ''} · Acepta Infonavit/Fovissste · LFPDPPP`}</footer>

      <a href="#cotizar" style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '14px 32px', background: PAL.green, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontFamily: HEAD, fontWeight: 800, fontSize: 15, boxShadow: '0 10px 30px rgba(22,163,74,0.45)', zIndex: 50 }}>Cotizar mensualidad ↓</a>
    </div>
  );
}

function FirstHomeForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Tu nombre', required: true },
    { id: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel' },
    { id: 'monthly_income', label: 'Ingreso mensual aproximado', type: 'select', options: ['< $25K', '$25-40K', '$40-60K', '$60K+'], required: true },
    { id: 'down_payment', label: 'Enganche ahorrado', type: 'select', options: ['$0 (uso Infonavit)', '< $100K', '$100-300K', '$300K+'] },
  ];
  const [state, setState] = useState({});
  const [sent, setSent] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) { setSent(true); return; }
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/landing/${slug}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ payload: state }) });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ background: '#fff', color: PAL.green, padding: 24, borderRadius: 14, textAlign: 'center', fontWeight: 700 }}>Listo. {advisor.full_name || 'Tu asesor'} te llama por WhatsApp en menos de 60 minutos.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, background: '#fff', padding: 24, borderRadius: 18, color: PAL.ink }}>
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
      <button type="submit" style={{ marginTop: 6, padding: '16px 32px', background: PAL.green, color: '#fff', border: 'none', borderRadius: 12, fontFamily: HEAD, fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>{leadForm.submit_label || 'Cotizar mi mensualidad'}</button>
    </form>
  );
}
